// Process helpers for developed-release. Never logs environment values.
import { spawnSync } from 'node:child_process';

export class ReleaseError extends Error {}

export const log = (...parts) =>
  console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);

export function run(cmd, args = [], { cwd, env, input, allowFail = false, stream = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    env: env ?? process.env,
    input,
    encoding: 'utf8',
    stdio: stream ? ['ignore', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error) throw new ReleaseError(`${cmd}: ${result.error.message}`);
  if (result.status !== 0 && !allowFail) {
    const tail = (result.stderr || '').trim().split('\n').slice(-15).join('\n');
    throw new ReleaseError(`${cmd} ${args.join(' ')} exited ${result.status}${tail ? `\n${tail}` : ''}`);
  }
  return { status: result.status, out: (result.stdout || '').trim(), err: (result.stderr || '').trim() };
}

// Non-interactive sudo only: a password prompt inside a timer must fail, not hang.
export const sudo = (cmd, args = [], opts = {}) => run('sudo', ['-n', cmd, ...args], opts);

export const sudoTest = (flag, path) => sudo('test', [flag, path], { allowFail: true }).status === 0;

export const sudoRead = (path) => sudo('cat', [path]).out;

export function sudoWrite(path, content, mode = '0644') {
  sudo('install', ['-d', '-m', '0755', '-o', 'root', '-g', 'root', path.replace(/\/[^/]+$/, '')]);
  sudo('tee', [path], { input: content });
  sudo('chmod', [mode, path]);
  sudo('chown', ['root:root', path]);
}

export function httpStatus(url, headers = []) {
  const args = ['-s', '-o', '/dev/null', '-m', '10', '-w', '%{http_code}'];
  for (const header of headers) args.push('-H', header);
  args.push(url);
  return Number(run('curl', args, { allowFail: true }).out) || 0;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
