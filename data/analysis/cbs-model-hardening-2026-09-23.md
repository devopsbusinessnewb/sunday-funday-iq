# CBS Pick'em model hardening — 2026-09-23

## Outcome

Build 1.7.0 separates three decisions that Build 1.6.1 allowed to interact too freely:

1. expected winner from market-anchored game probability;
2. strategic pick from explicitly gated pool leverage;
3. confidence allocation from conservative win probability only.

The change is defensive. It deliberately requires more evidence before recommending a contrarian pick and prevents ownership from inflating confidence.

## Confirmed historical evidence

| Week | Card | Points | Correct | Interpretation |
|---:|---|---:|---:|---|
| 1 | Original submitted | 108 | 12 | Historical card |
| 1 | Build 1.3.0 initial | 114 | 12 | Better points, same winners |
| 1 | Build 1.3.0 contradictory rerun | 94 | 11 | Regression / unstable advice |
| 1 | Build 1.3.1 stabilized | 102 | 13 | More winners, worse confidence value |
| 2 | CBS consensus benchmark | 91 | 11 | Independent rule-based benchmark |
| 2 | Build 1.6.1 model | 85 | 8 | Six points and three winners behind benchmark |
| 2 | Official submitted | 85 | 8 | Same result as model card |
| 2 | Rapid original placeholder | 74 | 9 | Operational input only; not a benchmark |

The Week 2 improvement versus the rapid placeholder is not model-performance evidence. The valid comparison currently available is the CBS-consensus benchmark, which beat Build 1.6.1.

## Root causes found

- Confidence ordering was influenced indirectly by the same tournament objective that rewarded differentiation. That allowed a questionable leverage pick to climb too high.
- A contrarian candidate could be admitted on a small IQ edge even when the market was materially less supportive.
- Several contrarian flips could be stacked while the model had only CBS-wide popularity—not the pool's actual hidden selections.
- Simulation improvements were accepted from separate Monte Carlo estimates without a paired uncertainty check.
- The original Week 2 card was mislabeled as a meaningful baseline even though it was entered only to unlock simulation.

## Build 1.7.0 guardrails

- Winner probability is 65% market and 35% IQ when both exist.
- Confidence uses the lower market-anchored estimate and an additional market/IQ disagreement penalty.
- Ownership has no input to confidence ranking.
- Near-ties within 2.5 percentage points preserve the user's existing relative order.
- A proxy-field contrarian requires at least 40% modeled win probability, 38% market probability, eight points of leverage, no more than 32% ownership, and no more than six points of market/IQ disagreement.
- At most one contrarian underdog is allowed while only the CBS-wide proxy is available.
- Expected-winner corrections and contrarian flips receive different labels: STRONG FLIP versus OPTIONAL FLIP.
- Candidate and current cards are evaluated in the same Monte Carlo worlds, with standard error, lower confidence bound, and worst probability scenario recorded.
- Recommendations must clear a material tournament or expected-points safety gate.

## Validation completed

- CBS pregame and postgame JSON fixtures reconstruct all 16 picks and unique confidence values.
- Published live CBS JSON reconstructs all 16 matchups, picks, and confidence values.
- Missing picks, invalid confidence, duplicate confidence, and missing values produce matchup-specific diagnostics.
- Applying a recommendation and rerunning does not reverse the advice in the regression fixture.
- Protected picks and confidence values remain unchanged.
- Ownership changes do not change confidence allocation.
- A 41.7% Atlanta-style underdog remains optional and receives low confidence when safer alternatives exist.
- Low-probability contrarian picks are rejected.
- Proxy-field searches cannot stack multiple contrarian underdogs.
- Market, IQ, and blended scenario results are separately measured.
- CBS, Guillotine, ESPN sync, and Yahoo regression suites pass together.

## Remaining limitations

- Two completed weeks are far too small for probability calibration by bucket.
- Exact full pregame market snapshots were not persisted for every Week 2 game. A market-only historical baseline cannot be reconstructed honestly from partial values and should not be fabricated.
- Pool picks remain unavailable before kickoff, so pregame leverage is necessarily provisional.
- Local decision history persists in the browser, while durable historical cards still require the repository history file to be updated.
- iPhone safe-area CSS is present and statically checked, but physical-device validation still requires the deployed page on the user's phone.

## Next evidence gate

For each future week, preserve the imported card, exact market snapshot, CBS-wide shares, recommendation, final submitted card, and results. Compare the model against both market-favorite/probability order and CBS-consensus/share order. Do not promote stronger leverage behavior until a larger sample shows that optional flips add value after confidence cost.
