const $=id=>document.getElementById(id),status=$('status'),cc=$('captureCount'),sc=$('snapshotCount');
async function refresh(){
  try{
    const current=await chrome.runtime.sendMessage({type:'GET_STATE'});cc.textContent=current.captures?.length||0;sc.textContent=current.snapshots?.length||0;
    const scan=current.meta?.scan||{};
    if(scan.state==='running')status.textContent='WORKING — '+(scan.step||'processing…');
    else if(scan.state==='done')status.textContent=scan.step||'CAPTURE COMPLETE — export the scan.';
    else if(scan.state==='error')status.textContent='ERROR — '+scan.step;
    else status.textContent=current.meta?.hookReady?'CONNECTED — ready to scan CBS.':'Open or refresh your CBS Pick’em pool once.';
  }catch(error){status.textContent='Bridge error: '+error.message}
}
$('scanBtn').onclick=async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.url?.startsWith('https://picks.cbssports.com/football/pickem/pools/')){status.textContent='Open your CBS Pick’em pool first.';return}await chrome.runtime.sendMessage({type:'RUN_SCAN'});status.textContent='WORKING — Picks, standings, then odds.'};
$('archiveBtn').onclick=async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!/\/standings\/weekly/.test(tab?.url||'')){status.textContent='Open Weekly Standings and select the completed week first.';return}await chrome.runtime.sendMessage({type:'CAPTURE_COMPLETED_WEEK'});status.textContent='WORKING — capturing the full standings table.'};
$('exportBtn').onclick=async()=>{const result=await chrome.runtime.sendMessage({type:'EXPORT'});status.textContent=result?.ok?'Export created — send or import the JSON file.':'Export failed.'};
$('clearBtn').onclick=async()=>{await chrome.runtime.sendMessage({type:'CLEAR'});refresh()};
refresh();setInterval(refresh,1000);
