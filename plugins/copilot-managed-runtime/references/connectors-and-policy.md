# Connectors, MCP servers and policy — decision guide

## What is allowed by default

Governance is **initialised on the first app creation in the tenant**. The rule lives on the **default CMR environment group**, so it covers environments in that group (personal developer environments from routing), not every environment in the tenant (see "Where the curated list applies" below). In the lab tenant, ~1 280 of ~1 300 connectors became blocked in that group, leaving the allow-list below. The admin can widen or narrow it (see `cmr-governance-admin`).

### 18 first-party connectors (Entra ID-only)

| Category | Connector (display) | Typical `--connector` id |
|---|---|---|
| Content | SharePoint, OneDrive for Business, Word Online (Business), OneNote (Business) | `sharepointonline`, `onedriveforbusiness`, `wordonlinebusiness`, `onenote` |
| Collaboration | Microsoft Teams, Office 365 Outlook, Office 365 Groups Mail | `teams`, `office365`, `office365groupsmail` |
| Identity | Office 365 Users, Office 365 Groups | `office365users`, `office365groups` |
| Tasks | Planner, To Do, Bookings | `planner`, `todo`, `microsoftbookings` |
| Data & analytics | Forms, Excel Online (Business), Dataverse, Power BI | `microsoftforms`, `excelonlinebusiness`, `commondataserviceforapps`, `powerbi` |
| Social | Viva Engage (Yammer) | `yammer` |
| DevOps | Azure DevOps | `visualstudioteamservices` |

(Copilot Studio — `microsoftcopilotstudio` — was also allowed in the lab tenant.) Ids can be passed with or without the `shared_` prefix.

### MCP servers (12 in docs; availability varies by tenant)

Power Apps MCP, Work IQ Copilot / Teams / Outlook Mail / Outlook Calendar / Word / User / OneDrive / SharePoint, Fabric MCP, Microsoft Learn Docs MCP, Microsoft MCP Servers. They are bound like connectors (`--as action`) and called through JSON-RPC (see `cmr-mcp-workiq`).

### Blocked actions even on allowed connectors

| Type | Where | Why |
|---|---|---|
| Open-ended HTTP ("Send an HTTP request") | SharePoint, Teams, Outlook, O365 Users, O365 Groups, Groups Mail, Azure DevOps | arbitrary REST = bypasses purpose |
| Arbitrary code/query | Excel "Run script", Power BI "Run a query" (DAX) | code execution / impersonation |
| Arbitrary platform API | Dataverse "Perform bound/unbound action" | arbitrary Custom APIs |

The CLI silently skips generating these ("Skipped N of M actions due to policy"). **Don't design around them** — if you need one, it's an admin conversation, not a code workaround.

## Choosing a data source

```
Need to store app-owned, relational, secured data?            → Dataverse (cmr-dataverse)
Data already lives in a SharePoint list / library?            → SharePoint --as table
Spreadsheet owned by a business team, low volume?             → Excel Online (Business) table (file in OneDrive/SharePoint)
People, org chart, profile photo?                             → Office 365 Users (actions)
Send mail / calendar / Teams message?                         → Office 365 Outlook / Teams (actions) — mind consent + premium
Natural-language answers grounded in M365?                    → Work IQ Copilot MCP (premium, billed separately)
Work items / pipelines?                                       → Azure DevOps (actions)
Third-party SaaS / your own API / SQL / Azure Function?       → Blocked in the default group. See "Custom and non-curated connectors":
                                                                 a) a curated connector / MCP server, or feed the data into Dataverse / SharePoint
                                                                 b) admin allows the connector for a dedicated env group (custom connectors: via DLP)
                                                                 c) NOT direct fetch + CSP connect-src (no connector governance, AP-20)
```

## Policy layers that apply at runtime

1. **Environment group rule** (CMR connectors + MCP allow-list, blocked actions).
2. **Advanced Connector Policies (ACP)** and classic **DLP** — when "Advanced connector policies only" is off, *both* apply and the most restrictive wins.
3. **Sharing rule** (org-wide / guests).
4. **CSP** (browser-level egress).
5. **Data-source security** (Dataverse roles, SharePoint permissions) — evaluated as the signed-in user.

Connector policy (layers 1–2) is checked by the CLI when you add a data source (advisory, fail-open) and enforced by the service on **every deploy** (authoritative). Policy changes can **break the next deploy**, and may break a deployed app (connection fails at launch). Keep the data layer behind your own service module so a swap is local.

## Where the curated list applies, and where it doesn't

The curated allow-list above is **not tenant-wide**. It's a rule on the **environment group**, which by default is the auto-created group that receives the personal developer environments makers get through routing. Lab comparison (`ms connector list-actions` in each environment):

| Environment | Group | Third-party connector (e.g. X) | SQL / Blob | SharePoint "Send an HTTP request" |
|---|---|---|---|---|
| Personal dev env (routing) | default CMR group | **Block** | **Block** | **Block** |
| Team sandbox with Dataverse, no group, no DLP | none | Allow, and `ms app add data-source` succeeded | Allow (only an interactive connection was missing) | **Allow** |

So "not approved but allowed" components come from three places:
1. Environments **outside** any environment group. Only tenant/environment DLP applies there, and with no DLP, nothing is restricted.
2. Groups whose admin added connectors or took **full control** of the rule.
3. Existing groups without an ACP, where classic DLP decides. The docs note that the MAC view may then misleadingly say "no connectors allowed".

For makers: before choosing a non-curated connector, check the target environment with `ms connector list-actions --connector <id>`. An app that works in an ungrouped sandbox can break when it's moved into a governed group. `ms connector list` shows the whole catalogue with an `isBlocked` flag per connector (`--only-allowed` filters). That's a client-side pre-check for the environment you're signed in to; the deploy is the real check.

For admins: put every environment that hosts CMR apps in a group with the CMR rule, audit ungrouped environments regularly, and keep a tenant-wide DLP as a backstop (AP-36).

## Custom and non-curated connectors

"Non-curated" means anything outside the default list above:
- **custom connectors**: OpenAPI, imported in a solution, or an API Management / Azure Functions front-end
- **certified third-party** and **independent-publisher** connectors
- connectors with **non-Entra auth** (API key, basic, third-party OAuth)
- **on-premises data gateway** connectors

Tags: **[doc]** documented, **[lab]** lab-verified with ms 0.27 (Oct 2026), **[inf]** inferred, not tested.

### Support matrix

| Kind | Default CMR group (Microsoft-managed rule) | Group rule under full control | Environment outside any group |
|---|---|---|---|
| Custom connector | Blocked: CLI and deploy [lab] | The API accepted a custom connector ID and the CLI and deploy then allowed it [lab]. The ACP docs say custom connectors "aren't yet supported" [doc]: **undocumented, may change** | Add, deploy and `ms app info` work when DLP allows it [lab] |
| Independent publisher | Blocked [lab] | Allowed about 60 s after the policy change [lab]; generated code may not compile (below) | Allowed unless DLP blocks it [inf] |
| Certified third-party | Blocked [lab] | Admin adds it from the full catalogue [doc]; not exercised | `ms app add data-source` succeeded [lab] |
| Non-Entra auth | Excluded from the default list (it's Entra-only by design) [doc] | Needs a per-user connection and a consent prompt; no SSO [inf] | Same [inf] |
| On-premises gateway (e.g. SQL Server) | Blocked [lab] | The CLI config schema models gateway connections (`gatewayObjectIdHint`, `isOnPremiseConnection`) but it's undocumented and untested [inf] | Untested |
| Custom / remote MCP server | Not in the curated MCP list [doc] | Registered as a custom connector, it follows the custom-connector rules [inf] | [inf] |

### Binding and generated code

- No `ms` command creates or imports a connector: `ms connector` has only `list` and `list-actions` [lab]. Create the connector in the maker portal, with `pac connector create`, or by solution import. Then bind it like any other connector [lab]:

  ```
  ms app add data-source --connector "<display name or id>" --as action --non-interactive
  ```
- The generated code is the same as for first-party action connectors [lab]. `generated/services/<Name>Service.ts` calls `getClient(dataSources).executeAsync({ connectorOperation: { tableName, operationName, parameters } })`. `ms.config.json` gets a `connectionReferences` entry with the id `/providers/Microsoft.PowerApps/apis/shared_<slug>-<suffix>`.
- The suffix differs per environment when the connector is created separately in each one [lab], so the binding belongs to one environment. Whether a solution import keeps the id stable wasn't tested. Rebind per stage (AP-84).
- **SecretsScan.** The custom connector's `.ms/schemas/<connector>/<data-source>.Schema.json` contains `properties.apiDefinitions` (`originalSwaggerUrl`, `modifiedSwaggerUrl`) with Azure Storage SAS tokens. The platform Git rejects the push [lab]:

  ```
  SecretsScan: 2 secret(s) detected (first: Azure Storage Account Shared Access Signature (SymmetricKey256UrlEncoded) in .ms/schemas/…
  ```

  Remove `properties.apiDefinitions` from that file before you commit, and repeat after every add or refresh. Push and deploy then work [lab]. First-party and independent-publisher schemas don't contain it. GitHub push protection would likely flag it too [inf] (AP-82).
- **Code generation.** A non-curated OpenAPI definition can produce TypeScript that doesn't compile. The National Weather Service connector produced 13 errors (TS2300 duplicate identifier, TS2304 cannot find name, TS1016 required parameter after optional). The cloud build then failed with `Build failed: BuildFailed: Command exited with code 2: npm run build` [lab].
  - Run `npm run build` locally after every add.
  - Removing the broken generated files and their exports from `generated/index.ts` worked [lab].
  - Cleaner: bind with `--skip-codegen` (exists in 0.27, not exercised) and wrap the operations you need with `executeAsync` in `src/data/*` (AP-85).

### How an admin allows one

1. **Default group, Microsoft-managed rule.** It can't be edited. The policy API returns 403 `MicrosoftManagedRuleSetEditNotAllowed`: "Rule set(s) 'ConnectorManagement' … are managed by Microsoft and cannot be modified or removed by tenant administrators." [lab]
2. **Full control.** In MAC, *Edit this policy* takes full control: Microsoft stops updating the list, and the admin adds connectors from the full catalogue [doc].
   - Under full control, the rule-based policy API (`PATCH https://api.powerplatform.com/governance/ruleBasedPolicies/<policy-id>?api-version=2024-10-01`, full `name` + `ruleSets` body) accepted an independent-publisher connector and a custom connector in `AllowedConnectorList` [lab].
   - About a minute later, `ms connector list` showed `isBlocked: false`, and add and deploy worked [lab].
3. **Prefer a dedicated environment group** for the team that needs the connector over widening the default group for every maker (AP-83).
4. **Custom connectors, documented route: classic DLP.** ACP doesn't support custom connectors; classic data policies do, with custom-connector URL patterns and the Business / Non-business / Blocked groups [doc]. A group without a connector ACP, with "Advanced connector policies only" **off**, falls back to DLP [doc]. With that setting **on** and no ACP, nothing is restricted [doc].
5. **Removal and revert.**
   - Removing a connector from the rule made the next `ms app deploy` fail with 403, listing every blocked connector [lab]. Whether an already-deployed app stops working at runtime wasn't verified.
   - A PATCH with `managedBy: "Microsoft"` and the original inputs switched the rule back to Microsoft-managed (200) [lab]. That isn't documented; save the policy JSON before you take control.

### Where it's enforced, and what failure looks like

| Point | Behaviour | Message |
|---|---|---|
| `ms connector list` / `list-actions` | Client-side pre-check: `isBlocked`, `--only-allowed`, per-action `Allow` / `Block` [lab]. `isBlocked` tracked the ACP but stayed `false` for a connector in a classic DLP **Blocked** group; `list-actions` did show DLP connector-action rules (`behavior: "Block"`) [lab] | — |
| `ms app add data-source` | Client-side and **fail-open** [lab]. It checks allowed/blocked only, not DLP data groups | Exit 2: `Connector '<name>' is blocked by your organization's connector policy.` If the lookup fails: `Could not verify connector policy; proceeding without enforcement.` |
| `ms app deploy` (app save) | **Authoritative**, server-side, re-evaluated on every deploy, covers ACP **and** classic DLP [lab] | 403 `AcpDlpPolicyEvaluation`: "The app '<app-id>' cannot be saved because one or more connectors it uses '<ids>' are blocked by Advanced Connector Policy (ACP) or Data Policies (DLP) for this environment…" The violation details carry `PolicyType: AdvancedConnectorPolicy` + `ViolationType: BlockedConnector`, or `PolicyType: DLP` + `ViolationType: BusinessAndNonBusinessConnector` |
| Connection creation, direct connector runtime calls | Not blocked by ACP in the lab [lab] | — |
| Already-deployed app, existing connections, after a classic DLP change | **Not enforced**: calls kept working 6+ min after a data-group mix and right after the connector was moved to Blocked. The deploy at the same time returned 403 (`ViolationType: BlockedConnector`) [lab] | — |
| DLP connection re-evaluation (`Start-DLPEnforcementOnConnectionsInEnvironment`, `POST …/scopes/admin/environments/<environment-id>/reevaluateconnectionsdlp`) | Violating connections went to `Error / ConnectionIsDisabled` within seconds; the running app's calls then failed [lab] | `{"success":false,"error":{"message":"{\"status\":400,…\"message\":\"Error from token exchange: The connection is disabled so it cannot be used.\"}"}}` |
| New connection from the consent dialog to a DLP-**Blocked** connector | **Blocked** [lab] | `PUT /connectivity/apis/<api>/connections/<id>` → 400 `ConnectionApiPolicyViolation`: "Connection creation/edit of '<name>' has been blocked by Data Loss Prevention (DLP) policy '<policy>'." The host logs `App load failed: ConsentDenied` |
| Classic DLP **connector action control** | **Not enforced** for CMR. `ms.config.json` lists connectors, not operations; deploy succeeded and the blocked action still ran 7.5 min later [lab]. Power Apps enforces action rules on publish [doc] | — (AP-98) |

Hand-editing `ms.config.json` or `generated/` past a CLI block only moves the failure to deploy (AP-81). DLP data-group mixes surface only at deploy. Tightening DLP doesn't stop running apps until connections are re-evaluated (AP-99). The consent dialog is served by `apps.powerapps.com/consent`, the same consent service that Power Apps uses [lab].

### Alternatives when the connector isn't allowed

| Option | Works in CMR today? | Note |
|---|---|---|
| A curated connector or Microsoft MCP server that covers the need | Yes [doc] | First choice |
| Feed the data into Dataverse or SharePoint from an integration you own (Power Automate, Logic Apps, Functions) | Yes [inf] | The app stays on curated connectors; the integration is governed on its own |
| Dataverse custom API / plug-in | Only if the admin unblocks "Perform bound/unbound action" under full control [doc] | Unblocks every custom API on that connector |
| Call a Power Automate flow from the app | No flow data-source type in `ms` 0.27 [lab]; untested | Trigger flows indirectly (a Dataverse row or SharePoint item the app writes). Don't port `pa app add flow` (AP-96) |
| CMR server functions (`functions.baseDirectory`) | No: they pack and deploy, but calls return `501 MiddleTierRequestsNotSupported` [lab] | Undocumented; don't build on them (AP-97) |
| API Management / Azure Functions front-end exposed as a custom connector | Same rules as any custom connector [inf] | Good fit for a DLP-governed group; the API owns auth and throttling |
| Direct `fetch` after the admin adds the origin to CSP `connect-src` | Technically yes [doc] | **Anti-pattern**: bypasses connector governance and DLP (AP-20) |

### Decision guide

```
Need a connector outside the curated list?
├─ A curated connector or MCP server does the job?          → use it
├─ The data can live in Dataverse / SharePoint?             → integration outside the app, app on curated connectors
└─ The app must call it directly:
   ├─ certified / independent publisher                     → request it for a dedicated env group; build generated code locally
   ├─ non-Entra auth                                        → same, plus per-user connections and consent (no SSO)
   ├─ custom connector / APIM front-end                     → DLP-governed group (URL patterns, Business group); strip SAS before commit
   └─ on-premises gateway                                   → untested in CMR; prove it in a sandbox first
Never: direct fetch + CSP to dodge connector policy (AP-20); moving the app to an ungrouped env to escape the group (AP-36).
```

**ALM, licensing, inventory.**
- CMR apps aren't solution-aware and `ms` sets no connection references. Ship the custom connector in a managed solution and rebind the app in each environment with `ms app add data-source` [doc + inf].
- Running any CMR app needs Power Apps Premium or Copilot Credits [doc]. Custom-connector calls are connector operations, so on the credits path they're metered like any other call (0.1 credits per call) [inf].
- To see an app's connectors, use MAC → Apps → *app* → **Data & tools** [doc], or `ms app info --json` per app [lab]. A tenant-wide "apps by connector" query wasn't verified.
- Rule changes show in Purview as `UpdateRuleBasedPolicyOperation` / `UpdateRuleSetOperation` [doc].

Sources:
- [CMR governance](https://learn.microsoft.com/microsoft-365/admin/manage/apps/governance)
- [Advanced connector policies](https://learn.microsoft.com/power-platform/admin/advanced-connector-policies)
- [Connect to data](https://learn.microsoft.com/microsoft-365/managed-apps/developer/connect-to-data)
- [DLP for custom connectors](https://learn.microsoft.com/power-platform/admin/dlp-custom-connector-parity)

## Runtime capabilities that need governance attention

- **Dataverse MCP server** (allowed by default) exposes `create_table`, `update_table`, `delete_table` alongside record CRUD and `read_query`. For apps, schema changes belong in solutions (AP-31). Restrict schema tools in the MCP/connector rule where possible. Calling the environment's `/api/mcp` endpoint directly also requires the client app to be on the environment's **MCP allowed clients** list; otherwise you get 403 "not authorized to access MCP".
- **Container-creating actions** that stay allowed: Teams `CreateATeam` / `CreateChannel`, Planner `CreateBucket`, Excel `CreateTable`. Provision containers at design time instead (AP-32, [backend-provisioning](backend-provisioning.md)).

## Connection rules of thumb

- Prefer `--use-sso` for SSO-capable connectors → no manual connection, end users get a single consent.
- In non-interactive mode, pass `-c <connection-id>` whenever you own more than one connection for that connector.
- Each end user consents to each connection on first launch; fewer connectors = less friction and less attack surface.
- Dataverse in a **Dataverse-less personal dev environment** fails ("Unable to determine the Dataverse organization URL") and leaves a dangling connection → bind cross-environment with `--dataverse-environment-id` (see `cmr-dataverse`).
