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
| "Unable to determine the Dataverse organization URL" | env has no Dataverse | `--dataverse-environment-id <env-with-dataverse>`; delete the dangling connection |
| Ambiguous connection error (non-interactive) | >1 connection for connector | pass `-c <connection-id>` or `--use-sso` |
| `ms app create` fails: can't create | no routing rule / CLI creation disabled for your group | admin: routing + "Allow app creation with the CMR CLI" |
| `ms app create --repo <url>` fails | repo not empty / not GHEC / mapping expired | empty GHEC repo; `ms git auth refresh --repo <url>`; `--force-reauth` |
| `ms app clone` fails | external repo or `repoType none` | `git clone <external-url>`; none-apps have no repo |
| `git push` prompts / fails in agent shell (platform repo) | Git Credential Manager needs interactive OAuth | run push in a user terminal once, or use a bearer header for a single command (never persist tokens) |
| `git push` rejected: unrelated histories | remote has an "Initial commit" | `git pull --allow-unrelated-histories`, resolve, push |
| CRLF warnings on Windows | line endings | `.gitattributes` with `* text=auto eol=lf` |
| `--include-blocked` unknown | CLI drift | 0.27 lists all by default; use `--only-allowed` |
| `ms app show` deprecation | renamed | `ms app info` |

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

## Runtime (browser)

| Symptom | Likely cause | Fix |
|---|---|---|
| Consent dialog on first launch | expected — one per connection | minimise connectors; SSO connections |
| `CONNECTION_REFERENCE_NOT_FOUND` / `CONNECTION_NOT_FOUND` | config drift / user didn't consent / connection deleted | redeploy after `ms app refresh data-source`; user re-consents |
| `CONNECTION_CONFIG_FETCH_FAILED` | host/network or preview outage | retry with backoff; check status |
| Refused to load / connect (console CSP error) | CDN asset, `fetch` to external origin, worker, iframe, form | bundle assets; use connectors; admin CSP change (report-only first) |
| App blank, `sessionLoadSummary.unsuccessfulReason=AppForbidden` | user not shared / blocked by admin | `ms app share`; check MAC inventory block |
| `AppEntitlementIssue` | no Power Apps Premium / credits not configured | licensing (`cmr-licensing-cost`) |
| `AppIsInQuarantine` | admin quarantined/blocked app | admin, MAC → Apps |
| Data calls `success:false` with `403` | user lacks data-source permission or action blocked by updated policy | grant data permission; review policy change |
| Duplicate records on load | effect ran twice | idempotent effects |
| Work IQ returns string not JSON | SSE framing | parse SSE (`cmr-mcp-workiq`) |
| Local Play works, prod breaks | different CSP / origins between dev and host | test in preview URL before deploy |

## Sharing

| Symptom | Cause | Fix |
|---|---|---|
| `share link create` → 403 `AppShareLinkForbiddenForViralSharing` | default sharing rule blocks links | share with groups instead, or admin changes rule |
| `share list --access edit` → 401 | preview bug (observed 0.27.0) | use `ms app info` owners; retry later |
| SP share fails | passed client ID | use SP **object ID** |
