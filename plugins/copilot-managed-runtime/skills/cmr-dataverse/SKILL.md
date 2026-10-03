---
name: cmr-dataverse
description: Use Dataverse tables from a Copilot Managed Runtime app — cross-environment binding, generated service usage (default import, executeAsync, positional args), paging, choices/lookups, and security-role design. USE WHEN binding Dataverse tables, querying/writing Dataverse rows, handling `@odata.nextLink`, or the app environment has no Dataverse. DO NOT USE WHEN working with Power Apps code apps' Dataverse plugin (`pac code add-data-source`) or non-Dataverse connectors.
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
---

# Dataverse in CMR

## 1. Where is Dataverse?

Personal developer environments may **not** have Dataverse ("Unable to determine the Dataverse organization URL" — a dangling connection is still created; delete it). Bind to a team/business environment instead (`-t` takes the table **logical name**):

```bash
ms app add data-source --connector shared_commondataserviceforapps --as table -c <conn-id> \
  --dataverse-environment-id <dataverse-env-id> -t account --non-interactive --json
# exit 2 → lists the missing choices (connection / tables). Loop until success.
```

If the app lives in an environment that **has** Dataverse, bind in the same environment and omit `--dataverse-environment-id`:

```bash
ms app add data-source --connector commondataserviceforapps --as table -t contoso_fieldrequest --use-sso --non-interactive --json
```

Prefer a shared, ALM-managed environment (solution-based tables) over the maker's personal one for any data that must outlive the maker. Creating the tables themselves (publisher, solution, Web API scripts) is covered in `cmr-backend-provisioning`.

The binding is keyed to the **org API URL** and `dataverseTables{ environmentId, logicalName, entitySetName }` in `ms.config.json`. Generated code contains no environment values, so with an identical (managed-solution) schema in every stage, rebinding per stage leaves `generated/` unchanged.

## 2. Generated service shape (verified)

- **Default export**: `import AccountsService from '../../generated/services/AccountsService';` (named import fails — AP-15).
- Methods call `executeAsync({ connectorOperation })` with `*WithOrganization` operations; return `IOperationResult<T>`.
- `ListRecords({ $select, $filter, $orderby, $expand, fetchXml, $top, $skiptoken })` → rows in `data.value`; next page in `data['@odata.nextLink']`.
- `GetItem(recordId, $select?, $expand?)` — **positional** args.
- `CreateRecord(item)`, `UpdateRecord(id, item)`, `UpdateOnlyRecord`, `DeleteRecord(id)` (`IOperationResult<void>` — check `success`).
- Also: file/image column content ops, Associate/Disassociate, PerformBoundAction (may be blocked by policy).

## 3. Paging helper

```ts
import AccountsService from '../../generated/services/AccountsService';
import { unwrap } from './result';

export async function* pagedAccounts(filter?: string) {
  let skiptoken: string | undefined;
  do {
    const data: any = unwrap(await AccountsService.ListRecords({
      $select: 'accountid,name,statecode', $filter: filter, $top: 500, $skiptoken: skiptoken,
    } as any), 'accounts.list');
    yield data.value as Array<{ accountid: string; name: string }>;
    const next: string | undefined = data['@odata.nextLink'];
    skiptoken = next ? new URL(next).searchParams.get('$skiptoken') ?? undefined : undefined;
  } while (skiptoken);
}
```

Always `$select` columns; never load whole tables into memory for client-side filtering (AP-24). Each call can consume Copilot Credits (`cmr-licensing-cost`).

## 4. Data-shape rules

- **Choices**: integer values. Codegen emits a typed map per local choice (`export const Contoso_fieldrequestscontoso_status = { 100000000: 'New', … } as const`) and a read-only `<column>name` label field. Use the map; don't hard-code numbers.
- **Lookups**: write with `"<nav>@odata.bind": "/<entityset>(<id>)"`; read with `$expand` or `_<lookup>_value`.
- **Dates**: UTC ISO strings; format in the UI.
- Filter strings: escape single quotes (`'` → `''`) in user input (injection).

## 5. Security model

Access is evaluated as **the signed-in user** — Dataverse security roles, business units, column security and row ownership all apply. Design roles first:

1. Create a role per persona (e.g. *Expenses Submitter*, *Expenses Approver*) with least privilege, user/BU scope.
2. Assign via Entra security groups (group teams).
3. Sharing the app does **not** grant table access — do both (`cmr-sharing`).
4. Use column security for sensitive fields; never rely on hiding fields in the UI (AP-25).

## 6. Schema changes

Tables are owned by the Dataverse environment's ALM (solutions). Keep the solution unmanaged in dev and **managed** downstream, with its unpacked source in the same repo as the app ([solutions-and-alm](../../references/solutions-and-alm.md)). After a schema change: `ms app refresh data-source -n <name>`, review the `generated/` diff, commit. Never let the app, an agent or the Dataverse MCP `create_table` / `update_table` tools change schema (AP-31).

## Anti-patterns

AP-15, AP-21, AP-24, AP-25, AP-26, AP-28, AP-31, AP-34, AP-37, AP-38. See [anti-patterns](../../references/anti-patterns.md) · [generated-code](../../references/generated-code.md).
