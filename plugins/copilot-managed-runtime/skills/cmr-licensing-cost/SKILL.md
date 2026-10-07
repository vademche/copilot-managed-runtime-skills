---
name: cmr-licensing-cost
description: Licensing and cost model for Copilot Managed Runtime apps — Power Apps Premium vs Managed Application Copilot Credits, per-launch and per-API-call charges, preview grace behaviour, separately billed Work IQ, build vs run billing, and cost-aware app design. USE WHEN estimating cost, explaining why a user is warned or blocked at launch, choosing a licence path, or optimising chatty apps. DO NOT USE WHEN pricing Power Apps canvas apps or Copilot Studio agents unrelated to CMR.
user-invocable: true
allowed-tools: Read, Grep, Glob
---

# Licensing and cost

Prices and rules are **preview** and change — always point users to the current Microsoft licensing docs before committing numbers.

## 1. Who needs what

| Activity | Entitlement |
|---|---|
| **Run** an app (end user, or developer via `ms app dev`/Local Play) | **Power Apps Premium** *or* **Managed Application Copilot Credits** allocation |
| Build in **Copilot Studio** apps experience | Copilot Credits per that product's spending policy |
| Build in **Cowork** | Microsoft 365 Copilot licence + Cowork usage-based billing policy covering the creator |
| `ms` CLI authoring (create, build, deploy) | no runtime charge (runtime rules apply when running) |
| **Work IQ** MCP/API calls | billed separately (Work IQ API), even with Power Apps Premium |

## 2. Credit consumption (Copilot Credits path)

- Charged on **app launch** and **0.1 credits per API call** (connector/data operation).
- Custom and third-party connectors add no separate licence beyond Power Apps Premium / Copilot Credits; their calls are metered like any connector call (inferred, not documented for CMR).
- Preview: users without entitlement get a warning and a **grace window (≈20 operations or 5 minutes)**, then are blocked.
- Admins: MAC → Copilot → **Cost management** (P3 pre-purchase, pay-as-you-go, capacity packs; per-service spending policies).

Rough estimate: `monthly credits ≈ users × sessions/user × (launch cost + calls/session × 0.1)`. A chatty screen making 40 calls per session costs ~4 credits/session in calls alone.

## 3. Cost-aware design (also improves performance)

1. Batch: one `ListRecords` with `$filter`/`$expand` instead of N `GetItem` (AP-26).
2. `$select`/`select` + `$top`; page on demand (AP-24).
3. Cache reference data per session (TanStack Query `staleTime`); dedupe double effects (AP-30).
4. Debounce typeahead (≥300 ms) and require ≥3 chars; no polling loops — refresh on user action (AP-64).
5. Call Work IQ only on explicit user intent; cache answers.
6. Prefer Power Apps Premium for heavy daily users; credits for occasional users — let the admin model both.

## 4. Support script for "I get a licence warning"

1. Does the user have Power Apps Premium or is in a Copilot Credits policy for managed apps?
2. Has the tenant enabled usage-based billing?
3. Warning now but blocked later = grace window exhausted.
4. Developer hitting it in Local Play = same runtime rule.

## Anti-patterns

AP-24, AP-26, AP-30, AP-64. See [anti-patterns](../../references/anti-patterns.md).
