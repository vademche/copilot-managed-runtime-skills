# Copilot Managed Runtime Skills — repository guidelines

A **plugin marketplace** (`marketplace.json`, `.claude-plugin/marketplace.json`) with one plugin in `plugins/copilot-managed-runtime/`. That plugin's own [`AGENTS.md`](plugins/copilot-managed-runtime/AGENTS.md) has the content rules.

## This repo is public and tenant-neutral

- Never commit real tenant, environment, app, connection or object IDs, UPNs, or organisation-specific hostnames. Use `contoso`, `<tenant-id>`, `<environment-id>`, `<app-id>`, `<connection-id>`, `user@contoso.com`.
- Record that something was verified hands-on ("lab-verified with ms 0.27") without naming the tenant.
- No telemetry in hooks or scripts.

## Layout

```
marketplace.json / .claude-plugin/marketplace.json   marketplace manifests
plugins/copilot-managed-runtime/
  .claude-plugin/plugin.json, .plugin/plugin.json    plugin manifests (keep identical)
  skills/<name>/SKILL.md                             16 skills
  agents/*.md                                        2 agents
  hooks/hooks.json + guard-generated.mjs             PreToolUse guard
  references/*.md                                    shared knowledge base
docs/                                                concept docs and images
scripts/validate.mjs                                 structure, links, AP ids, anonymisation
```

## Before committing

```
node scripts/validate.mjs
```

Bump `version` in all four manifests together when releasing.
