import { WebSocket } from 'ws';

export type LogMessage = { Message: string; ProcessName: string } | { message: string; processName: string } | any;

function toWsUrl(httpBase: string): string {
  return httpBase.replace(/^http/, 'ws');
}

export async function streamLogs(
  httpBaseUrl: string,
  names: string[],
  offset = 0,
  follow = true,
  opts?: { maxMessages?: number; timeoutMs?: number }
): Promise<{ lines: string[]; count: number }> {
  const wsBase = toWsUrl(httpBaseUrl);
  const nameParam = encodeURIComponent(names.join(','));
  const url = `${wsBase}/process/logs/ws?name=${nameParam}&offset=${offset}&follow=${follow}`;

  const ws = new WebSocket(url);
  const lines: string[] = [];
  const max = opts?.maxMessages ?? 200;
  const timeoutMs = opts?.timeoutMs ?? 3000;

  let resolveFn: (v: { lines: string[]; count: number }) => void;
  let rejectFn: (e: any) => void;
  const done = new Promise<{ lines: string[]; count: number }>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const timer = setTimeout(() => {
    try { ws.close(); } catch {}
    resolveFn({ lines, count: lines.length });
  }, timeoutMs);

  ws.on('message', (data: any) => {
    try {
      const obj = JSON.parse(data.toString());
      const msg = (obj.Message ?? obj.message ?? '').toString();
      if (msg) lines.push(msg);
      if (lines.length >= max) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolveFn({ lines, count: lines.length });
      }
    } catch (e) {
      // ignore malformed
    }
  });
  ws.on('error', (e: any) => {
    clearTimeout(timer);
    rejectFn(e);
  });
  ws.on('close', () => {
    clearTimeout(timer);
    resolveFn({ lines, count: lines.length });
  });

  return done;
}
