# Governance quick reference (for makers, pro-devs and admins)

Everything here is tenant-agnostic. Admin portals: **Microsoft 365 admin center (MAC)** → *Apps*, and **Power Platform admin center (PPAC)**.

## Where apps live

- Each maker builds in their **personal developer environment** (auto-created by the routing rule on first `ms app create` if they don't have one). Apps are **not** in the default environment.
- A tenant-wide **default environment group** ("Everyone", Microsoft-managed) is created on first app creation with 4 rules: **routing**, **connectors + MCP**, **sharing**, **CSP**.
- No routing rule match → the maker **cannot create apps**. The "Everyone" catch-all can't be modified after init, and CMR routing can't be turned off.
- Admins can create additional env groups (e.g. a "Pro-dev" group with wider connectors / CSP) and route specific security groups to them.

## Rules and their defaults

| Rule | Default | Admin can… |
|---|---|---|
| Routing | Everyone → personal dev env | add groups with different rules |
| Connectors + MCP | 18 Entra-only first-party connectors + MCP list; open-ended HTTP / script / Custom API actions blocked; custom and third-party connectors blocked | allow/block connectors & actions; *Edit this policy* = **full control** (Microsoft stops auto-updating the list). Custom connectors aren't supported in ACP per docs → govern them with classic DLP |
| Sharing | org-wide on / guests per tenant setting; **share links blocked** ("viral sharing"). An ungrouped environment has no sharing rule, so links worked there [lab] | allow org-wide, guests, links |
| CSP | strict (see `cmr-security-csp`) | add origins per directive, report-only mode, report endpoint |
| CLI creation | PPAC env-group rule "Allow app creation with the CMR CLI" | turn off to force citizen-only surfaces |
| External artifacts | **off** (`--repo none` / `--artifact` deploy fails) | PPAC → Copilot → Settings → Managed apps, or env-group rule |

ACP vs DLP: if "Advanced connector policies only" is off, both ACP and DLP apply and **the most restrictive wins**. Both are enforced on every `ms app deploy` (403 `AcpDlpPolicyEvaluation`); the CLI's add-time check is advisory.

## Roles

| Role | Can |
|---|---|
| Global admin, Power Platform admin | full management (MAC + PPAC) |
| Dynamics 365 admin | PPAC only |
| AI admin, AI reader, Global reader | read-only in MAC |

## Inventory, monitoring, audit

- **Inventory**: MAC → Apps → All apps (≈15 min latency). Admins can **block** or **delete** apps here. PPAC → Manage → Inventory, item type *Copilot Managed Runtime*, shows hosting environment.
- **Monitor**: app open success rate, time-to-interactive P75, sessions, data request success & latency. Not real-time; 28-day history. **Alerts**: max 10 per tenant, emailed to Global/Power Platform admins.
- **Purview audit** (`PowerPlatformAdminActivity`): `LaunchPowerApp`, `DeletePowerApp`, `ApiEndpointCallEvent` for app create (`/appframework/apps` POST), `/build`, `/deploy`, `EnvironmentAddedToEnvironmentGroup`, `UpdateRuleBasedPolicyOperation`, `UpdateRuleSetOperation`.
  ⚠ **`git push` to the platform repo is not audited** — if you need code-change audit, use an external GHEC repo with branch protection and audit log streaming.

## External GitHub repos

- GitHub Enterprise Cloud only (`github.com` orgs on GHEC, or `*.ghe.com` data-residency). **Not** GHES, personal-account repos, non-GHEC orgs or Azure DevOps. Repo must exist and be **completely empty** (no README/`.gitignore`/LICENSE) at `ms app create --repo <url>`.
- Choice is permanent per app. No CMR-side org allow-list is documented. **GitHub enterprise/org policies are the control plane**: enforce private visibility, base permission none/read, GitHub App installation approval (the *Managed Apps* GitHub App), IP allow list exceptions for GitHub Apps, rulesets on `main`, push protection, and audit log streaming.
- Preview access = **write** access to the bound repo, so GitHub teams define who can push *and* preview. CMR `--access edit` sharing doesn't grant GitHub rights.
- Each developer holds an expiring Entra↔GitHub mapping (`ms git auth refresh`). Headless SP pipelines fit `--repo none` better.
- Full matrix and recommended org layout: [source-control](source-control.md).

## Existing Power Platform customers

Existing routing rules/env groups are respected; CMR adds its default group without changing others. Review: does the CMR "Everyone" group conflict with your managed environment strategy? Do your DLP policies classify the 18 connectors the same way?

## Admin checklist (first week)

1. Decide who may create via CLI (env-group rule) and whether a "pro-dev" group with wider rules is needed.
2. Review connector/MCP allow-list; decide whether to take **full control** (you then own updates) and where custom / third-party connectors may be used (dedicated group, DLP URL patterns).
3. Confirm sharing posture (org-wide, guests, links).
4. Decide on external artifacts (CI-built apps) and external GitHub repos.
5. Pre-approve telemetry/API origins in CSP for teams that need App Insights or APIs.
6. Configure Monitor alerts and a Purview audit search for `ApiEndpointCallEvent` deploys.
7. Communicate licensing (Power Apps Premium or Copilot Credits) — see `cmr-licensing-cost`.
