# Copilot Managed Runtime in pictures

Five diagrams covering the concepts the skills rely on. The SVG sources are in [`images/`](images/).

## 1. Architecture

![Architecture](images/cmr-architecture.svg)

- Your app is a static SPA. UI components call **your own wrappers** in `src/data/*`. Those wrappers call the **generated, typed services** in `generated/services/*`, which call the `@microsoft/managed-apps` SDK.
- The **CMR host** handles sign-in, consent, connection brokering, CSP, sharing, Conditional Access and tenant policy. You don't write any of that yourself.
- All data goes through **connectors and MCP servers** using the signed-in user's own connections. The browser can only reach `'self'`, so there is no direct `fetch` to external APIs.

Skills: `cmr-overview`, `cmr-sdk-patterns`, `cmr-data-sources`, `cmr-security-csp`.

## 2. Inner loop

![Inner loop](images/cmr-inner-loop.svg)

`ms app dev` (local code served through the hosted *Local Play* URL, so you get real auth, connections and policies) → `git push` → `ms app build --commit <sha>` (cloud build from a commit) → `ms app play --mode preview` → `ms app deploy --commit <sha>` → live. To roll back, deploy an earlier SHA. Builds are immutable, so the commit is the unit of release.

Skill: `cmr-inner-loop`.

## 3. Governance

![Governance](images/cmr-governance.svg)

Admins attach makers' developer environments to an **environment group**. The group's rules control which connectors and MCP servers are allowed, how widely apps can be shared, the CSP, and where new apps are routed. Data policies (ACP/DLP) are applied at the connector layer, at runtime. Agents should read the policy, design within it, and **never try to get around it**.

Skills: `cmr-governance-admin`, `cmr-sharing`, `cmr-licensing-cost`.

## 4. Citizen → pro-dev handoff

![Citizen handoff](images/cmr-citizen-handoff.svg)

An app a maker builds in Copilot Studio or Cowork is an ordinary Git-backed CMR app. The developer gets *edit* access, clones it, assesses it, and hardens it (shared data store, error handling, tests, CI). The app ID, inventory entry and sharing stay the same, so the maker keeps using the same app. Continue the app; don't rewrite it.

Skill: `cmr-citizen-handoff`.

## 5. ALM and CI/CD

![ALM and CI/CD](images/cmr-alm-cicd.svg)

There are three delivery models:

- **Platform build**: push to the app's repo; the cloud builds from a commit.
- **External artifacts**: CI builds the app and deploys it with `--repo none`. This needs the admin setting `AllowExternalArtifactDeployment`.
- **Staged ALM**: with `MS_CLI_ALM=true`, `--deployment test|prod` gives you separate test and production stages.

CI signs in as a service principal. Gate prod behind an environment approval.

Skill: `cmr-alm-cicd`.
