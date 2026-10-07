---
name: cmr-governance-admin
description: Tenant governance for Copilot Managed Runtime — environment groups, connector/MCP policies (ACP vs DLP), sharing, CSP, CLI and external-artifact switches, tenant-wide inventory, orphaned apps, adoption (DAU/MAU), monitoring and Purview audit. USE WHEN an admin or CoE asks how to govern, monitor, audit or roll out CMR, find all citizen apps, spot orphaned or unused apps, or unblock a maker hit by policy. DO NOT USE WHEN administering canvas/model-driven environments unrelated to CMR.
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, AskUserQuestion
---

# Governance and administration

Reference: [governance-quick-ref](../../references/governance-quick-ref.md) · [connectors-and-policy](../../references/connectors-and-policy.md) · [source-control](../../references/source-control.md) (GitHub enterprise policies for `github` apps) · [inventory-orphans-adoption](../../references/inventory-orphans-adoption.md).

## 1. The control plane

```
Tenant
 └─ Environment groups (default "Everyone" + your groups)
     ├─ Routing rule ........ who gets a personal developer environment, in which group
     ├─ Connectors + MCP .... allow list + per-action Allow/Block (ACP); DLP also applies → most restrictive wins
     ├─ Sharing ............. org-wide / guests / share links
     ├─ CSP ................. per-directive origins, report-only, report endpoint
     ├─ CLI creation ........ allow/deny pro-code creation via `ms`
     └─ External artifacts .. AllowExternalArtifactDeployment (CI-built zips)
 Observability: MAC Apps inventory · PPAC inventory · Monitor (28 d, ≤10 alerts) · Purview audit · Copilot Cost management
```

The default group is created on first app creation and immediately blocks the long tail of connectors (lab: ~1,280 of ~1,300 blocked; ~20 Microsoft 365 connectors + Work IQ/Learn MCP allowed).

## 2. Recommended tiering

| Group | Members | Connectors/MCP | Sharing | CSP | CLI | External artifacts |
|---|---|---|---|---|---|---|
| **Everyone** (default) | all users | Microsoft defaults | groups, no links | default | off or on per culture | off |
| **Pro developers** | `cmr-prodev` SG | + SQL / approved LOB connectors | groups | + App Insights ingestion | on | on (CI only) |
| **Restricted / regulated** | `cmr-regulated` SG | minimal | named groups only | default | on | on, with pipeline attestation |

Take "full control" of a connector policy only if you'll own updates — Microsoft stops auto-updating it.

**Ungrouped environments bypass the curated list.** The CMR connector rule is enforced through environment-group membership. In the lab, a Dataverse sandbox that wasn't in any group (and had no DLP) allowed every connector and action, including third-party connectors, SQL and SharePoint "Send an HTTP request", and a CMR app there could add them. Controls:
- Put every environment that hosts CMR apps (team, test, prod) into a governed group.
- Review environments with no group regularly (PPAC → Environments → *Environment group* column, or the BAP API with `$expand=properties.parentEnvironmentGroup`).
- Keep a tenant-wide DLP as a backstop (AP-36).

**Custom and non-curated connectors** (custom/OpenAPI, third-party, independent publisher, non-Entra auth, gateway). Detail: [connectors-and-policy](../../references/connectors-and-policy.md) → *Custom and non-curated connectors*.
- The default group's rule is Microsoft-managed. Edits fail with 403 `MicrosoftManagedRuleSetEditNotAllowed` until you take **full control**. Prefer a **dedicated group** for the requesting team over widening the default group (AP-83).
- **Third-party and independent-publisher connectors:** add them under full control. They're usable about a minute later (lab).
- **Custom connectors:** the ACP docs say they aren't supported yet. In the lab the policy API accepted one anyway (undocumented). The documented route is classic DLP: a group without a connector ACP, "Advanced connector policies only" **off**, and a DLP policy with custom-connector URL patterns limited to your API hosts.
- **Enforcement point:** policy is enforced on every `ms app deploy`. Removing a connector, or a DLP business/non-business mix, fails the next deploy with 403 `AcpDlpPolicyEvaluation`. Check which apps use a connector (MAC → Apps → *app* → Data & tools) before removing it.
- Save the policy JSON before taking control. Reverting to Microsoft-managed worked through the API in the lab but isn't documented. Rule changes appear in Purview as `UpdateRuleBasedPolicyOperation` / `UpdateRuleSetOperation`.

Also govern the **Dataverse MCP** schema tools (`create_table` / `update_table` / `delete_table`) and the MCP allowed-clients list. Schema should only change through solutions (AP-31, AP-37). The same applies to **Work IQ write tools**: they can create SharePoint lists, columns, Microsoft 365 groups (and so team sites) and Planner plans. They're off by default; enable them only for named groups (AP-79). Containers an AI created are prototypes until a pro-dev adopts them (AP-78).

## 3. Maker → admin request templates

- Connector: "Allow `<connector-id>` (actions: `<list>`) for env group `<group>` for app `<app-name>`; data classification: `<x>`; owner: `<group>`." For a custom connector, add: OpenAPI host(s) for the DLP URL pattern, auth type, and the API owner.
- CSP: see `cmr-security-csp` template (exact origin + directive + report-only period).
- External artifacts: "Enable AllowExternalArtifactDeployment on `<environment-id>`; deployments only via pipeline `<repo>/<workflow>` with SP `<sp-name>`."

## 4. Monitoring and audit

- **Inventory** (≈15 min latency): every CMR app in the tenant, with owner, environment and origin. See §5 for orphans and adoption.
- **Monitor**: open success rate, time-to-interactive P75, data request success/latency; set alerts (max 10/tenant) on critical apps.
- **Purview**: search `PowerPlatformAdminActivity` for `ApiEndpointCallEvent` on `/build` and `/deploy`, `LaunchPowerApp`, `DeletePowerApp`, env-group rule changes.
- **Gap**: pushes to platform-managed Git are not audited → require external GHEC repos (branch protection + audit log streaming) for regulated apps.
- **Cost**: MAC → Copilot → Cost management for Copilot Credits by service (runtime, Cowork, Work IQ API).

## 5. Find citizen apps, orphans and adoption

Full detail: [inventory-orphans-adoption](../../references/inventory-orphans-adoption.md).

1. **List every app.** Use the inventory API, PPAC Inventory or MAC → Apps → All apps. Not `ms app list`: it only shows apps shared with you (AP-74). Not the Power Apps admin cmdlets or the CoE kit: they don't see CMR apps (AP-77). CMR apps are `microsoft.powerapps/apps` with `subType microsoftApp`; `origin` tells you how each one was created.
2. **Adoption.** Join the inventory's `microsoft.powerplatformusage/usagerecords` (`lastUsed`, daily) on app ID. No record = never launched. For DAU / MAU and sessions use the MAC **Usage** tab or the usage API behind it (`timeGrain=day|month|all`; script switch `-IncludeActiveUsers`). The classic PPAC analytics and the CoE kit don't cover CMR apps (AP-80). See reference §3b.
3. **Orphans.** Resolve `ownerId` / `createdBy` with Graph `directoryObjects/getByIds`: missing = deleted user, `accountEnabled: false` = disabled.
4. **Classify** with the 2×2 below and act on 🔴 first.

| | Used recently | Unused / never |
|---|---|---|
| **Orphaned** | 🔴 Act now: new accountable owner, get the source, harden via `cmr-citizen-handoff` | 🟡 Retire: notify, **Block**, delete after grace (AP-76) |
| **Owned** | 🟢 Healthy: ≥2 owners, group sharing, alerts; promote to pro-dev track above a usage threshold | 🟡 Nudge the owner |

Run it with [`scripts/Find-CmrOrphanedApps.ps1`](scripts/Find-CmrOrphanedApps.ps1). It's read-only, needs a **delegated** admin token (service principals get 403), and writes a CSV. Confirm with the user before running it against a tenant.

**No ownership reassignment for CMR apps** in preview (AP-75): the Power Apps admin API returns 404 for them, the `ms` CLI has no owner command, and MAC offers Block and Delete only. Recovery depends on someone with **edit** access running `ms app clone --app <app-id>`, or on the app's external GHEC repo. That's why ≥2 edit owners through a group is a hard rule (AP-65).

## 6. Operating model (CoE)

1. Publish an internal "CMR starter" template repo (`ms app create -t github:<org>/<repo>/<dir>`) with security defaults.
2. Install these skills for every developer's coding agent (repo README).
3. Require ≥2 owners and group-based sharing for any app with >N users.
4. Quarterly: run `Find-CmrOrphanedApps.ps1`, resolve every 🔴 row, retire 🟡 rows, review connector usage, Monitor failures and cost outliers.
5. Promote citizen apps that cross a usage threshold into the pro-dev track (`cmr-citizen-handoff`).

## Anti-patterns

AP-27, AP-31, AP-35, AP-36, AP-37, AP-46, AP-56, AP-60, AP-65, AP-74 … AP-81, AP-83. See [anti-patterns](../../references/anti-patterns.md).
