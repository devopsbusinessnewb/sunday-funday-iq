# CBS completed-week pool archives

This directory is reserved for normalized, privacy-safe completed-week pool archives.

Raw CBS bridge exports should **not** be committed. They can contain participant names and bulky page captures. Normalize each raw export with:

```bash
node tools/cbs-pool-archive.js path/to/cbs-scan.json --week 2 --out data/analysis/cbs-pool-archives/2026-week-02.json
```

The normalizer:

- removes participant names by default;
- preserves stable anonymous entry IDs for cross-week learning;
- distinguishes explicit CBS no-pick blanks from capture gaps;
- validates every participant row accounts for every matchup slot, while allowing legitimate skipped games;
- validates submitted confidence values and verifies complete cards use every value exactly once;
- verifies calculated scores against CBS weekly scores;
- calculates actual pool pick shares and confidence distributions;
- records the winning score and Top-2 cutoff.

After two or more weeks are present, produce a cross-week report with:

```bash
node tools/cbs-pool-report.js data/analysis/cbs-pool-archives/2026-week-*.json --out data/analysis/cbs-pool-history-report.json
```

Do not use `--include-names` for repository artifacts. That option exists only for temporary local troubleshooting.
