# Backend provisioning for CMR apps (Dataverse, SharePoint, Planner)

A CMR app is a front end. It **binds** to data that already exists, and the runtime gives it no "create my database" step. Provision the backend at **design time**, from scripts kept in the app's repo, then bind the app to it.

Everything below was run end to end in a lab tenant. That covered a Dataverse table in a solution, a group-connected SharePoint site with a list and a document library, a Planner plan, binding all of them to one CMR app, and checking the generated code. Placeholders: `contoso`, `<org>`, `<env-id>`, `<group-id>`.

## 1. Design time vs runtime: what can create what

| Asset | Design time (scripts / CLI, recommended) | Runtime from the app (connector action) | Verdict |
|---|---|---|---|
| Dataverse table / columns | Web API `EntityDefinitions` **with `MSCRM.SolutionUniqueName`**, `pac solution import` | Dataverse MCP `create_table` / `update_table` / `delete_table` (MCP server is on the default allow-list) | Design time, inside a solution. Never let the app or an agent create schema at runtime (AP-31) |
| Dataverse rows | Web API / `pac data` / seed scripts | Generated `*Service.CreateRecord` | Runtime is fine (it's the app's job) |
| SharePoint site | Graph `POST /groups` (group-connected site) or SharePoint admin | none on the default allow-list | Design time only |
| SharePoint list / library + columns | Graph `POST /sites/{id}/lists` with `columns`, PnP provisioning templates | blocked: "Send an HTTP request to SharePoint" | Design time only |
| SharePoint items / files | Graph | `--as table` CRUD (metadata); file bytes via SharePoint **actions** (`CreateFile`) | Runtime is fine |
| Planner plan / buckets | Graph `POST /planner/plans`, `/planner/buckets` | no plan creation; `CreateBucket` is exposed | Design time. Runtime bucket creation causes drift (AP-32) |
| Planner tasks | Graph | Planner actions | Runtime is fine |
| Teams team / channel | Graph | Teams `CreateATeam` / `CreateChannel` are allowed | Design time. Runtime team sprawl is an anti-pattern (AP-32) |
| Excel table | Upload a workbook | Excel `CreateTable` is allowed | Excel is not a database (AP-33) |

Rule: **the app creates content, never containers.** Containers (tables, lists, libraries, plans, teams) are infrastructure. They're versioned in Git and created by an accountable identity.

## 2. Repo layout

```
/app/                      # the CMR app (ms.config.json, src/, generated/)
/dataverse/ContosoFieldRequests/  # pac solution clone output (.cdsproj + src/) — schema as code
/provisioning/
  sharepoint.ps1           # idempotent Graph script: group, site, lists, columns
  planner.ps1              # idempotent Graph script: plan, buckets
  dataverse-seed.ps1       # optional reference/seed data
  README.md                # who runs it, with which identity, in which order
/.github/workflows/        # solution import + app deploy (see solutions-and-alm)
```

## 3. Identities and permissions

| Target | Interactive maker / admin | CI (unattended) |
|---|---|---|
| Graph (SharePoint, groups, Planner) | Microsoft Graph PowerShell `Connect-MgGraph -Scopes Group.ReadWrite.All,Sites.Manage.All,Tasks.ReadWrite` | Workload identity with **`Sites.Selected`** (grant per site) plus `Group.Create` only if the pipeline creates groups |
| Dataverse Web API | `az account get-access-token --resource https://<org>.crm.dynamics.com` or `pac auth` | Application user (service principal) with a custom role, or System Customizer for schema |

- The Azure CLI first-party client **cannot** get `Sites.Manage.All` for Graph, so creating SharePoint lists with an `az` Graph token fails. Use Graph PowerShell, PnP PowerShell or your own app registration.
- The Azure CLI token works for the Dataverse Web API.
- Tenant-wide `Sites.FullControl.All` for a pipeline is over-privileged (AP-35). Prefer `Sites.Selected`.

## 4. Dataverse: publisher → solution → table (Web API)

```powershell
# pwsh 7. Token: az account get-access-token --resource https://<org>.crm.dynamics.com
$org = 'https://<org>.crm.dynamics.com'; $api = "$org/api/data/v9.2"
$tok = az account get-access-token --resource $org --query accessToken -o tsv
$h   = @{ Authorization = "Bearer $tok"; 'OData-Version' = '4.0'; Accept = 'application/json' }
function L($t) { @{ '@odata.type'='Microsoft.Dynamics.CRM.Label'; LocalizedLabels=@(@{ '@odata.type'='Microsoft.Dynamics.CRM.LocalizedLabel'; Label=$t; LanguageCode=1033 }) } }
function Dv($m, $p, $b, $x = @{}) { Invoke-RestMethod -Method $m -Uri "$api/$p" -Headers ($h + $x) -ContentType 'application/json; charset=utf-8' -Body ($b | ConvertTo-Json -Depth 20) }

# 1. Publisher (idempotent). The prefix and option-value prefix are permanent.
$pub = (Invoke-RestMethod "$api/publishers?`$filter=uniquename eq 'contoso'" -Headers $h).value | Select-Object -First 1
if (-not $pub) { Dv POST 'publishers' @{ uniquename='contoso'; friendlyname='Contoso'; customizationprefix='contoso'; customizationoptionvalueprefix=10000 }
  $pub = (Invoke-RestMethod "$api/publishers?`$filter=uniquename eq 'contoso'" -Headers $h).value[0] }

# 2. Unmanaged solution in DEV
if (-not (Invoke-RestMethod "$api/solutions?`$filter=uniquename eq 'ContosoFieldRequests'" -Headers $h).value) {
  Dv POST 'solutions' @{ uniquename='ContosoFieldRequests'; friendlyname='Contoso Field Requests'; version='1.0.0.0'; 'publisherid@odata.bind'="/publishers($($pub.publisherid))" } }

# 3. Table, created *inside* the solution
$sol = @{ 'MSCRM.SolutionUniqueName' = 'ContosoFieldRequests' }
Dv POST 'EntityDefinitions' @{
  '@odata.type'='Microsoft.Dynamics.CRM.EntityMetadata'; SchemaName='contoso_FieldRequest'
  DisplayName=(L 'Field Request'); DisplayCollectionName=(L 'Field Requests'); Description=(L 'Field service requests')
  OwnershipType='UserOwned'; HasActivities=$false; HasNotes=$false; IsActivity=$false
  PrimaryNameAttribute='contoso_name'
  Attributes=@(@{ '@odata.type'='Microsoft.Dynamics.CRM.StringAttributeMetadata'; SchemaName='contoso_Name'; IsPrimaryName=$true
                  MaxLength=200; FormatName=@{Value='Text'}; RequiredLevel=@{Value='ApplicationRequired'}; DisplayName=(L 'Title') })
} $sol

# 4. Columns. Wait for metadata to settle first (0x80060888 "does not exist" right after create).
Start-Sleep 20
$opts = { param($labels) $i=0; $labels | ForEach-Object { @{ Value = 100000000 + $i++; Label = (L $_) } } }
@(
  @{ '@odata.type'='Microsoft.Dynamics.CRM.PicklistAttributeMetadata'; SchemaName='contoso_Status'; DisplayName=(L 'Status'); RequiredLevel=@{Value='None'}
     OptionSet=@{ '@odata.type'='Microsoft.Dynamics.CRM.OptionSetMetadata'; IsGlobal=$false; OptionSetType='Picklist'; Options=@(& $opts 'New','In progress','Done') } }
  @{ '@odata.type'='Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'; SchemaName='contoso_DueDate'; DisplayName=(L 'Due date'); RequiredLevel=@{Value='None'}
     Format='DateOnly'; DateTimeBehavior=@{Value='DateOnly'} }
  @{ '@odata.type'='Microsoft.Dynamics.CRM.DecimalAttributeMetadata'; SchemaName='contoso_EstimatedCost'; DisplayName=(L 'Estimated cost'); RequiredLevel=@{Value='None'}
     Precision=2; MinValue=0; MaxValue=1000000000 }
  @{ '@odata.type'='Microsoft.Dynamics.CRM.MemoAttributeMetadata'; SchemaName='contoso_Notes'; DisplayName=(L 'Notes'); RequiredLevel=@{Value='None'}
     MaxLength=4000; Format='TextArea' }
) | ForEach-Object { Dv POST "EntityDefinitions(LogicalName='contoso_fieldrequest')/Attributes" $_ $sol }

# 5. Publish
Dv POST 'PublishXml' @{ ParameterXml = '<importexportxml><entities><entity>contoso_fieldrequest</entity></entities></importexportxml>' }
```

Notes from the lab:
- Creating the table took about 40 s. Adding attributes immediately afterwards failed with `0x80060888` until the metadata settled. Add retries with back-off.
- Local choice values are `<optionvalueprefix> * 10000 + n`. With prefix `10000`, that's `100000000, 100000001, …`. Codegen turns them into typed maps (`{ 100000000: 'New', … } as const`) plus a `*name` label field.
- Every call without `MSCRM.SolutionUniqueName` lands in the **Default solution**, so the component can't be shipped cleanly (AP-34). Afterwards, check with `pac solution list` and `pac solution clone --name ContosoFieldRequests`.
- Alternatives that need no code: the maker portal (inside the solution), or `pac solution import` of a solution authored elsewhere. Never use the Dataverse MCP `create_table` tool for app schema.

## 5. SharePoint: group-connected site, list, library (Graph)

```powershell
Connect-MgGraph -Scopes 'Group.ReadWrite.All','Sites.Manage.All' -NoWelcome
$nick = 'contoso-fieldrequests'
$g = (Invoke-MgGraphRequest GET "v1.0/groups?`$filter=mailNickname eq '$nick'").value | Select-Object -First 1
if (-not $g) { $g = Invoke-MgGraphRequest POST 'v1.0/groups' -Body @{
  displayName='Field Requests'; mailNickname=$nick; mailEnabled=$true; securityEnabled=$false
  groupTypes=@('Unified'); visibility='Private' } }
# The site appears asynchronously, usually within about 60 s
do { Start-Sleep 10; try { $site = Invoke-MgGraphRequest GET "v1.0/groups/$($g.id)/sites/root" } catch { $site = $null } } until ($site)

function Ensure-List($name, $template, $columns) {
  $l = (Invoke-MgGraphRequest GET "v1.0/sites/$($site.id)/lists?`$filter=displayName eq '$name'").value | Select-Object -First 1
  if ($l) { return $l }
  Invoke-MgGraphRequest POST "v1.0/sites/$($site.id)/lists" -Body @{ displayName=$name; list=@{template=$template}; columns=$columns }
}
Ensure-List 'Field Requests' 'genericList' @(
  @{ name='RequestStatus'; displayName='Status'; choice=@{ choices=@('New','In progress','Done') } }
  @{ name='Priority';      choice=@{ choices=@('Low','Medium','High') } }
  @{ name='DueDate';       dateTime=@{ format='dateOnly' } }
  @{ name='EstimatedCost'; number=@{ decimalPlaces='two' } }
  @{ name='AssignedTo';    personOrGroup=@{ allowMultipleSelection=$false; chooseFromType='peopleOnly' } }
  @{ name='Notes';         text=@{ allowMultipleLines=$true } }
)
Ensure-List 'Request Documents' 'documentLibrary' @(
  @{ name='RequestId'; number=@{} }
  @{ name='DocType';   choice=@{ choices=@('Photo','Quote','Invoice') } }
)
```

- **Internal names are permanent, and they're what codegen uses.** The column above shows `Status` in SharePoint, but the generated model field is `RequestStatus`. Choose clean, English, space-free internal names before the first bind.
- Generated SharePoint models write choice and person columns through `'<Column>#Id'` / `'<Column>#Claims'` fields and read them as `*Value` objects (`{ Value, Id }`, `{ DisplayName, Email, Claims }`).
- A document library bound `--as table` gives **metadata CRUD only** (`create/update/delete/get/getAll`). Upload bytes with SharePoint **actions** (`CreateFile`), then set metadata.
- The first Graph write can time out transiently. Make every step idempotent (look up, then create) so a re-run is safe.

## 6. Planner: plan and buckets (Graph)

```powershell
Connect-MgGraph -Scopes 'Tasks.ReadWrite','Group.ReadWrite.All' -NoWelcome
$plan = (Invoke-MgGraphRequest GET "v1.0/groups/$($g.id)/planner/plans").value | Where-Object title -eq 'Field Requests Board'
if (-not $plan) { $plan = Invoke-MgGraphRequest POST 'v1.0/planner/plans' -Body @{
  title='Field Requests Board'; container=@{ url="https://graph.microsoft.com/v1.0/groups/$($g.id)" } } }
$existing = (Invoke-MgGraphRequest GET "v1.0/planner/plans/$($plan.id)/buckets").value.name
foreach ($b in 'Done','In progress','New') { if ($b -notin $existing) {
  Invoke-MgGraphRequest POST 'v1.0/planner/buckets' -Body @{ name=$b; planId=$plan.id; orderHint=' !' } } }
```

Planner binds only `--as action` (there's no table mode). Store the plan ID and bucket IDs as **app configuration**: a constants module per environment, generated from the provisioning output. Never hard-code them in components.

## 7. Bind the app

```bash
cd app
# Dataverse in the same environment as the app: no --dataverse-environment-id needed
ms app add data-source --connector commondataserviceforapps --as table -t contoso_fieldrequest --use-sso --non-interactive --json
# Dataverse in another environment (e.g. the app lives in a personal dev env without Dataverse)
ms app add data-source --connector commondataserviceforapps --as table -t contoso_fieldrequest -c <conn-id> --dataverse-environment-id <env-id> --non-interactive --json
# SharePoint list and library (dataset = site URL, table = list display name)
ms app add data-source --connector sharepointonline --as table -d https://contoso.sharepoint.com/sites/contoso-fieldrequests \
  -t "Field Requests" -t "Request Documents" --use-sso --non-interactive --json
ms app add data-source --connector sharepointonline --as action --use-sso --non-interactive --json   # for CreateFile
ms app add data-source --connector planner --as action --use-sso --non-interactive --json
```

- The Dataverse binding is keyed to the **org API URL** (`dataSets["https://contoso.api.crm.dynamics.com"]`) and `dataverseTables{ environmentId, logicalName, entitySetName }`. The SharePoint binding is keyed to the **site URL**. Both are hard-wired, so promotion to test or prod means **rebinding** (separate app or `--deployment` overlay). See [solutions-and-alm](solutions-and-alm.md).
- Commit `ms.config.json`, `generated/` and `.ms/schemas/` after every bind (AP-12).

## 8. Seed and reference data

Seed only **reference data** (categories, statuses) through scripts, and keep it in the repo as JSON/CSV. Never copy production rows into dev. Dataverse reference data that has to travel with the schema belongs in the solution (or in a configuration-migration package via `pac data`).

## 9. Checklist

- [ ] Publisher prefix chosen (`contoso_`), never `new_` / `cr123_`.
- [ ] Every Dataverse component was created with `MSCRM.SolutionUniqueName`, or in the solution in the maker portal.
- [ ] SharePoint and Planner scripts are idempotent, committed under `/provisioning`, and run by an accountable identity.
- [ ] Internal column names reviewed before the first bind.
- [ ] Security first: Dataverse roles per persona, SharePoint site membership through the M365 group. Sharing the app grants no data access.
- [ ] After any schema change: `ms app refresh data-source -n <name>`, review the `generated/` diff, commit.

Anti-patterns: AP-31 … AP-36, AP-12, AP-28. See [anti-patterns](anti-patterns.md).
