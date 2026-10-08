/** Audit the fixed four-commit graph. Never cherry-picks, merges, deploys or replays SQL. */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='bbc7f1b0f03c1eaff8d7f83e9e0599f086d67033';
const SHAS=['278ab87150fe60377c3a3e56f82dfdf0182c6f67','eee0ab34c909ca0323fef32e8f65ddd2dc9eae95',
'0ca252313fbed6593fce0a754a804e0d352f6aca','97d839085d6dc20d588d81e8b29fd8ab141c954d'];
const git=args=>cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:20000,maxBuffer:4000000}).trimEnd();
const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
const observed=git(['rev-list','--reverse',BASE+'..'+SHAS.at(-1)]).split('\n');
check(JSON.stringify(observed)===JSON.stringify(SHAS),'Unexpected stack contents/order');
check(git(['merge-base',BASE,SHAS.at(-1)])===BASE,'Main is not exact ancestor');
const scopePath='data/garden-design/plant-intake-e2e-stress-tests/six-plant-climate-supplement-2026-10-07-v1/approval-and-scope.json';
const scope=JSON.parse(git(['show',SHAS[1]+':'+scopePath]));
check(scope.proposalCommit===SHAS[0] && scope.executionAuthorized===true,'Proposal approval lineage differs');
const proposal=cp.execFileSync('git',['show',SHAS[0]+':'+scope.proposalPath],{cwd:ROOT,maxBuffer:1000000});
check(crypto.createHash('sha256').update(proposal).digest('hex')===scope.proposalSha256,'Approved proposal fingerprint differs');
const approvals=[
 {review:'DATA_PROPOSAL_SCOPE_APPROVED',evidence:'The immutable approval-and-scope.json in eee0ab34 explicitly names this proposal commit/path/SHA-256 and records the owner approval. This approves the bounded proposal, not a merge.',
  dataExecution:'PROPOSAL_ONLY_AT_THIS_COMMIT; execution documented in child eee0ab34',
  publicPublication:'REACHABLE_AS_ANCESTOR_OF_APPROVED_PUSH; no separate explicit whole-commit publication approval located',
  merge:false,deploy:false,integrationSelection:'PENDING_SUPERVISOR_COMMIT_SELECTION'},
 {review:'BOUNDED_DATA_REPAIR_APPROVED',evidence:'Owner approved the exact Mango/Date Palm/Monstera supplemental climate repair and separately approved public publication of its 13 files to the work branch.',
  dataExecution:'PREVIOUSLY_EXECUTED_AND_RECORDED; NOT_AUTHORIZED_TO_REPLAY',publicPublication:'EXACT_COMMIT_PUSH_APPROVED_AND_PREVIOUSLY_VERIFIED',
  merge:false,deploy:false,integrationSelection:'PENDING_SUPERVISOR_COMMIT_SELECTION'},
 {review:'OWNER_APPROVED_EXACT_REVIEW_BRANCH_PUBLICATION',evidence:'Owner answered approval to publishing exact 0ca2523, 14 files, review branch only. No separate Supervisor merge clearance is present.',
  dataExecution:'NO_DB_WRITE_IN_THIS_CODE_CHANGE',publicPublication:'EXACT_COMMIT_PUSH_APPROVED_AND_PREVIOUSLY_VERIFIED',
  merge:false,deploy:false,integrationSelection:'PENDING_SUPERVISOR_COMMIT_SELECTION'},
 {review:'SUPERVISOR_POSITIVE_REVIEW_WITH_HOLD',evidence:'Current instruction explicitly says UNKNOWN repair passed positive review while merge/deploy HOLD remains; previous owner instruction explicitly authorized exact 97d8390 branch push.',
  dataExecution:'NO_DB_WRITE_IN_THIS_CODE_CHANGE',publicPublication:'EXACT_COMMIT_PUSH_APPROVED_AND_PREVIOUSLY_VERIFIED',
  merge:false,deploy:false,integrationSelection:'PENDING_SUPERVISOR_COMMIT_SELECTION'}
];
const rows=SHAS.map((sha,i)=>{
 const parent=git(['rev-parse',sha+'^']);check(parent===(i?SHAS[i-1]:BASE),'Parent mismatch');
 check(git(['show','-s','--format=%P',sha]).split(' ').length===1,'Unexpected merge commit');
 const stats=git(['diff','--numstat',parent,sha]).split('\n').map(line=>{const [a,d,...p]=line.split('\t');return {path:p.join('\t'),added:Number(a),deleted:Number(d)};});
 const types=Object.fromEntries(git(['diff','--name-status',parent,sha]).split('\n').map(s=>[s.slice(2),s[0]]));
 const files=stats.map(row=>({...row,status:types[row.path],gitBlob:git(['rev-parse',sha+':'+row.path])}));
 return {order:i+1,sha,parent,tree:git(['rev-parse',sha+'^{tree}']),subject:git(['show','-s','--format=%s',sha]),
   scope: i===0?'4 new proposal/test evidence files':i===1?'13 new data-repair/evidence files':i===2?'3 runtime files + 2 existing tests modified; 9 new verification artifacts':'4 runtime files modified; 9 new test/evidence files',
   counts:{files:files.length,addedFiles:files.filter(x=>x.status==='A').length,modifiedFiles:files.filter(x=>x.status==='M').length,
    addedLines:stats.reduce((n,x)=>n+x.added,0),deletedLines:stats.reduce((n,x)=>n+x.deleted,0)},
   files,approval:approvals[i],hostedLinuxCi:'NOT_RUN_BY_THIS_TASK; previous local tests are not hosted CI',
   commitUrl:'https://github.com/bernathagit-svg/cruvit/commit/'+sha};
});
const manifest={id:'CRUVIT-FOUR-COMMIT-REVIEW-STACK-20261008',verifiedAt:new Date().toISOString(),base:BASE,head:SHAS.at(-1),
 graphStatus:'PASS_EXACT_FOUR_LINEAR_COMMITS',commitCount:4,mergeCommitCount:0,
 uniqueTouchedPaths:new Set(rows.flatMap(r=>r.files.map(f=>f.path))).size,rows,
 approvedProposalLineage:{approvalPath:scopePath,proposalPath:scope.proposalPath,proposalSha256:scope.proposalSha256,approvedAt:scope.approvedAt,approvalText:scope.approvalText},
 approvalPolicy:'Proposal approval, data execution authorization, review, public push and integration/merge/deploy are distinct. Publication never implies merge permission.',
 overallGate:'HOLD_NO_MERGE_NO_DEPLOY',
 nextIntegration:{created:false,base:BASE,requires:'Supervisor explicit selection of approved commits, clean branch, no replay of executed data SQL, hosted Linux CI on the resulting HEAD before merge.',
  historicalEvidence:'Pinned historical runners and reports must stay unchanged. Use fresh integration evidence rather than weakening their source fingerprints.'},
 frozenUnknownBranch:{name:'work/climate-unknown-metadata-20261008',head:SHAS.at(-1),modifiedByThisTask:false},
 separateAliasTask:{base:BASE,branch:'work/canonical-alias-authority-drift-20261008',notPartOfFourCommitStack:true},
 boundaries:{merge:0,deploy:0,paidAi:0,imageGeneration:0,databaseWrites:0,registryWrites:0}}
const dir=path.join(ROOT,'data/identity/canonical-alias-authority-drift-20261008');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'four-commit-stack-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({graphStatus:manifest.graphStatus,uniqueTouchedPaths:manifest.uniqueTouchedPaths,rows:rows.map(({sha,parent,counts,approval})=>({sha,parent,counts,approval}))},null,2));
