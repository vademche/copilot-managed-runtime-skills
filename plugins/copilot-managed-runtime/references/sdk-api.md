# `@microsoft/managed-apps` SDK — API reference (verified)

> Verified against the published typings of **@microsoft/managed-apps 0.5.19**. The SDK is preview; re-check `node_modules/@microsoft/managed-apps/dist/**/*.d.ts` after upgrades.

## Import rule (most common mistake)

The package has **no root export**. Import only from sub-paths:

```ts
import { getContext, setConfig } from '@microsoft/managed-apps/app';
import { getUser } from '@microsoft/managed-apps/auth';
import { getClient, type IOperationResult } from '@microsoft/managed-apps/data';
import { initializeLogger } from '@microsoft/managed-apps/telemetry';
```

❌ `import { setConfig } from '@microsoft/managed-apps'` — appears in some docs, fails to resolve.

## `/app`

```ts
getContext(): Promise<IContext>
// IContext = { app: { appId: string; environmentId: string }; host: { sessionId: string } }

setConfig(config: { logger?: ILogger }): void
```

Use `host.sessionId` as a correlation ID in your own logs and support tickets.

## `/auth`

```ts
getUser(): Promise<IUser>
// IUser = { fullName: string; objectId: string; tenantId: string }   (cached after first call)
```

- Resolves **before** the end-user finishes the connection-consent dialog — safe for greeting UI.
- It is **identity, not authorization**. Never gate data access on `objectId` client-side; rely on the data source's own security (Dataverse security roles, SharePoint permissions).
- No tokens are exposed. You cannot (and should not try to) obtain an access token for arbitrary APIs.

## `/data`

```ts
getClient(dataSources: DataSourcesInfo): DataClient    // pass the generated `dataSources` object
```

`DataClient` (all return `Promise<IOperationResult<T>>`):

| Method | Notes |
|---|---|
| `createRecordAsync<TIn,TOut>(table, record)` | |
| `updateRecordAsync<TIn,TOut>(table, id, changes)` | send only changed fields |
| `deleteRecordAsync(table, id)` | returns `IOperationResult<void>` — **check `success`** |
| `retrieveRecordAsync<T>(table, id, options?)` | |
| `retrieveMultipleRecordsAsync<T>(table, options?)` | paging via `skipToken` |
| `uploadFileToRecord(table, id, column, fileName, data: string\|Uint8Array\|ArrayBuffer\|Blob)` | Dataverse file columns |
| `downloadFileFromRecord(table, id, column)` | `data: Uint8Array`, `fileName` populated |
| `downloadImageFromRecord(table, id, column, fullSize?)` | |
| `deleteFileOrImageFromRecord(table, id, column)` | |
| `executeAsync<TReq,TOut>({ connectorOperation: { tableName, operationName, parameters } })` | action connectors (what generated action services call) |
| `executeAsync({ dataverseRequest })` | opaque Dataverse request (used by generated Dataverse services) |

`IOperationOptions`: `{ maxPageSize?, select?: string[], filter?: string, orderBy?: string[], top?, skip?, count?: boolean, skipToken? }`

Helpers: `serializeMultiSelectPicklistFields`, `deserializeMultiSelectPicklistFields` (Dataverse multi-select choices).

### `IOperationResult<T>`

```ts
interface IOperationResult<T> {
  success: boolean;
  data: T;
  error?: Error | { message: string; status?: number; code?: string; requestId?: string };
  skipToken?: string;   // next page
  count?: number;       // when count: true
  fileName?: string;    // file/image downloads
}
```

**The SDK does not throw for most data failures — it returns `success: false`.** Always branch on `success`; surface `error.status` / `error.requestId` to logs.

Known `error.code` values (`ErrorCodes`): `CONNECTION_CONFIG_FETCH_FAILED`, `CONNECTION_REFERENCE_NOT_FOUND`, `CONNECTION_NOT_FOUND`.

## `/telemetry`

```ts
initializeLogger(logger: ILogger): void
interface ILogger { logMetric?(metric: Metric): void }
```

Metric types emitted by the host:

| `type` | Key fields |
|---|---|
| `sessionLoadSummary` | `successfulAppLaunch`, `unsuccessfulReason` (`AppEntitlementIssue`, `AppForbidden`, `AppIsInQuarantine`, `AppLoadFailed`, `AppNotFound`, `NetworkError`, `PlatformError`, `Unknown`), `timeToAppInteractive`, … |
| `networkRequest` | `url`, `method`, `statusCode`, `duration` |
| `dataRequestsSummary` | `totalDataRequests`, `failedDataRequests`, `failureCountsByType`, `dataRequestsLatency` |

Forward to Application Insights only if the admin adds the ingestion endpoint to CSP `connect-src` (see `cmr-security-csp`).

## Generated code (what you actually call)

See [`generated-code.md`](generated-code.md) — generated services wrap `getClient(dataSources)`; prefer them over raw `DataClient` calls.
