from pathlib import Path

path=Path('apps/pickem/index.html')
s=path.read_text(encoding='utf-8')
needle="const waitFor=ms=>new Promise(resolve=>setTimeout(resolve,ms));\n"
helper="""const waitFor=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchWithTimeout(fetchFn,url,options={},timeoutMs=8000){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{return await fetchFn(url,{...options,...(controller?{signal:controller.signal}:{})})}
  catch(error){if(error?.name==='AbortError')throw new Error('Mini-PC did not respond within '+Math.round(timeoutMs/1000)+' seconds. Check Tailscale/bridge health.');throw error}
  finally{if(timer)clearTimeout(timer)}
}
"""
if 'async function fetchWithTimeout(' not in s:
    if needle not in s: raise SystemExit('waitFor anchor not found')
    s=s.replace(needle,helper,1)
repls={
"const capabilityResponse=await fetchFn(baseUrl+'/status',{cache:'no-store'});":"const capabilityResponse=await fetchWithTimeout(fetchFn,baseUrl+'/status',{cache:'no-store'},8000);",
"try{legacyResponse=await fetchFn(baseUrl+'/refresh-sync',{method:'POST',cache:'no-store'})}":"try{legacyResponse=await fetchWithTimeout(fetchFn,baseUrl+'/refresh-sync',{method:'POST',cache:'no-store'},45000)}",
"try{startResponse=await fetchFn(baseUrl+'/refresh',{method:'POST',cache:'no-store'})}":"try{startResponse=await fetchWithTimeout(fetchFn,baseUrl+'/refresh',{method:'POST',cache:'no-store'},10000)}",
"try{statusResponse=await fetchFn(baseUrl+'/status',{cache:'no-store'})}":"try{statusResponse=await fetchWithTimeout(fetchFn,baseUrl+'/status',{cache:'no-store'},7000)}",
"try{liveResponse=await fetchFn(baseUrl+'/live',{cache:'no-store'})}":"try{liveResponse=await fetchWithTimeout(fetchFn,baseUrl+'/live',{cache:'no-store'},10000)}",
"maxWaitMs=150000":"maxWaitMs=60000",
}
for old,new in repls.items():
    if old in s: s=s.replace(old,new,1)
    elif new not in s: raise SystemExit('missing anchor: '+old)
path.write_text(s,encoding='utf-8')
