from pathlib import Path

# Build 1.16.5 removes the fragile GitHub polling handoff entirely.
# The phone waits on a private synchronous mini-PC refresh endpoint and imports
# the sanitized payload returned directly by the bridge. GitHub auto-push remains
# the durable/public copy, but simulation no longer waits for Pages/raw CDN state.
app = Path('apps/pickem/index.html')
s = app.read_text(encoding='utf-8')
s = s.replace("const MODEL_BUILD='1.16.4';", "const MODEL_BUILD='1.16.5';")

start = s.find('async function triggerMiniPcCbsRefresh(){')
end = s.find('async function loadPublishedCbs(', start)
if start < 0 or end < 0:
    raise SystemExit('refresh lifecycle boundaries not found; refusing partial patch')
new_refresh = """async function triggerMiniPcCbsRefresh(){
  show('Refreshing CBS and market data on the mini-PC…');
  const response=await fetch(CBS_AUTOMATION_URL+'/refresh-sync',{method:'POST',cache:'no-store'});
  let result=null;
  try{result=await response.json()}catch(_){}
  if(!response.ok||!result?.ok)throw new Error(result?.error||('Mini-PC refresh endpoint returned HTTP '+response.status));
  if(!result.payload)throw new Error('Mini-PC refresh completed without a sanitized CBS payload.');
  importScan(result.payload);
  show('CBS refresh complete. Sunday Funday IQ is current.');
  return true;
}
"""
s = s[:start] + new_refresh + s[end:]
app.write_text(s, encoding='utf-8')

home = Path('index.html')
h = home.read_text(encoding='utf-8')
h = h.replace("const MODEL_BUILD='1.16.4';", "const MODEL_BUILD='1.16.5';")
home.write_text(h, encoding='utf-8')

# Make headless the safe default. Login mode still explicitly opens a visible
# browser, but production/scheduled/app-triggered collection cannot pop Chrome
# merely because a Windows scheduled task inherited stale environment state.
collector = Path('tools/cbs-collector.py')
c = collector.read_text(encoding='utf-8')
c = c.replace("HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','0')=='1'", "HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','1')=='1'")
if "HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','1')=='1'" not in c:
    raise SystemExit('collector headless default anchor not found')
collector.write_text(c, encoding='utf-8')

bridge = Path('tools/cbs-bridge-server.py')
b = bridge.read_text(encoding='utf-8')
old = """            if self.path=='/refresh':
                with LOCK: busy=SERVICE['refreshing']
                if not busy: threading.Thread(target=run_collector,daemon=True).start()
                return self._json(202,{'ok':True,'started':not busy,'alreadyRunning':busy})
            length=int(self.headers.get('Content-Length','0'))
"""
new = """            if self.path=='/refresh-sync':
                with LOCK: busy=SERVICE['refreshing']
                if busy: return self._json(409,{'ok':False,'error':'CBS refresh is already running. Try again in a moment.'})
                run_collector()
                with LOCK: status=dict(SERVICE)
                if not status.get('lastRefreshOk'):
                    detail=str(status.get('lastRefreshError') or 'CBS refresh failed').strip().splitlines()[-1]
                    return self._json(400,{'ok':False,'error':detail})
                try: payload=json.loads(OUTPUT.read_text(encoding='utf-8'))
                except Exception as exc: return self._json(500,{'ok':False,'error':'CBS refreshed but the sanitized payload could not be loaded: '+str(exc)})
                return self._json(200,{'ok':True,'payload':payload,'lastCommit':status.get('lastCommit'),'publishedAt':status.get('lastPublishedAt')})
            if self.path=='/refresh':
                with LOCK: busy=SERVICE['refreshing']
                if not busy: threading.Thread(target=run_collector,daemon=True).start()
                return self._json(202,{'ok':True,'started':not busy,'alreadyRunning':busy})
            length=int(self.headers.get('Content-Length','0'))
"""
if old in b:
    b=b.replace(old,new)
elif "self.path=='/refresh-sync'" not in b:
    raise SystemExit('bridge refresh endpoint anchor not found; refusing partial patch')
bridge.write_text(b, encoding='utf-8')

print('patched direct synchronous CBS refresh handoff and headless default')
