---
name: cmr-troubleshooting
description: Diagnose and fix Copilot Managed Runtime problems — CLI/auth errors, exit codes, git push failures to the platform repo, data-source binding errors, build/deploy failures, CSP violations, consent and licence prompts, empty data, sharing and policy errors. USE WHEN any `ms` command fails, an app doesn't load or shows no data, a deploy didn't change the live app, or a user can't open an app. DO NOT USE WHEN debugging unrelated web hosting or Power Apps code apps.
user-invocable: true
allowed-tools: Read, Bash, Grep, Glob, AskUserQuestion
---

# Troubleshooting

Full symptom tables: [troubleshooting](../../references/troubleshooting.md).

## Triage order

1. `ms --version`, `ms auth status --json` — right CLI, right tenant/account?
2. Re-run the failing command with `--json --non-interactive` and read the error **and exit code** (2 = missing input → the output lists valid choices; loop, don't guess).
3. `ms <cmd> --help` — flags drift between previews.
4. `ms app info --json` — app, env, repo type as the service sees them.
5. For runtime issues: browser F12 console (CSP, network, consent) on the **preview** URL or Local Play.

## Top issues (verified in lab)

| Symptom | Cause | Fix |
|---|---|---|
| `git push` hangs/fails after `ms app create` in agent shell | GCM needs interactive OAuth | push from the user's terminal once; or one-off bearer header (`cmr-setup-auth`) |
| Push rejected: unrelated histories | platform repo has an initial commit | `git pull --allow-unrelated-histories` then push |
| "Unable to determine the Dataverse organization URL" | personal env has no Dataverse | `--dataverse-environment-id <id>`; delete the dangling connection |
| Exit 2 from `add data-source` | dataset/table not specified | pick from the printed list; re-run with `-d`/`-t` |
| "Skipped N of M actions due to policy" | blocked actions | expected; request admin change only if needed |
| Import error `XService is not exported` | Dataverse services are default exports | `import XService from ...` |
| Build error importing `@microsoft/managed-apps` | no root export | use `/app`, `/auth`, `/data`, `/telemetry` |
| Pushed but live unchanged | live only updates on deploy | `ms app deploy --commit <sha>` |
| Portal says "not published"; can't run or edit | never deployed | push, then `ms app deploy` |
| TS2552 in `generated/services/PlannerService.ts` | Planner codegen broken in 0.27 | `ms app remove data-source --name planner`; never edit `generated/` |
| Deploy "working tree dirty / ahead of origin" | uncommitted/unpushed | commit + push (avoid `--force`) |
| "External artifact deployment is not enabled" | env setting off | admin enables AllowExternalArtifactDeployment |
| `AppShareLinkForbiddenForViralSharing` (403) | group sharing rule blocks links | share with groups |
| `share link revoke --link-id` → "Provide a share link ID" | CLI bug in 0.27 | REST `DELETE …/shareLinks/<id>` (`cmr-sharing`) |
| `share list --access edit` → 401 | transient preview issue | retry; or `ms app list --permission edit` as co-owner |
| "Refused to connect/load ..." | CSP | bundle asset / use connector / admin CSP change (`cmr-security-csp`) |
| Duplicate records created | effect ran twice | idempotent effects, no writes on mount |
| Empty list, no error shown | `success:false` ignored | check `success`, surface `error` |
| Delete "succeeds" but row remains | tabular `delete()` swallows result | use `getClient(...).deleteRecordAsync` and check result |
| Work IQ result unparseable | SSE text | parse `data:` lines (`cmr-mcp-workiq`) |
| Licence warning / blocked after a few clicks | no Premium/credits; grace exhausted | `cmr-licensing-cost` |
| CI deploy targets wrong cloud | action default `cloud: test` | set `cloud: prod` |
| CI `400 Principal not found` | app-registration object ID used | use enterprise-app (SP) object ID |
| Line-ending noise on Windows | CRLF | `.gitattributes`: `* text=auto eol=lf` |

## When to escalate

Collect: CLI version, command + `--json` output (redact IDs/tokens), app ID placeholder, session ID from `getContext()`, timestamp, browser console. Then open a support case / feedback via the product channel. Never paste real tenant IDs in public issues (AP-73).
