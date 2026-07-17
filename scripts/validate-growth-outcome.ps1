<#
.SYNOPSIS
  Cruvit Growth Outcome Suitability (GOS-1) schema/evidence contract validator.

.DESCRIPTION
  Validates the Growth Outcome profile and evidence JSON Schema contracts and
  semantic rules using temporary synthetic fixtures only. No botanical pilot
  data, no catalog writes, no evaluator, no runtime wiring.

  Exit code 0 => all assertions passed.
  Exit code 1 => one or more assertions failed.
  Exit code 2 => required schema file could not be read (cannot validate).

.NOTES
  Windows PowerShell 5.1 compatible. No external dependencies.
  Temporary fixture files are created under the system temp directory and removed.
#>

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir

$paths = @{
  profileSchema  = Join-Path $repoRoot 'data/growth-outcome.schema.json'
  evidenceSchema = Join-Path $repoRoot 'data/growth-outcome-evidence.schema.json'
}

$script:failCount = 0
$script:passCount = 0
$script:tempFiles = New-Object System.Collections.Generic.List[string]

$script:SixOutcomes = @(
  'survival',
  'vegetativeGrowth',
  'flowering',
  'fruitSet',
  'fruitRipeningOrYield',
  'longTermReliability'
)

$script:ForbiddenProfileFields = @(
  'score', 'level', 'goalFit', 'recommendedUse', 'overallConclusion', 'suitabilityScore'
)

$script:WeakSourceTypes = @('nursery_commercial', 'grower_observation')

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
  Cleanup-Temp
  Write-Host ''
  Write-Host "  [ABORT] $msg" -ForegroundColor Yellow
  Write-Host ''
  exit 2
}
function Assert-True([bool]$cond, [string]$msg) {
  if ($cond) { Pass $msg } else { Fail $msg }
}

function Cleanup-Temp {
  foreach ($f in @($script:tempFiles)) {
    if ($f -and (Test-Path -LiteralPath $f)) {
      try { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue } catch {}
    }
  }
  $script:tempFiles.Clear()
}

function Read-JsonFile([string]$label, [string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { Abort "$label not found: $path" }
  try {
    return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    Abort "$label failed to parse as JSON: $($_.Exception.Message)"
  }
}

function Read-JsonText([string]$label, [string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { Abort "$label not found: $path" }
  return (Get-Content -LiteralPath $path -Raw -Encoding UTF8)
}

function Write-TempJson([string]$name, [object]$obj) {
  $path = Join-Path ([System.IO.Path]::GetTempPath()) ("cruvit-gos1-" + $name + "-" + [guid]::NewGuid().ToString('n') + '.json')
  $json = $obj | ConvertTo-Json -Depth 40 -Compress:$false
  [System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))
  $script:tempFiles.Add($path) | Out-Null
  return $path
}

function Test-ValidCalendarDate([string]$ymd) {
  if ([string]::IsNullOrWhiteSpace($ymd)) { return $false }
  if ($ymd -notmatch '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') { return $false }
  try {
    $dt = [datetime]::ParseExact($ymd, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    return ($dt.ToString('yyyy-MM-dd') -eq $ymd)
  } catch {
    return $false
  }
}

function Get-PropNames($obj) {
  if ($null -eq $obj) { return @() }
  return @($obj.PSObject.Properties | ForEach-Object { $_.Name })
}

function Has-Prop($obj, [string]$name) {
  if ($null -eq $obj) { return $false }
  return $null -ne ($obj.PSObject.Properties[$name])
}

function New-UnknownApplicability {
  return [pscustomobject]@{ status = 'unknown' }
}

function New-UnknownOutcome([string]$unknownNote) {
  return [pscustomobject]@{
    dataStatus         = 'unknown'
    confidence         = 'none'
    needsReview        = $true
    requirements       = @()
    hardBlockers       = @()
    limitingFactors    = @()
    favorableFactors   = @()
    assumptions        = @()
    explicitUnknowns   = @($unknownNote)
    evidenceRefs       = @()
  }
}

function New-MinimalUnknownProfile {
  $outcomes = [ordered]@{}
  foreach ($o in $script:SixOutcomes) {
    $outcomes[$o] = New-UnknownOutcome ("No reviewed evidence for $o in GOS-1 synthetic fixture.")
  }
  return [pscustomobject]@{
    schemaVersion               = 1
    profileVersion              = '0.0.1'
    engineContractVersion       = '1.0.0'
    canonicalSlug               = 'synthetic-gos-plant'
    scientificName              = 'Syntheticus gosensis'
    taxonomyApplicability       = (New-UnknownApplicability)
    cultivarApplicability       = (New-UnknownApplicability)
    regionApplicability         = (New-UnknownApplicability)
    hemisphereApplicability     = (New-UnknownApplicability)
    environmentApplicability    = (New-UnknownApplicability)
    legacyClimateTraitsCoverage = 'environment_only'
    outcomes                    = [pscustomobject]$outcomes
    evidenceRefs                = @()
    needsReview                 = $true
    dataVersion                 = '0.0.1'
  }
}

function New-SupportedSurvivalOutcome([string]$evidenceId) {
  return [pscustomobject]@{
    dataStatus       = 'supported'
    confidence       = 'medium'
    needsReview      = $false
    requirements     = @(
      [pscustomobject]@{
        ruleId         = 'syn_frost_exposure_rule'
        factorKey      = 'frost_sensitivity'
        factorCategory = 'frost_exposure'
        operator       = 'eq'
        value          = 'high'
        effect         = 'limiting'
        confidence     = 'medium'
        needsReview    = $false
        evidenceRefs   = @($evidenceId)
      }
    )
    hardBlockers     = @()
    limitingFactors  = @('frost_exposure')
    favorableFactors = @()
    assumptions      = @('Species-level fixture only; cultivar unknown.')
    explicitUnknowns = @()
    evidenceRefs     = @($evidenceId)
  }
}

function New-SupportedProfileWithSurvivalOnly {
  $evId = 'ev_syn_survival_frost_001'
  $base = New-MinimalUnknownProfile
  $base.canonicalSlug = 'synthetic-gos-supported'
  $base.needsReview = $false
  $base.evidenceRefs = @($evId)
  $base.outcomes.survival = New-SupportedSurvivalOutcome $evId
  return $base
}

function New-EvidenceClaim([hashtable]$overrides) {
  $claim = [ordered]@{
    evidenceId                 = 'ev_syn_survival_frost_001'
    schemaVersion              = 1
    claimVersion               = '0.0.1'
    outcome                    = 'survival'
    factorKey                  = 'frost_sensitivity'
    claimType                  = 'qualitative_requirement'
    qualitativeClaim           = [pscustomobject]@{ statement = 'Synthetic frost sensitivity claim for contract testing only.'; factorKey = 'frost_sensitivity' }
    source                     = [pscustomobject]@{
      authority    = 'synthetic-authority'
      recordId     = 'SYN-001'
      sourceType   = 'expert_review'
      title        = 'Synthetic GOS-1 contract fixture'
      verifiedAt   = '2026-07-17'
    }
    evidenceStrength           = 'moderate'
    confidence                 = 'medium'
    needsReview                = $false
    verifiedAt                 = '2026-07-17'
    regionApplicability        = (New-UnknownApplicability)
    cultivarApplicability      = (New-UnknownApplicability)
    environmentApplicability   = (New-UnknownApplicability)
    hemisphereApplicability    = (New-UnknownApplicability)
  }
  foreach ($k in $overrides.Keys) { $claim[$k] = $overrides[$k] }
  return [pscustomobject]$claim
}

function Get-OutcomeBlockProblems($block) {
  $problems = New-Object System.Collections.Generic.List[string]
  if ($null -eq $block) {
    $problems.Add('missing') | Out-Null
    return @($problems)
  }
  $status = [string]$block.dataStatus
  $conf = [string]$block.confidence
  $refs = @()
  if (Has-Prop $block 'evidenceRefs') { $refs = @($block.evidenceRefs) }
  if ($status -eq 'supported' -and $refs.Count -lt 1) { $problems.Add('supported_without_evidence') | Out-Null }
  if ($status -eq 'unknown') {
    $unk = @()
    if (Has-Prop $block 'explicitUnknowns') { $unk = @($block.explicitUnknowns) }
    if ($unk.Count -lt 1) { $problems.Add('unknown_without_explicit') | Out-Null }
    if ($conf -eq 'high') { $problems.Add('unknown_high_confidence') | Out-Null }
  }
  if ($status -eq 'conflicting') {
    $hasReason = (Has-Prop $block 'conflictReason') -and -not [string]::IsNullOrWhiteSpace([string]$block.conflictReason)
    $confRefs = @()
    if (Has-Prop $block 'conflictEvidenceRefs') { $confRefs = @($block.conflictEvidenceRefs) }
    if (-not $hasReason -and $confRefs.Count -lt 1) { $problems.Add('conflicting_without_metadata') | Out-Null }
  }
  foreach ($bad in $script:ForbiddenProfileFields) {
    if (Has-Prop $block $bad) { $problems.Add("forbidden:$bad") | Out-Null }
  }
  return @($problems)
}

function Get-ProfileProblems($profile) {
  $problems = New-Object System.Collections.Generic.List[string]
  foreach ($bad in $script:ForbiddenProfileFields) {
    if (Has-Prop $profile $bad) { $problems.Add("forbidden:$bad") | Out-Null }
  }
  if (-not (Has-Prop $profile 'outcomes') -or $null -eq $profile.outcomes) {
    $problems.Add('missing_outcomes') | Out-Null
    return @($problems)
  }
  $names = Get-PropNames $profile.outcomes
  foreach ($o in $script:SixOutcomes) {
    if ($names -notcontains $o) { $problems.Add("missing:$o") | Out-Null }
    else {
      foreach ($p in @(Get-OutcomeBlockProblems $profile.outcomes.$o)) {
        $problems.Add("$o`:$p") | Out-Null
      }
    }
  }
  foreach ($extra in $names) {
    if ($script:SixOutcomes -notcontains $extra) { $problems.Add("extra:$extra") | Out-Null }
  }
  $cov = [string]$profile.legacyClimateTraitsCoverage
  if ($cov -ne 'none' -and $cov -ne 'environment_only') { $problems.Add('bad_legacy_coverage') | Out-Null }
  return @($problems)
}

function Get-EvidenceProblems($claim) {
  $problems = New-Object System.Collections.Generic.List[string]
  if ($null -eq $claim -or [string]::IsNullOrWhiteSpace([string]$claim.evidenceId)) {
    $problems.Add('empty_evidenceId') | Out-Null
  }
  if ($script:SixOutcomes -notcontains [string]$claim.outcome) { $problems.Add('invalid_outcome') | Out-Null }
  if (-not (Test-ValidCalendarDate ([string]$claim.verifiedAt))) { $problems.Add('invalid_date') | Out-Null }
  $src = $null
  if (Has-Prop $claim 'source') { $src = $claim.source }
  if ($null -eq $src -or [string]::IsNullOrWhiteSpace([string]$src.authority)) {
    $problems.Add('missing_authority') | Out-Null
  }
  $hasRecord = ($null -ne $src) -and (Has-Prop $src 'recordId') -and -not [string]::IsNullOrWhiteSpace([string]$src.recordId)
  $hasPub = ($null -ne $src) -and (Has-Prop $src 'publicationId') -and -not [string]::IsNullOrWhiteSpace([string]$src.publicationId)
  if (-not $hasRecord -and -not $hasPub) { $problems.Add('missing_record_or_publication') | Out-Null }
  $hasQuant = Has-Prop $claim 'quantitativeClaim'
  $hasQual = Has-Prop $claim 'qualitativeClaim'
  if (-not $hasQuant -and -not $hasQual) { $problems.Add('missing_claim_body') | Out-Null }
  if ($null -ne $src) {
    $srcType = [string]$src.sourceType
    $strength = [string]$claim.evidenceStrength
    if (($script:WeakSourceTypes -contains $srcType) -and $strength -eq 'strong') {
      $problems.Add('weak_source_strong_strength') | Out-Null
    }
  }
  foreach ($bad in $script:ForbiddenProfileFields) {
    if (Has-Prop $claim $bad) { $problems.Add("forbidden:$bad") | Out-Null }
  }
  return @($problems)
}

# ---------------------------------------------------------------------------
Write-Host '=== Cruvit Growth Outcome Suitability GOS-1 Contract Validator ==='

try {
  Write-Head '1. Schema parse and structural contract'
  $profileText = Read-JsonText 'Profile schema' $paths.profileSchema
  $evidenceText = Read-JsonText 'Evidence schema' $paths.evidenceSchema
  $profileSchema = $profileText | ConvertFrom-Json
  Pass 'data/growth-outcome.schema.json parsed'
  $evidenceSchema = $evidenceText | ConvertFrom-Json
  Pass 'data/growth-outcome-evidence.schema.json parsed'

  Assert-True ($profileSchema.'$schema' -match 'draft-07') 'profile schema uses draft-07'
  Assert-True ($evidenceSchema.'$schema' -match 'draft-07') 'evidence schema uses draft-07'
  Assert-True ($profileSchema.properties.schemaVersion.const -eq 1) 'profile document schemaVersion const=1'
  Assert-True ($evidenceSchema.properties.schemaVersion.const -eq 1) 'evidence document schemaVersion const=1'
  Assert-True (Has-Prop $profileSchema.properties 'engineContractVersion') 'profile document has engineContractVersion'
  Assert-True (Has-Prop $profileSchema.definitions.GrowthOutcomeProfile.properties 'profileVersion') 'profile has profileVersion'
  Assert-True (Has-Prop $profileSchema.definitions.GrowthOutcomeProfile.properties 'legacyClimateTraitsCoverage') 'profile has legacyClimateTraitsCoverage'

  $legacyEnum = @($profileSchema.definitions.GrowthOutcomeProfile.properties.legacyClimateTraitsCoverage.enum)
  Assert-True (($legacyEnum -contains 'none') -and ($legacyEnum -contains 'environment_only')) 'legacyClimateTraitsCoverage supports none and environment_only'
  Assert-True ($legacyEnum -notcontains 'complete') 'legacyClimateTraitsCoverage does not claim complete climateTraits outcome evidence'

  $profileOutcomes = @($profileSchema.definitions.OutcomeName.enum)
  $evidenceOutcomes = @($evidenceSchema.definitions.OutcomeName.enum)
  Assert-True ($profileOutcomes.Count -eq 6) 'profile OutcomeName enum has 6 values'
  Assert-True ($evidenceOutcomes.Count -eq 6) 'evidence OutcomeName enum has 6 values'
  $drift = $false
  for ($i = 0; $i -lt 6; $i++) {
    if ($profileOutcomes[$i] -ne $script:SixOutcomes[$i] -or $evidenceOutcomes[$i] -ne $script:SixOutcomes[$i]) { $drift = $true }
  }
  Assert-True (-not $drift) 'outcome names identical across schemas and canonical list'
  Assert-True (($profileOutcomes -contains 'fruitSet') -and ($profileOutcomes -contains 'fruitRipeningOrYield')) 'fruitSet and fruitRipeningOrYield distinct in schema'

  $requiredOutcomes = @($profileSchema.definitions.OutcomesObject.required)
  foreach ($o in $script:SixOutcomes) {
    Assert-True ($requiredOutcomes -contains $o) "OutcomesObject requires $o"
  }

  Assert-True ($profileSchema.definitions.GrowthOutcomeProfile.additionalProperties -eq $false) 'GrowthOutcomeProfile additionalProperties=false'
  Assert-True ($profileSchema.definitions.OutcomeBlock.additionalProperties -eq $false) 'OutcomeBlock additionalProperties=false'
  Assert-True ($evidenceSchema.definitions.EvidenceClaim.additionalProperties -eq $false) 'EvidenceClaim additionalProperties=false'

  $profileProps = Get-PropNames $profileSchema.definitions.GrowthOutcomeProfile.properties
  $outcomeProps = Get-PropNames $profileSchema.definitions.OutcomeBlock.properties
  $evidenceProps = Get-PropNames $evidenceSchema.definitions.EvidenceClaim.properties
  foreach ($bad in $script:ForbiddenProfileFields) {
    Assert-True ($profileProps -notcontains $bad) "profile schema forbids $bad"
    Assert-True ($outcomeProps -notcontains $bad) "outcome block schema forbids $bad"
    Assert-True ($evidenceProps -notcontains $bad) "evidence schema forbids $bad"
  }

  Assert-True ($profileText -match 'environment_only') 'profile schema documents environment_only semantics'
  Assert-True ($profileText -match 'Climate Suitability Engine v1b') 'profile schema documents v1b fallback for plants without GOS'
  Assert-True ($profileText -match 'must not rewrite the six biological estimates') 'profile schema documents goal-model boundary'
  Assert-True ($evidenceText -match 'URL alone is never sufficient') 'evidence schema documents URL-alone insufficiency'
  Assert-True ($evidenceText -match 'conflictsWith') 'evidence schema supports conflictsWith'

  $srcRequired = @($evidenceSchema.definitions.EvidenceSource.required)
  Assert-True (($srcRequired -contains 'authority') -and ($srcRequired -contains 'sourceType')) 'EvidenceSource requires authority and sourceType'
  Assert-True (Has-Prop $evidenceSchema.definitions.EvidenceSource.properties 'recordId') 'EvidenceSource has recordId'
  Assert-True (Has-Prop $evidenceSchema.definitions.EvidenceSource.properties 'publicationId') 'EvidenceSource has publicationId'

  $factorCats = @($profileSchema.definitions.FactorCategory.enum)
  foreach ($need in @('minimum_temperature','frost_exposure','winter_chill','flowering_induction','pollination','fruit_set_conditions','ripening_heat','juvenile_period','growing_environment')) {
    Assert-True ($factorCats -contains $need) "FactorCategory includes $need"
  }

  Write-Head '2. Synthetic valid fixtures'

  $unknownProfile = New-MinimalUnknownProfile
  $uProblems = @(Get-ProfileProblems $unknownProfile)
  Assert-True ($uProblems.Count -eq 0) ('valid minimal explicit-unknown profile (' + ($uProblems -join ',') + ')')
  Assert-True ([string]$unknownProfile.outcomes.flowering.dataStatus -eq 'unknown') 'unknown fixture flowering remains explicit unknown'
  Assert-True ([string]$unknownProfile.outcomes.fruitSet.dataStatus -eq 'unknown') 'unknown fixture fruitSet remains explicit unknown'
  Assert-True ([string]$unknownProfile.outcomes.fruitRipeningOrYield.dataStatus -eq 'unknown') 'unknown fixture fruitRipeningOrYield remains explicit unknown'
  Assert-True ([string]$unknownProfile.outcomes.longTermReliability.dataStatus -eq 'unknown') 'unknown fixture longTermReliability remains explicit unknown'
  Assert-True (@($unknownProfile.outcomes.survival.evidenceRefs).Count -eq 0) 'unknown fixture has empty survival evidenceRefs without optimistic support'
  Assert-True (($unknownProfile.outcomes.PSObject.Properties.Name -contains 'fruitSet') -and ($unknownProfile.outcomes.PSObject.Properties.Name -contains 'fruitRipeningOrYield')) 'fruitSet and fruitRipeningOrYield remain distinct'
  Assert-True ([string]$unknownProfile.legacyClimateTraitsCoverage -eq 'environment_only') 'legacyClimateTraitsCoverage=environment_only'

  $supportedProfile = New-SupportedProfileWithSurvivalOnly
  $sProblems = @(Get-ProfileProblems $supportedProfile)
  Assert-True ($sProblems.Count -eq 0) ('valid structured supported profile (' + ($sProblems -join ',') + ')')
  Assert-True ([string]$supportedProfile.outcomes.survival.dataStatus -eq 'supported') 'supported fixture survival is supported'
  Assert-True ([string]$supportedProfile.outcomes.flowering.dataStatus -eq 'unknown') 'survival support does not imply flowering support'
  Assert-True ([string]$supportedProfile.outcomes.fruitSet.dataStatus -eq 'unknown') 'survival support does not imply fruitSet support'
  Assert-True ([string]$supportedProfile.regionApplicability.status -eq 'unknown') 'region unknown accepted'
  Assert-True ([string]$supportedProfile.cultivarApplicability.status -eq 'unknown') 'cultivar unknown accepted'
  Assert-True ([string]$supportedProfile.environmentApplicability.status -eq 'unknown') 'environment applicability accepted'

  $goodClaim = New-EvidenceClaim @{}
  $gProblems = @(Get-EvidenceProblems $goodClaim)
  Assert-True ($gProblems.Count -eq 0) ('valid evidence claim (' + ($gProblems -join ',') + ')')

  $conflictA = New-EvidenceClaim @{
    evidenceId = 'ev_syn_conflict_a'
    claimType = 'conflicting_report'
    conflictsWith = @('ev_syn_conflict_b')
    qualitativeClaim = [pscustomobject]@{ statement = 'Synthetic conflict side A.'; factorKey = 'frost_sensitivity' }
  }
  $conflictB = New-EvidenceClaim @{
    evidenceId = 'ev_syn_conflict_b'
    claimType = 'conflicting_report'
    conflictsWith = @('ev_syn_conflict_a')
    qualitativeClaim = [pscustomobject]@{ statement = 'Synthetic conflict side B.'; factorKey = 'frost_sensitivity' }
  }
  Assert-True ((@(Get-EvidenceProblems $conflictA)).Count -eq 0) 'conflict evidence A valid'
  Assert-True ((@(Get-EvidenceProblems $conflictB)).Count -eq 0) 'conflict evidence B valid'
  Assert-True (@($conflictA.conflictsWith) -contains 'ev_syn_conflict_b') 'contradictory evidence can be represented via conflictsWith'

  $conflictingOutcome = [pscustomobject]@{
    dataStatus            = 'conflicting'
    confidence            = 'low'
    needsReview           = $true
    requirements          = @()
    hardBlockers          = @()
    limitingFactors       = @()
    favorableFactors      = @()
    assumptions           = @()
    explicitUnknowns      = @('Sources disagree on frost tolerance.')
    evidenceRefs          = @('ev_syn_conflict_a', 'ev_syn_conflict_b')
    conflictReason        = 'Synthetic opposing frost claims retained without overwrite.'
    conflictEvidenceRefs  = @('ev_syn_conflict_a', 'ev_syn_conflict_b')
  }
  Assert-True ((@(Get-OutcomeBlockProblems $conflictingOutcome)).Count -eq 0) 'conflicting outcome representation accepted'

  Write-Head '3. Synthetic invalid fixtures (must fail semantics)'

  $supportedNoEvidence = [pscustomobject]@{
    dataStatus = 'supported'; confidence = 'medium'; needsReview = $false
    requirements = @(); hardBlockers = @(); limitingFactors = @(); favorableFactors = @()
    assumptions = @(); explicitUnknowns = @(); evidenceRefs = @()
  }
  Assert-True ((@(Get-OutcomeBlockProblems $supportedNoEvidence) -contains 'supported_without_evidence')) 'supported without evidenceRefs is rejected'

  $highUnknown = New-UnknownOutcome 'x'
  $highUnknown.confidence = 'high'
  Assert-True ((@(Get-OutcomeBlockProblems $highUnknown) -contains 'unknown_high_confidence')) 'high confidence with unknown dataStatus is rejected'

  Assert-True ((@(Get-EvidenceProblems (New-EvidenceClaim @{ outcome = 'blooming' })) -contains 'invalid_outcome')) 'invalid outcome name rejected'
  Assert-True ((@(Get-EvidenceProblems (New-EvidenceClaim @{ verifiedAt = '2026-13-40' })) -contains 'invalid_date')) 'invalid date rejected'
  Assert-True ((@(Get-EvidenceProblems (New-EvidenceClaim @{
    source = [pscustomobject]@{ authority = ''; recordId = 'X'; sourceType = 'expert_review' }
  })) -contains 'missing_authority')) 'missing source authority rejected'
  Assert-True ((@(Get-EvidenceProblems (New-EvidenceClaim @{
    source = [pscustomobject]@{ authority = 'synthetic-authority'; sourceType = 'expert_review'; url = 'https://example.invalid/only-url' }
  })) -contains 'missing_record_or_publication')) 'missing source record/publication ID rejected (URL alone insufficient)'
  Assert-True ((@(Get-EvidenceProblems (New-EvidenceClaim @{
    source = [pscustomobject]@{ authority = 'nursery-x'; recordId = 'N-1'; sourceType = 'nursery_commercial'; verifiedAt = '2026-07-17' }
    evidenceStrength = 'strong'
  })) -contains 'weak_source_strong_strength')) 'nursery/commercial cannot be represented as strong evidence'

  $profileWithScore = New-MinimalUnknownProfile
  $profileWithScore | Add-Member -NotePropertyName score -NotePropertyValue 50 -Force
  Assert-True ((@(Get-ProfileProblems $profileWithScore) -contains 'forbidden:score')) 'canonical profile score field rejected'
  $profileWithGoal = New-MinimalUnknownProfile
  $profileWithGoal | Add-Member -NotePropertyName goalFit -NotePropertyValue 'ornamental' -Force
  Assert-True ((@(Get-ProfileProblems $profileWithGoal) -contains 'forbidden:goalFit')) 'canonical profile goalFit field rejected'
  $profileWithUse = New-MinimalUnknownProfile
  $profileWithUse | Add-Member -NotePropertyName recommendedUse -NotePropertyValue 'foliage' -Force
  Assert-True ((@(Get-ProfileProblems $profileWithUse) -contains 'forbidden:recommendedUse')) 'canonical profile recommendedUse field rejected'

  $missingStage = New-MinimalUnknownProfile
  $missingStage.outcomes.PSObject.Properties.Remove('fruitRipeningOrYield')
  Assert-True ((@(Get-ProfileProblems $missingStage) -contains 'missing:fruitRipeningOrYield')) 'omitting later stage is rejected (no implied success)'

  Write-Head '4. Document fixtures, duplicate IDs, temp cleanup'

  $profileDoc = [pscustomobject]@{
    schemaVersion         = 1
    engineContractVersion = '1.0.0'
    dataVersion           = '0.0.1'
    notes                 = 'Synthetic GOS-1 contract fixtures only. No botanical pilot data.'
    profiles              = @($unknownProfile, $supportedProfile)
  }
  $evidenceDoc = [pscustomobject]@{
    schemaVersion = 1
    dataVersion   = '0.0.1'
    notes         = 'Synthetic GOS-1 evidence fixtures only.'
    evidence      = @($goodClaim, $conflictA, $conflictB)
  }

  $pPath = Write-TempJson 'profiles' $profileDoc
  $ePath = Write-TempJson 'evidence' $evidenceDoc
  $pRound = Read-JsonFile 'Temp profile fixture' $pPath
  $eRound = Read-JsonFile 'Temp evidence fixture' $ePath
  Assert-True (@($pRound.profiles).Count -eq 2) 'temp profile document round-trips with 2 profiles'
  Assert-True (@($eRound.evidence).Count -eq 3) 'temp evidence document round-trips with 3 claims'

  $ids = @($eRound.evidence | ForEach-Object { [string]$_.evidenceId })
  $dupCheck = @($ids | Group-Object | Where-Object { $_.Count -gt 1 })
  Assert-True ($dupCheck.Count -eq 0) 'valid evidence document has unique evidenceIds'

  $dupIds = @('ev_dup_same', 'ev_dup_same')
  $dups = @($dupIds | Group-Object | Where-Object { $_.Count -gt 1 })
  Assert-True ($dups.Count -gt 0) 'duplicate evidence IDs detected and rejected by contract check'

  $p1 = @(Get-ProfileProblems $supportedProfile)
  $p2 = @(Get-ProfileProblems $supportedProfile)
  Assert-True (($p1 -join '|') -eq ($p2 -join '|')) 'deterministic validation'

  Cleanup-Temp
  Assert-True ($script:tempFiles.Count -eq 0) 'temporary fixture files cleaned'
  Assert-True (-not (Test-Path -LiteralPath $pPath)) 'profile temp file removed'
  Assert-True (-not (Test-Path -LiteralPath $ePath)) 'evidence temp file removed'

  Write-Head '5. Scope safeguards'
  # GOS-2B may create a pilot data directory. GOS-1 stays synthetic-fixture-only via $paths above.
  $pathValues = @($paths.Values | ForEach-Object { [string]$_ })
  $touchesPilotData = $false
  foreach ($pv in $pathValues) {
    if ($pv -like '*growth-outcome-pilot*') { $touchesPilotData = $true }
  }
  Assert-True (-not $touchesPilotData) 'GOS-1 remains synthetic-only (paths do not include pilot data files)'
  Assert-True ($profileText -notmatch '(?i)mangifera') 'profile schema has no mango botanical data'
  Assert-True ($evidenceText -notmatch '(?i)mangifera') 'evidence schema has no mango botanical data'

} finally {
  Cleanup-Temp
}

Write-Host ''
Write-Host ("ASSERTIONS: PASS={0} FAIL={1}" -f $script:passCount, $script:failCount)
if ($script:failCount -gt 0) {
  Write-Host 'RESULT: FAIL - GOS-1 contract problems found.' -ForegroundColor Red
  exit 1
}
Write-Host 'RESULT: PASS - all GOS-1 contract assertions passed.' -ForegroundColor Green
exit 0
