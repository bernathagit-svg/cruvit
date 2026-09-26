/**
 * CRUVIT Humidity Evidence Gate V1
 * Extracts explicit humidity / wetness evidence from authoritative source text.
 * It does not itself decide final climate suitability.
 */
export const HUMIDITY_EVIDENCE_GATE_VERSION='humidity-evidence-gate-v1';

function clean(v){
  return String(v||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}
function excerpt(raw,index,r=220){
  return raw.slice(Math.max(0,index-r),Math.min(raw.length,index+r)).replace(/\s+/g,' ').trim();
}
function contextSpecificityRisk(excerptText=''){
  const s=String(excerptText||'').toLowerCase();
  return /\bseries\b|\bcultivar\b|\bcultivars\b|\bhybrid\b|\bcross between\b|\bvariety\b|\bvarieties\b/.test(s);
}
function evidence(kind, excerptText, confidence){
  if(contextSpecificityRisk(excerptText)){
    return {
      ok:false,
      kind:'CONTEXT_SPECIFIC_CULTIVAR_OR_HYBRID',
      excerpt:excerptText,
      confidence,
      scopeRisk:true
    };
  }
  return {ok:true,kind,excerpt:excerptText,confidence,scopeRisk:false};
}

export function extractHumidityEvidence(raw=''){
  const text=clean(raw), lower=text.toLowerCase();
  const directHigh=[
    /tolerates? high humidity/g,
    /tolerant of (?:heat and )?humidity/g,
    /high humidity tolerance/g,
    /thrives? in humid/g,
    /grows? best in [^.]{0,80}humid conditions/g,
    /prefers? [^.]{0,80}humid conditions/g,
    /resistance to challenges:\s{0,5}.{0,260}\bhumidity\b/g
  ];
  for(const re of directHigh){
    const m=re.exec(lower);
    if(m) return evidence('DIRECT_HIGH_TOLERANCE',excerpt(text,m.index),'HIGH');
  }

  const directLow=[
    /does not tolerate high humidity/g,
    /intolerant of high humidity/g,
    /poorly suited to humid/g,
    /susceptible[^.]{0,120}high humidity/g
  ];
  for(const re of directLow){
    const m=re.exec(lower);
    if(m) return evidence('DIRECT_LOW_TOLERANCE',excerpt(text,m.index),'HIGH');
  }

  const humidityTerms=[
    /high humidity/g,/humid conditions/g,/humid weather/g,/humidity/g,
    /leaf wetness/g,/wet foliage/g,/prolonged wetness/g,/poor air circulation/g
  ];
  const diseaseTerms=/disease|fungal|fungus|mildew|blight|rot|rust|spot|infection|pathogen/i;
  for(const re of humidityTerms){
    for(const m of lower.matchAll(re)){
      const ex=excerpt(text,m.index,260);
      if(diseaseTerms.test(ex)){
        return evidence('HUMIDITY_OR_WETNESS_DISEASE_PRESSURE',ex,'MEDIUM');
      }
    }
  }

  return {ok:false,kind:'NO_EXPLICIT_HUMIDITY_EVIDENCE',excerpt:null,confidence:'LOW'};
}

export function deriveHumidityTrait(evidence={}){
  if(evidence.kind==='DIRECT_HIGH_TOLERANCE'){
    return {
      value:'high',
      evidenceClass:'SOURCE_SUPPORTED',
      transformRef:null,
      rationale:'Authoritative source explicitly states high-humidity tolerance.'
    };
  }
  if(evidence.kind==='DIRECT_LOW_TOLERANCE'){
    return {
      value:'low',
      evidenceClass:'SOURCE_SUPPORTED',
      transformRef:null,
      rationale:'Authoritative source explicitly states poor high-humidity tolerance.'
    };
  }
  if(evidence.kind==='HUMIDITY_OR_WETNESS_DISEASE_PRESSURE'){
    return {
      value:'medium',
      evidenceClass:'HEURISTIC_ASSERTION',
      transformRef:'humidity-disease-pressure-to-tolerance-v1@1.0.0',
      rationale:'Authoritative source documents humidity/wetness-related disease pressure; medium is the conservative transformed tolerance.'
    };
  }
  return {
    value:null,
    evidenceClass:'UNKNOWN',
    transformRef:null,
    rationale:'No source-supported humidity evidence was found.'
  };
}
