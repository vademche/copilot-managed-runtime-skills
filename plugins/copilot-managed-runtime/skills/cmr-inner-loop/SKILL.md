---
name: cmr-inner-loop
description: Run the Copilot Managed Runtime developer loop — local dev with Local Play, pack, commit/push, cloud build, preview, deploy to live, and play. USE WHEN running `ms app dev`, debugging locally, building, deploying, checking build status, or explaining preview vs live. DO NOT USE WHEN setting up CI pipelines (use cmr-alm-cicd).
user-invocable: true
allowed-tools: Read, Edit, Bash, Grep, Glob, AskUserQuestion
---

# Inner loop: dev → pack → push → build → preview → deploy

## 1. Local development

```bash
ms app dev
```

- With `@microsoft/managed-apps-vite-plugin` (default template): Vite on `http://localhost:5173` and a **Local Play URL** like
  `https://play.preview.managedapps.cloud.microsoft/apps/dev?ms_appUrl=...&ms_appConfigUrl=.../__vite_managedapps_plugin__/ms.config.json`.
  Open **that** URL (not localhost) — the host provides auth and real connections.
- Without the plugin: `ms app dev -l http://localhost:3000 -p 8080` (dev server URL + config server port) or `--config-only` when you run the dev server yourself.
- Real data, real policies, real consent — treat dev as production data access.
- Agents: run `ms app dev` as a long-lived background process; read the printed play URL; stop it when done.

## 2. Pre-flight

```bash
npm run lint && npm run typecheck && npm test   # whatever the project defines
ms app pack                                     # local build + staging in .ms/packed/apps/<appId>/
```

Inspect `.ms/packed/apps/<appId>/` (`client/`, `manifest.json`, `dataSources.json`) to confirm what will ship.

## 3. Commit and push (Git-backed apps)

Cloud builds use the **pushed commit**, not your working tree.

```bash
git add -A && git commit -m "feat: ..." && git push
```

## 4. Build, preview, deploy

```bash
SHA=$(git rev-parse HEAD)
ms app build --commit $SHA --json            # waits; ~30–60 s
ms app build-status --commit $SHA --show-log # on failure
ms app play --mode preview --commit $SHA --no-browser   # review a specific build
ms app deploy --commit $SHA --json           # promote to LIVE (reuses the build for that SHA)
ms app play --mode live --no-browser
```

| URL | Content | Changes when |
|---|---|---|
| Preview `/apps/<app-id>/branch/main` (or `--commit`) | latest main / given commit | you push + build |
| Live `/apps/<app-id>` | the last **deployed** commit | you run `ms app deploy` |

`ms app deploy` alone (no `build`) will build if needed. `--force` exists for dirty/unpushed trees — **prototypes only** (AP-50).

`repoType: none`: `ms app deploy` packs + uploads; or `ms app deploy --artifact ./app.zip` (admin-gated).

## 5. Confirm before deploy

Agents must confirm with the user before `ms app deploy` (it changes what every shared user sees). Report back: commit SHA, live URL, and what changed.

## 6. Rollback

Redeploy a previous good SHA: `ms app deploy --commit <previous-sha>`. Keep tags for releases (`git tag v1.2.0 && git push --tags`) so rollback targets are obvious.

## Gotchas (verified)

- First launch shows a consent dialog listing every connection — expected.
- `getContext()` / `getUser()` resolve before consent completes; data calls wait for consent.
- React effects ran twice even in production → keep loads idempotent (AP-30).
- Live does **not** auto-update on push (AP-51).

## Anti-patterns

AP-30, AP-50, AP-51, AP-70. See [anti-patterns](../../references/anti-patterns.md) · [troubleshooting](../../references/troubleshooting.md).
