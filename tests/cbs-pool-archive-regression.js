'use strict';

const {buildArchive,validateArchive}=require('../tools/cbs-pool-archive.js');
const {summarizeHistory}=require('../tools/cbs-pool-report.js');

const text=`NFL Football Tourney 2026
Weekly
Overall
Week 2
PLAYERS
PTS
YTD
FINAL
ATL
GB
10
30
FINAL
LAC
BUF
17
24
FINAL
CAR
CLE
21
14
FINAL
NYJ
DET
13
27
1st
Adam Jolly
10
110
GB
(4)
BUF
(3)
CAR
(2)
DET
(1)
2nd
Tony Eickhoff
8
100
GB
(4)
BUF
(3)
CLE
(2)
DET
(1)
3rd
Marek Turley
5
95
ATL
(4)
BUF
(3)
CAR
(2)
NYJ
(1)`;

const scan={season:2026,exportedAt:'2026-09-24T22:30:00Z',snapshots:[{title:'NFL Football Tourney 2026 | Weekly Standings',url:'https://picks.cbssports.com/football/pickem/pools/test/standings/weekly',ts:'2026-09-24T22:30:00Z',text}]};
const archive=buildArchive(scan,{week:2,requireComplete:true});

if(archive.games.length!==4||archive.entries.length!==3)throw new Error('Expected 4 games and 3 entries');
if(archive.entries.some(e=>'name'in e))throw new Error('Participant names must be removed by default');
if(archive.entries.find(e=>e.isMine)?.entryId!=='ME')throw new Error('User entry was not identified');
if(archive.analytics.top2Cutoff!==8||archive.analytics.winnerScore!==10)throw new Error('Weekly cutoffs are incorrect');
if(archive.analytics.gameMetrics['CAR@CLE'].teams.CAR.pickShare!==2/3)throw new Error('Pool pick share is incorrect');
if(archive.analytics.gameMetrics['ATL@GB'].teams.GB.confidence.mean!==4)throw new Error('Confidence distribution is incorrect');
if(!validateArchive(archive,{requireComplete:true}).valid)throw new Error('Completed archive should validate');

const named=buildArchive(scan,{week:2,requireComplete:true,includeNames:true});
if(named.entries[0].name!=='Adam Jolly')throw new Error('Explicit name-preserving mode failed');

const report=summarizeHistory([archive]);
if(report.weeks[0].mine.rank!==2||report.participantProfiles.find(x=>x.isMine)?.averageConsensusRate!==.75)throw new Error('Cross-week pool profile is incorrect');
if(report.fieldPrior.participantWeeks!==3||report.fieldPrior.confidenceByPoolOwnershipBucket.reduce((sum,x)=>sum+x.observations,0)!==12)throw new Error('Pool behavior prior is incomplete');

const splitScan={...scan,snapshots:[{...scan.snapshots[0],text:'',views:[
  {text:text.replace(/FINAL\nCAR[\s\S]*$/,'').trim()+`\n1st\nAdam Jolly\n10\n110\nGB\n(4)\nBUF\n(3)\n2nd\nTony Eickhoff\n8\n100\nGB\n(4)\nBUF\n(3)\n3rd\nMarek Turley\n5\n95\nATL\n(4)\nBUF\n(3)`},
  {text:`NFL Football Tourney 2026\nWeekly\nOverall\nWeek 2\nPLAYERS\nPTS\nYTD\nFINAL\nCAR\nCLE\n21\n14\nFINAL\nNYJ\nDET\n13\n27\n1st\nAdam Jolly\n10\n110\nCAR\n(2)\nDET\n(1)\n2nd\nTony Eickhoff\n8\n100\nCLE\n(2)\nDET\n(1)\n3rd\nMarek Turley\n5\n95\nCAR\n(2)\nNYJ\n(1)`}
]}]};
const merged=buildArchive(splitScan,{week:2,requireComplete:true});
if(merged.entries.some(entry=>Object.keys(entry.card).length!==4))throw new Error('Horizontal capture views did not merge into full cards');

const broken=JSON.parse(JSON.stringify(archive));delete broken.entries[0].card['NYJ@DET'];
if(validateArchive(broken,{requireComplete:true}).valid)throw new Error('Missing completed-week game was not rejected');
const duplicate=JSON.parse(JSON.stringify(archive));duplicate.entries[0].card['NYJ@DET'].confidence=4;
if(validateArchive(duplicate,{requireComplete:true}).valid)throw new Error('Duplicate confidence was not rejected');

console.log('CBS pool archive regression passed: full cards parsed, anonymized, validated, and summarized.');
