# CBS Pick'em Week 2 Recommendation Audit

Captured: 2026-09-17 23:02 UTC  
Build: 1.4.3  
Pool size modeled: 102 entries  
Field model: synthetic fallback (Weekly Standings capture not available)  
Market input: Week 2 consensus moneylines published from the current FOX Sports / VegasInsider lookup.

## Submitted CBS card

| Confidence | Pick | Matchup | CBS pick share |
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

This is the first Week 2 recommendation set. It is preserved exactly as generated so it can be scored after the week. The CBS ownership percentages and submitted card came from Tony's six mobile screenshots. Weekly Standings data was not available, so the opponent field used the optimizer's synthetic fallback. Reruns should use the same stable optimizer and should not reverse after the full recommended card is applied.


## Recommendation Set 2 — Detroit protected

Captured: 2026-09-17 23:11 UTC  
Build: 1.4.4  
Pool size: 94 entries, confirmed from Weekly Standings screenshots.  
Constraint: DET at confidence 2 is protected. IQ may not flip Detroit or move its confidence value.

The standings screenshots revealed Tony's submitted DET (2), but opponent selections remained locked. The opponent field therefore still uses CBS ownership percentages and synthetic confidence placement.

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

The objective is weekly first/second place, not median score. CBS ownership shows only 9% on Detroit. Once Detroit is mandatory, assigning maximum confidence creates high-variance tournament leverage: a Detroit win separates Tony from most of the field, while a Detroit loss already hurts the card regardless of whether it carries 2 or 16. The optimizer accepts a lower average-point projection than Set 2 in exchange for a higher modeled Top-2 and Win probability.

Set 3 supersedes Set 2 for current decision support. Sets 1 and 2 remain preserved for post-week comparison.
