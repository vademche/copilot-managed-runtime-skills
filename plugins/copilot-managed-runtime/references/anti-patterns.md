# Anti-patterns catalog (Copilot Managed Runtime)

Each entry: **what it looks like → why it hurts → do this instead.** IDs (`AP-xx`) are referenced by the `cmr-review` skill and the `cmr-reviewer` agent.

## Product confusion

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-01 | Using Power Apps **code apps** tooling (`pac code`, `@microsoft/power-apps`, `power.config.json`) in a CMR project | Different product, runtime, config and governance; commands silently target the wrong thing | CMR = `ms` CLI + `@microsoft/managed-apps` + `ms.config.json` |
| AP-02 | Treating CMR like a generic static host (Azure SWA, any CDN) | CMR host injects auth, connections, governance; the bundle must use the SDK | Build an SPA that talks to data **only** via the SDK / generated services |

## Project & config

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-10 | Hand-editing `ms.config.json` | Local state drifts from platform; deploy/connection failures | `ms app add/remove/refresh data-source`, `ms app set-setting` |
| AP-11 | Hand-editing `generated/` or `.ms/schemas/` | Overwritten on next codegen; type lies | Wrap generated services in your own `src/data/*` module |
| AP-12 | Not committing `generated/` / `.ms/schemas/` | Cloud build or teammates get different code | Commit them; review diffs after CLI upgrades |
| AP-13 | Unpinned / global-only CLI versions across a team | Different codegen output per developer | Pin `@microsoft/managed-apps-cli` in `devDependencies`; use `npx ms` |
| AP-14 | Importing from the package root `@microsoft/managed-apps` | No root export → build error | Sub-paths: `/app`, `/auth`, `/data`, `/telemetry` |
| AP-15 | `import { XService } from '../generated'` for **Dataverse** services | Default exports aren't re-exported → `undefined` at runtime | `import XService from '../generated/services/XService'` |
| AP-16 | Choosing `--repo` casually | Fixed at creation; changing = new app | Decide platform Git vs GHEC vs none up front (`cmr-create-app`) |

## Data & connectors

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-20 | `fetch()` / axios to third-party APIs or your own backend | Blocked by CSP `connect-src 'self'`; bypasses connector governance & DLP | Use an approved connector; if truly needed, admin adds origin to CSP **and** you document why |
| AP-21 | Ignoring `IOperationResult.success` (assuming throws) | Failures render as empty data, silent data loss | Branch on `success`, show `error.message`, log `requestId` |
| AP-22 | Trusting generated tabular `delete()` | Returns `void`; failures invisible | Use `getClient(dataSources).deleteRecordAsync()` and check `success` |
| AP-23 | Designing around blocked actions (HTTP request, Run script, Custom API) | They're not generated and policy can't be bypassed in code | Purpose-scoped actions, or an admin policy change |
| AP-24 | Unbounded `getAll()` / `ListRecords()` without `select`/`top`/paging | Slow, throttled, costly (Copilot Credits per call) | `select` only needed columns, `top`, page with `skipToken` |
| AP-25 | Client-side authorization (`if (user.objectId === ownerId) showDelete()`) as the only control | Any user can call the connector directly | Enforce in the data source (Dataverse roles / SharePoint permissions); UI hiding is cosmetic |
| AP-26 | N+1 calls (one connector call per row) | Latency + credits | Use `$expand`, batch by filter, cache lookups |
| AP-27 | Adding connectors "just in case" | Each = consent prompt + attack surface + policy break risk | Only bind what the app uses; `ms app remove data-source` unused ones |
| AP-28 | Dataverse in a personal dev env without Dataverse | "Unable to determine the Dataverse organization URL" + dangling connection | `--dataverse-environment-id <env-with-dataverse>` |
| AP-29 | Parsing Work IQ MCP results as JSON directly | Response `data` is **SSE text** | Parse `event:`/`data:` lines then JSON-RPC (`cmr-mcp-workiq`) |
| AP-30 | Non-idempotent effects (create-on-mount) | Effects ran twice in the lab even in production → duplicate records | Idempotent loads; creates only on explicit user action |

## Security & CSP

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-40 | Loading scripts/fonts/styles from CDNs (Google Fonts, unpkg, jsDelivr) | CSP blocks; app breaks in prod but works in some dev setups | Bundle assets with Vite; self-host fonts |
| AP-41 | `<form action=...>` / native form submit | `form-action 'none'` | `onSubmit={e => { e.preventDefault(); ... }}` |
| AP-42 | `<iframe>` / `<embed>` third-party content | `child-src 'none'`, `frame-src 'self'` | Link out, or admin CSP change |
| AP-43 | Web workers / service workers / PWA manifest | `worker-src 'none'`, `manifest-src 'none'` | Main-thread code; don't ship SW |
| AP-44 | Secrets, API keys, connection strings in the bundle or `.env` committed | Bundles are downloadable; repo isn't audited for pushes | No secrets client-side — connectors carry auth |
| AP-45 | `dangerouslySetInnerHTML` with connector data (mail bodies, list text) | XSS inside an authenticated M365 context | Sanitize (DOMPurify, bundled) or render as text |
| AP-46 | Asking the admin to put `*` / `https:` in CSP | Nullifies egress control | Exact origins, report-only first |

## Delivery & ALM

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-50 | `ms app deploy --force` as a habit | Deploys uncommitted / unpushed code — not reproducible, not reviewable | Commit → push → build → deploy a SHA |
| AP-51 | Assuming live updates after push | Live only changes on `deploy`; preview tracks `main` | Use preview URL for review, deploy to promote |
| AP-52 | One app for dev/test/prod by editing bindings | Users hit dev data; no rollback point | Separate apps/envs or preview ALM deployments; deploy known SHAs |
| AP-53 | CI with personal credentials / device code | Breaks, unaudited, violates policy | Service principal (`PP_SP_*` secrets), least-privilege env role |
| AP-54 | GitHub Actions `ms-app-deploy` without explicit `cloud` | Action source defaults `cloud` to `test` | Set `cloud: prod` (or your sovereign cloud) explicitly; verify after first run |
| AP-55 | Floating action refs (`@main`) | Supply-chain risk | Pin to an immutable tag/SHA |
| AP-56 | Shipping `--repo none` + external artifacts without pipeline controls | You own provenance; CMR doesn't scan | Protected branches, required reviews, SCA/secret scanning, signed artifacts |

## Sharing, citizen handoff, cost

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-60 | Sharing with individuals one by one | Unmanageable, leaks on leavers | Share with Entra security groups |
| AP-61 | Granting `edit` broadly | Edit = clone, push, deploy | Edit only to accountable co-owners; play for users |
| AP-62 | Pro-dev rewrites a citizen app from scratch | Loses app identity, sharing, inventory history | `ms app clone` the same app, evolve it, keep the app ID |
| AP-63 | Hand-editing connection code generated by Copilot Studio Apps | Docs warn: breaks regeneration | Hand off via clone + CLI regeneration |
| AP-64 | Ignoring per-call credit cost in chatty UIs (polling, typeahead) | Copilot Credits billed per API call for unlicensed users | Debounce, cache, paginate; prefer Premium-licensed audiences for heavy apps |
| AP-65 | Orphaned apps (owner leaves) | Unowned prod apps, blocked fixes | ≥2 edit owners (group), documented in README |

## Agent behaviour (for coding agents)

| ID | Anti-pattern | Instead |
|---|---|---|
| AP-70 | Running `ms` interactively in a non-TTY agent shell | Always `--non-interactive --json`; handle exit code 2 discovery loops |
| AP-71 | Guessing flags from docs | `ms <cmd> --help` first; CLI is source of truth |
| AP-72 | Deleting apps / unsharing without explicit user confirmation | Destructive commands require explicit user intent in the current turn |
| AP-73 | Pasting real tenant IDs/URLs into public issues, samples or skills | Anonymise: `<tenant-id>`, `<environment-id>`, `contoso` |
