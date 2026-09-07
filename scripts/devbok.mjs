#!/usr/bin/env node
/**
 * devbok — deterministic helpers. Everything that must not depend on model judgment lives here:
 * slugs, manifests, version numbers, prompt rendering, validation, deletion, and the index that
 * devbok.html reads. No command in this file ever calls a model.
 *
 *   node scripts/devbok.mjs slug <text>                          print a filesystem-safe slug
 *   node scripts/devbok.mjs init <slug> --title T --topic X [--accent #rrggbb]   create topics/<slug>/topic.json
 *   node scripts/devbok.mjs prepare <slug> <kind> [--draft]      reserve next version, render the brief -> .devbok/ (draft: dry run, no version)
 *   node scripts/devbok.mjs record <slug> <kind> v<N> [--force]  validate written HTML, add to manifest, rebuild index
 *   node scripts/devbok.mjs validate <file> [--draft]            sanity-check a generated HTML file (JSON); --draft relaxes the size floor
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
const DEFAULT_ACCENT = '#a55da0'; // devbok's own accent, used when a topic has no brand colour set

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

// ---------------------------------------------------------------- accent colour
// The accent is a topic-level choice (its brand colour), shared by all of the topic's pages.
function normalizeAccent(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s ?? '').trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}
// A tint of the accent for dark backgrounds: same hue and saturation, lightness raised to at least 66%.
function darkAccent(hex) {
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
      accent: m.accent,
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
function validateHtml(file, { minBytes = MIN_BYTES } = {}) {
  const abs = path.resolve(ROOT, file);
  const r = { ok: false, file: rel(abs), bytes: 0, errors: [], warnings: [], counts: {}, external: [] };
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
  if (typeof opts.topic !== 'string' || !opts.topic.trim()) fail('usage: init <slug> --title "<short title>" --topic "<full topic text>" [--accent #rrggbb]');
  const topic = opts.topic.trim();
  const title = (typeof opts.title === 'string' && opts.title.trim()) || topic;
  const accent = opts.accent === undefined ? DEFAULT_ACCENT : normalizeAccent(opts.accent);
  if (!accent) fail(`invalid accent "${opts.accent}" - expected a 6-digit hex colour like #512bd4`);
  if (fs.existsSync(topicDir(slug))) fail(`topic "${slug}" already exists - use /devbok-update ${slug}`);
  const m = { slug, title, topic, accent, created: today(), kinds: Object.fromEntries(KINDS.map((k) => [k, emptyKind()])) };
  fs.mkdirSync(topicDir(slug), { recursive: true });
  writeManifest(m);
  buildIndex();
  json({ created: slug, title, topic, accent, manifest: rel(manifestPath(slug)) });
}

function cmdPrepare(args) {
  const draft = args.includes('--draft');
  const [slug, kind] = args.filter((a) => a !== '--draft');
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
  removeRenderedPrompts(slug, kind, v); // the rendered brief has served its purpose
  json({ recorded: { slug, kind, version: v, file: `topics/${slug}/${file}`, forced: force && !res.ok }, validation: res });
}

function cmdValidate(args) {
  const draft = args.includes('--draft');
  const [file] = args.filter((a) => a !== '--draft');
  if (!file) fail('usage: validate <file.html> [--draft]');
  const res = validateHtml(file, { minBytes: draft ? 8_000 : MIN_BYTES });
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
