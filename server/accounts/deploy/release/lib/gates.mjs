// Pure deploy decision. Every input is computed by the caller so this stays testable.
//
// input = {
//   auto: boolean,                 // true when triggered by the poll timer
//   unmarkedChange: boolean,       // some commit since a live side touching its paths lacks [no deploy]
//   migrationsChanged: boolean,    // migration paths differ between any live side and target
//   migrationsApplied: boolean,    // operator confirmed migrations were applied by hand
//   force: boolean,                // switch sides even when their paths did not change
//   heldAttempts: number,          // failed auto attempts already recorded for this target
//   sides: { [name]: { liveSource: string|null, liveContained: boolean, changed: boolean,
//                      liveIsTarget: boolean, manual: boolean } }
// }
// returns { action: 'deploy'|'skip'|'block', reason, sides: string[] }

export const MAX_AUTO_ATTEMPTS = 3;

export const isNoDeploy = (subject) => /\[no deploy\]/i.test(subject);

export function decide(input) {
  const skip = (reason) => ({ action: 'skip', reason, sides: [] });
  const block = (reason) => ({ action: 'block', reason, sides: [] });

  if (input.auto && input.heldAttempts >= MAX_AUTO_ATTEMPTS) {
    return skip(`target failed ${input.heldAttempts} times; held until a new commit lands`);
  }

  const selected = [];
  for (const [name, side] of Object.entries(input.sides)) {
    if (!side.liveSource) return block(`cannot determine the live commit of side "${name}"`);
    if (!side.liveContained) {
      return block(`live ${name} commit ${side.liveSource.slice(0, 12)} is not contained in the target — deploying would drop live-only commits`);
    }
    if (side.liveIsTarget) continue;
    if (side.changed || input.force) {
      if (side.manual) return block(`side "${name}" changed but is switched manually`);
      selected.push(name);
    }
  }
  if (!selected.length) return skip('nothing deployable changed since the live release');
  if (input.auto && !input.unmarkedChange && !input.force) {
    return skip('every commit touching deployable paths is marked [no deploy]');
  }
  if (input.migrationsChanged && !input.migrationsApplied) {
    return block('migrations changed since the live release — apply them by hand, then rerun with --migrations-applied');
  }
  return { action: 'deploy', reason: `deploy ${selected.join(' + ')}`, sides: selected };
}

// Find the commit a release directory was built from: manifest first, then legacy
// marker files, then an operator-recorded mapping, then hex tokens in the name.
export function sourceCandidates({ name, manifest, deployment, revisionFile, knownSources = {} }) {
  const candidates = [];
  if (manifest?.sourceCommit) candidates.push(manifest.sourceCommit);
  if (manifest?.revision) candidates.push(manifest.revision);
  if (deployment?.revision) candidates.push(deployment.revision);
  if (revisionFile) candidates.push(revisionFile.trim());
  if (knownSources[name]) candidates.push(knownSources[name]);
  const tokens = name.match(/[0-9a-f]{7,40}/g) ?? [];
  candidates.push(...tokens.reverse());
  return [...new Set(candidates.filter((c) => /^[0-9a-f]{7,40}$/.test(c)))];
}

// Hashed bundle names Angular/Vite emit (chunk-ABCD1234.js, main-ABCD1234.js, index-AbC_12x.js).
export const HASHED_ASSET = /^[A-Za-z0-9_-]+-[A-Za-z0-9_]{8}\.(js|css)$/;

// Map a source commit back to a release directory name: exact rev12 name, an operator
// mapping (knownSources), or a hex token in the name that prefixes the commit.
export function releaseForSource(config, releases, sha) {
  return releases.find((r) => r === sha.slice(0, 12))
    ?? Object.entries(config.knownSources ?? {}).find(([r, s]) => releases.includes(r) && (sha.startsWith(s) || s.startsWith(sha)))?.[0]
    ?? releases.find((r) => (r.match(/[0-9a-f]{7,40}/g) ?? []).some((t) => sha.startsWith(t)));
}
