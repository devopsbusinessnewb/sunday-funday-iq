from pathlib import Path

APP = Path('apps/pickem/index.html')
HOME = Path('index.html')
TEST = Path('tests/pickem-regression.js')

s = APP.read_text(encoding='utf-8')

s = s.replace("const MODEL_BUILD='1.16.9';", "const MODEL_BUILD='1.16.10';", 1)

css_old = ".scenario-row{display:grid;grid-template-columns:minmax(120px,1fr) 1.4fr 88px;gap:8px;align-items:center;border:1px solid var(--line);background:#091729;border-radius:11px;padding:9px;margin-top:8px}.scenario-picks"
css_new = ".scenario-row{display:grid;grid-template-columns:minmax(120px,1fr) 1.4fr 88px;gap:8px;align-items:center;border:1px solid var(--line);background:#091729;border-radius:11px;padding:9px;margin-top:8px}.scenario-row.locked{border-color:#65541b;background:#17190f}.scenario-row.locked .scenario-note{color:#ffe49a}.scenario-pick:disabled,.scenario-conf:disabled{opacity:.62;cursor:not-allowed}.scenario-picks"
if css_old not in s:
    raise SystemExit('scenario CSS anchor not found')
s = s.replace(css_old, css_new, 1)

lab_button_old = '<a class="btn" href="?scenario=${encodeURIComponent(key)}">Experiment with this card</a>'
lab_button_new = '<a class="btn" href="?scenario=${encodeURIComponent(key)}">Open live Scenario Lab</a>'
if lab_button_old not in s:
    raise SystemExit('Model Lab scenario button anchor not found')
s = s.replace(lab_button_old, lab_button_new)

full_lab = """async function buildFullSlateLabResult(){
  const games=fullSlateLabGames(state.games);
  let current=ensureValidCard(cardFromGames(games),games.length);
  if(!completeCard(games))current=safestExpectedCard(games,current);
  const result=runOptimizer(games,state.poolSize,{currentCard:current,searchIters:SEARCH_ITERS,finalIters:FINAL_ITERS,seed:20261313,fieldModel:null,poolPrior:poolHistoryPrior});
  return{games,result};
}
"""
live_lab = full_lab + """function scenarioGameLocked(g){return !!(g?.locked||g?.completed)}
async function buildLiveScenarioResult(){
  const games=clone(state.games);
  let current=ensureValidCard(cardFromGames(games),games.length);
  if(!completeCard(games))current=safestExpectedCard(games,current);
  const result=runOptimizer(games,state.poolSize,{currentCard:current,searchIters:SEARCH_ITERS,finalIters:FINAL_ITERS,seed:20260908,fieldModel:state.fieldModel||null,poolPrior:poolHistoryPrior});
  return{games,result};
}
"""
if full_lab not in s:
    raise SystemExit('full-slate helper anchor not found')
s = s.replace(full_lab, live_lab, 1)

old_intro = "view.innerHTML=`<a class=\"btn\" href=\"?lab=1\">← Model Lab</a><h2>Scenario Lab · ${labels[key]}</h2><p class=\"meta\">Change any winner or confidence value. Results update automatically against the exact same simulated field. Nothing here changes CBS or your saved model cards.</p>"
new_intro = "view.innerHTML=`<a class=\"btn\" href=\"?lab=1\">← Model Lab</a><h2>Scenario Lab · ${labels[key]}</h2><p class=\"meta\">Change any unlocked winner or confidence value. Completed and CBS-locked games stay frozen exactly as they are in the live week. Results update automatically against the exact same simulated field. Nothing here changes CBS or your saved model cards.</p>"
if old_intro not in s:
    raise SystemExit('Scenario Lab intro anchor not found')
s = s.replace(old_intro, new_intro, 1)

old_rows = "${rows.map(({g,i})=>`<div class=\"scenario-row\"><div><b>${htmlEscape(g.away)} @ ${htmlEscape(g.home)}</b><div class=\"scenario-note\">CBS ${g.awayPct}% / ${g.homePct}%</div></div><div class=\"scenario-picks\"><button type=\"button\" class=\"scenario-pick ${scenarioCard.choices[i]===0?'selected':''}\" data-pick-index=\"${i}\" data-side=\"0\">${htmlEscape(g.away)}</button><button type=\"button\" class=\"scenario-pick ${scenarioCard.choices[i]===1?'selected':''}\" data-pick-index=\"${i}\" data-side=\"1\">${htmlEscape(g.home)}</button></div><select class=\"scenario-conf\" data-conf-index=\"${i}\">${Array.from({length:games.length},(_,j)=>j+1).map(v=>`<option value=\"${v}\" ${scenarioCard.weights[i]===v?'selected':''}>${v} pts</option>`).join('')}</select></div>`).join('')}"
new_rows = "${rows.map(({g,i})=>{const locked=scenarioGameLocked(g);return `<div class=\"scenario-row ${locked?'locked':''}\"><div><b>${htmlEscape(g.away)} @ ${htmlEscape(g.home)}</b><div class=\"scenario-note\">CBS ${g.awayPct}% / ${g.homePct}%${locked?` · LOCKED${g.statusText?' · '+htmlEscape(g.statusText):''}`:''}</div></div><div class=\"scenario-picks\"><button type=\"button\" class=\"scenario-pick ${scenarioCard.choices[i]===0?'selected':''}\" data-pick-index=\"${i}\" data-side=\"0\" ${locked?'disabled aria-disabled=\"true\"':''}>${htmlEscape(g.away)}</button><button type=\"button\" class=\"scenario-pick ${scenarioCard.choices[i]===1?'selected':''}\" data-pick-index=\"${i}\" data-side=\"1\" ${locked?'disabled aria-disabled=\"true\"':''}>${htmlEscape(g.home)}</button></div><select class=\"scenario-conf\" data-conf-index=\"${i}\" ${locked?'disabled aria-disabled=\"true\"':''}>${Array.from({length:games.length},(_,j)=>j+1).map(v=>`<option value=\"${v}\" ${scenarioCard.weights[i]===v?'selected':''}>${v} pts</option>`).join('')}</select></div>`}).join('')}"
if old_rows not in s:
    raise SystemExit('Scenario Lab rows anchor not found')
s = s.replace(old_rows, new_rows, 1)

old_run = "try{const x=await buildFullSlateLabResult();document.body.classList.remove('run-mode');renderScenarioEditor(key,x.result,x.games)}"
new_run = "try{const x=await buildLiveScenarioResult();document.body.classList.remove('run-mode');renderScenarioEditor(key,x.result,x.games)}"
if old_run not in s:
    raise SystemExit('runScenarioLab anchor not found')
s = s.replace(old_run, new_run, 1)

export_anchor = 'globalThis.SFIQ_TEST={'
if export_anchor not in s:
    raise SystemExit('test export anchor missing')
s = s.replace(export_anchor, 'globalThis.SFIQ_TEST={scenarioGameLocked,buildLiveScenarioResult,', 1)

APP.write_text(s, encoding='utf-8')

h = HOME.read_text(encoding='utf-8')
h = h.replace("const MODEL_BUILD='1.16.9';", "const MODEL_BUILD='1.16.10';", 1)
HOME.write_text(h, encoding='utf-8')

t = TEST.read_text(encoding='utf-8')
needle = "const swapCard={choices:[0,1,0],weights:[1,2,3]};\n"
insert = "const swapCard={choices:[0,1,0],weights:[1,2,3]};\nif(typeof t.scenarioGameLocked!=='function')throw new Error('Scenario lock helper missing');\nif(!t.scenarioGameLocked({locked:true,completed:false})||!t.scenarioGameLocked({locked:false,completed:true})||t.scenarioGameLocked({locked:false,completed:false}))throw new Error('Scenario Lab does not preserve completed/locked games');\nif(!html.includes('Completed and CBS-locked games stay frozen')||!html.includes('buildLiveScenarioResult()')||!html.includes('disabled aria-disabled=\\\"true\\\"'))throw new Error('Scenario Lab is not wired to live locked-week behavior');\n"
if needle not in t:
    raise SystemExit('regression insertion anchor not found')
t = t.replace(needle, insert, 1)
TEST.write_text(t, encoding='utf-8')

print('patched live Scenario Lab locking + build 1.16.10')
