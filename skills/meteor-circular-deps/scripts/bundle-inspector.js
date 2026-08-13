#!/usr/bin/env node
/**
 * Meteor bundle inspector — lists app sources from client/server source maps
 * and optional regex-based leak checks.
 *
 * Usage:
 *   node bundle-inspector.js --root <meteor-app-root>
 *   node bundle-inspector.js --root . --fail-both "^imports/server-only/"
 *   node bundle-inspector.js --help
 */

const fs = require('fs');
const path = require('path');

function printHelp() {
  console.log(`Meteor bundle inspector

Options:
  --root <dir>              Meteor project root (default: cwd)
  --client-map <file>       Override client app.js.map path
  --server-map <file>       Override server app.js.map path
  --source-prefix <prefix>  Only include map sources starting with this prefix
                            (default: meteor://💻app/)
  --strip-prefix <prefix>   Remove this prefix from printed paths (default: meteor://💻app/)
  --fail-both <regex>       Exit 1 if any file present in BOTH bundles matches (repeatable)
  --fail-server-only <regex> Exit 1 if any server-only file matches (repeatable)
  --json                    Print machine-readable JSON to stdout
  --quiet                   Skip human-readable report (still honors exit codes)

Example:
  node bundle-inspector.js --root . \\
    --fail-both "^imports/api/" \\
    --fail-server-only "^imports/ui/"
`);
}

function readJsonMap(programPath) {
  if (!fs.existsSync(programPath)) {
    const err = new Error(`Source map not found: ${programPath}`);
    err.code = 'ENOENT_MAP';
    throw err;
  }
  const content = fs.readFileSync(programPath, 'utf8');
  return JSON.parse(content);
}

function extractImportsFromMap(mapJson, sourcePrefix, stripPrefix) {
  const sources = mapJson.sources || [];
  return sources
    .filter((src) => typeof src === 'string' && src.startsWith(sourcePrefix))
    .map((src) => (stripPrefix && src.startsWith(stripPrefix) ? src.slice(stripPrefix.length) : src));
}

function parseArgs(argv) {
  const out = {
    root: process.cwd(),
    clientMap: null,
    serverMap: null,
    sourcePrefix: 'meteor://💻app/',
    stripPrefix: 'meteor://💻app/',
    failBoth: [],
    failServerOnly: [],
    json: false,
    quiet: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
    if (a === '--json') {
      out.json = true;
      continue;
    }
    if (a === '--quiet') {
      out.quiet = true;
      continue;
    }
    if (a === '--root') {
      out.root = path.resolve(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--client-map') {
      out.clientMap = path.resolve(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--server-map') {
      out.serverMap = path.resolve(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--source-prefix') {
      out.sourcePrefix = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (a === '--strip-prefix') {
      out.stripPrefix = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (a === '--fail-both') {
      out.failBoth.push(new RegExp(argv[i + 1] || '^$'));
      i += 1;
      continue;
    }
    if (a === '--fail-server-only') {
      out.failServerOnly.push(new RegExp(argv[i + 1] || '^$'));
      i += 1;
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    printHelp();
    process.exit(2);
  }

  if (!out.clientMap) {
    out.clientMap = path.join(
      out.root,
      '.meteor/local/build/programs/web.browser/app/app.js.map',
    );
  }
  if (!out.serverMap) {
    out.serverMap = path.join(
      out.root,
      '.meteor/local/build/programs/server/app/app.js.map',
    );
  }

  return out;
}

function analyze(opts) {
  const clientProgram = readJsonMap(opts.clientMap);
  const serverProgram = readJsonMap(opts.serverMap);

  const clientFiles = extractImportsFromMap(
    clientProgram,
    opts.sourcePrefix,
    opts.stripPrefix,
  );
  const serverFiles = extractImportsFromMap(
    serverProgram,
    opts.sourcePrefix,
    opts.stripPrefix,
  );

  const clientSet = new Set(clientFiles);
  const serverSet = new Set(serverFiles);

  const onlyClient = clientFiles.filter((f) => !serverSet.has(f));
  const onlyServer = serverFiles.filter((f) => !clientSet.has(f));
  const both = clientFiles.filter((f) => serverSet.has(f));

  return { onlyClient, onlyServer, both, clientFiles, serverFiles };
}

function printReport({ onlyClient, onlyServer, both }) {
  console.log('\n=== Meteor bundle inspector ===\n');
  console.log(`Client-only files: ${onlyClient.length}`);
  console.log(`Server-only files: ${onlyServer.length}`);
  console.log(`Shared files (both bundles): ${both.length}\n`);

  if (both.length > 0) {
    console.log('--- Shared files (isomorphic or boundary leaks):');
    both.forEach((f) => console.log(f));
  }
}

function collectMatches(files, regexes) {
  const hits = [];
  for (const f of files) {
    for (const re of regexes) {
      if (re.test(f)) {
        hits.push(f);
        break;
      }
    }
  }
  return hits;
}

function checkForLeaks(opts, { onlyServer, both }) {
  let hasLeak = false;
  const bothHits = collectMatches(both, opts.failBoth);
  const serverOnlyHits = collectMatches(onlyServer, opts.failServerOnly);

  if (bothHits.length > 0) {
    console.error('\nFiles matching --fail-both rules (present in client AND server):');
    bothHits.forEach((f) => console.error(f));
    hasLeak = true;
  }

  if (serverOnlyHits.length > 0) {
    console.error('\nFiles matching --fail-server-only rules (server-only list):');
    serverOnlyHits.forEach((f) => console.error(f));
    hasLeak = true;
  }

  if (hasLeak) {
    process.exit(1);
  }
}

function main() {
  const opts = parseArgs(process.argv);

  let results;
  try {
    results = analyze(opts);
  } catch (e) {
    if (e && e.code === 'ENOENT_MAP') {
      console.error(e.message);
      console.error(
        '\nBuild the app first so .meteor/local/build/.../app.js.map exists, or pass --client-map / --server-map.',
      );
      process.exit(1);
    }
    throw e;
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          onlyClient: results.onlyClient,
          onlyServer: results.onlyServer,
          both: results.both,
        },
        null,
        2,
      ),
    );
    process.stdout.write('\n');
  } else if (!opts.quiet) {
    printReport(results);
  }

  if (opts.failBoth.length > 0 || opts.failServerOnly.length > 0) {
    checkForLeaks(opts, results);
  }
}

main();
