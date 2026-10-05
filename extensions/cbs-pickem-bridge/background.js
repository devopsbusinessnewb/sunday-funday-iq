const DEFAULT={captures:[],snapshots:[],meta:{hookReady:null,scan:{state:'idle',step:''}}};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function state(){return chrome.storage.local.get(DEFAULT)}
async function setScan(stateName,step=''){const s=await state();await chrome.storage.local.set({meta:{...s.meta,scan:{state:stateName,step}}})}
function parseOperation(url){try{const u=new URL(url);return{operationName:u.searchParams.get('operationName')||'',variables:u.searchParams.get('variables')||''}}catch{return{operationName:'',variables:''}}}
async function waitComplete(tabId,timeout=20000){return new Promise(resolve=>{let done=false;const timer=setTimeout(()=>{if(!done){done=true;chrome.tabs.onUpdated.removeListener(fn);resolve()}},timeout);const fn=(id,info)=>{if(id===tabId&&info.status==='complete'&&!done){done=true;clearTimeout(timer);chrome.tabs.onUpdated.removeListener(fn);resolve()}};chrome.tabs.onUpdated.addListener(fn)})}
async function snap(tabId,type='SNAPSHOT'){try{return await chrome.tabs.sendMessage(tabId,{type})}catch{return null}}
async function visit(tabId,url,step,wait=4200){await setScan('running',step);await chrome.tabs.update(tabId,{url});await waitComplete(tabId);await delay(wait);await snap(tabId);await delay(500)}
async function runScan(tab){
  const match=String(tab.url||'').match(/^https:\/\/picks\.cbssports\.com\/football\/pickem\/pools\/([^/]+)/);
  if(!match)throw new Error('Open your CBS Pick’em pool first.');
  const poolId=match[1],pool=`https://picks.cbssports.com/football/pickem/pools/${poolId}`;
  await chrome.storage.local.set({captures:[],snapshots:[],meta:{hookReady:null,scan:{state:'running',step:'Opening Picks'}}});
  await visit(tab.id,pool,'Opening Picks');
  await visit(tab.id,`${pool}/standings/weekly`,'Opening Weekly Standings');
  await visit(tab.id,'https://www.cbssports.com/nfl/odds/','Loading current CBS NFL odds',5200);
  await setScan('done','Scan complete — Picks + Standings + Odds');
}
async function captureCompletedWeek(tab){
  if(!/picks\.cbssports\.com\/football\/pickem\/pools\/[^/]+\/standings\/weekly/.test(String(tab.url||'')))throw new Error('Open Weekly Standings and select the completed week first.');
  await setScan('running','Capturing the full standings table');
  const result=await snap(tab.id,'FULL_TABLE_SNAPSHOT');
  if(!result?.ok)throw new Error(result?.error||'The standings page could not be captured.');
  await setScan('done',`Completed-week table captured across ${result.views} views — export the scan.`);
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{(async()=>{
  const current=await state();
  if(message?.type==='ADD_CAPTURE'){
    const parsed=parseOperation(message.payload.url),record={...message.payload,...parsed},key=record.operationName+'|'+record.variables+'|'+record.body;
    const existing=current.captures.filter(c=>(c.operationName+'|'+c.variables+'|'+c.body)!==key);
    await chrome.storage.local.set({captures:[...existing,record].slice(-100)});respond({ok:true});
  }else if(message?.type==='ADD_SNAPSHOT'){
    const key=(message.payload.url||'')+'|'+(message.payload.title||'')+'|'+(message.payload.captureMode||'')+'|'+(message.payload.text||'').slice(0,300);
    const existing=current.snapshots.filter(q=>((q.url||'')+'|'+(q.title||'')+'|'+(q.captureMode||'')+'|'+(q.text||'').slice(0,300))!==key);
    await chrome.storage.local.set({snapshots:[...existing,message.payload].slice(-20)});respond({ok:true});
  }else if(message?.type==='HOOK_READY'){await chrome.storage.local.set({meta:{...current.meta,hookReady:message.payload}});respond({ok:true})}
  else if(message?.type==='GET_STATE')respond(current);
  else if(message?.type==='CLEAR'){await chrome.storage.local.set(DEFAULT);respond({ok:true})}
  else if(message?.type==='RUN_SCAN'){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});respond({ok:true,started:true});
    try{await runScan(tab)}catch(error){await setScan('error',error.message)}
  }else if(message?.type==='CAPTURE_COMPLETED_WEEK'){
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});respond({ok:true,started:true});
    try{await captureCompletedWeek(tab)}catch(error){await setScan('error',error.message)}
  }else if(message?.type==='EXPORT'){
    const latest=await state(),summary=latest.captures.map(c=>({operationName:c.operationName,variables:c.variables,status:c.status,ts:c.ts,bodyBytes:(c.body||'').length}));
    const out={product:'CBS Pick’em IQ Bridge',version:'0.5.0',exportedAt:new Date().toISOString(),privacy:'No passwords, cookies, request headers, Authorization headers, or CSRF headers are intentionally captured.',graphqlSummary:summary,captures:latest.captures,snapshots:latest.snapshots};
    const url='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(out,null,2)),filename=`cbs-pickem-iq-scan-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    await chrome.downloads.download({url,filename,saveAs:true});respond({ok:true,filename});
  }
})().catch(error=>respond({ok:false,error:error.message}));return true});
