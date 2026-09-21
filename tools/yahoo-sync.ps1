param([switch]$Publish,[switch]$ResetAuth,[int]$Season=2026,[int]$Week=0)
$ErrorActionPreference='Stop'
$RepoRoot=Split-Path -Parent $PSScriptRoot
$PrivateDir=Join-Path $env:USERPROFILE '.sunday-funday-iq'
$CredPath=Join-Path $PrivateDir 'yahoo-credentials.json'
$TokenPath=Join-Path $PrivateDir 'yahoo-oauth.json'
$OutputPath=Join-Path $RepoRoot 'data\live\yahoo.json'
$RedirectUri='https://devopsbusinessnewb.github.io/sunday-funday-iq/oauth/yahoo/'
$AuthUrl='https://api.login.yahoo.com/oauth2/request_auth'
$TokenUrl='https://api.login.yahoo.com/oauth2/get_token'
$ApiBase='https://fantasysports.yahooapis.com/fantasy/v2'

function SecureToPlain([Security.SecureString]$s){$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}}
function ProtectText([string]$t){ConvertTo-SecureString $t -AsPlainText -Force|ConvertFrom-SecureString}
function UnprotectText([string]$c){SecureToPlain (ConvertTo-SecureString $c)}
function Reset-Auth{
 if(Test-Path $CredPath){Remove-Item $CredPath -Force}
 if(Test-Path $TokenPath){Remove-Item $TokenPath -Force}
 Write-Host 'Yahoo local credentials and tokens cleared. The next run will prompt for the new app credentials.' -ForegroundColor Yellow
}
function Save-Credentials{
 New-Item -ItemType Directory -Force -Path $PrivateDir|Out-Null
 Write-Host 'Yahoo first-time setup' -ForegroundColor Cyan
 $id=Read-Host 'Paste the Client ID'
 $sec=SecureToPlain (Read-Host 'Paste the Client Secret (hidden)' -AsSecureString)
 if([string]::IsNullOrWhiteSpace($id)-or[string]::IsNullOrWhiteSpace($sec)){throw 'Client ID and Client Secret are required.'}
 @{clientId=$id.Trim();clientSecret=ProtectText $sec;redirectUri=$RedirectUri}|ConvertTo-Json|Set-Content -Encoding UTF8 $CredPath
}
function Get-Credentials{
 if($ResetAuth){Reset-Auth; return}
if(-not(Test-Path $CredPath)){Save-Credentials}
 $c=Get-Content $CredPath -Raw|ConvertFrom-Json
 @{ClientId=[string]$c.clientId;ClientSecret=UnprotectText([string]$c.clientSecret)}
}
function Save-Tokens($t){
 New-Item -ItemType Directory -Force -Path $PrivateDir|Out-Null
 $old=$null;if(Test-Path $TokenPath){$old=Get-Content $TokenPath -Raw|ConvertFrom-Json}
 $r=[string]$t.refresh_token;if([string]::IsNullOrWhiteSpace($r)-and$old){$r=UnprotectText([string]$old.refreshToken)}
 $exp=if($t.expires_in){[int]$t.expires_in}else{3600}
 @{accessToken=ProtectText([string]$t.access_token);refreshToken=ProtectText $r;expiresAt=[DateTimeOffset]::UtcNow.AddSeconds($exp-60).ToUnixTimeSeconds()}|ConvertTo-Json|Set-Content -Encoding UTF8 $TokenPath
}
function Invoke-Token([hashtable]$body){
 $c=Get-Credentials
 $basic=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($c.ClientId):$($c.ClientSecret)"))
 Invoke-RestMethod -Method Post -Uri $TokenUrl -Headers @{Authorization="Basic $basic"} -ContentType 'application/x-www-form-urlencoded' -Body $body
}
function Authorize-Yahoo{
 Add-Type -AssemblyName System.Web
 $c=Get-Credentials
 $bytes=New-Object byte[] 18;$rng=New-Object Security.Cryptography.RNGCryptoServiceProvider;try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
 $state=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
 $qs=[Web.HttpUtility]::ParseQueryString('');$qs['client_id']=$c.ClientId;$qs['redirect_uri']=$RedirectUri;$qs['response_type']='code';$qs['state']=$state;$qs['language']='en-us'
 $url=$AuthUrl+'?'+$qs.ToString()
 Write-Host 'Opening Yahoo authorization...' -ForegroundColor Cyan
 Start-Process $url
 $redirected=Read-Host 'After approval, paste the FULL URL from the browser address bar'
 if([string]::IsNullOrWhiteSpace($redirected)){throw 'No redirected URL supplied.'}
 $u=[Uri]$redirected;$q=[Web.HttpUtility]::ParseQueryString($u.Query)
 if($q['error']){throw "Yahoo returned $($q['error'])"};if(-not$q['code']){throw 'No authorization code found.'};if($q['state']-ne$state){throw 'OAuth state mismatch.'}
 Save-Tokens (Invoke-Token @{grant_type='authorization_code';redirect_uri=$RedirectUri;code=$q['code']})
 Write-Host 'Yahoo authorization saved privately.' -ForegroundColor Green
}
function Get-AccessToken{
 if(-not(Test-Path $TokenPath)){Authorize-Yahoo}
 $t=Get-Content $TokenPath -Raw|ConvertFrom-Json
 if([long]$t.expiresAt -gt [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()){return UnprotectText([string]$t.accessToken)}
 $r=UnprotectText([string]$t.refreshToken)
 Save-Tokens ($n=Invoke-Token @{grant_type='refresh_token';redirect_uri=$RedirectUri;refresh_token=$r});[string]$n.access_token
}
function Invoke-YahooXml([string]$path){$tok=Get-AccessToken;[xml](Invoke-WebRequest -UseBasicParsing -Uri "$ApiBase/$path" -Headers @{Authorization="Bearer $tok";Accept='application/xml'}).Content}
function Txt($node,[string]$name){if(-not$node){return $null};$n=$node.SelectSingleNode(".//*[local-name()='$name']");if($n){[string]$n.InnerText}else{$null}}
function Flt($v){$x=0.0;if([double]::TryParse([string]$v,[ref]$x)){$x}else{$null}}
function Intv($v){$x=0;if([int]::TryParse([string]$v,[ref]$x)){$x}else{$null}}
function Discover-TeamKey{
 $x=Invoke-YahooXml 'users;use_login=1/games;game_keys=nfl/teams'
 $items=@();foreach($t in $x.SelectNodes("//*[local-name()='team']")){$k=Txt $t 'team_key';if($k){$items+=[pscustomobject]@{Key=$k;Name=Txt $t 'name'}}}
 $items=@($items|Sort-Object Key -Unique);if($items.Count-eq0){throw 'No Yahoo fantasy football teams returned.'}
 if($items.Count-gt1){for($i=0;$i-lt$items.Count;$i++){Write-Host "[$($i+1)] $($items[$i].Name)  $($items[$i].Key)"};$p=[int](Read-Host 'Choose the team number');return $items[$p-1].Key}
 $items[0].Key
}
function Build-Snapshot{
 $teamKey=$env:YAHOO_TEAM_KEY;if([string]::IsNullOrWhiteSpace($teamKey)){$teamKey=Discover-TeamKey}
 $m=[regex]::Match($teamKey,'^(.+?\.l\.\d+)\.t\.\d+$');if(-not$m.Success){throw 'Could not derive league key.'};$leagueKey=$m.Groups[1].Value
 $teamXml=Invoke-YahooXml "team/$teamKey";$settings=Invoke-YahooXml "league/$leagueKey/settings";$standings=Invoke-YahooXml "league/$leagueKey/standings"
 if($Week-le0){$cw=Txt $settings 'current_week';$script:Week=if($cw){[int]$cw}else{1}}
 $score=Invoke-YahooXml "league/$leagueKey/scoreboard;week=$Week";$roster=Invoke-YahooXml "team/$teamKey/roster;week=$Week/players"
 $teamNode=$teamXml.SelectNodes("//*[local-name()='team']")|Where-Object{(Txt $_ 'team_key')-eq$teamKey}|Select-Object -First 1
 $standing=$standings.SelectNodes("//*[local-name()='team']")|Where-Object{(Txt $_ 'team_key')-eq$teamKey}|Select-Object -First 1
 $mine=$null;$opp=$null;foreach($mu in $score.SelectNodes("//*[local-name()='matchup']")){$ts=@($mu.SelectNodes(".//*[local-name()='team']"));if(@($ts|ForEach-Object{Txt $_ 'team_key'})-contains$teamKey){$mine=$ts|Where-Object{(Txt $_ 'team_key')-eq$teamKey}|Select-Object -First 1;$opp=$ts|Where-Object{(Txt $_ 'team_key')-ne$teamKey}|Select-Object -First 1;break}}
 $players=@();foreach($p in $roster.SelectNodes("//*[local-name()='player']")){$sel=$p.SelectSingleNode(".//*[local-name()='selected_position']");$slot=if($sel){Txt $sel 'position'}else{'BN'};$eligible=@($p.SelectNodes(".//*[local-name()='eligible_positions']/*[local-name()='position']")|ForEach-Object{$_.InnerText});$status=Txt $p 'status';if(-not$status){$status=Txt $p 'injury_note'};if(-not$status){$status='Active'};$gs=Txt $p 'game_status';if(-not$gs){$gs=Txt $p 'display_status'};if(-not$gs){$gs='upcoming'};$locked=((Txt $p 'is_editable')-eq'0'-or$gs-match'live|final|completed|in progress');$nameNode=$p.SelectSingleNode(".//*[local-name()='name']");$projNode=$p.SelectSingleNode(".//*[local-name()='player_projected_points']");$ptsNode=$p.SelectSingleNode(".//*[local-name()='player_points']");$players+=[pscustomobject]@{playerKey=Txt $p 'player_key';slot=$slot;name=Txt $nameNode 'full';pos=((Txt $p 'display_position')-split',')[0];nflTeam=Txt $p 'editorial_team_abbr';status=$status;projection=Flt(Txt $projNode 'total');points=Flt(Txt $ptsNode 'total');gameState=$gs;locked=[bool]$locked;eligiblePositions=$eligible}}
 $benchSlots=@('BN','IR','IL','IL+');$lineup=@($players|Where-Object{$benchSlots-notcontains$_.slot});$bench=@($players|Where-Object{$benchSlots-contains$_.slot})
 $wins=Intv(Txt $standing 'wins');$losses=Intv(Txt $standing 'losses');$ties=Intv(Txt $standing 'ties');$record="$wins-$losses";if($ties-gt0){$record+="-$ties"}
 $usesFaab=(Txt $settings 'uses_faab')-eq'1';$faab=Flt(Txt $standing 'faab_balance');if($null-eq$faab){$faab=Flt(Txt $teamNode 'faab_balance')}
 $watch=@();foreach($p in $lineup){if($p.locked){continue};if($p.status-match'Out|Injured Reserve|\bIR\b|Doubtful|Inactive|Suspended'){$watch+=[pscustomobject]@{priority='high';title="$($p.name) needs attention";detail="Starting $($p.slot) is listed $($p.status)."}}elseif($p.status-match'Questionable|Game.?Time|Limited'){$watch+=[pscustomobject]@{priority='medium';title="Monitor $($p.name)";detail="Starting $($p.slot) is listed $($p.status)."}}}
 [ordered]@{meta=[ordered]@{source='Yahoo Fantasy API';status='connected';updatedAt=[DateTime]::UtcNow.ToString('o');season=$Season;week=$Week;contractVersion=1};league=[ordered]@{key=$leagueKey;name=Txt $settings 'name';teamCount=Intv(Txt $settings 'num_teams');scoring=Txt $settings 'scoring_type';waivers=if($usesFaab){'FAAB'}else{Txt $settings 'waiver_rule'};faabBudget=$null};team=[ordered]@{key=$teamKey;name=Txt $teamNode 'name';record=$record;standing=Intv(Txt $standing 'rank');faabRemaining=$faab;score=Flt(Txt ($mine.SelectSingleNode(".//*[local-name()='team_points']")) 'total');projection=Flt(Txt ($mine.SelectSingleNode(".//*[local-name()='team_projected_points']")) 'total')};opponent=[ordered]@{key=if($opp){Txt $opp 'team_key'}else{$null};name=if($opp){Txt $opp 'name'}else{'Opponent'};score=if($opp){Flt(Txt ($opp.SelectSingleNode(".//*[local-name()='team_points']")) 'total')}else{0};projection=if($opp){Flt(Txt ($opp.SelectSingleNode(".//*[local-name()='team_projected_points']")) 'total')}else{$null}};lineup=$lineup;bench=$bench;waivers=@();watch=$watch}
}
function Assert-Safe([string]$json){foreach($w in @('access_token','refresh_token','client_secret','authorization','cookie','oauth_token')){if($json.ToLower().Contains($w)){throw "Forbidden public field: $w"}}}
function Publish-Snapshot{Push-Location $RepoRoot;try{git pull --rebase --autostash origin main;if($LASTEXITCODE-ne0){throw 'git pull failed'};git add data/live/yahoo.json;git diff --cached --quiet;if($LASTEXITCODE-eq0){Write-Host 'No snapshot change to publish.';return};git commit -m "Update Yahoo live snapshot week $Week";git push origin main;if($LASTEXITCODE-ne0){throw 'git push failed'};Write-Host 'Yahoo snapshot pushed to main.' -ForegroundColor Green}finally{Pop-Location}}
if(-not(Test-Path $CredPath)){Save-Credentials}
if(-not(Test-Path $TokenPath)){Authorize-Yahoo}
$s=Build-Snapshot;$json=$s|ConvertTo-Json -Depth 8;Assert-Safe $json;Set-Content -Encoding UTF8 $OutputPath $json
Write-Host "Yahoo sync succeeded for week $Week." -ForegroundColor Green
if($Publish){Publish-Snapshot}
