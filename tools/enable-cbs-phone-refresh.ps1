param()

$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$App=Join-Path $Repo 'apps\pickem\index.html'

Write-Host 'Enabling phone-triggered CBS refresh in Sunday Funday IQ...' -ForegroundColor Cyan

if(-not (Test-Path $App)){ throw "Pickem app not found: $App" }
$text=[IO.File]::ReadAllText($App)

if($text.Contains("const CBS_AUTOMATION_URL='https://eickhoff-server.tail428df5.ts.net';")){
  Write-Host 'Phone refresh is already installed.' -ForegroundColor Green
  exit 0
}

$anchor1="const LIVE_CBS_URL='../../data/live/cbs-pickem.json';"
if(-not $text.Contains($anchor1)){ throw 'Could not find LIVE_CBS_URL anchor. No changes were made.' }
$text=$text.Replace($anchor1,$anchor1+"`r`nconst CBS_AUTOMATION_URL='https://eickhoff-server.tail428df5.ts.net';")

$text=$text.Replace("const MODEL_BUILD='1.15.2';","const MODEL_BUILD='1.16.0';")

$functionAnchor='async function loadPublishedCbs({silent=true,onlyIfNewer=true}={}){'
if(-not $text.Contains($functionAnchor)){ throw 'Could not find loadPublishedCbs anchor. No changes were written.' }

$phoneRefresh=@'
const waitFor=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function triggerMiniPcCbsRefresh(){
  const started=Date.now();
  show('Starting CBS refresh on the mini-PC…');
  const startResponse=await fetch(CBS_AUTOMATION_URL+'/refresh',{method:'POST',cache:'no-store'});
  if(!startResponse.ok)throw new Error('Mini-PC refresh endpoint returned HTTP '+startResponse.status);
  await startResponse.json();
  const statusDeadline=Date.now()+120000;
  while(Date.now()<statusDeadline){
    await waitFor(1800);
    let statusResponse;
    try{statusResponse=await fetch(CBS_AUTOMATION_URL+'/status?v='+Date.now(),{cache:'no-store'})}catch(_){continue}
    if(!statusResponse.ok)continue;
    const status=await statusResponse.json();
    if(status.refreshing){show('Mini-PC is refreshing CBS…');continue}
    const finished=Date.parse(status.lastRefreshFinished||'');
    if(Number.isFinite(finished)&&finished>=started-5000){
      if(status.lastRefreshOk===false)throw new Error(status.lastRefreshError||'Mini-PC CBS refresh failed.');
      if(status.lastRefreshOk===true){
        show('CBS refreshed and pushed. Loading the new data…');
        const publishDeadline=Date.now()+120000;
        while(Date.now()<publishDeadline){
          if(await loadPublishedCbs({silent:true,onlyIfNewer:true})){
            show('CBS refresh complete. Sunday Funday IQ is current.');
            return true;
          }
          await waitFor(2500);
        }
        throw new Error('CBS refreshed successfully, but the published app data is still deploying. Try again in a moment.');
      }
    }
  }
  throw new Error('CBS refresh is taking longer than expected. Check Tailscale and try again.');
}
'@
$text=$text.Replace($functionAnchor,$phoneRefresh+"`r`n"+$functionAnchor)

$oldHandler="$('refreshBtn').onclick=async()=>{const btn=$('refreshBtn');btn.disabled=true;try{await loadPublishedCbs({silent:false,onlyIfNewer:false})}finally{btn.disabled=false}};"
$newHandler="$('refreshBtn').onclick=async()=>{const btn=$('refreshBtn'),label=btn.textContent;btn.disabled=true;btn.textContent='Refreshing CBS…';try{await triggerMiniPcCbsRefresh()}catch(e){console.error(e);show('CBS refresh failed: '+e.message,'red')}finally{btn.disabled=false;btn.textContent=label}};"
if(-not $text.Contains($oldHandler)){ throw 'Could not find Refresh CBS button handler. No changes were written.' }
$text=$text.Replace($oldHandler,$newHandler)

[IO.File]::WriteAllText($App,$text,[Text.UTF8Encoding]::new($false))

$required=@(
  "const MODEL_BUILD='1.16.0';",
  "const CBS_AUTOMATION_URL='https://eickhoff-server.tail428df5.ts.net';",
  'async function triggerMiniPcCbsRefresh()',
  "btn.textContent='Refreshing CBS…'"
)
$check=[IO.File]::ReadAllText($App)
foreach($marker in $required){ if(-not $check.Contains($marker)){ throw "Patched app is missing expected marker: $marker" } }

& git -C $Repo diff --check
if($LASTEXITCODE -ne 0){ throw 'git diff --check failed.' }

$node=Get-Command node -ErrorAction SilentlyContinue
if($node){
  Write-Host 'Running Pickem regression suite before push...'
  & node (Join-Path $Repo 'tests\pickem-regression.js')
  if($LASTEXITCODE -ne 0){ throw 'Pickem regression test failed. Changes were not pushed.' }
  & node (Join-Path $Repo 'tests\pickem-home-regression.js')
  if($LASTEXITCODE -ne 0){ throw 'Pickem home regression test failed. Changes were not pushed.' }
}else{
  Write-Host 'Node is not installed on this mini-PC; GitHub CI will run the full regression suite after push.' -ForegroundColor Yellow
}

& git -C $Repo add 'apps/pickem/index.html'
& git -C $Repo diff --cached --quiet
if($LASTEXITCODE -eq 0){
  Write-Host 'No app changes to commit.' -ForegroundColor Yellow
  exit 0
}

& git -C $Repo commit -m 'Add private mini-PC CBS refresh control'
if($LASTEXITCODE -ne 0){ throw 'Git commit failed.' }
& git -C $Repo push origin main
if($LASTEXITCODE -ne 0){ throw 'Git push failed.' }

Write-Host ''
Write-Host 'Phone-triggered CBS refresh has been published.' -ForegroundColor Green
Write-Host 'Next: wait for GitHub Pages deployment, then test Refresh CBS Data from the iPhone app.' -ForegroundColor Cyan
