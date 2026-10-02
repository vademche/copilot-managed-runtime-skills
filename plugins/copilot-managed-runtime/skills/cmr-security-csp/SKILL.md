---
name: cmr-security-csp
description: Security for Copilot Managed Runtime apps — the default Content Security Policy and its consequences, how to request CSP changes, embedding, XSS/injection, secrets, identity and data-access threat model. USE WHEN the console shows "Refused to load/connect/frame", when adding fonts/CDNs/telemetry/iframes/workers, when embedding an app in SharePoint or another site, or when doing a security review. DO NOT USE WHEN configuring CSP for unrelated web hosts.
user-invocable: true
allowed-tools: Read, Edit, Grep, Glob, Bash
---

# Security and CSP

## 1. Threat model in one paragraph

The app is a static SPA running inside the CMR host. Users sign in with Entra ID (Conditional Access applies). Every data call goes through a connector **as the signed-in user** — the app can't exceed the user's own permissions, but it *can* expose everything the user can see to bugs (XSS, over-fetching, logging). The browser is untrusted: anything in the bundle is public to any user with play access. Security = (1) data-source permissions, (2) env-group policies (connectors/actions/sharing/CSP), (3) your code hygiene.

## 2. Default CSP (admin-owned, environment-wide)

| Directive | Default | Consequence for your code |
|---|---|---|
| `default-src` | `'self'` | bundle everything |
| `script-src` | `'self' <platform>` | no CDN scripts, no inline `<script>`, no `eval` |
| `style-src` | `'self' 'unsafe-inline'` | CSS-in-JS works; no CDN stylesheets |
| `connect-src` | `'self'` | **no `fetch` to external APIs** — use connectors (AP-20) |
| `font-src` | `'self'` | self-host fonts (AP-40) |
| `img-src` / `media-src` | `'self' data:` | external images blocked; proxy via connector or bundle |
| `form-action` | `'none'` | always `e.preventDefault()` in `onSubmit` (AP-41) |
| `frame-src` / `child-src` | `'self'` / `'none'` | no third-party iframes (AP-42) |
| `worker-src` / `manifest-src` | `'none'` | no web/service workers, no PWA (AP-43) |
| `object-src` | `'self' data:` | — |
| `base-uri` | `'self'` | — |
| `frame-ancestors` | `'self' <platform>` | embedding elsewhere needs admin change |

Custom values **merge** with defaults, except directives whose default is `'none'` — those are **replaced** (e.g. `worker-src 'self'`).

## 3. Diagnose a violation

1. Open the app (preview or Local Play), F12 → Console → Errors.
2. Find `Refused to <load|connect|frame> '<url>' because it violates ... "<directive> ..."`.
3. **First try to remove the need** (bundle the asset, use a connector, link out instead of iframe).
4. Only if legitimate: request the admin add the **exact origin** to the **exact directive** in the env group, roll out **report-only → enforce**, configure a report endpoint. Never `*`, `https:` or `'unsafe-inline'`/`'unsafe-eval'` for scripts (AP-46).
5. Changes propagate in minutes; reload and re-check.

Template request to admin:

> App `<app-name>` (`<app-id>`) in env group `<group>` needs `connect-src https://<region>.in.applicationinsights.azure.com` for telemetry ingestion. Requested rollout: report-only for 7 days, then enforce.

## 4. Embedding

To embed an app in `https://contoso.sharepoint.com` or a portal, the admin adds that origin to `frame-ancestors`. Embedding doesn't bypass sign-in or sharing.

## 5. Code hygiene checklist

- [ ] No `dangerouslySetInnerHTML` / `innerHTML` with connector or AI data; if markdown is needed use a sanitiser (DOMPurify) bundled locally (AP-45).
- [ ] No secrets, keys, connection strings in source, `.env`, or `ms.config.json` (AP-44). There is nothing to "hide" in a SPA.
- [ ] OData `$filter` built with escaped values (`'` → `''`).
- [ ] Authorisation enforced by data-source permissions (Dataverse roles, SharePoint permissions), not UI hiding (AP-25).
- [ ] No PII in logs/telemetry.
- [ ] Dependencies: lockfile committed, `npm audit` in CI, Dependabot/CodeQL on external GHEC repos.
- [ ] Only the connectors the app needs (each one = consent + surface) (AP-27).
- [ ] Links opened with `rel="noopener noreferrer"`.

## Anti-patterns

AP-20, AP-25, AP-27, AP-40 … AP-46. See [anti-patterns](../../references/anti-patterns.md) · [troubleshooting](../../references/troubleshooting.md).
