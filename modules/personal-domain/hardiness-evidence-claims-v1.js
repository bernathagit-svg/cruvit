/**
 * Hardiness evidence claim shapes v1 — RAW source claims only.
 * Extractors preserve source statements with minimal information loss.
 * Does NOT map to frostSensitivity / coldTolerance (see transform contracts).
 */
import crypto from 'node:crypto';

export const HARDINESS_EVIDENCE_CLAIMS_ID = 'hardiness-evidence-claims-v1';
/** 1.1.0: additive zone "through" ranges + direct freeze-injury excerpts (no transform broadening). */
export const HARDINESS_EVIDENCE_CLAIMS_VERSION = '1.1.0';
export const HARDINESS_EVIDENCE_CLAIMS_REF = `${HARDINESS_EVIDENCE_CLAIMS_ID}@${HARDINESS_EVIDENCE_CLAIMS_VERSION}`;

export const HARDINESS_CLAIM_TYPE = Object.freeze({
  USDA_HARDINESS_ZONE_BAND: 'usda_hardiness_zone_band',
  COLD_DAMAGE_THRESHOLD: 'cold_damage_threshold',
  FROST_INJURY_STATEMENT: 'frost_injury_statement',
  RHS_HARDINESS_RATING: 'rhs_hardiness_rating'
});

export const HARDINESS_ZONE_SYSTEM = Object.freeze({
  USDA: 'USDA',
  RHS: 'RHS'
});

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

/**
 * Extract USDA hardiness zone integers only from explicit Hardiness Zone labels.
 * Rejects bare digits (license 4.0, captions, county codes).
 */
export function extractExplicitHardinessZones(text) {
  const t = String(text || '');
  const zones = [];
  const labelRe =
    /(?:USDA\s*)?(?:Plant\s*)?Hardiness\s*Zones?\s*[:.]?\s*([0-9a-b,\s\-–toand]+?)(?=\s*(?:Fruit|Leaf|Flower|Height|Width|NC\s+Region|Soil|Light|Family|Genus|Species|Tags|Cultural|Problems|Insects|Diseases|\.|$))/gi;
  let m;
  while ((m = labelRe.exec(t))) {
    const block = m[1] || '';
    for (const zm of block.matchAll(/\b(1[0-3]|[3-9])[ab]?\b/gi)) {
      zones.push(Number(zm[1]));
    }
  }
  if (!zones.length) {
    const near = [
      ...t.matchAll(
        /hardiness[^.]{0,50}zones?\s*(1[0-3]|[3-9])[ab]?\s*(?:[-–to]+|\s+to\s+|\s+through\s+)\s*(1[0-3]|[3-9])[ab]?/gi
      )
    ];
    for (const nm of near) {
      zones.push(Number(nm[1]), Number(nm[2]));
    }
  }
  return zones;
}

/**
 * Bounded hardiness-zone excerpt — label + zone tokens only (no Fruit:/captions).
 */
export function extractHardinessZoneExcerpt(text) {
  const t = String(text || '');
  const list = t.match(
    /(?:USDA\s*)?(?:Plant\s*)?Hardiness\s*Zones?\s*[:.]?\s*((?:1[0-3]|[3-9])[ab]?(?:\s*,\s*(?:1[0-3]|[3-9])[ab]?)*)/i
  );
  if (list) {
    const excerpt = `Hardiness Zone: ${list[1].replace(/\s+/g, ' ').trim()}`;
    return excerpt.slice(0, 160);
  }
  const range = t.match(
    /(?:USDA\s*)?(?:Plant\s*)?Hardiness\s*Zones?\s*[:.]?\s*((?:1[0-3]|[3-9])[ab]?)\s*(?:[-–to]+|\s+to\s+|\s+through\s+)\s*((?:1[0-3]|[3-9])[ab]?)/i
  );
  if (range) {
    const excerpt = `Hardiness Zone: ${range[1]}-${range[2]}`.replace(/\s+/g, ' ').trim();
    return excerpt.slice(0, 160);
  }
  return null;
}

/**
 * RAW SOURCE CLAIM: USDA hardiness zone band.
 */
export function extractUsdaHardinessZoneBandClaim(text) {
  const zones = extractExplicitHardinessZones(text);
  const excerpt = extractHardinessZoneExcerpt(text);
  if (!zones.length || !excerpt) return null;
  const hardinessZoneMin = Math.min(...zones);
  const hardinessZoneMax = Math.max(...zones);
  const zoneLabel = `${hardinessZoneMin}-${hardinessZoneMax}`;
  return {
    claimType: HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND,
    hardinessZoneMin,
    hardinessZoneMax,
    hardinessZoneSystem: HARDINESS_ZONE_SYSTEM.USDA,
    rawValue: zoneLabel,
    displayValue: `USDA ${zoneLabel}`,
    units: 'usda_zone',
    supportingExcerpt: excerpt,
    claimFingerprint: sha256(
      JSON.stringify({
        t: HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND,
        min: hardinessZoneMin,
        max: hardinessZoneMax,
        sys: HARDINESS_ZONE_SYSTEM.USDA
      })
    )
  };
}


/**
 * RAW SOURCE CLAIM: RHS H1A-H7 hardiness rating.
 * RHS ratings have published minimum-temperature semantics and are kept raw here;
 * conversion to CRUVIT coldTolerance belongs to the transform contract.
 */
export function extractRhsHardinessRatingClaim(text) {
  const t = String(text || '');
  const m = t.match(/(?:hardiness(?:\s+rating)?\s*[:.]?\s*)?\bH(1[ABC]|[2-7])\b/i);
  if (!m) return null;
  const rating = 'H' + String(m[1]).toUpperCase();
  const rangeByRating = {
    H1A: { minC: 15, maxC: null, relation: 'above' },
    H1B: { minC: 10, maxC: 15 },
    H1C: { minC: 5, maxC: 10 },
    H2: { minC: 1, maxC: 5 },
    H3: { minC: -5, maxC: 1 },
    H4: { minC: -10, maxC: -5 },
    H5: { minC: -15, maxC: -10 },
    H6: { minC: -20, maxC: -15 },
    H7: { minC: null, maxC: -20, relation: 'below' }
  };
  const range = rangeByRating[rating];
  if (!range) return null;
  const supportingExcerpt = (
    t.match(new RegExp('[^.]{0,120}\\b' + rating + '\\b[^.]{0,120}', 'i'))?.[0]
    || ('RHS hardiness rating: ' + rating)
  ).replace(/\s+/g, ' ').trim().slice(0, 240);
  return {
    claimType: HARDINESS_CLAIM_TYPE.RHS_HARDINESS_RATING,
    hardinessZoneSystem: HARDINESS_ZONE_SYSTEM.RHS,
    rhsHardinessRating: rating,
    minimumTemperatureC: range.minC,
    maximumTemperatureC: range.maxC,
    temperatureRelation: range.relation || 'range',
    rawValue: rating,
    displayValue: 'RHS ' + rating,
    units: 'rhs_hardiness_rating',
    supportingExcerpt,
    claimFingerprint: sha256(JSON.stringify({
      t: HARDINESS_CLAIM_TYPE.RHS_HARDINESS_RATING,
      rating
    }))
  };
}

/**
 * Bounded frost/cold-injury excerpt (no Fruit:/license/caption junk).
 */
export function extractFrostInjuryExcerpt(text) {
  const t = String(text || '');
  const patterns = [
    /[^.]{0,60}killed to the ground[^.]{0,100}\./i,
    /[^.]{0,60}(?:frost.?tender|intolerant of frost|killed by frost)[^.]{0,80}\./i,
    /[^.]{0,80}(?:intoleran(?:t|ce)\s+(?:of|for)\s+freezing(?:\s+temperatures?)?)[^.]{0,80}\./i,
    /[^.]{0,80}(?:freeze\s+(?:damage|injury)|damaged by freez(?:e|ing)|damage may occur if the freeze)[^.]{0,100}\./i,
    /[^.]{0,60}(?:frost.?sensitive|sensitive to frost|protect(?:ed)? from frost)[^.]{0,80}\./i,
    /[^.]{0,60}(?:freezing or late frost|late (?:spring )?frost[^.]{0,40}blossom|blossom[^.]{0,40}frost)[^.]{0,60}\./i
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    let s = m[0].replace(/\s+/g, ' ').trim();
    if (/data-downloadurl|Download Image|s3\.amazonaws/i.test(s)) continue;
    if (/CC BY/i.test(s) && !/frost.?tender|freeze\s+(?:damage|injury)/i.test(s)) continue;
    // Tag/chip noise: isolate a clean frost-tender token when license junk trails.
    if (/frost.?tender/i.test(s) && /CC BY|#\w+/i.test(s)) {
      s = 'Plant is frost tender.';
    }
    if (s.length < 18) continue;
    return s.slice(0, 220);
  }
  // Compact token fallback (NCSU tag chips) — still direct frost-tender wording.
  if (/\bfrost\s*tender\b/i.test(t) && !/CC BY-SA 4\.0 license applies to entire page body/i.test(t)) {
    return 'Plant is frost tender.';
  }
  return null;
}

/**
 * RAW SOURCE CLAIM: explicit frost/cold damage statement (not a zone ordinal).
 */
export function extractFrostInjuryClaim(text) {
  const t = String(text || '');
  const excerpt = extractFrostInjuryExcerpt(t);
  if (!excerpt) return null;

  let damageMode = null;
  let minimumWinterTemperatureF = null;
  let claimType = HARDINESS_CLAIM_TYPE.FROST_INJURY_STATEMENT;

  const kill = excerpt.match(
    /killed to the ground[^0-9]{0,40}(?:below|under)?\s*(-?\d+)\s*(?:&deg;|°)?\s*F/i
  );
  if (/killed to the ground|winter.?kill/i.test(excerpt)) {
    damageMode = 'killed_to_ground';
    claimType = HARDINESS_CLAIM_TYPE.COLD_DAMAGE_THRESHOLD;
    if (kill) minimumWinterTemperatureF = Number(kill[1]);
  } else if (
    /frost.?tender|intolerant of frost|killed by frost|intoleran(?:t|ce)\s+(?:of|for)\s+freezing/i.test(
      excerpt
    )
  ) {
    damageMode = 'frost_tender';
  } else if (
    /frost.?sensitive|sensitive to frost|protect(?:ed)? from frost|freeze\s+(?:damage|injury)|damaged by freez(?:e|ing)|damage may occur if the freeze/i.test(
      excerpt
    )
  ) {
    damageMode = 'frost_sensitive';
  } else if (/late (?:spring )?frost|freezing or late frost|blossom.*frost|frost.*blossom/i.test(excerpt)) {
    damageMode = 'late_frost_blossom_risk';
  } else {
    return null;
  }

  return {
    claimType,
    damageMode,
    minimumWinterTemperatureF,
    temperatureUnit: minimumWinterTemperatureF != null ? 'F' : null,
    rawValue: damageMode,
    displayValue:
      minimumWinterTemperatureF != null
        ? `${damageMode} below ${minimumWinterTemperatureF}F`
        : damageMode,
    supportingExcerpt: excerpt,
    claimFingerprint: sha256(
      JSON.stringify({
        t: claimType,
        mode: damageMode,
        f: minimumWinterTemperatureF
      })
    )
  };
}
