const fs=require('fs');
const vm=require('vm');
const path=require('path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'apps/pickem/index.html'),'utf8');
const js=html.split('<script>',2)[1].split('</script>',1)[0];
const ctx={console,globalThis:null,setTimeout,clearTimeout,fetch:async()=>({ok:false})};
ctx.globalThis=ctx;ctx.__SFIQ_TESTING__=true;
vm.createContext(ctx);vm.runInContext(js,ctx,{filename:'pickem-index.js'});
const handshake=ctx.SFIQ_TEST?.miniPcRefreshHandshake;
if(typeof handshake!=='function')throw new Error('mini-PC phone refresh handshake is not exported for regression testing');

const response=(body,{ok=true,status=200}={})=>({ok,status,json:async()=>body});

async function testLegacyBridgeCompatibility(){
  const calls=[];let imported=null;let importFinished=false;
  const fetchFn=async(url,opts={})=>{
    calls.push({url,method:opts.method||'GET'});
    if(url.endsWith('/status'))return response({ok:true,refreshing:false,lastRefreshOk:true});
    if(url.endsWith('/refresh-sync'))return response({ok:true,payload:{marker:'legacy'}});
    throw new Error('unexpected legacy URL '+url);
  };
  await handshake({
    fetchFn,
    baseUrl:'https://mini.test',
    importFn:async payload=>{await new Promise(r=>setTimeout(r,5));imported=payload;importFinished=true},
    waitFn:async()=>{},
    notify:()=>{},
    maxWaitMs:1000,
  });
  if(!importFinished||imported?.marker!=='legacy')throw new Error('legacy bridge payload was not fully awaited/imported');
  if(calls.map(x=>x.url).join('|')!=='https://mini.test/status|https://mini.test/refresh-sync')throw new Error('legacy compatibility path called the wrong endpoints: '+JSON.stringify(calls));
}

async function testTokenBridge(){
  const calls=[];let statusPoll=0;let imported=null;
  const fetchFn=async(url,opts={})=>{
    calls.push({url,method:opts.method||'GET'});
    if(url.endsWith('/status')){
      statusPoll++;
      if(statusPoll===1)return response({ok:true,refreshing:false,currentRunId:null,lastCompletedRunId:null});
      if(statusPoll===2)return response({ok:true,refreshing:true,currentRunId:'run-123',lastCompletedRunId:null});
      return response({ok:true,refreshing:false,currentRunId:null,lastCompletedRunId:'run-123',lastRefreshOk:true});
    }
    if(url.endsWith('/refresh'))return response({ok:true,started:true,alreadyRunning:false,runId:'run-123'},{status:202});
    if(url.endsWith('/live'))return response({ok:true,lastCompletedRunId:'run-123',payload:{marker:'token'}});
    throw new Error('unexpected token URL '+url);
  };
  await handshake({fetchFn,baseUrl:'https://mini.test',importFn:async p=>{imported=p},waitFn:async()=>{},notify:()=>{},maxWaitMs:1000});
  if(imported?.marker!=='token')throw new Error('tokenized bridge payload was not imported');
  const urls=calls.map(x=>x.url);
  if(!urls.includes('https://mini.test/refresh')||!urls.includes('https://mini.test/live'))throw new Error('token path did not exercise refresh/live endpoints: '+JSON.stringify(calls));
  if(statusPoll<3)throw new Error('token path did not wait for the requested run to complete');
}

(async()=>{
  await testLegacyBridgeCompatibility();
  await testTokenBridge();
  console.log('CBS phone refresh regression passed: legacy bridge compatibility + tokenized handoff');
})().catch(err=>{console.error(err);process.exit(1)});
