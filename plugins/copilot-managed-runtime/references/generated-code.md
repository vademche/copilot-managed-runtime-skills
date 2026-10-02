# Generated code shapes (`generated/`)

`ms app add data-source` writes typed models + services to `generated/` (repo root) and raw schemas to `.ms/schemas/`. **Never hand-edit either** — regenerate with `ms app refresh data-source`. Commit both so builds and reviews are reproducible.

```
generated/
  index.ts            # export * as XModel ...; export * from './services/XService'
  dataSources.ts      # DataSourcesInfo passed to getClient()
  models/*.ts         # Read/Write/Base interfaces, option-set consts
  services/*.ts       # static service classes
.ms/schemas/<connector>/...   # commit
.ms/packed/                   # build staging — gitignored
```

Shapes differ **by connector family** (verified, ms 0.27.0):

## 1. Action connectors (Office 365 Users, Outlook, Teams, Work IQ MCP, …)

```ts
import { Office365UsersService } from '../generated';

const r = await Office365UsersService.MyProfile_V2('displayName,mail,jobTitle');
if (!r.success) throw toAppError(r.error);
```

- Static methods named after the connector **operationId** (`MyProfile_V2`, `SearchUser`, `SendEmailV2` …).
- Use `ms connector list-actions --connector <id> --json` to find the operationId.
- Actions blocked by policy are **not generated** ("Skipped N of M actions due to policy").

## 2. Tabular non-Dataverse (SharePoint lists/libraries, Excel, SQL …)

Named export, lower-case CRUD:

```ts
import { DocumentsService } from '../generated';

const page = await DocumentsService.getAll({ select: ['ID', 'Title'], top: 50, orderBy: ['Modified desc'] });
await DocumentsService.create({ Title: 'New' });
await DocumentsService.update(id, { Title: 'Renamed' });
await DocumentsService.get(id, { select: ['Title'] });
await DocumentsService.delete(id);   // ⚠ returns Promise<void> — the IOperationResult is discarded
```

⚠ **`delete()` swallows failures** in generated tabular services. When a delete must be confirmed, call the client directly:

```ts
import { getClient } from '@microsoft/managed-apps/data';
import dataSources from '../generated/dataSources';
const res = await getClient(dataSources).deleteRecordAsync('documents', id);
if (!res.success) { /* show error, keep row */ }
```

SharePoint config shape: `connectionReferences[<ref>].dataSets[<site-url>].dataSources.<name>.tableName = <list-guid>`.

## 3. Dataverse tables

**Default export**, PascalCase CRUD — `generated/index.ts`'s `export *` does **not** re-export default classes, so import the file directly:

```ts
import AccountsService from '../generated/services/AccountsService';   // ✅
// import { AccountsService } from '../generated';                      // ❌ undefined

const r = await AccountsService.ListRecords({ $select: 'name,accountnumber', $filter: 'statecode eq 0', $orderby: 'name', $top: 50 });
const rows = r.data?.value ?? [];
const nextLink = r.data?.['@odata.nextLink'];               // extract $skiptoken from it for the next call
await AccountsService.CreateRecord({ name: 'Contoso' });
await AccountsService.UpdateRecord(id, { name: 'Contoso Ltd' });
await AccountsService.GetItem(id, 'name,accountnumber');   // positional: (recordId, $select?, $expand?)
const del = await AccountsService.DeleteRecord(id);        // IOperationResult<void> — check del.success
```

- Calls go through `executeAsync({ connectorOperation })` against the Dataverse connector (operation names `*WithOrganization`).
- `ListRecords` options: `$select`, `$filter`, `$orderby`, `$expand`, `fetchXml`, `$top`, `$skiptoken`, `partitionId` (strings, OData syntax). Rows are in `data.value`.
- Also generated: `UpdateOnlyRecord`, `GetEntityFileImageFieldContent`, `UpdateEntityFileImageFieldContent`, `AssociateEntities`, `DisassociateEntities`.
- Choice/option-set columns are generated as `const X = {...} as const` maps — use them, not magic numbers.
- Newer CLIs also generate `PerformBoundAction` / unbound actions — **blocked by default governance** (Dataverse bound/unbound actions are on the default blocked list).
- The Dataverse connector service also exposes `InvokeMCP`, `mcp_DataverseMCPServer`, `GetRelevantRows` — subject to policy.

## 4. MCP servers exposed as connectors (Work IQ, Learn, Dataverse MCP)

```ts
const res = await WorkIQCopilotMCPService.mcp_m365copilot(undefined, {
  jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call',
  params: { name: 'copilot_chat', arguments: { message: 'Summarise my week' } },
});
// res is typed IOperationResult<void> but res.data is an SSE string: "event: message\ndata: {...}\n\n"
```

Parse SSE explicitly — see `cmr-mcp-workiq`.

## After a CLI upgrade

Re-running codegen may change **other** services (new methods, renamed helpers). Treat `generated/` diffs as part of code review; pin `@microsoft/managed-apps-cli` in `devDependencies` so the team generates identical code.
