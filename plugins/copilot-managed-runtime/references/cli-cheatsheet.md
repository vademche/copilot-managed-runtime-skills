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
| `MS_CLI_ALM=true` | Unlocks preview ALM flags (`--deployment`, `add config`). |
| `MS_CLI_TELEMETRY_LOCATION` | Where buffered CLI telemetry is written. |

## Auth

```bash
ms auth login                 # interactive (browser / device code)
ms auth status                # "Signed in as <upn> (account ID: <oid>.<tenant-id>)"
ms auth switch                # pick another cached account
ms auth logout
ms git auth refresh --repo <github-url>   # external GitHub (GHEC) mapping, device-code flow
```

## Create / register / clone

```bash
ms app create -n "Contoso Expenses" ./contoso-expenses              # platform-managed Git (default)
ms app create -n "Contoso Expenses" -e <environment-id> ./app       # explicit environment
ms app create -n "Contoso Expenses" --repo https://github.com/contoso/expenses ./app  # external GHEC repo (must exist and be EMPTY)
ms app create -n "Contoso Expenses" --repo none ./app               # no Git; external artifact deploy (admin must allow)
ms app create -n "Contoso Expenses" -t github:contoso/cmr-templates/react-fluent ./app  # org golden template
ms app init -n "Existing SPA" --repo native                          # register an existing SPA in cwd
ms app clone --app <app-id> ./app                                    # platform-managed Git only; needs edit access
```

`--repo` choice is **fixed at creation**. Choose deliberately (see `cmr-create-app`).

## Connectors and data sources

```bash
ms connector list --json                         # 0.27.0: includes blocked; use --only-allowed to filter (docs say --include-blocked)
ms connector list-actions --connector office365users --json
ms app add data-source --connector office365users --as action --use-sso --non-interactive
ms app add data-source --connector sharepointonline --as table -c <conn-id> -d <site-url> -t <list-guid> --non-interactive
ms app add data-source --connector commondataserviceforapps --as table -c <conn-id> \
   --dataverse-environment-id <dataverse-env-id> -t account --non-interactive
ms app refresh data-source [-n <name>]           # schema changed (new column etc.)
ms app remove data-source -n <name> --force
ms app info                                      # config + bound resources (`ms app show` is deprecated in 0.27)
```

Discovery pattern for tabular connectors (each step exits **2** and prints the next choice):
`--as table` → lists **datasets** → add `-d` → lists **tables** → add `-t` → success.

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
ms app deploy [--commit <sha>]               # build (or reuse) + promote to LIVE
ms app deploy --force                        # dirty tree / local ahead of origin — avoid outside prototyping
ms app deploy --artifact ./app.zip           # repoType none only, admin-gated
ms app play --mode live|preview [--commit <sha>] --no-browser
```

URLs: live `https://<play-host>/apps/<app-id>`; preview `.../apps/<app-id>/branch/main`. Live changes only when you **deploy**.

## Share / inspect / manage

```bash
ms app share alice@contoso.com,team-sg@contoso.com --access play    # users or groups, csv
ms app share bob@contoso.com --access edit                           # co-maker (pro-dev handoff)
ms app share <sp-object-id> --access test                            # test operator (e.g. automation SP) — object ID, not client ID
ms app unshare alice@contoso.com [--access play|edit|test]           # each call touches one access level
ms app share list [--access play|edit]
ms app share link create | list | revoke      # blocked by default sharing rules (viral sharing)
ms app list --permission edit|play --json     # {appId, displayName, lastDeployedTime, appPlayUri, hasEditAccess, cloneUrl}
ms app info --json                            # server-side state: owners, last deployed commit, live/preview URLs
ms app get-settings
ms app set-setting --show-header false
ms app delete [--app <name>] [-e <env-id>] --force   # does NOT delete local code or the Git repo
```

## Telemetry (CLI)

```bash
ms telemetry status | enable | disable [--remote|--console]
```

## Preview ALM (only in tenants with managed projects)

```bash
MS_CLI_ALM=true ms app add config --deployment <name>
MS_CLI_ALM=true ms app add data-source --deployment <name> --for <data-source> ...
MS_CLI_ALM=true ms app deploy --deployment <name>
```

## Exit codes worth knowing

| Code | Meaning in practice |
|---|---|
| 0 | Success. |
| 2 | Missing input in a discovery flow (datasets/tables listed) or bad usage — read stdout, add the flag, rerun. |
| non-zero + `403` | Policy (sharing rule, connector blocked, external artifacts disabled, missing role). |
