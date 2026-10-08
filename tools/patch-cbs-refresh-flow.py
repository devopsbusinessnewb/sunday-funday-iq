from pathlib import Path

p = Path('apps/pickem/index.html')
s = p.read_text(encoding='utf-8')
old = s

s = s.replace("const MODEL_BUILD='1.16.0';", "const MODEL_BUILD='1.16.1';")
s = s.replace("CBS_AUTOMATION_URL+'/status?v='+Date.now()", "CBS_AUTOMATION_URL+'/status'")

old_block = """  if(routeParams.get('action')==='refresh-simulate'){
    renderRunProgress('cbs','Loading the published CBS card and latest revealed standings…');
    const imported=await loadPublishedCbs({silent:false,onlyIfNewer:false});
    if(!imported){const message='CBS data could not be loaded. The old card was not simulated.';show(message+' Check the published CBS JSON, then try again.','red');renderRunProgress('cbs',message,true);return}
    renderRunProgress('market','CBS data loaded. Verifying current market odds…');
    if(!dataFreshness(state).market.current){const message='Market odds are stale or unavailable. IQ did not simulate with old odds.';show(message,'red');renderRunProgress('market',message,true);return}
    renderRunProgress('simulation','Inputs are current. Building and stress-testing all four cards…');
    await runSimulation();"""

new_block = """  if(routeParams.get('action')==='refresh-simulate'){
    renderRunProgress('cbs','Refreshing CBS and market data on the mini-PC…');
    try{await triggerMiniPcCbsRefresh()}catch(e){const message='CBS refresh failed: '+e.message;show(message,'red');renderRunProgress('cbs',message,true);return}
    renderRunProgress('market','CBS and market data refreshed. Verifying current inputs…');
    if(!dataFreshness(state).market.current){const message='Fresh market odds were not available after the mini-PC refresh. IQ did not simulate with old odds.';show(message,'red');renderRunProgress('market',message,true);return}
    renderRunProgress('simulation','Inputs are current. Building and stress-testing all four cards…');
    await runSimulation();"""

if old_block in s:
    s = s.replace(old_block, new_block)
elif 'Refreshing CBS and market data on the mini-PC' not in s:
    raise SystemExit('refresh-simulate block not found; refusing partial patch')

if s != old:
    p.write_text(s, encoding='utf-8')
    print('patched')
else:
    print('already patched')
