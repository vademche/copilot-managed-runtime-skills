# Source control: platform-managed Git vs enterprise GitHub vs none

How a CMR app's source of truth looks and behaves under each repository mode, and which settings (CMR and GitHub) change that behaviour.

Evidence tags: **[docs]** Microsoft Learn · **[cli]** `ms` 0.27 help/bundle · **[lab]** observed in a test tenant · **[inferred]** reasoned from the above and not verified end-to-end, so validate it in your tenant before relying on it.

## 1. The three modes at a glance

The mode is stamped as `repoType` in `ms.config.json` at create/init time and **cannot be changed**. Switching means registering a new app (AP-16). **[docs]**

| | **Platform-managed Git** `native` | **Bring your own GitHub** `github` | **Bring your own build** `none` |
|---|---|---|---|
| Create | `ms app create -n "<name>" ./dir` | `ms app create -n "<name>" --repo https://github.com/<org>/<repo> ./dir` (or `https://<sub>.ghe.com/<org>/<repo>`) | `ms app create -n "<name>" --repo none ./dir` |
| Where code lives | Private Git repo hosted by the platform in the app's environment (`https://<env>.environment.api.powerplatform.com/appframework/git/repositories/<repo-id>`) **[cli]** | Your GitHub Enterprise Cloud org (github.com or `*.ghe.com` data-residency) **[docs]** | Wherever you like; CMR only receives zips |
| Who builds | Platform, from `main` | Platform, from `main` of the GitHub repo | You (`ms app pack` / CI); deploy zips |
| Git auth | Entra ID via Git Credential Manager (OAuth client id stamped in the clone's git config) **[cli]** | GitHub identity, plus an Entra↔GitHub **mapping** via the *Managed Apps GitHub App* **[cli]** | n/a |
| Who can push | Owner + users shared with `--access edit` | Whoever GitHub grants **write** | n/a for CMR |
| Who can see preview | Edit-shared users | Users with **write access to the bound repo** **[docs]** | Edit-shared users |
| Clone | `ms app clone <app>` | `git clone <url>` (`ms app clone` is native-only) **[cli]** | n/a |
| PR, branch protection, rulesets, CODEOWNERS | ✗ (plain Git remote) | ✅ GitHub-native | ✅ in your own repo |
| CodeQL, Dependabot, secret scanning, push protection | ✗ | ✅ (GHAS licensing applies) | ✅ in your own repo |
| Code-change audit | ⚠ pushes are **not** in Purview audit **[docs]** | GitHub enterprise audit log (+ streaming to your SIEM) | Your CI + repo audit |
| Admin gate | none beyond CLI-creation rules | none in CMR; GitHub enterprise/org policies apply | **External artifacts** setting (off by default) **[docs]** |
| Best for | Prototypes, citizen ↔ pro-dev collaboration, fastest start | Business-critical apps that need an enterprise SDLC | Regulated pipelines, monorepos, custom toolchains |

## 2. Platform-managed Git (`native`): the "private repo"

- **Private by construction.** There's no anonymous or public visibility. Every Git operation needs an Entra token with rights on the app. Access follows CMR sharing: `ms app share <upn> --access edit` grants push and preview, `--access play` grants run only. **[cli]**
- **Data residency** follows the environment's geography because the repo lives in the environment. **[inferred]**
- **Clone/push:** `ms app clone <app-name>` writes the remote and the GCM OAuth settings. GCM needs an interactive browser, so agent shells can't complete it. See `cmr-setup-auth` for the device-code bearer-token workaround. **[lab]**
- **Builds:** `git push` does **not** build. Preview, `ms app build` and `ms app deploy` trigger a build of the latest `main`. Deploy without flags ships the latest *successful* build on `main`, and `--commit <sha>` pins it or rolls back. **[docs]**
- **Gaps:** no PR workflow, no branch protection, no code scanning, pushes not audited. Anyone with edit access can push straight to `main` and the next preview/deploy picks it up.
- **Before deleting an app**, mirror the repo (`git clone --mirror`) if you need history. Whether the repo is retained after `ms app delete` isn't documented. **[inferred]**

## 3. Bring your own GitHub (`github`): the enterprise-managed repo

### Hard requirements **[docs][cli]**

1. The repo is owned by an **organization on GitHub Enterprise Cloud**, on `github.com` or a `*.ghe.com` data-residency host. **Not supported:** GitHub Enterprise Server, personal-account repos, orgs not on GHEC, Azure DevOps and other providers.
2. A full `https://` URL. Bare `contoso.ghe.com/team/app` is rejected.
3. The repo must exist and be **completely empty**: no README, `.gitignore` or LICENSE. Create it with every "initialize" option unticked (`gh repo create <org>/<repo> --private` with no `--add-readme`, `--gitignore` or `--license`). Otherwise create fails with *"Repository … is not empty"*. To adopt an existing codebase, `git clone` it and run `ms app init --repo <url>` inside it instead (AP-17).
4. For `create`, the local target directory must be empty and Git must be installed.

### Identity mapping lifecycle **[cli][lab]**

```
ms git auth refresh --repo https://github.com/<org>/<repo>   # run inside the app folder (needs environmentId)
  ├─ CMR service starts a GitHub device-code flow against https://<repo-host>   (the repo host is the OAuth base)
  ├─ you enter the code at https://<repo-host>/login/device and authorise "Managed Apps"
  └─ CMR stores Entra identity ↔ githubLogin (expires: mappingExpiresAt); no GitHub token is stored locally
```

- `create`, `build` and `deploy` run this flow inline the first time it's needed and retry once. `--force-reauth` discards a bad mapping. `ms git auth refresh` outside an app folder exits 2 (*environment id is required*).
- The mapping is per **user and environment**, and it **expires**. Re-run `ms git auth refresh` when you see `GitHubMappingMissing`, `GitHubMappingExpired` or `GitHubMappingStale`.
- Starting the device-code flow does **not** check that the repo exists or that you can reach it. That check happens at create/build/deploy time. **[lab]**
- On an unknown or unconfigured `*.ghe.com` host, the flow fails with `GitHub /login/device/code returned unexpected status 'UnprocessableEntity'`. That means the Managed Apps GitHub App isn't available on that GitHub instance. **[lab]**
- The browser doesn't auto-open when there's no TTY, `MS_NO_BROWSER=1` or `CI=true`. The CLI prints the URL and code instead. **[cli]**
- **Service principals / CI:** the mapping is created interactively by a human. Platform-built deploys of a `github` app from CI (`ms-app-deploy` with `commit-sha`) can therefore fail with `GitHubMapping*`. If you need fully headless CI, use `--repo none` with external artifacts. **[inferred]**

### GitHub settings that change CMR behaviour

The control plane for repo governance is **GitHub**, not CMR. Microsoft points admins to GitHub's *enforcing repository management policies in your enterprise*. **[docs]** No CMR-side allow-list of GitHub orgs is documented.

| GitHub setting (enterprise → org → repo) | Effect on a CMR app | Recommendation |
|---|---|---|
| **Repo visibility**: private / internal / public | Source exposure. Preview needs **write**, so `internal` read access doesn't grant preview, but it does expose code to the whole enterprise. | **Private**. Enforce with the enterprise "repository visibility" policy (AP-19). |
| **Base permissions** and **teams** | Write access is the list of who can push **and** who can preview | Grant `write` through a team per app, not per user. Base permission `none` or `read`. |
| **GitHub App installation / OAuth policies** | The Managed Apps GitHub App must be allowed for the org; restrictive app policies block the mapping or repo access | Org owner reviews and approves the app once per org **[inferred]** |
| **IP allow list** (enterprise or org) | Calls from the CMR service to GitHub may be blocked | Enable *allow access by GitHub Apps* for installed apps, or add the service ranges **[inferred]** |
| **Enterprise Managed Users (EMU)** | Users authorise with their managed `*_shortcode` account; only enterprise-owned repos are reachable | Supported as GHEC. Map with the EMU account. **[inferred]** |
| **SAML SSO** (non-EMU GHEC) | The user must have an active SSO session for the org when authorising | Authorise the app for SSO when prompted **[inferred]** |
| **Rulesets / branch protection on `main`** | CMR builds `main`, so rules decide what can reach production | Require PR and reviews, status checks, signed commits and linear history. Block force-push and deletion (AP-58). |
| **CODEOWNERS** | Required reviewers for `ms.config.json`, `generated/` and `.ms/` | Route data-source and `ms.config.json` changes to the platform team |
| **Push protection and secret scanning** | Stops secrets landing in a repo the platform builds | Enable at the enterprise level |
| **Actions policies** | Whether workflows (lint/test/CodeQL) can run alongside the platform build | Allow only verified and pinned actions (AP-55) |
| **Audit log streaming** | Gives you the code-change audit trail that native repos lack | Stream to Sentinel or your SIEM |

### Recommended GitHub layout per app

```
org: contoso-apps (GHEC, EMU or SSO)
└─ repo: expenses-app            private, empty at bind time
   ├─ team expenses-devs    → write    (= can push and see preview)
   ├─ team platform-admins  → maintain
   ├─ ruleset "main"        → PR + 1 review + CODEOWNERS + checks (lint, test, CodeQL)
   └─ .github/
      ├─ CODEOWNERS          ms.config.json @contoso-apps/platform-admins
      └─ workflows/ci.yml    npm ci && npm run lint && npm test   (validation only; CMR builds/deploys)
```

Flow: feature branch → PR → checks and review → merge to `main` → `ms app play --mode preview` (platform builds `main`) → `ms app deploy --commit <merged-sha>`.

## 4. Bring your own build (`none`)

- No repo binding at all. The app is created with `repoType: none`, and you deploy with `ms app deploy` (local pack) or `ms app deploy --artifact app.zip` / the `ms-app-deploy` action with `artifact-path`. **[docs]**
- Gate: **External artifacts in managed apps** (PPAC → Copilot → Settings → Managed apps, or an environment-group rule). It's off by default, and a group rule locks the environment setting. **[docs]**
- This mode suits headless CI with a service principal, because no GitHub mapping is involved. You own provenance, scanning and signing (AP-56).

## 5. Choosing

```
Citizen-led prototype or team collaboration in CMR only?  → native
Business-critical, needs PR review / scanning / audit, the org has GHEC?
   ├─ humans deploy reviewed SHAs                           → github
   └─ fully headless CI/CD with a service principal         → none (+ external artifacts)
No GHEC (GitHub Free/Team, GHES, Azure DevOps)?            → none, with your own repo + CI
```

Citizen → pro-dev path: start `native`. When the app becomes critical, create a **new** app with `--repo <ghec-url>` (or `none`), push the history into the empty GitHub repo **after** binding, re-add data sources, re-share and retire the old app. The URL and app ID change (see `cmr-citizen-handoff`).

## 6. Error map

| Code / message | Meaning | Fix |
|---|---|---|
| `GitHubMappingMissing` / `Expired` / `Stale` | No valid Entra↔GitHub mapping for this user and environment | `ms git auth refresh --repo <url>`; `--force-reauth` |
| `GitHubAuthDenied` | User declined the Managed Apps GitHub App | Re-run and approve. If the org blocks the app, ask the org owner. |
| `GitHubAuthSessionExpired` / `GitHubAuthCancelled` | Device code not completed in time / Ctrl-C | Re-run and finish within the displayed window |
| `GitHubAuthSessionNotFound` | Server lost the session | Re-run |
| `GitHubUpstreamError` | GitHub or the service returned an unexpected state | Retry, then check GitHub status |
| `…/login/device/code returned … UnprocessableEntity` | The host has no Managed Apps GitHub App (unknown or unsupported host) | Check the URL is a GHEC or `*.ghe.com` host |
| `Repository … is not empty` | The repo has any file (README, `.gitignore`, LICENSE) | Use a fresh empty repo, or `ms app init` in an existing clone |
| `Environment id is required for ms git auth refresh` | Run outside an app folder | `cd` into the app (or set `environmentId`) |
| `DeploymentRejected` | Service rejected the deploy (policy or config) | Check the app's mode/settings and admin rules |
| `External artifact deployment is disabled` | `none` mode without the admin setting | Admin enables external artifacts |

## 7. Anti-patterns

AP-16, AP-17, AP-18, AP-19, AP-56, AP-57, AP-58. See [anti-patterns](anti-patterns.md).
