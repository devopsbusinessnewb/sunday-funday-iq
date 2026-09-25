# CBS pool learning integration — 2026-09-25

## Evidence available

- Two completed weeks
- 94 captured standings entries in each week
- 188 participant-weeks
- 89 complete Week 1 cards and 85 complete Week 2 cards
- Explicit no-pick slots retained rather than discarded or shifted

The same 94 stable anonymous entry IDs appear in both captures. CBS may retain removed entries in historical standings, so this does not prove every entry remained eligible after Week 1.

## Initial signal

- Field average: 2.18 minority picks per card
- Top-2 cards: 2.75 minority picks per card
- Tony Week 1: five minority picks, three correct, 12th place
- Tony Week 2: seven minority picks, two correct, 51st place

The evidence supports selective differentiation, not a broadly contrarian card. It does not establish that 2.75 flips is an optimum: only four Top-2 cards exist in the sample, and their results contain substantial outcome variance.

## Model treatment

Build 1.9.0 loads the privacy-safe pool-history report before simulation.

- Historical influence is based on completed weeks, not the much larger participant-row count.
- Two completed weeks receive 20% reliability: `weeks / (weeks + 8)`.
- The prior influences the simulated distribution of opponent consensus behavior and confidence allocation.
- Current market probabilities and current CBS-wide percentages remain the primary inputs.
- Historical results do not alter game win probabilities.
- Historical Top-2 behavior is displayed as context but is not treated as a direct optimization target.

## Portfolio guardrails

- Safest: zero leverage flips relative to modeled expected winners.
- Balanced: at most one leverage flip; a flip must not lose to Safest in the central Top-2 comparison or materially fail a probability stress scenario.
- Aggressive: at most two leverage flips with a larger but bounded expected-points and downside budget.
- Max upside: at most three leverage flips. This is explicitly a high-variance option, not the default recommendation.

Confidence remains ordered by conservative win probability. Ownership and leverage cannot increase a selected team's confidence.

## Limitations

- Pregame opponent selections are still hidden, so current-week pool ownership remains a modeled estimate.
- The completed archives do not contain the CBS-wide public percentages as they existed before each kickoff, so the model cannot yet estimate a historical CBS-public-to-pool mapping.
- Two weeks are insufficient for probability calibration or claims that a specific number of flips wins the pool.
- Post-result success is not evidence that a low-probability choice was correct at decision time.

Future completed weeks should increase the prior gradually. Pregame snapshots must be preserved alongside completed pool archives to measure whether CBS-wide ownership systematically overstates or understates this pool's behavior.
