<#
.SYNOPSIS
  Cruvit Growth Outcome Suitability GOS-2B pilot data validator.

.DESCRIPTION
  Validates the Mango-led pilot evidence and profile JSON files against the
  GOS-1 schemas and pilot-specific semantic gates. No evaluator. No runtime
  loading. No external dependencies.

  Exit code 0 => all assertions passed.
  Exit code 1 => one or more assertions failed.
  Exit code 2 => required file could not be read (cannot validate).
#>

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir

$paths = @{
  profileSchema  = Join-Path $repoRoot 'data/growth-outcome.schema.json'
  evidenceSchema = Join-Path $repoRoot 'data/growth-outcome-evidence.schema.json'
  evidencePilot  = Join-Path $repoRoot 'data/growth-outcome-pilot/evidence.json'
  profilesPilot  = Join-Path $repoRoot 'data/growth-outcome-pilot/profiles.json'
  indexHtml      = Join-Path $repoRoot 'index.html'
}

$script:failCount = 0
$script:passCount = 0

$script:SixOutcomes = @(
  'survival',
  'vegetativeGrowth',
  'flowering',
  'fruitSet',
  'fruitRipeningOrYield',
  'longTermReliability'
)

$script:AllowedIds = @(
  'ev_mango_surv_freeze_mature_mg216','ev_mango_surv_freeze_young_mg216','ev_mango_surv_no_acclimate_mg216','ev_mango_surv_protected_location_mg216',
  'ev_mango_veg_opt_temp_hs1499','ev_mango_veg_heat_hs1499','ev_mango_veg_vs_flower_regime',
  'ev_mango_flow_cool_night_tommy_dav1993','ev_mango_flow_cultivar_dormancy_hs1499',
  'ev_mango_set_low_conversion_mg216','ev_mango_set_flower_cold_mg216','ev_mango_set_anthracnose_mildew_mg216','ev_mango_set_sex_ratio_mg216','ev_mango_set_bloom_chill_hs1499',
  'ev_mango_yield_dev_days_mg216','ev_mango_yield_graft_juvenile_mg216',
  'ev_mango_rel_weather_disease_partial','ev_mango_rel_cultivar_unknown',
  'ev_lychee_surv_freeze_young_mg051','ev_lychee_surv_freeze_mature_mg051','ev_lychee_surv_freeze_range_hs1499',
  'ev_lychee_veg_flush_warm_hs1499',
  'ev_lychee_flow_dormancy_hs1499','ev_lychee_flow_chill_comment_hs1499','ev_lychee_flow_not_tropical_sealevel_mg051',
  'ev_lychee_set_rh_heat_hs1499','ev_lychee_rel_unreliable_bearing_mg051',
  'ev_apple_flow_needs_chill_ucanr8261','ev_apple_flow_cultivar_chill_table_ucanr8261','ev_apple_set_cross_pollination_ucanr8261','ev_apple_rel_wrong_chill_cultivar',
  'ev_olive_surv_lethal_minus10c_hartmann1975','ev_olive_flow_chill_regimes_hartmann1975','ev_olive_veg_thinning_next_bloom_ucipm','ev_olive_rel_alternate_bearing_ucipm',
  'ev_boug_surv_frost_ep130','ev_boug_veg_temp_ep130','ev_boug_flow_full_sun_ep130','ev_boug_flow_new_growth_ep130','ev_boug_flow_drought_induce_ep130','ev_boug_flow_excess_fert_inhibits_ep130','ev_boug_rel_irregular_flowering_ep130'
)

$script:ExcludedIds = @(
  'ev_mango_yield_home_avg_mg216','ev_lychee_yield_mauritius_fshs','ev_olive_flow_arbequina_no_classic_chill','ev_apple_veg_succeeds_flower_fails',
  'ev_reject_mango_patio_reliable_yield','ev_reject_survival_implies_yield','ev_reject_mango_global_chill_hours','ev_apple_flow_species_800_1000_reject',
  'ev_mango_flow_mechanism_region_conflict','ev_olive_flow_cultivar_pattern_conflict'
)

$script:AllowedAuthorities = @('extension-uf-ifas','ctahr-uh','ashs','uc-ipm','extension-ucanr')
$script:ForbiddenFields = @('score','level','goalFit','recommendedUse','overallConclusion','suitabilityScore')
$script:ExpectedPlantIds = @{
  apple = 'plt_465b6lc4cnrarxaa'
  olive = 'plt_e1teyafat3k5i3ke'
}

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
function Assert-True([bool]$cond, [string]$msg) {
  if ($cond) { Pass $msg } else { Fail $msg }
}
function Has-Prop($obj, [string]$name) {
  if ($null -eq $obj) { return $false }
  return $null -ne ($obj.PSObject.Properties[$name])
}
function Read-JsonFile([string]$label, [string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { Abort "$label not found: $path" }
  try {
    return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    Abort "$label failed to parse as JSON: $($_.Exception.Message)"
  }
}
function Read-Text([string]$label, [string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { Abort "$label not found: $path" }
  return (Get-Content -LiteralPath $path -Raw -Encoding UTF8)
}
function Get-ClaimById($evidenceDoc, [string]$id) {
  foreach ($c in @($evidenceDoc.evidence)) {
    if ([string]$c.evidenceId -eq $id) { return $c }
  }
  return $null
}
function Get-ProfileBySlug($profilesDoc, [string]$slug) {
  foreach ($p in @($profilesDoc.profiles)) {
    if ([string]$p.canonicalSlug -eq $slug) { return $p }
  }
  return $null
}
function Find-RuleEffect($profile, [string]$outcome, [string]$ruleId) {
  $block = $profile.outcomes.$outcome
  if ($null -eq $block) { return $null }
  foreach ($r in @($block.requirements)) {
    if ([string]$r.ruleId -eq $ruleId) { return [string]$r.effect }
  }
  return $null
}

Write-Host '=== Cruvit Growth Outcome Suitability GOS-2B Pilot Validator ==='

try {
  Write-Head '1. Load schemas and pilot files'
  $null = Read-JsonFile 'Profile schema' $paths.profileSchema
  Pass 'growth-outcome.schema.json parsed'
  $null = Read-JsonFile 'Evidence schema' $paths.evidenceSchema
  Pass 'growth-outcome-evidence.schema.json parsed'
  $evidenceDoc = Read-JsonFile 'Pilot evidence' $paths.evidencePilot
  Pass 'growth-outcome-pilot/evidence.json parsed'
  $profilesDoc = Read-JsonFile 'Pilot profiles' $paths.profilesPilot
  Pass 'growth-outcome-pilot/profiles.json parsed'
  Assert-True ([int]$evidenceDoc.schemaVersion -eq 1) 'evidence schemaVersion=1'
  Assert-True ([int]$profilesDoc.schemaVersion -eq 1) 'profiles schemaVersion=1'
  Assert-True ([string]$profilesDoc.engineContractVersion -eq '1.0.0') 'profiles engineContractVersion=1.0.0'

  Write-Head '2. Exact counts'
  $claims = @($evidenceDoc.evidence)
  $profiles = @($profilesDoc.profiles)
  Assert-True ($claims.Count -eq 42) ("exactly 42 evidence records (got $($claims.Count))")
  Assert-True ($profiles.Count -eq 5) ("exactly 5 profiles (got $($profiles.Count))")
  $ids = @($claims | ForEach-Object { [string]$_.evidenceId })
  Assert-True (($ids | Select-Object -Unique).Count -eq 42) 'all evidenceId values unique'
  $missingAllowed = @($script:AllowedIds | Where-Object { $ids -notcontains $_ })
  Assert-True ($missingAllowed.Count -eq 0) ('all 42 allowlisted IDs present (' + ($missingAllowed -join ',') + ')')
  $extra = @($ids | Where-Object { $script:AllowedIds -notcontains $_ })
  Assert-True ($extra.Count -eq 0) ('no non-allowlisted evidence IDs (' + ($extra -join ',') + ')')

  Write-Head '3. Excluded IDs absent'
  $allText = (Read-Text 'evidence' $paths.evidencePilot) + "`n" + (Read-Text 'profiles' $paths.profilesPilot)
  foreach ($ex in $script:ExcludedIds) {
    Assert-True ($allText -notmatch [regex]::Escape($ex)) "excluded ID absent: $ex"
  }

  Write-Head '4. Source authority gate'
  foreach ($c in $claims) {
    $auth = [string]$c.source.authority
    if ($script:AllowedAuthorities -notcontains $auth) {
      Fail ("disallowed authority on $($c.evidenceId): $auth")
    }
  }
  Pass 'only hardened source authorities used (extension-uf-ifas, ctahr-uh, ashs, uc-ipm, extension-ucanr)'
  foreach ($c in $claims) {
    $hasRec = (Has-Prop $c.source 'recordId') -and -not [string]::IsNullOrWhiteSpace([string]$c.source.recordId)
    $hasPub = (Has-Prop $c.source 'publicationId') -and -not [string]::IsNullOrWhiteSpace([string]$c.source.publicationId)
    if (-not $hasRec -and -not $hasPub) { Fail ("missing recordId/publicationId: $($c.evidenceId)") }
    if ([string]$c.verifiedAt -ne '2026-07-17') { Fail ("verifiedAt not 2026-07-17: $($c.evidenceId)") }
    if ([string]$c.confidence -eq 'high') { Fail ("high confidence forbidden on evidence: $($c.evidenceId)") }
    $hasQuant = Has-Prop $c 'quantitativeClaim'
    $hasQual = Has-Prop $c 'qualitativeClaim'
    if (-not $hasQuant -and -not $hasQual) { Fail ("missing claim body: $($c.evidenceId)") }
    foreach ($bad in $script:ForbiddenFields) {
      if (Has-Prop $c $bad) { Fail ("forbidden field $bad on $($c.evidenceId)") }
    }
  }
  Pass 'every claim has record/publication id, verifiedAt 2026-07-17, claim body, and no high confidence'

  Write-Head '5. Outcome linkage and plant counts'
  $byPlant = @{
    mango = @($ids | Where-Object { $_ -like 'ev_mango_*' }).Count
    lychee = @($ids | Where-Object { $_ -like 'ev_lychee_*' }).Count
    apple = @($ids | Where-Object { $_ -like 'ev_apple_*' }).Count
    olive = @($ids | Where-Object { $_ -like 'ev_olive_*' }).Count
    boug = @($ids | Where-Object { $_ -like 'ev_boug_*' }).Count
  }
  Assert-True ($byPlant.mango -eq 18) 'mango evidence count=18'
  Assert-True ($byPlant.lychee -eq 9) 'lychee evidence count=9'
  Assert-True ($byPlant.apple -eq 4) 'apple evidence count=4'
  Assert-True ($byPlant.olive -eq 4) 'olive evidence count=4'
  Assert-True ($byPlant.boug -eq 7) 'bougainvillea evidence count=7'

  $outcomeOf = @{}
  foreach ($c in $claims) { $outcomeOf[[string]$c.evidenceId] = [string]$c.outcome }

  Write-Head '6. Profiles structure and completeness plan'
  $slugs = @($profiles | ForEach-Object { [string]$_.canonicalSlug } | Sort-Object)
  Assert-True (($slugs -join ',') -eq 'apple,bougainvillea,lychee,mango,olive') 'profile slugs are the five pilot plants'
  $totalBlocks = 0
  foreach ($p in $profiles) {
    foreach ($o in $script:SixOutcomes) {
      if (-not (Has-Prop $p.outcomes $o)) { Fail ("$($p.canonicalSlug) missing outcome $o") }
      else { $totalBlocks++ }
      $block = $p.outcomes.$o
      if ([string]$block.confidence -eq 'high') { Fail ("$($p.canonicalSlug).$o has high confidence") }
      foreach ($bad in $script:ForbiddenFields) {
        if (Has-Prop $block $bad) { Fail ("$($p.canonicalSlug).$o forbidden field $bad") }
        if (Has-Prop $p $bad) { Fail ("$($p.canonicalSlug) forbidden field $bad") }
      }
      if ([string]$block.dataStatus -eq 'unknown') {
        if (@($block.explicitUnknowns).Count -lt 1) { Fail ("$($p.canonicalSlug).$o unknown without explicitUnknowns") }
      }
      if ([string]$block.dataStatus -eq 'supported' -and @($block.evidenceRefs).Count -lt 1) {
        Fail ("$($p.canonicalSlug).$o supported without evidenceRefs")
      }
      if ([string]$block.dataStatus -eq 'conflicting') {
        $hasReason = (Has-Prop $block 'conflictReason') -and -not [string]::IsNullOrWhiteSpace([string]$block.conflictReason)
        $confRefs = @()
        if (Has-Prop $block 'conflictEvidenceRefs') { $confRefs = @($block.conflictEvidenceRefs) }
        if (-not $hasReason -and $confRefs.Count -lt 1) { Fail ("$($p.canonicalSlug).$o conflicting without metadata") }
        foreach ($cr in $confRefs) {
          if ($script:ExcludedIds -contains [string]$cr) { Fail ("$($p.canonicalSlug).$o conflictEvidenceRefs uses excluded id $cr") }
        }
      }
      foreach ($ref in @($block.evidenceRefs)) {
        if ($ids -notcontains [string]$ref) { Fail ("$($p.canonicalSlug).$o dangling evidenceRef $ref") }
        elseif ($outcomeOf[[string]$ref] -ne $o) { Fail ("$($p.canonicalSlug).$o links $($ref) which belongs to $($outcomeOf[[string]$ref])") }
      }
    }
    foreach ($ref in @($p.evidenceRefs)) {
      if ($ids -notcontains [string]$ref) { Fail ("$($p.canonicalSlug) profile dangling evidenceRef $ref") }
    }
  }
  Assert-True ($totalBlocks -eq 30) "exactly 30 outcome blocks (got $totalBlocks)"

  $mango = Get-ProfileBySlug $profilesDoc 'mango'
  $lychee = Get-ProfileBySlug $profilesDoc 'lychee'
  $apple = Get-ProfileBySlug $profilesDoc 'apple'
  $olive = Get-ProfileBySlug $profilesDoc 'olive'
  $boug = Get-ProfileBySlug $profilesDoc 'bougainvillea'

  Assert-True ([string]$mango.outcomes.survival.dataStatus -eq 'supported' -and [string]$mango.outcomes.survival.confidence -eq 'medium') 'mango survival supported/medium'
  Assert-True ([string]$mango.outcomes.vegetativeGrowth.dataStatus -eq 'partial' -and [string]$mango.outcomes.vegetativeGrowth.confidence -eq 'low') 'mango vegetativeGrowth partial/low'
  Assert-True ([string]$mango.outcomes.flowering.dataStatus -eq 'partial' -and [string]$mango.outcomes.flowering.confidence -eq 'low') 'mango flowering partial/low'
  Assert-True ([string]$mango.outcomes.fruitSet.dataStatus -eq 'partial' -and [string]$mango.outcomes.fruitSet.confidence -eq 'low') 'mango fruitSet partial/low'
  Assert-True ([string]$mango.outcomes.fruitRipeningOrYield.dataStatus -eq 'unknown' -and [string]$mango.outcomes.fruitRipeningOrYield.confidence -eq 'none') 'mango fruitRipeningOrYield unknown/none'
  Assert-True ([string]$mango.outcomes.longTermReliability.dataStatus -eq 'unknown' -and [string]$mango.outcomes.longTermReliability.confidence -eq 'none') 'mango longTermReliability unknown/none'

  Assert-True ([string]$lychee.outcomes.survival.dataStatus -eq 'supported') 'lychee survival supported'
  Assert-True ([string]$lychee.outcomes.fruitRipeningOrYield.dataStatus -eq 'unknown') 'lychee fruitRipeningOrYield unknown'
  Assert-True ([string]$lychee.outcomes.longTermReliability.dataStatus -eq 'partial') 'lychee longTermReliability partial'

  Assert-True ([string]$apple.outcomes.survival.dataStatus -eq 'unknown') 'apple survival unknown'
  Assert-True ([string]$apple.outcomes.vegetativeGrowth.dataStatus -eq 'unknown') 'apple vegetativeGrowth unknown'
  Assert-True ([string]$apple.outcomes.flowering.dataStatus -eq 'partial') 'apple flowering partial'
  Assert-True ([string]$apple.plantId -eq $script:ExpectedPlantIds.apple) 'apple plantId matches registry'
  Assert-True (-not (Has-Prop $mango 'plantId')) 'mango has no fabricated plantId'
  Assert-True (-not (Has-Prop $lychee 'plantId')) 'lychee has no fabricated plantId'
  Assert-True (-not (Has-Prop $boug 'plantId')) 'bougainvillea has no fabricated plantId'
  Assert-True ([string]$olive.plantId -eq $script:ExpectedPlantIds.olive) 'olive plantId matches registry'

  Assert-True ([string]$olive.outcomes.flowering.dataStatus -eq 'conflicting') 'olive flowering remains conflicting'
  Assert-True ((Has-Prop $olive.outcomes.flowering 'conflictReason') -and -not [string]::IsNullOrWhiteSpace([string]$olive.outcomes.flowering.conflictReason)) 'olive flowering has conflictReason'
  Assert-True ([string]$olive.outcomes.longTermReliability.dataStatus -eq 'supported') 'olive longTermReliability supported'

  Assert-True ([string]$boug.scientificName -eq 'Bougainvillea spp.') 'bougainvillea scientificName is genus-level'
  Assert-True ([bool]$boug.needsReview -eq $true) 'bougainvillea needsReview true'
  Assert-True ([string]$boug.outcomes.flowering.dataStatus -eq 'supported') 'bougainvillea flowering supported'
  Assert-True ([string]$boug.outcomes.fruitSet.dataStatus -eq 'unknown') 'bougainvillea fruitSet unknown'
  Assert-True ([string]$boug.outcomes.fruitRipeningOrYield.dataStatus -eq 'unknown') 'bougainvillea fruitRipeningOrYield unknown'

  Write-Head '7. Locked effect corrections'
  $matureEffect = Find-RuleEffect $mango 'survival' 'mango_surv_mature_freeze_injury'
  $youngEffect = Find-RuleEffect $mango 'survival' 'mango_surv_young_freeze_kill'
  $bougEffect = Find-RuleEffect $boug 'survival' 'boug_surv_frost_limiting'
  $setColdEffect = Find-RuleEffect $mango 'fruitSet' 'mango_set_flower_cold'
  Assert-True ($matureEffect -eq 'limiting') 'mango mature 25F injury rule effect=limiting'
  Assert-True ($youngEffect -eq 'hard_blocker') 'mango young-tree kill rule effect=hard_blocker'
  Assert-True ($bougEffect -eq 'limiting') 'bougainvillea frost/zone rule effect=limiting'
  Assert-True ($setColdEffect -eq 'hard_blocker') 'mango flower/small-fruit cold rule remains fruitSet hard_blocker'

  Write-Head '8. Applicability and dual lychee freeze records'
  $matureClaim = Get-ClaimById $evidenceDoc 'ev_mango_surv_freeze_mature_mg216'
  $tommyClaim = Get-ClaimById $evidenceDoc 'ev_mango_flow_cool_night_tommy_dav1993'
  $lycheeMg = Get-ClaimById $evidenceDoc 'ev_lychee_surv_freeze_mature_mg051'
  $lycheeHs = Get-ClaimById $evidenceDoc 'ev_lychee_surv_freeze_range_hs1499'
  Assert-True (@($matureClaim.regionApplicability.values) -contains 'florida') 'mango mature freeze region includes florida'
  Assert-True (@($tommyClaim.cultivarApplicability.values) -contains 'tommy-atkins') 'tommy flowering claim cultivar-limited'
  Assert-True (@($lycheeMg.conflictsWith) -contains 'ev_lychee_surv_freeze_range_hs1499') 'MG051 mature freeze conflictsWith HS1499 range'
  Assert-True (@($lycheeHs.conflictsWith) -contains 'ev_lychee_surv_freeze_mature_mg051') 'HS1499 freeze range conflictsWith MG051'
  Assert-True ($lycheeMg.quantitativeClaim.range.min -ne $lycheeHs.quantitativeClaim.range.min -or $lycheeMg.quantitativeClaim.range.max -ne $lycheeHs.quantitativeClaim.range.max) 'lychee dual freeze ranges remain distinct'

  Write-Head '9. No runtime product wiring'
  $indexText = Read-Text 'index.html' $paths.indexHtml
  Assert-True ($indexText -notmatch 'growth-outcome-pilot') 'index.html does not reference growth-outcome-pilot'
  Assert-True ($indexText -notmatch 'ev_mango_surv_freeze_mature_mg216') 'index.html does not embed pilot evidence IDs'
  $schemaEvText = Read-Text 'evidence schema' $paths.evidenceSchema
  $schemaPrText = Read-Text 'profile schema' $paths.profileSchema
  Assert-True ($schemaEvText -notmatch 'ev_mango_surv_freeze_mature_mg216') 'evidence schema unchanged by pilot IDs'
  Assert-True ($schemaPrText -notmatch 'Mangifera indica') 'profile schema unchanged by pilot species data'

  Write-Head '10. Summary'
  Write-Host ("  PASS=$($script:passCount) FAIL=$($script:failCount)")
  if ($script:failCount -gt 0) {
    Write-Host ''
    Write-Host 'GOS-2B pilot validation FAILED' -ForegroundColor Red
    exit 1
  }
  Write-Host ''
  Write-Host 'GOS-2B pilot validation PASSED' -ForegroundColor Green
  exit 0
} catch {
  Write-Host ''
  Write-Host ("  [ABORT] " + $_.Exception.Message) -ForegroundColor Yellow
  exit 2
}
