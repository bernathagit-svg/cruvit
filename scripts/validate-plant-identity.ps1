<#
.SYNOPSIS
  Cruvit Plant Identity Registry — cross-entry integrity validator (read-only).

.DESCRIPTION
  Validates registry-wide identity integrity that JSON Schema alone cannot enforce
  (global uniqueness, cross-entry alias/module-key uniqueness, referential
  consistency against the live catalog + modules, and duplicate-conflict quarantine).

  This tool is READ-ONLY. It parses data files and the inline PLANT_LIBRARY /
  CARE_QUALITY_PROFILES identity data, then reports PASS/FAIL per check plus a
  coverage report. It never writes, stages, installs, or changes any data.

  Exit code 0 => all integrity checks passed.
  Exit code 1 => one or more integrity checks failed.
  Exit code 2 => a required source file/marker could not be read (cannot validate).

.NOTES
  Windows PowerShell 5.1 compatible. No external dependencies. No temp files.
  Identity is never inferred from array order (last-key-wins is treated as a risk,
  never as an identity rule).
#>

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Paths (repo root is the parent of this script's folder)
# ---------------------------------------------------------------------------
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir

$paths = @{
  registry = Join-Path $repoRoot 'data/plant-identity.registry.json'
  schema   = Join-Path $repoRoot 'data/plant-identity.schema.json'
  seed     = Join-Path $repoRoot 'data/plants.seed.json'
  catalog  = Join-Path $repoRoot 'data/plant-catalog.schema.json'
  html     = Join-Path $repoRoot 'index.html'
  manifest = Join-Path $repoRoot 'modules/garden-design/assets/plants/manifest.json'
}

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------
$script:failCount = 0
$script:passCount = 0

function Write-Head([string]$text) {
  Write-Host ''
  Write-Host $text -ForegroundColor Cyan
}
function Pass([string]$msg) {
  $script:passCount++
  Write-Host "  [PASS] $msg" -ForegroundColor Green
}
function Fail([string]$msg) {
  $script:failCount++
  Write-Host "  [FAIL] $msg" -ForegroundColor Red
}
function Abort([string]$msg) {
  Write-Host ''
  Write-Host "  [ABORT] $msg" -ForegroundColor Yellow
  Write-Host ''
  exit 2
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Read-JsonFile([string]$label, [string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { Abort "$label not found: $path" }
  try {
    return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    Abort "$label failed to parse as JSON: $($_.Exception.Message)"
  }
}

# Genus-level / non-species scientific name detector (spp. / sp. / "various")
function Test-GenusLevel([string]$sci) {
  if ([string]::IsNullOrWhiteSpace($sci)) { return $true }
  return ($sci -match '\bspp?\.' -or $sci -match '(?i)various')
}

Write-Host '=== Cruvit Plant Identity Registry - Cross-Entry Validator (read-only) ==='

# ---------------------------------------------------------------------------
# 1. Parse all sources
# ---------------------------------------------------------------------------
Write-Head '1. Parsing sources'

$registry = Read-JsonFile 'Registry (plant-identity.registry.json)' $paths.registry
Pass 'data/plant-identity.registry.json parsed'
$schema = Read-JsonFile 'Schema (plant-identity.schema.json)' $paths.schema
Pass 'data/plant-identity.schema.json parsed'
$seed = Read-JsonFile 'Seed catalog (plants.seed.json)' $paths.seed
Pass 'data/plants.seed.json parsed'
$null = Read-JsonFile 'Catalog schema (plant-catalog.schema.json)' $paths.catalog
Pass 'data/plant-catalog.schema.json parsed'
$manifest = Read-JsonFile 'Garden Design manifest' $paths.manifest
Pass 'modules/garden-design/assets/plants/manifest.json parsed'

if (-not (Test-Path -LiteralPath $paths.html)) { Abort "index.html not found: $($paths.html)" }
$html = Get-Content -LiteralPath $paths.html -Raw -Encoding UTF8

# --- inline PLANT_LIBRARY block ---
$libStart = $html.IndexOf('const PLANT_LIBRARY=[')
$libEnd   = $html.IndexOf('const PLANT_INDEX=')
if ($libStart -lt 0 -or $libEnd -lt 0 -or $libEnd -le $libStart) {
  Abort 'Could not locate the inline PLANT_LIBRARY block in index.html'
}
$libBlock = $html.Substring($libStart, $libEnd - $libStart)

# --- inline CARE_QUALITY_PROFILES block ---
$cqStart = $html.IndexOf('const CARE_QUALITY_PROFILES={')
$cqEnd   = $html.IndexOf('function careProfileForPlant')
if ($cqStart -lt 0 -or $cqEnd -lt 0 -or $cqEnd -le $cqStart) {
  Abort 'Could not locate the inline CARE_QUALITY_PROFILES block in index.html'
}
$cqBlock = $html.Substring($cqStart, $cqEnd - $cqStart)
Pass 'index.html PLANT_LIBRARY + CARE_QUALITY_PROFILES blocks located'

# ---------------------------------------------------------------------------
# Build source namespaces
# ---------------------------------------------------------------------------
$reAll = [regex]"\{slug:'([a-z0-9\-]+)'"
$inlineRecords = @($reAll.Matches($libBlock) | ForEach-Object { $_.Groups[1].Value })

$reSci = [regex]::new("\{slug:'([a-z0-9\-]+)'.*?scientific:'([^']*)'", [System.Text.RegularExpressions.RegexOptions]::Singleline)
$inlineSci = @{}   # slug -> list of scientific names observed inline
foreach ($m in $reSci.Matches($libBlock)) {
  $s = $m.Groups[1].Value; $sci = $m.Groups[2].Value
  if (-not $inlineSci.ContainsKey($s)) { $inlineSci[$s] = New-Object System.Collections.Generic.List[string] }
  $inlineSci[$s].Add($sci)
}

$reCq = [regex]"'([a-z0-9\-]+)':\{slug:'"
$cqKeys = @($reCq.Matches($cqBlock) | ForEach-Object { $_.Groups[1].Value })

$seedRecords = @($seed.plants | ForEach-Object { $_.slug })
$seedSci = @{}
foreach ($p in $seed.plants) {
  if (-not $seedSci.ContainsKey($p.slug)) { $seedSci[$p.slug] = New-Object System.Collections.Generic.List[string] }
  if ($p.PSObject.Properties.Name -contains 'scientific') { $seedSci[$p.slug].Add([string]$p.scientific) }
}

$manifestKeys = @($manifest.plants.PSObject.Properties.Name)

$inlineSlugSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$inlineRecords)
$seedSlugSet   = [System.Collections.Generic.HashSet[string]]::new([string[]]$seedRecords)

# catalog union (inline + seed distinct)
$catalogUnion = [System.Collections.Generic.HashSet[string]]::new()
foreach ($s in $inlineRecords) { [void]$catalogUnion.Add($s) }
foreach ($s in $seedRecords)   { [void]$catalogUnion.Add($s) }

# combined slug -> scientific list (for genus-level classification)
$sciMap = @{}
foreach ($k in $inlineSci.Keys) {
  if (-not $sciMap.ContainsKey($k)) { $sciMap[$k] = New-Object System.Collections.Generic.List[string] }
  foreach ($v in $inlineSci[$k]) { $sciMap[$k].Add($v) }
}
foreach ($k in $seedSci.Keys) {
  if (-not $sciMap.ContainsKey($k)) { $sciMap[$k] = New-Object System.Collections.Generic.List[string] }
  foreach ($v in $seedSci[$k]) { $sciMap[$k].Add($v) }
}

$sourceSets = @{
  plantLibrary        = $inlineSlugSet
  careQualityProfiles = [System.Collections.Generic.HashSet[string]]::new([string[]]$cqKeys)
  gardenDesignManifest= [System.Collections.Generic.HashSet[string]]::new([string[]]$manifestKeys)
  seed                = $seedSlugSet
}

# ---------------------------------------------------------------------------
# Flatten registry
# ---------------------------------------------------------------------------
$canon = @($registry.canonicalIdentities)
$conflicts = @($registry.duplicateConflicts)

$canonSlugList = @($canon | ForEach-Object { $_.canonicalSlug })
$canonSlugSet  = [System.Collections.Generic.HashSet[string]]::new([string[]]$canonSlugList)

# aliasSlug occurrences with owning canonical
$aliasEntries = New-Object System.Collections.Generic.List[object]
foreach ($e in $canon) {
  if ($e.PSObject.Properties.Name -contains 'aliasSlugs' -and $e.aliasSlugs) {
    foreach ($a in $e.aliasSlugs) {
      $aliasEntries.Add([pscustomobject]@{ alias = $a; canonical = $e.canonicalSlug })
    }
  }
}

# module-key occurrences with namespace + owning canonical
$moduleKeyEntries = New-Object System.Collections.Generic.List[object]
foreach ($e in $canon) {
  if ($e.PSObject.Properties.Name -contains 'moduleKeys' -and $e.moduleKeys) {
    foreach ($ns in $e.moduleKeys.PSObject.Properties) {
      foreach ($k in $ns.Value) {
        $moduleKeyEntries.Add([pscustomobject]@{ ns = $ns.Name; key = $k; canonical = $e.canonicalSlug })
      }
    }
  }
}

# plantId occurrences with owning canonical
$plantIdEntries = New-Object System.Collections.Generic.List[object]
foreach ($e in $canon) {
  if ($e.PSObject.Properties.Name -contains 'plantId' -and $e.plantId) {
    $plantIdEntries.Add([pscustomobject]@{ id = $e.plantId; canonical = $e.canonicalSlug })
  }
}

$conflictSlugList = @($conflicts | ForEach-Object { $_.slug })
$conflictSlugSet  = [System.Collections.Generic.HashSet[string]]::new([string[]]$conflictSlugList)

# ---------------------------------------------------------------------------
# 2. Registry-wide identity integrity
# ---------------------------------------------------------------------------
Write-Head '2. Registry-wide identity integrity'

# canonicalSlug uniqueness
$dupCanon = @($canonSlugList | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
if ($dupCanon.Count -eq 0) { Pass 'canonicalSlug is unique across all canonical identities' }
else { Fail ("canonicalSlug repeated: " + ($dupCanon -join ', ')) }

# plantId format valid when present
$badFormat = @($plantIdEntries | Where-Object { $_.id -notmatch '^plt_[a-z0-9]{16}$' })
if ($badFormat.Count -eq 0) { Pass "plantId format valid where present ($($plantIdEntries.Count) present)" }
else { Fail ("plantId format invalid: " + (($badFormat | ForEach-Object { "$($_.id) on $($_.canonical)" }) -join '; ')) }

# plantId global uniqueness
$dupIds = @($plantIdEntries | Group-Object id | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
if ($dupIds.Count -eq 0) { Pass 'plantId is globally unique' }
else { Fail ("plantId reused: " + ($dupIds -join ', ')) }

# one plantId maps to only one canonicalSlug
$idToCanon = $plantIdEntries | Group-Object id | Where-Object { @($_.Group.canonical | Sort-Object -Unique).Count -gt 1 }
if (@($idToCanon).Count -eq 0) { Pass 'each plantId maps to only one canonicalSlug' }
else { Fail ("plantId maps to multiple canonicalSlugs: " + (($idToCanon | ForEach-Object { $_.Name }) -join ', ')) }

# aliasSlug uniqueness across all canonical identities
$dupAlias = @(@($aliasEntries.alias) | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
if ($dupAlias.Count -eq 0) { Pass 'aliasSlug is unique across all canonical identities' }
else { Fail ("aliasSlug appears in more than one canonical identity: " + ($dupAlias -join ', ')) }

# module keys unique across all canonical identities (per namespace)
$dupModule = @($moduleKeyEntries | Group-Object { "$($_.ns)/$($_.key)" } | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
if ($dupModule.Count -eq 0) { Pass 'module keys are unique across all canonical identities' }
else { Fail ("module key appears in more than one canonical identity: " + ($dupModule -join ', ')) }

# no module key maps to multiple canonical slugs
$modToCanon = $moduleKeyEntries | Group-Object { "$($_.ns)/$($_.key)" } | Where-Object { @($_.Group.canonical | Sort-Object -Unique).Count -gt 1 }
if (@($modToCanon).Count -eq 0) { Pass 'no module key maps to multiple canonical slugs' }
else { Fail ("module key maps to multiple canonical slugs: " + (($modToCanon | ForEach-Object { $_.Name }) -join ', ')) }

# no aliasSlug equals another canonicalSlug
$aliasVsCanon = @($aliasEntries | Where-Object { $canonSlugSet.Contains($_.alias) })
if ($aliasVsCanon.Count -eq 0) { Pass 'no aliasSlug equals a canonicalSlug' }
else { Fail ("aliasSlug collides with a canonicalSlug: " + (($aliasVsCanon | ForEach-Object { "$($_.alias) (in $($_.canonical))" }) -join '; ')) }

# no aliasSlug equals a module key (both are identity handles)
$moduleKeySet = [System.Collections.Generic.HashSet[string]]::new([string[]]@($moduleKeyEntries.key))
$aliasVsModule = @($aliasEntries | Where-Object { $moduleKeySet.Contains($_.alias) })
if ($aliasVsModule.Count -eq 0) { Pass 'no aliasSlug collides with a module key' }
else { Fail ("aliasSlug collides with a module key: " + (($aliasVsModule | ForEach-Object { $_.alias }) -join ', ')) }

# ---------------------------------------------------------------------------
# 3. Duplicate-conflict quarantine
# ---------------------------------------------------------------------------
Write-Head '3. Duplicate-conflict quarantine'

# no pending duplicate conflict carries a plantId
$conflictWithId = @($conflicts | Where-Object { $_.PSObject.Properties.Name -contains 'plantId' -and $_.plantId })
if ($conflictWithId.Count -eq 0) { Pass 'no duplicate conflict carries a plantId' }
else { Fail ("duplicate conflict carries plantId: " + (($conflictWithId | ForEach-Object { $_.slug }) -join ', ')) }

# no unresolved duplicate slug is silently treated as canonical (or alias)
$conflictAsCanon = @($conflictSlugList | Where-Object { $canonSlugSet.Contains($_) })
$conflictAsAlias = @($conflictSlugList | Where-Object { $_ -in $aliasEntries.alias })
if ($conflictAsCanon.Count -eq 0 -and $conflictAsAlias.Count -eq 0) {
  Pass 'no unresolved duplicate slug is represented as a canonical identity or alias'
} else {
  if ($conflictAsCanon.Count -gt 0) { Fail ("duplicate-conflict slug used as canonicalSlug: " + ($conflictAsCanon -join ', ')) }
  if ($conflictAsAlias.Count -gt 0) { Fail ("duplicate-conflict slug used as aliasSlug: " + ($conflictAsAlias -join ', ')) }
}

# the three known conflicts must remain quarantined + pending
$required = @('avocado','strawberry-guava','mulberry')
foreach ($rc in $required) {
  $c = $conflicts | Where-Object { $_.slug -eq $rc }
  if (-not $c) { Fail "expected duplicate conflict missing: $rc"; continue }
  if ($c.resolutionStatus -eq 'pending') { Pass "$rc remains in duplicateConflicts with resolutionStatus=pending" }
  else { Fail "$rc resolutionStatus is '$($c.resolutionStatus)', expected 'pending'" }
}

# strawberry-guava scientific spelling record
$sg = $conflicts | Where-Object { $_.slug -eq 'strawberry-guava' }
if ($sg) {
  $acc = $sg.recommendedCanonicalScientificName
  $con = $sg.conflictingScientificNamePresent
  if ($acc -eq 'Psidium cattleianum') { Pass "strawberry-guava accepted spelling recorded: Psidium cattleianum" }
  else { Fail "strawberry-guava accepted spelling is '$acc', expected 'Psidium cattleianum'" }
  if ($con -eq 'Psidium cattleyanum') { Pass "strawberry-guava conflicting spelling recorded: Psidium cattleyanum" }
  else { Fail "strawberry-guava conflicting spelling is '$con', expected 'Psidium cattleyanum'" }
}

# ---------------------------------------------------------------------------
# 4. Referential consistency (registry -> catalog + modules)
# ---------------------------------------------------------------------------
Write-Head '4. Referential consistency'

# every canonicalSlug exists in the catalog union
$canonMissing = @($canonSlugList | Where-Object { -not $catalogUnion.Contains($_) })
if ($canonMissing.Count -eq 0) { Pass 'every canonicalSlug exists in the inline+seed catalog union' }
else { Fail ("canonicalSlug not found in catalog union: " + ($canonMissing -join ', ')) }

# every aliasSlug exists in its source namespace (catalog slug namespace)
$aliasMissing = @($aliasEntries | Where-Object { -not $catalogUnion.Contains($_.alias) })
if ($aliasMissing.Count -eq 0) { Pass 'every aliasSlug exists in the catalog slug namespace' }
else { Fail ("aliasSlug not found in catalog namespace: " + (($aliasMissing | ForEach-Object { $_.alias }) -join ', ')) }

# every module key exists in its claimed source namespace
$moduleMissing = New-Object System.Collections.Generic.List[string]
foreach ($mk in $moduleKeyEntries) {
  if (-not $sourceSets.ContainsKey($mk.ns)) { $moduleMissing.Add("$($mk.ns)/$($mk.key) (unknown namespace)"); continue }
  if (-not $sourceSets[$mk.ns].Contains($mk.key)) { $moduleMissing.Add("$($mk.ns)/$($mk.key)") }
}
if ($moduleMissing.Count -eq 0) { Pass 'every module key exists in its claimed source namespace (careQualityProfiles / gardenDesignManifest verified)' }
else { Fail ("module key missing from source namespace: " + ($moduleMissing -join ', ')) }

# ---------------------------------------------------------------------------
# 5. Schema consistency (top-level shape only)
# ---------------------------------------------------------------------------
Write-Head '5. Schema consistency'

$schemaProps = @($schema.properties.PSObject.Properties.Name)
$regProps    = @($registry.PSObject.Properties.Name)
$undeclared  = @($regProps | Where-Object { $_ -notin $schemaProps })
if ($undeclared.Count -eq 0) { Pass "all registry top-level properties are declared by the schema ($($regProps -join ', '))" }
else { Fail ("registry has undeclared top-level properties (additionalProperties:false): " + ($undeclared -join ', ')) }

if ($registry.schemaVersion -eq 1) { Pass 'schemaVersion == 1 (matches schema const)' }
else { Fail "schemaVersion is '$($registry.schemaVersion)', expected 1" }

if ($registry.registryVersion -match '^[0-9]+\.[0-9]+\.[0-9]+$') { Pass "registryVersion format valid ($($registry.registryVersion))" }
else { Fail "registryVersion '$($registry.registryVersion)' does not match ^[0-9]+\.[0-9]+\.[0-9]+$" }

# ---------------------------------------------------------------------------
# Coverage report
# ---------------------------------------------------------------------------
Write-Head 'Coverage report'

$rawCount = $inlineRecords.Count + $seedRecords.Count
$uniqueSlugs = $catalogUnion.Count
$aliasSlugCount = $aliasEntries.Count
$canonicalIdentityCount = $uniqueSlugs - $aliasSlugCount   # collapse verified aliases

# canonical identity slug set = catalog union minus alias slugs
$aliasSet = [System.Collections.Generic.HashSet[string]]::new([string[]]@($aliasEntries.alias))
$canonicalIdentitySlugs = @($catalogUnion | Where-Object { -not $aliasSet.Contains($_) })

# not represented in registry as a canonical identity
$notInRegistry = @($canonicalIdentitySlugs | Where-Object { -not $canonSlugSet.Contains($_) })
$notInRegistryFully = @($notInRegistry | Where-Object { -not $conflictSlugSet.Contains($_) })

# genus/Various vs species split (exclude conflict slugs; they are blocked separately)
$genusReview = New-Object System.Collections.Generic.List[string]
$speciesSafe = New-Object System.Collections.Generic.List[string]
foreach ($s in $canonicalIdentitySlugs) {
  if ($conflictSlugSet.Contains($s)) { continue }   # blocked by duplicate conflict
  $scis = @()
  if ($sciMap.ContainsKey($s)) { $scis = @($sciMap[$s]) }
  $isGenus = $false
  if ($scis.Count -eq 0) { $isGenus = $true }
  foreach ($sc in $scis) { if (Test-GenusLevel $sc) { $isGenus = $true } }
  if ($isGenus) { $genusReview.Add($s) } else { $speciesSafe.Add($s) }
}

$blockedByConflict = @($canonicalIdentitySlugs | Where-Object { $conflictSlugSet.Contains($_) })

Write-Host ("  raw catalog records (inline + seed)          : {0}  ({1} inline + {2} seed)" -f $rawCount, $inlineRecords.Count, $seedRecords.Count)
Write-Host ("  unique slugs (inline + seed union)           : {0}" -f $uniqueSlugs)
Write-Host ("  verified alias slugs collapsed               : {0}  ({1})" -f $aliasSlugCount, ((@($aliasEntries.alias)) -join ', '))
Write-Host ("  canonical identities after alias collapse    : {0}" -f $canonicalIdentityCount)
Write-Host ("  registry canonical-entry count               : {0}" -f $canon.Count)
Write-Host ("  duplicate-conflict count                     : {0}  ({1})" -f $conflicts.Count, ($conflictSlugList -join ', '))
Write-Host ("  canonical identities not yet in registry     : {0}  ({1} fully unrepresented + {2} documented as pending conflicts)" -f $notInRegistry.Count, $notInRegistryFully.Count, $blockedByConflict.Count)
Write-Host ("  species-level identities likely safe to alloc: {0}" -f $speciesSafe.Count)
Write-Host ("  genus-level / Various needing review         : {0}" -f $genusReview.Count)
Write-Host ("  identities blocked by duplicate conflicts    : {0}  ({1})" -f $blockedByConflict.Count, ($blockedByConflict -join ', '))
Write-Host ''
Write-Host ("  genus-level / Various (review) slugs: " + (($genusReview | Sort-Object) -join ', '))

# ---------------------------------------------------------------------------
# Summary + exit code
# ---------------------------------------------------------------------------
Write-Head 'Summary'
Write-Host ("  checks passed: {0}" -f $script:passCount)
Write-Host ("  checks failed: {0}" -f $script:failCount)

if ($script:failCount -gt 0) {
  Write-Host ''
  Write-Host 'RESULT: FAIL - registry integrity problems found (see [FAIL] lines above).' -ForegroundColor Red
  Write-Host ''
  exit 1
}

Write-Host ''
Write-Host 'RESULT: PASS - all registry integrity checks passed.' -ForegroundColor Green
Write-Host ''
exit 0
