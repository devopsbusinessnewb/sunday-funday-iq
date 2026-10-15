from pathlib import Path
import re

APP=Path('apps/pickem/index.html')
HOME=Path('index.html')
TEST=Path('tests/pickem-regression.js')

s=APP.read_text(encoding='utf-8')

pattern=r"async function buildFullSlateLabResult\(\)\{[\s\S]*?\n\}\nfunction scenarioGameLocked"
replacement="""async function buildFullSlateLabResult(){
  const games=clone(state.games);
  const saved=state.optimization;
  const completeSaved=saved&&saved.modelBuild===MODEL_BUILD&&['safest','balanced','aggressive','maxUpside'].every(key=>saved.strategies?.[key]?.card&&saved.strategies[key]?.eval);
  if(completeSaved)return{games,result:{strategies:saved.strategies},source:'saved-live-simulation'};
  const baseline=simulationCurrentCard(games);
  const result=runOptimizer(games,state.poolSize,{currentCard:baseline.card,searchIters:SEARCH_ITERS,finalIters:FINAL_ITERS,seed:20260908,fieldModel:state.fieldModel||null,poolPrior:poolHistoryPrior});
  return{games,result,source:'live-rerun'};
}
function scenarioGameLocked"""
s2,n=re.subn(pattern,replacement,s,count=1)
if n!=1: raise SystemExit('Model Lab builder anchor not found')
s=s2

s=s.replace('<h2>Full-Slate Model Lab</h2>','<h2>Live Model Lab</h2>',1)
s=s.replace("Week ${state.week||'—'} · all ${games.length} games temporarily treated as open for model testing. This does not change your live CBS card, saved simulation, locked results, or CBS itself.","Week ${state.week||'—'} · same live slate, locks, field model, and optimizer context used by Home. The headline probabilities should match Home until the underlying inputs change.",1)
s=s.replace("Whether Safest, Balanced, Aggressive, and Max Upside behave as four genuinely different portfolio mandates when the optimizer has a full slate to work with. Each card is shown on its own terms. Cross-strategy pick comparisons belong in a separate comparison view, not inside these cards. Results use the latest stored market/model inputs and are for architecture validation—not a retrospective claim about what should have been picked before kickoff.","Safest, Balanced, Aggressive, and Max Upside are evaluated against the same live simulated field used by Home. Strategy objectives may produce different cards, but the same card must carry the same probabilities everywhere. Cross-strategy pick comparisons belong in the comparison view.",1)
s=s.replace("<div class=\"meta\">SUNDAY FUNDAY IQ · MODEL LAB</div><h2>Building four full-slate portfolios</h2><p class=\"meta\">Unlocking a temporary copy of the slate and testing all four strategy mandates. Your live card is untouched.</p>","<div class=\"meta\">SUNDAY FUNDAY IQ · MODEL LAB</div><h2>Loading the live strategy portfolios</h2><p class=\"meta\">Using the same Week ${state.week||'—'} simulation context shown on Home. No alternate field model or random seed.</p>",1)

APP.write_text(s,encoding='utf-8')

h=HOME.read_text(encoding='utf-8')
h=h.replace('Model Lab · Full Slate','Model Lab · Live Context',1)
HOME.write_text(h,encoding='utf-8')

t=TEST.read_text(encoding='utf-8')
t=t.replace("if(!html.includes('href=\"?lab=1\">Model Lab</a>')||!html.includes('Full-Slate Model Lab'))throw new Error('Full-slate Model Lab UI missing');","if(!html.includes('href=\"?lab=1\">Model Lab</a>')||!html.includes('Live Model Lab'))throw new Error('Live-context Model Lab UI missing');",1)
anchor="if(!html.includes('Tradeoff vs Safest')||!html.includes('Avg score'))throw new Error('Model Lab does not frame average score as a strategy tradeoff');\n"
extra=anchor+"if(!html.includes(\"source:'saved-live-simulation'\")||!html.includes('simulationCurrentCard(games)')||!html.includes('seed:20260908,fieldModel:state.fieldModel||null'))throw new Error('Model Lab is not aligned to the Home live simulation context');\nif(html.includes('temporarily treated as open for model testing'))throw new Error('Model Lab still advertises an alternate unlocked simulation context');\n"
if anchor not in t: raise SystemExit('Regression anchor not found')
t=t.replace(anchor,extra,1)
TEST.write_text(t,encoding='utf-8')

print('patched Model Lab to authoritative live simulation context')
