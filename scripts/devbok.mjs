#!/usr/bin/env node
/**
 * devbok — deterministic helpers. Everything that must not depend on model judgment lives here:
 * slugs, manifests, version numbers, prompt rendering, validation, deletion, and the index that
 * devbok.html reads. No command in this file ever calls a model.
 *
 *   node scripts/devbok.mjs slug <text>                          print a filesystem-safe slug
 *   node scripts/devbok.mjs init <slug> --title T --topic X [--category C] [--accent #rrggbb]   create topics/<slug>/topic.json
 *   node scripts/devbok.mjs prepare <slug> <kind> [--draft]      reserve next version, render the brief -> .devbok/ (draft: dry run, no version)
 *   node scripts/devbok.mjs record <slug> <kind> v<N> [--force]  validate written HTML, add to manifest, rebuild index
 *   node scripts/devbok.mjs validate <file> [--draft]            check a generated file against the artifact contract (JSON); --draft relaxes the size floor
 *   node scripts/devbok.mjs delete <slug> [<kind> v<N>]          delete a whole topic, or one version of one kind
 *   node scripts/devbok.mjs list [--json]                        overview with staleness markers
 *   node scripts/devbok.mjs index                                rebuild topics/index.js
 *
 * kinds: study | experience | interview | cheatsheet.  Version numbers per kind only ever increase.
 * A brief is assembled from prompts/shared/template.md (the shape: {{include:name}} partials from prompts/shared/
 * and {{slot:name}} declarations) plus prompts/<kind>.md (pure content: blocks introduced by {{slot:name}}
 * marker lines), then {{PLACEHOLDERS}} are substituted.
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
const DRAFT_MIN_BYTES = 8_000; // a dry run is two units, so the floor that catches a truncated page is lower
const DEFAULT_ACCENT = '#a55da0'; // devbok's own accent, used when a topic has no brand colour set

const fail = (msg) => { releaseLock(); console.error(`devbok: ${msg}`); process.exit(1); };
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

// ---------------------------------------------------------------- concurrency
// Two sessions may run /devbok-update at the same time. Every command that mutates a manifest or the
// index runs under one lock (mkdir is atomic on every platform), and files are written atomically
// (temp file + rename) so a concurrent reader never sees a half-written JSON.
const LOCK_DIR = path.join(BUILD_DIR, '.lock');
const LOCK_TIMEOUT_MS = Number(process.env.DEVBOK_LOCK_TIMEOUT_MS) || 30_000;
const LOCK_STALE_MS = 120_000; // a lock older than this was left behind by a crash
let lockHeld = false;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { fs.rmdirSync(LOCK_DIR); } catch { /* already gone */ }
}
function withLock(fn) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try { fs.mkdirSync(LOCK_DIR); lockHeld = true; break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = 0;
      try { age = Date.now() - fs.statSync(LOCK_DIR).mtimeMs; } catch { continue; }
      if (age > LOCK_STALE_MS) { try { fs.rmdirSync(LOCK_DIR); } catch { /* raced */ } continue; }
      if (Date.now() > deadline) fail(`another devbok command has held the lock (${rel(LOCK_DIR)}) for ${Math.round(age / 1000)}s; retry, or remove it if nothing is running`);
      sleep(50);
    }
  }
  try { return fn(); } finally { releaseLock(); }
}
function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } finally {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); // a crash between write and rename must not litter topics/
  }
}

// ---------------------------------------------------------------- categories
// A topic belongs to exactly one category. It is the only grouping axis: the sidebar renders one section
// per category, in the order below (deliberately not alphabetical - it runs from close-to-the-code out to
// systems and then around the code, which is also the order you would revise in). The labels travel to the
// shell inside topics/index.js, so devbok.html stays free of the vocabulary.
//
// Placement answers "where would I go looking for this?", not "what is this technically about?" - EF Core
// is `data` because you revise it next to SQL, Kubernetes is `ops` even though the good questions about it
// are architectural. Keep the list short: more buckets than this and grouping degrades into a flat list.
export const CATEGORIES = {
  language: 'Languages',
  backend: 'Backend & APIs',
  frontend: 'Frontend',
  data: 'Data & storage',
  architecture: 'Architecture & design',
  ops: 'Cloud & DevOps',
  ai: 'AI engineering',
  practice: 'Practices',
  other: 'Other',
};
const DEFAULT_CATEGORY = 'other'; // also where an unknown or hand-mistyped category lands; nothing is ever hidden
function normalizeCategory(s) {
  const c = String(s ?? '').trim().toLowerCase();
  return Object.hasOwn(CATEGORIES, c) ? c : null;
}

// ---------------------------------------------------------------- accent colour
// The accent is a topic-level choice (its brand colour), shared by all of the topic's pages.
function normalizeAccent(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s ?? '').trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}
// A tint of the accent for dark backgrounds: same hue and saturation, lightness raised to at least 66%.
export function darkAccent(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  }
  const L = Math.max(l, 0.66);
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = L < 0.5 ? L * (1 + s) : L + s - L * s, p = 2 * L - q;
  const [R, G, B] = s === 0 ? [L, L, L] : [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  return '#' + [R, G, B].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- manifests
const topicDir = (slug) => path.join(TOPICS_DIR, slug);
const manifestPath = (slug) => path.join(topicDir(slug), 'topic.json');
const artifactName = (kind, v) => `${kind}.v${v}.html`;
const promptFile = (kind) => path.join(PROMPTS_DIR, `${kind}.md`);
const SHARED_DIR = path.join(PROMPTS_DIR, 'shared');
const TEMPLATE_FILE = path.join(SHARED_DIR, 'template.md'); // not a partial: it is the shape, and cannot be included
const DRAFT_FILE = path.join(SHARED_DIR, 'draft.md');       // not a partial either: prepended to a brief in draft (dry-run) mode
const INCLUDE_RE = /\{\{include:([a-z0-9-]+)\}\}/g;
const SLOT_RE = /\{\{slot:([a-z][a-z0-9-]*)\}\}/g;                   // a slot used in the template
const SLOT_MARKER_RE = /^\{\{slot:([a-z][a-z0-9-]*)\}\}[ \t]*\r?$/m;  // a marker line in a kind prompt

// {{include:name}} -> prompts/shared/<name>.md, nested allowed, cycles refused. Records names in `includes`.
function makeExpander(includes) {
  const expand = (text, from, stack) => text.replace(INCLUDE_RE, (all, name) => {
    if (name === 'template') throw new Error(`${rel(from)} includes {{include:template}}, but the template is the shape, not a partial`);
    const file = path.join(SHARED_DIR, `${name}.md`);
    if (stack.includes(name)) throw new Error(`circular include {{include:${name}}} via ${[...stack, name].join(' > ')}`);
    if (!fs.existsSync(file)) throw new Error(`${rel(from)} includes {{include:${name}}} but ${rel(file)} does not exist`);
    if (!includes.includes(name)) includes.push(name);
    return expand(fs.readFileSync(file, 'utf8').replace(/\s+$/, ''), file, [...stack, name]);
  });
  return expand;
}

// A kind prompt is a sequence of blocks, each introduced by a marker line `{{slot:name}}`. Returns
// { name: text } or null when the file has no markers at all (a free-form prompt, i.e. not devbok-ready).
function parseSlots(src, file) {
  const parts = src.split(SLOT_MARKER_RE); // [before, name, body, name, body, ...]
  if (parts.length === 1) return null;
  if (parts[0].trim()) throw new Error(`${rel(file)}: text before the first {{slot:...}} marker`);
  const slots = {};
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] in slots) throw new Error(`${rel(file)}: {{slot:${parts[i]}}} is filled twice`);
    slots[parts[i]] = parts[i + 1].trim();
  }
  return slots;
}

// prompts/template.md gives every brief its shape: it includes the shared partials and declares the slots;
// prompts/<kind>.md only fills those slots. Returns the assembled text with placeholders still unsubstituted,
// plus its hash - it covers template, partials and kind file, so editing any of them marks artifacts stale.
function loadTemplate(kind) {
  const pf = promptFile(kind);
  if (!fs.existsSync(pf)) throw new Error(`prompt file missing: ${rel(pf)}`);
  if (!fs.existsSync(TEMPLATE_FILE)) throw new Error(`template missing: ${rel(TEMPLATE_FILE)}`);
  const includes = [];
  const expand = makeExpander(includes);
  const template = expand(fs.readFileSync(TEMPLATE_FILE, 'utf8'), TEMPLATE_FILE, []);
  const declared = [...new Set([...template.matchAll(SLOT_RE)].map((m) => m[1]))];
  const slots = parseSlots(fs.readFileSync(pf, 'utf8'), pf);
  const list = (names) => names.map((s) => `{{slot:${s}}}`).join(', ');
  if (!slots) throw new Error(`${rel(pf)} is not devbok-ready: it has no {{slot:...}} markers (still a free-form prompt). ${rel(TEMPLATE_FILE)} expects: ${list(declared)}.`);
  const missing = declared.filter((s) => !(s in slots));
  if (missing.length) throw new Error(`${rel(pf)} is not devbok-ready: it does not fill ${list(missing)} declared by ${rel(TEMPLATE_FILE)}.`);
  const unknown = Object.keys(slots).filter((s) => !declared.includes(s));
  if (unknown.length) throw new Error(`${rel(pf)} fills ${list(unknown)}, which ${rel(TEMPLATE_FILE)} does not declare (it declares ${list(declared)}).`);
  const text = template.replace(SLOT_RE, (all, name) => expand(slots[name], pf, []));
  return { text, hash: sha8(text), includes, slots: declared };
}
function currentPromptHash(kind) {
  try { return loadTemplate(kind).hash; } catch { return null; }
}

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
  if (!m || Number(m[1]) < 1) fail(`invalid version "${s ?? ''}" - expected e.g. v2`);
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
  // Lenient on read, strict in init: a hand-mistyped category must never break the index, it just lands in "other".
  m.category = normalizeCategory(m.category) ?? DEFAULT_CATEGORY;
  m.accent = normalizeAccent(m.accent) ?? DEFAULT_ACCENT;
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
  writeAtomic(manifestPath(m.slug), JSON.stringify(m, null, 2) + '\n');
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
      category: m.category,
      accent: m.accent,
      created: m.created,
      kinds: Object.fromEntries(KINDS.map((k) => [k,
        [...m.kinds[k].versions].sort((a, b) => b.v - a.v).map((x) => ({
          v: x.v, generated: x.generated, prompt: x.prompt, file: `topics/${m.slug}/${x.file ?? artifactName(k, x.v)}`,
        })),
      ])),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  // The vocabulary travels with the index, so the shell can group and label without knowing any of it.
  const categories = Object.entries(CATEGORIES).map(([id, label]) => ({ id, label }));
  const body = '// generated by scripts/devbok.mjs - do not edit by hand (rebuild: node scripts/devbok.mjs index)\n' +
    `window.DEVBOK_CATEGORIES = ${JSON.stringify(categories, null, 2)};\n` +
    `window.DEVBOK_TOPICS = ${JSON.stringify(topics, null, 2)};\n`;
  writeAtomic(INDEX_FILE, body);
  return topics;
}

// ---------------------------------------------------------------- validation
// A file that sits where devbok puts its artifacts knows what it is: topics/<slug>/<kind>.v<N>.html, or
// .devbok/<slug>.<kind>.draft.html for a dry run. That identity turns the parts of prompts/shared/page.md
// spelled out as "verbatim" - title, hero, sidebar, provenance - into mechanical checks, so a generation
// that drifted is caught before `record` instead of never. A file anywhere else skips them.
function identify(abs) {
  const dir = path.dirname(abs);
  const base = path.basename(abs);
  let slug, kind, version;
  if (dir === BUILD_DIR) {
    const m = /^([a-z0-9-]+)\.([a-z]+)\.draft\.html$/.exec(base);
    if (!m) return null;
    [, slug, kind] = m;
    version = 'draft';
  } else if (path.dirname(dir) === TOPICS_DIR) {
    const m = /^([a-z]+)\.v(\d+)\.html$/.exec(base);
    if (!m) return null;
    slug = path.basename(dir);
    [, kind, version] = m;
  } else return null;
  if (!SLUG_RE.test(slug) || !KINDS.includes(kind)) return null;
  let title = null;
  try { title = JSON.parse(fs.readFileSync(manifestPath(slug), 'utf8')).title || null; } catch { /* no manifest: skip the checks that need the title */ }
  return { slug, kind, version, title };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', '#39': "'", '#183': '·', '#xb7': '·' };
// The text of an element as a human reads it: tags dropped, entities resolved, whitespace collapsed.
const textOf = (s) => String(s ?? '')
  .replace(/<[^>]*>/g, '')
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, e) => ENTITIES[e.toLowerCase()] ?? all)
  .replace(/\s+/g, ' ')
  .trim();

// Everything prompts/shared/page.md calls verbatim, checked against the file's own identity.
function checkDesign(html, id, r) {
  const err = (m) => r.errors.push(m);
  const page = 'prompts/shared/page.md';
  if (id.title) {
    const want = `${id.title} · ${id.kind} · devbok`;
    const title = textOf((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) ?? [])[1]);
    if (title !== want) err(`<title> must be "${want}" (found ${title ? `"${title}"` : 'none'}) - ${page}`);
    const h1 = textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) ?? [])[1]);
    if (h1 !== id.title) err(`the hero <h1> must be the topic title "${id.title}" - never with a kind suffix, never the full topic sentence (found ${h1 ? `"${h1}"` : 'none'})`);
  }
  const hero = (/<header[^>]*\bclass=["'][^"']*\bhero\b[^"']*["'][\s\S]*?<\/header>/i.exec(html) ?? [])[0];
  if (!hero) err(`no <header class="hero"> - the hero is verbatim in ${page}`);
  else for (const c of ['meta', 'summary', 'chips']) {
    if (!new RegExp(`class=["'][^"']*\\b${c}\\b`).test(hero)) err(`the hero has no <p class="${c}"> - the hero is verbatim in ${page}`);
  }
  if (!/<nav[^>]*\bclass=["'][^"']*\bside\b[^"']*["']/i.test(html)) err(`no <nav class="side"> - the sidebar is verbatim in ${page}`);
  if (!/<ol[^>]*\bclass=["'][^"']*\bunits\b[^"']*["']/i.test(html)) err(`no <ol class="units"> - the sidebar is verbatim in ${page}`);
  const numbers = [...html.matchAll(/<span class=["']n["']>([\s\S]*?)<\/span>/gi)].map((m) => textOf(m[1]));
  if (!numbers.length) err(`the sidebar has no <span class="n"> unit numbers - the sidebar is verbatim in ${page}`);
  else {
    const off = numbers.filter((n) => !/^\d{2,}$/.test(n));
    if (off.length) err(`sidebar unit numbers are two digits (01, 02, ...): found ${off.slice(0, 5).map((n) => `"${n}"`).join(', ')}`);
  }
  if (!/\baria-current=/i.test(html)) err('scrollspy must set aria-current="true" on the unit in view - the verbatim sidebar CSS styles nothing else');
  if (id.kind === 'cheatsheet' && !/@media\s+print/i.test(html)) err('a cheatsheet needs a @media print stylesheet (see AGENTS.md, Artifact contract)');
  // One code palette for the whole knowledge base: the --hl-* tokens are the theme, so a cdnjs theme
  // stylesheet is not a second opinion, it is a light-only palette fighting them in dark mode.
  const theme = /https:\/\/cdnjs\.cloudflare\.com\/[^"']*\/styles\/[^"']+\.css/i.exec(html);
  if (theme) err(`links a highlight.js theme stylesheet (${theme[0]}) - only its script may be loaded; the palette is verbatim in ${page}`);
  const missing = ['--code', '--hl-kw', '--hl-str', '--hl-num', '--hl-cmt', '--hl-type', '--hl-fn', '--hl-attr'].filter((t) => !html.includes(`${t}:`));
  if (missing.length) err(`the code palette is missing ${missing.join(', ')} - the tokens and the .hljs rules are verbatim in ${page}`);
}

function validateHtml(file, { minBytes = MIN_BYTES } = {}) {
  const abs = path.resolve(ROOT, file);
  const id = identify(abs);
  const r = { ok: false, file: rel(abs), identity: id && { slug: id.slug, kind: id.kind, version: id.version }, bytes: 0, errors: [], warnings: [], counts: {}, external: [] };
  if (!fs.existsSync(abs)) { r.errors.push('file not found'); return r; }
  const html = fs.readFileSync(abs, 'utf8');
  const count = (re) => (html.match(re) ?? []).length;
  r.bytes = Buffer.byteLength(html);
  if (r.bytes < minBytes) r.errors.push(`only ${r.bytes} bytes - a real artifact is far larger; looks truncated or a stub`);
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
  if (r.counts.checkboxes) r.warnings.push(`${r.counts.checkboxes} checkbox(es) - progress tracking ("mark as studied") is not wanted; the page partial forbids it`);
  r.external = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
  const offHost = r.external.filter((u) => !/^https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(u));
  if (offHost.length) r.warnings.push(`external resources outside cdnjs / Google Fonts: ${offHost.join(', ')}`);
  // CSS patterns that produce a horizontal scrollbar (seen in real generations); the rule lives in prompts/shared/page.md.
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  for (const rule of css.split('}')) {
    const [selector, decls = ''] = rule.split('{');
    if (!selector || !decls) continue;
    const sel = selector.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (/\bcode\b/.test(sel) && !/\bpre\b/.test(sel) && /white-space\s*:\s*nowrap/.test(decls)) {
      r.warnings.push(`inline code cannot wrap ("${sel.slice(0, 60)}" sets white-space: nowrap) - long snippets in prose force a horizontal scrollbar; use overflow-wrap: anywhere`);
    }
    if (/\btable\b/.test(sel) && /min-width\s*:\s*\d+px/.test(decls)) {
      r.warnings.push(`table with a fixed min-width ("${sel.slice(0, 60)}") - wrap tables in an overflow-x: auto container instead`);
    }
  }
  if (/\b100vw\b/.test(css)) r.warnings.push('100vw includes the scrollbar width and overflows the viewport; use 100%');
  // Provenance is the file's own record of what produced it: it must be present, and it must not disagree.
  const prov = /<!--\s*devbok\b([\s\S]*?)-->/.exec(html);
  if (!prov) r.errors.push('no "<!-- devbok" provenance comment (see AGENTS.md, Artifact contract)');
  else if (id) {
    for (const [k, want] of [['slug', id.slug], ['kind', id.kind], ['version', id.version]]) {
      const got = (new RegExp(`^[ \\t]*${k}:[ \\t]*(.*?)[ \\t]*$`, 'm').exec(prov[1]) ?? [])[1];
      if (got !== want) r.errors.push(`provenance ${k}: ${got === undefined ? 'missing' : `"${got}"`} - the file is ${want}`);
    }
  }
  if (/localStorage/.test(html)) {
    const prefix = id ? `devbok:${id.slug}:${id.kind}:v${id.version}:` : 'devbok:';
    if (!html.includes(prefix)) r.warnings.push(`uses localStorage without the "${prefix}" key prefix`);
  }
  if (id) checkDesign(html, id, r);
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
  if (typeof opts.topic !== 'string' || !opts.topic.trim()) fail('usage: init <slug> --title "<short title>" --topic "<full topic text>" [--category <category>] [--accent #rrggbb]');
  const topic = opts.topic.trim();
  const title = (typeof opts.title === 'string' && opts.title.trim()) || topic;
  const category = opts.category === undefined ? DEFAULT_CATEGORY : normalizeCategory(opts.category);
  if (!category) fail(`invalid category "${opts.category}" - expected one of: ${Object.keys(CATEGORIES).join(', ')}`);
  const accent = opts.accent === undefined ? DEFAULT_ACCENT : normalizeAccent(opts.accent);
  if (!accent) fail(`invalid accent "${opts.accent}" - expected a 6-digit hex colour like #512bd4`);
  if (fs.existsSync(topicDir(slug))) fail(`topic "${slug}" already exists - use /devbok-update ${slug}`);
  const m = { slug, title, topic, category, accent, created: today(), kinds: Object.fromEntries(KINDS.map((k) => [k, emptyKind()])) };
  fs.mkdirSync(topicDir(slug), { recursive: true });
  writeManifest(m);
  buildIndex();
  json({ created: slug, title, topic, category, accent, manifest: rel(manifestPath(slug)) });
}

function cmdPrepare(args) {
  const draft = args.includes('--draft');
  const rest = args.filter((a) => a !== '--draft');
  if (rest.length !== 2) fail('usage: prepare <slug> <kind> [--draft]');
  const [slug, kind] = rest;
  const m = readManifest(requireSlug(slug));
  requireKind(kind);
  let tpl;
  try { tpl = loadTemplate(kind); } catch (e) { fail(e.message); }
  if (draft && !fs.existsSync(DRAFT_FILE)) fail(`draft banner missing: ${rel(DRAFT_FILE)}`);
  const template = draft ? `${fs.readFileSync(DRAFT_FILE, 'utf8').trim()}\n\n${tpl.text}` : tpl.text;
  const missing = REQUIRED_PLACEHOLDERS.filter((p) => !template.includes(`{{${p}}}`));
  if (missing.length) {
    fail(`${rel(TEMPLATE_FILE)} (with its partials) does not contain ${missing.map((p) => `{{${p}}}`).join(', ')}; every brief needs them.\n` +
      '        See AGENTS.md, "Prompt contract". Nothing was changed.');
  }
  const k = m.kinds[kind];
  const v = draft ? null : k.next;                       // a draft reserves nothing
  const tag = draft ? 'draft' : `v${v}`;
  const output = draft
    ? posix(path.join(BUILD_DIR, `${slug}.${kind}.draft.html`)) // throwaway, git-ignored, viewable as devbok.html#slug/kind/draft
    : posix(path.join(topicDir(slug), artifactName(kind, v)));
  const hash = tpl.hash;
  const vars = {
    TOPIC: m.topic, TITLE: m.title, SLUG: slug, KIND: kind, VERSION: draft ? 'draft' : String(v), DATE: today(),
    OUTPUT: output, PROMPT_FILE: `${kind}.md`, PROMPT_HASH: hash,
    ACCENT: m.accent, ACCENT_DARK: darkAccent(m.accent),
  };
  const unknown = new Set();
  const rendered = template.replace(/\{\{([A-Z_]+)\}\}/g, (all, name) => {
    if (name in vars) return vars[name];
    unknown.add(name); return all;
  });
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const promptOut = path.join(BUILD_DIR, `${slug}.${kind}.${tag}.prompt.md`);
  fs.writeFileSync(promptOut, rendered);
  if (!draft) {
    k.next = v + 1;
    k.pending.push({ v, prompt: hash, started: today() });
    writeManifest(m);
  }
  if (unknown.size) console.error(`devbok: warning - unknown placeholder(s) left as-is: ${[...unknown].map((n) => `{{${n}}}`).join(', ')}`);
  json({ slug, kind, version: v, draft, output, prompt: rel(promptOut), promptHash: hash, accent: m.accent, includes: tpl.includes, slots: tpl.slots });
}

function cmdRecord(args) {
  const force = args.includes('--force');
  const rest = args.filter((a) => a !== '--force');
  if (rest.length > 3) fail('usage: record <slug> <kind> v<N> [--force]');
  const [slug, kind, vArg] = rest;
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
  removeRenderedPrompts(slug, kind, v); // the rendered brief has served its purpose
  json({ recorded: { slug, kind, version: v, file: `topics/${slug}/${file}`, forced: force && !res.ok }, validation: res });
}

function cmdValidate(args) {
  const draft = args.includes('--draft');
  const [file] = args.filter((a) => a !== '--draft');
  if (!file) fail('usage: validate <file.html> [--draft]');
  const res = validateHtml(file, { minBytes: draft ? DRAFT_MIN_BYTES : MIN_BYTES });
  json(res);
  if (!res.ok) process.exit(1);
}

function cmdDelete([slug, kind, vArg]) {
  requireSlug(slug);
  if (!fs.existsSync(topicDir(slug))) fail(`no such topic "${slug}"`);
  if (!kind) {
    fs.rmSync(topicDir(slug), { recursive: true, force: true });
    buildIndex();
    removeRenderedPrompts(slug);
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
  removeRenderedPrompts(slug, kind, v);
  console.log(`deleted ${slug} ${kind} v${v}`);
}

// Rendered briefs in .devbok/ exist only while a generation is pending; drop the ones for a recorded or
// deleted version (or, without kind/version, everything that belongs to the topic - drafts included).
function removeRenderedPrompts(slug, kind, v) {
  if (!fs.existsSync(BUILD_DIR)) return;
  const prefix = kind ? `${slug}.${kind}.v${v}.prompt.md` : `${slug}.`;
  for (const f of fs.readdirSync(BUILD_DIR)) {
    if (kind ? f === prefix : f.startsWith(prefix)) fs.rmSync(path.join(BUILD_DIR, f));
  }
}

function cmdList(args) {
  // Grouped the way the sidebar groups, so the table and the shell tell the same story.
  const rank = Object.keys(CATEGORIES);
  const rows = allManifests().sort((a, b) => rank.indexOf(a.category) - rank.indexOf(b.category) || a.title.localeCompare(b.title)).map((m) => {
    const row = { slug: m.slug, title: m.title, topic: m.topic, category: m.category };
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
  const header = ['slug', 'title', 'category', ...KINDS];
  const table = rows.map((r) => [r.slug, r.title, r.category, ...KINDS.map((k) => cell(r[k]))]);
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

// Mutating commands run under the lock; slug/validate/list only read (atomic writes keep their reads consistent).
const locked = (fn) => (args) => withLock(() => fn(args));
const COMMANDS = { slug: cmdSlug, init: locked(cmdInit), prepare: locked(cmdPrepare), record: locked(cmdRecord), validate: cmdValidate, delete: locked(cmdDelete), list: cmdList, index: locked(cmdIndex) };
const USAGE = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '');

// Only act as a command line when run as one: scripts/repo.test.mjs imports darkAccent from here to
// check that devbok.html tints its own accent exactly the way a topic's pages are tinted.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') { console.log(USAGE); process.exit(0); }
  if (!COMMANDS[cmd]) { console.error(`devbok: unknown command "${cmd}"\n${USAGE}`); process.exit(1); }
  COMMANDS[cmd](args);
}
