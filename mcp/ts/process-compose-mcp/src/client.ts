import http from 'node:http';

export type ProcessState = {
  name: string;
  namespace: string;
  status: string;
  exit_code?: number;
  is_running?: boolean;
};

export type ProcessesState = { data: ProcessState[] };

type ClientOpts = { baseUrl?: string; udsPath?: string; timeoutMs?: number };

export class PcHttpClient {
  public baseUrl?: string;
  public udsPath?: string;
  private timeoutMs: number;

  constructor(opts: ClientOpts | string, timeoutMs?: number) {
    if (typeof opts === 'string') {
      this.baseUrl = opts;
      this.timeoutMs = timeoutMs ?? 10000;
    } else {
      this.baseUrl = opts.baseUrl;
      this.udsPath = opts.udsPath;
      this.timeoutMs = opts.timeoutMs ?? 10000;
    }
  }

  // Use `any` for init to avoid DOM lib dependency issues in Node types
  private async _json<T>(path: string, init?: any): Promise<T> {
    if (this.baseUrl) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: ctrl.signal });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        if (res.status === 204) return undefined as unknown as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : {}) as T;
      } finally {
        clearTimeout(t);
      }
    }
    // UDS mode via http.request({ socketPath })
    const method = init?.method ?? 'GET';
    const body = (init as any)?.body as string | undefined;
    const headers = (init?.headers as Record<string, string>) ?? {};
    const socketPath = this.udsPath!;
    return await new Promise<T>((resolve, reject) => {
      const req = http.request({ socketPath, path, method, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`${res.statusCode} ${res.statusMessage}`));
          }
          const text = Buffer.concat(chunks).toString('utf8');
          resolve((text ? JSON.parse(text) : {}) as T);
        });
      });
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error('timeout'));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async live(): Promise<boolean> {
    try {
      await this._json('/live');
      return true;
    } catch {
      return false;
    }
  }

  projectName(): Promise<{ projectName: string }> {
    return this._json(`/project/name`);
  }

  projectState(withMemory = false): Promise<Record<string, unknown>> {
    const q = `withMemory=${withMemory}`;
    return this._json(`/project/state?${q}`);
  }

  reloadProject(): Promise<Record<string, unknown>> {
    return this._json(`/project/configuration`, { method: 'POST' });
  }

  stopProject(): Promise<void> {
    return this._json(`/project/stop`, { method: 'POST' });
  }

  listProcesses(): Promise<ProcessesState> {
    return this._json(`/processes`);
  }

  getProcess(name: string): Promise<ProcessState> {
    return this._json(`/process/${encodeURIComponent(name)}`);
  }

  startProcess(name: string): Promise<unknown> {
    return this._json(`/process/start/${encodeURIComponent(name)}`, { method: 'POST' });
  }

  stopProcess(name: string): Promise<unknown> {
    return this._json(`/process/stop/${encodeURIComponent(name)}`, { method: 'PATCH' });
  }

  stopProcesses(names: string[]): Promise<Record<string, string>> {
    return this._json(`/processes/stop`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(names) });
  }

  restartProcess(name: string): Promise<unknown> {
    return this._json(`/process/restart/${encodeURIComponent(name)}`, { method: 'POST' });
  }

  scaleProcess(name: string, replicas: number): Promise<unknown> {
    return this._json(`/process/scale/${encodeURIComponent(name)}/${replicas}`, { method: 'PATCH' });
  }

  getLogs(name: string, endOffset = 0, limit = 200): Promise<{ logs: string[] }> {
    return this._json(`/process/logs/${encodeURIComponent(name)}/${endOffset}/${limit}`);
  }

  truncateLogs(name: string): Promise<unknown> {
    return this._json(`/process/logs/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  getPorts(name: string): Promise<{ name: string; tcp_ports: number[]; udp_ports: number[] }> {
    return this._json(`/process/ports/${encodeURIComponent(name)}`);
  }
}

export async function waitUntilLive(client: PcHttpClient, timeoutMs = 25000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await client.live()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('process-compose API did not become live in time');
}
