from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="const published=Date.parse(live?.exportedAt||''),stale=!Number.isFinite(ran)||now-ran>12*3600e3||now<ran||cbs>ran||market>ran||published>ran||live?.unavailable;"
new="const stale=!Number.isFinite(ran)||now-ran>12*3600e3||now<ran||cbs>ran||market>ran||live?.unavailable;"
if new in s:
    print('home freshness policy already patched')
elif old in s:
    s=s.replace(old,new,1)
    p.write_text(s,encoding='utf-8')
    print('patched home freshness: backend publication alone no longer invalidates simulation')
else:
    raise SystemExit('home freshness anchor not found')
