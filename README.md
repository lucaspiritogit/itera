# Itera

Itera is a review-first desktop harness for agentic coding. It keeps the developer in the loop by splitting work into an exploration phase, a finding review, an implementation phase, and a per-change review.

The current app is an Electron + React desktop client. The Electron main process spawns the `codex app-server` CLI for each session over stdio and forwards normalized events to the renderer through a narrow IPC bridge.

## Status

Itera is early alpha software. It is useful for experimenting with review-first coding UX, but it is not ready to run as a remote service or with untrusted workspaces.

The provider layer is currently Codex-specific. The intended direction is an agent-agnostic backend that can support local CLIs and API-based providers behind the same review model.

## Safety Model

- A project must be selected before the desktop app starts a Codex stdio session.
- File reads requested by the renderer are constrained to the selected workspace root.
- User prompts start in exploration mode by default. Editing only begins after the developer approves the exploration finding.
- File-change reviews stay pending until the selected change is accepted or denied.
- Do not expose the backend with `HOST=0.0.0.0` unless the machine and workspace are trusted.

## Requirements

- Node.js 20 or newer
- npm 10
- The `codex` CLI on `PATH`, or `CODEX_CLI_PATH` set to the CLI binary

## Quick Start

```bash
npm install
npm run dev
```

Open a project folder from the desktop app, then send a prompt. The normal prompt flow is:

```text
explore -> review finding -> implement -> review change
```

## Environment

Copy `.env.example` to `.env` for local overrides if needed.

| Variable         | Default        | Purpose                                                 |
| ---------------- | -------------- | ------------------------------------------------------- |
| `CODEX_CLI_PATH` | `codex`        | CLI binary used by the Electron main process            |
| `CODEX_MODEL`    | `gpt-5.4-mini` | Default model passed to `codex app-server`              |
| `CODEX_HOME`     | unset          | Optional Codex home directory passed through to the CLI |

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
npm run audit
```

## Repository Layout

```text
apps/backend   legacy local WebSocket bridge to codex app-server
apps/desktop   Electron stdio host, React UI, review orchestration, diff rendering
```

## Security And Dependency Notes

This repository should not contain credentials, private keys, machine-local paths, or checked-in `.env` files. Use `.env.example` for documented configuration.

`npm audit --workspaces --audit-level=moderate` currently reports unresolved advisories in the Electron/Vite development toolchain. Some suggested fixes require breaking upgrades or do not have an upstream fix available yet. Keep the app local-only, keep dependencies current, and avoid force-upgrading audit fixes without validating the Electron Forge/Vite build.

Please report vulnerabilities privately; see [SECURITY.md](./SECURITY.md).

## Contributing

Contributions are welcome while the project is still taking shape. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), keep changes focused, and include tests for review-flow behavior when possible.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
