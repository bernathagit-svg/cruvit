#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,'..','..');
const manifestPath=path.join(repoRoot,'config','packaging','static-runtime-manifest-v1.json');
const dormantPath=path.join(repoRoot,'config','packaging','dormant-reference-garden-design-pc-wand-v1.json');
const sourceLockPath=path.join(repoRoot,'config','packaging','static-runtime-source-lock-v1.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const dormant=JSON.parse(fs.readFileSync(dormantPath,'utf8'));
const sourceLock=JSON.parse(fs.readFileSync(sourceLockPath,'utf8'));
const ALLOWED_CLASSIFICATIONS=new Set(['PUBLIC_STATIC','SERVER_RUNTIME','BUILD_ONLY','HISTORICAL_EVIDENCE']);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const posix=p=>p.split(path.sep).join('/');
const git=(args)=>cp.execFileSync('git',args,{cwd:repoRoot,encoding:'utf8',maxBuffer:16_000_000}).trimEnd();

function ruleMatches(rel,rule){
  return (rule.exact||[]).includes(rel)
    || (rule.prefixes||[]).some(p=>rel.startsWith(p))
    || (rule.suffixes||[]).some(x=>rel.endsWith(x));
}
export function proposalMatches(rel,doc=manifest){
  const matches=[];
  for(let i=0;i<doc.classifications.length;i++){
    const rule=doc.classifications[i];
    if(ruleMatches(rel,rule)) matches.push({ruleIndex:i,classification:rule.classification,reason:rule.reason});
  }
  return matches;
}
export function classifyPath(rel,doc=manifest){
  const matches=proposalMatches(rel,doc);
  if(!matches.length) throw new Error('UNCLASSIFIED_SOURCE_PATH:'+rel);
  return matches[0];
}
function uniqueSorted(values){return [...new Set(values)].sort();}
function tracked(){
  return git(['ls-files','-z']).split('\0').filter(Boolean).sort();
}
export function validateSourceLock({trackedPaths=null,lock=sourceLock,proposalDoc=manifest,checkFilesystem=trackedPaths===null}={}){
  const actual=(trackedPaths?[...trackedPaths]:tracked()).sort();
  const errors=[];
  const rows=Array.isArray(lock?.paths)?lock.paths:[];
  const seen=new Map();
  for(const row of rows){
    if(!row||typeof row.path!=='string'){errors.push({code:'LOCK_ROW_INVALID'});continue;}
    if(seen.has(row.path)){errors.push({code:'LOCK_DUPLICATE_PATH',path:row.path});continue;}
    seen.set(row.path,row);
    if(!ALLOWED_CLASSIFICATIONS.has(row.classification)) errors.push({code:'LOCK_CLASSIFICATION_INVALID',path:row.path,classification:row.classification});
  }
  if(lock?.pathCount!==rows.length) errors.push({code:'LOCK_PATH_COUNT_METADATA_MISMATCH',declared:lock?.pathCount,actual:rows.length});
  const actualSet=new Set(actual);
  for(const rel of actual) if(!seen.has(rel)) errors.push({code:'TRACKED_PATH_NOT_LOCKED',path:rel});
  for(const rel of seen.keys()) if(!actualSet.has(rel)) errors.push({code:'LOCKED_PATH_DISAPPEARED',path:rel});
  if(checkFilesystem){
    for(const rel of actual){
      const abs=path.join(repoRoot,...rel.split('/'));
      if(!fs.existsSync(abs)) errors.push({code:'TRACKED_PATH_MISSING_ON_DISK',path:rel});
    }
  }
  const counts={};
  for(const rel of actual){
    const row=seen.get(rel);
    if(!row) continue;
    counts[row.classification]=(counts[row.classification]||0)+1;
    const current=uniqueSorted(proposalMatches(rel,proposalDoc).map(x=>x.classification));
    const locked=uniqueSorted(row.proposalClassifications||[]);
    if(JSON.stringify(current)!==JSON.stringify(locked)){
      errors.push({code:'PROPOSAL_CLASSIFICATION_DRIFT',path:rel,locked,current});
      continue;
    }
    if(!current.length){
      errors.push({code:'PROPOSAL_CLASSIFICATION_MISSING',path:rel});
    } else if(current.length===1){
      if(current[0]!==row.classification) errors.push({code:'LOCK_CLASSIFICATION_MISMATCH',path:rel,locked:row.classification,proposed:current[0]});
      if(row.reviewedConflictResolution) errors.push({code:'STALE_CONFLICT_RESOLUTION',path:rel});
    } else {
      if(!current.includes(row.classification)) errors.push({code:'LOCK_CLASSIFICATION_NOT_IN_PROPOSALS',path:rel,locked:row.classification,current});
      if(row.reviewedConflictResolution!==row.classification) errors.push({code:'CONFLICTING_PROPOSALS_UNRESOLVED',path:rel,current});
    }
  }
  if(lock?.classificationCounts){
    const expected=lock.classificationCounts;
    for(const key of new Set([...Object.keys(expected),...Object.keys(counts)])){
      if((expected[key]||0)!==(counts[key]||0)) errors.push({code:'LOCK_CLASSIFICATION_COUNT_MISMATCH',classification:key,declared:expected[key]||0,actual:counts[key]||0});
    }
  }
  return {ok:errors.length===0,errors,trackedPathCount:actual.length,lockedPathCount:rows.length,classificationCounts:counts,ruleConflictCount:rows.filter(r=>(r.proposalClassifications||[]).length>1).length};
}
function sourceLockMap(){return new Map(sourceLock.paths.map(row=>[row.path,row]));}

export function validateDormantReference({sourceFile=path.join(repoRoot,dormant.sourcePath),record=dormant}={}){
  const b=fs.readFileSync(sourceFile), s=b.toString('utf8');
  const count=x=>s.split(x).length-1;
  const actual={
    sha256:hash(b),
    selectorCount:count(record.selector),
    urlCount:count(record.unresolvedUrl),
    activeUrlCount:count(record.activeWandAsset.url),
    missingAssetExists:fs.existsSync(path.join(path.dirname(sourceFile),record.unresolvedUrl)),
    activeAssetExists:fs.existsSync(path.join(path.dirname(sourceFile),record.activeWandAsset.url))
  };
  const failures=[];
  if(actual.sha256!==record.sourceSha256) failures.push('SOURCE_HASH_CHANGED');
  if(actual.selectorCount!==record.expectedSelectorOccurrenceCount) failures.push('SELECTOR_OCCURRENCE_CHANGED');
  if(actual.urlCount!==record.expectedUrlOccurrenceCount) failures.push('URL_OCCURRENCE_CHANGED');
  if(actual.activeUrlCount!==record.activeWandAsset.expectedSourceOccurrenceCount) failures.push('ACTIVE_WAND_REFERENCE_CHANGED');
  if(actual.missingAssetExists) failures.push('MISSING_ASSET_APPEARED');
  if(!actual.activeAssetExists) failures.push('ACTIVE_WAND_ASSET_MISSING');
  const cssOnly=s.split(/\r?\n/).filter(line=>line.includes(record.selector));
  if(cssOnly.length!==record.expectedSelectorOccurrenceCount || cssOnly.some(line=>!line.trim().startsWith(record.selector))) failures.push('SELECTOR_OUTSIDE_APPROVED_CSS');
  const withoutCss=s.split(/\r?\n/).filter(line=>!line.includes(record.selector)).join('\n');
  if(withoutCss.includes('pc-wand-btn')) failures.push('JAVASCRIPT_OR_TEMPLATE_CONSUMER_FOUND');
  return {ok:failures.length===0,failures,actual};
}
function parseArgs(argv){
  const out={out:manifest.outputDirectory,receipt:'.netlify/static-packaging-receipt.json'};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--out') out.out=argv[++i];
    else if(argv[i]==='--receipt') out.receipt=argv[++i];
    else throw new Error('UNKNOWN_ARG:'+argv[i]);
  }
  return out;
}
function safeOutput(abs){
  const root=path.resolve(repoRoot), out=path.resolve(abs);
  if(out===root || !out.startsWith(root+path.sep)) throw new Error('OUTPUT_MUST_BE_SEPARATE_SUBDIRECTORY');
  if(out.includes(path.sep+'.git'+path.sep)) throw new Error('OUTPUT_INSIDE_GIT_FORBIDDEN');
  return out;
}
function copyFile(rel,outRoot){
  const src=path.join(repoRoot,...rel.split('/')), dst=path.join(outRoot,...rel.split('/'));
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(src,dst);
  const a=fs.readFileSync(src),b=fs.readFileSync(dst);
  if(!a.equals(b)) throw new Error('COPY_NOT_BYTE_IDENTICAL:'+rel);
  return b;
}
function forbiddenPublic(rel){
  if(manifest.forbiddenPublic.some(p=>rel===p.slice(0,-1)||rel.startsWith(p))) return 'FORBIDDEN_PREFIX';
  if(manifest.forbiddenPublicExtensions.includes(path.extname(rel).toLowerCase())) return 'FORBIDDEN_EXTENSION';
  if(/(^|\/)\.env($|[.\/])/.test(rel)||/(^|\/)(\.cache|\.npm)(\/|$)/.test(rel)||(!rel.startsWith('data/coordinate-climate/v2/coverage/')&&/(^|\/)coverage(\/|$)/.test(rel))) return 'PRIVATE_OR_CACHE_PATH';
  if(/(?:receipt|audit-report|verification-output|local-evidence-archive)/i.test(rel)) return 'PRIVATE_MATERIAL_NAME';
  return null;
}
function scanSecrets(rel,b){
  if(!/\.(?:html?|css|m?js|json|svg|txt)$/i.test(rel)) return [];
  const s=b.toString('utf8');
  const patterns=[
    ['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['OPENAI_LIKE_KEY',/\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['AWS_ACCESS_KEY',/\bAKIA[0-9A-Z]{16}\b/],
    ['JWT_LITERAL',/\beyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{10,}\b/],
    ['SERVICE_ROLE_LITERAL',/(?:service_role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*['"][^'"]{12,}['"]/i]
  ];
  return patterns.filter(([,re])=>re.test(s)).map(([id])=>id);
}
function checkLiteralReferences(outRoot, publicSet){
  const issues=[];
  const endpointPrefixes=['/.netlify/functions/','/api/'];
  const external=/^(?:https?:|mailto:|tel:|data:|blob:|javascript:|#)/i;
  const candidates=[...publicSet].filter(x=>/\.(?:html?|css|m?js)$/i.test(x));
  const resolve=(from,raw)=>{
    if(raw.includes('${')||raw.includes("' +")||raw.includes('" +')) return null;
    const clean=raw.split('#')[0].split('?')[0];
    if(!clean||external.test(raw)||raw.startsWith('@')||/^[a-z]+\/[a-z0-9.+-]+$/i.test(raw)||endpointPrefixes.some(p=>clean.startsWith(p))) return null;
    const knownFile=/\.(?:html?|css|m?js|json|png|jpe?g|svg|webp|gif|gz)$/i.test(clean);
    if(!clean.includes('/')&&!clean.startsWith('.')&&!knownFile) return null;
    const rootLike=/^(?:modules|data|scripts|homepage-v1|store|privacy|wtp-premium-v1)\//.test(clean);
    const rel=clean.startsWith('/')?clean.slice(1):rootLike?clean:posix(path.normalize(path.join(path.posix.dirname(from),clean)));
    return rel.replace(/^\.\//,'');
  };
  const refs=[];
  for(const rel of candidates){
    const s=fs.readFileSync(path.join(outRoot,...rel.split('/')),'utf8');
    const regexes=[];
    if(/\.html?$/i.test(rel)) regexes.push(['html',/(?:src|href)\s*=\s*["']([^"']+)["']/gi],['css',/url\(\s*["']?([^"')]+)["']?\s*\)/gi]);
    else if(/\.css$/i.test(rel)) regexes.push(['css',/url\(\s*["']?([^"')]+)["']?\s*\)/gi]);
    else if(/\.m?js$/i.test(rel)) regexes.push(['module',/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/gi]);
    for(const [kind,re] of regexes){
      for(const m of s.matchAll(re)){
        const raw=m[1], target=resolve(rel,raw);
        if(!target) continue;
        refs.push({from:rel,kind,raw,target});
        if(publicSet.has(target)) continue;
        const rewriteTarget=manifest.routeRewrites?.[target];
        if(rewriteTarget&&publicSet.has(rewriteTarget)) continue;
        const idx=target.endsWith('/')?target+'index.html':target+'/index.html';
        if(publicSet.has(idx)) continue;
        if(rel===dormant.sourcePath && raw===dormant.unresolvedUrl){
          const d=validateDormantReference();
          if(!d.ok) issues.push({from:rel,raw,target,reason:'DORMANT_RECORD_INVALID',details:d.failures});
          continue;
        }
        issues.push({from:rel,raw,target,reason:'LOCAL_REFERENCE_MISSING'});
      }
    }
  }
  return {refs,issues};
}
function writeJson(file,obj){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n');
}
export function buildStatic({out,receipt}){
  const output=safeOutput(path.isAbsolute(out)?out:path.join(repoRoot,out));
  if(fs.existsSync(output)) fs.rmSync(output,{recursive:true,force:false});
  fs.mkdirSync(output,{recursive:true});
  const dormantCheck=validateDormantReference();
  if(!dormantCheck.ok) throw new Error('DORMANT_REFERENCE_INVALID:'+dormantCheck.failures.join(','));
  const sourceFiles=tracked();
  const lockCheck=validateSourceLock({trackedPaths:sourceFiles,lock:sourceLock,proposalDoc:manifest,checkFilesystem:true});
  if(!lockCheck.ok) throw new Error('SOURCE_LOCK_INVALID:'+JSON.stringify(lockCheck.errors.slice(0,12)));
  const lockMap=sourceLockMap(), publicRows=[], excludedRows=[], serverRows=[];
  for(const rel of sourceFiles){
    const row=lockMap.get(rel);
    if(!row) throw new Error('SOURCE_LOCK_MISSING_AT_BUILD:'+rel);
    const cls={classification:row.classification,reason:row.reason};
    if(cls.classification==='PUBLIC_STATIC'){
      const why=forbiddenPublic(rel);
      if(why) throw new Error('FORBIDDEN_PUBLIC_PATH:'+rel+':'+why);
      const b=copyFile(rel,output);
      publicRows.push({path:rel,bytes:b.length,sha256:hash(b),classification:cls.classification,reason:cls.reason});
    } else {
      const excluded={path:rel,classification:cls.classification,reason:cls.reason};
      excludedRows.push(excluded);
      if(cls.classification==='SERVER_RUNTIME') serverRows.push(excluded);
    }
  }
  const publicSet=new Set(publicRows.map(x=>x.path));
  for(const s of manifest.publicSentinels) if(!publicSet.has(s)) throw new Error('MISSING_PUBLIC_SENTINEL:'+s);
  for(const [p,expected] of Object.entries(manifest.required13ImpactPaths)){
    const got=lockMap.get(p)?.classification;
    if(got!==expected) throw new Error('IMPACT13_CLASSIFICATION_MISMATCH:'+p+':'+got);
  }
  const refCheck=checkLiteralReferences(output,publicSet);
  if(refCheck.issues.length) throw new Error('UNRESOLVED_PUBLIC_REFERENCE:'+JSON.stringify(refCheck.issues.slice(0,8)));
  const secretFindings=[];
  for(const row of publicRows){
    const b=fs.readFileSync(path.join(output,...row.path.split('/')));
    for(const finding of scanSecrets(row.path,b)) secretFindings.push({path:row.path,finding});
  }
  if(secretFindings.length) throw new Error('SECRET_SCAN_FINDING:'+JSON.stringify(secretFindings.slice(0,8)));
  const manifestDigest=hash(Buffer.from(publicRows.map(r=>`${r.path}\t${r.bytes}\t${r.sha256}\t${r.classification}\n`).join('')));
  const receiptObj={
    schemaVersion:1,
    sourceBaseline:manifest.baselineSourceSha,
    sourceTree:manifest.baselineSourceTree,
    sourceLock:{path:posix(path.relative(repoRoot,sourceLockPath)),sha256:hash(fs.readFileSync(sourceLockPath)),pathCount:lockCheck.lockedPathCount,classificationCounts:lockCheck.classificationCounts,ruleConflictCount:lockCheck.ruleConflictCount},
    outputDirectory:posix(path.relative(repoRoot,output)),
    publicFileCount:publicRows.length,
    excludedFileCount:excludedRows.length,
    serverRuntimeFileCount:serverRows.length,
    outputManifestSha256:manifestDigest,
    dormantReference:dormantCheck,
    localReferenceCount:refCheck.refs.length,
    secretFindings,
    publicManifest:publicRows,
    excludedManifest:excludedRows,
    functionsImpactMinimum:manifest.functionsImpactMinimum||null
  };
  const receiptFile=path.isAbsolute(receipt)?receipt:path.join(repoRoot,receipt);
  writeJson(receiptFile,receiptObj);
  return receiptObj;
}
function isMain(){
  try{return import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;}catch{return false;}
}
if(isMain()){
  try{
    const args=parseArgs(process.argv.slice(2));
    const r=buildStatic(args);
    console.log(JSON.stringify({
      ok:true,
      publicFileCount:r.publicFileCount,
      outputManifestSha256:r.outputManifestSha256,
      excludedFileCount:r.excludedFileCount,
      serverRuntimeFileCount:r.serverRuntimeFileCount,
      sourceLockPathCount:r.sourceLock.pathCount,
      sourceLockSha256:r.sourceLock.sha256,
      localReferenceCount:r.localReferenceCount
    },null,2));
  } catch(e){
    console.error('STATIC_PACKAGE_FAIL:'+e.message);
    process.exitCode=1;
  }
}
