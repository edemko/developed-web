// Pre-switch check: every inline <script> and inline event handler in the built index.html
// must already be allowed by the site's Content-Security-Policy hashes in the live Caddyfile.
// A missing hash means the new shell would be blocked by CSP — Caddy must be updated by hand.
import { createHash } from 'node:crypto';
import { ReleaseError, sudoRead } from '../lib/sh.mjs';

const hash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

export function inlineHashes(html) {
  const scripts = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs) || !body.trim()) continue;
    const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    scripts.push(hash(body));
  }
  const handlers = [...html.matchAll(/\son[a-z]+\s*=\s*"([^"]*)"/gi)].map((m) => hash(m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'")));
  return { scripts: [...new Set(scripts)], handlers: [...new Set(handlers)] };
}

export function siteBlock(caddyfile, site) {
  const start = caddyfile.indexOf(`${site} `);
  if (start < 0) throw new ReleaseError(`site ${site} not found in Caddyfile`);
  const rest = caddyfile.slice(start);
  const end = rest.slice(1).search(/\nhttps?:\/\//);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

export function missingHashes(html, block) {
  const { scripts, handlers } = inlineHashes(html);
  return [...scripts, ...handlers].filter((h) => !block.includes(h));
}

export const cspHashes = {
  check({ config, side, releaseDir }) {
    const html = sudoRead(`${releaseDir}/${side.switch.dir ?? 'web'}/index.html`);
    const missing = missingHashes(html, siteBlock(sudoRead('/etc/caddy/Caddyfile'), side.csp.site));
    if (missing.length) {
      throw new ReleaseError(`${config.app}: built index.html needs CSP hashes not in the Caddyfile: ${missing.join(' ')}`);
    }
  },
};
