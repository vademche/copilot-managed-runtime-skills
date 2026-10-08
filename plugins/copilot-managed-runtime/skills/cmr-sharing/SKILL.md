---
name: cmr-sharing
description: Share and unshare Copilot Managed Runtime apps with users, Entra groups and service principals at the right access level (play, edit, test), understand share links and policy limits, and keep data permissions aligned. USE WHEN granting or revoking access to an app, adding co-owners, enabling test automation identities, or when a user can't open an app. DO NOT USE WHEN sharing Power Apps canvas/code apps or SharePoint content.
user-invocable: true
allowed-tools: Read, Bash, AskUserQuestion
---

# Sharing

## Before sharing: deploy

An app that was never deployed shows as **not published** in the Microsoft managed apps portal: nobody, including the owner, can run or edit it there. Push, then `ms app deploy --non-interactive --json` (returns `commitHash` and `appPlayUri`). After that, `ms app list --json` shows `lastDeployedTime`. Share after the first deploy.

## Access levels

| `--access` | Role assigned (from `share list`) | Scope | Grants | Give to |
|---|---|---|---|---|
| `play` (default) | `MicrosoftAppReader` | app | run the live app | end users, **via Entra security groups** |
| `edit` | `RepositoryContributor` | app repository | clone, push, build, deploy, share | ≥2 accountable co-owners (prefer a small group) |
| `test` | `MicrosoftAppTestOperator` | app | test operator | automation SPs and QA identities, **only in non-production validation environments** |

Lab notes (ms 0.27):
- `share list --access edit` also reports an app-scope `MicrosoftAppContributor` bucket. `share --access edit` only filled the repository role.
- `--access test` in a normal environment fails with 400 `FeatureNotEnabled`: "…available only in non-production validation environments".

Sharing never grants data access. Also grant SharePoint and Dataverse permissions (`cmr-dataverse`, `cmr-data-sources`).

## Principals (lab-verified)

| Principal | Accepted as | Result |
|---|---|---|
| User | UPN or object ID | `principalType: User` |
| Entra **security** group | object ID or mail | `principalType: Group` |
| Microsoft 365 group that isn't security-enabled | — | 400 "group is not security-enabled" |
| Service principal | **enterprise-app object ID** | `principalType: ApplicationUser` |
| Service principal by application (client) ID | — | rejected client-side: "not an AAD object ID (GUID) or a valid email address" |

A comma-separated batch is **atomic**. One unknown principal fails the whole call with "Sharing failed for: <x> (user or group not found). No permissions were changed."

## Commands (confirm with the user first)

```bash
ms app share expenses-users@contoso.com --access play          # group (preferred), csv for many
ms app share alice@contoso.com,bob@contoso.com --access edit   # co-owners
ms app share <sp-object-id> --access test                      # SP by enterprise-app object ID
ms app unshare alice@contoso.com --access edit                 # one access level per call
ms app share list --access play --json                         # repeat for edit (and test)
ms app list --permission edit --json                           # what I can edit
```

**Check `unshare` results.** With the wrong `--access`, unshare still returns `success: true`, but with `revokedCount: 0` and the principal listed in `notFound`. Read `revokedCount` and `notFound`, then confirm with `share list` for **each** access level (AP-87).

## Share links

```bash
ms app share link create --json   # {appShareLinkId: "<4-hex>", shareLinkUrl: ".../apps/<app-id>?ms_slid=<id>", managedAppRoleName: "MicrosoftAppReader", redeemedPrincipalIds: []}
ms app share link list --json
ms app share link revoke --link-id <id> --force   # broken in 0.27, see below
```

- Anyone in the tenant who redeems the link gets `MicrosoftAppReader` (play). That's the only role a link can grant. `redeemedPrincipalIds` shows who has redeemed it.
- Links are governed by the environment group's **sharing rule** ("viral sharing"):
  - In the default group, `link create` failed with 403 `AppShareLinkForbiddenForViralSharing` [lab].
  - In an ungrouped environment, it succeeded [lab].
- **Revoke bug (0.27):** `link revoke` always fails with "Provide a share link ID via --link-id.", however the ID is passed (`--link-id`, `-l`, `=`, positional or the `MAAF_SHARE_LINK_ID` env var). Revoke through the API it calls instead, using a Power Platform API token for the signed-in owner:
  - `DELETE https://<env-host>/appframework/apps/<app-id>/shareLinks/<id>?api-version=1` returns 204.
  - Calling it again returns 404 `AppShareLinkNotFound`.
  - `GET …/shareLinks?api-version=1` lists the links.
  - `<env-host>` is the host of the app's `cloneUrl` (`ms app info`).
  - Per the CLI, revocation also removes the role from everyone who redeemed the link.
- Prefer groups. If you must use a link, record its ID and plan its revocation (AP-86).

## Policy limits

- Env-group **sharing rules** cap who you can share with (e.g. max individuals, groups allowed, no "everyone") and whether links are allowed.

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
| Portal says the app isn't published, so it can't be run or edited | never deployed: `ms app deploy` |
| User sees "You don't have access" | share to a group they're in; group membership propagation can lag |
| App opens but data empty / 403 | data-source permission missing |
| Co-owner can't find app to clone | shared with `--access edit`? signed in with the right account? |
| Share rejected by policy | env-group sharing rule; ask admin or use a group |
| 400 "group is not security-enabled" | Microsoft 365 group; use a security group |
| 400 `FeatureNotEnabled` for `--access test` | test operator only exists in non-production validation environments |
| Unshare "succeeds" but access remains | wrong `--access` level (`revokedCount: 0`, `notFound`) |

## Anti-patterns

AP-60, AP-61, AP-65, AP-72, AP-86, AP-87. See [anti-patterns](../../references/anti-patterns.md).
