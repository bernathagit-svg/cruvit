<#
.SYNOPSIS
  Cruvit Plant Identity Registry - immutable plantId allocator (dry-run by default).

.DESCRIPTION
  Allocates immutable opaque catalog-level plantId values (format: plt_ + 16 lowercase
  alphanumeric chars) to an explicit allow-list of canonical slugs in
  data/plant-identity.registry.json.

  SAFETY MODEL:
  - DRY RUN IS THE DEFAULT. Without -Apply, the script generates candidate IDs, prints
    an audit table, and writes NOTHING (no registry change, no temp/report files).
  - Real writing requires the explicit -Apply switch (atomic write, designed below).
    -Apply is intentionally NOT used by the Allocation Tooling Foundation task.
  - The whole operation is refused (non-zero exit, no partial work) if any supplied
    slug is ineligible.

  IDs are opaque: generated with a CSPRNG (RandomNumberGenerator) using rejection
  sampling to avoid modulo bias, never derived from slug, name, or scientific name,
  and checked for collisions against all existing and retired (tombstoned) IDs.

.PARAMETER Slugs
  Required. Explicit array of canonical slugs to allocate IDs for.

.PARAMETER Apply
  Optional. When present, writes IDs into the registry atomically. Do NOT use during
  the tooling-foundation task. Default (absent) = dry run.

.EXITCODES
  0 = dry run (or apply) succeeded
  2 = registry not found / parse failure
  3 = invalid allow-list (empty or contains duplicates)
  4 = one or more supplied slugs are ineligible (whole operation refused)
  5 = ID generation could not find a collision-free candidate

.NOTES
  Windows PowerShell 5.1 compatible. No dependencies. Read-only in default (dry-run) mode.
#>

param(
  [Parameter(Mandatory = $true)]
  [string[]]$Slugs,

  [switch]$Apply
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$scriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot     = Split-Path -Parent $scriptDir
$registryPath = Join-Path $repoRoot 'data/plant-identity.registry.json'

$ID_PATTERN = '^plt_[a-z0-9]{16}$'

function Die([int]$code, [string]$msg) {
  Write-Host "ERROR: $msg" -ForegroundColor Red
  exit $code
}

# ---------------------------------------------------------------------------
# CSPRNG plantId generator: plt_ + 16 chars from [a-z0-9], unbiased.
# ---------------------------------------------------------------------------
function New-PlantId {
  $alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'  # 36 symbols
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $sb = New-Object System.Text.StringBuilder
    $buf = New-Object 'byte[]' 1
    while ($sb.Length -lt 16) {
      $rng.GetBytes($buf)
      $b = [int]$buf[0]
      # Rejection sampling: 256 mod 36 = 4, so reject the top 4 values (>= 252 = 36*7)
      if ($b -lt 252) { [void]$sb.Append($alphabet[$b % 36]) }
    }
    return 'plt_' + $sb.ToString()
  } finally {
    $rng.Dispose()
  }
}

# ---------------------------------------------------------------------------
# Load registry (read-only)
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $registryPath)) { Die 2 "registry not found: $registryPath" }
$rawRegistry = Get-Content -LiteralPath $registryPath -Raw -Encoding UTF8
try {
  $reg = $rawRegistry | ConvertFrom-Json
} catch {
  Die 2 "registry failed to parse as JSON: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# Allow-list validation
#   Normalize input so the allocator behaves identically whether the caller
#   passes a real array (-Slugs a,b,c) or a single delimited string
#   ("a,b,c" via powershell -File). Slugs never contain commas, so splitting
#   on comma is safe and keeps exit codes reliable under -File invocation.
# ---------------------------------------------------------------------------
$allow = @()
foreach ($item in @($Slugs)) {
  foreach ($part in ([string]$item -split ',')) {
    $p = $part.Trim()
    if ($p.Length -gt 0) { $allow += $p }
  }
}
if ($allow.Count -eq 0) { Die 3 'empty allow-list: supply at least one canonical slug' }
$dupAllow = @($allow | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
if ($dupAllow.Count -gt 0) { Die 3 ("duplicate allow-list values: " + ($dupAllow -join ', ')) }

# ---------------------------------------------------------------------------
# Build lookup sets from registry (identity is never inferred from array order)
# ---------------------------------------------------------------------------
$canon = @($reg.canonicalIdentities)
$canonBySlug = @{}
foreach ($e in $canon) { $canonBySlug[$e.canonicalSlug] = $e }

$aliasOwner = @{}
foreach ($e in $canon) {
  if ($e.PSObject.Properties.Name -contains 'aliasSlugs' -and $e.aliasSlugs) {
    foreach ($a in $e.aliasSlugs) { $aliasOwner[$a] = $e.canonicalSlug }
  }
}

$moduleOwner = @{}
foreach ($e in $canon) {
  if ($e.PSObject.Properties.Name -contains 'moduleKeys' -and $e.moduleKeys) {
    foreach ($ns in $e.moduleKeys.PSObject.Properties) {
      foreach ($k in $ns.Value) { $moduleOwner[$k] = $e.canonicalSlug }
    }
  }
}

$conflictSet = @{}
foreach ($c in @($reg.duplicateConflicts)) { $conflictSet[$c.slug] = $true }

$existingIds = New-Object System.Collections.Generic.HashSet[string]
foreach ($e in $canon) {
  if ($e.PSObject.Properties.Name -contains 'plantId' -and $e.plantId) { [void]$existingIds.Add($e.plantId) }
}

# Retired / tombstoned IDs (future-proofing). If no tombstones section, treat as empty.
$retiredIds = New-Object System.Collections.Generic.HashSet[string]
if ($reg.PSObject.Properties.Name -contains 'tombstones' -and $reg.tombstones) {
  foreach ($t in @($reg.tombstones)) {
    if ($t.PSObject.Properties.Name -contains 'plantId' -and $t.plantId) { [void]$retiredIds.Add($t.plantId) }
  }
}

# ---------------------------------------------------------------------------
# Eligibility screening (refuse the WHOLE operation on any failure)
# ---------------------------------------------------------------------------
$refusals = New-Object System.Collections.Generic.List[string]
foreach ($s in $allow) {
  if ($conflictSet.ContainsKey($s)) {
    $refusals.Add("$s : present in duplicateConflicts (unresolved) - not eligible")
  }
  elseif ($canonBySlug.ContainsKey($s)) {
    $e = $canonBySlug[$s]
    if ($e.needsReview) {
      $refusals.Add("$s : needsReview=true - not eligible")
    }
    elseif ($e.PSObject.Properties.Name -contains 'plantId' -and $e.plantId) {
      $refusals.Add("$s : already has plantId '$($e.plantId)'")
    }
    # else: eligible
  }
  elseif ($aliasOwner.ContainsKey($s)) {
    $refusals.Add("$s : is an alias of canonical '$($aliasOwner[$s])', not a canonicalSlug")
  }
  elseif ($moduleOwner.ContainsKey($s)) {
    $refusals.Add("$s : is a module key of canonical '$($moduleOwner[$s])', not a canonicalSlug")
  }
  else {
    $refusals.Add("$s : does not exist in canonicalIdentities")
  }
}

if ($refusals.Count -gt 0) {
  Write-Host ''
  Write-Host 'OPERATION REFUSED - no IDs generated, no files written:' -ForegroundColor Red
  foreach ($r in $refusals) { Write-Host "  - $r" -ForegroundColor Red }
  Write-Host ''
  exit 4
}

# ---------------------------------------------------------------------------
# Generate collision-free candidate IDs
# ---------------------------------------------------------------------------
$batch = New-Object System.Collections.Generic.HashSet[string]
$results = New-Object System.Collections.Generic.List[object]
foreach ($s in $allow) {
  $id = $null
  $attempts = 0
  do {
    $id = New-PlantId
    $attempts++
    if ($attempts -gt 1000) { Die 5 "could not generate a collision-free plantId for '$s' after 1000 attempts" }
  } while ($existingIds.Contains($id) -or $retiredIds.Contains($id) -or $batch.Contains($id))
  [void]$batch.Add($id)
  $results.Add([pscustomobject]@{ canonicalSlug = $s; plantId = $id })
}

$formatOk = @($results | Where-Object { $_.plantId -notmatch $ID_PATTERN })
$uniqueCount = @($results.plantId | Sort-Object -Unique).Count
$batchUnique = ($uniqueCount -eq $results.Count) -and ($formatOk.Count -eq 0)

# ---------------------------------------------------------------------------
# Output audit table
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '=== Plant ID Allocation - candidate audit ===' -ForegroundColor Cyan
Write-Host ''
Write-Host ('  {0,-22} {1}' -f 'canonicalSlug', 'proposed plantId')
Write-Host ('  {0,-22} {1}' -f '-------------', '----------------')
foreach ($r in $results) {
  Write-Host ('  {0,-22} {1}' -f $r.canonicalSlug, $r.plantId)
}
Write-Host ''
Write-Host ("  candidate count      : {0}" -f $results.Count)
Write-Host ("  batch uniqueness     : {0}" -f $(if ($batchUnique) { 'PASS (all unique, all well-formed)' } else { 'FAIL' }))
Write-Host ("  registry path        : {0}" -f $registryPath)
Write-Host ("  registryVersion      : {0}" -f $reg.registryVersion)
Write-Host ''

# ---------------------------------------------------------------------------
# Write mode (atomic) - designed for the future -Apply pilot; NOT run here.
# ---------------------------------------------------------------------------
if ($Apply) {
  # Preserve deterministic behavior: do not reorder entries, do not reformat.
  # Insert `"plantId": "<id>",` immediately after each entry's canonicalSlug line.
  $newText = $rawRegistry
  foreach ($r in $results) {
    $anchor = '"canonicalSlug": "' + $r.canonicalSlug + '",'
    $idx = $newText.IndexOf($anchor)
    if ($idx -lt 0) { Die 5 "apply aborted: could not locate anchor for '$($r.canonicalSlug)'" }
    $insertion = $anchor + "`r`n      " + '"plantId": "' + $r.plantId + '",'
    # Replace only the first occurrence of this unique anchor.
    $newText = $newText.Substring(0, $idx) + $insertion + $newText.Substring($idx + $anchor.Length)
  }
  # Atomic write: temp file in same directory, then Move-Item -Force.
  $tmp = $registryPath + '.tmp'
  Set-Content -LiteralPath $tmp -Value $newText -Encoding UTF8 -NoNewline
  Move-Item -LiteralPath $tmp -Destination $registryPath -Force
  Write-Host 'APPLY: registry updated atomically.' -ForegroundColor Yellow
  Write-Host ''
  exit 0
}

Write-Host 'DRY RUN - NO FILES WRITTEN' -ForegroundColor Green
Write-Host ''
if (-not $batchUnique) { exit 5 }
exit 0
