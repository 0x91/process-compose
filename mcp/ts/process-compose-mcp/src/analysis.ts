export type AnalyzedProcess = {
  name: string;
  status: string;
  exitCode?: number;
  health?: string;
  hasHealthProbe?: boolean;
  isRunning?: boolean;
  reason?: string;
  ready: boolean;
};

export type Analysis = {
  summary: Record<string, number>;
  running: string[];
  restarting: string[];
  completed_ok: string[];
  failed: { name: string; exitCode: number; reason: string }[];
  error: { name: string; reason: string }[];
  pending: { name: string; reason: string }[];
  disabled: string[];
  foreground: string[];
  other: string[];
  not_ready: { name: string; reason: string }[];
  details: AnalyzedProcess[];
};

type ProcLike = { name: string; status: string; exit_code?: number; is_running?: boolean; is_ready?: string; Health?: string; health?: string; has_ready_probe?: boolean; HasHealthProbe?: boolean };

export function analyze(processes: ProcLike[]): Analysis {
  const summary: Record<string, number> = {};
  const running: string[] = [];
  const restarting: string[] = [];
  const completed_ok: string[] = [];
  const failed: { name: string; exitCode: number; reason: string }[] = [];
  const error: { name: string; reason: string }[] = [];
  const pending: { name: string; reason: string }[] = [];
  const disabled: string[] = [];
  const foreground: string[] = [];
  const other: string[] = [];
  const not_ready: { name: string; reason: string }[] = [];
  const details: AnalyzedProcess[] = [];

  const healthVal = (p: ProcLike) => p.is_ready ?? p.Health ?? p.health;
  const hasProbe = (p: ProcLike) => (p.has_ready_probe ?? (p as any).HasHealthProbe) === true;

  function readyReason(p: ProcLike): { ready: boolean; reason: string } {
    const st = p.status;
    if (!['Running', 'Foreground', 'Launched', 'Completed', 'Skipped', 'Disabled', 'Restarting'].includes(st)) {
      return { ready: false, reason: `status is ${st}` };
    }
    if (st === 'Disabled') return { ready: true, reason: 'process is disabled' };
    const hv = healthVal(p);
    if (hasProbe(p) && hv !== 'Ready') return { ready: false, reason: `health is ${hv ?? 'Unknown'}` };
    if (hv && hv !== 'Ready' && hv !== '-') return { ready: false, reason: `health is ${hv}` };
    const exit = p.exit_code ?? 0;
    if (exit !== 0) return { ready: false, reason: `failed with exit code ${exit}` };
    return { ready: true, reason: '' };
  }

  for (const p of processes) {
    summary[p.status] = (summary[p.status] ?? 0) + 1;
    const { ready, reason } = readyReason(p);
    const d: AnalyzedProcess = {
      name: p.name,
      status: p.status,
      exitCode: p.exit_code,
      health: healthVal(p) ?? '-',
      hasHealthProbe: hasProbe(p),
      isRunning: p.is_running,
      reason,
      ready,
    };
    details.push(d);

    switch (p.status) {
      case 'Running':
      case 'Launched':
        running.push(p.name);
        break;
      case 'Restarting':
        restarting.push(p.name);
        break;
      case 'Completed':
        (p.exit_code ?? 0) === 0 ? completed_ok.push(p.name) : failed.push({ name: p.name, exitCode: p.exit_code ?? 0, reason: reason || 'non-zero exit' });
        break;
      case 'Error':
        error.push({ name: p.name, reason: reason || 'error' });
        break;
      case 'Pending':
        pending.push({ name: p.name, reason: reason || 'pending' });
        break;
      case 'Disabled':
        disabled.push(p.name);
        break;
      case 'Foreground':
        foreground.push(p.name);
        break;
      default:
        other.push(p.name);
    }
    if (!ready) not_ready.push({ name: p.name, reason });
  }

  return { summary, running, restarting, completed_ok, failed, error, pending, disabled, foreground, other, not_ready, details };
}

