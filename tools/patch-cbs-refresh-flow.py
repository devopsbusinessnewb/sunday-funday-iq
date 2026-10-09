from pathlib import Path

# Build 1.16.7 keeps the new run-token handshake for upgraded mini-PCs, but also
# supports the currently-running 1.16.5 bridge so the phone can work before the
# next local pull/restart. The old bridge is detected from /status and handled
# through /refresh-sync, with the sanitized payload fully awaited before the app
# checks freshness or starts simulation.
app = Path('apps/pickem/index.html')
s = app.read_text(encoding='utf-8')
for old in ("const MODEL_BUILD='1.16.4';", "const MODEL_BUILD='1.16.5';", "const MODEL_BUILD='1.16.6';"):
    s = s.replace(old, "const MODEL_BUILD='1.16.7';")

start = s.find('async function miniPcRefreshHandshake(')
if start < 0:
    start = s.find('async function triggerMiniPcCbsRefresh(){')
end = s.find('async function loadPublishedCbs(', start)
if start < 0 or end < 0:
    raise SystemExit('refresh lifecycle boundaries not found; refusing partial patch')

new_refresh = """async function miniPcRefreshHandshake({fetchFn=fetch,importFn=importScan,waitFn=waitFor,notify=show,baseUrl=CBS_AUTOMATION_URL,maxWaitMs=150000}={}){
  // Capability probe first. This lets a freshly deployed app work with both the
  // current 1.16.5 mini-PC bridge and the upgraded run-token bridge.
  let capability=null;
  try{
    const capabilityResponse=await fetchFn(baseUrl+'/status',{cache:'no-store'});
    if(capabilityResponse.ok)capability=await capabilityResponse.json();
  }catch(_){}

  if(!capability||!Object.prototype.hasOwnProperty.call(capability,'currentRunId')){
    notify('Refreshing CBS and market data on the mini-PC…');
    let legacyResponse;
    try{legacyResponse=await fetchFn(baseUrl+'/refresh-sync',{method:'POST',cache:'no-store'})}
    catch(e){throw new Error('Could not reach the mini-PC. Make sure Tailscale is connected, then try again.')}
    let legacy=null;
    try{legacy=await legacyResponse.json()}catch(_){}
    if(!legacyResponse.ok||!legacy?.ok)throw new Error(legacy?.error||('Mini-PC refresh endpoint returned HTTP '+legacyResponse.status));
    if(!legacy.payload)throw new Error('Mini-PC refresh completed without a sanitized CBS payload.');
    await importFn(legacy.payload);
    notify('CBS refresh complete. Sunday Funday IQ is current.');
    return true;
  }

  notify('Starting CBS refresh on the mini-PC…');
  let startResponse;
  try{startResponse=await fetchFn(baseUrl+'/refresh',{method:'POST',cache:'no-store'})}
  catch(e){throw new Error('Could not reach the mini-PC. Make sure Tailscale is connected, then try again.')}
  let started=null;
  try{started=await startResponse.json()}catch(_){}
  if(!startResponse.ok||!started?.ok)throw new Error(started?.error||('Mini-PC refresh endpoint returned HTTP '+startResponse.status));
  const runId=started.runId;
  if(!runId)throw new Error('Mini-PC did not return a refresh run ID.');

  const deadline=Date.now()+maxWaitMs;
  let lastError='';
  while(Date.now()<deadline){
    await waitFn(1600);
    let statusResponse;
    try{statusResponse=await fetchFn(baseUrl+'/status',{cache:'no-store'})}
    catch(e){lastError='Could not read mini-PC refresh status.';continue}
    if(!statusResponse.ok){lastError='Mini-PC status returned HTTP '+statusResponse.status;continue}
    let status=null;
    try{status=await statusResponse.json()}catch(_){lastError='Mini-PC status was not valid JSON.';continue}

    if(status.lastCompletedRunId===runId){
      if(status.lastRefreshOk!==true)throw new Error(status.lastRefreshError||'Mini-PC CBS refresh failed.');
      notify('CBS refreshed. Loading the sanitized data…');
      let liveResponse;
      try{liveResponse=await fetchFn(baseUrl+'/live',{cache:'no-store'})}
      catch(e){throw new Error('CBS refreshed, but the phone could not retrieve the sanitized payload from the mini-PC.')}
      let live=null;
      try{live=await liveResponse.json()}catch(_){}
      if(!liveResponse.ok||!live?.ok||!live?.payload)throw new Error(live?.error||'Mini-PC did not return the refreshed CBS payload.');
      if(live.lastCompletedRunId&&live.lastCompletedRunId!==runId)throw new Error('Mini-PC returned data from a different refresh run. Try once more.');
      await importFn(live.payload);
      notify('CBS refresh complete. Sunday Funday IQ is current.');
      return true;
    }

    if(status.currentRunId===runId||status.refreshing){
      notify('Mini-PC is refreshing CBS and market data…');
      continue;
    }
    lastError='The requested mini-PC refresh has not started yet.';
  }
  throw new Error(lastError||'CBS refresh took longer than expected.');
}
async function triggerMiniPcCbsRefresh(){return miniPcRefreshHandshake()}
"""
s = s[:start] + new_refresh + s[end:]

needle = 'globalThis.SFIQ_TEST={'
if needle not in s:
    raise SystemExit('SFIQ_TEST export anchor missing')
if 'globalThis.SFIQ_TEST={miniPcRefreshHandshake,' not in s:
    s = s.replace(needle, 'globalThis.SFIQ_TEST={miniPcRefreshHandshake,', 1)
app.write_text(s, encoding='utf-8')

home = Path('index.html')
h = home.read_text(encoding='utf-8')
for old in ("const MODEL_BUILD='1.16.4';", "const MODEL_BUILD='1.16.5';", "const MODEL_BUILD='1.16.6';"):
    h = h.replace(old, "const MODEL_BUILD='1.16.7';")
home.write_text(h, encoding='utf-8')

collector = Path('tools/cbs-collector.py')
c = collector.read_text(encoding='utf-8')
c = c.replace("HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','0')=='1'", "HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','1')=='1'")
if "HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','1')=='1'" not in c:
    raise SystemExit('collector headless default anchor not found')
collector.write_text(c, encoding='utf-8')

# Upgrade the bridge to the explicit run-token protocol. This is not required for
# phone compatibility with the current bridge, but removes long-held requests once
# the mini-PC next pulls/restarts and gives every refresh an unambiguous lifecycle.
bridge = Path('tools/cbs-bridge-server.py')
b = bridge.read_text(encoding='utf-8')
b = b.replace('import json, os, re, subprocess, sys, threading', 'import json, os, re, subprocess, sys, threading, uuid')

old_service = "SERVICE={'refreshing':False,'lastRefreshStarted':None,'lastRefreshFinished':None,'lastRefreshOk':None,'lastRefreshError':None,'lastPublishedAt':None,'lastCommit':None}"
new_service = "SERVICE={'refreshing':False,'currentRunId':None,'lastCompletedRunId':None,'lastRefreshStarted':None,'lastRefreshFinished':None,'lastRefreshOk':None,'lastRefreshError':None,'lastPublishedAt':None,'lastCommit':None}"
if old_service in b:
    b = b.replace(old_service, new_service)
elif "'currentRunId':None" not in b:
    raise SystemExit('bridge SERVICE anchor not found')

old_runner = """def run_collector():
    with LOCK:
        if SERVICE['refreshing']: return
        SERVICE.update({'refreshing':True,'lastRefreshStarted':iso_now(),'lastRefreshFinished':None,'lastRefreshOk':None,'lastRefreshError':None})
    try:
        proc=subprocess.run([sys.executable,str(COLLECTOR)],cwd=ROOT,text=True,capture_output=True,timeout=180)
        if proc.returncode!=0: raise RuntimeError((proc.stderr or proc.stdout or 'CBS collector failed').strip())
        with LOCK: SERVICE['lastRefreshOk']=True
    except Exception as exc:
        with LOCK: SERVICE['lastRefreshOk']=False; SERVICE['lastRefreshError']=str(exc)
    finally:
        with LOCK: SERVICE['refreshing']=False; SERVICE['lastRefreshFinished']=iso_now()
"""
new_runner = """def claim_refresh(run_id=None):
    rid=run_id or uuid.uuid4().hex
    with LOCK:
        if SERVICE['refreshing']: return False,SERVICE.get('currentRunId')
        SERVICE.update({'refreshing':True,'currentRunId':rid,'lastRefreshStarted':iso_now(),'lastRefreshFinished':None,'lastRefreshOk':None,'lastRefreshError':None})
    return True,rid

def run_collector(run_id=None,claimed=False):
    rid=run_id
    if not claimed:
        started,rid=claim_refresh(run_id)
        if not started: return False
    try:
        proc=subprocess.run([sys.executable,str(COLLECTOR)],cwd=ROOT,text=True,capture_output=True,timeout=180)
        if proc.returncode!=0: raise RuntimeError((proc.stderr or proc.stdout or 'CBS collector failed').strip())
        with LOCK: SERVICE['lastRefreshOk']=True
        return True
    except Exception as exc:
        with LOCK: SERVICE['lastRefreshOk']=False; SERVICE['lastRefreshError']=str(exc)
        return False
    finally:
        with LOCK:
            SERVICE['refreshing']=False
            SERVICE['currentRunId']=None
            SERVICE['lastCompletedRunId']=rid
            SERVICE['lastRefreshFinished']=iso_now()
"""
if old_runner in b:
    b = b.replace(old_runner, new_runner)
elif 'def claim_refresh(' not in b:
    raise SystemExit('bridge collector lifecycle anchor not found')

old_get = """        if self.path=='/status':
            with LOCK: status=dict(SERVICE)
            return self._json(200,{'ok':True,'autoPush':AUTO_PUSH,**status})
        self._json(404,{'ok':False,'error':'Not found'})
"""
new_get = """        if self.path=='/status':
            with LOCK: status=dict(SERVICE)
            return self._json(200,{'ok':True,'autoPush':AUTO_PUSH,**status})
        if self.path=='/live':
            try: payload=json.loads(OUTPUT.read_text(encoding='utf-8'))
            except Exception as exc: return self._json(404,{'ok':False,'error':'Sanitized CBS payload is unavailable: '+str(exc)})
            with LOCK: status=dict(SERVICE)
            return self._json(200,{'ok':True,'payload':payload,'lastCompletedRunId':status.get('lastCompletedRunId'),'lastCommit':status.get('lastCommit'),'publishedAt':status.get('lastPublishedAt')})
        self._json(404,{'ok':False,'error':'Not found'})
"""
if old_get in b:
    b = b.replace(old_get, new_get)
elif "self.path=='/live'" not in b:
    raise SystemExit('bridge GET endpoint anchor not found')

old_refresh = """            if self.path=='/refresh':
                with LOCK: busy=SERVICE['refreshing']
                if not busy: threading.Thread(target=run_collector,daemon=True).start()
                return self._json(202,{'ok':True,'started':not busy,'alreadyRunning':busy})
"""
new_refresh_server = """            if self.path=='/refresh':
                started,run_id=claim_refresh()
                if started: threading.Thread(target=run_collector,args=(run_id,True),daemon=True).start()
                return self._json(202,{'ok':True,'started':started,'alreadyRunning':not started,'runId':run_id})
"""
if old_refresh in b:
    b = b.replace(old_refresh, new_refresh_server)
elif "'runId':run_id" not in b:
    raise SystemExit('bridge /refresh anchor not found')

bridge.write_text(b, encoding='utf-8')
print('patched backward-compatible phone refresh + run-token bridge upgrade')
