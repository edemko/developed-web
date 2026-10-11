// Read-only git helpers (plus fetch). Releases are always built from a commit archive,
// never from the working tree, so a dirty checkout never leaks into production.
import { run } from './sh.mjs';

const git = (repo, args, opts) => run('git', ['-C', repo, ...args], opts);

export const fetchBranch = (repo, branch) => git(repo, ['fetch', '--quiet', 'origin', branch]);

export function resolve(repo, ref) {
  const result = git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFail: true });
  return result.status === 0 ? result.out : null;
}

export const subject = (repo, sha) => git(repo, ['log', '-1', '--format=%s', sha]).out;

export const isAncestor = (repo, ancestor, descendant) =>
  git(repo, ['merge-base', '--is-ancestor', ancestor, descendant], { allowFail: true }).status === 0;

export const countBetween = (repo, from, to) => Number(git(repo, ['rev-list', '--count', `${from}..${to}`]).out);

export function changed(repo, from, to, paths) {
  if (!paths.length) return false;
  return git(repo, ['diff', '--quiet', from, to, '--', ...paths], { allowFail: true }).status !== 0;
}

export const changedFiles = (repo, from, to, paths) =>
  git(repo, ['diff', '--name-only', from, to, '--', ...paths]).out.split('\n').filter(Boolean);

export const showFile = (repo, sha, path) => git(repo, ['show', `${sha}:${path}`]).out + '\n';

export const archive = (repo, sha, paths, dest) =>
  run('bash', ['-o', 'pipefail', '-ec',
    'git -C "$1" archive "$2" -- "${@:4}" | tar -x -C "$3" --exclude=".env*"',
    'archive', repo, sha, dest, ...paths]);
