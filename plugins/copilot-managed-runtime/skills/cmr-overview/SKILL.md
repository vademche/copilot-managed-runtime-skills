---
name: cmr-overview
description: Orientation for Microsoft Copilot Managed Runtime (CMR) — what it is, how its layers fit, and which cmr-* skill to use next. USE WHEN the user mentions Copilot Managed Runtime, managed apps, the `ms` CLI, `@microsoft/managed-apps`, `ms.config.json`, or asks "how do I build an app on CMR". DO NOT USE WHEN the project uses Power Apps code apps (`pac code`, `power.config.json`, `@microsoft/power-apps`), canvas apps or Power Pages — those are different products.
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
---

# Copilot Managed Runtime — overview and router

## 1. Detect that this really is CMR

| Signal | CMR | Not CMR |
|---|---|---|
| Config file | `ms.config.json` | `power.config.json` (code apps), `.msapp`/`*.pa.yaml` (canvas) |
| SDK | `@microsoft/managed-apps` (`/app`, `/auth`, `/data`, `/telemetry`) | `@microsoft/power-apps` |
| CLI | `ms` (`@microsoft/managed-apps-cli`) | `pac code ...` |
| Folders | `generated/`, `.ms/` | `src/generated/`, `.power/` |

If signals are mixed, stop and ask the user which product they target (AP-01).

## 2. Mental model

```
┌───────────────────────── Your SPA (React/Vite/TS — any framework) ─────────────────────────┐
│  UI components ──► src/data/* (your wrappers) ──► generated/services/* (typed, codegen)      │
└───────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                            │ @microsoft/managed-apps SDK (/app /auth /data /telemetry)
┌───────────────────────────────────────────▼──────────────────────────────────────────────────┐
│ CMR host: Entra sign-in · consent · connection brokering · CSP · sharing · Conditional Access │
│           · ACP/DLP · env-group policy · metrics                                              │
└───────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                            │ connectors / MCP servers (per-user connections)
                         SharePoint · Dataverse · Outlook · Teams · O365 Users · Work IQ MCP · …
```

- **Source of truth** = a Git repo (platform-managed, external GitHub Enterprise Cloud, or none for CI-built artifacts).
- **Build** happens in the cloud from a **commit**; **deploy** promotes a build to **live**. Preview tracks `main`.
- **Apps live in the maker's personal developer environment**, governed by a tenant **environment group** (routing, connectors+MCP, sharing, CSP).
- **No backend of your own** by default: all data goes through connectors; the browser can only talk to `'self'`.

## 3. Lifecycle → skill map

| Stage | Skill |
|---|---|
| Install CLI, sign in, CI identities | `cmr-setup-auth` |
| Create / register / choose repo model / templates | `cmr-create-app` |
| Local dev loop, preview, build, deploy, play | `cmr-inner-loop` |
| Pick & bind connectors (SharePoint, Excel, O365, Teams …) | `cmr-data-sources` |
| Dataverse tables, cross-env binding, security | `cmr-dataverse` |
| Create tables/lists/plans, managed vs unmanaged solutions, schema releases | `cmr-backend-provisioning` |
| Work IQ / MCP servers from an app | `cmr-mcp-workiq` |
| SDK usage, error handling, telemetry, App Insights | `cmr-sdk-patterns` |
| CSP, XSS, secrets, threat model | `cmr-security-csp` |
| Environments, GitHub Actions, external artifacts, preview ALM | `cmr-alm-cicd` |
| Share with users/groups/SPs, owners | `cmr-sharing` |
| Citizen app (Copilot Studio / Cowork) → pro-dev | `cmr-citizen-handoff` |
| Admin: env groups, policies, inventory, audit | `cmr-governance-admin` |
| Licensing, Copilot Credits, cost-aware design | `cmr-licensing-cost` |
| Something is broken | `cmr-troubleshooting` |
| Review a CMR repo / PR | `cmr-review` |

Microsoft's own plugin (`microsoft-managed-apps@Managed-Apps`) covers the basic CRUD-style commands (create, add-*, deploy, share). These skills add **governance, ALM, security, quality and handoff** guidance and work alongside it.

## 4. Ground rules for agents

1. Run `ms --version` and `ms <cmd> --help` before relying on any flag (preview drift — AP-71).
2. Always pass `--non-interactive --json` from agent shells (AP-70).
3. Never hand-edit `ms.config.json` or `generated/` (AP-10, AP-11).
4. Confirm with the user before `deploy`, `delete`, `share`/`unshare`, or anything that changes who can see data.
5. Keep examples tenant-neutral (`contoso`, `<environment-id>`) (AP-73).

References: [cli-cheatsheet](../../references/cli-cheatsheet.md) · [sdk-api](../../references/sdk-api.md) · [generated-code](../../references/generated-code.md) · [ms-config](../../references/ms-config.md) · [connectors-and-policy](../../references/connectors-and-policy.md) · [governance-quick-ref](../../references/governance-quick-ref.md) · [source-control](../../references/source-control.md) · [backend-provisioning](../../references/backend-provisioning.md) · [solutions-and-alm](../../references/solutions-and-alm.md) · [anti-patterns](../../references/anti-patterns.md) · [troubleshooting](../../references/troubleshooting.md)
