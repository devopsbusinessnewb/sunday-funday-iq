#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const TEAM_ALIASES={JAC:'JAX',LA:'LAR',WSH:'WAS'};
const TEAM=/^[A-Z]{2,3}$/;
const RANK=/^(\d+)(?:st|nd|rd|th)$/i;

function normalizeTeam(value){
  const team=String(value||'').trim().toUpperCase();
  return TEAM_ALIASES[team]||team;
}

function canonicalLines(text){
  return String(text||'').replace(/\r/g,'').replace(/\t/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
}

function median(values){
  const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);
  return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null;
}

function stableEntryId(pool,name){
  if(/Tony Eickhoff/i.test(name))return'ME';
  return'entry-'+crypto.createHash('sha256').update(`${pool}|${String(name).trim().toLowerCase()}`).digest('hex').slice(0,12);
}

function parseHeader(lines){
  const firstRank=lines.findIndex(x=>RANK.test(x));
  if(firstRank<0)throw new Error('No ranked standings rows were found. Capture the Weekly Standings table after it loads.');
  const games=[];
  for(let i=0;i<firstRank;i++){
    if(!/^(?:FINAL|(?:WED|THU|FRI|SAT|SUN|MON)\b)/i.test(lines[i]))continue;
    const away=normalizeTeam(lines[i+1]),home=normalizeTeam(lines[i+2]);
    if(!TEAM.test(away)||!TEAM.test(home))continue;
    let awayScore=null,homeScore=null;
    if(/^\d+$/.test(lines[i+3]||'')&&/^\d+$/.test(lines[i+4]||'')){
      awayScore=Number(lines[i+3]);homeScore=Number(lines[i+4]);
    }
    games.push({key:`${away}@${home}`,away,home,awayScore,homeScore,winner:awayScore==null||homeScore==null||awayScore===homeScore?null:(awayScore>homeScore?away:home)});
  }
  const unique=[];const seen=new Set();
  for(const game of games)if(!seen.has(game.key)){seen.add(game.key);unique.push(game)}
  if(!unique.length)throw new Error('No matchup headers were found in the Weekly Standings capture.');
  return{games:unique,firstRank};
}

function parseRows(lines,firstRank,games,pool,includeNames=false){
  const starts=[];
  for(let i=firstRank;i<lines.length;i++)if(RANK.test(lines[i]))starts.push(i);
  const entries=[];
  for(let r=0;r<starts.length;r++){
    const chunk=lines.slice(starts[r],starts[r+1]||lines.length);
    const rank=Number((chunk[0].match(RANK)||[])[1]);
    const name=chunk[1]||'';
    if(!rank||!name)continue;
    const firstSelection=chunk.findIndex((value,i)=>i>=2&&(value==='-'||(TEAM.test(normalizeTeam(value))&&/^\(\d{1,2}\)$/.test(chunk[i+1]||''))));
    if(firstSelection<0)continue;
    const scoreValues=chunk.slice(2,firstSelection).filter(x=>/^\d+$/.test(x)).map(Number);
    const card={},missingPicks={};
    let gameIndex=0;
    for(let i=firstSelection;i<chunk.length&&gameIndex<games.length;i++){
      const value=chunk[i],weightMatch=String(chunk[i+1]||'').match(/^\((\d{1,2})\)$/),game=games[gameIndex];
      if(value==='-'){
        missingPicks[game.key]={confidence:weightMatch?Number(weightMatch[1]):null};
        gameIndex++;if(weightMatch)i++;
        continue;
      }
      const team=normalizeTeam(value);
      if(!TEAM.test(team)||!weightMatch)continue;
      if(team!==game.away&&team!==game.home)continue;
      card[game.key]={team,confidence:Number(weightMatch[1])};
      gameIndex++;i++;
    }
    entries.push({
      entryId:stableEntryId(pool,name),
      ...(includeNames?{name}:{}),
      isMine:/Tony Eickhoff/i.test(name),
      rank,
      weeklyPoints:scoreValues[0]??null,
      seasonPoints:scoreValues[1]??null,
      card,
      missingPicks
    });
  }
  if(!entries.length)throw new Error('No participant rows with picks were found in the standings capture.');
  return entries;
}

function analyzeArchive(archive){
  const accountedEntries=archive.entries.filter(e=>Object.keys(e.card).length+Object.keys(e.missingPicks||{}).length===archive.games.length);
  const completeEntries=archive.entries.filter(e=>Object.keys(e.card).length===archive.games.length);
  const gameMetrics={};
  for(const game of archive.games){
    const observations=accountedEntries.map(e=>e.card[game.key]).filter(Boolean),teams={};
    for(const team of [game.away,game.home]){
      const selected=observations.filter(x=>x.team===team),weights=selected.map(x=>x.confidence);
      teams[team]={count:selected.length,pickShare:observations.length?selected.length/observations.length:null,confidence:{mean:weights.length?weights.reduce((a,b)=>a+b,0)/weights.length:null,median:median(weights),min:weights.length?Math.min(...weights):null,max:weights.length?Math.max(...weights):null}};
    }
    gameMetrics[game.key]={observedEntries:observations.length,missingEntries:accountedEntries.length-observations.length,submissionRate:accountedEntries.length?observations.length/accountedEntries.length:null,winner:game.winner,teams};
  }
  const standings=[...archive.entries].filter(e=>Number.isFinite(e.weeklyPoints)).sort((a,b)=>b.weeklyPoints-a.weeklyPoints||a.rank-b.rank);
  return{
    observedEntries:archive.entries.length,
    accountedEntries:accountedEntries.length,
    completeEntries:completeEntries.length,
    completeness:archive.entries.length?accountedEntries.length/archive.entries.length:0,
    winnerScore:standings[0]?.weeklyPoints??null,
    top2Cutoff:standings[1]?.weeklyPoints??null,
    gameMetrics
  };
}

function validateArchive(archive,{requireComplete=false}={}){
  const errors=[],n=archive.games.length;
  if(!n)errors.push('No games');
  if(!archive.entries.length)errors.push('No entries');
  const keys=new Set(archive.games.map(g=>g.key));
  for(const entry of archive.entries){
    const cardKeys=Object.keys(entry.card),missingKeys=Object.keys(entry.missingPicks||{}),accountedKeys=[...cardKeys,...missingKeys];
    for(const key of cardKeys)if(!keys.has(key))errors.push(`${entry.entryId}: unknown game ${key}`);
    for(const key of missingKeys)if(!keys.has(key))errors.push(`${entry.entryId}: unknown missing-pick game ${key}`);
    if(new Set(accountedKeys).size!==accountedKeys.length)errors.push(`${entry.entryId}: game is both picked and missing`);
    const weights=[...cardKeys.map(k=>entry.card[k].confidence),...missingKeys.map(k=>entry.missingPicks[k].confidence).filter(Number.isInteger)];
    if(new Set(weights).size!==weights.length)errors.push(`${entry.entryId}: duplicate confidence value`);
    if(weights.some(w=>!Number.isInteger(w)||w<1||w>n))errors.push(`${entry.entryId}: invalid confidence value`);
    if(requireComplete&&accountedKeys.length!==n)errors.push(`${entry.entryId}: only ${accountedKeys.length}/${n} game slots captured`);
    if(accountedKeys.length===n){
      const sorted=[...weights].sort((a,b)=>a-b);
      if(weights.length===n&&sorted.some((w,i)=>w!==i+1))errors.push(`${entry.entryId}: confidence values are not exactly 1–${n}`);
      if(archive.games.every(g=>g.winner)&&Number.isFinite(entry.weeklyPoints)){
        const calculated=archive.games.reduce((sum,g)=>sum+(entry.card[g.key]?.team===g.winner?entry.card[g.key].confidence:0),0);
        if(calculated!==entry.weeklyPoints)errors.push(`${entry.entryId}: CBS score ${entry.weeklyPoints} does not match calculated ${calculated}`);
      }
    }
  }
  return{valid:errors.length===0,errors};
}

function buildArchive(scan,{week,includeNames=false,requireComplete=false}={}){
  const candidates=(scan.snapshots||[]).filter(s=>/weekly standings/i.test(`${s.title||''} ${s.url||''}`));
  if(!candidates.length)throw new Error('The scan does not contain a Weekly Standings snapshot.');
  const scored=candidates.map(s=>{
    const texts=Array.isArray(s.views)&&s.views.length?s.views.map(v=>v.text):[s.text];
    const lines=texts.flatMap(canonicalLines);
    return{snapshot:s,texts,lines,pairs:texts.reduce((sum,text)=>sum+(String(text||'').match(/\(\d{1,2}\)/g)||[]).length,0)};
  }).sort((a,b)=>b.pairs-a.pairs);
  const selected=week?scored.find(x=>x.lines.some(v=>new RegExp(`^Week\\s+${week}$`,'i').test(v))):scored[0];
  if(!selected)throw new Error(`No Weekly Standings snapshot for Week ${week} was found.`);
  const weekNo=week||Number((selected.lines.find(x=>/^Week\s+\d+$/i.test(x))||'').match(/\d+/)?.[0]);
  const pool=String(selected.snapshot.title||'').split('|')[0].trim()||scan.pool||'CBS Pick’em Pool';
  const gameMap=new Map(),entryMap=new Map(),viewErrors=[];
  for(const text of selected.texts){
    const lines=canonicalLines(text);
    try{
      const {games,firstRank}=parseHeader(lines),entries=parseRows(lines,firstRank,games,pool,includeNames);
      for(const game of games){
        const prior=gameMap.get(game.key);
        gameMap.set(game.key,prior?.winner&&!game.winner?prior:game);
      }
      for(const entry of entries){
        const prior=entryMap.get(entry.entryId);
        if(!prior)entryMap.set(entry.entryId,entry);
        else entryMap.set(entry.entryId,{...prior,...entry,card:{...prior.card,...entry.card},missingPicks:{...(prior.missingPicks||{}),...(entry.missingPicks||{})},weeklyPoints:entry.weeklyPoints??prior.weeklyPoints,seasonPoints:entry.seasonPoints??prior.seasonPoints});
      }
    }catch(error){viewErrors.push(error.message)}
  }
  const games=[...gameMap.values()],entries=[...entryMap.values()];
  if(!games.length||!entries.length)throw new Error(`The full-table capture could not be parsed.${viewErrors.length?' '+viewErrors[0]:''}`);
  const archive={schemaVersion:1,product:'Sunday Funday IQ CBS Pool Archive',season:Number(scan.season)||new Date(selected.snapshot.ts||scan.exportedAt||Date.now()).getUTCFullYear(),week:weekNo||null,pool,poolSize:entries.length,capturedAt:selected.snapshot.ts||scan.exportedAt||new Date().toISOString(),source:'CBS Weekly Standings',privacy:includeNames?'Participant names included by explicit request.':'Participant names removed; stable anonymous IDs preserve cross-week behavior.',games,entries};
  archive.analytics=analyzeArchive(archive);
  const validation=validateArchive(archive,{requireComplete});
  archive.validation={...validation,requireComplete};
  if(!validation.valid)throw new Error(`Pool archive validation failed:\n- ${validation.errors.join('\n- ')}`);
  return archive;
}

function usage(){console.error('Usage: node tools/cbs-pool-archive.js <bridge-scan.json> [--week N] [--out archive.json] [--allow-partial] [--include-names]')}

if(require.main===module){
  const args=process.argv.slice(2),input=args[0];
  if(!input){usage();process.exit(2)}
  const value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:null};
  try{
    const scan=JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));
    const archive=buildArchive(scan,{week:Number(value('--week'))||undefined,includeNames:args.includes('--include-names'),requireComplete:!args.includes('--allow-partial')});
    const out=value('--out');
    if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(path.resolve(out),JSON.stringify(archive,null,2)+'\n');console.log(`Saved ${archive.entries.length} entries and ${archive.games.length} games to ${out}`)}
    else console.log(JSON.stringify(archive,null,2));
  }catch(error){console.error(error.message);process.exit(1)}
}

module.exports={normalizeTeam,canonicalLines,parseHeader,parseRows,buildArchive,analyzeArchive,validateArchive};
