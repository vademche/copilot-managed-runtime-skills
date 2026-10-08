# `ms` CLI cheat sheet (Copilot Managed Runtime)

> Package: `@microsoft/managed-apps-cli` (binary `ms`). Verified hands-on with **ms 0.27.0 (preview)**.
> Flags drift between preview releases — when a flag in this sheet fails, run `ms <command> --help` and trust the CLI over this file.

## Install / version

```bash
npm install -g @microsoft/managed-apps-cli   # or use the project-local devDependency via npx ms
ms --version
ms <command> --help                          # authoritative flag list for the installed version
```

## Global flags (every command)

| Flag | Use |
|---|---|
| `--json` | Machine-readable output. **Always use in agents/scripts.** |
| `--non-interactive` | Never prompt; fail with a message listing what is missing. **Always use in agents/CI.** |
| `--no-color` | Plain output for logs. |
| `--cloud public\|usgov\|usgovhigh\|usgovdod\|china` | Sovereign clouds. Persisted in `ms.config.json` as `cloud`. |

## Environment variables

| Variable | Purpose |
|---|---|
| `MS_CLI_SP_CLIENT_ID`, `MS_CLI_SP_CLIENT_SECRET`, `MS_CLI_SP_TENANT_ID` | Service-principal auth (CI). |
| `MS_CLI_USE_SP_AUTH=true` | Force SP auth (auto-on when `CI=true` and SP vars exist). |
| `MS_CLI_CLOUD_INSTANCE` | Cloud override used by the GitHub Actions. |
| `MS_CLI_ALM=true` | Unlocks preview ALM flags (`--deployment`, `add config`) **and the hidden `ms project` command group**. |
| `MS_CLI_TELEMETRY_LOCATION` | Where buffered CLI telemetry is written. |
| `MS_CLI_MAAF_DEPLOY_VIA_MANAGED_DEVOPS=2\|3` | Routes `ms app deploy` through the managed-DevOps pipeline; with `--no-wait` returns an operation ID instead of blocking. Undocumented — don't depend on it in CI. |
| `MS_CLI_HTTP_FORWARD_HEADERS`, `MS_CLI_MAAF_DEBUG_ENVIRONMENT_ID`, `MS_CLI_MAAF_GRS_ENDPOINT_OVERRIDE` | Internal / debugging hooks found in the CLI bundle (0.27). Never set them in shared scripts. |

## Auth

```bash
ms auth login                 # interactive (browser / device code)
ms auth status                # "Signed in as <upn> (account ID: <oid>.<tenant-id>)"
ms auth switch                # pick another cached account
ms auth logout
ms git auth refresh --repo <github-url>   # external GitHub (GHEC) mapping, device-code flow; run inside app folder; mapping expires (see source-control.md)
```

## Create / register / clone

```bash
ms app create -n "Contoso Expenses" ./contoso-expenses              # platform-managed Git (default)
ms app create -n "Contoso Expenses" -e <environment-id> ./app       # explicit environment (otherwise: routed personal developer env, no Dataverse)
ms app create -n "Contoso Expenses" --repo https://github.com/contoso/expenses ./app  # external GHEC repo (must exist and be EMPTY)
ms app create -n "Contoso Expenses" --repo none ./app               # no Git; external artifact deploy (admin must allow)
ms app create -n "Contoso Expenses" -t github:contoso/cmr-templates/react-fluent ./app  # org golden template
ms app init -n "Existing SPA" --repo native                          # register an existing SPA in cwd
ms app clone --app <app-id> ./app                                    # platform-managed Git only; needs edit access; no -e needed
ms app info --app <app-id> --json                                    # any app you can access, from outside its folder; resolves the environment
```

The app ID is the last segment of the play URL. `ms app list` only shows apps shared with you; for a tenant-wide inventory see [inventory-orphans-adoption](inventory-orphans-adoption.md).

`--repo` choice is **fixed at creation**. Choose deliberately (see `cmr-create-app`).

Environment: the ID chosen at create time is stored in `ms.config.json`; every command accepts `-e` to override it. Without `-e`, `create` resolves the personal developer environment through routing. There's no `ms` command to list or create environments; see [governance-quick-ref](governance-quick-ref.md) → *Environments*.

## Connectors and data sources

```bash
ms connector list --json                         # 0.27.0: includes blocked (`isBlocked`, ACP only, not classic DLP); --only-allowed filters; --search <text> (docs say --include-blocked)
ms connector list-actions --connector office365users --json   # `behavior` shows ACP and classic DLP action rules (DLP ones aren't enforced, AP-98)
ms app add data-source --connector office365users --as action --use-sso --non-interactive
ms app add data-source --connector "<custom connector name>" --as action --non-interactive   # custom connectors bind like any action connector (ms can't create them)
ms app add data-source --connector <id> --as action --skip-codegen --non-interactive         # no generated service (e.g. broken OpenAPI); wrap executeAsync yourself
ms app add data-source --connector sharepointonline --as table -c <conn-id> -d <site-url> -t <list-guid> --non-interactive
ms app add data-source --connector commondataserviceforapps --as table -c <conn-id> \
   --dataverse-environment-id <dataverse-env-id> -t account --non-interactive
ms app refresh data-source [-n <name>]           # schema changed (new column etc.)
ms app remove data-source -n <name> --force
ms app info                                      # config + bound resources (`ms app show` is deprecated in 0.27)
```

Discovery pattern for tabular connectors (each step exits **2** and prints the next choice):
`--as table` → lists **datasets** → add `-d` → lists **tables** → add `-t` → success.

Custom connectors: delete `properties.apiDefinitions` from `.ms/schemas/<connector>/*.Schema.json` before committing (SAS URLs → `SecretsScan` push rejection). The add-time policy check is advisory; `ms app deploy` is where ACP/DLP is enforced ([connectors-and-policy](connectors-and-policy.md)).

## Develop

```bash
ms app dev                                   # with @microsoft/managed-apps-vite-plugin: vite on :5173 + Local Play URL
ms app dev -l http://localhost:3000 -p 8080  # non-plugin setups: your dev server + config server
ms app dev --config-only                     # you run the dev server yourself
```

## Build / deploy / play

```bash
ms app pack                                  # local build + stage to .ms/packed/ (no upload) — use as a pre-flight
git push                                     # Git-backed apps build from COMMITS, not your working tree
ms app build --commit <sha> [--no-wait]      # cloud build (~30–60 s)
ms app build-status --commit <sha> --show-log
ms app deploy [--commit <sha>]               # build (or reuse) + promote to LIVE ("publish"; until the first deploy the portal shows the app as not published)
ms app deploy --force                        # dirty tree / local ahead of origin — avoid outside prototyping
ms app deploy --artifact ./app.zip           # repoType none only, admin-gated
ms app play --mode live|preview [--commit <sha>] --no-browser
```

URLs: live `https://<play-host>/apps/<app-id>`; preview `.../apps/<app-id>/branch/main`. Live changes only when you **deploy**.

## Share / inspect / manage

```bash
ms app share alice@contoso.com,team-sg@contoso.com --access play    # users or groups, csv
ms app share bob@contoso.com --access edit                           # co-maker (pro-dev handoff)
ms app share <sp-object-id> --access test                            # test operator — only in non-production validation envs (else 400 FeatureNotEnabled)
ms app unshare alice@contoso.com [--access play|edit|test]           # one level per call; wrong level = success with revokedCount 0
ms app share list [--access play|edit|test]                          # roles: MicrosoftAppReader / RepositoryContributor / MicrosoftAppTestOperator
ms app share link create | list               # grants MicrosoftAppReader on redemption; blocked where the group's sharing rule forbids links
ms app share link revoke --link-id <id>       # broken in 0.27; REST DELETE <env-host>/appframework/apps/<app-id>/shareLinks/<id>?api-version=1
ms app list --permission edit|play --json     # {appId, displayName, lastDeployedTime, appPlayUri, hasEditAccess, cloneUrl}
ms app info --json                            # server-side state: owners, last deployed commit, live/preview URLs
ms app get-settings [--json]
ms app set-setting --show-header false        # writes appSettings.showHeader; applies on next dev/deploy (see note)
ms app delete [--app <name>] [-e <env-id>] --force   # soft-delete; does NOT delete local code, the Git repo (AP-94), or your connections
```

**`--show-header false` (verified, 0.27):** `showHeader` is the only app setting in the 0.27 schema. After deploy, the host header bar (home button + user avatar) disappears from the running app, but the host **loading screen** ("Fetching your app…") still shows it. Hiding it means your app must provide its own navigation, user identity (`getUser()`), and a way back to the app list. Commit `ms.config.json`, then deploy.

## Cleaning up connections

`ms app delete` and `ms app remove data-source` leave your **connections** in place, and the CLI has no command to delete them. Remove them in the maker portal (**Connections**), or call the Power Platform API with a token for `https://api.powerplatform.com` (scope `Connectivity.Connections.Write`):

```bash
GET    https://api.powerplatform.com/connectivity/environments/<env-id>/connections?api-version=1
DELETE https://api.powerplatform.com/connectivity/environments/<env-id>/connectors/<connector-id>/connections/<connection-name>?api-version=1
#      connector-id e.g. shared_sharepointonline; the flat .../connections/<name> DELETE route returns 404 RouteNotFound
```

Delete only connections you created for the app; other apps, flows or agents may share them.

## Telemetry (CLI)

```bash
ms telemetry status | enable | disable [--remote|--console]
```

## Preview ALM (only in tenants with managed projects)

`MS_CLI_ALM=true` reveals a hidden **`ms project`** group (not in `ms --help` otherwise):

```bash
MS_CLI_ALM=true ms project create ./field-service --display-name "Field Service" [-e <env-id>]  # managed project + platform repo, writes ms.project.config.json
MS_CLI_ALM=true ms project info [--project-id <id>] [--json]                                     # project and its apps
# then run `ms app create` INSIDE the project folder: the app gets projectId and is listed under components.apps
```

Observed (0.27, public cloud, test tenant): `ms project create` returned **404 `RouteNotFound`** on `/managedprojects/projects`, so the service-side API was not yet rolled out and nothing was created. There is **no `ms project delete`**. Check `ms project info` before you plan on overlays; if the route 404s, use separate apps per stage.

```bash
MS_CLI_ALM=true ms app add config --deployment <name>
MS_CLI_ALM=true ms app add data-source --deployment <name> --for <data-source> ...
MS_CLI_ALM=true ms app deploy --deployment <name>
```

## Dataverse schema alongside the app (`pac`)

CMR apps are not solution components, but the tables they bind to are. Keep the schema in an **unmanaged solution in dev** and ship it **managed** (see [solutions-and-alm](solutions-and-alm.md)).

```bash
pac solution clone  --name ContosoFieldRequests --outputDirectory dataverse          # first time: .cdsproj + src/
pac solution sync   --solution-folder dataverse/ContosoFieldRequests                  # pull later dev changes
pac solution pack   --zipfile out/ContosoFieldRequests_managed.zip --folder dataverse/ContosoFieldRequests/src --packagetype Managed
pac solution import --path out/ContosoFieldRequests_managed.zip --stage-and-upgrade   # target env, before `ms app deploy`
ms app refresh data-source -n <table>                                                 # after schema changes; expect a clean generated/ diff
```

## Exit codes worth knowing

| Code | Meaning in practice |
|---|---|
| 0 | Success. |
| 2 | Missing input in a discovery flow (datasets/tables listed) or bad usage — read stdout, add the flag, rerun. |
| non-zero + `403` | Policy (sharing rule, connector blocked, external artifacts disabled, missing role). |
