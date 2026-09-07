// Tests for devbok.html. The shell keeps all decisions in a pure <script id="devbok-model"> block;
// this file extracts that block and runs it in Node, plus a few structural checks on the HTML.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'devbok.html'), 'utf8');
const modelSrc = HTML.match(/<script id="devbok-model">([\s\S]*?)<\/script>/)?.[1];
assert.ok(modelSrc, 'devbok.html must contain <script id="devbok-model">');
// Same realm as the tests (not runInNewContext), so deepEqual does not trip over foreign prototypes.
const M = vm.runInThisContext(`(function () {\n${modelSrc}\n;return devbokModel; })()`);
const stripComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const v = (n, generated, slug, kind) => ({ v: n, generated, prompt: 'deadbeef', file: `topics/${slug}/${kind}.v${n}.html` });
const T = [
  {
    slug: 'csharp', title: 'C#', topic: 'C# <the language> & "more"', created: '2026-09-07',
    kinds: {
      study: [v(2, '2026-09-12', 'csharp', 'study'), v(1, '2026-09-07', 'csharp', 'study')],
      experience: [v(1, '2026-09-07', 'csharp', 'experience')],
      interview: [], cheatsheet: [],
    },
  },
  { slug: 'sql', title: 'SQL', topic: 'SQL Server and PostgreSQL', created: '2026-09-08', kinds: { study: [], experience: [], interview: [], cheatsheet: [] } },
];

describe('model: parseHash / toHash', () => {
  test('parses every combination', () => {
    assert.deepEqual(M.parseHash(''), { slug: null, kind: null, v: null });
    assert.deepEqual(M.parseHash('#'), { slug: null, kind: null, v: null });
    assert.deepEqual(M.parseHash('#csharp'), { slug: 'csharp', kind: null, v: null });
    assert.deepEqual(M.parseHash('#csharp/study'), { slug: 'csharp', kind: 'study', v: null });
    assert.deepEqual(M.parseHash('#csharp/study/v2'), { slug: 'csharp', kind: 'study', v: 2 });
    assert.deepEqual(M.parseHash('#csharp/cheatsheet/v10'), { slug: 'csharp', kind: 'cheatsheet', v: 10 });
  });
  test('ignores unknown kinds and malformed versions', () => {
    assert.deepEqual(M.parseHash('#csharp/notes/v2'), { slug: 'csharp', kind: null, v: 2 });
    assert.deepEqual(M.parseHash('#csharp/study/2'), { slug: 'csharp', kind: 'study', v: null });
    assert.deepEqual(M.parseHash('#csharp/study/latest'), { slug: 'csharp', kind: 'study', v: null });
  });
  test('decodes percent-encoding and survives null', () => {
    assert.equal(M.parseHash('#system%2Ddesign/study').slug, 'system-design');
    assert.deepEqual(M.parseHash(null), { slug: null, kind: null, v: null });
  });
  test('toHash round-trips', () => {
    assert.equal(M.toHash('csharp', 'study', 2), '#csharp/study/v2');
    assert.equal(M.toHash('csharp', 'study'), '#csharp/study');
    assert.equal(M.toHash('csharp', 'study', null), '#csharp/study');
    assert.deepEqual(M.parseHash(M.toHash('sql', 'cheatsheet', 7)), { slug: 'sql', kind: 'cheatsheet', v: 7 });
  });
});

describe('model: resolve', () => {
  test('selects nothing until a topic is chosen', () => {
    const s = M.resolve(T, '', null);
    assert.equal(s.slug, null);
    assert.equal(s.topic, null);
    assert.equal(s.kind, 'study');
    assert.equal(s.ver, null);
    assert.deepEqual(s.versions, []);
  });
  test('a remembered kind applies, but never selects a topic by itself', () => {
    const s = M.resolve(T, '', 'experience');
    assert.equal(s.slug, null);
    assert.equal(s.topic, null);
    assert.equal(s.kind, 'experience');
    assert.equal(s.ver, null);
  });
  test('ignores a remembered value that is not a kind', () => {
    assert.equal(M.resolve(T, '', 'bogus').kind, 'study');
    assert.equal(M.resolve(T, '', 'csharp/experience').kind, 'study', 'the old slug/kind memory format is ignored');
    assert.equal(M.resolve(T, '', 'csharp/experience').slug, null);
  });
  test('the hash wins over the remembered state', () => {
    const s = M.resolve(T, '#sql/cheatsheet', 'experience');
    assert.equal(s.slug, 'sql');
    assert.equal(s.kind, 'cheatsheet');
    assert.equal(s.ver, null);
  });
  test('an explicit version is honoured; an unknown one falls back to latest', () => {
    assert.equal(M.resolve(T, '#csharp/study/v1', null).ver.v, 1);
    assert.equal(M.resolve(T, '#csharp/study/v9', null).ver.v, 2);
  });
  test('a hash with only a slug keeps the remembered kind', () => {
    assert.equal(M.resolve(T, '#sql', 'experience').kind, 'experience');
  });
  test('an unknown slug is kept for the message but resolves to no topic', () => {
    const s = M.resolve(T, '#nope/study', null);
    assert.equal(s.slug, 'nope');
    assert.equal(s.topic, null);
    assert.deepEqual(s.versions, []);
  });
  test('tolerates a topic whose manifest predates a kind', () => {
    const old = [{ slug: 'x', title: 'X', topic: 'X', kinds: { study: [] } }];
    const s = M.resolve(old, '#x/cheatsheet', null);
    assert.deepEqual(s.versions, []);
    assert.equal(s.ver, null);
  });
  test('handles a missing or invalid index', () => {
    for (const bad of [undefined, null, 'nope', {}]) {
      const s = M.resolve(bad, '#csharp/study', null);
      assert.equal(s.topic, null);
      assert.equal(s.ver, null);
    }
  });
});

describe('model: view', () => {
  test('index missing: explains what to run and disables everything', () => {
    const w = M.view(undefined, '', null);
    assert.match(w.message, /topics\/index\.js/);
    assert.match(w.message, /node scripts\/devbok\.mjs index/);
    assert.match(w.sidebarNote, /missing or invalid/);
    assert.deepEqual(w.sidebar, []);
    assert.ok(w.tabs.every((t) => t.disabled && t.latest === null));
    assert.equal(w.tabs.find((t) => t.kind === 'study').active, true);
    assert.deepEqual(w.options, []);
    assert.equal(w.src, null);
    assert.equal(w.remember, null);
    assert.equal(w.title, 'devbok');
    assert.equal(w.crumb, '');
  });
  test('landing: topics exist but none chosen - hint, nothing active, tabs disabled', () => {
    const w = M.view(T, '', null);
    assert.match(w.message, /Pick a topic on the left/);
    assert.doesNotMatch(w.message, /Unknown topic/);
    assert.ok(w.sidebar.length === 2 && w.sidebar.every((t) => !t.active));
    assert.ok(w.tabs.every((t) => t.disabled));
    assert.equal(w.src, null);
    assert.equal(w.remember, null);
    assert.equal(w.crumb, '');
    assert.equal(w.title, 'devbok');
  });
  test('no topics yet: points at /devbok-new', () => {
    const w = M.view([], '', null);
    assert.match(w.message, /\/devbok-new/);
    assert.match(w.sidebarNote, /No topics yet/);
    assert.equal(w.title, 'devbok');
  });
  test('unknown topic: names it, escaped', () => {
    const w = M.view(T, '#<b>x/study', null);
    assert.match(w.message, /Unknown topic <code>&lt;b&gt;x<\/code>/);
    assert.equal(w.title, 'devbok');
    assert.ok(w.tabs.every((t) => t.disabled));
  });
  test('kind without artifact: names the exact update command', () => {
    const w = M.view(T, '#csharp/interview', null);
    assert.match(w.message, /No <b>interview<\/b> artifact for <b>C#<\/b> yet/);
    assert.match(w.message, /\/devbok-update csharp interview/);
    assert.equal(w.src, null);
    assert.equal(w.remember, 'interview', 'the kind tab is remembered even without an artifact');
    assert.equal(w.title, 'C# · devbok');
    assert.equal(w.options.length, 0);
    assert.equal(w.tabs.find((t) => t.kind === 'interview').active, true);
    assert.equal(w.tabs.find((t) => t.kind === 'interview').disabled, false);
  });
  test('artifact present: iframe source, remembered state, options newest first', () => {
    const w = M.view(T, '#csharp/study', null);
    assert.equal(w.message, null);
    assert.equal(w.src, 'topics/csharp/study.v2.html');
    assert.equal(w.remember, 'study');
    assert.equal(w.title, 'C# · study v2 · devbok');
    assert.equal(w.crumb, 'C# <the language> & "more"');
    assert.deepEqual(w.options, [
      { v: 2, label: 'v2 · 2026-09-12', selected: true },
      { v: 1, label: 'v1 · 2026-09-07', selected: false },
    ]);
  });
  test('explicit older version selects it', () => {
    const w = M.view(T, '#csharp/study/v1', null);
    assert.equal(w.src, 'topics/csharp/study.v1.html');
    assert.deepEqual(w.options.map((o) => o.selected), [false, true]);
    assert.equal(w.title, 'C# · study v1 · devbok');
  });
  test('tabs show each kind\'s latest version and the active one', () => {
    const w = M.view(T, '#csharp/experience', null);
    assert.deepEqual(w.tabs, [
      { kind: 'study', active: false, latest: 2, disabled: false },
      { kind: 'experience', active: true, latest: 1, disabled: false },
      { kind: 'interview', active: false, latest: null, disabled: false },
      { kind: 'cheatsheet', active: false, latest: null, disabled: false },
    ]);
  });
  test('sidebar links keep the current kind and mark the active topic', () => {
    const w = M.view(T, '#sql/cheatsheet', null);
    assert.deepEqual(w.sidebar.map((t) => [t.slug, t.href, t.active]), [
      ['csharp', '#csharp/cheatsheet', false],
      ['sql', '#sql/cheatsheet', true],
    ]);
    assert.equal(w.sidebar[0].topic, 'C# <the language> & "more"', 'raw text; the glue escapes when painting');
  });
  test('esc neutralises markup', () => {
    assert.equal(M.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    assert.equal(M.esc(null), '');
  });
});

describe('devbok.html structure', () => {
  test('lists the same kinds as tabs, in order', () => {
    const tabs = [...HTML.matchAll(/<button class="tab"[^>]*data-kind="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(tabs, M.KINDS);
  });
  test('loads the generated index through a script tag (fetch does not work from file://)', () => {
    assert.match(HTML, /<script src="topics\/index\.js"><\/script>/);
    const inlineJs = [...HTML.matchAll(/<script(?: id="[^"]*")?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
    assert.ok(inlineJs.length > 0);
    assert.doesNotMatch(stripComments(inlineJs), /fetch\(/);
  });
  test('follows the system theme with no selector UI', () => {
    assert.match(HTML, /@media \(prefers-color-scheme: dark\)/);
    assert.match(HTML, /color-scheme: light/);
    assert.match(HTML, /color-scheme: dark/);
    assert.doesNotMatch(HTML, /theme-toggle|data-theme|id="theme"/i);
  });
  test('uses the devbok palette and font', () => {
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    const light = css.match(/:root \{([\s\S]*?)\}/)[1];
    const dark = css.match(/prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\}/)[1];
    assert.match(light, /--accent: #a55da0;/);
    assert.match(dark, /--accent: #d69ad1;/);
    assert.match(dark, /--bg: #222222;/);
    assert.match(dark, /--fg: #cccccc;/);
    assert.match(dark, /--line: #111111;/, 'dark lines are darker than the ground, not lighter');
    assert.match(css, /font-family: "Cascadia Mono", Consolas, monospace;/);
    assert.match(HTML, /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Cascadia\+Mono[^"]*" rel="stylesheet">/);
    const external = [...HTML.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="(https?:[^"]+)"/g)].map((m) => m[1]);
    assert.ok(external.every((u) => /^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(u)), `only Google Fonts may be external, got: ${external.join(', ')}`);
  });
  test('uses one font size everywhere (12px on body, nothing else sets one)', () => {
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1]);
    assert.deepEqual(sizes, ['12px']);
    assert.match(css.match(/\n  body \{[\s\S]*?\n  \}/)[0], /font-size: 12px;/);
    assert.match(css, /h1, h2, code, button, select \{ font: inherit; \}/, 'UA defaults for headings, code and controls are neutralised');
  });
  test('keeps every colour in the token blocks', () => {
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    const outsideTokens = css.split('\n').filter((line) => /#[0-9a-f]{3,8}\b/i.test(line) && !/^\s*--/.test(line));
    assert.deepEqual(outsideTokens, []);
  });
  test('has the parts the glue script binds to', () => {
    for (const id of ['topics', 'version', 'frame', 'empty', 'crumb', 'help', 'howto', 'howto-close']) assert.match(HTML, new RegExp(`id="${id}"`));
    assert.doesNotMatch(HTML, /id="(filter|open|count)"/, 'removed controls stay removed');
  });
  test('the active tab breaks the bar\'s bottom line', () => {
    // No overlapping borders (they misalign at fractional zoom): the bar has no line, each tab and the spacer draw their own.
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.doesNotMatch(css.match(/\.tabs \{[^}]*\}/)[0], /border-bottom/);
    assert.match(css, /\.tab \{[^}]*border-bottom: 2px solid var\(--line\);/);
    assert.match(css, /\.tab\.active \{[^}]*border-bottom-color: transparent;/);
    // and follows the header's title/subtitle pattern: active = text colour + bold, inactive = muted
    assert.match(css, /\.tab \{[^}]*color: var\(--muted\);/);
    assert.match(css, /\.tab\.active \{[^}]*font-weight: 700;[^}]*color: var\(--fg\);/);
    // .tab.empty and .tab.active tie on specificity, so source order decides: active must come last to stay readable
    assert.ok(css.indexOf('.tab.empty {') < css.indexOf('.tab.active {'), '.tab.active must be declared after .tab.empty');
    assert.match(css, /\.tools \{[^}]*flex: 1;[^}]*border-bottom: 2px solid var\(--line\);/);
  });
  test('no orientation labels: the list and the tab row explain themselves', () => {
    assert.match(HTML, /<nav aria-label="Topics">\s*<ul id="topics">/);
    assert.match(HTML, /<div class="tabs" id="tabs" role="tablist">\s*<button class="tab"/);
    assert.doesNotMatch(HTML, /nav-label|tabs-label/);
    assert.doesNotMatch(HTML, /<header>[\s\S]*?<button[\s\S]*?<\/header>/, 'the header holds no controls');
  });
  test('the "add more topics" button at the foot of the sidebar opens a native dialog', () => {
    assert.match(HTML, /<ul id="topics"><\/ul>\s*<button class="add" id="help" type="button">\+ add more topics<\/button>\s*<\/nav>/);
    assert.match(HTML, /<dialog id="howto" aria-labelledby="howto-title">/);
    assert.match(HTML, /howto\.showModal\(\)/);
    assert.match(HTML, /howto\.close\(\)/);
  });
  test('the how-to dialog documents every skill, and no skill that does not exist', () => {
    const dialog = HTML.match(/<dialog id="howto"[\s\S]*?<\/dialog>/)[0];
    const skills = fs.readdirSync(path.join(ROOT, '.claude', 'skills')).filter((d) => d.startsWith('devbok-'));
    assert.ok(skills.length >= 4, 'expected the four devbok skills');
    for (const s of skills) assert.ok(dialog.includes(`<code>/${s}`), `dialog must document /${s}`);
    for (const m of dialog.matchAll(/\/devbok-[a-z]+/g)) assert.ok(skills.includes(m[0].slice(1)), `dialog mentions a skill that does not exist: ${m[0]}`);
    assert.match(dialog, /topics\/index\.js/, 'explains why a reload is needed');
  });
  test('the how-to dialog is only the generation guide, titled for the "add more topics" button', () => {
    const dialog = HTML.match(/<dialog id="howto"[\s\S]*?<\/dialog>/)[0];
    const headings = [...dialog.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    assert.deepEqual(headings, ['Generate more with Claude Code! ✨']);
    assert.match(dialog, /<h2 id="howto-title">/, 'the single heading labels the dialog');
    assert.doesNotMatch(dialog, /Enjoy learning|one tab each/, 'no learning section; the shell labels explain themselves');
  });
  test('landing chrome: tabs hidden until a topic is chosen, the title link resets to the landing state', () => {
    const glue = HTML.match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/)[0];
    assert.match(glue, /els\.tabBar\.hidden = !v\.topic/);
    assert.match(glue, /els\.crumb\.hidden = !v\.topic/);
    assert.match(HTML, /<h1><a id="home" href="#"[^>]*>devbok<\/a><\/h1>/);
    assert.match(glue, /\$\('#home'\)\.addEventListener\('click'/);
    assert.match(glue, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
    assert.doesNotMatch(glue, /devbok:last/, 'the old topic memory is gone; only the kind tab is remembered');
    assert.match(glue, /devbok:kind/);
  });
  test('the model block has no DOM or browser dependencies', () => {
    assert.doesNotMatch(stripComments(modelSrc), /\b(document|window|location|localStorage)\b/);
  });
  test('guards every localStorage access', () => {
    const uses = [...HTML.matchAll(/localStorage\./g)].length;
    const guarded = [...HTML.matchAll(/try \{ (?:return )?localStorage\./g)].length;
    assert.ok(uses > 0);
    assert.equal(guarded, uses);
  });
});
