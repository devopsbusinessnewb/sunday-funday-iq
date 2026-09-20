#!/usr/bin/env python3
import json
import subprocess
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'apps/yahoo/index.html').read_text(encoding='utf-8')
assert 'Build 0.4.0' in html
assert 'function recommendations()' in html
assert 'function bestSwap' in html
assert "if(locked(starter))return null" in html
assert "!locked(b)" in html
assert "age<=2?'CURRENT':age<=12?'AGING':'STALE'" in html

js=html.split('<script>',1)[1].rsplit('</script>',1)[0]
js=js.replace("$('refresh').onclick=load;load();", "")
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
    f.write("const document={getElementById:()=>({style:{},className:'',textContent:'',innerHTML:'',onclick:null})};\n")
    f.write(js)
    f.write(r'''
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
data={
 meta:{status:'connected',updatedAt:new Date(Date.now()-13*3600000).toISOString()},
 team:{projection:100},opponent:{projection:110},watch:[],
 lineup:[{slot:'FLEX',name:'Locked Starter',pos:'WR',projection:5,status:'Active',locked:true,gameState:'live',eligiblePositions:['RB','WR','TE']}],
 bench:[{slot:'BN',name:'Bench Star',pos:'WR',projection:20,status:'Active',locked:false,gameState:'upcoming'}]
};
assert(bestSwap(data.lineup[0],data.bench)===null,'locked starter received a swap');
assert(!recommendations().some(x=>/Bench Star over Locked Starter/.test(x.title)),'illegal locked-player recommendation');
assert(freshness().status==='STALE','stale threshold failed');
data.lineup=[{slot:'WR',name:'Open Starter',pos:'WR',projection:5,status:'Active',locked:false,eligiblePositions:['WR']}];
assert(recommendations().some(x=>/Bench Star over Open Starter/.test(x.title)),'eligible unlocked swap was not surfaced');
''')
    path=f.name
subprocess.run(['node','--check',path],check=True)
subprocess.run(['node',path],check=True)

for rel in ['data/live/yahoo.json','data/examples/yahoo-snapshot.example.json']:
    d=json.loads((ROOT/rel).read_text(encoding='utf-8'))
    assert isinstance(d.get('lineup'),list) and isinstance(d.get('bench'),list)
    assert isinstance(d.get('waivers'),list) and isinstance(d.get('watch'),list)
    assert isinstance(d.get('meta'),dict) and 'status' in d['meta']

public=(ROOT/'apps/yahoo/index.html').read_text(encoding='utf-8')+(ROOT/'data/live/yahoo.json').read_text(encoding='utf-8')
low=public.lower()
for forbidden in ['refresh_token','access_token','client_secret','yahoo_client_secret','authorization: bearer']:
    assert forbidden not in low, f'credential marker leaked into public assets: {forbidden}'
print('Yahoo regression checks passed.')

collector=(ROOT/'tools/yahoo-sync.py').read_text(encoding='utf-8')
assert 'DEFAULT_REDIRECT_URI = "https://devopsbusinessnewb.github.io/sunday-funday-iq/oauth/yahoo/"' in collector
assert 'returned_state != state' in collector
assert 'Paste the FULL redirected URL' in collector
callback=(ROOT/'oauth/yahoo/index.html').read_text(encoding='utf-8')
assert 'authorization code' in callback.lower()
assert 'client_secret' not in callback.lower() and 'refresh_token' not in callback.lower() and 'access_token' not in callback.lower()
