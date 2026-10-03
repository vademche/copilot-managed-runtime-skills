# Troubleshooting matrix

Start every investigation with:

```bash
ms --version && ms auth status
ms app info --json            # server view: owners, env, last deployed commit, URLs
ms app build-status --commit $(git rev-parse HEAD) --show-log
```

Collect `host.sessionId` (from `getContext()`) and any `error.requestId` from `IOperationResult` for support.

## CLI / authoring

| Symptom | Likely cause | Fix |
|---|---|---|
| `ms` hangs in an agent/CI shell | interactive prompt / device code | add `--non-interactive`; use SP env vars in CI |
| Exit code 2 listing datasets or tables | discovery flow needs `-d` / `-t` | rerun with the printed value |
| "Skipped N of M actions due to policy" | blocked actions (HTTP, script, Custom API) | expected; use purpose-scoped actions |
| Connector missing / `403` on add | not on env-group allow-list or blocked by ACP/DLP | `ms connector list --json` (check allowed flag); ask admin |
| "Unable to determine the Dataverse organization URL" | env has no Dataverse | `--dataverse-environment-id <env-with-dataverse>`; delete the dangling connection (portal or Connectivity API, see `cli-cheatsheet.md` → Cleaning up connections) |
| Ambiguous connection error (non-interactive) | >1 connection for connector | pass `-c <connection-id>` or `--use-sso` |
| `ms app create` fails: can't create | no routing rule / CLI creation disabled for your group | admin: routing + "Allow app creation with the CMR CLI" |
| `ms app create --repo <url>` fails | repo not empty (even a README/`.gitignore`) / not a GHEC org repo / bare-host URL / mapping expired | fresh empty private GHEC repo with full `https://` URL; `ms git auth refresh --repo <url>`; `--force-reauth` |
| `GitHubMappingMissing` / `GitHubMappingExpired` / `GitHubMappingStale` | per-user Entra↔GitHub mapping absent or expired | `ms git auth refresh --repo <url>` inside the app folder |
| `GitHubAuthDenied` / device code `UnprocessableEntity` | Managed Apps GitHub App declined or blocked by org policy / unsupported host | approve the app (org owner may need to allow it); check host is GHEC/`*.ghe.com` |
| `Environment id is required for ms git auth refresh` | ran outside an app folder | `cd` into the app |
| Teammate can't see preview of a `github` app | preview needs **write** on the GitHub repo | add them to the repo's write team ([source-control](source-control.md)) |
| `ms app clone` fails | external repo or `repoType none` | `git clone <external-url>`; none-apps have no repo |
| `git push` prompts / fails in agent shell (platform repo) | Git Credential Manager needs interactive OAuth; in non-interactive shells its browser flow can fail ("Missing 'code' in response") | push once from a user terminal; or get a token via an Entra **device-code** flow (client ID = the repo's `credential.<url>.oauthclientid` git config, scope `https://api.powerplatform.com/.default`) and push with `git -c credential.helper= -c "http.extraHeader=Authorization: Bearer <token>" push`. Start polling in the same process (codes expire in ~15 min), keep the token in memory/temp only, delete it after |
| `git push` rejected: unrelated histories | remote has an "Initial commit" | `git pull --allow-unrelated-histories`, resolve, push |
| CRLF warnings on Windows | line endings | `.gitattributes` with `* text=auto eol=lf` |
| `--include-blocked` unknown | CLI drift | 0.27 lists all by default; use `--only-allowed` |
| `ms app show` deprecation | renamed | `ms app info` |
| `ms project` unknown command | hidden behind preview flag | `MS_CLI_ALM=true` |
| `ms project create` → `404 RouteNotFound` (`/managedprojects/projects`) | managed-projects API not rolled out to the tenant/region | use separate apps per stage; retry on newer CLI/service |

## Build / deploy

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy warns about uncommitted changes / local ahead | cloud builds from the **pushed commit** | commit + push; `--force` only for throwaway prototypes |
| Build failed | TS errors, missing deps, wrong `buildPath` | `ms app pack` locally first; `build-status --show-log` |
| Live app didn't change after push | live only changes on deploy | `ms app deploy`; check `ms app info` last deployed commit |
| `External artifact deployment is disabled` | `repoType none` / `--artifact` without admin opt-in | admin enables external artifacts |
| CI: `Repositories.MicrosoftApps.Deploy.Write` forbidden | SP lacks env role | Dataverse env: app user with System Administrator/Customizer; else EnvironmentAdmin via BAP role assignment |
| CI: `400 Principal not found` | used client ID where object ID is needed | Enterprise apps → **object ID** |
| CI: `ms.config.json not found` | wrong `working-directory` | set the action input |
| CI deploy "succeeds" but app unchanged | `cloud` input defaulted to `test` | `cloud: prod` |
| Dataverse Web API `0x80060888` / column create fails right after table create | metadata not yet published or propagated | wait and retry with backoff; create columns after the table call returns (see [backend-provisioning](backend-provisioning.md)) |
| `generated/` differs between stages after rebind | schema drift: table recreated by hand with a different prefix or choice values | ship the schema as a managed solution ([solutions-and-alm](solutions-and-alm.md)) |
| A team env allows connectors that the dev env blocked | env isn't in a governed environment group, so the curated list doesn't apply | add the env to a governed group; keep a tenant DLP as the backstop |

## Runtime (browser)

| Symptom | Likely cause | Fix |
|---|---|---|
| Consent dialog on first launch | expected — one per connection | minimise connectors; SSO connections |
| Consent dialog **reappears** for all users after a deploy | a data source/connection was added: the dialog lists every connection again | batch connector additions; warn users in release notes |
| Header bar still visible after `set-setting --show-header false` | not deployed yet, or you're looking at the host loading screen (always shows it) | commit + `ms app deploy`; check the loaded app |
| `CONNECTION_REFERENCE_NOT_FOUND` / `CONNECTION_NOT_FOUND` | config drift / user didn't consent / connection deleted | redeploy after `ms app refresh data-source`; user re-consents |
| `CONNECTION_CONFIG_FETCH_FAILED` | host/network or preview outage | retry with backoff; check status |
| Refused to load / connect (console CSP error) | CDN asset, `fetch` to external origin, worker, iframe, form | bundle assets; use connectors; admin CSP change (report-only first) |
| App blank, `sessionLoadSummary.unsuccessfulReason=AppForbidden` | user not shared / blocked by admin | `ms app share`; check MAC inventory block |
| `AppEntitlementIssue` | no Power Apps Premium / credits not configured | licensing (`cmr-licensing-cost`) |
| `AppIsInQuarantine` | admin quarantined/blocked app | admin, MAC → Apps |
| Data calls `success:false` with `403` | user lacks data-source permission or action blocked by updated policy | grant data permission; review policy change |
| Duplicate records on load | effect ran twice | idempotent effects |
| Work IQ returns string not JSON | SSE framing | parse SSE (`cmr-mcp-workiq`) |
| Dataverse MCP returns `403` "not authorized to access MCP" | the client isn't in the environment's Dataverse MCP allowed clients | admin adds the client in PPAC → environment → Features → Dataverse MCP |
| Local Play works, prod breaks | different CSP / origins between dev and host | test in preview URL before deploy |

## Sharing

| Symptom | Cause | Fix |
|---|---|---|
| `share link create` → 403 `AppShareLinkForbiddenForViralSharing` | default sharing rule blocks links | share with groups instead, or admin changes rule |
| `share list --access edit` → 401 | preview bug (observed 0.27.0) | use `ms app info` owners; retry later |
| SP share fails | passed client ID | use SP **object ID** |
