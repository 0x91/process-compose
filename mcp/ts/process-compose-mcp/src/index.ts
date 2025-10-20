import { FastMCP } from 'fastmcp';
import { z } from 'zod';

import { PcHttpClient } from './client.js';
import { SessionManager } from './session.js';
import { streamLogs } from './logs.js';
import { analyze } from './analysis.js';

const app = new FastMCP({ name: 'process-compose', version: '0.1.0' });
const session = new SessionManager();

function requireClient(): PcHttpClient {
  const s = session.session;
  if (!s) throw new Error('No active session. Call start_session first.');
  return s.udsPath ? new PcHttpClient({ udsPath: s.udsPath }) : new PcHttpClient(s.baseUrl);
}

app.addTool({
  name: 'start_session',
  description: 'Start process-compose with HTTP server on localhost and TUI disabled',
  parameters: z
    .object({
      configs: z.array(z.string()).optional().describe('Paths to process-compose YAML configs'),
      envFiles: z.array(z.string()).optional().describe('Paths to .env files'),
      port: z.number().int().optional().describe('HTTP port; defaults to auto-pick'),
      keepProject: z.boolean().optional().describe('Keep project running after processes exit'),
      useUds: z.boolean().optional().describe('Use Unix domain socket (UDS) transport instead of TCP'),
      udsPath: z.string().optional().describe('UDS path; defaults to /tmp/process-compose-<pid>.sock'),
    })
    .strict(),
  execute: async (input) => {
    const info = await session.start(
      input.configs,
      input.envFiles,
      input.port,
      input.keepProject ?? true,
      input.useUds ?? false,
      input.udsPath,
    );
    return JSON.stringify(info);
  },
});

app.addTool({
  name: 'stop_session',
  description: 'Stop the running process-compose session',
  execute: async () => JSON.stringify(await session.stop()),
});

app.addTool({
  name: 'status_summary',
  description: 'Return counts per status, running and failed lists, and project state',
  parameters: z.object({ withMemory: z.boolean().optional() }).strict(),
  execute: async ({ withMemory }) => {
    const client = requireClient();
    const procs = await client.listProcesses();
    const counts: Record<string, number> = {};
    for (const p of procs.data) counts[p.status] = (counts[p.status] ?? 0) + 1;
    const failed = procs.data.filter(
      (p) => (p.status === 'Completed' && (p.exit_code ?? 0) !== 0) || p.status === 'Error' || p.status === 'Terminating',
    );
    const running = procs.data.filter((p) => p.is_running || ['Running', 'Launched', 'Restarting'].includes(p.status));
    const project = await client.projectState(!!withMemory);
    return JSON.stringify({ counts, running: running.map((x) => x.name), failed_or_error: failed.map((x) => x.name), project });
  },
});

app.addTool({
  name: 'list_processes',
  description: 'List processes and their state',
  execute: async () => {
    const client = requireClient();
    return JSON.stringify((await client.listProcesses()).data);
  },
});

app.addTool({
  name: 'get_process',
  description: 'Get a single process state',
  parameters: z.object({ name: z.string() }).strict(),
  execute: async ({ name }) => JSON.stringify(await requireClient().getProcess(name)),
});

app.addTool({
  name: 'start_process',
  description: 'Start a process',
  parameters: z.object({ name: z.string() }).strict(),
  execute: async ({ name }) => {
    await requireClient().startProcess(name);
    return `{"started":"${name}"}`;
  },
});

app.addTool({
  name: 'stop_process',
  description: 'Stop a process',
  parameters: z.object({ name: z.string() }).strict(),
  execute: async ({ name }) => {
    await requireClient().stopProcess(name);
    return `{"stopped":"${name}"}`;
  },
});

app.addTool({
  name: 'restart_process',
  description: 'Restart a process',
  parameters: z.object({ name: z.string() }).strict(),
  execute: async ({ name }) => {
    await requireClient().restartProcess(name);
    return `{"restarted":"${name}"}`;
  },
});

app.addTool({
  name: 'scale_process',
  description: 'Scale a process',
  parameters: z.object({ name: z.string(), replicas: z.number().int().min(0) }).strict(),
  execute: async ({ name, replicas }) => {
    await requireClient().scaleProcess(name, replicas);
    return JSON.stringify({ scaled: name, replicas });
  },
});

app.addTool({
  name: 'start_processes',
  description: 'Start multiple processes',
  parameters: z.object({ names: z.array(z.string()).min(1) }).strict(),
  execute: async ({ names }) => {
    const client = requireClient();
    const results: Record<string, string> = {};
    for (const n of names) {
      try { await client.startProcess(n); results[n] = 'started'; } catch (e: any) { results[n] = `error: ${e?.message || e}`; }
    }
    return JSON.stringify(results);
  },
});

app.addTool({
  name: 'stop_processes',
  description: 'Stop multiple processes',
  parameters: z.object({ names: z.array(z.string()).min(1) }).strict(),
  execute: async ({ names }) => JSON.stringify(await requireClient().stopProcesses(names)),
});

app.addTool({
  name: 'get_ports',
  description: 'Get process open ports',
  parameters: z.object({ name: z.string() }).strict(),
  execute: async ({ name }) => JSON.stringify(await requireClient().getPorts(name)),
});

app.addTool({
  name: 'get_logs',
  description: 'Return recent logs for a process',
  parameters: z.object({ name: z.string(), endOffset: z.number().int().optional(), limit: z.number().int().optional() }).strict(),
  execute: async ({ name, endOffset = 0, limit = 200 }) => {
    const res = await requireClient().getLogs(name, endOffset, limit);
    return JSON.stringify({ name, lines: res.logs });
  },
});

app.addTool({
  name: 'truncate_logs',
  description: 'Truncate a process log buffer',
  parameters: z.object({ name: z.string() }).strict(),
  execute: async ({ name }) => {
    await requireClient().truncateLogs(name);
    return `{"truncated":"${name}"}`;
  },
});

app.addTool({
  name: 'project_info',
  description: 'Return project name and state',
  execute: async () => {
    const client = requireClient();
    let name: string | undefined;
    try { name = (await client.projectName()).projectName; } catch {}
    const state = await client.projectState(false);
    return JSON.stringify({ name, state });
  },
});

app.addTool({ name: 'reload_project', description: 'Reload project config', execute: async () => JSON.stringify(await requireClient().reloadProject()) });

app.addTool({
  name: 'stream_logs',
  description: 'Stream logs over WebSocket and return a captured window. For UDS sessions, use TCP instead.',
  parameters: z
    .object({ name: z.string(), offset: z.number().int().optional(), maxMessages: z.number().int().optional(), timeoutMs: z.number().int().optional() })
    .strict(),
  execute: async ({ name, offset = 0, maxMessages = 200, timeoutMs = 3000 }) => {
    const s = session.session;
    if (!s) throw new Error('No active session. Call start_session first.');
    if (s.udsPath) throw new Error('WebSocket streaming is not available in UDS mode on this server; start TCP session.');
    const res = await streamLogs(s.baseUrl, [name], offset, true, { maxMessages, timeoutMs });
    return JSON.stringify({ name, lines: res.lines, count: res.count });
  },
});

app.addTool({
  name: 'await_ready',
  description: 'Wait until all target processes are ready (running and healthy if probes exist).',
  parameters: z.object({ names: z.array(z.string()).optional(), timeoutMs: z.number().int().optional(), intervalMs: z.number().int().optional() }).strict(),
  execute: async ({ names, timeoutMs = 30000, intervalMs = 500 }) => {
    const client = requireClient();
    const deadline = Date.now() + timeoutMs;
    let last: any[] = [];
    while (Date.now() < deadline) {
      const list = (await client.listProcesses()).data as any[];
      last = list;
      const target = names && names.length > 0 ? list.filter((p) => names.includes(p.name)) : list;
      const allReady = target.every((p) => {
        const healthyOrUnknown = (p as any).is_ready === 'Ready' || (p as any).is_ready === '-' || (p as any).Health === '-' || (p as any).Health === 'Ready' || (p as any).health === 'Ready' || (p as any).health === '-';
        const runningish = ['Running', 'Launched', 'Restarting', 'Completed', 'Skipped', 'Disabled', 'Foreground'].includes(p.status);
        return runningish && healthyOrUnknown && ((p as any).exit_code ?? 0) === 0;
      });
      if (allReady) return JSON.stringify({ ready: true });
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return JSON.stringify({ ready: false, lastSnapshot: last });
  },
});

app.addTool({
  name: 'analyze_processes',
  description: 'Categorize processes by state and include readiness reasons and details.',
  execute: async () => {
    const list = (await requireClient().listProcesses()).data as any[];
    return JSON.stringify(analyze(list));
  },
});

// True streaming using FastMCP's streamContent in execute context
app.addTool({
  name: 'stream_logs_live',
  description: 'Continuously stream logs as content blocks. TCP only.',
  parameters: z.object({ name: z.string(), offset: z.number().int().optional() }).strict(),
  timeoutMs: 0, // no timeout
  execute: async ({ name, offset = 0 }, { streamContent }) => {
    const s = session.session;
    if (!s) throw new Error('No active session. Call start_session first.');
    if (s.udsPath) throw new Error('WebSocket streaming is not available in UDS mode on this server; start TCP session.');
    // Maintain a single WS and stream lines as content
    // We reuse streamLogs to capture windows and emit
    while (true) {
      const res = await streamLogs(s.baseUrl, [name], offset, true, { maxMessages: 100, timeoutMs: 1000 });
      if (res.lines.length) {
        await streamContent(res.lines.map((line) => ({ type: 'text', text: line })));
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  },
});

app.start({ transportType: 'stdio' });
