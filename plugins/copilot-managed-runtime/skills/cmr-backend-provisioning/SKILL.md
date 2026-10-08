---
name: cmr-backend-provisioning
description: Provision and ship the backend a Copilot Managed Runtime app binds to — Dataverse tables in solutions (managed vs unmanaged), SharePoint sites/lists and Planner plans via idempotent scripts, repo layout and schema-first release order. USE WHEN an app needs new tables/lists/plans, asking "managed or unmanaged?" or "solution and repo?", or handling tables an AI (Dataverse MCP, Work IQ, Copilot Studio, Cowork) created. DO NOT USE WHEN only binding existing data (cmr-data-sources).
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
---

# Backend provisioning and Dataverse solutions

References: [backend-provisioning](../../references/backend-provisioning.md) (scripts) · [solutions-and-alm](../../references/solutions-and-alm.md) (managed vs unmanaged, release order) · [anti-patterns](../../references/anti-patterns.md).

## 1. Decide what the app needs (ask, don't assume)

| Need | Backend | Ships via |
|---|---|---|
| Relational, secured, app-owned records | Dataverse table(s) | Solution: unmanaged in dev → **managed** in test/prod |
| Team documents, lists business users already edit | SharePoint group site + list / library | Idempotent Graph script in `/provisioning` |
| Task board | Planner plan + buckets (group-owned) | Graph script; IDs become per-environment config |
| Spreadsheet | **Don't.** Use Dataverse or a SharePoint list (AP-33) | — |

Confirm with the user before creating anything in a tenant. Name the target environment or site, the identity that will be used, and whether the assets are throwaway or long-lived.

## 2. Golden rules

1. **The app creates content, never containers.** Tables, lists, libraries, plans and teams are created at design time by scripts or solutions, never by the running app or an MCP tool (AP-31, AP-32).
2. **Dataverse = solution, always.** Use a custom publisher prefix and create every component with `MSCRM.SolutionUniqueName` (or inside the solution in the maker portal). Nothing goes in the Default solution (AP-34).
3. **Unmanaged in dev, managed everywhere else**, and block unmanaged customizations in prod (AP-37).
4. **One repo, two tracks.** `/app` deploys with `ms app deploy`. `/dataverse/<Solution>` is imported as managed. **Schema first, then the app** (same SHA in every stage).
5. **Identical schema → identical codegen.** Generated code has no environment values, so after rebinding to test/prod the `generated/` diff must be empty (AP-38).
6. **Least-privilege provisioning identity**: `Sites.Selected` and an application user with a custom role. No Global Admin and no personal credentials in CI (AP-35).
7. **Pick internal names carefully.** SharePoint internal names and Dataverse logical names become your TypeScript field names forever.

## 3. Workflow

```
1. Design      → entities/columns/choices, personas → security roles, which store per entity
2. Provision   → DEV: publisher + unmanaged solution + tables (Web API or maker portal)
                 M365: group → site → lists/libraries; plan → buckets (Graph scripts, idempotent)
3. Bind        → ms app add data-source … --as table (Dataverse / SharePoint), Planner --as action
4. Commit      → pac solution clone|sync → /dataverse ; ms.config.json + generated/ + .ms/schemas/ → /app
5. Release     → CI: pack managed → import (test) → deploy app (test) → approvals → same for prod
6. Change      → schema change in DEV solution → sync → ms app refresh data-source → one PR
```

Lab-verified details:
- Table creation takes about 40 s. New attributes can fail with `0x80060888` until metadata settles, so retry with back-off.
- Choice values = option-value prefix × 10000 + n. They're generated as typed `as const` maps.
- A same-environment Dataverse bind needs no `--dataverse-environment-id`.
- A library bound `--as table` gives metadata only. Upload bytes with the SharePoint `CreateFile` action.
- Planner binds as actions only. The runtime surface has `CreateBucket` but no plan creation. In ms 0.27 the generated Planner service doesn't compile (TS2552), so build right after binding and remove it if the build fails ([backend-provisioning](../../references/backend-provisioning.md) §6).
- `pac solution clone` output contains the managed variants, so `pac solution pack --packagetype Managed` works straight from Git.

## 4. Citizen → pro-dev angle

Citizen apps often start on a SharePoint list or a table the maker created ad hoc in the Default solution. During handoff (`cmr-citizen-handoff`):
1. Move the tables into a proper solution with the org publisher, or recreate them and migrate the data.
2. Codify SharePoint and Planner setup as scripts.
3. Add `/dataverse` and `/provisioning` next to the app in the GHEC repo.
4. Switch to the two-track release.

## 5. AI-created containers (Work IQ, Dataverse MCP, Copilot Studio, Cowork)

Full matrix: [backend-provisioning](../../references/backend-provisioning.md) §10.

- **Citizens**: Copilot Studio Apps proposes Dataverse tables; Cowork and Microsoft 365 App Builder use Microsoft Lists; Work IQ can create lists, columns, Microsoft 365 groups (team sites) and Planner plans once an admin enables writes.
- **Pro-devs** can call the same tools from a coding agent (Work IQ MCP / `@microsoft/workiq`, the Dataverse MCP server in VS Code). Use them against **dev only**, and prefer asking the agent to *write* the provisioning script or solution instead of mutating the tenant.
- **Lab-verified**: Dataverse MCP `create_table` has no solution or publisher parameter, so the table lands unmanaged in the Default solution with the `cr<xxx>_` default prefix. Metadata processing blocks an immediate update/delete.
- **Rule**: AI-created containers are prototypes. Adopt them into a solution or a `/provisioning` script before production (AP-78). The app itself never calls schema tools at runtime (AP-31).

## Anti-patterns

AP-31 … AP-39, AP-12, AP-52, AP-78, AP-79. See [anti-patterns](../../references/anti-patterns.md).
