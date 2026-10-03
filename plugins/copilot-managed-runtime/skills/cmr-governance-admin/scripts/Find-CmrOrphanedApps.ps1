<#
.SYNOPSIS
  Lists every Copilot Managed Runtime app in the tenant, joins last-used dates, checks each owner in Entra ID
  and classifies apps as ActNow / OrphanedLowUse / RetireCandidate / Stale / Healthy. Read-only.

.DESCRIPTION
  Needs a DELEGATED token for https://api.powerplatform.com (Power Platform admin, Global admin or Global Reader)
  and a Microsoft Graph token with User.Read.All (or Directory.Read.All). By default both come from the Azure CLI:
    az login --tenant <tenant-id>
  Service principals are rejected by the inventory API.

.EXAMPLE
  ./Find-CmrOrphanedApps.ps1 -OutFile cmr-apps.csv
.EXAMPLE
  ./Find-CmrOrphanedApps.ps1 -PowerPlatformToken $pp -GraphToken $gr -ActiveDays 14 -StaleDays 60
#>
[CmdletBinding()]
param(
  [string]$PowerPlatformToken,
  [string]$GraphToken,
  [int]$ActiveDays = 30,
  [int]$StaleDays = 90,
  [string]$OutFile = 'cmr-app-inventory.csv'
)
$ErrorActionPreference = 'Stop'

function Get-AzToken([string[]]$azArgs) {
  $t = az account get-access-token @azArgs --query accessToken -o tsv
  if (-not $t) { throw "az account get-access-token $azArgs failed. Run 'az login --tenant <tenant-id>' first." }
  $t
}
if (-not $PowerPlatformToken) { $PowerPlatformToken = Get-AzToken @('--resource', 'https://api.powerplatform.com') }
if (-not $GraphToken)         { $GraphToken         = Get-AzToken @('--resource-type', 'ms-graph') }

$queryUri = 'https://api.powerplatform.com/resourcequery/resources/query?api-version=2024-10-01'

function Invoke-InventoryQuery([string]$type, [string[]]$fields) {
  # $type must be the first property of each clause, hence [ordered]. Page with take + skipToken (Options.Top returns 0 rows).
  $clauses = @(
    [ordered]@{ '$type' = 'where'; FieldName = 'type'; Operator = '=='; Values = @("'$type'") }
    [ordered]@{ '$type' = 'project'; FieldList = $fields }
    [ordered]@{ '$type' = 'take'; TakeCount = 1000 }
  )
  $rows = @(); $skip = $null
  do {
    $body = [ordered]@{ TableName = 'PowerPlatformResources'; Clauses = $clauses }
    if ($skip) { $body.Options = @{ SkipToken = $skip } }
    $r = Invoke-RestMethod -Method Post -Uri $queryUri -Headers @{ Authorization = "Bearer $PowerPlatformToken" } `
      -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10)
    $rows += $r.data; $skip = $r.skipToken
  } while ($skip)
  $rows
}

Write-Host 'Querying inventory...'
$apps = @(Invoke-InventoryQuery 'microsoft.powerapps/apps' @('name', 'id', 'properties') |
  Where-Object { $_.properties.subType -eq 'microsoftApp' })
$envs = @{}
Invoke-InventoryQuery 'microsoft.powerplatform/environments' @('name', 'properties') |
  ForEach-Object { $envs[$_.name] = $_.properties }
$lastUsed = @{}
Invoke-InventoryQuery 'microsoft.powerplatformusage/usagerecords' @('id', 'properties') |
  Where-Object { $_.id -match '/providers/Microsoft\.PowerApps/apps/' } |
  ForEach-Object { $lastUsed[$_.properties.resourceId] = [datetime]$_.properties.lastUsed }
Write-Host "$($apps.Count) CMR apps, $($lastUsed.Count) app usage records."

# Owner check: getByIds silently omits deleted objects, so "requested but missing" = deleted.
$ids = @($apps | ForEach-Object { $_.properties.ownerId; $_.properties.createdBy } | Where-Object { $_ } | Sort-Object -Unique)
$users = @{}
for ($i = 0; $i -lt $ids.Count; $i += 1000) {
  $batch = @($ids[$i..([Math]::Min($i + 999, $ids.Count - 1))])
  $r = Invoke-RestMethod -Method Post -Uri 'https://graph.microsoft.com/v1.0/directoryObjects/getByIds?$select=id,displayName,userPrincipalName,accountEnabled' `
    -Headers @{ Authorization = "Bearer $GraphToken" } -ContentType 'application/json' -Body (@{ ids = $batch; types = @('user') } | ConvertTo-Json)
  $r.value | ForEach-Object { $users[$_.id] = $_ }
}
function Get-OwnerState($id) {
  if (-not $id) { return 'Unknown' }
  $u = $users[$id]
  if (-not $u) { return 'Deleted' }
  if ($u.accountEnabled -eq $false) { return 'Disabled' }
  'Active'
}

$now = (Get-Date).ToUniversalTime()
$result = foreach ($a in $apps) {
  $p = $a.properties
  $ownerState = Get-OwnerState $p.ownerId
  $used = $lastUsed[$a.name]
  $daysSinceUse = if ($used) { [int]($now - $used.ToUniversalTime()).TotalDays } else { $null }
  $active = $null -ne $daysSinceUse -and $daysSinceUse -le $ActiveDays
  $stale = $null -eq $daysSinceUse -or $daysSinceUse -gt $StaleDays
  $orphaned = $ownerState -in 'Deleted', 'Disabled'
  $class = if ($orphaned -and $active) { 'ActNow' } elseif ($orphaned -and $stale) { 'RetireCandidate' }
           elseif ($orphaned) { 'OrphanedLowUse' } elseif ($stale) { 'Stale' } else { 'Healthy' }
  [pscustomobject]@{
    Class          = $class
    AppName        = $p.displayName
    AppId          = $a.name
    Environment    = $envs[$p.environmentId].displayName
    EnvironmentId  = $p.environmentId
    Owner          = $users[$p.ownerId].userPrincipalName
    OwnerId        = $p.ownerId
    OwnerState     = $ownerState
    CreatorState   = Get-OwnerState $p.createdBy
    LastUsed       = if ($used) { $used.ToString('yyyy-MM-dd') } else { 'never' }
    DaysSinceUse   = $daysSinceUse
    LastModifiedAt = $p.lastModifiedAt
    Origin         = $p.origin
    Quarantined    = $p.isQuarantined
  }
}

$order = @{ ActNow = 0; OrphanedLowUse = 1; RetireCandidate = 2; Stale = 3; Healthy = 4 }
$result = @($result | Sort-Object { $order[$_.Class] }, DaysSinceUse)
$result | Export-Csv -Path $OutFile -NoTypeInformation -Encoding utf8
$result | Group-Object Class | Select-Object Name, Count | Format-Table -AutoSize
Write-Host "Written to $OutFile. Handle ActNow rows first: orphaned apps that people still use."
