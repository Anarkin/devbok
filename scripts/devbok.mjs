#!/usr/bin/env node
/**
 * devbok — deterministic helpers. Everything that must not depend on model judgment lives here:
 * slugs, manifests, version numbers, prompt rendering, validation, deletion, and the index that
 * devbok.html reads. No command in this file ever calls a model.
 *
 *   node scripts/devbok.mjs slug <text>                          print a filesystem-safe slug
 *   node scripts/devbok.mjs init <slug> --title T --topic X      create topics/<slug>/topic.json
 *   node scripts/devbok.mjs prepare <slug> <kind>                reserve next version, render prompts/<kind>.md -> .devbok/
 *   node scripts/devbok.mjs record <slug> <kind> v<N> [--force]  validate written HTML, add to manifest, rebuild index
 *   node scripts/devbok.mjs validate <file>                      sanity-check a generated HTML file (JSON)
 *   node scripts/devbok.mjs delete <slug> [<kind> v<N>]          delete a whole topic, or one version of one kind
 *   node scripts/devbok.mjs list [--json]                        overview with staleness markers
 *   node scripts/devbok.mjs index                                rebuild topics/index.js
 *
 * kinds: study | experience | interview | cheatsheet.  Version numbers per kind only ever increase.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// DEVBOK_ROOT overrides the repo root (used by the test suite to work in a temp directory).
const ROOT = process.env.DEVBOK_ROOT ? path.resolve(process.env.DEVBOK_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOPICS_DIR = path.join(ROOT, 'topics');
const PROMPTS_DIR = path.join(ROOT, 'prompts');
const BUILD_DIR = path.join(ROOT, '.devbok');
const INDEX_FILE = path.join(TOPICS_DIR, 'index.js');
const KINDS = ['study', 'experience', 'interview', 'cheatsheet'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const REQUIRED_PLACEHOLDERS = ['TOPIC', 'OUTPUT'];
const MIN_BYTES = 20_000;

const fail = (msg) => { console.error(`devbok: ${msg}`); process.exit(1); };
const today = () => new Date().toISOString().slice(0, 10);
const posix = (p) => p.split(path.sep).join('/');
const rel = (p) => posix(path.relative(ROOT, p));
const sha8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const json = (o) => console.log(JSON.stringify(o, null, 2));

// ---------------------------------------------------------------- slugs
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/c#/g, 'csharp')
    .replace(/f#/g, 'fsharp')
    .replace(/c\+\+/g, 'cpp')
    .replace(/(^|[^a-z0-9])\.net\b/g, '$1dotnet')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------- manifests
const topicDir = (slug) => path.join(TOPICS_DIR, slug);
const manifestPath = (slug) => path.join(topicDir(slug), 'topic.json');
const artifactName = (kind, v) => `${kind}.v${v}.html`;
const promptFile = (kind) => path.join(PROMPTS_DIR, `${kind}.md`);
const currentPromptHash = (kind) => (fs.existsSync(promptFile(kind)) ? sha8(fs.readFileSync(promptFile(kind), 'utf8')) : null);

function requireSlug(slug) {
  if (!slug || !SLUG_RE.test(slug)) fail(`invalid slug "${slug ?? ''}" - lowercase letters, digits and hyphens only`);
  return slug;
}
function requireKind(kind) {
  if (!KINDS.includes(kind)) fail(`invalid kind "${kind ?? ''}" - expected one of: ${KINDS.join(', ')}`);
  return kind;
}
function parseVersion(s) {
  const m = /^v?(\d+)$/i.exec(s ?? '');
  if (!m) fail(`invalid version "${s ?? ''}" - expected e.g. v2`);
  return Number(m[1]);
}
const emptyKind = () => ({ next: 1, versions: [], pending: [] });

function readManifest(slug) {
  requireSlug(slug);
  const file = manifestPath(slug);
  if (!fs.existsSync(file)) fail(`no such topic "${slug}" (expected ${rel(file)})`);
  let m;
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(`cannot parse ${rel(file)}: ${e.message}`); }
  m.slug = slug;
  m.kinds ??= {};
  for (const k of KINDS) {
    m.kinds[k] ??= emptyKind();
    m.kinds[k].versions ??= [];
    m.kinds[k].pending ??= [];
    m.kinds[k].next ??= 1;
    m.kinds[k].versions.sort((a, b) => a.v - b.v);
  }
  return m;
}
function writeManifest(m) {
  fs.writeFileSync(manifestPath(m.slug), JSON.stringify(m, null, 2) + '\n');
}
function allManifests() {
  if (!fs.existsSync(TOPICS_DIR)) return [];
  return fs.readdirSync(TOPICS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SLUG_RE.test(d.name) && fs.existsSync(manifestPath(d.name)))
    .map((d) => readManifest(d.name));
}

// ---------------------------------------------------------------- index (read by devbok.html via <script src>)
function buildIndex() {
  fs.mkdirSync(TOPICS_DIR, { recursive: true });
  const topics = allManifests()
    .map((m) => ({
      slug: m.slug,
      title: m.title,
      topic: m.topic,
      created: m.created,
      kinds: Object.fromEntries(KINDS.map((k) => [k,
        [...m.kinds[k].versions].sort((a, b) => b.v - a.v).map((x) => ({
          v: x.v, generated: x.generated, prompt: x.prompt, file: `topics/${m.slug}/${x.file ?? artifactName(k, x.v)}`,
        })),
      ])),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const body = '// generated by scripts/devbok.mjs - do not edit by hand (rebuild: node scripts/devbok.mjs index)\n' +
    `window.DEVBOK_TOPICS = ${JSON.stringify(topics, null, 2)};\n`;
  fs.writeFileSync(INDEX_FILE, body);
  return topics;
}

// ---------------------------------------------------------------- validation
function validateHtml(file) {
  const abs = path.resolve(ROOT, file);
  const r = { ok: false, file: rel(abs), bytes: 0, errors: [], warnings: [], counts: {}, external: [] };
  if (!fs.existsSync(abs)) { r.errors.push('file not found'); return r; }
  const html = fs.readFileSync(abs, 'utf8');
  const count = (re) => (html.match(re) ?? []).length;
  r.bytes = Buffer.byteLength(html);
  if (r.bytes < MIN_BYTES) r.errors.push(`only ${r.bytes} bytes - a real artifact is far larger; looks truncated or a stub`);
  if (!/^\s*<!doctype html>/i.test(html)) r.errors.push('must start with <!doctype html>');
  if (!/<\/html>\s*$/i.test(html)) r.errors.push('must end with </html> - file looks truncated');
  for (const tag of ['details', 'section', 'table', 'div', 'script', 'style', 'pre']) {
    const o = count(new RegExp(`<${tag}\\b`, 'gi'));
    const c = count(new RegExp(`</${tag}>`, 'gi'));
    r.counts[tag] = o;
    if (o !== c) r.errors.push(`unbalanced <${tag}>: ${o} opening, ${c} closing`);
  }
  r.counts.h2 = count(/<h2\b/gi);
  r.counts.h3 = count(/<h3\b/gi);
  r.counts.checkboxes = count(/type=["']checkbox["']/gi);
  r.external = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
  const offHost = r.external.filter((u) => !/^https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(u));
  if (offHost.length) r.warnings.push(`external resources outside cdnjs / Google Fonts: ${offHost.join(', ')}`);
  if (!/<!--\s*devbok\b/.test(html)) r.warnings.push('no "<!-- devbok" provenance comment (see AGENTS.md, Artifact contract)');
  if (/localStorage/.test(html) && !/devbok:/.test(html)) r.warnings.push('uses localStorage without a "devbok:<slug>:<kind>:v<N>:" key prefix');
  r.ok = r.errors.length === 0;
  return r;
}

// ---------------------------------------------------------------- commands
function parseOpts(args) {
  const opts = {}; const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { opts[args[i].slice(2)] = args[i + 1] ?? true; i++; } else rest.push(args[i]);
  }
  return { opts, rest };
}

function cmdSlug(args) {
  if (!args.length) fail('usage: slug <text>');
  const s = slugify(args.join(' '));
  if (!s) fail(`cannot derive a slug from "${args.join(' ')}"`);
  console.log(s);
}

function cmdInit(args) {
  const { opts, rest } = parseOpts(args);
  const slug = requireSlug(rest[0]);
  if (typeof opts.topic !== 'string' || !opts.topic.trim()) fail('usage: init <slug> --title "<short title>" --topic "<full topic text>"');
  const topic = opts.topic.trim();
  const title = (typeof opts.title === 'string' && opts.title.trim()) || topic;
  if (fs.existsSync(topicDir(slug))) fail(`topic "${slug}" already exists - use /devbok-update ${slug}`);
  const m = { slug, title, topic, created: today(), kinds: Object.fromEntries(KINDS.map((k) => [k, emptyKind()])) };
  fs.mkdirSync(topicDir(slug), { recursive: true });
  writeManifest(m);
  buildIndex();
  json({ created: slug, title, topic, manifest: rel(manifestPath(slug)) });
}

function cmdPrepare([slug, kind]) {
  const m = readManifest(requireSlug(slug));
  requireKind(kind);
  const pf = promptFile(kind);
  if (!fs.existsSync(pf)) fail(`prompt file missing: ${rel(pf)}`);
  const template = fs.readFileSync(pf, 'utf8');
  const missing = REQUIRED_PLACEHOLDERS.filter((p) => !template.includes(`{{${p}}}`));
  if (missing.length) {
    fail(`${rel(pf)} is not devbok-ready: missing placeholder(s) ${missing.map((p) => `{{${p}}}`).join(', ')}.\n` +
      '        See AGENTS.md, "Prompt contract". Nothing was changed.');
  }
  const k = m.kinds[kind];
  const v = k.next;
  const file = artifactName(kind, v);
  const output = posix(path.join(topicDir(slug), file));
  const hash = sha8(template);
  const vars = {
    TOPIC: m.topic, TITLE: m.title, SLUG: slug, KIND: kind, VERSION: String(v), DATE: today(),
    OUTPUT: output, PROMPT_FILE: `${kind}.md`, PROMPT_HASH: hash,
  };
  const unknown = new Set();
  const rendered = template.replace(/\{\{([A-Z_]+)\}\}/g, (all, name) => {
    if (name in vars) return vars[name];
    unknown.add(name); return all;
  });
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const promptOut = path.join(BUILD_DIR, `${slug}.${kind}.v${v}.prompt.md`);
  fs.writeFileSync(promptOut, rendered);
  k.next = v + 1;
  k.pending.push({ v, prompt: hash, started: today() });
  writeManifest(m);
  if (unknown.size) console.error(`devbok: warning - unknown placeholder(s) left as-is: ${[...unknown].map((n) => `{{${n}}}`).join(', ')}`);
  json({ slug, kind, version: v, output, prompt: rel(promptOut), promptHash: hash });
}

function cmdRecord(args) {
  const force = args.includes('--force');
  const [slug, kind, vArg] = args.filter((a) => a !== '--force');
  const m = readManifest(requireSlug(slug));
  requireKind(kind);
  const v = parseVersion(vArg);
  const k = m.kinds[kind];
  if (k.versions.some((x) => x.v === v)) fail(`${slug} ${kind} v${v} is already recorded`);
  const file = artifactName(kind, v);
  const res = validateHtml(path.join(topicDir(slug), file));
  if (!res.ok && !force) {
    fail(`validation failed for ${res.file} (fix it, or re-run with --force):\n  - ${res.errors.join('\n  - ')}`);
  }
  const pi = k.pending.findIndex((x) => x.v === v);
  const pend = pi >= 0 ? k.pending.splice(pi, 1)[0] : null;
  if (v >= k.next) k.next = v + 1;
  k.versions.push({ v, generated: today(), prompt: pend?.prompt ?? currentPromptHash(kind), file });
  k.versions.sort((a, b) => a.v - b.v);
  writeManifest(m);
  buildIndex();
  json({ recorded: { slug, kind, version: v, file: `topics/${slug}/${file}`, forced: force && !res.ok }, validation: res });
}

function cmdValidate([file]) {
  if (!file) fail('usage: validate <file.html>');
  const res = validateHtml(file);
  json(res);
  if (!res.ok) process.exit(1);
}

function cmdDelete([slug, kind, vArg]) {
  requireSlug(slug);
  if (!fs.existsSync(topicDir(slug))) fail(`no such topic "${slug}"`);
  if (!kind) {
    fs.rmSync(topicDir(slug), { recursive: true, force: true });
    buildIndex();
    console.log(`deleted topic ${slug} (all kinds, all versions)`);
    return;
  }
  requireKind(kind);
  if (!vArg) fail('usage: delete <slug>            (whole topic)\n       delete <slug> <kind> v<N>  (one version)');
  const v = parseVersion(vArg);
  const m = readManifest(slug);
  const k = m.kinds[kind];
  const before = k.versions.length + k.pending.length;
  k.versions = k.versions.filter((x) => x.v !== v);
  k.pending = k.pending.filter((x) => x.v !== v);
  const f = path.join(topicDir(slug), artifactName(kind, v));
  const existed = fs.existsSync(f);
  if (existed) fs.rmSync(f);
  if (before === k.versions.length + k.pending.length && !existed) fail(`${slug} ${kind} v${v} not found`);
  writeManifest(m); // k.next is deliberately NOT decremented: version numbers are never reused
  buildIndex();
  console.log(`deleted ${slug} ${kind} v${v}`);
}

function cmdList(args) {
  const rows = allManifests().map((m) => {
    const row = { slug: m.slug, title: m.title, topic: m.topic };
    for (const k of KINDS) {
      const kk = m.kinds[k];
      const latest = kk.versions.at(-1);
      row[k] = latest
        ? { v: latest.v, generated: latest.generated, stale: latest.prompt !== currentPromptHash(k), count: kk.versions.length, pending: kk.pending.length }
        : { v: null, count: 0, pending: kk.pending.length };
    }
    return row;
  });
  if (args.includes('--json')) return json(rows);
  if (!rows.length) return console.log('no topics yet - create one with /devbok-new <topic>');
  const cell = (c) => {
    let s = c.v == null ? '-' : `v${c.v} ${c.generated}${c.stale ? ' *' : ''}${c.count > 1 ? ` (${c.count})` : ''}`;
    if (c.pending) s += ` (+${c.pending} pending)`;
    return s;
  };
  const header = ['slug', 'title', ...KINDS];
  const table = rows.map((r) => [r.slug, r.title, ...KINDS.map((k) => cell(r[k]))]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((t) => t[i].length)));
  const line = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const t of table) console.log(line(t));
  console.log('\n* = latest version was generated by an older prompt file   (n) = versions kept   pending = prepared but not recorded');
}

function cmdIndex() {
  const t = buildIndex();
  console.log(`wrote ${rel(INDEX_FILE)} (${t.length} topic${t.length === 1 ? '' : 's'})`);
}

const COMMANDS = { slug: cmdSlug, init: cmdInit, prepare: cmdPrepare, record: cmdRecord, validate: cmdValidate, delete: cmdDelete, list: cmdList, index: cmdIndex };
const USAGE = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '');

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || cmd === '--help' || cmd === '-h') { console.log(USAGE); process.exit(0); }
if (!COMMANDS[cmd]) { console.error(`devbok: unknown command "${cmd}"\n${USAGE}`); process.exit(1); }
COMMANDS[cmd](args);
