from pathlib import Path
import re

APP=Path('apps/pickem/index.html')
HOME=Path('index.html')
app=APP.read_text(encoding='utf-8')
home=HOME.read_text(encoding='utf-8')

app=app.replace("const MODEL_BUILD='1.16.10';","const MODEL_BUILD='1.16.11';",1)
home=home.replace("const MODEL_BUILD='1.16.10';","const MODEL_BUILD='1.16.11';",1)

# Replace the full private-entry parser so no participant identity can live in public source.
pattern=r"function extractMyCardFromStandingsRow\(obj,games\)\{[\s\S]*?\n\}\n\nfunction extractCardFromStandingsSnapshots"
replacement="""function extractMyCardFromStandingsRow(obj,games){
  let entryName='';
  try{entryName=String(localStorage.getItem('sfiqCbsEntryName')||'').trim()}catch{}
  if(!entryName)return null;
  const snaps=(obj?.snapshots||[]).filter(s=>/weekly standings/i.test(String(s?.title||''))||/\\/standings\\/weekly/i.test(String(s?.url||'')));
  const n=games.length,escaped=entryName.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&');
  for(const s of snaps){
    const text=String(s?.text||''),starts=[];
    const nameRx=new RegExp('(?:^|\\\\n)'+escaped+'\\\\n','g');
    let nm;while((nm=nameRx.exec(text))!==null)starts.push(nm.index+(text[nm.index]==='\\n'?1:0));
    for(const pos of starts){
      const chunk=text.slice(pos,Math.min(text.length,pos+5000));
      const pairs=[...chunk.matchAll(/(?:^|\\n)\\s*([A-Z]{2,3})\\s*\\n\\s*\\((\\d{1,2})\\)/g)];
      if(!pairs.length)continue;
      const picks=new Array(n).fill(null),weights=new Array(n).fill(null),usedGames=new Set();
      for(const m of pairs){
        const team=normalizeTeam(m[1]),w=Number(m[2]);
        const i=games.findIndex((g,idx)=>!usedGames.has(idx)&&(g.away===team||g.home===team));
        if(i<0||!Number.isInteger(w)||w<1||w>n)continue;
        picks[i]=team;weights[i]=w;usedGames.add(i);if(usedGames.size===n)break;
      }
      for(let i=0;i<n;i++)if(!picks[i]){const g=games[i];if(isLocked(g)&&sideOf(g)!=null&&Number.isInteger(Number(g.weight))){picks[i]=g.pick;weights[i]=Number(g.weight)}}
      const pc=picks.filter(Boolean).length,wc=weights.filter(v=>v!=null).length;
      if(pc===n&&validConfidence(weights,n))return{picks,weights,pickCount:pc,weightCount:wc,source:'my CBS Weekly Standings row'};
    }
  }
  return null;
}

function extractCardFromStandingsSnapshots"""
app,n=re.subn(pattern,replacement,app,count=1)
if n!=1: raise SystemExit('extractMyCardFromStandingsRow function anchor not found')

anchor="function htmlEscape(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))}\n"
helper=anchor+"""function friendlyRefreshError(error){
  const raw=String(error?.message||error||'').replace(/\\r/g,'');
  if(/complete card|private entry row|SFIQ_CBS_ENTRY_NAME/i.test(raw))return 'CBS has a completed card, but IQ could not identify your private standings row. Fresh pool and market data can still be used; your submitted card comparison is temporarily unavailable.';
  if(/login\\/session appears expired|session.*expired|re-run with --login/i.test(raw))return 'The dedicated CBS session on the mini-PC has expired and needs one re-login.';
  if(/did not respond|timed out|timeout|AbortError/i.test(raw))return 'The mini-PC CBS service did not respond in time. IQ will use the latest published Week data when possible.';
  if(/receiver rejected capture|HTTP Error 400|400: Bad Request/i.test(raw))return 'The mini-PC reached CBS, but the local sanitizer rejected that capture. IQ will use the latest published Week data when possible.';
  const first=raw.split('\\n').map(x=>x.trim()).find(x=>x&&!/^Traceback/i.test(x)&&!/^File \"[A-Z]:\\\\/i.test(x));
  return (first||'CBS refresh could not finish.').slice(0,220);
}
"""
if 'function friendlyRefreshError(' not in app:
    if anchor not in app: raise SystemExit('htmlEscape anchor not found')
    app=app.replace(anchor,helper,1)

needle="  if(!rows.length||rows.length!==state.games.length){view.innerHTML='<h2>Current slate mismatch</h2><p class=\"meta\">The saved strategy does not match this week’s '+state.games.length+'-game slate. Refresh once to rebuild the four cards from the current CBS schedule.</p><div class=\"actions\"><a class=\"btn primary\" href=\"?action=refresh-simulate\">Refresh &amp; rebuild</a><a class=\"btn\" href=\"../../\">Back to strategies</a></div>';return}\n"
while app.count(needle)>1: app=app.replace(needle,'',1)
if app.count(needle)!=1: raise SystemExit('expected exactly one slate mismatch guard')

old="""  $('refreshBtn').onclick=async()=>{const btn=$('refreshBtn'),label=btn.textContent;btn.disabled=true;btn.textContent='Refreshing CBS…';try{await triggerMiniPcCbsRefresh()}catch(e){console.error(e);show('CBS refresh failed: '+e.message,'red')}finally{btn.disabled=false;btn.textContent=label}};
"""
new="""  $('refreshBtn').onclick=async()=>{const btn=$('refreshBtn'),label=btn.textContent;btn.disabled=true;btn.textContent='Refreshing CBS…';try{await triggerMiniPcCbsRefresh()}catch(e){console.error(e);show(friendlyRefreshError(e),'red')}finally{btn.disabled=false;btn.textContent=label}};
"""
if old in app: app=app.replace(old,new,1)
elif "show(friendlyRefreshError(e),'red')" not in app: raise SystemExit('refresh button handler anchor not found')

old2="""    try{await triggerMiniPcCbsRefresh()}catch(e){const message='CBS refresh failed: '+e.message;show(message,'red');renderRunProgress('cbs',message,true);return}
    renderRunProgress('market','CBS and market data refreshed. Verifying current inputs…');
"""
new2="""    try{await triggerMiniPcCbsRefresh()}catch(e){
      console.error(e);
      const warning=friendlyRefreshError(e);
      renderRunProgress('market',warning+' Falling back to the latest published Week data and refreshing market odds…');
      try{await loadPublishedCbs({silent:true,onlyIfNewer:false})}catch{}
      const marketFallback=await refreshMarket(true).catch(()=>false);
      if(!marketFallback){show(warning,'red');renderRunProgress('cbs',warning,true);return}
      renderRunProgress('simulation',warning+' Building provisional strategy cards from the latest published CBS data plus fresh market odds…');
      await runSimulation();
      return;
    }
    renderRunProgress('market','CBS and market data refreshed. Verifying current inputs…');
"""
if old2 in app: app=app.replace(old2,new2,1)
elif 'Building provisional strategy cards from the latest published CBS data plus fresh market odds' not in app: raise SystemExit('refresh-simulate catch anchor not found')

style_anchor=".read{margin-top:13px;padding-top:13px;border-top:1px solid var(--line);font-size:13px;line-height:1.5}.read b{color:var(--accent)}\n"
if '.tiebreaker{' not in home: home=home.replace(style_anchor,style_anchor+".tiebreaker{display:none}.tiebreaker.show{display:block}.tiebreaker strong{font-size:25px}.tiebreaker .status{margin-top:4px}\n",1)
section_anchor='  <section class="panel decision" id="decision" aria-label="Current card and IQ recommendation">'
if 'id="tiebreaker"' not in home:
    idx=home.find(section_anchor)
    if idx<0: raise SystemExit('home decision section anchor not found')
    end=home.find('</section>',idx)+len('</section>')
    home=home[:end]+'\n  <section class="panel tiebreaker" id="tiebreaker" aria-label="Tiebreaker recommendation"><h2>Recommended tiebreaker</h2><strong id="tiebreakerScore">—</strong><div class="status" id="tiebreakerDetail">Based on the current market total for the final scheduled game.</div></section>'+home[end:]
func_anchor="function pct(n,d=1){if(!Number.isFinite(n))return'—';if(n>0&&n<.001)return'<0.1%';return(n*100).toFixed(d)+'%'}\n"
if 'function tiebreakerRecommendation(' not in home: home=home.replace(func_anchor,func_anchor+"function tiebreakerRecommendation(live){const rows=Array.isArray(live?.market)?live.market:[];const g=rows[rows.length-1];const total=Number(g?.total);if(!g||!Number.isFinite(total))return null;return{away:g.away,home:g.home,total,score:Math.round(total)}}\n",1)
render_anchor="  $('week').textContent='Week '+(snapshot.week||'—');\n"
if "const tb=tiebreakerRecommendation(live);" not in home: home=home.replace(render_anchor,render_anchor+"  const tb=tiebreakerRecommendation(live);if(tb){$('tiebreaker').classList.add('show');$('tiebreakerScore').textContent=tb.score+' points';$('tiebreakerDetail').textContent=`${tb.away} @ ${tb.home} · market total ${tb.total}. Same recommendation for all four strategy cards.`}\n",1)

lab_anchor="  const safe=result.strategies.safest;\n"
if "const tbGame=games[games.length-1]" not in app: app=app.replace(lab_anchor,lab_anchor+"  const tbGame=games[games.length-1],tbTotal=Number(tbGame?.total),tbScore=Number.isFinite(tbTotal)?Math.round(tbTotal):null;\n",1)
old_return="return `<a class=\"btn\" href=\"../../\">← Back to CBS Home</a><h2>Live Model Lab</h2><p class=\"meta\">Week ${state.week||'—'} · same live slate, locks, field model, and optimizer context used by Home. The headline probabilities should match Home until the underlying inputs change.</p>"
if old_return in app: app=app.replace(old_return,"return `<a class=\"btn\" href=\"../../\">← Back to CBS Home</a><h2>Live Model Lab</h2><p class=\"meta\">Week ${state.week||'—'} · same live slate, locks, field model, and optimizer context used by Home. The headline probabilities should match Home until the underlying inputs change.</p>${tbScore!=null?`<div class=\"callout\"><b>Recommended tiebreaker: ${tbScore} points</b><div class=\"note\">${htmlEscape(tbGame.away)} @ ${htmlEscape(tbGame.home)} · market total ${tbTotal}. This is one shared tiebreaker recommendation for all four strategies.</div></div>`:''}",1)

APP.write_text(app,encoding='utf-8')
HOME.write_text(home,encoding='utf-8')
print('patched refresh resilience, privacy cleanup, duplicate guard, and tiebreaker output')
