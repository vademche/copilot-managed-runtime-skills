---
name: cmr-backend-provisioning
description: Provision and ship the backend a Copilot Managed Runtime app binds to — Dataverse tables in a solution (publisher, unmanaged in dev, managed downstream), SharePoint group sites/lists/libraries and Planner plans via idempotent Graph scripts, repo layout (/app + /dataverse + /provisioning), schema-first release order, and how Dataverse solutions relate to the app's Git repo. USE WHEN an app needs new tables/lists/libraries/plans, when asked "managed or unmanaged solution?", "do I need a solution and a repo?", how to promote Dataverse schema with a CMR app, or how to script backend setup for citizen-to-pro-dev handoff. DO NOT USE WHEN binding existing data sources only (use cmr-data-sources / cmr-dataverse), or for canvas/model-driven/code-apps solution ALM.
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
- Planner binds as actions only. The runtime surface has `CreateBucket` but no plan creation.
- `pac solution clone` output contains the managed variants, so `pac solution pack --packagetype Managed` works straight from Git.

## 4. Citizen → pro-dev angle

Citizen apps often start on a SharePoint list or a table the maker created ad hoc in the Default solution. During handoff (`cmr-citizen-handoff`):
1. Move the tables into a proper solution with the org publisher, or recreate them and migrate the data.
2. Codify SharePoint and Planner setup as scripts.
3. Add `/dataverse` and `/provisioning` next to the app in the GHEC repo.
4. Switch to the two-track release.

## Anti-patterns

AP-31 … AP-39, AP-12, AP-52. See [anti-patterns](../../references/anti-patterns.md).
