---
name: cmr-review
description: Review a Copilot Managed Runtime app repository or pull request against best practices and the anti-pattern catalog (config, generated code, data access, SDK usage, security/CSP, ALM, sharing, cost) and produce a prioritised findings report. USE WHEN asked to review, audit, assess production-readiness of, or harden a CMR app, or before the first production deploy. DO NOT USE WHEN reviewing non-CMR projects.
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
---

# Review a CMR app

Read-only. Don't modify files unless the user asks for fixes afterwards.

## 1. Collect facts

```bash
ms --version; ms app info --json          # if signed in; otherwise read ms.config.json
git log --oneline -n 20; git status --short
```

Read: `ms.config.json`, `package.json`, `src/**`, `generated/index.ts`, `generated/services/*`, `.gitattributes`, `.github/workflows/*`, `index.html`, README.

## 2. Checks (grep hints → AP id)

| Area | Check | Hint | AP |
|---|---|---|---|
| Product | CMR, not code apps | `power.config.json`, `@microsoft/power-apps`, `pac code` | AP-01 |
| Config | `ms.config.json` committed, no secrets, not hand-edited | `git log -p ms.config.json` | AP-10, AP-44 |
| Generated | `generated/` + `.ms/schemas/` committed, untouched | `git log --format=%an -- generated/` | AP-11, AP-12 |
| Tooling | CLI + vite plugin pinned | `"@microsoft/managed-apps-cli": "^` | AP-13 |
| Imports | subpaths only; Dataverse default imports | `from '@microsoft/managed-apps'$`, `import { .* } from .*generated/services/.*Service'` | AP-14, AP-15 |
| Network | no external fetch/axios | `fetch\(`, `axios`, `XMLHttpRequest`, `new WebSocket` | AP-20 |
| Results | every call checks `success` | calls without `.success` / `unwrap` | AP-21, AP-22 |
| Queries | `select`/`top`/paging; no N+1 | `getAll\(\)`, `ListRecords\(\{\}\)`, calls inside `.map(` | AP-24, AP-26 |
| AuthZ | no UI-only authorisation | `objectId ===`, `isAdmin` in components | AP-25 |
| Effects | no writes on mount; dedupe | `useEffect` + `Create`/`create(` | AP-30 |
| CSP | no CDN, forms prevented, no iframe/worker/manifest | `https://` in `index.html`/CSS, `<form`, `<iframe`, `new Worker`, `manifest.json` | AP-40–AP-43 |
| XSS | no raw HTML from data/AI | `dangerouslySetInnerHTML`, `innerHTML` | AP-45 |
| Secrets | none in repo | `apikey`, `secret`, `password`, `.env` committed | AP-44 |
| MCP | SSE parsed | `JSON.parse(res.data)` on MCP | AP-29 |
| CI | SP auth, pinned actions, `cloud: prod`, no `--force` | `@v1$`, `@main`, missing `cloud:` | AP-50, AP-53–AP-55 |
| Envs | not one app for all stages | binding swaps in history | AP-52 |
| Ownership | ≥2 owners, group sharing | `ms app share list` | AP-60, AP-61, AP-65 |
| Cost | no polling / undebounced typeahead | `setInterval`, `onChange` → query | AP-64 |
| Hygiene | `.gitattributes`, lint, typecheck, tests, README owners | — | — |

## 3. Report format

```
## CMR review — <app-name> (<date>, ms <version>)
Verdict: Ready | Ready with fixes | Not ready
| # | Severity | AP | File:line | Finding | Fix |
|---|---|---|---|---|---|
| 1 | High | AP-21 | src/data/orders.ts:42 | ListRecords result not checked | use unwrap() |
...
Strengths: ...
Next steps (ordered): ...
```

Severity: **High** = data loss, security, wrong-tenant/cloud deploy, broken prod; **Medium** = reliability/cost/maintainability; **Low** = hygiene.

Reference: [anti-patterns](../../references/anti-patterns.md).
