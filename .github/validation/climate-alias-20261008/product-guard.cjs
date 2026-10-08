/** Validation-only I/O boundary. Never edits product code, assertions, fixtures or stored evidence. */
const fs=require('node:fs'),path=require('node:path'),url=require('node:url');
const originalAppend=fs.appendFileSync.bind(fs),originalWrite=fs.writeFileSync.bind(fs);
const root=path.resolve(process.env.CRUVIT_PRODUCT_ROOT),out=path.resolve(process.env.CRUVIT_EVIDENCE_DIR);
const audit=process.env.CRUVIT_GUARD_AUDIT;
const log=(kind,detail)=>originalWrite(audit,JSON.stringify({kind,detail,pid:process.pid})+'\n',{flag:'a'});
const denyNetwork=()=>{log('NETWORK_ATTEMPT','Network denied by validation boundary');throw new Error('PRODUCT_NETWORK_FORBIDDEN');};
globalThis.fetch=denyNetwork;
for(const k of ['WebSocket','XMLHttpRequest','EventSource'])if(globalThis[k])globalThis[k]=denyNetwork;
for(const [name,keys]of [['node:http',['request','get']],['node:https',['request','get']],['node:net',['connect','createConnection']],['node:tls',['connect']],['node:dgram',['createSocket']]]){
 const m=require(name);for(const key of keys)m[key]=denyNetwork;
}
require('node:net').Socket.prototype.connect=denyNetwork;
const asPath=x=>x instanceof URL?url.fileURLToPath(x):typeof x==='string'?path.resolve(x):Buffer.isBuffer(x)?path.resolve(x.toString()):null;
const within=(p,parent)=>p===parent||p.startsWith(parent+path.sep);
const legacy=path.join(root,'tests/_licensed-catalog-media-runtime-v1-report.json');
function destination(p,method){
 if(typeof p==='number')return p;
 const abs=asPath(p);
 if(abs===legacy&&['writeFileSync','writeFile'].includes(method)){
  const dest=path.join(out,'test-generated-licensed-media-'+process.pid+'.json');
  log('REPORT_REDIRECT',{original:'tests/_licensed-catalog-media-runtime-v1-report.json',destination:path.basename(dest)});
  return dest;
 }
 if(!abs||!within(abs,out)){
  log('FORBIDDEN_WRITE',{method,path:abs&&within(abs,root)?path.relative(root,abs):String(p)});
  throw new Error('PRODUCT_OR_EXTERNAL_WRITE_FORBIDDEN:'+method);
 }
 return p;
}
for(const method of ['writeFileSync','appendFileSync','writeFile','appendFile','createWriteStream','mkdirSync','mkdir','rmSync','rm','unlinkSync','unlink','rmdirSync','rmdir','truncateSync','truncate','chmodSync','chmod']){
 const original=fs[method]?.bind(fs);if(original)fs[method]=(p,...args)=>original(destination(p,method),...args);
}
for(const method of ['renameSync','rename','copyFileSync','copyFile']){
 const original=fs[method].bind(fs);fs[method]=(a,b,...args)=>{
  if(method.startsWith('rename'))destination(a,method);
  return original(a,destination(b,method),...args);
 };
}
for(const method of ['writeFile','appendFile','mkdir','rm','unlink','rmdir','truncate','chmod']){
 const original=fs.promises[method]?.bind(fs.promises);if(original)fs.promises[method]=(p,...args)=>original(destination(p,method),...args);
}
require('node:module').syncBuiltinESMExports();
