# `ms.config.json` reference

Owned by the CLI and SDK. **Do not hand-edit** — use `ms app add/remove/refresh data-source`, `ms app set-setting`, etc. Read it freely (agents should read it to understand the app). Commit it.

## Annotated example (anonymised, ms 0.27.0)

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/microsoft/Managed-Apps/main/schemas/ms.config.schema.json",
  "version": "0.0",
  "appId": "<app-id>",
  "appDisplayName": "Contoso Expenses",
  "environmentId": "<environment-id>",          // where the app lives (usually the maker's personal dev env)
  "description": "Submit and approve expenses",
  "repoType": "native",                          // native (platform Git) | github | none
  "repositoryId": "<repository-id>",
  "cloud": "public",
  "buildPath": "./dist",
  "buildCommand": "npm run build",
  "buildEntryPoint": "index.html",
  "connectionReferences": {
    "<connection-reference-id>": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_office365users",
      "displayName": "Office 365 Users",
      "dataSources": ["office365users"],
      "authenticationType": "..."                // present for SSO connections
    },
    "<connection-reference-id-2>": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
      "displayName": "SharePoint",
      "dataSources": ["expenses"],
      "dataSets": {
        "https://contoso.sharepoint.com/sites/finance": {
          "dataSources": { "expenses": { "tableName": "<list-guid>" } }
        }
      }
    },
    "<connection-reference-id-3>": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
      "displayName": "Microsoft Dataverse",
      "dataSources": ["accounts"],
      "dataSets": { "https://<org>.crm.dynamics.com": { "dataSources": { "accounts": { "tableName": "accounts" } } } },
      "dataverseTables": {
        "account": { "environmentId": "<dataverse-environment-id>", "logicalName": "account", "entitySetName": "accounts" }
      }
    }
  }
}
```

## All schema properties (schema as of ms 0.27.0)

`$schema`, `version`, `appId`, `projectId` (set when the app was created inside a managed project, see `cmr-alm-cicd`), `appDisplayName`, `description`, `environmentId`, `buildPath`, `buildCommand`, `buildEntryPoint`, `buildType` (`build|none`), `iconPath`, `localAppUrl`, `cloud` (`public|usgov|usgovhigh|usgovdod|china`, plus internal `test|preprod`), `repositoryId`, `repoType` (`native|github|none`), `externalRepoUrl`, `connectionReferences`, `appSettings` (`showHeader` is the only setting in 0.27 and defaults to `true`), and three **undocumented / forward-looking** properties:

| Property | Shape | Status |
|---|---|---|
| `data` (legacy alias `db`) | `{ schemaPath }` | Hints at app-owned data with service-run migrations (`ms app deploy` help mentions "app data migration"). Not documented — don't rely on it yet. |
| `functions` | `{ baseDirectory }` | Server functions; **undocumented**. In ms 0.27 (lab), `ms app pack` bundles every `*.ts` under the folder (not `.d.ts` / `.test.ts` / `.spec.ts`) with esbuild (ESM, es2022, platform `neutral`) into `functions.zip`. It routes each file at `/<folder>/<path-without-.ts>`. Imports are allow-listed: relative, `generated/*` and `@microsoft/managed-apps/data`; anything else fails with `allowlist-imports`. The deploy succeeded, but calls returned `501 MiddleTierRequestsNotSupported` (AP-97). |
| `hasCustomMiddleTier` | boolean | Set to `true` in the packed manifest automatically when `functions` is present. Not documented. |

Agents: if you see these in a repo, preserve them and ask the owner; don't invent values.

## What is (not) secret

- No secrets live here: IDs, URLs and connection *references* only. Connections themselves are per-user and stored in the platform.
- It *does* reveal tenant topology (environment ids, SharePoint site URLs, Dataverse org URL). Treat the repo as internal; never publish a real `ms.config.json` in public samples — anonymise like above.

## Related files

| Path | Commit? | Notes |
|---|---|---|
| `ms.config.json` | ✅ | source of truth for bindings |
| `ms.project.config.json` | ✅ | only in managed-project folders (preview): `projectId`, `displayName`, `repositoryId`, `repoType`, `environmentId`, `components.apps[]` |
| `generated/` | ✅ | typed services; regenerate, don't edit |
| `.ms/schemas/` | ✅ | connector schemas used by codegen |
| `.ms/packed/` | ❌ | `ms app pack` staging (gitignored by template) |
| `ms.prod.config.json` | (generated in pack) | appears in packed output |

Schema: `https://raw.githubusercontent.com/microsoft/Managed-Apps/main/schemas/ms.config.schema.json` — validate in CI with any JSON-schema validator.
