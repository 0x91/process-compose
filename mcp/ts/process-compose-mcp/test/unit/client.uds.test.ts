import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { unlinkSync } from 'node:fs';
import { PcHttpClient } from '../../src/client';

const udsPath = `/tmp/pc-mcp-test-${process.pid}.sock`;
let server: http.Server;

beforeAll(async () => {
  try { unlinkSync(udsPath); } catch {}
  server = http.createServer((req, res) => {
    if (!req.url) return res.end();
    if (req.url.startsWith('/project/name')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ projectName: 'uds' }));
    }
    if (req.url.startsWith('/live')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'alive' }));
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(udsPath, () => r()));
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  try { unlinkSync(udsPath); } catch {}
});

describe('PcHttpClient (UDS)', () => {
  it('live and projectName (UDS)', async () => {
    // UDS supported on Unix-like systems
    const client = new PcHttpClient({ udsPath });
    await expect(client.live()).resolves.toBe(true);
    const pn = await client.projectName();
    expect(pn.projectName).toBe('uds');
  });
});
