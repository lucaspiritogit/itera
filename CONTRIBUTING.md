# Contributing

Thanks for helping improve Itera. The project is early alpha, so focused changes with clear behavior are easier to review than broad rewrites.

## Local Setup

```bash
npm install
npm run dev
```

Use the desktop app's folder picker to open a workspace before sending prompts.

## Before Opening A Pull Request

Run the checks that match your change:

```bash
npm test
npm run build
npm run lint
```

For dependency changes, also run:

```bash
npm run audit
```

If a check cannot pass because of an existing toolchain advisory or environment issue, call that out in the PR.

## Change Guidelines

- Keep patches focused on one behavior or one subsystem.
- Prefer the existing orchestration and review model over adding parallel control paths.
- Add regression tests for prompt-flow, review-flow, diff parsing, and workspace-boundary changes.
- Do not commit `.env`, credentials, private keys, local absolute paths, generated builds, or `node_modules`.
- Do not expose the backend beyond localhost in examples unless the security tradeoff is explicit.

## Security Reports

Do not include exploit details in a public issue.
