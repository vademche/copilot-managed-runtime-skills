---
name: cmr-governance-admin
description: Tenant administration and governance for Copilot Managed Runtime — environment groups and routing, connector/MCP and action policies (ACP vs DLP), sharing rules, CSP, CLI creation and external-artifact switches, inventory, monitoring, alerts, Purview audit, and a governance operating model for citizen and pro-dev makers. USE WHEN an admin or CoE asks how to govern, restrict, monitor, audit or roll out CMR, or when a maker is blocked by policy and needs to know what to ask for. DO NOT USE WHEN administering Power Apps canvas/model-driven environments unrelated to CMR.
user-invocable: true
allowed-tools: Read, Grep, Glob, AskUserQuestion
---

# Governance and administration

Reference: [governance-quick-ref](../../references/governance-quick-ref.md) · [connectors-and-policy](../../references/connectors-and-policy.md) · [source-control](../../references/source-control.md) (GitHub enterprise policies for `github` apps).

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

Also govern the **Dataverse MCP** schema tools (`create_table` / `update_table` / `delete_table`) and the MCP allowed-clients list. Schema should only change through solutions (AP-31, AP-37).

## 3. Maker → admin request templates

- Connector: "Allow `<connector-id>` (actions: `<list>`) for env group `<group>` for app `<app-name>`; data classification: `<x>`; owner: `<group>`."
- CSP: see `cmr-security-csp` template (exact origin + directive + report-only period).
- External artifacts: "Enable AllowExternalArtifactDeployment on `<environment-id>`; deployments only via pipeline `<repo>/<workflow>` with SP `<sp-name>`."

## 4. Monitoring and audit

- **Inventory** (≈15 min latency): find orphaned apps, block/delete risky ones.
- **Monitor**: open success rate, time-to-interactive P75, data request success/latency; set alerts (max 10/tenant) on critical apps.
- **Purview**: search `PowerPlatformAdminActivity` for `ApiEndpointCallEvent` on `/build` and `/deploy`, `LaunchPowerApp`, `DeletePowerApp`, env-group rule changes.
- **Gap**: pushes to platform-managed Git are not audited → require external GHEC repos (branch protection + audit log streaming) for regulated apps.
- **Cost**: MAC → Copilot → Cost management for Copilot Credits by service (runtime, Cowork, Work IQ API).

## 5. Operating model (CoE)

1. Publish an internal "CMR starter" template repo (`ms app create -t github:<org>/<repo>/<dir>`) with security defaults.
2. Install these skills for every developer's coding agent (repo README).
3. Require ≥2 owners and group-based sharing for any app with >N users.
4. Quarterly: inventory review, ownerless apps, connector usage, Monitor failures, cost outliers.
5. Promote citizen apps that cross a usage threshold into the pro-dev track (`cmr-citizen-handoff`).

## Anti-patterns

AP-27, AP-31, AP-35, AP-36, AP-37, AP-46, AP-56, AP-60, AP-65. See [anti-patterns](../../references/anti-patterns.md).
