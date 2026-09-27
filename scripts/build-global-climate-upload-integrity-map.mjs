import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const source='C:/Users/berna/Projects/cruvit/data/coordinate-climate/v2/coverage/global-v1';
const tileDir=path.join(source,'tiles');
const old=JSON.parse(fs.readFileSync('data/coordinate-climate/v2/coverage/global-v1/upload-authority-map.json','utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const files=fs.readdirSync(tileDir).filter(n=>n.endsWith('.cctb.gz')).sort();
if(files.length!==Number(manifest.tileCount)) throw new Error('tile-count-mismatch');
const out={};let total=0;
for(let i=0;i<files.length;i++){
 const n=files[i],b=fs.readFileSync(path.join(tileDir,n));
 const sha=crypto.createHash('sha256').update(b).digest('hex');
 const md5=crypto.createHash('md5').update(b).digest('hex');
 const prior=typeof old[n]==='string'?old[n]:old[n]?.sha256;
 if(String(prior||'').toLowerCase()!==sha) throw new Error('sha-authority-mismatch:'+n);
 out[n]={sha256:sha,md5,bytes:b.length};total+=b.length;
 if((i+1)%5000===0) console.error('verified',i+1,'of',files.length);
}
if(total!==Number(manifest.stats?.totalGzipBytes)) throw new Error('byte-total-mismatch');
fs.writeFileSync('data/coordinate-climate/v2/coverage/global-v1/upload-authority-map.json',JSON.stringify(out));
console.log(JSON.stringify({tiles:files.length,totalBytes:total,allShaVerified:true,md5Added:true},null,2));