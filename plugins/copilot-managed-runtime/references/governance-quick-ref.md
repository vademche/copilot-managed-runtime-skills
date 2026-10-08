# Governance quick reference (for makers, pro-devs and admins)

Everything here is tenant-agnostic. Admin portals: **Microsoft 365 admin center (MAC)** → *Apps*, and **Power Platform admin center (PPAC)**.

## Where apps live

- By default each maker builds in their **personal developer environment**, auto-created by the routing rule on the first `ms app create` without `-e`. A developer can target another environment with `-e`, including the Default environment if CLI creation is on there (lab). See *Environments* below.
- A tenant-wide **default environment group** ("Everyone", Microsoft-managed) is created on first app creation with 4 rules: **routing**, **connectors + MCP**, **sharing**, **CSP**.
- CMR routing is on in every tenant and can't be turned off. If the tenant has no routing rules, an "Everyone" rule and the default group are created. If it already has rules but no "Everyone" rule, **only makers in those rules' security groups can create CMR apps**. The "Everyone" rule can't be deleted and must stay last in priority.
- Admins can create additional env groups (e.g. a "Pro-dev" group with wider connectors / CSP) and route specific security groups to them.

## Rules and their defaults

| Rule | Default | Admin can… |
|---|---|---|
| Routing | Everyone → personal dev env | add groups with different rules |
| Connectors + MCP | 18 Entra-only first-party connectors + MCP list; open-ended HTTP / script / Custom API actions blocked; custom and third-party connectors blocked | allow/block connectors & actions; *Edit this policy* = **full control** (Microsoft stops auto-updating the list). Custom connectors aren't supported in ACP per docs → govern them with classic DLP |
| Sharing | org-wide on / guests per tenant setting; **share links blocked** ("viral sharing"). An ungrouped environment has no sharing rule, so links worked there [lab] | allow org-wide, guests, links |
| CSP | strict (see `cmr-security-csp`) | add origins per directive, report-only mode, report endpoint |
| CLI creation | PPAC env-group rule "Allow app creation with the CMR CLI" (environment setting `ManagedApps_AppCreationFromCLI`; a published group rule locks it). It was on in the routed, Default and newly created Developer environments in the lab, and off in one existing sandbox | turn off to force citizen-only surfaces |
| External artifacts | **off** (`--repo none` / `--artifact` deploy fails) | PPAC → Copilot → Settings → Managed apps, or env-group rule |

ACP vs DLP: if "Advanced connector policies only" is off, both ACP and DLP apply and **the most restrictive wins**. Both are enforced on every `ms app deploy` (403 `AcpDlpPolicyEvaluation`); the CLI's add-time check is advisory. Classic DLP gaps for CMR (lab): connector **action** rules aren't enforced at deploy or runtime (AP-98), and a tightened policy doesn't stop already-deployed apps until DLP connection re-evaluation disables their connections (AP-99).

## Environments: where an app goes, and how to get one

**How `ms app create` / `init` picks the environment** (ms 0.27, CLI source plus lab):
1. A managed project's environment (`MS_CLI_ALM` preview). A different `-e` is an error.
2. `-e <environment-id>`.
3. Otherwise the routing service. It returns the maker's personal developer environment (the first alphabetically if they own several) or provisions one, with the CLI polling for up to about 2 minutes. The CLI asks for it **without Dataverse**.

The ID is saved in `ms.config.json` and later commands use it; `-e` overrides it per command. `ms` has no command to list, create or request environments.

**The developer can choose**, but governance follows the environment's group. Lab results with ms 0.27:

| `-e` target | Group | `ms app create` | ACP-blocked connectors |
|---|---|---|---|
| omitted (routed personal developer env) | CMR default group | created | ~1,280 of ~1,300 |
| Default environment | none | created | 0 (DLP only) |
| New Developer environment created through the API | none | created | 0 |
| Existing sandbox with CLI creation off | none | 400 "Managed App creation from CLI is not enabled for environment '…'. Ask the environment administrator to enable the 'ManagedApps_AppCreationFromCLI' environment setting." | — |
| Wrong ID | — | exit 5 "Could not reach environment …" | — |

**Personal developer environment** (docs): a managed environment, but no premium licence is needed if it's only used for CMR. The maker is its environment admin. It has **no Dataverse** until someone adds it in PPAC (*Add Dataverse*), or until the maker is routed there from Power Apps, Power Automate or Copilot Studio. The tenant setting "Developer environment assignments" doesn't stop routing from creating it. Use it for prototypes, not team apps (AP-88).

**Getting another environment:**

| Route | Who | Notes |
|---|---|---|
| Do nothing | any maker covered by a routing rule | the first `ms app create` without `-e`, or the first CMR app from a citizen surface, provisions the personal environment |
| PPAC or Power Apps → *New environment* | makers, if "Developer / Production / Trial environment assignments" = Everyone | admins can restrict to "Only specific admins" (PowerShell: `disableDeveloperEnvironmentCreationByNonAdminUsers`, `DisableEnvironmentCreationByNonAdminUsers`) |
| Power Platform API `POST https://api.powerplatform.com/environmentmanagement/provisioning/environments?api-version=2024-10-01` | admins, or makers where allowed | body `displayName`, `environmentSku` (`Developer` / `Sandbox` / `Production`), `macroRegion` (lowercase code such as `eu-efta`; an invalid value returns `InvalidMacroRegion`) or `location`, optional `databaseType`, `parentEnvironmentGroup`. Lab: a Developer environment without Dataverse returned 201 and was ready in seconds |
| `pac admin create` / BAP API | admins | in tenants that require a macro region, pac 2.10 fails ("macroRegion … is not valid") and BAP returns `MacroRegionRequired`; use the API above (AP-91) |
| Request process | makers where creation is restricted | CoE Starter Kit *Environment Request* apps, or the service desk |

**Request template:** "Environment for `<app>`: type `<Developer|Sandbox|Production>`, region `<macro-region>`, group `<env-group>`, Dataverse `<yes/no>`, CLI creation on, owners `<security group>`, stages `<dev/test/prod>`."

**Admin follow-up for every new CMR environment:** put it in a governed group (at creation via `parentEnvironmentGroup`, or in PPAC), confirm the CLI-creation rule, add Dataverse if needed, and review ungrouped environments regularly (AP-36). Deleting a test environment: `POST …/scopes/admin/environments/<id>/validateDelete` then `DELETE` (BAP admin API), or PPAC.

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
