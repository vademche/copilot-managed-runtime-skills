---
name: cmr-data-sources
description: Choose, bind, refresh and remove connector data sources (SharePoint lists/libraries, Excel, Office 365 Users/Outlook/Teams, SQL, custom or third-party connectors) in a Copilot Managed Runtime app, and wrap the generated services safely. USE WHEN adding a connector, binding a SharePoint list or Excel table, picking a data store, or seeing exit code 2 from `ms app add data-source`. DO NOT USE WHEN the data source is Dataverse (use cmr-dataverse) or an MCP server such as Work IQ (use cmr-mcp-workiq).
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
---

# Connector data sources

## 1. Choose the store (decision tree)

1. Business records with relations, security roles, auditing, >5k rows → **Dataverse** (`cmr-dataverse`).
2. Lightweight lists owned by a team, <5k rows, M365-native sharing → **SharePoint list**.
3. Documents/files → **SharePoint document library** (bound as a table) or OneDrive.
4. People/profile/org chart → **Office 365 Users** (action connector).
5. Mail/calendar/Teams posts → **Office 365 Outlook / Teams** (action connectors; mind blocked actions).
6. Natural-language over M365 → **Work IQ MCP** (`cmr-mcp-workiq`).
7. Existing line-of-business DB or API, third-party SaaS → SQL Server, third-party or custom connector. These are **blocked in the default CMR group**; see §6.
8. **Excel as a database → avoid** for multi-user writes (locking, no row security).

Check what is allowed first: the env group's connector + MCP allow list (`ms connector list-actions --connector <id>` in the **target** environment; environments outside any group may allow far more than production will). See [connectors-and-policy](../../references/connectors-and-policy.md).

## 2. Discover → bind (the exit-2 loop)

`ms app add data-source` is discovery-driven. When a required value is missing it exits **2** and prints/returns the valid choices. Agents loop until success:

```bash
ms connector list --only-allowed --json                    # connector ids allowed by policy
ms connector list-actions --connector shared_sharepointonline --json   # behavior: Allow|Block per action
ms app add data-source --connector shared_sharepointonline --as table --use-sso --non-interactive --json
#   → creates/reuses an SSO connection, exit 2 + list of datasets (site URLs)
ms app add data-source --connector shared_sharepointonline --as table -c <conn-id> -d "https://contoso.sharepoint.com/sites/<site>" --non-interactive --json
#   → exit 2 + list of tables (list/library GUIDs + display names)
ms app add data-source --connector shared_sharepointonline --as table -c <conn-id> -d "https://contoso.sharepoint.com/sites/<site>" -t <list-guid> --non-interactive --json
#   → success: ms.config.json updated + generated/services/<Name>Service.ts
```

`-c` is the **connection id**; `--connector` is the connector id. Action connectors (Office 365 Users etc.) don't need `-d`/`-t`: `ms app add data-source --connector shared_office365users --as action --use-sso --non-interactive --json`. Output like "Skipped 1 of 19 actions due to policy" means blocked actions were not generated — expected.

Rules:
- Prefer `--use-sso` (single sign-on connection) where the connector supports it — fewer consent prompts.
- **Never** reuse another person's connection; connections are per user and brokered at runtime.
- Ask the user to choose when more than one dataset/table matches — don't guess.
- Commit `ms.config.json` **and** `generated/` together; review the generated diff (re-running codegen can regenerate other services too).
- Adding a connector to a **live** app means every user gets the consent dialog again on their next launch, listing all connections. Batch additions into one release and tell users beforehand.

## 3. Refresh / remove

```bash
ms app refresh data-source -n <name>          # after list schema changes (new columns)
ms app remove data-source -n <name> --force
```

## 4. Wrap generated services (mandatory pattern)

Only `src/data/*` imports from `generated/`. UI gets plain domain types and thrown `AppError`s.

```ts
// src/data/documents.ts
import { DocumentsService } from '../../generated/services/DocumentsService'; // tabular non-Dataverse = named export
import { unwrap } from './result';

export async function listRecentDocuments(top = 50) {
  const res = await DocumentsService.getAll({ top, orderBy: ['Modified desc'], select: ['ID', 'Title', 'Modified'] });
  return unwrap(res, 'documents.list');
}
```

```ts
// src/data/result.ts
import type { IOperationResult } from '@microsoft/managed-apps/data';
export class AppError extends Error { constructor(msg: string, public code?: string, public op?: string) { super(msg); } }
export function unwrap<T>(r: IOperationResult<T>, op: string): T {
  if (!r.success) throw new AppError(r.error?.message ?? 'Request failed', (r.error as any)?.code, op);
  return r.data as T;
}
```

Known codegen gap: tabular `delete()` returns `Promise<void>` and **swallows failures**. If delete outcome matters, call the data client directly (`getClient(dataSources).deleteRecordAsync(...)`) and check `success` — see [generated-code](../../references/generated-code.md).

## 5. SharePoint specifics

- Column internal names differ from display names (`Title`, `field_1`). Codegen uses the internal name, so a column shown as *Status* may be `RequestStatus` in code. Read the generated model.
- Choice / person columns are written via `'<Col>#Id'` / `'<Col>#Claims'` and read as `*Value` objects.
- Creating the list or library itself is a design-time job (Graph script). See `cmr-backend-provisioning`. The app can't create lists (HTTP request action is blocked).
- Use `select` and `top`; paginate with `skipToken`. Index filtered columns on lists >5k items.
- Document library rows are metadata; file content needs the action connector operations.
- Permissions are SharePoint's — the app cannot widen them (good; don't try).

## 6. Custom and non-curated connectors

Custom (OpenAPI / API Management), certified third-party, independent-publisher, non-Entra-auth and gateway connectors are outside the curated list. Full matrix and error strings: [connectors-and-policy](../../references/connectors-and-policy.md) → *Custom and non-curated connectors*.

1. **Check the target environment first.** Run `ms connector list --search <name> --json`. If it shows `isBlocked: true`, or `ms app add data-source` exits 2 with "…is blocked by your organization's connector policy.", stop. Offer a curated alternative, or send the admin request from `cmr-governance-admin` §3. Don't hand-edit the binding in: deploy re-checks ACP and DLP and fails with 403 `AcpDlpPolicyEvaluation` (AP-81).
2. **No `ms` command creates a connector.** The connector must already exist in the environment (maker portal, `pac connector create`, or a solution). Then bind it with `ms app add data-source --connector "<name>" --as action --non-interactive`.
3. **Before committing a custom connector**, remove `properties.apiDefinitions` from `.ms/schemas/<connector>/*.Schema.json`. It holds SAS URLs and the platform Git rejects the push with `SecretsScan` (AP-82). Repeat after every add or refresh.
4. **Build locally** (`npm run build`) right after adding. Non-curated OpenAPI definitions can generate TypeScript that doesn't compile. If so, re-add with `--skip-codegen` and wrap the few operations you need with `getClient(dataSources).executeAsync({ connectorOperation: { tableName, operationName, parameters } })` in `src/data/*` (AP-85).
5. Custom-connector ids are environment-specific: rebind in each stage (AP-84). Never fall back to `fetch` plus a CSP exception (AP-20).

## Anti-patterns

AP-11, AP-12, AP-20, AP-21, AP-22, AP-23, AP-24, AP-26, AP-27, AP-81, AP-82, AP-84, AP-85. See [anti-patterns](../../references/anti-patterns.md).
