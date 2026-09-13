# CBS Pick'em Week 1 Recommendation Audit

Purpose: preserve every Sunday Funday IQ recommendation set so the cards can be scored against final NFL results after Week 1. Historical recommendations are retained even when later determined to be unstable or defective.

## Shared context

- Pool: NFL Football Tourney 2026
- Pool size used by model: 102
- Objective: maximize probability of finishing first or second
- Locked results at capture: SEA 9 (won), SF 1 (won)
- Latest CBS snapshot: September 13, 2026 at 10:36:43 AM CT
- Stable-run market snapshot: ESPN/DraftKings live odds, September 13, 2026 at 10:41:07 AM CT
- Field model: 92 revealed CBS entries

## Card A — Original submitted card

This is the card on record before the user implemented the first recommendation set.

| Game | Pick | Confidence |
|---|---:|---:|
| NE @ SEA | SEA | 9 |
| SF @ LAR | SF | 1 |
| TB @ CIN | CIN | 13 |
| BUF @ HOU | HOU | 7 |
| BAL @ IND | BAL | 14 |
| CHI @ CAR | CHI | 8 |
| NO @ DET | DET | 16 |
| CLE @ JAX | JAX | 12 |
| ATL @ PIT | PIT | 11 |
| NYJ @ TEN | NYJ | 2 |
| GB @ MIN | GB | 6 |
| WAS @ PHI | PHI | 15 |
| MIA @ LV | LV | 4 |
| ARI @ LAC | LAC | 10 |
| DAL @ NYG | DAL | 5 |
| DEN @ KC | KC | 3 |

## Recommendation Set 1 — Build 1.3.0 initial advice

Status: **historical and untrusted**. This set is reconstructed exactly from the difference between Card A and the user's next CBS submission. The original result panel was not separately archived.

| Action | From | To |
|---|---:|---:|
| Confidence | HOU 7 | HOU 4 |
| Pick/confidence | NYJ 2 | TEN 2 |
| Pick/confidence | GB 6 | MIN 7 |
| Confidence | LV 4 | LV 5 |
| Confidence | DAL 5 | DAL 6 |

### Resulting Card B

| Game | Pick | Confidence |
|---|---:|---:|
| NE @ SEA | SEA | 9 |
| SF @ LAR | SF | 1 |
| TB @ CIN | CIN | 13 |
| BUF @ HOU | HOU | 4 |
| BAL @ IND | BAL | 14 |
| CHI @ CAR | CHI | 8 |
| NO @ DET | DET | 16 |
| CLE @ JAX | JAX | 12 |
| ATL @ PIT | PIT | 11 |
| NYJ @ TEN | TEN | 2 |
| GB @ MIN | MIN | 7 |
| WAS @ PHI | PHI | 15 |
| MIA @ LV | LV | 5 |
| ARI @ LAC | LAC | 10 |
| DAL @ NYG | DAL | 6 |
| DEN @ KC | KC | 3 |

## Recommendation Set 2 — Build 1.3.0 contradictory rerun

Status: **directly captured, historical, and untrusted**. This was generated after Card B was imported. It reversed two prior pick recommendations and materially rearranged confidence again.

- Current Card B estimate: 8.8% Top 2; 4.4% Win
- Recommended Card C estimate: 20.5% Top 2; 14.4% Win

| Action | From | To |
|---|---:|---:|
| Confidence | CIN 13 | CIN 4 |
| Confidence | HOU 4 | HOU 16 |
| Confidence | BAL 14 | BAL 7 |
| Confidence | DET 16 | DET 13 |
| Pick/confidence | TEN 2 | NYJ 14 |
| Pick/confidence | MIN 7 | GB 3 |
| Confidence | PHI 15 | PHI 10 |
| Confidence | LAC 10 | LAC 15 |
| Pick/confidence | KC 3 | DEN 2 |

### Resulting Card C

| Game | Pick | Confidence |
|---|---:|---:|
| NE @ SEA | SEA | 9 |
| SF @ LAR | SF | 1 |
| TB @ CIN | CIN | 4 |
| BUF @ HOU | HOU | 16 |
| BAL @ IND | BAL | 7 |
| CHI @ CAR | CHI | 8 |
| NO @ DET | DET | 13 |
| CLE @ JAX | JAX | 12 |
| ATL @ PIT | PIT | 11 |
| NYJ @ TEN | NYJ | 14 |
| GB @ MIN | GB | 3 |
| WAS @ PHI | PHI | 10 |
| MIA @ LV | LV | 5 |
| ARI @ LAC | LAC | 15 |
| DAL @ NYG | DAL | 6 |
| DEN @ KC | DEN | 2 |

## Recommendation Set 3 — Build 1.3.1 stabilized advice

Status: **directly captured** after the convergence fix. Applying this complete card and rerunning with identical inputs produced zero additional changes or reversals.

- Current Card B estimate: 8.8% Top 2; 4.4% Win
- Recommended Card D estimate: 21.6% Top 2; 15.4% Win

| Action | From | To |
|---|---:|---:|
| Confidence | CIN 13 | CIN 6 |
| Confidence | HOU 4 | HOU 16 |
| Confidence | BAL 14 | BAL 7 |
| Confidence | DET 16 | DET 12 |
| Confidence | JAX 12 | JAX 13 |
| Confidence | PIT 11 | PIT 10 |
| Pick/confidence | TEN 2 | NYJ 15 |
| Confidence | MIN 7 | MIN 2 |
| Confidence | PHI 15 | PHI 11 |
| Confidence | LAC 10 | LAC 14 |
| Confidence | DAL 6 | DAL 4 |

### Resulting Card D

| Game | Pick | Confidence |
|---|---:|---:|
| NE @ SEA | SEA | 9 |
| SF @ LAR | SF | 1 |
| TB @ CIN | CIN | 6 |
| BUF @ HOU | HOU | 16 |
| BAL @ IND | BAL | 7 |
| CHI @ CAR | CHI | 8 |
| NO @ DET | DET | 12 |
| CLE @ JAX | JAX | 13 |
| ATL @ PIT | PIT | 10 |
| NYJ @ TEN | NYJ | 15 |
| GB @ MIN | MIN | 2 |
| WAS @ PHI | PHI | 11 |
| MIA @ LV | LV | 5 |
| ARI @ LAC | LAC | 14 |
| DAL @ NYG | DAL | 4 |
| DEN @ KC | KC | 3 |

## Post-week scoring plan

After all games are final, calculate for Cards A through D:

1. Correct picks and incorrect picks.
2. Total confidence points earned.
3. Actual pool placement if that complete card had been submitted.
4. Distance from first and second place.
5. Points gained or lost versus Card A.
6. Attribution by pick flips versus confidence reallocation.
7. Whether estimated Win and Top-2 improvements were directionally correct.

Do not retroactively edit these cards. Add final outcomes and analysis as a new dated section so the historical audit remains intact.
