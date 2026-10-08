/** Lossless test identity/outcome recorder; does not alter, filter or skip tests. */
import path from 'node:path';
const root=path.resolve(process.env.CRUVIT_PRODUCT_ROOT || process.cwd());
const relative=p=>typeof p==='string'?path.relative(root,p).replace(/\\/g,'/'):null;
function err(e,depth=0){
  if(!e||depth>4)return null;
  const o={name:e.name||null,message:String(e.message||''),code:e.code||null,failureType:e.failureType||null};
  for(const k of ['actual','expected','operator'])if(Object.hasOwn(e,k))o[k]=e[k];
  if(e.stack)o.stack=String(e.stack).split(root).join('<PRODUCT>').replace(/\\/g,'/');
  if(e.cause)o.cause=err(e.cause,depth+1);
  return o;
}
export default async function* reporter(source){
 for await(const event of source){
  if(!['test:pass','test:fail','test:summary'].includes(event.type))continue;
  const d=event.data||{};
  if(event.type==='test:summary'){yield JSON.stringify({event:event.type,data:d})+'\n';continue;}
  yield JSON.stringify({event:event.type,file:relative(d.file),name:d.name,line:d.line,column:d.column,nesting:d.nesting,
   skip:d.skip||false,todo:d.todo||false,error:err(d.details?.error),type:d.details?.type||null})+'\n';
 }
}
