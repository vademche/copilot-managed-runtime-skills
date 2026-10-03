# Copilot Managed Runtime Skills — repository guidelines

A **plugin marketplace** (`marketplace.json`, `.claude-plugin/marketplace.json`, and `.agents/plugins/marketplace.json` for OpenAI Codex) with one plugin in `plugins/copilot-managed-runtime/`. That plugin's own [`AGENTS.md`](plugins/copilot-managed-runtime/AGENTS.md) has the content rules.

## This repo is public and tenant-neutral

- Never commit real tenant, environment, app, connection or object IDs, UPNs, or organisation-specific hostnames. Use `contoso`, `<tenant-id>`, `<environment-id>`, `<app-id>`, `<connection-id>`, `user@contoso.com`.
- Record that something was verified hands-on ("lab-verified with ms 0.27") without naming the tenant.
- No telemetry in hooks or scripts.

## Layout

```
marketplace.json / .claude-plugin/marketplace.json   marketplace manifests (Copilot, Claude Code)
.agents/plugins/marketplace.json                     marketplace manifest (OpenAI Codex)
plugins/copilot-managed-runtime/
  .claude-plugin/plugin.json, .plugin/plugin.json    plugin manifests (keep identical)
  .codex-plugin/plugin.json                          Codex plugin manifest (same name/version)
  skills/<name>/SKILL.md                             17 skills
  agents/*.md                                        2 agents (install.mjs --codex converts to TOML)
  hooks/hooks.json + guard-generated.mjs             PreToolUse guard (Copilot, Claude, Codex payloads)
  references/*.md                                    shared knowledge base
docs/                                                concept docs and images
scripts/validate.mjs                                 structure, links, AP ids, anonymisation
scripts/install.mjs                                  skills-only installer (--agents, --codex)
```

## Before committing

```
node scripts/validate.mjs
```

Bump `version` in all five manifests together when releasing (the Codex marketplace has no version).
