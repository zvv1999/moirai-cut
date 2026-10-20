# Reusable definition seeds

These JSON files contain native dynamic asset definitions with `revision: 0` for
initialization. They are not Applications, input annotations, review records, or
quality certificates. A newly initialized asset needs its own production and
review evidence. `note-paper-placement.json` is a historical placement policy,
not a definition seed.

Saved assets are authoritative. Seed initializers use an existing asset unchanged;
only a missing asset goes through Rust inspect and compare-and-swap creation.
Never run a historical geometry generator to overwrite a refined saved style.
The checklist, bulb, growth headline, globe and note paper authoring entry points
now use `../initialize-style-seed.mjs` for this behavior. Existing clock, growth,
completion, Arrow and Echo initialization paths also preserve saved assets.
The editorial authoring entry uses `signal.json` for missing information labels;
it preserves an existing saved version instead of regenerating the old fixed bar.

To check all definition seeds against the configured local library:

```sh
python3 scripts/templates/sync-style-seeds.py
```

To export deliberately selected native definitions after reviewing their changes:

```sh
python3 scripts/templates/sync-style-seeds.py --write clock.json checklist-headline.json
```

The default is check-only; differences return a nonzero exit status. `--write`
changes repository files only. All selected definitions must roundtrip through
Rust inspect unchanged before any file is written. A second native read detects
concurrent library changes. The exporter declines definitions with bound media;
those need a separately packaged asset dependency. It does not transfer scores
or mutate the live library. Set `WORKBENCH_URL` or `--base-url` for another local
service and `--report /absolute/local/path.json` to keep an audit receipt.

2026-10-08: 11 stale seeds were synchronized; all 18 definition seeds roundtripped
exactly against the native library. Seven migrated initializers were exercised
against existing assets with only GET requests and no library change. Missing
asset creation and concurrent conflict behavior have transport tests; a clean
installation was not performed for this check. Later style edits should run this
check again before handing off the seeds.

After the signal r5 design update, the library check covers 19 definition seeds,
all exact after resetting only revision. The signal editorial entry was also run
to generate its manifest with the saved r5 rules; this does not submit production
or inherit a quality score.
