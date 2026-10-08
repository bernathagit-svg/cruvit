/* DA-01 only. Run with Node and an installed Playwright: --output <outside-repo-dir>
 * --playwright <package-path> --browser <executable>. Optional --deployed-origin must be an immutable Preview URL.
 * Both backend boot and Supabase library are intercepted. The existing UI handler calls an injected local spy
 * that never resolves; no navigation after Save, real save controller, session or RPC is used by these tests.
 * Artwork measurements refer only to the hash-locked 940x1672 PI-08 PNG, not to a new visual design.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const BASE='bed34e3f94ec142384e90f1ee8badd459cf75aff',HTML='core-v1/plant-identification/index.html';
const OLD='7:[{x:5,y:76,w:90,h:15,to:0,label:"Save to My Garden"}]';
const NEW='7:[{x:10,y:78,w:80,h:5,to:0,label:"Save to My Garden"}]';
const WIDTHS=[320,375,390,430],ART={width:940,height:1672,sha256:'7388999a05af7711d38c75248443d36d82ee185069d6c6d348fb562bef7678ba'};
const BUTTON={x:38,y:1293,width:864,height:108}; // Envelope excludes the shadow; rounded caps are not made clickable.
const NAV={x:0,y:1452,width:940,height:220}; // Conservative union of footer and the protruding Identify circle.
const NAV_NAMES=['Home','My Garden','Identify','Design','Shop'];
const TITLES=['Identify','Camera','Analyzing','Result','Plant Profile','Care','Suitability','Save to My Garden'];
const repo=path.resolve(__dirname,'../..'),args=process.argv.slice(2),opt={};
for(let i=0;i<args.length;i+=2){assert(args[i]?.startsWith('--')&&args[i+1],'Options require values');opt[args[i].slice(2)]=args[i+1];}
assert(opt.output,'Provide an evidence output directory outside the repository');
const out=path.resolve(opt.output);assert(out!==repo&&!out.startsWith(repo+path.sep),'Evidence must stay outside the repo');fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',['-C',repo,...a],{maxBuffer:100e6});
const before=git('show',BASE+':'+HTML),after=fs.readFileSync(path.join(repo,HTML));
assert.equal(before.toString().split(OLD).length,2,'Exact baseline hotspot must exist once');
assert.equal(after.toString(),before.toString().replace(OLD,NEW),'No other HTML, text, CSS or handler change is allowed');
const chunks=git('ls-tree','-r','--name-only',BASE,'core-v1/plant-identification/assets').toString().trim().split('\n');assert.equal(chunks.length,29);
const contexts=[{window:{}},{window:{}}],assetProof=[];contexts.forEach(c=>vm.createContext(c));
const cache=new Map();cache.set('/baseline/'+HTML,before);cache.set('/candidate/'+HTML,after);
for(const p of chunks){const a=git('show',BASE+':'+p),b=fs.readFileSync(path.join(repo,p));assert(a.equals(b),'Approved PI chunk changed: '+p);[a,b].forEach((x,i)=>vm.runInContext(x.toString(),contexts[i]));cache.set('/baseline/'+p,a);cache.set('/candidate/'+p,b);}
for(let i=0;i<8;i++){const a=Buffer.from(contexts[0].window.__PI[i].join('').split(',')[1],'base64'),b=Buffer.from(contexts[1].window.__PI[i].join('').split(',')[1],'base64');assert(a.equals(b));assetProof.push({screen:i+1,sha256:hash(a),bytes:a.length,byteIdentical:true});}assert.equal(assetProof[7].sha256,ART.sha256);
if(opt['deployed-origin'])assert(/^https:\/\/[a-f0-9]{24}--cruvit-core-v1-e2e-preview\.netlify\.app$/.test(opt['deployed-origin']),'Only immutable isolated Preview is allowed');
const report={scope:'DA01_GEOMETRY_AND_EVENT_ONLY',base:BASE,mode:opt['deployed-origin']?'IMMUTABLE_DEPLOY_WITH_INTERCEPTED_BACKEND_BOOT':'OFFLINE_EXACT_SOURCE_WITH_LOCAL_SPY',deployedOrigin:opt['deployed-origin']||null,artifact:ART,visibleSaveButtonBounds:BUTTON,bottomNavigationBounds:NAV,before:{x:5,y:76,w:90,h:15},after:{x:10,y:78,w:80,h:5},assets:assetProof,piChunksByteIdentical:29,viewports:[],visualComparisons:[],network:{staticGets:0,interceptedBackendScripts:0,nonGetAttempts:0,supabaseRequests:0,supabaseRpcRequests:0,externalRequests:0,emittedNetworkWrites:0},realSaveCalls:0,databaseWrites:0,externalProviderCalls:0,paidAICalls:0,startedAt:new Date().toISOString()};
const serve=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');let key=u.pathname;if(key.endsWith('/'))key+='index.html';const b=cache.get(key);if(!b){res.writeHead(404).end();return;}res.setHeader('Content-Type',key.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.end(b);});
function intersects(a,b){return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));}
function contains(outer,inner){const epsilon=.05;return inner.x>=outer.x-epsilon&&inner.y>=outer.y-epsilon&&inner.x+inner.width<=outer.x+outer.width+epsilon&&inner.y+inner.height<=outer.y+outer.height+epsilon;}
const toScreen=(r,s)=>({x:s.x+r.x/ART.width*s.width,y:s.y+r.y/ART.height*s.height,width:r.width/ART.width*s.width,height:r.height/ART.height*s.height});
(async()=>{
 const {chromium}=require(opt.playwright||'playwright');await new Promise(r=>serve.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+serve.address().port;
 const browser=await chromium.launch({headless:true,...(opt.browser?{executablePath:opt.browser}:{})});
 try{
  for(const width of WIDTHS){const states={};
   for(const variant of ['baseline','candidate']){
    const remote=variant==='candidate'&&opt['deployed-origin'],origin=remote||local,prefix=remote?'':'/'+variant;
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
    await context.route('**/*',route=>{const q=route.request(),u=new URL(q.url());if(q.method()!=='GET'){report.network.nonGetAttempts++;return route.abort();}
     if(u.hostname.endsWith('.supabase.co')){report.network.supabaseRequests++;if(u.pathname.includes('/rpc/'))report.network.supabaseRpcRequests++;return route.abort();}
     if(u.origin!==origin){report.network.externalRequests++;return route.abort();}
     if(u.pathname.endsWith('/atomic/boot.mjs')||u.pathname.endsWith('/my-garden/assets/supabase.js')){report.network.interceptedBackendScripts++;return route.fulfill({status:200,contentType:'text/javascript',body:'/* DA-01 test: backend execution intentionally omitted. */'});}
     const relative=u.pathname.slice(prefix.length);if(relative!='/core-v1/plant-identification/'&&!/^\/core-v1\/plant-identification\/assets\/s\d-\d\d\.js$/.test(relative)){report.network.externalRequests++;return route.abort();}
     report.network.staticGets++;return route.continue();});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+prefix+'/core-v1/plant-identification/',{waitUntil:'networkidle'});
    for(let screen=0;screen<8;screen++){
     await page.waitForFunction(title=>document.title.endsWith(' · '+title),TITLES[screen]);await page.locator('#screen').evaluate(im=>im.decode());await page.mouse.move(0,0);
     const bytes=await page.locator('#stage').screenshot({path:path.join(out,variant+'-'+width+'-PI'+(screen+1)+'.png'),animations:'disabled'});
     const key=width+':'+screen;if(variant==='baseline')states[key]=bytes;else{const equal=states[key].equals(bytes);report.visualComparisons.push({width,screen:screen+1,before:variant==='candidate'?'baseline-'+width+'-PI'+(screen+1)+'.png':null,after:'candidate-'+width+'-PI'+(screen+1)+'.png',beforeSha256:hash(states[key]),afterSha256:hash(bytes),pngByteIdentical:equal});assert(equal,'Visible pixels changed at '+key);}
     if(screen<7)await page.keyboard.press('ArrowRight');
    }
    const stage=await page.locator('#stage').boundingBox(),target=await page.getByRole('button',{name:'Save to My Garden',exact:true}).boundingBox();assert(stage&&target);
    const button=toScreen(BUTTON,stage),nav=toScreen(NAV,stage),gap=nav.y-(target.y+target.height);
    await page.evaluate(()=>{window.__DA01={calls:0};document.getElementById('stage').dispatchEvent(new CustomEvent('cruvit-pi-save-bind',{detail:{save:()=>{window.__DA01.calls++;return new Promise(()=>{});}}}));});
    if(variant==='baseline'){
     assert(intersects(target,nav)>0,'Negative control must reproduce the original overlap');
     const p={x:stage.x+stage.width/2,y:stage.y+1460/ART.height*stage.height};await page.mouse.click(p.x,p.y);await page.waitForFunction(()=>window.__DA01.calls===1);
     states.negative={intersectionArea:intersects(target,nav),navigationPointerInvokedMock:1,point:p,bounds:target};
    }else{
     assert.equal(intersects(target,nav),0);assert(contains(button,target));
     const native={x:(target.x-stage.x)/stage.width*ART.width,y:(target.y-stage.y)/stage.height*ART.height,width:target.width/stage.width*ART.width,height:target.height/stage.height*ART.height};
     // Read native artwork border pixels to establish that the rectangle also avoids rounded endcaps.
     const edge=await page.evaluate(({native})=>{const im=document.getElementById('screen'),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data,pts=new Set();const x0=Math.floor(native.x),x1=Math.ceil(native.x+native.width),y0=Math.floor(native.y),y1=Math.ceil(native.y+native.height);for(let x=x0;x<=x1;x++){pts.add(x+','+y0);pts.add(x+','+y1)}for(let y=y0;y<=y1;y++){pts.add(x0+','+y);pts.add(x1+','+y)}let outside=0;for(const p of pts){const [x,y]=p.split(',').map(Number),j=(y*c.width+x)*4;const r=d[j],g=d[j+1],b=d[j+2];if(!(g>r+12&&g>b+8&&r<100&&g<130))outside++;}return {sampledBorderPixels:pts.size,outsideGreenButton:outside};},{native});assert.equal(edge.outsideGreenButton,0,'Hotspot edge left the visible green silhouette');
     const points=[];for(const x of [94,470,846]){points.push({region:'above',x,y:1285});points.push({region:'below',x,y:1420});}points.push({region:'left',x:20,y:1347},{region:'right',x:920,y:1347});
     for(let i=0;i<5;i++)for(const k of [.1,.5,.9])for(const y of [1453,1535,1645])points.push({region:NAV_NAMES[i],x:(i+k)*188,y});
     const trials=[];for(const p of points){const screenPoint={x:stage.x+p.x/ART.width*stage.width,y:stage.y+p.y/ART.height*stage.height};await page.mouse.click(screenPoint.x,screenPoint.y);await page.waitForTimeout(5);const count=await page.evaluate(()=>window.__DA01.calls);assert.equal(count,0,'Outside click invoked Save: '+p.region);trials.push({...p,screenPoint,mockedInvocations:0});}
     const center={x:target.x+target.width/2,y:target.y+target.height/2};await page.mouse.click(center.x,center.y);await page.waitForFunction(()=>window.__DA01.calls===1);await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>window.__DA01.calls),1);
     assert.equal(errors.length,0,'Unexpected runtime error');report.viewports.push({width,height:900,stage,before:states.negative.bounds,after:target,visibleSave:button,bottomNavigation:nav,intersectionArea:0,verticalGapCssPx:gap,contained:true,silhouetteEvidence:edge,negativeControl:states.negative,inside:{point:center,mockedInvocations:1},outsideTrials:trials,outsideInvocations:0,bottomNavigationRegions:NAV_NAMES.map(name=>({name,points:trials.filter(t=>t.region===name).length,mockedInvocations:0})),pageErrors:errors});
    }
    await context.close();
   }
  }
  assert.equal(report.network.nonGetAttempts+report.network.supabaseRequests+report.network.externalRequests,0,'Unexpected attempted network request');
  report.passed=true;report.screenshotPairsIdentical=report.visualComparisons.length;report.candidateInsideMockedInvocations=report.viewports.reduce((n,v)=>n+v.inside.mockedInvocations,0);report.candidateOutsidePointerTrials=report.viewports.reduce((n,v)=>n+v.outsideTrials.length,0);report.candidateOutsideMockedInvocations=0;
 }catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;}finally{await browser.close();await new Promise(r=>serve.close(r));report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,mode:report.mode,widths:report.viewports.map(v=>v.width),screenshotPairsIdentical:report.screenshotPairsIdentical,assetsByteIdentical:assetProof.length,insideMockedInvocations:report.candidateInsideMockedInvocations,outsidePointerTrials:report.candidateOutsidePointerTrials,outsideMockedInvocations:report.candidateOutsideMockedInvocations,network:report.network,error:report.error||null},null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;serve.close();});
