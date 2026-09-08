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
// The category vocabulary the shell receives from topics/index.js: order and labels, nothing else.
const CATS = [{ id: 'language', label: 'Languages' }, { id: 'data', label: 'Data & storage' }, { id: 'other', label: 'Other' }];
const topicsOf = (w) => w.groups.flatMap((g) => g.topics);
const T = [
  {
    slug: 'csharp', title: 'C#', topic: 'C# <the language> & "more"', category: 'language', created: '2026-09-07',
    kinds: {
      study: [v(2, '2026-09-12', 'csharp', 'study'), v(1, '2026-09-07', 'csharp', 'study')],
      experience: [v(1, '2026-09-07', 'csharp', 'experience')],
      interview: [], cheatsheet: [],
    },
  },
  { slug: 'sql', title: 'SQL', topic: 'SQL Server and PostgreSQL', category: 'data', created: '2026-09-08', kinds: { study: [], experience: [], interview: [], cheatsheet: [] } },
];

describe('model: parseHash / toHash', () => {
  test('parses every combination', () => {
    assert.deepEqual(M.parseHash(''), { slug: null, kind: null, v: null });
    assert.deepEqual(M.parseHash('#'), { slug: null, kind: null, v: null });
    assert.deepEqual(M.parseHash('#csharp'), { slug: 'csharp', kind: null, v: null });
    assert.deepEqual(M.parseHash('#csharp/study'), { slug: 'csharp', kind: 'study', v: null });
    assert.deepEqual(M.parseHash('#csharp/study/v2'), { slug: 'csharp', kind: 'study', v: 2 });
    assert.deepEqual(M.parseHash('#csharp/cheatsheet/v10'), { slug: 'csharp', kind: 'cheatsheet', v: 10 });
    assert.deepEqual(M.parseHash('#csharp/study/draft'), { slug: 'csharp', kind: 'study', v: 'draft' });
    assert.equal(M.toHash('csharp', 'study', 'draft'), '#csharp/study/draft');
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
  test('a malformed percent-escape is read literally instead of throwing', () => {
    // decodeURIComponent throws URIError on a stray %, and parseHash runs on every render: a mistyped
    // link used to leave the shell blank - no sidebar, no message, no clue.
    assert.deepEqual(M.parseHash('#c%'), { slug: 'c%', kind: null, v: null });
    assert.deepEqual(M.parseHash('#50%/study/v1'), { slug: '50%', kind: 'study', v: 1 });
    assert.equal(M.view(T, '#c%', 'study', CATS).message, 'Unknown topic <code>c%</code>. Pick one on the left.');
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
    assert.deepEqual(w.groups, []);
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
    assert.ok(topicsOf(w).length === 2 && topicsOf(w).every((t) => !t.active));
    assert.ok(w.tabs.every((t) => t.disabled));
    assert.equal(w.src, null);
    assert.equal(w.remember, null);
    assert.equal(w.crumb, '');
    assert.equal(w.title, 'devbok');
  });
  test('draft: the dry-run artifact from .devbok/, shown only when asked for', () => {
    const w = M.view(T, '#csharp/study/draft', null);
    assert.equal(w.message, null);
    assert.equal(w.src, '.devbok/csharp.study.draft.html');
    assert.equal(w.title, 'C# · study draft · devbok');
    assert.deepEqual(w.options.map((o) => [o.v, o.selected]), [[2, false], [1, false], ['draft', true]]);
    assert.equal(w.remember, 'study');
    assert.ok(!M.view(T, '#csharp/study', null).options.some((o) => o.v === 'draft'), 'no draft option unless asked for');
    assert.equal(M.view(T, '#sql/cheatsheet/draft', null).src, '.devbok/sql.cheatsheet.draft.html', 'a draft can exist for a kind with no recorded version');
    assert.equal(M.view(T, '#nope/study/draft', null).src, null, 'but not for an unknown topic');
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
  test('the iframe is named after what it shows, not "artifact"', () => {
    // The frame's accessible name is all a screen reader gets for the whole artifact.
    const w = M.view(T, '#csharp/study', null, CATS);
    assert.equal(w.frameTitle, 'C# · study v2');
    assert.equal(w.title, 'C# · study v2 · devbok', 'the tab title is the same label plus devbok');
    assert.equal(M.view(T, '#csharp/study/draft', null, CATS).frameTitle, 'C# · study draft');
    assert.equal(M.view(T, '#sql/study', null, CATS).frameTitle, 'artifact', 'nothing on screen, nothing to name');
    assert.match(HTML.match(/<script>([\s\S]*?)<\/script>/)[1], /els\.frame\.title = v\.frameTitle;/);
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
    const w = M.view(T, '#sql/cheatsheet', null, CATS);
    assert.deepEqual(topicsOf(w).map((t) => [t.slug, t.href, t.active]), [
      ['csharp', '#csharp/cheatsheet', false],
      ['sql', '#sql/cheatsheet', true],
    ]);
    assert.equal(topicsOf(w)[0].topic, 'C# <the language> & "more"', 'raw text; the glue escapes when painting');
  });
  test('sidebar groups: vocabulary order and labels, unknown categories last, nothing hidden', () => {
    const empty = { study: [], experience: [], interview: [], cheatsheet: [] };
    const more = [
      ...T,
      { slug: 'k8s', title: 'Kubernetes', topic: 'k8s', category: 'ops', created: '2026-09-08', kinds: empty },
      { slug: 'git', title: 'Git', topic: 'git', created: '2026-09-08', kinds: empty },
    ];
    const w = M.view(more, '', null, CATS);
    assert.deepEqual(w.groups.map((g) => [g.category, g.label, g.topics.map((t) => t.slug)]), [
      ['language', 'Languages', ['csharp']],
      ['data', 'Data & storage', ['sql']],
      ['other', 'Other', ['git']],          // no category at all falls into the vocabulary's own "other"
      ['ops', 'ops', ['k8s']],              // named by nothing: its own group, last, labelled by its id
    ]);
  });
  test('sidebar groups: a stale or missing vocabulary still shows every topic', () => {
    for (const cats of [undefined, [], 'nonsense']) {
      const w = M.view(T, '', null, cats);
      assert.deepEqual(topicsOf(w).map((t) => t.slug).sort(), ['csharp', 'sql'], `categories: ${JSON.stringify(cats)}`);
      assert.deepEqual(w.groups.map((g) => g.label), ['data', 'language'], 'unlabelled groups fall back to the raw id, in a stable order');
    }
  });
  test('sidebar groups: one group is no grouping - the lone header is dropped', () => {
    const w = M.view([T[0]], '', null, CATS);
    assert.deepEqual(w.groups.map((g) => [g.category, g.label, g.topics.length]), [['language', null, 1]]);
  });
  test('the open topic hands the shell its colour pair, or nothing', () => {
    const withAccent = [{ ...T[0], accent: '#512bd4', accentDark: '#896fe2' }, T[1]];
    assert.deepEqual(M.view(withAccent, '#csharp/study', null, CATS).accent, { light: '#512bd4', dark: '#896fe2' });
    assert.equal(M.view(withAccent, '', null, CATS).accent, null, 'no topic open: devbok paints itself');
    assert.equal(M.view(withAccent, '#nope/study', null, CATS).accent, null);
    // an index written before accentDark existed must still show the brand colour, not fall back to purple
    assert.deepEqual(M.view([{ ...T[0], accent: '#512bd4' }], '#csharp/study', null, CATS).accent,
      { light: '#512bd4', dark: '#512bd4' });
    assert.equal(M.view(T, '#csharp/study', null, CATS).accent, null, 'a topic with no accent at all: same');
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
    assert.match(dark, /--accent: #c190be;/);
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
  test('the tab icon is an emoji drawn inline, not a file and not scripted', () => {
    const link = HTML.match(/<link rel="icon"[^>]*>/)[0];
    assert.match(link, /href="data:image\/svg\+xml,/, 'no favicon file to ship next to devbok.html');
    assert.match(link, /\p{Extended_Pictographic}/u, 'the icon is an emoji');
    assert.doesNotMatch(stripComments(HTML.match(/<script>([\s\S]*?)<\/script>/)[1]), /icon/i, 'static: the glue never touches it');
  });
  test('the open topic paints the shell, in CSS, from the index', () => {
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    const glue = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
    // one token, two theme-picked tints, falling back to devbok's own accent when no topic is open
    assert.match(css, /--topic: var\(--topic-light, var\(--accent\)\);/);
    assert.match(css.slice(css.indexOf('prefers-color-scheme: dark')), /--topic: var\(--topic-dark, var\(--accent\)\);/);
    // and it is used where the open topic is what is being marked
    const rule = (sel) => css.split('\n').find((l) => l.trim().startsWith(sel + ' {')) ?? '';
    assert.match(rule('nav li a.active'), /background: var\(--topic-soft\);/);
    assert.match(rule('nav li a.active'), /border-left-color: var\(--topic\);/);
    // [^-] so border-left-color does not count: it is the text colour that must stay --fg
    assert.doesNotMatch(rule('nav li a.active'), /[^-]color: var\(--topic/, 'a brand colour of any luminance cannot carry the label text');
    assert.match(glue, /root\.setProperty\('--topic-light', accent\.light\);/);
    assert.match(glue, /root\.removeProperty\('--topic-light'\);/, 'no topic open: the token goes away, the fallback takes over');
  });
  test('keeps every colour in the token blocks', () => {
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    const outsideTokens = css.split('\n').filter((line) => /#[0-9a-f]{3,8}\b/i.test(line) && !/^\s*--/.test(line));
    assert.deepEqual(outsideTokens, []);
  });
  test('has the parts the glue script binds to', () => {
    for (const id of ['topics', 'version', 'open', 'frame', 'empty', 'crumb', 'help', 'howto', 'howto-close']) assert.match(HTML, new RegExp(`id="${id}"`));
    assert.doesNotMatch(HTML, /id="(filter|count)"/, 'removed controls stay removed');
  });
  test('the version picker sits beside a link out of the frame', () => {
    // A cheat sheet has a @media print stylesheet and is meant to be kept in a side window; inside the
    // iframe neither is reachable, and printing devbok.html prints the shell, not the artifact.
    const tools = HTML.match(/<div class="tools">[\s\S]*?<\/div>/)[0];
    assert.match(tools, /<select id="version"/);
    assert.match(tools, /<a class="open" id="open" target="_blank" rel="noopener"/);
    const glue = HTML.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.match(glue, /els\.open\.hidden = !v\.src;/, 'hidden until an artifact is on screen');
    assert.match(glue, /els\.open\.href = v\.src;/, 'points at the artifact the iframe shows');
  });
  test('the active tab breaks the bar\'s bottom line', () => {
    // No overlapping borders (they misalign at fractional zoom): the bar has no line, each tab and the spacer draw their own.
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.doesNotMatch(css.match(/\.tabs \{[^}]*\}/)[0], /border-bottom/);
    assert.match(css, /\.tab \{[^}]*border-bottom: 2px solid var\(--line\);/);
    assert.match(css, /\.tab\.active \{[^}]*border-bottom-color: transparent;/);
    // and follows the header's title/subtitle pattern: active = text colour + bold, inactive = muted
    // one rule per line in this stylesheet, so a rule can be read without pinning declaration order
    const rule = (sel) => css.split('\n').find((l) => l.trim().startsWith(sel + ' {')) ?? '';
    assert.ok(rule('.tab').includes('color: var(--muted);'));
    for (const d of ['font-weight: 700;', 'color: var(--fg);']) assert.ok(rule('.tab.active').includes(d), '.tab.active needs ' + d);
    for (const d of ['flex: 1;', 'border-bottom: 2px solid var(--line);']) assert.ok(rule('.tools').includes(d), '.tools needs ' + d);
  });
  test('no orientation labels: the list and the tab row explain themselves', () => {
    assert.match(HTML, /<nav id="nav" aria-label="Topics">\s*<ul id="topics">/);
    assert.match(HTML, /<div class="tabs" id="tabs" role="group" aria-label="[^"]+">\s*<button class="tab"/);
    assert.doesNotMatch(HTML, /nav-label|tabs-label/);
    const headerButtons = [...HTML.match(/<header>[\s\S]*?<\/header>/)[0].matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(headerButtons, ['menu'], 'the header holds no control but the narrow-viewport drawer toggle');
  });
  test('the "add more topics" button at the foot of the sidebar opens a native dialog', () => {
    assert.match(HTML, /<ul id="topics"><\/ul>\s*<button class="add" id="help" type="button">\+ add more topics<\/button>\s*(?:<div class="resizer"[^>]*><\/div>\s*)?<\/nav>/);
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
    assert.match(glue, /els\.tabBar\.hidden\b/);
    assert.match(glue, /els\.crumb\.hidden\b/);
    assert.match(HTML, /<h1><a id="home" href="#"[^>]*>devbok<\/a><\/h1>/);
    assert.match(glue, /\$\('#home'\)\.addEventListener\('click'/);
    assert.match(glue, /history\.replaceState\(/);
    assert.doesNotMatch(glue, /devbok:last/, 'the old topic memory is gone; only the kind tab is remembered');
    assert.match(glue, /devbok:kind/);
  });
  test('the kind buttons are a labelled group, not a half-built tab pattern', () => {
    // role="tablist" also wrapped the version picker, the iframe is a separate document rather than a
    // tabpanel, and there was no arrow-key navigation: buttons with aria-current are what they are.
    assert.match(HTML, /<div class="tabs" id="tabs" role="group" aria-label="Artifact kind">/);
    assert.doesNotMatch(HTML, /role="tab"|role="tablist"|role="tabpanel"|aria-selected/);
    const glue = HTML.match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/)[0];
    assert.match(glue, /setAttribute\('aria-current', 'page'\)/);
    assert.match(glue, /removeAttribute\('aria-current'\)/);
  });
  test('the kind row scrolls instead of clipping its last tab on a narrow window', () => {
    // The four fixed labels need ~520px, and the shell supports down to phone width (it has a <=720px
    // layout), so below that the row has to stay reachable rather than be cut off by body{overflow:hidden}.
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    const rule = (sel) => css.split('\n').find((l) => l.trim().startsWith(sel + ' {')) ?? '';
    assert.match(rule('.tabs'), /overflow-x: auto;/);
    assert.match(rule('.content'), /min-width: 0;/, 'a grid item never shrinks below its content without this');
  });
  test('below 720px the topic list is a drawer, not a block above the artifact', () => {
    // The list grows with every topic, so stacking it above the pane would push the artifact off a phone screen.
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    const narrow = css.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0];
    assert.match(narrow, /nav \{[^}]*position: absolute;[^}]*transform: translateX\(-100%\);/, 'off-canvas until opened');
    assert.match(narrow, /main \{[^}]*position: relative;/, 'the drawer covers the pane, not the header');
    assert.match(narrow, /body\.nav-open nav \{ transform: none; \}/);
    assert.match(narrow, /body\.nav-open \.scrim \{ display: block; \}/);
    assert.match(narrow, /\.menu \{ display: block; \}/, 'the toggle exists only in the drawer layout');
    assert.doesNotMatch(narrow, /max-height: 40vh/, 'the stacked list is gone');
    assert.match(HTML, /<button class="menu" id="menu" type="button" aria-label="Topics" aria-expanded="false" aria-controls="nav">/);
    assert.match(HTML, /<div class="scrim" id="scrim"><\/div>/);
    const glue = HTML.match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/)[0];
    assert.match(glue, /classList\.toggle\('nav-open'/);
    // it opens only on request, and closes on anything that means "show me the artifact"
    for (const closer of [/#scrim'\)\.addEventListener\('click', \(\) => setNav\(false\)\)/, /e\.key === 'Escape'/, /innerWidth > 720/, /closest\('a'\)/])
      assert.match(glue, closer, `the drawer must close on ${closer}`);
  });
  test('no 100vw or 100vh: the shell holds itself to the rule it sets for artifacts', () => {
    // validate warns about 100vw in a generated page; the index page is the reference implementation.
    assert.doesNotMatch(HTML.match(/<style>([\s\S]*?)<\/style>/)[1], /\b100v[wh]\b/);
  });
  test('the sidebar paints one labelled section per category, using the generated vocabulary', () => {
    const glue = HTML.match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/)[0];
    assert.match(glue, /window\.DEVBOK_CATEGORIES/, 'order and labels come from topics/index.js, never from this file');
    assert.match(glue, /v\.groups\.map/);
    assert.match(glue, /<li class="group">/);
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    const rule = (sel) => css.split('\n').find((l) => l.trim().startsWith(sel + ' {')) ?? '';
    assert.match(rule('nav h2'), /color: var\(--muted\);/, 'a section label is muted, like the slug under a topic');
    assert.match(rule('nav > ul'), /overflow: auto;/, 'the outer list scrolls; the per-category lists do not');
    assert.match(rule('nav ul'), /padding: 0;/);
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

describe('model: pickVersion', () => {
  test('turns a <select> value into what toHash expects, draft included', () => {
    assert.equal(M.pickVersion('2'), 2);
    assert.equal(M.pickVersion('draft'), 'draft');
    assert.equal(M.toHash('csharp', 'study', M.pickVersion('draft')), '#csharp/study/draft');
    assert.equal(M.toHash('csharp', 'study', M.pickVersion('2')), '#csharp/study/v2');
    // and the round trip: every option the view offers survives being picked
    const w = M.view(T, '#csharp/study/draft', null);
    for (const o of w.options) {
      assert.deepEqual(M.parseHash(M.toHash('csharp', 'study', M.pickVersion(String(o.v)))).v, o.v);
    }
  });
});

describe('resizable sidebar', () => {
  test('clampSidebar keeps the width usable', () => {
    assert.equal(M.SIDEBAR_DEFAULT, 260);
    assert.equal(M.clampSidebar(300, 1200), 300);
    assert.equal(M.clampSidebar(100, 1200), M.SIDEBAR_MIN);
    assert.equal(M.clampSidebar(900, 1200), 720, 'at most 60% of the viewport');
    assert.equal(M.clampSidebar(300, 200), M.SIDEBAR_MIN, 'a tiny viewport still allows the minimum');
    assert.equal(M.clampSidebar(300.6, 1200), 301, 'whole pixels');
    for (const bad of [NaN, undefined, null, Infinity, 'abc']) assert.equal(M.clampSidebar(bad, 1200), M.SIDEBAR_DEFAULT, `unusable input ${bad} falls back to the default`);
    assert.equal(M.clampSidebar(300, undefined), M.SIDEBAR_MIN, 'no viewport means the minimum');
  });
  test('the divider is a drag handle wired to --sidebar and remembered per browser', () => {
    assert.match(HTML, /<div class="resizer" id="resizer" title="[^"]+"><\/div>\s*<\/nav>/);
    const css = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.match(css, /\.resizer \{[^}]*cursor: col-resize;/);
    assert.match(css, /body\.resizing iframe \{ pointer-events: none; \}/, 'the iframe must not swallow the drag');
    assert.match(css.match(/@media \(max-width: 720px\) \{[\s\S]*?\n  \}/)[0], /\.resizer \{ display: none; \}/, 'no resizer in the stacked layout');
    const glue = HTML.match(/<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/)[1];
    assert.match(glue, /setProperty\('--sidebar'/);
    assert.match(glue, /removeProperty\('--sidebar'\)/, 'double-click resets');
    assert.match(glue, /devbok:sidebar/);
    assert.match(glue, /M\.clampSidebar\(/, 'the glue never computes the width itself');
  });
});
