---
name: cmr-create-app
description: Create or register a Copilot Managed Runtime app with the right repository model (platform Git, external GitHub Enterprise Cloud, or none), environment and template, and set up a production-ready project skeleton. USE WHEN starting a new CMR app, converting an existing SPA with `ms app init`, choosing between `--repo` options, or standardising an org starter template. DO NOT USE WHEN cloning an existing app for handoff (use cmr-citizen-handoff) or creating Power Apps code apps.
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, AskUserQuestion
---

# Create a CMR app

## 1. Decide the repository model first (permanent — AP-16)

| Model | Command | Choose when | Trade-offs |
|---|---|---|---|
| **Platform-managed Git** (`repoType: native`) | `ms app create -n "<name>" ./dir` | citizen/pro-dev collaboration, fastest start, `ms app clone` handoff | pushes are **not** in Purview audit; limited branch protection; GCM OAuth |
| **External GitHub Enterprise Cloud** (`github`) | `ms app create -n "<name>" --repo https://github.com/<org>/<repo> ./dir` | enterprise SDLC: PR reviews, branch protection, CodeQL, Dependabot, audit log | repo must exist **empty** on GHEC; no `ms app clone` (use `git clone`) |
| **None / external artifacts** (`none`) | `ms app create -n "<name>" --repo none ./dir` | you own the build (GitHub Actions, ADO) and deploy zips | admin must enable external artifacts; you own provenance & scanning (AP-56) |

Ask the user if unclear. Default recommendation: **platform Git for prototypes and citizen handoff; external GHEC for anything business-critical.**

## 2. Pick the environment

Omit `-e` to use (or provision) the maker's personal developer environment. Pass `-e <environment-id>` only if the admin routed you to a specific environment. Dataverse may live elsewhere — bind it cross-environment later (`cmr-dataverse`).

## 3. Pick a template

- Default: built-in Vite + React 19 + TS template with `@microsoft/managed-apps-vite-plugin`.
- Org golden template (recommended at scale): `-t github:<org>/<repo>/<subdir>`. Put your design system, lint rules, `src/data` wrapper pattern, error boundary, telemetry bootstrap, `.gitattributes`, CI workflow and README in it.

## 4. Create

```bash
ms app create -n "Contoso Expenses" -d "Submit and approve expenses" ./contoso-expenses --non-interactive --json
cd contoso-expenses
npm install
ms app info --json
```

Existing SPA instead: `cd my-spa && ms app init -n "My SPA" --repo native|none|<url> --build-command "npm run build" --build-path ./dist`.

## 5. Harden the skeleton (do this immediately)

1. `.gitattributes` → `* text=auto eol=lf` (Windows CRLF noise).
2. Pin tooling: `@microsoft/managed-apps-cli` and `@microsoft/managed-apps-vite-plugin` in `devDependencies` at exact versions; add `"ms": "ms"` script so everyone uses `npx ms` (AP-13).
3. Folder convention:
   ```
   src/
     data/            # your wrappers over generated services (only place that imports generated/)
     components/
     hooks/
     telemetry.ts     # initializeLogger bootstrap
   generated/         # codegen — never edit
   ```
4. Add an error boundary and a single `toAppError(result.error)` helper (`cmr-sdk-patterns`).
5. No CDN links in `index.html`; self-host fonts/icons (AP-40).
6. README: purpose, owners (≥2, ideally a group), data sources, environments, how to run (`ms app dev`), how to deploy.
7. First commit + push, then `ms app deploy` to validate the pipeline end-to-end with the empty app.

## Verify

- `ms app info --json` shows the app, env, repo.
- `ms app pack` succeeds locally.
- `ms app play --mode preview --no-browser` prints a URL.

## Anti-patterns

AP-01, AP-10, AP-13, AP-16, AP-40. See [anti-patterns](../../references/anti-patterns.md).
