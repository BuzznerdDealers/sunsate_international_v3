/**
 * The only door this tool has to the source website, and it opens one way.
 *
 * The source is someone else's live site, managed by another dealer on another
 * platform. Everything here exists to make "read-only" a property of the code
 * rather than a promise in a README:
 *
 *  - GET and HEAD are the only methods that can leave this module. Anything
 *    else throws before a socket is opened.
 *  - robots.txt is fetched once and honoured for every path.
 *  - Requests are serialised with a delay between them, so a migration never
 *    looks like a load test to the site it is reading.
 *  - Responses are cached on disk, so a re-run, a retry or the --report-only
 *    pass costs the source nothing.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

export class SourceSiteError extends Error {
  constructor(message, { status = null, url = null, cause = null } = {}) {
    super(message);
    this.name = 'SourceSiteError';
    this.status = status;
    this.url = url;
    this.cause = cause;
  }
}

export class Fetcher {
  constructor({
    userAgent = 'BuzzNerd-BlogMigration/1.0 (+read-only content migration)',
    delayMs = 750,
    timeoutMs = 30000,
    retries = 3,
    cacheDir = null,
    respectRobots = true,
    log = () => {},
  } = {}) {
    this.userAgent = userAgent;
    this.delayMs = delayMs;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.cacheDir = cacheDir;
    this.respectRobots = respectRobots;
    this.log = log;
    this.stats = { requests: 0, cacheHits: 0, bytes: 0 };
    this._lastAt = 0;
    this._robots = new Map();
  }

  _cachePath(url, kind) {
    if (!this.cacheDir) return null;
    const key = createHash('sha256').update(url).digest('hex').slice(0, 32);
    return join(this.cacheDir, kind, `${key}.${kind === 'bin' ? 'bin' : 'txt'}`);
  }

  async _throttle() {
    const wait = this._lastAt + this.delayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this._lastAt = Date.now();
  }

  /** Fetch and cache /robots.txt, then answer whether a path may be read. */
  async allowed(url) {
    if (!this.respectRobots) return true;
    const target = new URL(url);
    const origin = target.origin;
    if (!this._robots.has(origin)) {
      let rules = [];
      try {
        const res = await this._raw(`${origin}/robots.txt`, 'GET', { noRobots: true });
        rules = parseRobots(res.body, this.userAgent);
      } catch {
        // No robots.txt, or it could not be read: the default on the open web
        // is that reading is allowed.
        rules = [];
      }
      this._robots.set(origin, rules);
    }
    return isAllowed(this._robots.get(origin), target.pathname + target.search);
  }

  async _raw(url, method, { noRobots = false, binary = false } = {}) {
    if (!SAFE_METHODS.has(method)) {
      throw new SourceSiteError(
        `Refusing ${method} — this tool only ever reads the source site.`,
        { url },
      );
    }
    let lastError = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt) {
        const backoff = Math.min(16000, 1000 * 2 ** (attempt - 1));
        this.log(`  retry ${attempt}/${this.retries} in ${backoff}ms — ${url}`);
        await new Promise((r) => setTimeout(r, backoff));
      }
      await this._throttle();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': this.userAgent, accept: '*/*' },
        });
        this.stats.requests++;
        if (res.status === 404 || res.status === 410) {
          throw new SourceSiteError(`${res.status} ${res.statusText}`, {
            status: res.status,
            url,
          });
        }
        if (!res.ok) {
          lastError = new SourceSiteError(
            `HTTP ${res.status} ${res.statusText}${proxyHint(res.status)}`,
            { status: res.status, url },
          );
          // 4xx other than rate-limiting will not change on a retry.
          if (res.status < 500 && res.status !== 429) throw lastError;
          continue;
        }
        const payload = binary
          ? Buffer.from(await res.arrayBuffer())
          : await res.text();
        this.stats.bytes += payload.length;
        return {
          url: res.url || url,
          status: res.status,
          contentType: res.headers.get('content-type') || '',
          body: payload,
        };
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof SourceSiteError && err.status && err.status < 500 && err.status !== 429) {
          throw err;
        }
        lastError = err instanceof SourceSiteError
          ? err
          : new SourceSiteError(describeNetworkError(err, url), { url, cause: err });
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new SourceSiteError('request failed', { url });
  }

  /** GET a text resource, from cache when we already have it. */
  async text(url) {
    const cache = this._cachePath(url, 'txt');
    if (cache && existsSync(cache)) {
      this.stats.cacheHits++;
      const raw = JSON.parse(readFileSync(cache, 'utf8'));
      return raw;
    }
    if (!(await this.allowed(url))) {
      throw new SourceSiteError('blocked by the source site’s robots.txt', { url });
    }
    const res = await this._raw(url, 'GET');
    if (cache) {
      mkdirSync(dirname(cache), { recursive: true });
      writeFileSync(cache, JSON.stringify(res));
    }
    return res;
  }

  /** GET a binary resource (an image), from cache when we already have it. */
  async binary(url) {
    const cache = this._cachePath(url, 'bin');
    if (cache && existsSync(cache)) {
      this.stats.cacheHits++;
      const meta = JSON.parse(readFileSync(`${cache}.json`, 'utf8'));
      return { ...meta, body: readFileSync(cache) };
    }
    if (!(await this.allowed(url))) {
      throw new SourceSiteError('blocked by the source site’s robots.txt', { url });
    }
    const res = await this._raw(url, 'GET', { binary: true });
    if (cache) {
      mkdirSync(dirname(cache), { recursive: true });
      writeFileSync(cache, res.body);
      writeFileSync(
        `${cache}.json`,
        JSON.stringify({ url: res.url, status: res.status, contentType: res.contentType }),
      );
    }
    return res;
  }
}

/**
 * Turn a transport failure into something an operator can act on. An egress
 * policy denial and a dead host look identical in a stack trace and need
 * completely different responses, so they are named apart here.
 */
/**
 * A 403 or 407 from an egress proxy looks exactly like a 403 from the website,
 * and the two need opposite responses: one means run this somewhere else, the
 * other means the site refused us. Only the proxy's presence tells them apart,
 * so when there is one the possibility is named rather than guessed at.
 */
function proxyHint(status) {
  if (status !== 403 && status !== 407) return '';
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) return '';
  return (
    ' \u2014 this machine routes outbound HTTPS through a proxy'
    + ` (${proxy}), and a ${status} at this point usually means that proxy's egress`
    + ' policy does not allow the host, rather than the website refusing us.'
    + ' Run the migration from a machine with ordinary internet access.'
  );
}

export function describeNetworkError(err, url) {
  const host = safeHost(url);
  const text = `${err?.cause?.message || ''} ${err?.message || ''}`.toLowerCase();
  if (err?.name === 'AbortError') return `timed out reading ${host}`;
  if (text.includes('403') && text.includes('tunnel')) {
    return `blocked by the network egress policy for this machine (403 from the proxy on CONNECT ${host}). `
      + 'The source site is reachable from an ordinary network — run this tool where that host is allowed.';
  }
  if (text.includes('enotfound') || text.includes('getaddrinfo')) return `cannot resolve ${host}`;
  if (text.includes('econnrefused')) return `connection refused by ${host}`;
  if (text.includes('certificate') || text.includes('self-signed')) {
    return `TLS verification failed for ${host}`;
  }
  return `${err?.message || 'request failed'} (${host})`;
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The subset of robots.txt that matters: the group for us, or the * group. */
export function parseRobots(body, userAgent) {
  const lines = String(body).split(/\r?\n/);
  const groups = [];
  let current = null;
  const ua = String(userAgent).toLowerCase();
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const at = line.indexOf(':');
    if (at === -1) continue;
    const field = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === 'allow' || field === 'disallow')) {
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }
  const named = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const star = groups.find((g) => g.agents.includes('*'));
  return (named || star || { rules: [] }).rules;
}

/** Longest matching rule wins, which is what the specification says. */
export function isAllowed(rules, path) {
  let best = null;
  for (const rule of rules) {
    if (!rule.path) continue;
    const pattern = rule.path.replace(/\*+/g, '*');
    if (!matchRobots(pattern, path)) continue;
    if (!best || pattern.length > best.path.length) best = { ...rule, path: pattern };
  }
  return best ? best.allow : true;
}

function matchRobots(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*');
  let at = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const found = i === 0 ? (path.startsWith(part) ? 0 : -1) : path.indexOf(part, at);
    if (found === -1) return false;
    at = found + part.length;
  }
  return anchored ? at === path.length : true;
}
