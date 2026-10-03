# copilot-managed-runtime (plugin)

Skills, agents and hooks that teach a coding agent to build, govern and operate apps on **Microsoft Copilot Managed Runtime (CMR)** — the governed runtime behind the `ms` CLI (`@microsoft/managed-apps-cli`) and the `@microsoft/managed-apps` SDK.

> CMR is in preview. Commands and policies change; every skill tells the agent to check `ms <command> --help` before relying on a flag.

## Skills

| Skill | Use it to… |
|---|---|
| [`cmr-overview`](skills/cmr-overview/SKILL.md) | Get oriented: layers, terminology, which skill next |
| [`cmr-setup-auth`](skills/cmr-setup-auth/SKILL.md) | Install/verify the `ms` CLI, sign in, switch accounts, configure CI identities |
| [`cmr-create-app`](skills/cmr-create-app/SKILL.md) | Create or register an app with the right repo model, environment and template |
| [`cmr-inner-loop`](skills/cmr-inner-loop/SKILL.md) | Local dev → pack → push → cloud build → preview → deploy → play |
| [`cmr-data-sources`](skills/cmr-data-sources/SKILL.md) | Bind connector data sources (SharePoint, Office 365, SQL…) and wrap generated services |
| [`cmr-dataverse`](skills/cmr-dataverse/SKILL.md) | Use Dataverse tables, including cross-environment binding and security roles |
| [`cmr-backend-provisioning`](skills/cmr-backend-provisioning/SKILL.md) | Provision Dataverse (in solutions), SharePoint and Planner backends; managed vs unmanaged solutions and schema-first releases |
| [`cmr-mcp-workiq`](skills/cmr-mcp-workiq/SKILL.md) | Call MCP servers (Work IQ, Fabric, Learn…) incl. JSON-RPC + SSE parsing |
| [`cmr-sdk-patterns`](skills/cmr-sdk-patterns/SKILL.md) | Use the SDK idiomatically: context, results, React patterns, telemetry |
| [`cmr-security-csp`](skills/cmr-security-csp/SKILL.md) | Live within the default CSP, request changes, avoid XSS/secrets leaks |
| [`cmr-alm-cicd`](skills/cmr-alm-cicd/SKILL.md) | Branching, stage separation, GitHub Actions with service principals |
| [`cmr-sharing`](skills/cmr-sharing/SKILL.md) | Share/unshare with groups and the right access level |
| [`cmr-citizen-handoff`](skills/cmr-citizen-handoff/SKILL.md) | Take over a Copilot Studio / Cowork-generated app as pro-code and hand it back |
| [`cmr-governance-admin`](skills/cmr-governance-admin/SKILL.md) | Tenant governance: environment routing, ACP/DLP, sharing limits, CSP, audit |
| [`cmr-licensing-cost`](skills/cmr-licensing-cost/SKILL.md) | Licensing paths, credit consumption, cost-aware design |
| [`cmr-troubleshooting`](skills/cmr-troubleshooting/SKILL.md) | Diagnose CLI, git, binding, build, CSP, licence and policy errors |
| [`cmr-review`](skills/cmr-review/SKILL.md) | Production-readiness / PR review against the anti-pattern catalog |

## Agents

| Agent | Purpose |
|---|---|
| [`cmr-architect`](agents/cmr-architect.md) | Produces an architecture decision record before code is written |
| [`cmr-reviewer`](agents/cmr-reviewer.md) | Read-only reviewer that returns a prioritised findings table |

## Hooks

| Hook | Behaviour |
|---|---|
| `PreToolUse` → [`guard-generated.mjs`](hooks/guard-generated.mjs) | Denies agent edits to `generated/` and `.ms/schemas/` inside a project that has `ms.config.json` (they are overwritten by `ms app add/refresh data-source`). Bypass with `CMR_ALLOW_GENERATED_EDITS=1`. Fails open; requires Node.js (already a CMR prerequisite). No telemetry. |

## References

Shared knowledge the skills link to: [CLI cheatsheet](references/cli-cheatsheet.md) · [SDK API](references/sdk-api.md) · [Generated code](references/generated-code.md) · [Connectors & policy](references/connectors-and-policy.md) · [`ms.config.json`](references/ms-config.md) · [Governance quick ref](references/governance-quick-ref.md) · [Source control](references/source-control.md) · [Backend provisioning](references/backend-provisioning.md) · [Solutions & ALM](references/solutions-and-alm.md) · [Anti-patterns](references/anti-patterns.md) · [Troubleshooting](references/troubleshooting.md)

## Works well with

Microsoft's own plugin `microsoft-managed-apps` (from `microsoft/Managed-Apps`) covers scaffolding mechanics. This plugin adds architecture, governance, ALM, security, cost and handoff guidance on top; both can be installed together.
