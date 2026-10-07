import { spawnSync } from 'node:child_process';

const SITE_ID='66d2b5a1-eee3-47c7-b201-4ccbed5410e3';
const checkOnly=process.argv.includes('--check-only');

function run(cmd,args,options={}){
  const r=spawnSync(cmd,args,{encoding:'utf8',shell:false,...options});
  if(r.error) throw r.error;
  return r;
}

const status=run('git',['status','--porcelain']);
if(status.status!==0) throw new Error('GIT_STATUS_FAILED');
if(String(status.stdout||'').trim()){
  console.error('PRODUCTION_DEPLOY_BLOCKED_DIRTY_WORKTREE');
  console.error(String(status.stdout||'').trim());
  process.exit(2);
}

const head=run('git',['rev-parse','HEAD']);
const origin=run('git',['rev-parse','origin/main']);
if(head.status!==0||origin.status!==0) throw new Error('GIT_HEAD_READ_FAILED');
if(String(head.stdout).trim()!==String(origin.stdout).trim()){
  console.error('PRODUCTION_DEPLOY_BLOCKED_HEAD_NOT_ORIGIN_MAIN');
  process.exit(3);
}

if(checkOnly){
  console.log(JSON.stringify({ok:true,code:'PRODUCTION_DEPLOY_CLEAN',head:String(head.stdout).trim(),siteId:SITE_ID}));
  process.exit(0);
}

const npx=process.platform==='win32'?'npx.cmd':'npx';
const deploy=spawnSync(npx,[
  '--yes','netlify-cli@latest','deploy','--prod','--no-build',
  '--site',SITE_ID,'--dir','.','--functions','netlify/functions','--json'
],{stdio:'inherit',shell:false});
process.exit(deploy.status??1);
