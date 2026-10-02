# copilot-managed-runtime — agent guidance

Guidance for AI agents **using** this plugin inside a Copilot Managed Runtime (CMR) project, and for agents **editing** this plugin.

## When working in a CMR app repo

- Confirm it is CMR: `ms.config.json` at the root and `@microsoft/managed-apps` in `package.json`. `power.config.json` / `pac code` means Power Apps code apps — a different product; don't apply these skills.
- Start with `cmr-overview` if unsure which skill applies. Load the specific `cmr-*` skill before acting.
- Always run `ms` with `--non-interactive` (and `--json` where supported). On exit code 2, read the listed valid values instead of guessing.
- Never hand-edit `generated/` or `.ms/schemas/`; regenerate with `ms app refresh data-source -n <name>` and wrap services in `src/data/*`.
- Ask before destructive or outward-facing actions: `ms app delete`, `remove data-source`, `share`/`unshare`, deploy to live, `--force`.
- Treat every SDK call result as `IOperationResult`: check `success`, surface `error`.
- Don't add CDN scripts, inline frames to third-party origins, or secrets in client code — the default CSP blocks them and they are anti-patterns.

## When editing this plugin

- Each skill lives in `skills/<name>/SKILL.md`; frontmatter `name` must equal the folder name; `description` must include `USE WHEN` and `DO NOT USE WHEN`.
- Reference shared facts via `../../references/*.md` rather than duplicating them.
- Anti-pattern ids (`AP-xx`) must exist in `references/anti-patterns.md`.
- Keep examples tenant-neutral: `contoso`, `<tenant-id>`, `<environment-id>`, `<app-id>`, `user@contoso.com`.
- Run `node scripts/validate.mjs` from the repo root before committing.
