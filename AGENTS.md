# Repository Guidelines

## Project Structure & Module Organization
- Go application lives in `src/` (entrypoint `src/main.go`) with packages like `api/`, `cmd/`, `config/`, `tui/`, `client/`, and `pclog/`.
- Rust workspace for the client library is under `crates/` (`process-compose-client`) with an `example/` crate.
- Schemas and docs: `schemas/` (JSON schema), `www/docs/cli/` (generated CLI docs), `src/docs/` (OpenAPI assets).
- Examples and fixtures: `examples/`, `fixtures/`, and `fixtures-code/`.
- Tooling: `Makefile`, `.golangci.yaml`, `.goreleaser.yaml`, `scripts/`, `bin/`.

## Build, Test, and Development Commands
- `make setup` — download Go modules.
- `make build` — build binary to `bin/process-compose`.
- `make run` — run locally with debug flags (`PC_DEBUG_MODE=1 -e .env`).
- `make test` / `make testrace` — run unit tests with coverage/race.
- `make coverhtml` — generate and open coverage report.
- `make lint` — run `golangci-lint` using repo config.
- `make docs` — generate CLI docs in `www/docs/cli`.
- `make schema` — emit `schemas/process-compose-schema.json`.
- Nix users: `make build-nix` or `nix build .`.

## Coding Style & Naming Conventions
- Language: Go 1.24 (see `go.mod`). Use `gofmt` defaults and run `make lint` before pushing.
- Packages: short, lower-case (e.g., `loader`, `health`). Files use snake_case; exported identifiers use UpperCamelCase; unexported use lowerCamelCase.
- Keep modules cohesive; place new packages under `src/<area>/`.

## Testing Guidelines
- Prefer table-driven Go tests named `*_test.go`; place beside the code under `src/`.
- Use `fixtures/` and `fixtures-code/` for sample inputs; avoid network/file-system side effects where possible.
- Run `make test` locally; target meaningful coverage (`make coverhtml` to inspect gaps).
- Rust client tests (optional): `cargo test` from `crates/`.

## Commit & Pull Request Guidelines
- Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, etc. Example: `fix: processes status is visible during shutdown`.
- PRs should include: concise description, linked issues (`Fixes #123`), test notes, and for TUI/API changes, screenshots or sample requests.
- Keep PRs focused; update docs/schemas when behavior or API changes.

## Security & Configuration Tips
- Never commit secrets; use `.env.local` for developer settings.
- Validate configuration changes with `make schema`; regenerate OpenAPI/CLI docs when editing API flags.
