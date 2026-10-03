# Contributing

Contributions that make agents better at Copilot Managed Runtime are welcome — new skills, corrections when the CLI/SDK changes, extra anti-patterns, troubleshooting entries.

1. Fork and branch.
2. Follow [AGENTS.md](AGENTS.md) and the plugin's [AGENTS.md](plugins/copilot-managed-runtime/AGENTS.md).
3. Verify CLI claims against `ms <command> --help` for the version you state, and say which version.
4. Keep everything tenant-neutral (placeholders only).
5. Run `node scripts/validate.mjs`.
6. Open a PR describing what changed and how it was verified.

### Adding a skill

```
plugins/copilot-managed-runtime/skills/cmr-<topic>/SKILL.md
```

Frontmatter:

```yaml
---
name: cmr-<topic>
description: <what it does>. USE WHEN <triggers>. DO NOT USE WHEN <non-triggers>.
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---
```

Then add it to the catalog tables in the root and plugin READMEs and to `cmr-overview`'s routing table.

Keep skills portable across GitHub Copilot, Claude Code and OpenAI Codex:

- Use only `name` and `description` for behaviour. Other frontmatter keys are ignored by some agents.
- Keep `description` under about 450 characters. Codex caps its combined skill list at about 8,000 characters, and `validate.mjs` fails above that.
- Link shared knowledge as `../../references/…` (the installer keeps that layout).
- If you change an agent in `agents/*.md`, check its Codex conversion with `node scripts/install.mjs <tmp-dir> --codex`.
- If you change the hook, test a Copilot payload (`toolArgs`), a Claude payload (`tool_input.file_path`) and a Codex `apply_patch` payload (`tool_input.command`).
