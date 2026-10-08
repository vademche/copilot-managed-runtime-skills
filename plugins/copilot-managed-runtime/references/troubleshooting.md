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
| Connector missing / `403` on add | not on env-group allow-list or blocked by ACP/DLP | `ms connector list --search <name> --json` (check `isBlocked`); ask admin |
| Exit 2: `Connector '<name>' is blocked by your organization's connector policy.` | custom, third-party or independent-publisher connector not on the group's ACP list (the default) | curated alternative, or admin request ([connectors-and-policy](connectors-and-policy.md) → Custom and non-curated connectors); after an allow, wait ~1 min and retry |
| `Could not verify connector policy; proceeding without enforcement.` | CLI policy lookup failed; the add-time check is fail-open | deploy still enforces policy; check `ms auth status` |
| `git push` rejected: `SecretsScan: … Shared Access Signature … in .ms/schemas/…` | custom-connector schema embeds SAS swagger URLs (`properties.apiDefinitions`) | delete `properties.apiDefinitions` from that schema file, amend, push (AP-82) |
| Policy API `403 MicrosoftManagedRuleSetEditNotAllowed` | the group's connector rule is Microsoft-managed | MAC *Edit this policy* (full control) first, or use a dedicated group (AP-83) |
| "Unable to determine the Dataverse organization URL" | env has no Dataverse | `--dataverse-environment-id <env-with-dataverse>`; delete the dangling connection (portal or Connectivity API, see `cli-cheatsheet.md` → Cleaning up connections) |
| Ambiguous connection error (non-interactive) | >1 connection for connector | pass `-c <connection-id>` or `--use-sso` |
| `ms app create` fails: can't create | no routing rule / CLI creation disabled for your group | admin: routing + "Allow app creation with the CMR CLI" |
| 400 `Managed App creation from CLI is not enabled for environment '<id>'` | `-e` points at an environment where `ManagedApps_AppCreationFromCLI` is off | admin turns on "Allow app creation with the CMR CLI" for that environment or its group; or use another environment |
| Exit 5 `Could not reach environment <id>. Its endpoint did not resolve` | wrong or foreign environment ID, or wrong `--cloud` | check the ID (PPAC, `ms app info`), stage variables and `ms.config.json` (AP-90) |
| `Could not provision a Developer environment for your tenant (status …)` | no routing rule covers you (tenant has rules but no "Everyone" rule) or provisioning failed | admin adds you to a routed security group; or pass `-e` to an environment you're allowed to use |
| `Timed out waiting for a Developer environment to provision.` | first-time routing still provisioning | retry in a few minutes |
| `pac admin create` "macroRegion '…' is not valid" / BAP `MacroRegionRequired` | tenant requires macro regions | Power Platform API provisioning with `macroRegion` (governance-quick-ref → Environments) |
| `ms app create --repo <url>` fails | repo not empty (even a README/`.gitignore`) / not a GHEC org repo / bare-host URL / mapping expired | fresh empty private GHEC repo with full `https://` URL; `ms git auth refresh --repo <url>`; `--force-reauth` |
| `GitHubMappingMissing` / `GitHubMappingExpired` / `GitHubMappingStale` | per-user Entra↔GitHub mapping absent or expired | `ms git auth refresh --repo <url>` inside the app folder |
| `GitHubAuthDenied` / device code `UnprocessableEntity` | Managed Apps GitHub App declined or blocked by org policy / unsupported host | approve the app (org owner may need to allow it); check host is GHEC/`*.ghe.com` |
| `Environment id is required for ms git auth refresh` | ran outside an app folder | `cd` into the app |
| Teammate can't see preview of a `github` app | preview needs **write** on the GitHub repo | add them to the repo's write team ([source-control](source-control.md)) |
| `ms app clone` fails | external repo or `repoType none` | `git clone <external-url>`; none-apps have no repo |
| `git push` prompts / fails in agent shell (platform repo) | Git Credential Manager needs interactive OAuth; in non-interactive shells its browser flow can fail ("Missing 'code' in response") | push once from a user terminal; or get a token via an Entra **device-code** flow (client ID = the repo's `credential.<url>.oauthclientid` git config, scope `https://api.powerplatform.com/.default`) and push with `git -c credential.helper= -c "http.extraHeader=Authorization: Bearer <token>" push`. Start polling in the same process (codes expire in ~15 min), keep the token in memory/temp only, delete it after |
| `git push` rejected: unrelated histories | remote has an "Initial commit" | `git pull --allow-unrelated-histories`, resolve, push |
| `git fetch` → "warning: no common commits"; push rejected "fetch first" | same: the service creates the repo with its own README commit, unrelated to the `ms app create` scaffold | `git merge origin/main --allow-unrelated-histories -X ours`, then push |
| Platform git push → 403 with an Azure CLI token | `az account get-access-token` tokens aren't accepted by the platform git endpoint | use the repo's own OAuth client ID (device code, row above) |
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
| Portal (managed apps) shows the app as not published; Run and Edit unavailable | the app was created but never deployed | push, then `ms app deploy --non-interactive --json`; `ms app list --json` then shows `lastDeployedTime` |
| `npm run build` fails with TS2552 in `generated/services/PlannerService.ts` (`GetTaskDetails_Responsetype`, `UpdateTaskDetails_Requesttype`) | Planner actions codegen in ms 0.27 emits undefined type names; `refresh data-source --offline` doesn't fix it | `ms app remove data-source --name planner`, or call Planner through Graph from a backend; never edit `generated/` |
| `External artifact deployment is disabled` / `…is not enabled for this environment… AllowExternalArtifactDeployment` | `repoType none` / `--artifact` without admin opt-in | admin enables external artifacts |
| Deploy `403 AcpDlpPolicyEvaluation`: "…cannot be saved because one or more connectors it uses … are blocked by Advanced Connector Policy (ACP) or Data Policies (DLP)…" | `ViolationType: BlockedConnector` = connector not on the group's ACP list (also after an admin removed it); `BusinessAndNonBusinessConnector` = classic DLP data-group mix, not caught at add time | remove the data source, or get the policy changed; never hand-edit around it (AP-81) |
| `Build failed: BuildFailed: Command exited with code 2: npm run build` after adding a non-curated connector | its OpenAPI definition generated TypeScript that doesn't compile (TS2300 / TS2304 / TS1016) | `npm run build` locally; re-add with `--skip-codegen` and wrap `executeAsync`; or drop the broken generated files (AP-85) |
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
| `share link create` → 403 `AppShareLinkForbiddenForViralSharing` | the environment group's sharing rule blocks links (the default group does; an ungrouped env allowed them in the lab) | share with groups instead, or admin changes rule |
| `share link revoke --link-id <id>` → "Provide a share link ID via --link-id." | CLI bug in 0.27: the ID is never read (`-l`, `=`, positional and `MAAF_SHARE_LINK_ID` fail too) | `DELETE https://<env-host>/appframework/apps/<app-id>/shareLinks/<id>?api-version=1` with a Power Platform API token: 204, then 404 `AppShareLinkNotFound` |
| `share list --access edit` → 401 | transient preview issue (seen once in 0.27.0; worked later) | retry; or `ms app list --permission edit` as the co-owner |
| `share --access test` → 400 `FeatureNotEnabled` | the test operator role exists only in non-production validation environments | use `play` for automation identities elsewhere |
| Share → 400 "group is not security-enabled" | Microsoft 365 (non-security) group | use an Entra security group |
| Share → 400 "Sharing failed for: x (user or group not found). No permissions were changed." | one bad principal in a comma-separated batch; batches are atomic | fix or drop that principal and re-run the whole batch |
| `unshare` succeeds but `revokedCount: 0`, principal in `notFound` | wrong `--access` level for that principal | unshare at the level they hold (AP-87) |
| SP share fails | passed client ID | use SP **object ID** |

## Inventory, admin APIs and MCP provisioning

| Symptom | Cause | Fix |
|---|---|---|
| Admin can't see a citizen's app in `ms app list` | the list is RBAC-scoped (only apps shared with you) | inventory API / MAC → All apps ([inventory-orphans-adoption](inventory-orphans-adoption.md)) |
| `Get-AdminPowerApp` / Power Apps admin API → `404 ApplicationNotFound` for a CMR app | that API covers canvas and code apps, not CMR apps | inventory API; no owner reassignment for CMR apps in preview |
| Deleted app's source still clonable / repo still listed | `ms app delete` doesn't delete the native Git repo | `DELETE …/appframework/git/repositories/<repository-id>` (AP-94) |
| No connection appears after `ms app add data-source --use-sso` for an action connector | none is created at design time (lab); it's bound when the user consents at runtime **[inferred]** | expected; check the app runs and prompts for consent |
| `getUser()` has no UPN / `getContext().user` is `undefined` | CMR exposes only `fullName`, `objectId`, `tenantId`; code-app habits (AP-92) | use `objectId` as the key; look up UPN with an Office 365 Users data source if needed |
| Inventory query → `403` | service principal, or user lacks Power Platform admin / Global Reader | delegated admin token |
| Inventory query returns 0 rows, `resultTruncated: 1` | `Options.Top` used | use a `take` clause and page with `skipToken` |
| Tenant `/appframework/apps` or `/locate` → `403 InsufficientDelegatedPermissions` | those scopes are only granted to the `ms` CLI client | use `ms app info --app <app-id>` (resolves the environment itself) |
| Calling a connector runtime URL directly → `400` "Bad authorization header scheme" | wrong token audience | token for `https://apihub.azure.com` |
| Work IQ connection stays `Unauthenticated` | OAuth/SSO connector; consent is interactive | the user consents on first launch of the app |
| Dataverse MCP `update_table` / `delete_table` → "staged metadata … still being processed" | async metadata processing after create | wait and retry; verify the final state, a timed-out call may still have succeeded |
| MCP-created table is in the Default solution with a `cr<xxx>_` prefix | `create_table` has no solution/publisher parameter | adopt into a solution or recreate under the org publisher (AP-78) |
