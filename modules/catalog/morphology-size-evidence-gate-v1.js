/**
 * CRUVIT Morphology + Mature Size Evidence Gate V1
 * Pure parsing of authoritative structured plant-page excerpts.
 * No network, no writes, no name-specific overrides.
 */

export const MORPHOLOGY_SIZE_EVIDENCE_GATE_VERSION =
  'morphology-size-evidence-gate-v1';

const FORM = Object.freeze({
  TREE:'tree',
  SHRUB:'shrub',
  CLIMBER:'climber',
  PALM:'palm',
  HERBACEOUS_UPRIGHT:'herbaceous-upright',
  HERBACEOUS_CLUMP:'herbaceous-clump',
  GROUNDCOVER:'groundcover',
  UNKNOWN:'unknown'
});

function text(v){
  return String(v == null ? '' : v)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&times;|&#215;/gi,'×')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/\s+/g,' ')
    .trim();
}

function parseFeetInches(ft, inch){
  const f=Number(ft||0), i=Number(inch||0);
  if(!Number.isFinite(f)||!Number.isFinite(i)) return null;
  return +((f*0.3048)+(i*0.0254)).toFixed(4);
}

function parseRange(raw,label){
  const exactFeetInches=new RegExp(
    label+'\\s*:\\s*([0-9.]+)\\s*ft\\.\\s*([0-9.]+)\\s*in\\.\\s*-\\s*([0-9.]+)\\s*ft\\.\\s*([0-9.]+)\\s*in\\.',
    'i'
  );
  const fi=exactFeetInches.exec(raw);
  if(fi){
    const min=parseFeetInches(fi[1],fi[2]);
    const max=parseFeetInches(fi[3],fi[4]);
    if(min>0&&max>0&&max>=min) return {min,max};
  }

  // UF/IFAS and other extension pages often publish explicit ranges as
  // "Height: 8 to 20 feet" / "Spread: 6 to 15 feet".
  // Only an explicit two-ended range is promoted; a single maximum is not
  // silently converted into a mature-size range.
  const feetRange=new RegExp(
    label+'\\s*:?\\s*([0-9.]+)\\s*(?:to|–|—|-)\\s*([0-9.]+)\\s*(?:feet|foot|ft\\.?)\\b',
    'i'
  );
  const fr=feetRange.exec(raw);
  if(fr){
    const min=+(Number(fr[1])*0.3048).toFixed(4);
    const max=+(Number(fr[2])*0.3048).toFixed(4);
    if(min>0&&max>0&&max>=min) return {min,max};
  }

  // RHS and other horticultural authorities often expose explicit metric
  // ranges as "Max Height 0.5-1 metres" / "Max Spread 0.1-0.5 metres".
  // Accept only two-ended source ranges; never infer a lower bound from a
  // single maximum such as "up to 5 metres".
  const metreRange=new RegExp(
    label+'\\s*:?\\s*([0-9.]+)\\s*(?:to|–|—|-)\\s*([0-9.]+)\\s*(?:metres|meters|metre|meter|m)\\b',
    'i'
  );
  const mr=metreRange.exec(raw);
  if(mr){
    const min=+Number(mr[1]).toFixed(4);
    const max=+Number(mr[2]).toFixed(4);
    if(min>0&&max>0&&max>=min) return {min,max};
  }
  return null;
}

function structuredBlock(raw,label,nextLabels){
  const next=nextLabels.map(x=>x.replace(/[.*+?^$()|[\]\\]/g,'\\$&')).join('|');
  const re=new RegExp(label+'\\s*:\\s*([\\s\\S]{1,220}?)(?=(?:'+next+')\\s*:|$)','i');
  const m=re.exec(raw);
  return m ? text(m[1]) : '';
}

export function extractStructuredMorphologyAndSize(excerpt=''){
  const raw=text(excerpt);
  const plantType=structuredBlock(raw,'Plant Type',[
    'Leaf Characteristics','Habit/Form','Growth Rate','Maintenance','Texture','Cultural Conditions'
  ]);
  const habitForm=structuredBlock(raw,'Habit/Form',[
    'Growth Rate','Maintenance','Texture','Cultural Conditions','Light','Soil Texture'
  ]);

  const pt=plantType.toLowerCase();
  const hf=habitForm.toLowerCase();
  const tree=/\btree\b/.test(pt);
  const shrub=/\bshrub\b/.test(pt);
  const vine=/\bvine\b|\bclimber\b|\bclimbing\b/.test(pt+' '+hf);
  const palm=/\bpalm\b|\bcycad\b/.test(pt);
  const herbaceous=/\bherbaceous\b/.test(pt);
  const groundcover=/\bground\s*cover\b|\bgroundcover\b/.test(pt+' '+hf);
  const clump=/\bclump\b|\bclumping\b|\bmounding\b|\bspreading\b/.test(hf);
  const erect=/\berect\b|\bupright\b/.test(hf);

  let visualForm=FORM.UNKNOWN;
  let architectureModes=[];
  let morphologyCode='MORPHOLOGY_UNKNOWN';

  if(palm){
    visualForm=FORM.PALM;
    architectureModes=['palm'];
    morphologyCode='EXPLICIT_PALM';
  }else if(vine){
    visualForm=FORM.CLIMBER;
    architectureModes=['climber'];
    morphologyCode='EXPLICIT_CLIMBER';
  }else if(tree&&shrub){
    visualForm=FORM.SHRUB;
    architectureModes=['tree','shrub'];
    morphologyCode='EXPLICIT_TREE_SHRUB_MULTI_FORM';
  }else if(tree){
    visualForm=FORM.TREE;
    architectureModes=['tree'];
    morphologyCode='EXPLICIT_TREE';
  }else if(shrub){
    visualForm=FORM.SHRUB;
    architectureModes=['shrub'];
    morphologyCode='EXPLICIT_SHRUB';
  }else if(groundcover){
    visualForm=FORM.GROUNDCOVER;
    architectureModes=['default'];
    morphologyCode='EXPLICIT_GROUNDCOVER';
  }else if(herbaceous){
    visualForm=clump ? FORM.HERBACEOUS_CLUMP : FORM.HERBACEOUS_UPRIGHT;
    architectureModes=['default'];
    morphologyCode=clump
      ? 'EXPLICIT_HERBACEOUS_CLUMP'
      : 'EXPLICIT_HERBACEOUS_UPRIGHT';
  }else if(erect || clump){
    // Habit/Form alone is useful evidence but not enough to assert herbaceousness.
    morphologyCode='HABIT_FORM_WITHOUT_LIFE_FORM';
  }

  const heightM=parseRange(raw,'Height');
  const spreadM=parseRange(raw,'Width') || parseRange(raw,'Spread');

  return Object.freeze({
    version:MORPHOLOGY_SIZE_EVIDENCE_GATE_VERSION,
    plantType:plantType||null,
    habitForm:habitForm||null,
    visualForm,
    architectureModes,
    morphologyReady:visualForm!==FORM.UNKNOWN,
    morphologyEvidenceClass:visualForm!==FORM.UNKNOWN
      ? 'SOURCE_SUPPORTED'
      : 'UNKNOWN',
    morphologyCode,
    matureSize:{
      heightM,
      spreadM,
      ready:Boolean(heightM&&spreadM),
      evidenceClass:heightM&&spreadM?'SOURCE_SUPPORTED':'UNKNOWN'
    }
  });
}
