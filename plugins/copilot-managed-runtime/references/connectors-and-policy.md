# Connectors, MCP servers and policy — decision guide

## What is allowed by default

Governance is **initialised on the first app creation in the tenant**. In the lab tenant, ~1 280 of ~1 300 connectors became blocked, leaving the allow-list below. The admin can widen or narrow it (see `cmr-governance-admin`).

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
Third-party SaaS / your own API / SQL / Azure Function?       → Blocked by default. Options:
                                                                 a) admin adds connector to env-group allow-list
                                                                 b) admin adds origin to CSP connect-src (no connector governance!)
                                                                 c) front it with an approved Microsoft service (Dataverse, SharePoint)
```

## Policy layers that apply at runtime

1. **Environment group rule** (CMR connectors + MCP allow-list, blocked actions).
2. **Advanced Connector Policies (ACP)** and classic **DLP** — when "Advanced connector policies only" is off, *both* apply and the most restrictive wins.
3. **Sharing rule** (org-wide / guests).
4. **CSP** (browser-level egress).
5. **Data-source security** (Dataverse roles, SharePoint permissions) — evaluated as the signed-in user.

Policy changes can **break a deployed app** (connection fails at launch). Keep the data layer behind your own service module so a swap is local.

## Connection rules of thumb

- Prefer `--use-sso` for SSO-capable connectors → no manual connection, end users get a single consent.
- In non-interactive mode, pass `-c <connection-id>` whenever you own more than one connection for that connector.
- Each end user consents to each connection on first launch; fewer connectors = less friction and less attack surface.
- Dataverse in a **Dataverse-less personal dev environment** fails ("Unable to determine the Dataverse organization URL") and leaves a dangling connection → bind cross-environment with `--dataverse-environment-id` (see `cmr-dataverse`).
