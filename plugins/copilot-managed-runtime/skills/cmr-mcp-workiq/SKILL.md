---
name: cmr-mcp-workiq
description: Call MCP servers (Work IQ Copilot/Mail/Calendar/Teams/SharePoint/OneDrive/User, Fabric, Learn Docs, Power Apps MCP) from a Copilot Managed Runtime app, including the JSON-RPC payload and the SSE response parser. USE WHEN adding Work IQ or another MCP server as a data source, grounding an app on M365 data, or parsing `text/event-stream` results. DO NOT USE WHEN configuring MCP servers for the coding agent itself.
user-invocable: true
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, AskUserQuestion
---

# MCP servers and Work IQ from an app

## 1. Is it allowed and paid for?

- The MCP server must be on the env group's allow list (default group ships 12 incl. Work IQ servers, Fabric MCP, Learn Docs MCP, Power Apps MCP).
- **Work IQ API usage is billed separately** (Copilot Credits under the Work IQ API spending policy) — Power Apps Premium does not cover it, and licensing requirements may change in preview. Confirm entitlement with the admin and plan a fallback UI for users who can't use it.
- Responses are grounded in what **the signed-in user** can access — no elevation.

## 2. Bind

```bash
ms connector list --only-allowed --json     # MCP ids look like shared_a365copilotchatmcp, shared_a365outlookmailmcp, ...
ms app add data-source --connector shared_a365copilotchatmcp --use-sso --non-interactive --json
```

Generates e.g. `WorkIQCopilotMCPService.mcp_m365copilot(Mcp_Session_Id?, queryRequest?)` returning `IOperationResult<void>` whose `data` is actually **SSE text**.

## 3. Call pattern (JSON-RPC over SSE)

```ts
// src/data/workiq.ts
import { WorkIQCopilotMCPService } from '../../generated/services/WorkIQCopilotMCPService';

let nextId = 1;
const rpc = (method: string, params: unknown) => ({ jsonrpc: '2.0', id: nextId++, method, params });

export function parseSse(text: string): any[] {
  return text.split(/\r?\n\r?\n/)
    .map(block => block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n'))
    .filter(Boolean)
    .map(d => { try { return JSON.parse(d); } catch { return undefined; } })
    .filter(Boolean);
}

export async function askWorkIq(question: string): Promise<string> {
  const res: any = await WorkIQCopilotMCPService.mcp_m365copilot(undefined, rpc('tools/call', {
    name: 'copilot_chat', arguments: { message: question },
  }) as any);
  if (!res.success) throw new Error(res.error?.message ?? 'Work IQ call failed');
  const msgs = parseSse(typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
  const result = msgs.find(m => m.result)?.result;
  if (!result) throw new Error(msgs.find(m => m.error)?.error?.message ?? 'Empty Work IQ response');
  return (result.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
}
```

Discover tools once with `rpc('tools/list', {})` during development (it works without `initialize` or a session id). In lab tests the Work IQ Copilot server exposed `copilot_chat` with input `{ message, conversationId?, agentId?, fileUris?, enableWebSearch? }` — re-check with `tools/list`, schemas change in preview. Keep the returned `conversationId` for follow-up turns.

## 4. UX and safety

- Show a spinner + cancel; responses take seconds.
- Render answers as **text/markdown with sanitisation** — never `dangerouslySetInnerHTML` raw model output (AP-45).
- Show citations/links returned by the server; label AI content.
- Cache per session; don't call on every keystroke (cost, AP-64).
- Treat output as untrusted input (prompt injection from M365 content).

## 5. Write tools: content yes, containers no

Some MCP servers on the default allow-list can **create containers**:
- the Work IQ SharePoint server (`shared_workiqsharepoint` → `mcp_SharePointRemoteServer`): createList, createColumn, …
- the Dataverse MCP (`commondataserviceforapps` → `/api/mcp`): `create_table`, `update_table`, `delete_table`

An app may create **items** through them. It must never create lists, tables or columns at runtime (AP-31, AP-32). Bind only the tools the app needs, and handle the consent prompt. Work IQ connectors use OAuth/SSO, so `ms app add data-source` creates no connection at design time; the connection is authenticated when the user first consents in the running app. Container creation belongs in `/provisioning` scripts: see `cmr-backend-provisioning` §5.

## Anti-patterns

AP-29, AP-31, AP-32, AP-45, AP-64, AP-79. See [anti-patterns](../../references/anti-patterns.md) · [connectors-and-policy](../../references/connectors-and-policy.md).
