import { spawn, ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import net from 'node:net';

import { PcHttpClient, waitUntilLive } from './client.js';

export type SessionInfo = {
  address: string;
  port: number;
  baseUrl: string;
  projectName?: string;
  pid?: number;
  udsPath?: string;
};

function isWindows() {
  return process.platform === 'win32';
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findPcBinary(): Promise<string> {
  const env = process.env.PC_BINARY;
  if (env && (await fileExists(env))) return env;
  const repoBin = join(process.cwd(), 'bin', `process-compose${isWindows() ? '.exe' : ''}`);
  if (await fileExists(repoBin)) return repoBin;
  return 'process-compose';
}

export async function pickPort(preferred?: number): Promise<number> {
  // Prefer PC_DEFAULT_PORT, then preferred, then probe from 8080
  const base = Number(process.env.PC_DEFAULT_PORT ?? preferred ?? 8080);
  const tryPorts = Array.from({ length: 100 }, (_, i) => base + i);
  for (const port of tryPorts) {
    const ok = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.listen(port, '127.0.0.1', () => {
        srv.close(() => resolve(true));
      });
    });
    if (ok) return port;
  }
  throw new Error('no free port found for process-compose API');
}

export class SessionManager {
  private proc: ChildProcess | null = null;
  private info: SessionInfo | null = null;

  get session(): SessionInfo | null {
    return this.info;
  }

  async start(
    configs: string[] = ['process-compose.yaml'],
    envFiles: string[] = ['.env'],
    port?: number,
    keepProject = true,
    useUds = false,
    udsPath?: string,
  ): Promise<SessionInfo> {
    if (this.proc && this.proc.exitCode === null) throw new Error('session already running');

    const bin = await findPcBinary();
    const apiPort = useUds ? undefined : await pickPort(port);

    const args: string[] = [];
    for (const c of configs) {
      args.push('-f', c);
    }
    for (const e of envFiles) {
      args.push('-e', e);
    }
    args.push('-t=false');
    if (useUds) {
      const path = udsPath ?? `/tmp/process-compose-${process.pid}.sock`;
      args.push('--use-uds', '--unix-socket', path);
    } else {
      args.push('--port', String(apiPort));
    }
    if (keepProject) args.push('--keep-project');

    // Try to set a sensible cwd (repo root if .git is found)
    let cwd: string | undefined;
    try {
      let d = process.cwd();
      // walk up to find .git
      for (let i = 0; i < 6; i++) {
        if (existsSync(join(d, '.git'))) { cwd = d; break; }
        const up = dirname(d);
        if (up === d) break;
        d = up;
      }
    } catch {}

    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(cwd ? { cwd } : {}),
    });
    this.proc = child;

    let stderrBuf = '';
    let stdoutBuf = '';
    child.stderr?.on('data', (d) => { stderrBuf += String(d); });
    child.stdout?.on('data', (d) => { stdoutBuf += String(d); });

    const baseUrl = useUds ? undefined : `http://127.0.0.1:${apiPort}`;
    const client = new PcHttpClient(useUds ? { udsPath: udsPath ?? `/tmp/process-compose-${process.pid}.sock` } : { baseUrl: baseUrl! });
    try {
      await waitUntilLive(client, 40_000);
    } catch (e) {
      const lines = (stderrBuf + '\n' + stdoutBuf).split('\n').slice(-40).join('\n');
      throw new Error(`process-compose did not become live. Recent output:\n${lines}`);
    }

    let projectName: string | undefined;
    try {
      const pn = await client.projectName();
      projectName = pn.projectName;
    } catch {}

    this.info = {
      address: '127.0.0.1',
      port: apiPort ?? 0,
      baseUrl: baseUrl ?? 'http+unix',
      projectName,
      pid: child.pid,
      udsPath: useUds ? udsPath ?? `/tmp/process-compose-${process.pid}.sock` : undefined,
    };
    return this.info;
  }

  async stop(): Promise<{ stopped: boolean; pid?: number }> {
    if (!this.proc) return { stopped: false };
    const pid = this.proc.pid;
    try {
      this.proc.kill();
    } catch {}
    this.proc = null;
    this.info = null;
    return { stopped: true, pid };
  }
}
