// Tests for scripts/devbok.mjs. Runs the CLI as a subprocess against a throwaway DEVBOK_ROOT,
// so every test starts from an empty repo layout with its own prompts/. No dependencies:
//   npm test        (or: node --test scripts/devbok.test.mjs)
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  'slug={{SLUG}} kind={{KIND}} v={{VERSION}} date={{DATE}} title={{TITLE}} file={{PROMPT_FILE}} hash={{PROMPT_HASH}} keep={{NOT_A_VAR}}\n\n{{slot:content}}\n';
const readyPrompt = (kind) => `{{slot:goal}}\ngoal of ${kind}\n\n{{slot:content}}\ncontent of ${kind}\n`;
function freshRoot({ ready = KINDS } = {}) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'devbok-test-'));
  fs.mkdirSync(path.join(root, 'prompts', 'shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'prompts', 'shared', 'template.md'), TEMPLATE);
  for (const k of KINDS) {
    fs.writeFileSync(path.join(root, 'prompts', `${k}.md`), ready.includes(k) ? readyPrompt(k) : `TOPIC:\nold-style ${k} prompt without slots\n`);
  }
}
const p = (...parts) => path.join(root, ...parts);
const template = (text) => fs.writeFileSync(p('prompts', 'shared', 'template.md'), text);
const manifest = (slug) => JSON.parse(fs.readFileSync(p('topics', slug, 'topic.json'), 'utf8'));
function indexTopics() {
  const src = fs.readFileSync(p('topics', 'index.js'), 'utf8');
  const w = {};
  new Function('window', src)(w);
  return w.DEVBOK_TOPICS;
}
function html({ bytes = 25_000, provenance = true, head = '', extra = '', tail = '</body></html>' } = {}) {
  let body = '';
  while (Buffer.byteLength(body) < bytes) {
    body += '<section><h2>S</h2><p>' + 'lorem ipsum '.repeat(40) + '</p><details><summary>Q</summary><p>A</p></details></section>\n';
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>t</title>${head}</head><body>${provenance ? '<!-- devbok\nslug: x\n-->' : ''}${extra}${body}${tail}`;
}
function writeArtifact(slug, kind, v, content = html()) {
  fs.writeFileSync(p('topics', slug, `${kind}.v${v}.html`), content);
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
    assert.equal(fs.existsSync(p('.devbok')), false);
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
    assert.equal(fs.existsSync(p('.devbok')), false);
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
  test('rejects bad version syntax', () => {
    initTopic('s');
    bad(['record', 's', 'study', 'latest'], /invalid version/);
    bad(['record', 's', 'study'], /invalid version/);
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
  test('warns (does not fail) on off-host resources, missing provenance and unprefixed localStorage', () => {
    const content = html({
      provenance: false,
      head: '<script src="https://unpkg.com/x.js"></script><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">',
      extra: '<script>localStorage.setItem("progress", "1")</script>',
    });
    const r = ok(['validate', file('warn.html', content)]).json();
    assert.equal(r.ok, true);
    assert.deepEqual(r.external, ['https://unpkg.com/x.js', 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css']);
    assert.ok(r.warnings.some((w) => /unpkg\.com/.test(w) && !/cdnjs\.cloudflare\.com\/ajax/.test(w)));
    assert.ok(r.warnings.some((w) => /provenance/.test(w)));
    assert.ok(r.warnings.some((w) => /localStorage/.test(w)));
  });
  test('accepts a correctly prefixed localStorage key', () => {
    const r = ok(['validate', file('ls.html', html({ extra: '<script>localStorage.setItem("devbok:s:study:v1:progress", "1")</script>' }))]).json();
    assert.deepEqual(r.warnings, []);
  });
  test('reports a missing file', () => {
    const j = JSON.parse(bad(['validate', 'missing.html']).out);
    assert.deepEqual(j.errors, ['file not found']);
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
    ok(['delete', 's', 'study', 'v1']);
    assert.deepEqual([a, b, c].map((f) => fs.existsSync(p(f))), [false, true, true], 'one version');
    ok(['delete', 's']);
    assert.deepEqual([b, c].map((f) => fs.existsSync(p(f))), [false, true], 'whole topic, other topic untouched');
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
    assert.match(out, /^slug\s+title\s+study\s+experience\s+interview\s+cheatsheet$/m);
    assert.match(out, new RegExp(`^s\\s+Title\\s+v2 ${TODAY} \\(2\\)\\s+- \\(\\+1 pending\\)\\s+-\\s+-$`, 'm'));
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
