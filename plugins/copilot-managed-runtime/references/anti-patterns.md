# Anti-patterns catalog (Copilot Managed Runtime)

Each entry: **what it looks like → why it hurts → do this instead.** IDs (`AP-xx`) are referenced by the `cmr-review` skill and the `cmr-reviewer` agent.

## Product confusion

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-01 | Using Power Apps **code apps** tooling (`pac code`, `@microsoft/power-apps`, `power.config.json`) in a CMR project | Different product, runtime, config and governance; commands silently target the wrong thing | CMR = `ms` CLI + `@microsoft/managed-apps` + `ms.config.json` |
| AP-02 | Treating CMR like a generic static host (Azure SWA, any CDN) | CMR host injects auth, connections, governance; the bundle must use the SDK | Build an SPA that talks to data **only** via the SDK / generated services |
| AP-92 | Porting code-app auth code: requesting connector tokens, building `Authorization` headers, or reading `getContext().user` | In CMR the host injects auth over a MessagePort and app JS never holds a token. `getContext()` has no user, and `getUser()` has no UPN (lab) | Call generated services only; use `getUser()` for `fullName` / `objectId` |
| AP-93 | Porting `databaseReferences["default.cds"]`, or assuming Dataverse is always the app's own environment | In CMR, Dataverse is a connector reference keyed by org URL. A copied or hand-written binding points at whichever org it names (lab) | `ms app add data-source --connector commondataserviceforapps --as table`; check the org URL in `ms.config.json` per stage (AP-90) |
| AP-94 | Assuming `ms app delete` removes the source code | The native Git repo survives the delete (lab), so the code and its data-source wiring stay in the environment | Mirror it if you need history, then `DELETE https://<env-host>/appframework/git/repositories/<repository-id>` (ID from `cloneUrl` in `ms app info --json`, taken **before** deleting) |
| AP-95 | Governing CMR apps with code-app controls (`PowerApps_AllowCodeApps`, environment CSP, Power Apps API DLP evaluation) | CMR apps aren't Power Apps app records: no `executionRestrictions`, `404` in that API (lab). Their CSP, sharing and connector rules come from the environment group | Set rules on the environment group in the Microsoft 365 admin center ([governance-quick-ref](governance-quick-ref.md)) |

## Project & config

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-10 | Hand-editing `ms.config.json` | Local state drifts from platform; deploy/connection failures | `ms app add/remove/refresh data-source`, `ms app set-setting` |
| AP-11 | Hand-editing `generated/` or `.ms/schemas/` | Overwritten on next codegen; type lies | Wrap generated services in your own `src/data/*` module |
| AP-12 | Not committing `generated/` / `.ms/schemas/` | Cloud build or teammates get different code | Commit them; review diffs after CLI upgrades |
| AP-13 | Unpinned / global-only CLI versions across a team | Different codegen output per developer | Pin `@microsoft/managed-apps-cli` in `devDependencies`; use `npx ms` |
| AP-14 | Importing from the package root `@microsoft/managed-apps` | No root export → build error | Sub-paths: `/app`, `/auth`, `/data`, `/telemetry` |
| AP-15 | `import { XService } from '../generated'` for **Dataverse** services | Default exports aren't re-exported → `undefined` at runtime | `import XService from '../generated/services/XService'` |
| AP-16 | Choosing `--repo` casually | Fixed at creation; changing = new app | Decide platform Git vs GHEC vs none up front (`cmr-create-app`, [source-control](source-control.md)) |
| AP-17 | Creating the GitHub repo with README / `.gitignore` / LICENSE before `ms app create --repo` | Create requires a **completely empty** repo → "Repository … is not empty" | Create the repo with no files; add README after binding, or `ms app init --repo <url>` in an existing clone |
| AP-18 | Binding a personal-account, non-GHEC org, GHES or Azure DevOps repo, or a bare-host URL | Unsupported; fails at bind or auth | GHEC org repo (github.com or `*.ghe.com`) with a full `https://` URL |
| AP-19 | Public or `internal` visibility for app source repos | Exposes source and data-source wiring to everyone/the whole enterprise; `internal` read doesn't even grant preview | Private repos enforced by enterprise policy; team-based **write** = the preview/push list |

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

## Backend provisioning & Dataverse solutions

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-31 | Creating or altering Dataverse schema at runtime or from an agent (Dataverse MCP `create_table` / `update_table` / `delete_table`, Web API from the app) | Untracked unmanaged layers, no review, no rollback; prod drifts from dev | Schema only in the dev solution, promoted as managed ([solutions-and-alm](solutions-and-alm.md)); disable MCP schema tools for app scenarios |
| AP-32 | App creating containers at runtime (Teams `CreateATeam`, Planner `CreateBucket`, Excel `CreateTable`, lists per user) | Sprawl, orphaned resources, ownership and retention gaps | The app creates content, never containers; containers come from `/provisioning` scripts |
| AP-33 | Using Excel workbooks as the app database | No concurrency, locking, row security or scale; file renames break bindings | Dataverse, or a SharePoint list for simple team data |
| AP-34 | Dataverse components outside a solution (Default solution, `cr123_` / `new_` prefixes) | Can't be shipped cleanly; collisions and mystery prefixes | Custom publisher prefix; `MSCRM.SolutionUniqueName` on every metadata call ([backend-provisioning](backend-provisioning.md)) |
| AP-35 | Over-privileged provisioning identity (Global Admin, `Sites.FullControl.All`, personal credentials in CI) | Blast radius; unaudited; breaks when the person leaves | `Sites.Selected` plus a per-environment application user with a custom role |
| AP-36 | CMR-enabled environments outside any environment group | The curated connector allow-list is enforced through the group rule. In the lab, an ungrouped sandbox allowed every connector and action (third-party connectors, SQL, HTTP) | Put every environment that hosts CMR apps in a governed group; audit ungrouped environments; keep tenant DLP as a backstop |
| AP-37 | Importing unmanaged solutions into test/prod, or hot-fixing schema in prod | Unremovable layers, no clean upgrade or uninstall, drift | Managed downstream; "Block unmanaged customizations" in prod |
| AP-38 | Recreating tables by hand in each environment | Different prefixes, option values and entity sets → divergent codegen, broken choice maps | One solution, imported managed; `generated/` diff must be empty after rebinding |
| AP-39 | Expecting the CMR app inside a solution, or confusing CMR "managed projects" with managed solutions | CMR apps aren't solution components; Pipelines won't move them | Two tracks: solution import for schema, `ms app deploy` for the app |

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
| AP-57 | Keeping regulated / business-critical apps on platform-managed Git | No PRs, branch protection or code scanning; pushes not in Purview audit; any editor can push to `main` | GHEC repo with rulesets + audit log streaming, or `none` + controlled pipeline |
| AP-58 | Leaving `main` unprotected on a `github` app (or assuming push = build) | Platform builds whatever is on `main`; push doesn't build, deploy takes the latest successful `main` build | Ruleset on `main` (PR, reviews, checks, no force-push); `ms app deploy --commit <reviewed-sha>` |

## Sharing, citizen handoff, cost

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-60 | Sharing with individuals one by one | Unmanageable, leaks on leavers | Share with Entra security groups |
| AP-61 | Granting `edit` broadly | Edit = clone, push, deploy | Edit only to accountable co-owners; play for users |
| AP-62 | Pro-dev rewrites a citizen app from scratch | Loses app identity, sharing, inventory history | `ms app clone` the same app, evolve it, keep the app ID |
| AP-63 | Hand-editing connection code generated by Copilot Studio Apps | Docs warn: breaks regeneration | Hand off via clone + CLI regeneration |
| AP-64 | Ignoring per-call credit cost in chatty UIs (polling, typeahead) | Copilot Credits billed per API call for unlicensed users | Debounce, cache, paginate; prefer Premium-licensed audiences for heavy apps |
| AP-65 | Orphaned apps (owner leaves) | Unowned prod apps, blocked fixes | ≥2 edit owners (group), documented in README |
| AP-86 | Distributing a share link instead of sharing with a group, then forgetting it | Anyone in the tenant who redeems it gets play (`MicrosoftAppReader`) until the link is revoked. The access isn't tied to a group you can review, and `link revoke` is broken in ms 0.27 | Share with security groups. If a link is unavoidable: record its ID, check `redeemedPrincipalIds`, and revoke it (REST `DELETE …/shareLinks/<id>` until the CLI is fixed) |
| AP-87 | Trusting `ms app unshare` "success" when offboarding | With the wrong `--access`, it returns `success: true` with `revokedCount: 0` and the principal in `notFound`, so edit (deploy) rights can survive | Unshare each level the principal holds, check `revokedCount` and `notFound`, and confirm with `share list --access play` and `--access edit` |

## Agent behaviour (for coding agents)

| ID | Anti-pattern | Instead |
|---|---|---|
| AP-70 | Running `ms` interactively in a non-TTY agent shell | Always `--non-interactive --json`; handle exit code 2 discovery loops |
| AP-71 | Guessing flags from docs | `ms <cmd> --help` first; CLI is source of truth |
| AP-72 | Deleting apps / unsharing without explicit user confirmation | Destructive commands require explicit user intent in the current turn |
| AP-73 | Pasting real tenant IDs/URLs into public issues, samples or skills | Anonymise: `<tenant-id>`, `<environment-id>`, `contoso` |

## Inventory, orphans and AI-created containers

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-74 | Using `ms app list` (or your own maker view) as the app inventory | It's RBAC-scoped: it only shows apps shared with you, so citizen apps nobody shared are invisible | Inventory API / PPAC Inventory / MAC All apps ([inventory-orphans-adoption](inventory-orphans-adoption.md)) |
| AP-75 | Counting on an admin to reassign ownership when a maker leaves | CMR apps have no reassignment path in preview (the Power Apps admin cmdlets return 404, MAC offers Block / Delete only) | ≥2 edit owners through a group from day one; external GHEC repos for critical apps |
| AP-76 | Deleting orphaned or "old" apps without checking usage | An orphaned app people still use is business-critical; deleting it causes an outage with no source to restore | Join usage records first; **Block**, notify, wait a grace period, then delete |
| AP-77 | Building CMR inventory on the Power Apps admin cmdlets, the CoE kit or a service principal | The cmdlets and the CoE kit don't see CMR apps; the inventory API rejects service principals (403) | Delegated admin token on the resource query API, scheduled by an accountable admin |
| AP-78 | Shipping tables or lists that an AI agent created (Dataverse MCP `create_table`, Copilot Studio Apps, Work IQ / Cowork lists) to production as-is | Dataverse MCP tables land **unmanaged in the Default solution with the default publisher prefix**; lists have ad-hoc names and owners. None of it is in source control | Treat them as a prototype: adopt into a solution (or recreate under the org publisher) and codify lists in `/provisioning` ([backend-provisioning](backend-provisioning.md) §10) |
| AP-79 | Enabling Work IQ / MCP write tools tenant-wide "to see what happens" | Agents can then create lists, groups (sites) and plans on behalf of any licensed user, billed in Copilot Credits | Keep writes off by default; enable for named groups with a container-ownership policy and audit review |
| AP-80 | Measuring CMR adoption with the PPAC Power Apps analytics, the CoE kit or M365 usage reports, or summing daily users into "monthly users" | Those cover canvas / model-driven apps or Copilot Chat, not CMR apps, so adoption looks like zero; summed DAU double-counts people | MAC app **Usage** tab or its usage API with `timeGrain=month` for MAU; Application Insights for product analytics ([inventory-orphans-adoption](inventory-orphans-adoption.md) §3b) |

## Custom and non-curated connectors

See [connectors-and-policy](connectors-and-policy.md) → *Custom and non-curated connectors*.

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-81 | Hand-editing `ms.config.json` / `generated/` to get past a CLI connector block, or treating the add-time check as enforcement | The CLI check is client-side and fail-open and ignores DLP data groups. The service re-evaluates ACP **and** DLP on every deploy, so the result is 403 `AcpDlpPolicyEvaluation` (lab) | `ms connector list --only-allowed` in the **target** environment; get the connector allowed for the group; deploy to the target group early |
| AP-82 | Committing a custom connector's `.ms/schemas/…Schema.json` as generated | It embeds `apiDefinitions` swagger URLs with Azure Storage SAS tokens. Platform Git rejects the push (SecretsScan); another repo would store the token | Strip `properties.apiDefinitions` before every commit (pre-commit hook); GitHub push protection on |
| AP-83 | Taking full control of the **default** group's connector rule to unblock one app, or building production on a custom connector in the ACP allow-list | Full control stops Microsoft's updates for every maker. The docs say ACP doesn't support custom connectors yet, so the lab-observed allow may change. Removing an entry breaks the next deploy | A dedicated environment group for that team; custom connectors governed by classic DLP; save the policy JSON before any change |
| AP-84 | Expecting a custom-connector binding to carry across environments | The connector id has an environment-specific suffix. `ms.config.json` and the generated service point at one environment, and CMR apps have no connection references | Ship the connector in a managed solution; one app per stage (AP-52); rebind with `ms app add data-source` in each environment |
| AP-85 | Assuming codegen compiles for any connector's OpenAPI definition | Non-curated definitions produced non-compiling TypeScript (TS2300 / TS2304 / TS1016), so the cloud build fails | `npm run build` locally right after adding; `--skip-codegen` plus a thin `executeAsync` wrapper for the operations you need; fix the definition in the connector |

## Environments

See [governance-quick-ref](governance-quick-ref.md) → *Environments: where an app goes, and how to get one*.

| ID | Anti-pattern | Why | Instead |
|---|---|---|---|
| AP-88 | Running a team or business app from the maker's personal developer environment | It is the default target when `-e` is omitted. One maker is the environment admin, so the app is orphan-prone. There's no Dataverse, and stages (test, prod) can't be separated | Prototype there. Create the team app with `-e <team-environment-id>`: an environment in a governed group, with Dataverse if needed and ≥2 owners (AP-65) |
| AP-89 | Pointing `-e` at the Default environment or another ungrouped environment to get round connector or sharing limits | Creation succeeds there (lab), but the environment has no CMR group rules: ACP blocked 0 of ~1,300 connectors and share links worked. The Default environment is shared by every maker | Ask for the connector in a dedicated group ([connectors-and-policy](connectors-and-policy.md)); admins put every CMR environment in a group (AP-36) |
| AP-90 | Hard-coding environment IDs in templates, scripts or CI, or copying `ms.config.json` between stages or tenants | The ID is written into `ms.config.json` at create time and every later command uses it. A copied file silently deploys to the wrong environment or fails with exit 5 in another tenant | Pass `-e` from per-stage pipeline variables; one app per stage (AP-52); check `ms app info --json` before deploying |
| AP-91 | Provisioning an environment for CMR apps without a group, or scripting it with `pac admin create --region` or the BAP API | Without `parentEnvironmentGroup` it lands ungrouped (AP-36). In tenants that need macro regions, pac 2.10 ("macroRegion … is not valid") and BAP (`MacroRegionRequired`) fail (lab) | Power Platform API `POST …/environmentmanagement/provisioning/environments` with `macroRegion` and `parentEnvironmentGroup`, or the PPAC UI, then confirm the CLI-creation rule |
