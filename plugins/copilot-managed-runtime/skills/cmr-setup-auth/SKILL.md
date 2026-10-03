---
name: cmr-setup-auth
description: Install and verify the Copilot Managed Runtime `ms` CLI, sign in, switch accounts, refresh GitHub mappings, and configure service-principal identities for CI. USE WHEN setting up a machine or pipeline for CMR, when `ms` is missing, when auth/sign-in fails, or when preparing a service principal for GitHub Actions. DO NOT USE WHEN configuring `pac` CLI auth for Power Apps code apps.
user-invocable: true
allowed-tools: Read, Bash, AskUserQuestion
---

# Set up the CLI and identities

## Prerequisites

- Node.js LTS (CI examples use Node 24) and npm.
- Git. On Windows: Git Credential Manager (bundled with Git for Windows) — used for the platform-managed repo.
- An Entra user that the tenant's **routing rule** sends to a personal developer environment, and **CLI creation allowed** for that user's env group (admin setting).
- A licence path for runtime (Power Apps Premium or Copilot Credits) — see `cmr-licensing-cost`.

## Steps (interactive developer)

```bash
npm install -g @microsoft/managed-apps-cli      # or rely on the project devDependency + npx
ms --version                                    # record it; flags differ between previews
ms auth login
ms auth status                                  # expect: Signed in as <upn> (account ID: <oid>.<tenant-id>)
```

Multiple tenants/accounts: `ms auth switch`, then re-check `ms auth status` **before any write command**.

External GitHub (GHEC) repos: `ms git auth refresh --repo https://github.com/<org>/<repo>` (device-code flow against the repo's host via the *Managed Apps* GitHub App). Run it **inside the app folder** (it needs `environmentId`). It stores an Entra↔GitHub login mapping server-side that **expires** (`mappingExpiresAt`), and no GitHub token is kept locally. Re-run on `GitHubMappingMissing|Expired|Stale`, and use `--force-reauth` on create/build/deploy if the mapping is corrupt. EMU users authorise with their managed account. If the org blocks the app (`GitHubAuthDenied`) an org owner must approve it. Details: [source-control](../../references/source-control.md).

## Steps (CI / service principal)

1. Entra app registration + client secret (or federated credential where supported by your pipeline tooling). Store as `PP_SP_CLIENT_ID`, `PP_SP_CLIENT_SECRET`, `PP_SP_TENANT_ID` secrets.
2. Grant the SP rights in the **app's environment**:
   - Environment **with** Dataverse → add an *application user* with **System Administrator** (+ System Customizer).
   - Environment **without** Dataverse → assign **EnvironmentAdmin** via the BAP role-assignment API using the SP **object ID** (Enterprise applications blade), not the client ID.
3. Share the app with the SP if it must operate on it: `ms app share <sp-object-id> --access edit` (or `--access test` for test automation).
4. GitHub-bound (`repoType: github`) apps rely on a **per-user** GitHub mapping that a service principal can't create headlessly. For fully headless CI prefer `repoType: none` + external artifacts, and validate SP deploys of `github` apps in your tenant first.
5. In the job, export `MS_CLI_SP_CLIENT_ID`, `MS_CLI_SP_CLIENT_SECRET`, `MS_CLI_SP_TENANT_ID` (the official actions do this from `app-id`/`client-secret`/`tenant-id` inputs). With `CI=true` SP auth activates automatically; `MS_CLI_USE_SP_AUTH=true` forces it.

## Agent rules

- Never echo secrets; never write tokens to files in the repo.
- If `ms auth status` shows an unexpected tenant, stop and ask — don't deploy into the wrong tenant.
- Agent shells can't complete GCM's interactive OAuth for the platform Git remote. Ask the user to run the first `git push` in their own terminal, or (only if they agree) pass a short-lived bearer token for one command via `git -c "http.extraHeader=Authorization: Bearer <token>" push` — never persist it.

## Verify

```bash
ms auth status --json
ms app list --permission edit --json    # proves the identity can reach the service
```

## Anti-patterns

AP-53 (personal creds in CI), AP-70 (interactive in agents), AP-44 (secrets in repo). See [anti-patterns](../../references/anti-patterns.md).
