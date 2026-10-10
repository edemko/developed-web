// Switch strategies. Each returns an undo function; the caller unwinds every completed
// side in reverse when a later step fails, so web and API never stay on mismatched releases.
import { hooks } from '../hooks/index.mjs';
import { httpStatus, log, ReleaseError, run, sleep, sudo, sudoWrite } from './sh.mjs';

const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (_, key) => {
  if (!(key in vars)) throw new ReleaseError(`unknown placeholder {${key}}`);
  return vars[key];
});

export async function checkHealth(side, { wait = 30 } = {}) {
  const [first, ...rest] = side.health;
  let status = 0;
  for (let i = 0; i < wait; i += 1) {
    status = httpStatus(first.url, first.headers);
    if (status === first.status) break;
    await sleep(1000);
  }
  const failures = [];
  if (status !== first.status) failures.push(`${first.url} -> ${status} (want ${first.status})`);
  for (const check of rest) {
    const got = httpStatus(check.url, check.headers);
    if (got !== check.status) failures.push(`${check.url} -> ${got} (want ${check.status})`);
  }
  if (failures.length) throw new ReleaseError(`health checks failed:\n  ${failures.join('\n  ')}`);
}

function purgeCloudflare(zone) {
  if (!zone) return;
  const token = run('bash', ['-c', 'source "$HOME/.zsh_secrets" >/dev/null 2>&1; printf %s "${CLOUDFLARE_API_TOKEN:-}"'],
    { allowFail: true }).out;
  if (!token) { log('WARNING: no CLOUDFLARE_API_TOKEN — purge the zone by hand'); return; }
  const out = run('curl', ['-sS', '-m', '20', '-X', 'POST',
    `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`,
    '-H', `Authorization: Bearer ${token}`, '-H', 'Content-Type: application/json',
    '--data', '{"purge_everything":true}'], { allowFail: true }).out;
  log(/"success":\s*true/.test(out) ? 'Cloudflare cache purged' : 'WARNING: Cloudflare purge failed');
}

function swapSymlink(link, target) {
  sudo('ln', ['-sfn', target, `${link}.tmp`]);
  sudo('mv', ['-T', `${link}.tmp`, link]);
}

// Hooks push their undo functions as they go, so a caller can restore the old unit first
// and only then unwind hooks (a worker guard must see its pinned API running again).
async function runHooks(ctx, undo) {
  for (const name of ctx.side.hooks ?? []) {
    const hook = hooks[name];
    if (!hook) throw new ReleaseError(`unknown hook ${name}`);
    log(`${ctx.config.app}: hook ${name}`);
    await hook.after(ctx, (fn) => undo.push(fn));
  }
}

const strategies = {
  async 'web-symlink'({ config, name, side, release, live }) {
    const target = `${config.releaseRoot}/${release}/${side.switch.dir ?? name}`;
    const previous = sudo('readlink', [side.switch.link]).out;
    if (previous === target) { log(`${name} already on ${release}`); return null; }
    log(`${config.app}: ${name} ${previous} -> ${target}`);
    swapSymlink(side.switch.link, target);
    const undo = async () => { swapSymlink(side.switch.link, previous); purgeCloudflare(side.cloudflareZone); };
    purgeCloudflare(side.cloudflareZone);
    try { await checkHealth(side, { wait: 5 }); } catch (error) { await undo(); throw error; }
    return undo;
  },

  async 'instance-swap'(ctx) {
    const { config, name, side, release, live, sha } = ctx;
    const oldUnit = live.unit;
    const newUnit = fill(side.switch.unit, { release });
    if (oldUnit === newUnit) { log(`${name} already on ${release}`); return null; }
    // Per-instance files the unit template reads (e.g. myclinic's /etc/.../<release>.conf).
    let reload = false;
    for (const file of side.switch.instanceFiles ?? []) {
      const path = fill(file.path, { release });
      if (sudo('test', ['-e', path], { allowFail: true }).status === 0) continue;
      sudoWrite(path, fill(file.content, { release }), file.mode ?? '0644');
      reload ||= path.startsWith('/etc/systemd/');
    }
    if (reload) sudo('systemctl', ['daemon-reload']);
    const restoreOld = async () => {
      log(`${config.app}: restoring ${oldUnit}`);
      sudo('systemctl', ['stop', newUnit], { allowFail: true });
      sudo('systemctl', ['start', oldUnit]);
      sudo('systemctl', ['enable', '--quiet', oldUnit], { allowFail: true });
      sudo('systemctl', ['disable', '--quiet', newUnit], { allowFail: true });
    };
    // Single owner: never two API processes (shared state files, single-port bind policy).
    log(`${config.app}: ${name} stop ${oldUnit}, start ${newUnit}`);
    sudo('systemctl', ['stop', oldUnit]);
    try {
      sudo('systemctl', ['start', newUnit]);
      await checkHealth(side);
    } catch (error) { await restoreOld(); throw error; }
    const hookUndo = [];
    const undoHooks = async () => { for (const fn of [...hookUndo].reverse()) await fn?.(); };
    try { await runHooks({ ...ctx, oldUnit, newUnit }, hookUndo); }
    catch (error) { await restoreOld(); await undoHooks(); throw error; }
    sudo('systemctl', ['enable', '--quiet', newUnit]);
    sudo('systemctl', ['disable', '--quiet', oldUnit]);
    return async () => { await restoreOld(); await undoHooks(); };
  },

  async 'symlink-restart'({ config, name, side, release }) {
    const target = `${config.releaseRoot}/${release}`;
    const previous = sudo('readlink', [side.switch.link]).out;
    if (previous === target) { log(`${name} already on ${release}`); return null; }
    log(`${config.app}: ${name} ${previous} -> ${target}, restart ${side.switch.unit}`);
    swapSymlink(side.switch.link, target);
    const undo = async () => {
      swapSymlink(side.switch.link, previous);
      sudo('systemctl', ['restart', side.switch.unit]);
    };
    try {
      sudo('systemctl', ['restart', side.switch.unit]);
      await checkHealth(side);
    } catch (error) { await undo(); throw error; }
    return undo;
  },
};

export async function switchSides(config, { release, sha, sides, live, order }) {
  const done = [];
  try {
    for (const name of order.filter((n) => sides.includes(n))) {
      const side = config.sides[name];
      const strategy = strategies[side.switch.type];
      if (!strategy) throw new ReleaseError(`side ${name} uses ${side.switch.type}, which cannot be switched automatically`);
      const undo = await strategy({ config, name, side, release, sha, live: live[name] });
      if (undo) done.push({ name, undo });
    }
  } catch (error) {
    for (const { name, undo } of done.reverse()) {
      log(`${config.app}: rolling back ${name}`);
      try { await undo(); } catch (inner) { log(`ROLLBACK OF ${name} FAILED: ${inner.message}`); }
    }
    throw error;
  }
  return done.map((d) => d.name);
}
