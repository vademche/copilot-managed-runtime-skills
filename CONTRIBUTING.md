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
