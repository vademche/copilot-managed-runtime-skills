---
name: cmr-citizen-handoff
description: Take over an app created by a citizen maker in Copilot Studio (apps experience) or Copilot Cowork and continue it as pro-code in a Copilot Managed Runtime repo — access, clone, assess, harden, and hand back without breaking the app's identity, sharing or regeneration. USE WHEN a maker asks a developer to "take over", "extend", "productionize" or "fix" an app built with Copilot Studio or Cowork, or when planning a citizen-to-pro-dev fusion process. DO NOT USE WHEN creating a brand new app (use cmr-create-app).
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

```bash
ms auth login            # with the account that received edit
ms app list --permission edit --json      # copy appId
ms app clone --app <app-id> ./contoso-app # platform-managed Git; configures Git auth
cd contoso-app && npm install
ms app dev
```

External GitHub-backed app → `git clone <repo-url>` instead. Apps without a source binding can't be cloned.

## 3. Assess (first hour)

Run `cmr-review` and record:
- Data: where do records live? **Browser-local storage** in a citizen app is not shared or governed — migrate to SharePoint/Dataverse before wider rollout.
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
4. Remove sample data from production paths.
5. Share with groups; add a second owner (`cmr-sharing`).
6. Consider moving business-critical apps to an external GHEC repo for PR policies — this means a **new app** registration (repo type is permanent); plan re-sharing and URL change.
7. Commit, push, build, preview, **then** deploy.

## 6. Tell the maker

Summarise: what changed, which preview/live URL, whether they may keep editing in Copilot Studio, and that **publish/deploy** is what updates users (pushing alone doesn't — AP-51).

Note: Cowork app creation is a Frontier/preview capability; availability varies by tenant.

## Anti-patterns

AP-51, AP-62, AP-63, AP-65. See [anti-patterns](../../references/anti-patterns.md).
