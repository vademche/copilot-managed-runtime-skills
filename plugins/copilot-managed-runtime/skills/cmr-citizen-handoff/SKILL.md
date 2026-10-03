---
name: cmr-citizen-handoff
description: Find and take over a Copilot Managed Runtime app a citizen built in Copilot Studio, Cowork or Copilot Code — locate, access, clone, assess, harden as pro-code, and hand back without breaking identity, sharing or regeneration. USE WHEN asked to take over, extend, productionize or fix a citizen-built app, find which app a maker built, or plan a citizen-to-pro-dev process. DO NOT USE WHEN creating a new app (cmr-create-app) or reviewing orphans tenant-wide (cmr-governance-admin).
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
---

# Citizen → pro-dev handoff

Apps created in **Copilot Studio (apps experience)** and **Copilot Cowork** are ordinary CMR apps backed by Git. Same app ID, same inventory entry, same sharing — so **continue the app, don't rewrite it** (AP-62).

## 1. Get access (maker does this)

```bash
ms app share <dev-upn-or-group> --access edit       # or Share → edit in the maker UI where available
```

## 2. Find and clone (developer)

How to find the app depends on what you have:

| You have | Do |
|---|---|
| Edit access already | `ms app list --permission edit --json` and pick the `appId` |
| A play link from the maker (`https://<play-host>/apps/<app-id>`) | The last path segment is the app ID. `ms app info --app <app-id> --json` (no `-e` needed; the CLI finds the environment) |
| Only the app name | Ask an admin to look it up in MAC → Apps → All apps or the inventory API ([inventory-orphans-adoption](../../references/inventory-orphans-adoption.md)). `ms app list` only shows apps shared with you |
| The maker has left | It's an orphaned app. Check usage first, then follow the orphan path in `cmr-governance-admin` §5. Without someone holding edit access, the platform-managed source can't be cloned |

```bash
ms auth login            # with the account that received edit
ms app info --app <app-id> --json         # owner, environment, repo type
ms app clone --app <app-id> ./contoso-app # platform-managed Git; configures Git auth
cd contoso-app && npm install
ms app dev
```

External GitHub-backed app → `git clone <repo-url>` instead. Apps without a source binding can't be cloned.

## 3. Assess (first hour)

Run `cmr-review` and record:
- Data: where do records live? **Browser-local storage** in a citizen app is not shared or governed — migrate to SharePoint/Dataverse before wider rollout.
- **Containers an AI created for the maker.** Copilot Studio Apps, the Dataverse MCP `create_table` tool and Cowork / Work IQ can create Dataverse tables or SharePoint lists while the citizen builds. In the lab, a Dataverse MCP table landed **unmanaged, in the Default solution, with the default publisher prefix** (`cr<xxx>_`). Check each table's solution and prefix (`pac solution list`, the maker portal's Solutions view), and each list's site and owner. Adopt them before production (§5, AP-78).
- Sample/seed data embedded in code (Copilot Studio may generate it).
- Connections and connectors used; anything blocked by the target env group.
- Generated vs hand-written code; tests (usually none); error handling (`success` checks).
- Who it's shared with; owners; licence path.

## 4. Agree the operating model

| Option | When | Rule |
|---|---|---|
| **Pro-dev owns code from now** | app becomes business-critical | maker stops using the AI editor; changes via PR |
| **Shared ownership** | maker keeps iterating UI | maker iterates in Copilot Studio; dev works in short-lived branches, `git pull` before every session, small commits |
| **Hand back** | dev fixed one thing | push, deploy, tell maker to refresh/pull in their tool |

Copilot Studio guidance: **don't hand-edit the connection code it generated** — ask its agent to change data connections, otherwise regeneration breaks (AP-63). Coordinate who changes data bindings.

## 5. Harden

1. `.gitattributes`, pinned CLI/devDeps, lint/typecheck scripts.
2. Wrap generated services in `src/data`, add `unwrap`/error boundary (`cmr-sdk-patterns`).
3. Replace browser-local storage with an organisational data source; migrate data.
4. Adopt AI-created containers. Dataverse: add the table to the app's solution (`pac solution add-solution-component`), or recreate it under the org publisher and migrate the rows if the prefix matters (a prefix can't be changed). SharePoint: write an idempotent `/provisioning` script that matches the existing list, and move it to a group-owned site if it lives in someone's personal space. See `cmr-backend-provisioning`.
5. Remove sample data from production paths.
6. Share with groups; add a second owner (`cmr-sharing`).
7. Consider moving business-critical apps to an external GHEC repo for PR policies. This means a **new app** registration (repo type is permanent): create an empty private GHEC repo, `ms app create --repo <url>`, push the old history **after** binding, re-add data sources, re-share and plan for the URL change. See [source-control](../../references/source-control.md) §5.
8. Commit, push, build, preview, **then** deploy.

## 6. Tell the maker

Summarise: what changed, which preview/live URL, whether they may keep editing in Copilot Studio, and that **publish/deploy** is what updates users (pushing alone doesn't — AP-51).

Note: Cowork app creation is a Frontier/preview capability; availability varies by tenant.

## Anti-patterns

AP-51, AP-62, AP-63, AP-65, AP-74, AP-78. See [anti-patterns](../../references/anti-patterns.md).
