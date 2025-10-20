import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/analysis';

describe('analyze()', () => {
  it('categorizes and provides reasons', () => {
    const input = [
      { name: 'ok', status: 'Running', exit_code: 0, is_running: true, is_ready: 'Ready', has_ready_probe: true },
      { name: 'bad-exit', status: 'Completed', exit_code: 2, is_running: false, is_ready: '-', has_ready_probe: false },
      { name: 'not-ready', status: 'Running', exit_code: 0, is_running: true, is_ready: 'Not Ready', has_ready_probe: true },
      { name: 'pending', status: 'Pending', exit_code: 0 },
      { name: 'disabled', status: 'Disabled', exit_code: 0 },
    ];
    const out = analyze(input as any);
    expect(out.summary.Running).toBe(2);
    expect(out.failed.find((f) => f.name === 'bad-exit')?.exitCode).toBe(2);
    const nr = out.not_ready.find((n) => n.name === 'not-ready');
    expect(nr?.reason).toContain('health');
    expect(out.disabled).toContain('disabled');
    expect(out.running).toContain('ok');
  });
});

