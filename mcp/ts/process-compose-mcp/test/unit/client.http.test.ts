import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { PcHttpClient } from '../../src/client';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (!req.url) return res.end();
    if (req.url.startsWith('/live')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'alive' }));
    }
    if (req.url.startsWith('/project/name')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ projectName: 'test' }));
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  if (typeof addr === 'string' || addr == null) throw new Error('bad addr');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe('PcHttpClient (HTTP)', () => {
  it('live and projectName', async () => {
    const client = new PcHttpClient(baseUrl);
    await expect(client.live()).resolves.toBe(true);
    const pn = await client.projectName();
    expect(pn.projectName).toBe('test');
  });
});

