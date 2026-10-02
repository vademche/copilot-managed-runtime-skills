---
name: cmr-sharing
description: Share and unshare Copilot Managed Runtime apps with users, Entra groups and service principals at the right access level (play, edit, test), understand share links and policy limits, and keep data permissions aligned. USE WHEN granting or revoking access to an app, adding co-owners, enabling test automation identities, or when a user can't open an app. DO NOT USE WHEN sharing Power Apps canvas/code apps or SharePoint content.
user-invocable: true
allowed-tools: Read, Bash, AskUserQuestion
---

# Sharing

## Access levels

| `--access` | Grants | Give to |
|---|---|---|
| `play` (default) | run the live app | end users — **via Entra security groups** |
| `edit` | clone, push, build, deploy, share | ≥2 accountable co-owners (prefer a small group) |
| `test` | test operator | automation service principals / QA identities |

Sharing never grants data access — also grant SharePoint/Dataverse permissions (`cmr-dataverse`, `cmr-data-sources`).

## Commands (confirm with the user first)

```bash
ms app share expenses-users@contoso.com --access play          # group (preferred), csv for many
ms app share alice@contoso.com,bob@contoso.com --access edit   # co-owners
ms app share <sp-object-id> --access test                      # SP by enterprise-app object ID
ms app unshare alice@contoso.com --access edit                 # one access level per call
ms app share list --access play --json
ms app list --permission edit --json                           # what I can edit
```

## Policy limits

- Env-group **sharing rules** cap who you can share with (e.g. max individuals, groups allowed, no "everyone").
- `ms app share link create` returned **403 `AppShareLinkForbiddenForViralSharing`** under default rules — org-wide links are blocked unless the admin relaxes sharing. Prefer groups anyway.
- `ms app share list --access edit` returned 401 in preview — use `ms app list --permission edit` from the co-owner's account to verify.

## Practices

1. Create groups per persona (`<app>-users`, `<app>-approvers`, `<app>-owners`) and reuse them for **both** app sharing and data permissions.
2. Use **access reviews** on those groups for business-critical apps.
3. Ensure ≥2 edit owners to avoid orphaned apps (AP-65).
4. Grant `edit` only to people accountable for deployments — edit = full deploy rights (AP-61).
5. On leaver/role change: `ms app unshare` + group removal; check inventory for apps they solely own.
6. Tell users to expect the consent dialog on first launch and that they need a runtime licence (`cmr-licensing-cost`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| User sees "You don't have access" | share to a group they're in; group membership propagation can lag |
| App opens but data empty / 403 | data-source permission missing |
| Co-owner can't find app to clone | shared with `--access edit`? signed in with the right account? |
| Share rejected by policy | env-group sharing rule; ask admin or use a group |

## Anti-patterns

AP-60, AP-61, AP-65, AP-72. See [anti-patterns](../../references/anti-patterns.md).
