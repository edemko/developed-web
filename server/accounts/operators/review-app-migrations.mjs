// Offline source inventory only. Deliberately has no apply/database interface.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const appMigrations = Object.freeze([
  ['mega-media-player', '20260920070834_mega_music_ecosystem_sessions.sql', 'b99a2c7db6a65f847539fbef97981a8ad0bd506ca35ea72b4ed6562dff58ded8'],
  ['kestrek', '20260920071554_kestrek_ecosystem_sessions.sql', 'fbca5d59e6efee43ee138084341ee063452f1f9fc691ad26e79ab022b65faccc'],
  ['screentime', '20260920071953_ecosystem_web_sessions.sql', '4fdc1b98364d6e3061401e92375a1423e7c6e7d3b76e4e80e103abc3a2e603c6'],
  ['airsoft-marketplace', '20260920123109_airsoft_ecosystem_sessions.sql', '0ffb4a6a9d4bf274bb88e6cf42e2cd4644ab22488ba55265992ea27abe8247df'],
  ['vocabulary-builder', '20260920123043_ecosystem_oidc_sessions.sql', '494ce8743fb07285af82eb8a11fa064c6f24365457f28f6f4ebb4f09edfdc431'],
  ['odonto-ai', '20260920123136_odonto_private_identity_sessions.sql', 'da84609251c7d74b2681f2f21b800b17fce6a52b71755eb21ed1129aa9511aca'],
  ['otazkomat', '20260920123206_central_web_sessions.sql', '2e8507fb29205ba524bcefd767fe7a61fc5d0285209bc547e63cda224847c0fb'],
  ['developed-web', '20260920124145_ecosystem_scoped_data_roles.sql', 'afdedec52b8c98b7db2bb8125d661f03a4f88b250698e5bb55a7c7732b6965c1'],
  ['odonto-ai', '20260920132100_odonto_identity_https_store.sql', '16d900304deaf8a9893028a0e680a0ad573b143bcd7d8f4765646ef95410c51f'],
  ['kestrek', '20260920071603_kestrek_ecosystem_raw_token_cutover.sql', '6448e02bf4462e69390a7023c0a73baada1d0ea5348072f265ce1ba9f1936bd4'],
].map(([repository, file, sha256], index) => Object.freeze({
  repository, file, sha256, phase: index === 9 ? 'final-closure-only' : 'additive',
  // This is a dependency inventory, not an extension of the central runner.
  supportedByCentralRunner: false,
})));

export function verifyAppSource(file, bytes) {
  const entry = appMigrations.find(item => item.file === file);
  if (!entry || !Buffer.isBuffer(bytes)
    || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
    throw new Error('Unreviewed app migration source');
  }
  return entry;
}

export async function readAppSource(entry) {
  if (!appMigrations.includes(entry)) throw new Error('Unreviewed app migration source');
  // Requires canonical sibling checkouts; cannot accept arbitrary paths.
  const bytes = await readFile(new URL(`../../../../${entry.repository}/supabase/migrations/${entry.file}`, import.meta.url));
  verifyAppSource(entry.file, bytes);
  return bytes;
}

export async function review(args = []) {
  if (args.length) throw new Error('Offline review accepts no arguments');
  for (const entry of appMigrations) await readAppSource(entry);
  return {
    mode: 'offline-source-review', productionApplySupported: false,
    prerequisites: ['central-foundation-ledger', 'closed-app-settings-seed',
      'kestrek-identity-role', 'owner-aware-app-runner-and-atomic-ledgers',
      'restored-catalog-rehearsal'],
    migrations: appMigrations,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  review(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch(() => { process.stderr.write('Offline app migration review failed; no database operation performed.\n'); process.exitCode = 1; });
}
