---
name: cmr-sdk-patterns
description: Correct, idiomatic use of the `@microsoft/managed-apps` SDK — subpath imports, app context and user, IOperationResult error handling, idempotent data loading, React patterns, and telemetry/Application Insights integration. USE WHEN writing or reviewing app code that imports `@microsoft/managed-apps`, handling errors from generated services, adding logging/monitoring, or reading the current user. DO NOT USE WHEN the import is `@microsoft/power-apps` (code apps).
user-invocable: true
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# SDK patterns

Full API: [sdk-api](../../references/sdk-api.md).

## 1. Imports — subpaths only

```ts
import { getContext } from '@microsoft/managed-apps/app';
import { getUser } from '@microsoft/managed-apps/auth';
import type { IOperationResult } from '@microsoft/managed-apps/data';
import { initializeLogger } from '@microsoft/managed-apps/telemetry';
```

There is **no root export** — `import ... from '@microsoft/managed-apps'` fails (AP-14). Check `node_modules/@microsoft/managed-apps/package.json#exports` when unsure.

## 2. Context & user — once, cached

```ts
// src/hooks/useAppContext.ts
let ctxPromise: Promise<Awaited<ReturnType<typeof getContext>>> | undefined;
export const appContext = () => (ctxPromise ??= getContext());
```

Use the user's object ID for ownership filters; never trust a user-entered identity. Don't use context as an authorisation boundary — the data source enforces access.

## 3. Results don't throw

Every generated call returns `IOperationResult<T>` (`success`, `data`, `error`). A failed call resolves with `success:false`. Unchecked results = silent data loss (AP-21).

- Centralise `unwrap()` (see `cmr-data-sources`).
- Map error codes to user messages: consent missing / connection broken → "Reconnect", 403 → "You don't have access", throttling → retry with backoff.
- Retry only idempotent reads (exponential backoff, max 3). Never auto-retry creates.

## 4. React data loading — idempotent

Effects ran **twice in production** in lab tests. Guard writes and dedupe reads:

```ts
const inflight = new Map<string, Promise<unknown>>();
export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!inflight.has(key)) inflight.set(key, fn().finally(() => setTimeout(() => inflight.delete(key), 0)));
  return inflight.get(key) as Promise<T>;
}
```

Or use TanStack Query (dedupes, caches, retries reads). Never perform a write from `useEffect` on mount (AP-30).

## 5. Telemetry

```ts
// src/telemetry.ts
import { initializeLogger } from '@microsoft/managed-apps/telemetry';
initializeLogger({
  logMetric(metric) {
    // forward to your sink (e.g. App Insights trackMetric/trackEvent); never include PII
    if (import.meta.env.DEV) console.debug('[metric]', metric.type, metric);
  },
});
```

- Platform metrics (sessions, load time, connector calls/failures) appear in the admin **Monitor** page automatically.
- For Application Insights: forward `logMetric` to the App Insights browser SDK **bundled locally** (no CDN) and add its ingestion endpoint to `connect-src` in the env-group CSP (`cmr-security-csp`).
- Never log PII, tokens, or record payloads. Log operation names, durations, error codes, correlation IDs.

## 6. Structure

- UI → hooks → `src/data/*` → `generated/`. Only `src/data` imports `generated/`.
- Keep generated types out of component props; map to domain types (survives regeneration).
- Error boundary at the root showing a friendly message + correlation ID.
- Accessibility: Fluent UI v9 (or your design system), keyboard nav, labels.
- **Host header:** keep it by default, since it gives users a consistent home button and identity. Hide it (`ms app set-setting --show-header false`, then commit and deploy) only for kiosk/full-bleed UIs, and then render your own app bar with the user's name from `getUser()` and a home/exit link. The host loading screen keeps its header regardless.

## Anti-patterns

AP-14, AP-20, AP-21, AP-30, AP-40, AP-44. See [anti-patterns](../../references/anti-patterns.md).
