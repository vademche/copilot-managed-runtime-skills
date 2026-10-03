# Inventory, orphaned apps and adoption

How to find **every** CMR app in a tenant (including the ones citizens built in Copilot Studio or Cowork), work out which ones have lost their owner, and decide which of those matter because people still use them.

> **Orphaned + still used = act now.** A business-critical app with nobody able to fix it is the highest-risk item in a CMR estate. Orphaned + unused = retire candidate.

Everything here was checked in a lab tenant with `ms` 0.27.0 (preview). Placeholders: `<tenant-id>`, `<environment-id>`, `<app-id>`, `<user-object-id>`.

## 1. Which tool sees which apps

| Tool | Scope | Sees CMR apps? | Notes |
|---|---|---|---|
| `ms app list --json` | **only apps you can play or edit**, all environments (`-e` to filter) | yes, RBAC-scoped | Fine for a maker. **Not an inventory**: an admin doesn't see apps nobody shared with them (AP-74) |
| `ms app info --app <app-id> --json` | one app, any environment you have access to | yes | No `-e` needed: the CLI resolves the environment from the app ID |
| Microsoft 365 admin center → Copilot → Apps → **All apps** | tenant | yes | Owner, environment, Block / Delete, **Monitor** and **Usage** tabs, export. ≈15 min latency |
| Power Platform admin center → Manage → **Inventory** | tenant | yes (type *App*) | Same data source as the API below |
| **Power Platform inventory API** (resource query) | tenant | yes | Scriptable. Delegated admin token only (§2) |
| Power Apps admin API / `Get-AdminPowerApp` / `Set-AdminPowerAppOwner` | canvas apps, code apps | **no**: CMR apps return `404 ApplicationNotFound` | Don't use for CMR. There's no ownership reassignment path (§6) |
| CoE Starter Kit | canvas, model-driven, flows, agents | no CMR coverage today | Feed it from the inventory API if you need it there |
| Tenant app-framework endpoints (`/appframework/apps`, `/locate`) | tenant | yes | Need scopes only the `ms` CLI's own client holds. Other clients get `403 InsufficientDelegatedPermissions`. Use the CLI |

## 2. Inventory API: list every CMR app

`POST https://api.powerplatform.com/resourcequery/resources/query?api-version=2024-10-01`

- Token: **delegated** user token for `https://api.powerplatform.com` (for example `az account get-access-token --resource https://api.powerplatform.com`). A service principal gets `403` (AP-77).
- Role: Global admin or Power Platform admin. Global Reader can read.
- `$type` must be the **first** property of every clause (use `[ordered]` in PowerShell).
- Page with `take` plus the returned `skipToken`. In the lab, `Options.Top` returned **0 rows** with `resultTruncated: 1`, so don't use it.

```json
{
  "TableName": "PowerPlatformResources",
  "Clauses": [
    { "$type": "where", "FieldName": "type", "Operator": "==", "Values": ["'microsoft.powerapps/apps'"] },
    { "$type": "where", "FieldName": "properties.subType", "Operator": "==", "Values": ["'microsoftApp'"] },
    { "$type": "project", "FieldList": ["name", "location", "properties.environmentId", "properties.displayName",
        "properties.ownerId", "properties.createdBy", "properties.createdAt", "properties.lastModifiedAt",
        "properties.lastModifiedBy", "properties.origin", "properties.isQuarantined"] },
    { "$type": "take", "TakeCount": 1000 }
  ]
}
```

| Field | Meaning |
|---|---|
| `name` | the app ID (last segment of the play URL) |
| `properties.subType` | `microsoftApp` = CMR app. Power Apps code apps are `microsoft.powerapps/codeapps` with `byocApp`, a different product |
| `properties.ownerId` / `createdBy` / `lastModifiedBy` | Entra object IDs |
| `properties.origin` | how it was created, for example `managed-apps-cli`. Use it to separate CLI-built apps from citizen-built ones; check the values in your own tenant |
| `properties.isQuarantined` | blocked by an admin |

The response contains `totalRecords`, `count`, `resultTruncated`, `skipToken`, `data`. Repeat the call with `"Options": { "SkipToken": "<token>" }` until `skipToken` is null.

Environment names come from the same table: `type == 'microsoft.powerplatform/environments'`, project `name`, `properties.displayName`, `properties.environmentType`, `properties.isManaged`, `properties.environmentGroupId`.

## 3. Adoption: usage records

The inventory holds a daily "last used" marker per resource: `type == 'microsoft.powerplatformusage/usagerecords'`.

- `id` = `<parent-resource-id>/providers/Microsoft.PowerPlatformUsage/usageRecords/default`
- `properties.resourceId` = the parent's `name` (the app ID), `properties.lastUsed` = a date at day granularity (`…T23:59:59Z`)
- Records exist for `microsoft.powerapps/apps`, code apps, flows, agents and model-driven apps. **An app with no record has never been launched** (or not since usage tracking started). In the lab, an app that was created but never deployed or opened had none.

```json
{
  "TableName": "PowerPlatformResources",
  "Clauses": [
    { "$type": "where", "FieldName": "type", "Operator": "==", "Values": ["'microsoft.powerplatformusage/usagerecords'"] },
    { "$type": "project", "FieldList": ["id", "properties"] },
    { "$type": "take", "TakeCount": 1000 }
  ]
}
```

Keep the rows whose `id` contains `/providers/Microsoft.PowerApps/apps/`, then join on `properties.resourceId == name`. For depth beyond "last used":
- **MAC → All apps → app → Usage**: active users and sessions over time. **Monitor**: open success rate, time-to-interactive P75, sessions. 28 days of data. Export the grid for a quarterly review.
- **Purview audit** (§5) for who launched it and how often.

## 4. Orphan check: owners against Entra ID

Collect every distinct `ownerId` and `createdBy`, then resolve them in bulk:

```http
POST https://graph.microsoft.com/v1.0/directoryObjects/getByIds
{ "ids": ["<user-object-id>", "..."], "types": ["user"] }
```

- Up to 1,000 IDs per call. **IDs of deleted users are silently left out of the response**, so "requested but not returned" = deleted. Confirm with `GET /directory/deletedItems/microsoft.graph.user` (soft-deleted for 30 days).
- Add `$select` or read `accountEnabled` from each user: `false` = disabled (leaver in progress, or blocked).
- Permission: `User.Read.All` or `Directory.Read.All` (delegated is fine for an admin).

| Owner state | Class |
|---|---|
| returned, `accountEnabled: true` | owned |
| returned, `accountEnabled: false` | **orphaned (disabled)** |
| not returned / in deleted items | **orphaned (deleted)** |

Only one owner is recorded per app. Also check edit sharers (`ms app share list --app <app-id> -e <environment-id> --access edit`); in 0.27.0 that call fails with 401 (preview bug), so record co-owners in the app's README until it's fixed.

## 5. Classify and act

| | **Used in the last 30 days** | **Not used in 90 days / never** |
|---|---|---|
| **Orphaned** | 🔴 **Act now.** Find a new accountable owner (the business unit that uses it); get the source (§6); harden through `cmr-citizen-handoff`; move to a group-owned process | 🟡 Retire candidate. Notify recent users / the manager, **Block** first, delete after a grace period (AP-76) |
| **Owned** | 🟢 Healthy. Check: ≥2 edit owners, group sharing, Monitor failures. Above a usage threshold → promote to the pro-dev track | 🟡 Nudge the owner: keep, archive or delete |

Thresholds are policy: start with 30 days for "active" and 90 days for "stale", and tune them to your estate. [`Find-CmrOrphanedApps.ps1`](../skills/cmr-governance-admin/scripts/Find-CmrOrphanedApps.ps1) runs §2–§4 and writes this classification as CSV (`ActNow`, `OrphanedLowUse`, `RetireCandidate`, `Stale`, `Healthy`). It is read-only.

Purview audit (record type `PowerPlatformAdministratorActivity`) adds per-user detail. Documented, not lab-verified:

| Operation | Use |
|---|---|
| `LaunchPowerApp` | who opens the app and how often: real adoption, per user |
| `ApiEndpointCallEvent` with path `/appframework/apps/…/build`, `/deploy` | last time anyone changed it |
| `DeletePowerApp` | deletion trail |

```powershell
Connect-ExchangeOnline
Search-UnifiedAuditLog -StartDate (Get-Date).AddDays(-30) -EndDate (Get-Date) -RecordType PowerPlatformAdministratorActivity -Operations LaunchPowerApp -ResultSize 5000 |
  ForEach-Object { $_.AuditData | ConvertFrom-Json } | Select-Object -First 1 | Format-List *
```

Inspect one record to find the app ID field, then group on it to get launches per app and distinct users per app.

## 6. Remediating an orphaned app

There is **no ownership reassignment for CMR apps** in preview: the Power Apps admin cmdlets don't see them, the `ms` CLI has no owner command, and MAC offers Block and Delete only. So:

1. **Prevention is the control.** Every app with real users gets ≥2 edit owners via a security group (AP-65, AP-75), recorded in the README.
2. **Get the code.** Anyone with edit access can `ms app clone --app <app-id>` (no environment needed). GitHub-backed apps: the repo is in your GHEC org and survives the leaver; transfer repo admin.
3. **If nobody has edit access**: the platform-managed Git history can't be reached by an admin today. Options are to rebuild from the running app's behaviour, or to ask Microsoft support. Plan for this by keeping regulated apps on external GHEC repos (AP-57).
4. **Continuity.** Keep the old app running (don't delete it) until a replacement under a group owner is live, then redirect users and Block the old one.
5. **Data.** Check who owns the data (SharePoint site owners, Dataverse record owners). A deleted user's Dataverse records stay, owned by a disabled user; reassign them in Dataverse.

## 7. Quarterly review checklist

- [ ] Inventory export (API or MAC) → join usage → owner check → classification CSV.
- [ ] Every 🔴 item has a named new owner and a handoff ticket within 2 weeks.
- [ ] Every 🟡 retire candidate was notified, Blocked, then deleted after the grace period.
- [ ] Apps above the usage threshold have ≥2 owners, group sharing and a Monitor alert.
- [ ] Ungrouped environments that host CMR apps: none (AP-36).
- [ ] Monitor failures and cost outliers reviewed.

Anti-patterns: AP-65, AP-74 … AP-77. See [anti-patterns](anti-patterns.md).
