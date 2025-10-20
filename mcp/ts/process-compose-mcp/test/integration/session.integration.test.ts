import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { SessionManager } from '../../src/session';
import { PcHttpClient } from '../../src/client';

const repoRootBin = resolve(process.cwd(), '../../../..', 'bin', process.platform === 'win32' ? 'process-compose.exe' : 'process-compose');
const envBin = process.env.PC_BINARY;
let whichBin = '';
try { whichBin = execSync('which process-compose').toString().trim(); } catch {}
const candidates = [envBin, repoRootBin, whichBin].filter(Boolean) as string[];
const haveBinary = candidates.some((p) => existsSync(p));

describe.skipIf(!haveBinary)('Session integration (requires process-compose binary)', () => {
  const session = new SessionManager();

  beforeAll(() => {
    process.env.PC_BINARY = candidates.find((p) => existsSync(p))!;
  });

  afterAll(async () => {
    await session.stop();
  });

  it('starts, inspects, logs, and stops (TCP)', async () => {
    const root = execSync('git rev-parse --show-toplevel').toString().trim();
    const cfg = resolve(root, 'fixtures-code/process-compose-with-log.yaml');
    const envf = resolve(root, 'examples/.example_env');
    const info = await session.start(
      [cfg],
      [envf],
      undefined,
      true,
    );
    expect(info.baseUrl).toContain('http://');

    const client = new PcHttpClient(info.baseUrl);
    const list = await client.listProcesses();
    expect(Array.isArray(list.data)).toBe(true);

    const one = await client.getProcess('process6');
    expect(one.name).toBeDefined();

    const logs = await client.getLogs('process6', 0, 50);
    expect(Array.isArray(logs.logs)).toBe(true);
  }, 60_000);
});
