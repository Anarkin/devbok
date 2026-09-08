// Tests for scripts/devbok.mjs. Runs the CLI as a subprocess against a throwaway DEVBOK_ROOT,
// so every test starts from an empty repo layout with its own prompts/. No dependencies:
//   npm test        (or: node --test scripts/devbok.test.mjs)
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, darkAccent } from './devbok.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'devbok.mjs');
const KINDS = ['study', 'experience', 'interview', 'cheatsheet'];
const TODAY = new Date().toISOString().slice(0, 10);

let root;

// ---------------------------------------------------------------- helpers
function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, DEVBOK_ROOT: root } });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
}
function ok(args) {
  const r = run(args);
  assert.equal(r.code, 0, `expected success for: ${args.join(' ')}\nstderr: ${r.err}\nstdout: ${r.out}`);
  return r;
}
function bad(args, re) {
  const r = run(args);
  assert.notEqual(r.code, 0, `expected failure for: ${args.join(' ')}\nstdout: ${r.out}`);
  if (re) assert.match(r.err, re);
  return r;
}
// The test template mirrors the real one's job: it carries every placeholder and declares the slots.
const TEMPLATE =
  'TOPIC: {{TOPIC}}\n\n{{slot:goal}}\n\nWrite the file to {{OUTPUT}}.\n' +
  'slug={{SLUG}} kind={{KIND}} v={{VERSION}} date={{DATE}} title={{TITLE}} file={{PROMPT_FILE}} hash={{PROMPT_HASH}} accent={{ACCENT}} dark={{ACCENT_DARK}} keep={{NOT_A_VAR}}\n\n{{slot:content}}\n';
const readyPrompt = (kind) => `{{slot:goal}}\ngoal of ${kind}\n\n{{slot:content}}\ncontent of ${kind}\n`;
function freshRoot({ ready = KINDS } = {}) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'devbok-test-'));
  fs.mkdirSync(path.join(root, 'prompts', 'shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'prompts', 'shared', 'template.md'), TEMPLATE);
  fs.writeFileSync(path.join(root, 'prompts', 'shared', 'draft.md'), '## Draft mode\n\nkeep it small\n');
  for (const k of KINDS) {
    fs.writeFileSync(path.join(root, 'prompts', `${k}.md`), ready.includes(k) ? readyPrompt(k) : `TOPIC:\nold-style ${k} prompt without slots\n`);
  }
}
const p = (...parts) => path.join(root, ...parts);
const template = (text) => fs.writeFileSync(p('prompts', 'shared', 'template.md'), text);
const manifest = (slug) => JSON.parse(fs.readFileSync(p('topics', slug, 'topic.json'), 'utf8'));
function indexWindow() {
  const src = fs.readFileSync(p('topics', 'index.js'), 'utf8');
  const w = {};
  new Function('window', src)(w);
  return w;
}
const indexTopics = () => indexWindow().DEVBOK_TOPICS;
function html({ bytes = 25_000, provenance = true, head = '', extra = '', tail = '</body></html>' } = {}) {
  let body = '';
  while (Buffer.byteLength(body) < bytes) {
    body += '<section><h2>S</h2><p>' + 'lorem ipsum '.repeat(40) + '</p><details><summary>Q</summary><p>A</p></details></section>\n';
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>t</title>${head}</head><body>${provenance ? '<!-- devbok\nslug: x\n-->' : ''}${extra}${body}${tail}`;
}
// The code palette prompts/shared/page.md calls verbatim; validate wants every token declared.
const PALETTE = ':root { --code: color-mix(in srgb, var(--accent) 70%, var(--fg));' +
  ' --hl-kw: #a626a4; --hl-str: #50a14f; --hl-num: #986801; --hl-cmt: #6b6b6b;' +
  ' --hl-type: #0184bc; --hl-fn: #4078f2; --hl-attr: #986801; }';
// A page that satisfies the whole artifact contract, design checks included, so `record` accepts it.
// The validate tests below write their files outside topics/, where a file has no identity and only the
// structural checks apply.
function artifactHtml(slug, kind, v, { title, bytes = 25_000, head = '', extra = '' } = {}) {
  const name = title ?? manifest(slug).title;
  let filler = '';
  while (Buffer.byteLength(filler) < bytes) {
    filler += '<section><h2>01 S</h2><p>' + 'lorem ipsum '.repeat(40) + '</p><details><summary>Q</summary><p>A</p></details></section>\n';
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${name} · ${kind} · devbok</title>` +
    `<style>${PALETTE}${kind === 'cheatsheet' ? '@media print { .side { display: none } }' : ''}</style>${head}</head><body>` +
    `<!-- devbok\nslug: ${slug}\nkind: ${kind}\nversion: ${v}\ntopic: "t"\nprompt: ${kind}.md@00000000\ngenerated: 2026-01-01\n-->` +
    '<nav class="side" aria-label="Units"><ol class="units"><li><a href="#u01" aria-current="true"><span class="n">01</span><span class="t">First</span></a></li></ol><footer>f</footer></nav>' +
    `<header class="hero"><h1>${name}</h1><p class="meta">m</p><p class="summary">s</p><p class="chips"><span class="chip">c</span></p></header>` +
    `${extra}${filler}</body></html>`;
}
function writeArtifact(slug, kind, v, content) {
  fs.writeFileSync(p('topics', slug, `${kind}.v${v}.html`), content ?? artifactHtml(slug, kind, v));
}
const initTopic = (slug = 's', topic = 'Some Topic (full text, with & and parentheses)', title = 'Some Topic') =>
  ok(['init', slug, '--title', title, '--topic', topic]);

beforeEach(() => freshRoot());
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

// ---------------------------------------------------------------- slug
describe('slug', () => {
  const cases = [
    ['c#', 'csharp'],
    ['F# / C++', 'fsharp-cpp'],
    ['.NET runtime', 'dotnet-runtime'],
    ['ASP.NET Core & .NET runtime (focus on the framework)', 'asp-net-core-and-dotnet-runtime-focus-on-the-framework'],
    ['  System   Design!!  ', 'system-design'],
    ['SQL Server and PostgreSQL', 'sql-server-and-postgresql'],
  ];
  for (const [input, expected] of cases) {
    test(`"${input}" -> ${expected}`, () => assert.equal(ok(['slug', input]).out.trim(), expected));
  }
  test('joins multiple args with spaces', () => assert.equal(ok(['slug', 'system', 'design']).out.trim(), 'system-design'));
  test('fails when nothing usable remains', () => bad(['slug', '###'], /cannot derive a slug/));
  test('fails without text', () => bad(['slug'], /usage/));
});

// ---------------------------------------------------------------- init
describe('init', () => {
  test('creates the manifest with all kinds at next=1 and rebuilds the index', () => {
    const r = initTopic('csharp', 'C# (the language)', 'C#').json();
    assert.equal(r.created, 'csharp');
    const m = manifest('csharp');
    assert.equal(m.slug, 'csharp');
    assert.equal(m.title, 'C#');
    assert.equal(m.topic, 'C# (the language)');
    assert.equal(m.created, TODAY);
    assert.deepEqual(Object.keys(m.kinds), KINDS);
    for (const k of KINDS) assert.deepEqual(m.kinds[k], { next: 1, versions: [], pending: [] });
    const idx = indexTopics();
    assert.equal(idx.length, 1);
    assert.equal(idx[0].slug, 'csharp');
    assert.equal(idx[0].topic, 'C# (the language)');
    for (const k of KINDS) assert.deepEqual(idx[0].kinds[k], []);
  });
  test('stores a normalized accent, defaults to devbok purple, rejects junk', () => {
    ok(['init', 'a', '--title', 'A', '--topic', 'A', '--accent', '512BD4']);
    assert.equal(manifest('a').accent, '#512bd4');
    ok(['init', 'b', '--title', 'B', '--topic', 'B']);
    assert.equal(manifest('b').accent, '#a55da0');
    bad(['init', 'c', '--topic', 'C', '--accent', 'purple'], /invalid accent/);
    assert.equal(fs.existsSync(p('topics', 'c')), false);
    assert.deepEqual(indexTopics().map((t) => [t.slug, t.accent]), [['a', '#512bd4'], ['b', '#a55da0']]);
  });
  test('stores a category, defaults to other, rejects one outside the vocabulary', () => {
    ok(['init', 'a', '--title', 'A', '--topic', 'A', '--category', ' Frontend ']);
    assert.equal(manifest('a').category, 'frontend', 'trimmed and lower-cased');
    ok(['init', 'b', '--title', 'B', '--topic', 'B']);
    assert.equal(manifest('b').category, 'other');
    bad(['init', 'c', '--topic', 'C', '--category', 'databases'], /invalid category.*language, backend/s);
    assert.equal(fs.existsSync(p('topics', 'c')), false);
    assert.deepEqual(indexTopics().map((t) => [t.slug, t.category]), [['a', 'frontend'], ['b', 'other']]);
  });
  test('title defaults to the topic text', () => {
    ok(['init', 's', '--topic', 'Only a topic']);
    assert.equal(manifest('s').title, 'Only a topic');
  });
  test('trims the topic text', () => {
    ok(['init', 's', '--topic', '  padded  ']);
    assert.equal(manifest('s').topic, 'padded');
  });
  test('rejects invalid slugs', () => {
    bad(['init', 'Bad Slug', '--topic', 'x'], /invalid slug/);
    bad(['init', '-leading', '--topic', 'x'], /invalid slug/);
    bad(['init', 'c#', '--topic', 'x'], /invalid slug/);
  });
  test('rejects a missing or empty topic', () => {
    bad(['init', 's'], /usage: init/);
    bad(['init', 's', '--topic', '   '], /usage: init/);
  });
  test('refuses to overwrite an existing topic', () => {
    initTopic('s');
    bad(['init', 's', '--topic', 'again'], /already exists/);
    assert.equal(manifest('s').topic, 'Some Topic (full text, with & and parentheses)');
  });
});

// ---------------------------------------------------------------- prepare
describe('prepare', () => {
  test('refuses a free-form prompt (no slot markers) and changes nothing', () => {
    fs.rmSync(root, { recursive: true, force: true });
    freshRoot({ ready: ['experience'] });
    initTopic('s');
    const r = bad(['prepare', 's', 'study'], /prompts\/study\.md is not devbok-ready: it has no \{\{slot:/);
    assert.match(r.err, /expects: \{\{slot:goal\}\}, \{\{slot:content\}\}/);
    assert.equal(manifest('s').kinds.study.next, 1);
    assert.deepEqual(manifest('s').kinds.study.pending, []);
    assert.deepEqual(fs.existsSync(p('.devbok')) ? fs.readdirSync(p('.devbok')) : [], [], 'no brief was written');
    ok(['prepare', 's', 'experience']); // the ready one still works
  });
  test('refuses a prompt that leaves a declared slot unfilled', () => {
    fs.writeFileSync(p('prompts', 'study.md'), '{{slot:goal}}\nonly the goal\n');
    initTopic('s');
    bad(['prepare', 's', 'study'], /not devbok-ready: it does not fill \{\{slot:content\}\}/);
    assert.equal(manifest('s').kinds.study.next, 1);
  });
  test('rejects malformed slot files outright (not a readiness problem)', () => {
    initTopic('s');
    fs.writeFileSync(p('prompts', 'study.md'), '{{slot:goal}}\ng\n{{slot:content}}\nc\n{{slot:extra}}\ne\n');
    const r = bad(['prepare', 's', 'study'], /fills \{\{slot:extra\}\}, which prompts\/shared\/template\.md does not declare/);
    assert.doesNotMatch(r.err, /not devbok-ready/);
    fs.writeFileSync(p('prompts', 'study.md'), 'stray text\n{{slot:goal}}\ng\n{{slot:content}}\nc\n');
    bad(['prepare', 's', 'study'], /text before the first \{\{slot:/);
    fs.writeFileSync(p('prompts', 'study.md'), '{{slot:goal}}\ng\n{{slot:goal}}\ng2\n{{slot:content}}\nc\n');
    bad(['prepare', 's', 'study'], /\{\{slot:goal\}\} is filled twice/);
    assert.equal(manifest('s').kinds.study.next, 1);
  });
  test('fails when the template is missing or lacks a required placeholder', () => {
    initTopic('s');
    template('TOPIC: {{TOPIC}}\n{{slot:goal}}\n{{slot:content}}\n');
    const r = bad(['prepare', 's', 'study'], /prompts\/shared\/template\.md .*\{\{OUTPUT\}\}/);
    assert.doesNotMatch(r.err, /not devbok-ready/);
    fs.rmSync(p('prompts', 'shared', 'template.md'));
    bad(['prepare', 's', 'study'], /template missing: prompts\/shared\/template\.md/);
    assert.equal(manifest('s').kinds.study.next, 1);
  });
  test('fails on a missing prompt file', () => {
    fs.rmSync(p('prompts', 'interview.md'));
    initTopic('s');
    bad(['prepare', 's', 'interview'], /prompt file missing/);
  });
  test('renders placeholders, reserves the version and records it as pending', () => {
    initTopic('s', 'Full topic text', 'Short title');
    const r = ok(['prepare', 's', 'study']);
    const j = r.json();
    assert.equal(j.version, 1);
    assert.equal(j.kind, 'study');
    assert.match(j.output, /\/topics\/s\/study\.v1\.html$/);
    assert.equal(j.prompt, '.devbok/s.study.v1.prompt.md');
    assert.match(j.promptHash, /^[0-9a-f]{8}$/);
    const rendered = fs.readFileSync(p(j.prompt), 'utf8');
    assert.match(rendered, /^TOPIC: Full topic text$/m);
    assert.ok(rendered.includes(`Write the file to ${j.output}.`));
    assert.ok(rendered.includes(`slug=s kind=study v=1 date=${TODAY} title=Short title file=study.md hash=${j.promptHash}`));
    assert.ok(rendered.includes('keep={{NOT_A_VAR}}'), 'unknown placeholders are left untouched');
    assert.match(r.err, /unknown placeholder.*NOT_A_VAR/);
    assert.deepEqual(j.slots, ['goal', 'content']);
    const at = (s) => rendered.indexOf(s);
    assert.ok(at('TOPIC:') < at('goal of study') && at('goal of study') < at('Write the file'), 'slot content lands where the template declares it');
    assert.ok(rendered.endsWith('content of study\n'));
    assert.doesNotMatch(rendered, /\{\{slot:/);
    const k = manifest('s').kinds.study;
    assert.equal(k.next, 2);
    assert.deepEqual(k.pending, [{ v: 1, prompt: j.promptHash, started: TODAY }]);
    assert.deepEqual(k.versions, []);
    assert.deepEqual(indexTopics()[0].kinds.study, [], 'pending versions never reach the index');
  });
  test('renders the topic accent and a lighter dark-mode tint of it', () => {
    ok(['init', 's', '--topic', 'S', '--accent', '#512bd4']);
    const j = ok(['prepare', 's', 'study']).json();
    assert.equal(j.accent, '#512bd4');
    const m = /accent=(#[0-9a-f]{6}) dark=(#[0-9a-f]{6})/.exec(fs.readFileSync(p(j.prompt), 'utf8'));
    assert.ok(m, 'both accent placeholders substituted');
    assert.equal(m[1], '#512bd4');
    const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b);
    assert.ok(lum(m[2]) > lum(m[1]), `dark-mode tint ${m[2]} must be lighter than ${m[1]}`);
  });
  test('a light accent stays as-is in dark mode; a manifest without accent gets the default', () => {
    ok(['init', 's', '--topic', 'S', '--accent', '#cccccc']);
    let rendered = fs.readFileSync(p(ok(['prepare', 's', 'study']).json().prompt), 'utf8');
    assert.match(rendered, /accent=#cccccc dark=#cccccc/);
    const m = manifest('s');
    delete m.accent;
    fs.writeFileSync(p('topics', 's', 'topic.json'), JSON.stringify(m));
    rendered = fs.readFileSync(p(ok(['prepare', 's', 'study']).json().prompt), 'utf8');
    assert.match(rendered, /accent=#a55da0 dark=#[0-9a-f]{6}/);
  });
  test('--draft renders a dry-run brief into .devbok/ and reserves nothing', () => {
    initTopic('s');
    const j = ok(['prepare', 's', 'study', '--draft']).json();
    assert.equal(j.draft, true);
    assert.equal(j.version, null);
    assert.equal(j.output, `${root.split(path.sep).join('/')}/.devbok/s.study.draft.html`);
    assert.equal(j.prompt, '.devbok/s.study.draft.prompt.md');
    const rendered = fs.readFileSync(p(j.prompt), 'utf8');
    assert.match(rendered, /^## Draft mode\n\nkeep it small\n\nTOPIC: /, 'the draft banner comes first, then the normal brief');
    assert.ok(rendered.includes('v=draft'), 'the VERSION placeholder reads "draft"');
    assert.ok(rendered.includes(`Write the file to ${j.output}.`));
    const k = manifest('s').kinds.study;
    assert.equal(k.next, 1);
    assert.deepEqual(k.pending, []);
    assert.equal(ok(['prepare', 's', 'study']).json().version, 1, 'the real run still gets v1');
  });
  test('each prepare reserves the next number, per kind', () => {
    initTopic('s');
    assert.equal(ok(['prepare', 's', 'study']).json().version, 1);
    assert.equal(ok(['prepare', 's', 'study']).json().version, 2);
    assert.equal(ok(['prepare', 's', 'cheatsheet']).json().version, 1);
    const m = manifest('s');
    assert.equal(m.kinds.study.next, 3);
    assert.equal(m.kinds.cheatsheet.next, 2);
    assert.equal(m.kinds.study.pending.length, 2);
  });
  test('rejects unknown topics and kinds', () => {
    bad(['prepare', 'nope', 'study'], /no such topic/);
    initTopic('s');
    bad(['prepare', 's', 'notes'], /invalid kind/);
  });
  test('rejects stray arguments instead of quietly ignoring them', () => {
    initTopic('s');
    bad(['prepare', 's', 'study', 'v2'], /usage: prepare/);
    bad(['prepare', 's'], /usage: prepare/);
    assert.equal(manifest('s').kinds.study.next, 1, 'nothing was reserved');
  });
});

// ---------------------------------------------------------------- prepare: shared partials
describe('prepare: template, partials and slots', () => {
  const shared = (name, text) => { fs.mkdirSync(p('prompts', 'shared'), { recursive: true }); fs.writeFileSync(p('prompts', 'shared', `${name}.md`), text); };
  test('the template includes partials (nested); slot content may include partials too', () => {
    shared('delivery', 'Write to {{OUTPUT}}.\n\n');
    shared('outer', 'outer[{{include:inner}}]\n');
    shared('inner', 'inner {{DATE}}');
    shared('tip', 'a tip');
    template('TOPIC: {{TOPIC}}\n{{include:delivery}}\n{{slot:goal}}\n{{include:outer}}\n{{slot:content}}\n');
    fs.writeFileSync(p('prompts', 'study.md'), '{{slot:goal}}\nG {{include:tip}}\n\n{{slot:content}}\nC\n');
    initTopic('s', 'The topic');
    const j = ok(['prepare', 's', 'study']).json();
    assert.deepEqual(j.includes, ['delivery', 'outer', 'inner', 'tip']);
    assert.deepEqual(j.slots, ['goal', 'content']);
    const rendered = fs.readFileSync(p(j.prompt), 'utf8');
    assert.equal(rendered, `TOPIC: The topic\nWrite to ${j.output}.\nG a tip\nouter[inner ${TODAY}]\nC\n`);
  });
  test('a required placeholder may live in a partial', () => {
    shared('delivery', '{{OUTPUT}}');
    template('{{TOPIC}} {{include:delivery}} {{slot:goal}} {{slot:content}}');
    initTopic('s');
    assert.equal(ok(['prepare', 's', 'study']).json().version, 1);
  });
  test('a missing or circular partial is refused before anything changes', () => {
    shared('a', '{{include:b}}');
    shared('b', '{{include:a}}');
    initTopic('s');
    template(TEMPLATE + '{{include:nope}}\n');
    bad(['prepare', 's', 'study'], /prompts\/shared\/template\.md includes \{\{include:nope\}\} but prompts\/shared\/nope\.md does not exist/);
    template(TEMPLATE + '{{include:a}}\n');
    bad(['prepare', 's', 'study'], /circular include \{\{include:a\}\} via a > b > a/);
    template(TEMPLATE);
    fs.writeFileSync(p('prompts', 'study.md'), readyPrompt('study') + '{{include:nope}}\n');
    bad(['prepare', 's', 'study'], /prompts\/study\.md includes \{\{include:nope\}\}/);
    assert.equal(manifest('s').kinds.study.next, 1);
    assert.deepEqual(fs.existsSync(p('.devbok')) ? fs.readdirSync(p('.devbok')) : [], [], 'no brief was written');
  });
  test('editing the template or a partial marks every kind stale; editing a kind file only that kind', () => {
    shared('q', 'quality v1');
    template(TEMPLATE + '{{include:q}}\n');
    initTopic('s');
    for (const k of ['study', 'experience']) { ok(['prepare', 's', k]); writeArtifact('s', k, 1); ok(['record', 's', k, 'v1']); }
    const stale = () => { const [row] = ok(['list', '--json']).json(); return [row.study.stale, row.experience.stale]; };
    assert.deepEqual(stale(), [false, false]);
    shared('q', 'quality v2');
    assert.deepEqual(stale(), [true, true], 'partial edit');
    shared('q', 'quality v1');
    assert.deepEqual(stale(), [false, false], 'restored');
    fs.appendFileSync(p('prompts', 'study.md'), '\nmore\n');
    assert.deepEqual(stale(), [true, false], 'kind file edit');
    template(TEMPLATE + '{{include:q}}\n\nextra\n');
    assert.deepEqual(stale(), [true, true], 'template edit');
  });
  test('a partial that breaks later shows as stale instead of crashing list', () => {
    shared('q', 'quality');
    template(TEMPLATE + '{{include:q}}\n');
    initTopic('s');
    ok(['prepare', 's', 'study']);
    writeArtifact('s', 'study', 1);
    ok(['record', 's', 'study', 'v1']);
    fs.rmSync(p('prompts', 'shared', 'q.md'));
    assert.match(ok(['list']).out, /^s\s+\S.*v1 \S+ \*/m);
    assert.equal(ok(['list', '--json']).json()[0].study.stale, true);
  });
});

// ---------------------------------------------------------------- concurrency
describe('concurrent commands (two sessions at once)', () => {
  const runAsync = (args, extraEnv = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, [SCRIPT, ...args], { env: { ...process.env, DEVBOK_ROOT: root, ...extraEnv } });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => resolve({ code, out, err }));
  });
  test('simultaneous prepares of the same kind hand out distinct versions', async () => {
    initTopic('s');
    const results = await Promise.all([1, 2, 3].map(() => runAsync(['prepare', 's', 'study'])));
    assert.ok(results.every((r) => r.code === 0), results.map((r) => r.err).join('\n'));
    assert.deepEqual(results.map((r) => JSON.parse(r.out).version).sort(), [1, 2, 3]);
    const k = manifest('s').kinds.study;
    assert.equal(k.next, 4);
    assert.deepEqual(k.pending.map((x) => x.v).sort(), [1, 2, 3]);
    assert.equal(fs.existsSync(p('.devbok', '.lock')), false, 'lock released');
  });
  test('simultaneous records on different topics all reach the index', async () => {
    for (const s of ['a', 'b', 'c']) { initTopic(s, `Topic ${s}`, s.toUpperCase()); writeArtifact(s, 'study', 1); }
    const results = await Promise.all(['a', 'b', 'c'].map((s) => runAsync(['record', s, 'study', 'v1'])));
    assert.ok(results.every((r) => r.code === 0), results.map((r) => r.err).join('\n'));
    assert.deepEqual(indexTopics().map((t) => [t.slug, t.kinds.study.length]), [['a', 1], ['b', 1], ['c', 1]]);
  });
  test('a stale lock is ignored; a live lock times out with a clear message; a failing command releases its lock', () => {
    initTopic('s');
    fs.mkdirSync(p('.devbok', '.lock'), { recursive: true });
    const old = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(p('.devbok', '.lock'), old, old);
    assert.equal(ok(['prepare', 's', 'study']).json().version, 1, 'stale lock removed and the command ran');
    fs.mkdirSync(p('.devbok', '.lock'));
    const r = spawnSync(process.execPath, [SCRIPT, 'prepare', 's', 'study'], { encoding: 'utf8', env: { ...process.env, DEVBOK_ROOT: root, DEVBOK_LOCK_TIMEOUT_MS: '300' } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /held the lock/);
    fs.rmdirSync(p('.devbok', '.lock'));
    bad(['record', 's', 'study', 'v1'], /file not found/);
    assert.equal(fs.existsSync(p('.devbok', '.lock')), false, 'a failure inside the locked region releases the lock');
  });
});

// ---------------------------------------------------------------- record
describe('record', () => {
  test('fails when the file was not written; the pending entry stays', () => {
    initTopic('s');
    ok(['prepare', 's', 'study']);
    bad(['record', 's', 'study', 'v1'], /file not found/);
    assert.equal(manifest('s').kinds.study.pending.length, 1);
  });
  test('moves a pending version to versions and publishes it in the index', () => {
    initTopic('s');
    const hash = ok(['prepare', 's', 'study']).json().promptHash;
    writeArtifact('s', 'study', 1);
    const r = ok(['record', 's', 'study', 'v1']).json();
    assert.equal(r.recorded.file, 'topics/s/study.v1.html');
    assert.equal(r.recorded.forced, false);
    assert.equal(r.validation.ok, true);
    const k = manifest('s').kinds.study;
    assert.deepEqual(k.pending, []);
    assert.deepEqual(k.versions, [{ v: 1, generated: TODAY, prompt: hash, file: 'study.v1.html' }]);
    const idx = indexTopics()[0].kinds.study;
    assert.deepEqual(idx, [{ v: 1, generated: TODAY, prompt: hash, file: 'topics/s/study.v1.html' }]);
  });
  test('keeps the prompt hash from prepare time even if the prompt changed meanwhile', () => {
    initTopic('s');
    const hash = ok(['prepare', 's', 'study']).json().promptHash;
    fs.appendFileSync(p('prompts', 'study.md'), '\nedited after prepare\n');
    writeArtifact('s', 'study', 1);
    ok(['record', 's', 'study', 'v1']);
    assert.equal(manifest('s').kinds.study.versions[0].prompt, hash);
    assert.match(ok(['list']).out, /v1 \S+ \*/, 'list marks it stale');
  });
  test('accepts a manually placed file and bumps next past it', () => {
    initTopic('s');
    writeArtifact('s', 'study', 5);
    ok(['record', 's', 'study', '5']); // "5" and "v5" are both accepted
    const k = manifest('s').kinds.study;
    assert.equal(k.next, 6);
    assert.equal(k.versions[0].v, 5);
    assert.match(k.versions[0].prompt, /^[0-9a-f]{8}$/);
  });
  test('refuses duplicates', () => {
    initTopic('s');
    writeArtifact('s', 'study', 1);
    ok(['record', 's', 'study', 'v1']);
    bad(['record', 's', 'study', 'v1'], /already recorded/);
  });
  test('refuses invalid HTML unless --force', () => {
    initTopic('s');
    writeArtifact('s', 'study', 1, '<!doctype html><html><body><div>stub');
    bad(['record', 's', 'study', 'v1'], /validation failed/);
    assert.deepEqual(manifest('s').kinds.study.versions, []);
    const r = ok(['record', 's', 'study', 'v1', '--force']).json();
    assert.equal(r.recorded.forced, true);
    assert.equal(r.validation.ok, false);
    assert.equal(manifest('s').kinds.study.versions.length, 1);
  });
  test('the index carries the accent and the same dark tint the pages get', () => {
    // The shell paints a topic in its own colour; the tint is derived here so no colour maths lives there.
    ok(['init', 'a', '--title', 'A', '--topic', 'Topic A', '--accent', '#512bd4']);
    const t = indexTopics().find((x) => x.slug === 'a');
    assert.equal(t.accent, '#512bd4');
    assert.equal(t.accentDark, darkAccent('#512bd4'));
  });
  test('index lists versions newest first', () => {
    initTopic('s');
    writeArtifact('s', 'study', 1);
    writeArtifact('s', 'study', 2);
    ok(['record', 's', 'study', 'v1']);
    ok(['record', 's', 'study', 'v2']);
    assert.deepEqual(indexTopics()[0].kinds.study.map((x) => x.v), [2, 1]);
    assert.deepEqual(manifest('s').kinds.study.versions.map((x) => x.v), [1, 2]);
  });
  test('removes the rendered brief once the version is recorded', () => {
    initTopic('s');
    const j = ok(['prepare', 's', 'study']).json();
    const other = ok(['prepare', 's', 'experience']).json().prompt;
    assert.equal(fs.existsSync(p(j.prompt)), true);
    writeArtifact('s', 'study', 1);
    ok(['record', 's', 'study', 'v1']);
    assert.equal(fs.existsSync(p(j.prompt)), false, 'recorded: brief removed');
    assert.equal(fs.existsSync(p(other)), true, 'still pending: brief kept');
  });
  test('rejects bad version syntax and stray arguments', () => {
    initTopic('s');
    bad(['record', 's', 'study', 'latest'], /invalid version/);
    bad(['record', 's', 'study'], /usage: record/); // a missing version is an arity problem, not a bad number
    bad(['record', 's', 'study', 'v0'], /invalid version/); // versions start at 1
    bad(['record', 's', 'study', 'v1', 'please'], /usage: record/);
  });
});

// ---------------------------------------------------------------- restamp
describe('restamp', () => {
  // The case this exists for: a prompt change lands, the artifact is brought onto it by hand instead of by
  // a half-hour regeneration, and `list` would otherwise star it forever.
  const stale = (slug, kind = 'study') => {
    ok(['prepare', slug, kind]);
    writeArtifact(slug, kind, 1);
    ok(['record', slug, kind, 'v1']);
    fs.writeFileSync(p('prompts', kind + '.md'), readyPrompt(kind) + '\nand one more requirement\n');
  };
  test('stamps a hand-patched artifact with the current prompt hash and clears the star', () => {
    initTopic('s');
    stale('s');
    const isStale = (kind) => JSON.parse(run(['list', '--json']).out)[0][kind].stale;
    assert.equal(isStale('study'), true, 'the prompt changed, so it starts out stale');
    const before = manifest('s').kinds.study.versions.at(-1).prompt;
    const r = ok(['restamp', 's']).json();
    const study = r.restamped.find((x) => x.kind === 'study');
    assert.equal(study.version, 1);
    assert.equal(study.from, before);
    const after = manifest('s').kinds.study.versions.at(-1);
    assert.equal(after.prompt, study.to);
    assert.notEqual(after.prompt, before);
    assert.equal(after.restamped, TODAY);
    assert.equal(isStale('study'), false, 'nothing is stale any more');
    assert.equal(indexTopics()[0].kinds.study[0].prompt, after.prompt, 'the index carries the new hash');
  });
  test('leaves the file alone: provenance is history, the manifest hash is conformance', () => {
    initTopic('s');
    stale('s');
    const file = p('topics', 's', 'study.v1.html');
    const before = fs.readFileSync(file, 'utf8');
    ok(['restamp', 's', 'study']);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  });
  test('refuses to stamp a page that fails validate, and exits 1', () => {
    initTopic('s');
    stale('s');
    fs.writeFileSync(p('topics', 's', 'study.v1.html'), artifactHtml('s', 'study', 1).replace('<p class="summary">s</p>', ''));
    const before = manifest('s').kinds.study.versions.at(-1).prompt;
    const r = bad(['restamp', 's', 'study']);
    const j = JSON.parse(r.out);
    assert.deepEqual(j.restamped, []);
    assert.match(j.skipped[0].why, /fails validate/);
    assert.ok(j.skipped[0].errors.some((e) => /summary/.test(e)));
    assert.equal(manifest('s').kinds.study.versions.at(-1).prompt, before, 'the hash is untouched');
    assert.equal(fs.existsSync(p('.devbok', '.lock')), false, 'exiting non-zero must still release the lock');
  });
  test('says why nothing happened: already current, or no version at all', () => {
    initTopic('s');
    ok(['prepare', 's', 'study']);
    writeArtifact('s', 'study', 1);
    ok(['record', 's', 'study', 'v1']);
    const j = ok(['restamp', 's']).json();
    assert.deepEqual(j.restamped, []);
    assert.match(j.skipped.find((x) => x.kind === 'study').why, /already stamped/);
    assert.match(j.skipped.find((x) => x.kind === 'interview').why, /no recorded version/);
  });
  test('only the named kind, and only the latest version: older ones keep their own history', () => {
    initTopic('s');
    for (const v of [1, 2]) {
      ok(['prepare', 's', 'study']);
      writeArtifact('s', 'study', v);
      ok(['record', 's', 'study', `v${v}`]);
    }
    stale('s', 'experience');
    const old = manifest('s').kinds.study.versions[0].prompt;
    const j = ok(['restamp', 's', 'experience']).json();
    assert.deepEqual(j.restamped.map((x) => x.kind), ['experience']);
    assert.equal(manifest('s').kinds.study.versions[0].prompt, old, 'v1 was genuinely made by the older prompt');
    assert.equal(manifest('s').kinds.study.versions[0].restamped, undefined);
  });
  test('rejects unknown topics and kinds, and stray arguments', () => {
    initTopic('s');
    bad(['restamp'], /usage: restamp/);
    bad(['restamp', 's', 'study', 'v1'], /usage: restamp/);
    bad(['restamp', 'nope'], /no such topic/);
    bad(['restamp', 's', 'notes'], /invalid kind/);
  });
});

// ---------------------------------------------------------------- validate
describe('validate', () => {
  const file = (name, content) => { fs.writeFileSync(p(name), content); return name; };
  test('passes a well-formed artifact', () => {
    const r = ok(['validate', file('good.html', html())]).json();
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.ok(r.counts.details > 0);
    assert.equal(r.counts.section, r.counts.details);
    assert.ok(r.bytes >= 25_000);
  });
  test('flags stubs and truncation as errors and exits 1', () => {
    const r = bad(['validate', file('stub.html', '<!doctype html><html><body><div>stub')]);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    assert.ok(j.errors.some((e) => /bytes/.test(e)));
    assert.ok(j.errors.some((e) => /<\/html>/.test(e)));
    assert.ok(j.errors.some((e) => /unbalanced <div>/.test(e)));
  });
  test('requires the doctype', () => {
    const j = JSON.parse(bad(['validate', file('nodoc.html', html().replace('<!doctype html>', ''))]).out);
    assert.ok(j.errors.some((e) => /doctype/.test(e)));
  });
  test('catches an unclosed <details>', () => {
    const j = JSON.parse(bad(['validate', file('open.html', html({ extra: '<details><summary>x</summary>' }))]).out);
    assert.ok(j.errors.some((e) => /unbalanced <details>: \d+ opening, \d+ closing/.test(e)));
  });
  test('warns (does not fail) on off-host resources and unprefixed localStorage', () => {
    const content = html({
      head: '<script src="https://unpkg.com/x.js"></script><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">',
      extra: '<script>localStorage.setItem("progress", "1")</script>',
    });
    const r = ok(['validate', file('warn.html', content)]).json();
    assert.equal(r.ok, true);
    assert.deepEqual(r.external, ['https://unpkg.com/x.js', 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css']);
    assert.ok(r.warnings.some((w) => /unpkg\.com/.test(w) && !/cdnjs\.cloudflare\.com\/ajax/.test(w)));
    assert.ok(r.warnings.some((w) => /localStorage/.test(w)));
  });
  test('a missing provenance comment fails: it is what ties a page to the run that made it', () => {
    const j = JSON.parse(bad(['validate', file('noprov.html', html({ provenance: false }))]).out);
    assert.ok(j.errors.some((e) => /provenance/.test(e)), JSON.stringify(j.errors));
  });
  test('a file outside topics/ has no identity, so the design checks do not apply', () => {
    const r = ok(['validate', file('loose.html', html())]).json();
    assert.equal(r.identity, null);
    assert.deepEqual(r.errors, []);
  });
  test('warns about the CSS patterns that cause horizontal scrolling', () => {
    const head = '<style>p code, li code { white-space: nowrap; color: red } pre code { white-space: pre } table { width: 100%; min-width: 560px } .hero { width: 100vw }</style>';
    const r = ok(['validate', file('scroll.html', html({ head }))]).json();
    assert.equal(r.ok, true, 'warnings only');
    assert.ok(r.warnings.some((w) => /inline code cannot wrap \("p code, li code"/.test(w)), JSON.stringify(r.warnings));
    assert.ok(!r.warnings.some((w) => /"pre code"/.test(w)), 'nowrap inside <pre> is fine');
    assert.ok(r.warnings.some((w) => /table with a fixed min-width/.test(w)));
    assert.ok(r.warnings.some((w) => /100vw/.test(w)));
  });
  test('warns about progress checkboxes', () => {
    const r = ok(['validate', file('cb.html', html({ extra: '<label><input type="checkbox"> Mark as studied</label>' }))]).json();
    assert.equal(r.counts.checkboxes, 1);
    assert.ok(r.warnings.some((w) => /progress tracking/.test(w)));
  });
  test('--draft lowers the size floor for dry runs', () => {
    const small = file('small.html', html({ bytes: 10_000 }));
    assert.ok(JSON.parse(bad(['validate', small]).out).errors.some((e) => /bytes/.test(e)));
    assert.equal(ok(['validate', small, '--draft']).json().ok, true);
  });
  test('accepts a correctly prefixed localStorage key', () => {
    const r = ok(['validate', file('ls.html', html({ extra: '<script>localStorage.setItem("devbok:s:study:v1:progress", "1")</script>' }))]).json();
    assert.deepEqual(r.warnings, []);
  });
  test('a page that only shows localStorage or a checkbox in a sample is not warned about using them', () => {
    // The case from the real corpus: an application-security cheat sheet quotes localStorage in prose and
    // prints an <input type="checkbox"> inside a code block. Neither is the page keeping state or tracking
    // progress, so neither may warn - the checks read the page with its code samples removed.
    const extra = '<p>Never keep a token in <code>localStorage.setItem("jwt", t)</code>.</p>'
      + '<pre><code class="language-html">&lt;input type="checkbox"&gt; mark as studied</code></pre>';
    const r = ok(['validate', file('samples.html', html({ extra }))]).json();
    assert.deepEqual(r.warnings, []);
    assert.equal(r.counts.checkboxes, 0);
  });
  test('reports a missing file', () => {
    const j = JSON.parse(bad(['validate', 'missing.html']).out);
    assert.deepEqual(j.errors, ['file not found']);
  });
});

// ---------------------------------------------------------------- validate: the design contract
describe('validate: the verbatim parts of prompts/shared/page.md', () => {
  // A file under topics/<slug>/ knows its own slug, kind and version, and the manifest knows the title,
  // so everything page.md calls "verbatim" is checked rather than hoped for.
  const checked = (mutate = (x) => x, { slug = 's', kind = 'study', v = 1 } = {}) => {
    writeArtifact(slug, kind, v, mutate(artifactHtml(slug, kind, v)));
    const r = run(['validate', `topics/${slug}/${kind}.v${v}.html`]);
    return JSON.parse(r.out);
  };
  const errs = (j) => j.errors.join(' | ');

  test('a conforming page passes and reports what it was checked as', () => {
    initTopic('s', 'Full topic text', 'Short title');
    const j = checked();
    assert.deepEqual(j.errors, [], errs(j));
    assert.deepEqual(j.identity, { slug: 's', kind: 'study', version: '1' });
    assert.equal(j.ok, true);
  });
  test('the <title> must be "<title> · <kind> · devbok"', () => {
    initTopic('s', 'Full topic text', 'Short title');
    const j = checked((h) => h.replace('<title>Short title · study · devbok</title>', '<title>Short title — study guide (v1)</title>'));
    assert.ok(j.errors.some((e) => /<title> must be "Short title · study · devbok"/.test(e)), errs(j));
  });
  test('the hero <h1> must be the title, not the topic sentence', () => {
    initTopic('s', 'Full topic text', 'Short title');
    const j = checked((h) => h.replace('<h1>Short title</h1>', '<h1>Full topic text</h1>'));
    assert.ok(j.errors.some((e) => /hero <h1> must be the topic title "Short title"/.test(e)), errs(j));
  });
  test('entities and inline markup in the title still match', () => {
    ok(['init', 's', '--title', 'C# & Co', '--topic', 'T']);
    const j = checked((h) => h
      .replace('<title>C# & Co · study · devbok</title>', '<title>C# &amp; Co &middot; study &middot; devbok</title>')
      .replace('<h1>C# & Co</h1>', '<h1>C# &amp; <span>Co</span></h1>'));
    assert.deepEqual(j.errors, [], errs(j));
  });
  test('the hero keeps its meta, summary and chips lines', () => {
    initTopic('s');
    for (const cls of ['meta', 'summary', 'chips']) {
      const j = checked((h) => h.replace(`class="${cls}"`, 'class="other"'));
      assert.ok(j.errors.some((e) => e.includes(`<p class="${cls}">`)), `${cls}: ${errs(j)}`);
    }
    const j = checked((h) => h.replace(/<header class="hero">[\s\S]*?<\/header>/, '<div class="top"><h1>Some Topic</h1></div>'));
    assert.ok(j.errors.some((e) => /no <header class="hero">/.test(e)), errs(j));
  });
  test('the sidebar is nav.side + ol.units, numbered with two digits, with aria-current for the scrollspy', () => {
    initTopic('s');
    let j = checked((h) => h.replace('<nav class="side"', '<nav class="sidebar"'));
    assert.ok(j.errors.some((e) => /no <nav class="side">/.test(e)), errs(j));
    j = checked((h) => h.replace('<ol class="units">', '<ol class="nav">').replace('</ol>', '</ol>'));
    assert.ok(j.errors.some((e) => /no <ol class="units">/.test(e)), errs(j));
    j = checked((h) => h.replace('<span class="n">01</span>', '<span class="n">1</span>'));
    assert.ok(j.errors.some((e) => /two digits \(01, 02, \.\.\.\): found "1"/.test(e)), errs(j));
    j = checked((h) => h.replace('<ol class="units"><li><a href="#u01" aria-current="true">', '<ol class="units"><li><a href="#u01">'));
    assert.ok(j.errors.some((e) => /aria-current/.test(e)), errs(j));
  });
  test('provenance that disagrees with the file is an error', () => {
    initTopic('s');
    let j = checked((h) => h.replace('version: 1', 'version: 2'));
    assert.ok(j.errors.some((e) => /provenance version: "2" - the file is 1/.test(e)), errs(j));
    j = checked((h) => h.replace('kind: study', 'kind: interview'));
    assert.ok(j.errors.some((e) => /provenance kind: "interview" - the file is study/.test(e)), errs(j));
    j = checked((h) => h.replace('slug: s\n', ''));
    assert.ok(j.errors.some((e) => /provenance slug: missing/.test(e)), errs(j));
  });
  test('a cheatsheet needs a print stylesheet, other kinds do not', () => {
    initTopic('s');
    const j = checked((h) => h.replace('@media print { .side { display: none } }', ''), { kind: 'cheatsheet' });
    assert.ok(j.errors.some((e) => /@media print/.test(e)), errs(j));
    assert.deepEqual(checked((x) => x, { kind: 'study' }).errors, []);
  });
  test('the code palette must be declared, and never a cdnjs highlight.js theme', () => {
    initTopic('s');
    // Every --hl-* token plus --code: the page carries its own theme, in both colour schemes.
    let j = checked((h) => h.replace('--hl-str: #50a14f;', '').replace('--code:', '--inline-code:'));
    assert.ok(j.errors.some((e) => /code palette is missing --code, --hl-str/.test(e)), errs(j));
    // A cdnjs theme stylesheet is light-only and fights the tokens in dark mode, so it is an error even
    // though cdnjs is an allowed host for the highlight.js script itself.
    const theme = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css">';
    j = checked((h) => h.replace('</head>', `${theme}</head>`));
    assert.ok(j.errors.some((e) => /theme stylesheet .*styles\/github\.min\.css/.test(e)), errs(j));
    j = checked((h) => h.replace('</head>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script></head>'));
    assert.deepEqual(j.errors, [], errs(j));
  });
  test('localStorage keys are checked against the page\'s own slug, kind and version', () => {
    initTopic('s');
    let j = checked((h) => h.replace('</body>', '<script>localStorage.setItem("devbok:s:study:v2:open", 1)</script></body>'));
    assert.ok(j.warnings.some((w) => w.includes('devbok:s:study:v1:')), JSON.stringify(j.warnings));
    j = checked((h) => h.replace('</body>', '<script>localStorage.setItem("devbok:s:study:v1:open", 1)</script></body>'));
    assert.deepEqual(j.warnings, []);
  });
  test('a draft in .devbok/ is identified and checked the same way', () => {
    initTopic('s', 'Full topic text', 'Short title');
    const j = ok(['prepare', 's', 'study', '--draft']).json();
    fs.writeFileSync(path.resolve(root, j.output), artifactHtml('s', 'study', 'draft', { bytes: 9_000 }));
    const v = ok(['validate', '.devbok/s.study.draft.html', '--draft']).json();
    assert.deepEqual(v.identity, { slug: 's', kind: 'study', version: 'draft' });
    assert.deepEqual(v.errors, [], v.errors.join(' | '));
  });
  test('record refuses a page that drifted from the design, and --force still overrides', () => {
    initTopic('s', 'Full topic text', 'Short title');
    ok(['prepare', 's', 'study']);
    writeArtifact('s', 'study', 1, artifactHtml('s', 'study', 1).replace('<h1>Short title</h1>', '<h1>Full topic text</h1>'));
    bad(['record', 's', 'study', 'v1'], /hero <h1> must be the topic title/);
    assert.deepEqual(manifest('s').kinds.study.versions, []);
    assert.equal(ok(['record', 's', 'study', 'v1', '--force']).json().recorded.forced, true);
  });
});

// ---------------------------------------------------------------- delete
describe('delete', () => {
  test('removes a whole topic and its index entry', () => {
    initTopic('a', 'A');
    initTopic('b', 'B');
    ok(['delete', 'a']);
    assert.equal(fs.existsSync(p('topics', 'a')), false);
    assert.deepEqual(indexTopics().map((t) => t.slug), ['b']);
  });
  test('removes one version without reusing its number', () => {
    initTopic('s');
    for (const v of [1, 2]) { writeArtifact('s', 'study', v); ok(['record', 's', 'study', `v${v}`]); }
    ok(['delete', 's', 'study', 'v2']);
    assert.equal(fs.existsSync(p('topics', 's', 'study.v2.html')), false);
    assert.equal(fs.existsSync(p('topics', 's', 'study.v1.html')), true);
    const k = manifest('s').kinds.study;
    assert.deepEqual(k.versions.map((x) => x.v), [1]);
    assert.equal(k.next, 3, 'next is not decremented');
    assert.deepEqual(indexTopics()[0].kinds.study.map((x) => x.v), [1]);
    assert.equal(ok(['prepare', 's', 'study']).json().version, 3);
  });
  test('clears a pending version', () => {
    initTopic('s');
    ok(['prepare', 's', 'study']);
    ok(['delete', 's', 'study', 'v1']);
    assert.deepEqual(manifest('s').kinds.study.pending, []);
  });
  test('removes the rendered briefs of whatever it deletes', () => {
    initTopic('s');
    initTopic('other', 'Other');
    const a = ok(['prepare', 's', 'study']).json().prompt;
    const b = ok(['prepare', 's', 'experience']).json().prompt;
    const c = ok(['prepare', 'other', 'study']).json().prompt;
    const d = ok(['prepare', 's', 'study', '--draft']).json();
    fs.writeFileSync(d.output, 'draft html');
    ok(['delete', 's', 'study', 'v1']);
    assert.deepEqual([a, b, c].map((f) => fs.existsSync(p(f))), [false, true, true], 'one version');
    ok(['delete', 's']);
    assert.deepEqual([b, c].map((f) => fs.existsSync(p(f))), [false, true], 'whole topic, other topic untouched');
    assert.deepEqual([d.prompt, d.output].map((f) => fs.existsSync(path.resolve(root, f))), [false, false], 'drafts go with the topic');
  });
  test('rejects unknown topics, versions and malformed arguments', () => {
    bad(['delete', 'nope'], /no such topic/);
    bad(['delete', 'Bad Slug'], /invalid slug/);
    initTopic('s');
    bad(['delete', 's', 'study'], /usage: delete/);
    bad(['delete', 's', 'study', 'v9'], /not found/);
    bad(['delete', 's', 'notes', 'v1'], /invalid kind/);
    assert.equal(fs.existsSync(p('topics', 's')), true, 'nothing was deleted');
  });
});

// ---------------------------------------------------------------- list
describe('list', () => {
  test('says so when there are no topics', () => assert.match(ok(['list']).out, /no topics yet/));
  test('shows latest version, counts, pending and gaps', () => {
    initTopic('s', 'Topic', 'Title');
    for (const v of [1, 2]) { writeArtifact('s', 'study', v); ok(['record', 's', 'study', `v${v}`]); }
    ok(['prepare', 's', 'experience']);
    const out = ok(['list']).out;
    assert.match(out, /^slug\s+title\s+category\s+study\s+experience\s+interview\s+cheatsheet$/m);
    assert.match(out, new RegExp(`^s\\s+Title\\s+other\\s+v2 ${TODAY} \\(2\\)\\s+- \\(\\+1 pending\\)\\s+-\\s+-$`, 'm'));
  });
  test('rows are grouped the way the sidebar groups, not by slug', () => {
    ok(['init', 'zebra', '--title', 'Zebra', '--topic', 'Z', '--category', 'language']);
    ok(['init', 'alpha', '--title', 'Alpha', '--topic', 'A', '--category', 'practice']);
    ok(['init', 'middle', '--title', 'Middle', '--topic', 'M', '--category', 'language']);
    ok(['init', 'loose', '--title', 'Loose', '--topic', 'L']);
    assert.deepEqual(ok(['list', '--json']).json().map((r) => [r.slug, r.category]), [
      ['middle', 'language'], ['zebra', 'language'], ['alpha', 'practice'], ['loose', 'other'],
    ]);
  });
  test('--json exposes the same data structurally', () => {
    initTopic('s');
    writeArtifact('s', 'study', 1);
    ok(['record', 's', 'study', 'v1']);
    fs.appendFileSync(p('prompts', 'study.md'), '\nchanged\n');
    const [row] = ok(['list', '--json']).json();
    assert.equal(row.slug, 's');
    assert.deepEqual(row.study, { v: 1, generated: TODAY, stale: true, count: 1, pending: 0 });
    assert.deepEqual(row.interview, { v: null, count: 0, pending: 0 });
  });
});

// ---------------------------------------------------------------- index
describe('index', () => {
  test('sorts topics by title and ignores stray directories', () => {
    initTopic('zeta', 'Z', 'Alpha title');
    initTopic('alpha', 'A', 'Zulu title');
    fs.mkdirSync(p('topics', 'no-manifest'));
    fs.mkdirSync(p('topics', '_scratch'));
    fs.writeFileSync(p('topics', '_scratch', 'topic.json'), '{}');
    ok(['index']);
    assert.deepEqual(indexTopics().map((t) => t.slug), ['zeta', 'alpha']);
  });
  test('starts as an empty list when there are no topics', () => {
    ok(['index']);
    assert.deepEqual(indexTopics(), []);
    assert.match(fs.readFileSync(p('topics', 'index.js'), 'utf8'), /^\/\/ generated by scripts\/devbok\.mjs/);
  });
  test('ships the category vocabulary so the shell can group without knowing it', () => {
    initTopic('s');
    ok(['index']);
    const cats = indexWindow().DEVBOK_CATEGORIES;
    assert.deepEqual(cats.map((c) => c.id), Object.keys(CATEGORIES));
    assert.deepEqual(cats.map((c) => c.label), Object.values(CATEGORIES));
    assert.equal(cats.at(-1).id, 'other', 'the fallback bucket sorts last, so an uncategorized topic lands at the bottom');
  });
  test('a hand-mistyped category lands in other instead of breaking the index', () => {
    // topic.json is meant to be hand-edited; init validates, but a manifest edited afterwards must not
    // take the sidebar down - the topic simply shows up in the last group.
    initTopic('s');
    const m = manifest('s');
    m.category = 'Databases';
    fs.writeFileSync(p('topics', 's', 'topic.json'), JSON.stringify(m));
    ok(['index']);
    assert.equal(indexTopics()[0].category, 'other');
  });
  test('tolerates a manifest that predates a newly added kind', () => {
    initTopic('s');
    const m = manifest('s');
    delete m.kinds.cheatsheet;
    fs.writeFileSync(p('topics', 's', 'topic.json'), JSON.stringify(m));
    ok(['index']);
    assert.deepEqual(indexTopics()[0].kinds.cheatsheet, []);
    assert.equal(ok(['prepare', 's', 'cheatsheet']).json().version, 1);
  });
});

// ---------------------------------------------------------------- cli
describe('cli', () => {
  test('prints usage without arguments', () => assert.match(ok([]).out, /node scripts\/devbok\.mjs slug <text>/));
  test('fails on unknown commands', () => bad(['frobnicate'], /unknown command "frobnicate"/));
});
