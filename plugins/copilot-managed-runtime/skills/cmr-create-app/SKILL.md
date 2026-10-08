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
| **External GitHub Enterprise Cloud** (`github`) | `ms app create -n "<name>" --repo https://github.com/<org>/<repo> ./dir` (or `https://<sub>.ghe.com/...`) | enterprise SDLC: PR reviews, rulesets, CodeQL, Dependabot, audit log | GHEC org repo only (no personal/GHES/ADO); must exist **completely empty**, not even README/`.gitignore` (AP-17/18); preview = repo **write** access; per-user GitHub mapping expires; no `ms app clone` (use `git clone`) |
| **None / external artifacts** (`none`) | `ms app create -n "<name>" --repo none ./dir` | you own the build (GitHub Actions, ADO) and deploy zips; fully headless SP CI | admin must enable external artifacts; you own provenance & scanning (AP-56) |

Ask the user if unclear. Default recommendation: **platform Git for prototypes and citizen handoff; external GHEC (private repo, team write access, ruleset on `main`) for anything business-critical; `none` when CI must run headless with a service principal.** Full comparison, GitHub settings that matter and error map: [source-control](../../references/source-control.md).

GitHub mode pre-flight: `gh repo create <org>/<repo> --private` (no `--add-readme`/`--gitignore`/`--license`) → create the app → if prompted, complete the device code at `https://<host>/login/device` → then add README, CODEOWNERS, workflows and the ruleset.

## 2. Pick the environment

The developer chooses. `ms app create` / `init` resolves the environment in this order:
1. **Managed project** environment (`MS_CLI_ALM` preview). A different `-e` is an error.
2. **`-e <environment-id>`.** Any environment where you have rights and the per-environment setting "Allow app creation with the CMR CLI" is on.
3. **Routing.** Without `-e` the CLI prints "No environment specified — resolving your developer environment…". It reuses your **personal developer environment** or provisions one, polling for up to about 2 minutes. That environment is a managed environment in the routing rule's group, you're its admin, and it has **no Dataverse**.

The ID is written to `ms.config.json`, so later commands follow it (`-e` overrides per command). `ms` can't list or create environments.

| Building | Use |
|---|---|
| A prototype or personal tool | omit `-e` (personal developer environment) |
| A team or business app | `-e <team-environment-id>`: in a governed group, with Dataverse if needed and ≥2 owners (AP-88) |
| Never | the Default environment or another ungrouped environment, to get round policy (AP-89) |

Governance follows the **environment's group**: connectors, sharing and CSP rules come from the group, not from you. Check before building: `ms connector list -e <id> --only-allowed --json`.

Errors:
- 400 "Managed App creation from CLI is not enabled for environment …" → the admin turns on the rule for that environment or group.
- Exit 5 "Could not reach environment …" → wrong ID or wrong `--cloud`.
- "Could not provision a Developer environment …" → no routing rule covers you; ask the admin.

No suitable environment? See [governance-quick-ref](../../references/governance-quick-ref.md) → *Environments* for how to create or request one. Dataverse may live elsewhere: bind it across environments with `--dataverse-environment-id` (`cmr-dataverse`, AP-28).

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

AP-01, AP-10, AP-13, AP-16, AP-17, AP-18, AP-19, AP-40, AP-88, AP-89, AP-90. See [anti-patterns](../../references/anti-patterns.md).
