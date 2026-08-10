# Shrinkwrap Regeneration

Use when a local Atmosphere package's `npm-shrinkwrap.json` is missing, stale, or corrupted.

## Steps

1. Remove the existing build artifacts for the affected package:
   ```
   rm -rf packages/<name>/.npm/package/node_modules
   rm -f packages/<name>/.npm/package/npm-shrinkwrap.json
   ```

2. Force a clean rebuild. Either:
   ```
   meteor run
   ```
   or, for a non-interactive rebuild:
   ```
   meteor npm install && meteor build /tmp/build-check --server-only
   ```

3. Confirm the new `npm-shrinkwrap.json` was written:
   ```
   cat packages/<name>/.npm/package/npm-shrinkwrap.json
   ```

4. Diff against the previous committed version before staging:
   ```
   git diff packages/<name>/.npm/package/npm-shrinkwrap.json
   ```
   Confirm only expected version changes appear. Watch for unrelated packages being dropped — this is a known Meteor bug triggered when one `Npm.depends` version changes cause a full re-resolution.

5. Commit only `npm-shrinkwrap.json`. Do not commit `node_modules/`.

## Known Meteor bug: git-sourced deps silently rewritten

If `Npm.depends` contains a git URL, regeneration may silently resolve it to a registry version instead. After regeneration, verify the shrinkwrap's `resolved` field for that package still points to the expected source.
