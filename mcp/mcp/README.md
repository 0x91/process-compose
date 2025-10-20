# Process Compose MCP

TypeScript FastMCP server that exposes your local Process Compose instance to MCP-aware IDEs such as Cursor and Codex.

## Prerequisites
- Node.js 18+ (Node 24.x recommended)
- Go binary of Process Compose built at `bin/process-compose`
- npm (for installing/packing)

## Build & Install Locally
```bash
cd mcp/ts/process-compose-mcp
npm install
npm run build
npm pack                          # produces process-compose-mcp-<version>.tgz
npm install -g ./process-compose-mcp-0.1.0.tgz
```
The global install publishes a CLI shim `pc-mcp-ts` that launches the MCP server over stdio.

## Cursor Configuration
Add a new MCP server entry (Settings → MCP Servers → Add Server):
```json
{
  "name": "process-compose",
  "command": "pc-mcp-ts",
  "args": [],
  "env": {
    "PC_BINARY": "/absolute/path/to/process-compose/bin/process-compose"
  }
}
```
Restart Cursor and the MCP tools (`start_session`, `list_processes`, `get_logs`, `stream_logs`, `analyze_processes`, etc.) will be available.

## Codex Configuration
Update `~/.codex/config.toml`:
```toml
[mcp_servers.process_compose]
command = "pc-mcp-ts"
args = []
env = { PC_BINARY = "/absolute/path/to/process-compose/bin/process-compose" }
network_access = true
```
Codex will auto-start the MCP server. Call tools directly from the MCP palette (e.g., `start_session`, `list_processes`, `stream_logs`).

## Development Notes
- For changes, run `npm test` to execute unit + integration suites (requires bin/process-compose).
- Re-pack/install (`npm pack`, `npm install -g ...`) after edits to dist/.
- The server exposes TCP by default; pass `useUds: true` in `start_session` for Unix domain socket mode.

Enjoy orchestrating Process Compose directly from Cursor or Codex!
