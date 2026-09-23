# CBS Pick'em Week 2 Recommendation Audit

Captured: 2026-09-17 23:02 UTC  
Build: 1.4.3  
Pool size modeled: 102 entries  
Field model: synthetic fallback (Weekly Standings capture not available)  
Market input: Week 2 consensus moneylines published from the current FOX Sports / VegasInsider lookup.

## Submitted CBS card

| Confidence | Pick | Matchup | CBS-wide pick share |
|---:|---|---|---:|
| 16 | CIN | CIN @ HOU | 37% |
| 15 | PIT | PIT @ NE | 25% |
| 14 | TB | CLE @ TB | 97% |
| 13 | CAR | CAR @ ATL | 77% |
| 12 | BAL | NO @ BAL | 97% |
| 11 | MIN | MIN @ CHI | 11% |
| 10 | NYJ | GB @ NYJ | 15% |
| 9 | PHI | PHI @ TEN | 99% |
| 8 | JAX | JAX @ DEN | 46% |
| 7 | LV | LV @ LAC | 19% |
| 6 | DAL | WAS @ DAL | 81% |
| 5 | SEA | SEA @ ARI | 89% |
| 4 | SF | MIA @ SF | 98% |
| 3 | KC | IND @ KC | 97% |
| 2 | DET | DET @ BUF | 9% |
| 1 | NYG | NYG @ LAR | 20% |

Tiebreaker: 41.

## Build 1.4.3 recommendation

Simulation: 1,100 search worlds and 6,500 final evaluation worlds using the stable fixed-point optimizer.

| Metric | Submitted | Recommended |
|---|---:|---:|
| Top 2 | 4.6% | 15.2% |
| Win | 3.5% | 10.7% |
| Average confidence points | 73.1 | 92.9 |

### Final recommended card

| Confidence | Pick | Matchup | Change from submitted |
|---:|---|---|---|
| 16 | LAR | NYG @ LAR | Flip NYG → LAR; 1 → 16 |
| 15 | MIN | MIN @ CHI | Keep MIN; 11 → 15 |
| 14 | SF | MIA @ SF | Keep SF; 4 → 14 |
| 13 | LAC | LV @ LAC | Flip LV → LAC; 7 → 13 |
| 12 | NE | PIT @ NE | Flip PIT → NE; 15 → 12 |
| 11 | PHI | PHI @ TEN | Keep PHI; 9 → 11 |
| 10 | BAL | NO @ BAL | Keep BAL; 12 → 10 |
| 9 | TB | CLE @ TB | Keep TB; 14 → 9 |
| 8 | SEA | SEA @ ARI | Keep SEA; 5 → 8 |
| 7 | KC | IND @ KC | Keep KC; 3 → 7 |
| 6 | DAL | WAS @ DAL | No change |
| 5 | BUF | DET @ BUF | Flip DET → BUF; 2 → 5 |
| 4 | HOU | CIN @ HOU | Flip CIN → HOU; 16 → 4 |
| 3 | GB | GB @ NYJ | Flip NYJ → GB; 10 → 3 |
| 2 | DEN | JAX @ DEN | Flip JAX → DEN; 8 → 2 |
| 1 | ATL | CAR @ ATL | Flip CAR → ATL; 13 → 1 |

## Interpretation note

This is the first Week 2 recommendation set. It is preserved exactly as generated so it can be scored after the week. The CBS-wide ownership percentages and submitted card came from Tony's six mobile screenshots. These percentages are not the distribution within Tony's pool. Weekly Standings data was not available, so the opponent field used the optimizer's synthetic fallback. Reruns should use the same stable optimizer and should not reverse after the full recommended card is applied.


## Recommendation Set 2 — Detroit protected

Captured: 2026-09-17 23:11 UTC  
Build: 1.4.4  
Pool size: 94 entries, confirmed from Weekly Standings screenshots.  
Constraint: DET at confidence 2 is protected. IQ may not flip Detroit or move its confidence value.

The standings screenshots revealed Tony's submitted DET (2), but opponent selections remained locked. The opponent field therefore uses CBS-wide ownership percentages as a provisional proxy plus synthetic confidence placement; it does not know this pool's actual pick distribution.

| Metric | Submitted | Recommended |
|---|---:|---:|
| Top 2 | 4.7% | 13.8% |
| Win | 3.7% | 9.3% |
| Average confidence points | 72.8 | 94.5 |

### Constrained final card

| Confidence | Pick | Matchup | Change from submitted |
|---:|---|---|---|
| 16 | LAR | NYG @ LAR | Flip NYG → LAR; 1 → 16 |
| 15 | SF | MIA @ SF | Keep SF; 4 → 15 |
| 14 | LAC | LV @ LAC | Flip LV → LAC; 7 → 14 |
| 13 | BAL | NO @ BAL | Keep BAL; 12 → 13 |
| 12 | DEN | JAX @ DEN | Flip JAX → DEN; 8 → 12 |
| 11 | DAL | WAS @ DAL | Keep DAL; 6 → 11 |
| 10 | TB | CLE @ TB | Keep TB; 14 → 10 |
| 9 | CHI | MIN @ CHI | Flip MIN → CHI; 11 → 9 |
| 8 | GB | GB @ NYJ | Flip NYJ → GB; 10 → 8 |
| 7 | NE | PIT @ NE | Flip PIT → NE; 15 → 7 |
| 6 | HOU | CIN @ HOU | Flip CIN → HOU; 16 → 6 |
| 5 | CAR | CAR @ ATL | Keep CAR; 13 → 5 |
| 4 | SEA | SEA @ ARI | Keep SEA; 5 → 4 |
| 3 | PHI | PHI @ TEN | Keep PHI; 9 → 3 |
| 2 | DET | DET @ BUF | Protected — no change |
| 1 | KC | IND @ KC | Keep KC; 3 → 1 |

Set 2 supersedes Set 1 for decision support because it incorporates Tony's explicit Detroit constraint and the corrected 94-entry pool size. Both sets remain recorded for post-week analysis.


## Recommendation Set 3 — Detroit pick protected, confidence flexible

Captured: 2026-09-17 23:17 UTC  
Build: 1.4.5  
Pool size: 94 entries.  
Constraint: Detroit must remain the selected team; its confidence may move.

| Metric | Submitted | Recommended |
|---|---:|---:|
| Top 2 | 4.7% | 16.2% |
| Win | 3.7% | 10.3% |
| Average confidence points | 72.8 | 91.9 |

### Final recommended card

| Confidence | Pick | Matchup | Change from submitted |
|---:|---|---|---|
| 16 | DET | DET @ BUF | Keep DET; 2 → 16 |
| 15 | LAC | LV @ LAC | Flip LV → LAC; 7 → 15 |
| 14 | SF | MIA @ SF | Keep SF; 4 → 14 |
| 13 | LAR | NYG @ LAR | Flip NYG → LAR; 1 → 13 |
| 12 | BAL | NO @ BAL | No change |
| 11 | TB | CLE @ TB | Keep TB; 14 → 11 |
| 10 | PHI | PHI @ TEN | Keep PHI; 9 → 10 |
| 9 | KC | IND @ KC | Keep KC; 3 → 9 |
| 8 | SEA | SEA @ ARI | Keep SEA; 5 → 8 |
| 7 | CHI | MIN @ CHI | Flip MIN → CHI; 11 → 7 |
| 6 | GB | GB @ NYJ | Flip NYJ → GB; 10 → 6 |
| 5 | DAL | WAS @ DAL | Keep DAL; 6 → 5 |
| 4 | NE | PIT @ NE | Flip PIT → NE; 15 → 4 |
| 3 | CAR | CAR @ ATL | Keep CAR; 13 → 3 |
| 2 | HOU | CIN @ HOU | Flip CIN → HOU; 16 → 2 |
| 1 | DEN | JAX @ DEN | Flip JAX → DEN; 8 → 1 |

### Why Detroit moves to 16

The objective is weekly first/second place, not median score. CBS-wide ownership shows 9% on Detroit; Tony's pool-specific Detroit ownership is unknown until kickoff. Once Detroit is mandatory, assigning maximum confidence creates high-variance tournament leverage: a Detroit win separates Tony sharply from most of the field, while a Detroit loss creates substantially more downside at 16 than at 2. The optimizer explicitly accepts that downside and a lower average-point projection than Set 2 in exchange for higher modeled Top-2 and Win probabilities.

Set 3 supersedes Set 2 for current decision support. Sets 1 and 2 remain preserved for post-week comparison.


## Data correction — 2026-09-17

The 9% Detroit figure is the pick distribution across CBS, not Tony's 94-entry pool. Pool selections remain hidden until the game starts. Recommendation Set 3 is therefore a sensitivity result under a CBS-wide proxy, not a pool-specific conclusion. Its DET-at-16 recommendation should not be treated as reliable without knowing how closely this pool resembles the CBS-wide population.


## Recommendation Set 4 — Post-Detroit partial pool reveal

Captured: 2026-09-20 13:51 UTC  
Build: 1.5.1  
Pool size: 94 entries.  
Observed field: 88 entries revealed for the completed DET @ BUF game; the other 15 pool picks remain hidden.  
Result already locked: DET 31, BUF 41. Tony's DET pick at confidence 2 lost and remains frozen.

| Metric | Submitted | Recommended |
|---|---:|---:|
| Top 2 | 2.0% | 7.6% |
| Win | 1.3% | 4.4% |
| Average confidence points | 71.4 | — |

### Provisional final card

| Confidence | Pick | Matchup | Change from submitted |
|---:|---|---|---|
| 16 | ATL | CAR @ ATL | Flip CAR → ATL; 13 → 16 |
| 15 | MIN | MIN @ CHI | Keep MIN; 11 → 15 |
| 14 | SF | MIA @ SF | Keep SF; 4 → 14 |
| 13 | BAL | NO @ BAL | Keep BAL; 12 → 13 |
| 12 | KC | IND @ KC | Keep KC; 3 → 12 |
| 11 | LAR | NYG @ LAR | Flip NYG → LAR; 1 → 11 |
| 10 | TB | CLE @ TB | Keep TB; 14 → 10 |
| 9 | PHI | PHI @ TEN | No change |
| 8 | LAC | LV @ LAC | Flip LV → LAC; 7 → 8 |
| 7 | DAL | WAS @ DAL | Keep DAL; 6 → 7 |
| 6 | SEA | SEA @ ARI | Keep SEA; 5 → 6 |
| 5 | NE | PIT @ NE | Flip PIT → NE; 15 → 5 |
| 4 | GB | GB @ NYJ | Flip NYJ → GB; 10 → 4 |
| 3 | DEN | JAX @ DEN | Flip JAX → DEN; 8 → 3 |
| 2 | DET | DET @ BUF | Locked loss — no change |
| 1 | CIN | CIN @ HOU | Keep CIN; 16 → 1 |

### Interpretation note

This set uses live ESPN market odds plus the first real pool evidence: the DET @ BUF selections and confidence values revealed after kickoff. It is more informed than the pre-kickoff CBS-wide proxy sets, but it is still provisional because CBS continues to hide opponent picks for the remaining 15 games. Build 1.5.1 explicitly labels this state as a partial pool reveal.


## Recommendation Set 5 — Risk-calibrated model and final submitted card

Captured: 2026-09-20 15:15 UTC

Build: 1.6.1

Pool size: 94 entries.

Observed field: 88 entries revealed for the completed DET @ BUF game; the other 15 pool picks remained hidden.
Result already locked: DET 31, BUF 41. Tony's DET pick at confidence 2 lost and remained frozen.

Build 1.6.1 reduced the one-game performance weight from 30% to 12%, stress-tested market, IQ, and blended outcome probabilities, and separated contrarian-pick leverage from confidence-point safety. This run supersedes Set 4 for decision support.

| Metric | Submitted before changes | Build 1.6.1 recommendation |
|---|---:|---:|
| Top 2 | 2.6% | 4.9% |
| Win | 1.7% | 3.0% |
| Modeled improvement | — | +2.3 pp Top 2; +1.3 pp Win |

### Build 1.6.1 recommended card

| Confidence | Pick | Matchup | Recommendation |
|---:|---|---|---|
| 16 | SF | MIA @ SF | Keep SF; 4 → 16 |
| 15 | LAR | NYG @ LAR | Flip NYG → LAR; 1 → 15 |
| 14 | BAL | NO @ BAL | Keep BAL; 12 → 14 |
| 13 | PHI | PHI @ TEN | Keep PHI; 9 → 13 |
| 12 | KC | IND @ KC | Keep KC; 3 → 12 |
| 11 | DAL | WAS @ DAL | Keep DAL; 6 → 11 |
| 10 | DEN | JAX @ DEN | Flip JAX → DEN; 8 → 10 |
| 9 | LAC | LV @ LAC | Flip LV → LAC; 7 → 9 |
| 8 | TB | CLE @ TB | Keep TB; 14 → 8 |
| 7 | CIN | CIN @ HOU | Keep CIN; 16 → 7 |
| 6 | ATL | CAR @ ATL | Flip CAR → ATL; 13 → 6 |
| 5 | NYJ | GB @ NYJ | Keep NYJ; 10 → 5 |
| 4 | ARI | SEA @ ARI | Flip SEA → ARI; 5 → 4 |
| 3 | PIT | PIT @ NE | Keep PIT; 15 → 3 |
| 2 | DET | DET @ BUF | Locked loss — no change |
| 1 | MIN | MIN @ CHI | Keep MIN; 11 → 1 |

### Recorded probability inputs for recommended flips

| Pick | CBS-wide share | Market win probability | IQ win probability | Confidence ceiling |
|---|---:|---:|---:|---:|
| ATL | 23% | 41.7% | 46.1% | 6 |
| DEN | 53% | 57.2% | 50.5% | 10 |
| LAC | 82% | 72.6% | 64.1% | 16 |
| ARI | 12% | 35.5% | 41.3% | 4 |
| LAR | 80% | 72.2% | 64.0% | 16 |

### Official final CBS card submitted by Tony

Tony entered the complete recommendation with one deliberate risk adjustment: PIT received 4 and ARI received 3 instead of the model's PIT 3 / ARI 4. This is the official card to score against the model recommendation and the original submitted card after Week 2 concludes.

| Confidence | Pick | Matchup | Final status |
|---:|---|---|---|
| 16 | SF | MIA @ SF | Submitted |
| 15 | LAR | NYG @ LAR | Submitted |
| 14 | BAL | NO @ BAL | Submitted |
| 13 | PHI | PHI @ TEN | Submitted |
| 12 | KC | IND @ KC | Submitted |
| 11 | DAL | WAS @ DAL | Submitted |
| 10 | DEN | JAX @ DEN | Submitted |
| 9 | LAC | LV @ LAC | Submitted |
| 8 | TB | CLE @ TB | Submitted |
| 7 | CIN | CIN @ HOU | Submitted |
| 6 | ATL | CAR @ ATL | Submitted |
| 5 | NYJ | GB @ NYJ | Submitted |
| 4 | PIT | PIT @ NE | Submitted — manual override from model's 3 |
| 3 | ARI | SEA @ ARI | Submitted — manual override from model's 4 |
| 2 | DET | DET @ BUF | Locked loss |
| 1 | MIN | MIN @ CHI | Submitted |

Tiebreaker: 41.

### Post-week evaluation plan

Score three cards after all games become final: (1) the original CBS card, (2) the exact Build 1.6.1 recommended card, and (3) Tony's official submitted card. Compare correct picks, confidence points, pool finish, Top-2 outcome, pick-flip attribution, confidence-reallocation attribution, and the effect of the PIT/ARI manual override. Use the result to calibrate early-season form weight, probability disagreement limits, confidence ceilings, and contrarian-pick selection without retroactively changing this record.

### Baseline clarification — 2026-09-22

The card labeled “original” above was created in approximately two minutes so CBS contained a complete card and Sunday Funday IQ could run its simulation. It was not intended to represent Tony's considered strategy. It remains preserved for lineage and component attribution, but any point improvement versus that card is **not** evidence that the model added value.

Model-performance evaluation must use disciplined independent baselines such as market-favorite picks with probability-sorted confidence, CBS-consensus picks with a consistent confidence rule, and zero-flip versus model-flip strategies. Until those baselines are reconstructed, Week 2's +11 points versus the placeholder card is diagnostic only.

### Independent benchmark result — 2026-09-23

A pre-declared CBS-consensus baseline selected the CBS-wide majority for every game and ranked confidence by majority pick share (ties by matchup key). It scored **91 points with 11 correct picks**. Build 1.6.1 scored **85 points with 8 correct picks**, six points and three correct picks worse than that benchmark. This one-week result does not establish calibration, but it is valid evidence that the Week 2 leverage choices failed to add value; the +11 versus the rapid placeholder is not.
