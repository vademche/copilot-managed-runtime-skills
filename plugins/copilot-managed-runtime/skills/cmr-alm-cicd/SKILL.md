---
name: cmr-alm-cicd
description: Application lifecycle for Copilot Managed Runtime apps — branching and release strategy, dev/test/prod separation, GitHub Actions with service principals (install-ms-cli, ms-app-pack, ms-app-deploy), external artifact deployment (`--repo none`), and the preview deployment-overlay ALM (`MS_CLI_ALM`). USE WHEN setting up CI/CD, promoting between environments, deploying from GitHub Actions or Azure DevOps, or designing release governance. DO NOT USE WHEN running ad-hoc local deploys (use cmr-inner-loop) or Power Platform solution pipelines for canvas/model-driven apps.
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
---

# ALM and CI/CD

## 1. Pick the delivery model

| Model | Build runs | Deploy trigger | Best for |
|---|---|---|---|
| **A. Platform build** (`native` / `github` repo) | CMR cloud build of a pushed commit | `ms app deploy --commit <sha>` (human or CI) | most teams; simplest provenance |
| **B. External artifacts** (`--repo none`) | your CI (GitHub Actions/ADO) | `ms-app-deploy` action / `ms app deploy --artifact` | regulated SDLC: your scanners, signed artifacts, approvals |
| **C. Preview ALM overlays** (`MS_CLI_ALM=true`) | CMR | `ms app deploy --deployment test|prod` | tenants where the app is associated with a managed project (preview) |

Model B prerequisite: the admin enables **`AllowExternalArtifactDeployment`** on the target environment; otherwise deploy fails with "External artifact deployment is not enabled for this environment".

**Dataverse-backed apps add a second track.** CMR apps aren't solution components, so the Dataverse schema they bind to ships as a **managed solution**. Its unpacked source lives in the same repo (`/dataverse/<Solution>`). Each stage runs: import the managed solution, then deploy the same app SHA. Power Platform Pipelines can move the solution but not the app. Details and a workflow sketch: [solutions-and-alm](../../references/solutions-and-alm.md), skill `cmr-backend-provisioning`.

## 2. Environment separation

Without preview ALM, **one app = one set of bindings**. For real dev/test/prod use **separate apps** (e.g. "Expenses (Test)" and "Expenses") built from the same repo/commit, each bound to its own data (AP-52). Promote by deploying the **same SHA** to each. Keep binding differences in `ms.config.json` per app directory/branch and document them.

Preview ALM (verify availability first):

```bash
export MS_CLI_ALM=true
ms app add config --deployment test            # creates ms.test.config.json overlay
ms app add data-source --deployment test --for <data-source-name> ...   # rebind per deployment
ms app deploy --deployment test
```

Fails with "App is not associated with a managed project" when the app wasn't created inside a **managed project**. Projects come from the hidden `MS_CLI_ALM=true ms project create` (writes `ms.project.config.json`); `ms app create` run inside that folder links the app (`projectId` in `ms.config.json`). In tests on 0.27 the project API returned `404 RouteNotFound`, meaning it wasn't rolled out. Probe with `ms project info` first, and if it isn't available, fall back to separate apps. Projects cannot be deleted from the CLI, so don't create throwaway ones.

## 3. GitHub Actions (Model B) — hardened

```yaml
name: deploy-cmr-app
on:
  push: { branches: [main], paths: ['apps/expenses/**', '.github/workflows/deploy-cmr-app.yml'] }
  workflow_dispatch:
permissions: { contents: read }
concurrency: { group: deploy-expenses, cancel-in-progress: false }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production            # GitHub environment with required reviewers
    defaults: { run: { working-directory: apps/expenses } }
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '24', cache: npm, cache-dependency-path: apps/expenses/package-lock.json }
      - run: npm ci
      - run: npm run lint && npm run typecheck && npm test --if-present
      - run: npm audit --audit-level=high
      - uses: microsoft/Managed-Apps/github-actions/install-ms-cli@v1.0.1   # pin an immutable tag or SHA
        with: { version: '0.27.0' }                                         # pin the CLI too
      - uses: microsoft/Managed-Apps/github-actions/ms-app-pack@v1.0.1
        with:
          working-directory: apps/expenses
          app-id: ${{ secrets.PP_SP_CLIENT_ID }}
          client-secret: ${{ secrets.PP_SP_CLIENT_SECRET }}
          tenant-id: ${{ secrets.PP_SP_TENANT_ID }}
      - uses: microsoft/Managed-Apps/github-actions/ms-app-deploy@v1.0.1
        id: deploy
        with:
          working-directory: apps/expenses
          cloud: prod                    # REQUIRED: the action defaults to 'test'
          app-id: ${{ secrets.PP_SP_CLIENT_ID }}
          client-secret: ${{ secrets.PP_SP_CLIENT_SECRET }}
          tenant-id: ${{ secrets.PP_SP_TENANT_ID }}
      - run: echo "Deployed ${{ steps.deploy.outputs.commit-sha }} → ${{ steps.deploy.outputs.app-play-uri }}" >> $GITHUB_STEP_SUMMARY
```

Rules:
- Pin action refs (AP-55) and the CLI version; review the action changelog before bumping.
- Always set `cloud: prod` for production tenants (AP-54) — check the action's `action.yml` for the accepted values in your version.
- SP permissions: see `cmr-setup-auth` (application user + System Administrator in Dataverse envs; EnvironmentAdmin via BAP with the **enterprise-app object ID** otherwise; `400 Principal not found` = wrong object ID).
- Use GitHub **environments** with required reviewers for production; least-privilege `permissions:`.
- Keep `ms.config.json` committed; never inject secrets into it.

For Model A in CI, replace pack/deploy with `ms app deploy --commit ${{ github.sha }} --non-interactive --json` after install, using the same SP env vars.

## 4. Branching & release

- Trunk-based: short-lived feature branches → PR → `main`. Preview (`/branch/main`) = integration; **live = explicit deploy**.
- Tag releases (`vX.Y.Z`); deploy tags, not arbitrary SHAs; rollback = redeploy previous tag.
- PR checks: lint, typecheck, unit tests, `ms app pack` (validates allowed actions), `cmr-review` checklist.
- Platform-managed Git has no branch protection or PRs and its pushes are not in Purview audit → use external GHEC for apps that require enforced review (AP-57).
- On `github` apps, protect `main` with a ruleset (PR, reviews, CODEOWNERS for `ms.config.json`, required checks, no force-push). The platform builds `main` and a push alone doesn't build. Deploy reviewed SHAs with `--commit` (AP-58). See [source-control](../../references/source-control.md).

## 5. Provenance for `--repo none`

You own it: build from a clean checkout, `npm ci` with lockfile, SBOM (`.ms/packed/.../package-inventory.json` is a start), artifact attestation, secret scanning, keep logs. Never upload zips built on laptops (AP-56).

## Anti-patterns

AP-50 … AP-58, AP-12, AP-13, AP-37 … AP-39. See [anti-patterns](../../references/anti-patterns.md) · [cli-cheatsheet](../../references/cli-cheatsheet.md) · [source-control](../../references/source-control.md) · [solutions-and-alm](../../references/solutions-and-alm.md).
