## Process Compose MCP (TypeScript)

FastMCP server that exposes local Process Compose as MCP tools.

- Start/stop a process-compose session (HTTP API on localhost, TUI off)
- Inspect states (running/failed/completed/error), project info
- Control processes (start/stop/restart/scale)
- Logs (tail by offset/limit) and truncation

### Dev

- Build process-compose: `make build` (creates `bin/process-compose`)
- Install: `cd mcp/ts/process-compose-mcp && npm i`
- Run (dev): `npm run dev`

Env:
- `PC_BINARY` – override binary path (default: `./bin/process-compose` or on PATH)
- `PC_DEFAULT_PORT` – prefer this port; falls back to probing from 8080

CLI (after build): `pc-mcp-ts` (if installed globally) or `npm run start`

### Tools
- `start_session({ configs, envFiles, port, keepProject, useUds?, udsPath? })`
- `stop_session()`
- `status_summary({ withMemory })`
- `list_processes()` / `get_process({ name })`
- `start_process({ name })` / `stop_process({ name })` / `restart_process({ name })` / `scale_process({ name, replicas })`
- `stop_processes({ names })` (batch)
- `get_ports({ name })`
- `get_logs({ name, endOffset, limit })` / `truncate_logs({ name })`
- `project_info()` / `reload_project()`
- `stream_logs({ name, offset?, maxMessages?, timeoutMs? })` – WebSocket snapshot (TCP sessions only)
- `await_ready({ names?, timeoutMs?, intervalMs? })`
- `analyze_processes()`

UDS mode: set `useUds: true` (optionally `udsPath`) in `start_session` to use a Unix domain socket. HTTP tools support UDS; WebSocket streaming requires TCP.

### Install in Cursor or Codex

- Build a tarball: `npm pack` (produces `process-compose-mcp-<version>.tgz`).
- Install globally: `npm i -g ./process-compose-mcp-<version>.tgz` (provides `pc-mcp-ts`).

Cursor
- Settings → MCP Servers → Add Server
  - Name: `process-compose`
  - Command: `pc-mcp-ts`
  - Args: (leave empty)
  - Env (optional): `PC_BINARY=/abs/path/to/bin/process-compose`

Codex CLI
- Add an MCP server entry that runs the stdio server:
  - Command: `pc-mcp-ts`
  - Or: `node`, Args: `dist/index.js`, Cwd: this folder
  - Env: set `PC_BINARY` if needed

Verify
- Run `pc-mcp-ts` in a terminal (it will wait for stdio clients).
- In Cursor/Codex, call `start_session` then `list_processes` to confirm.
