// Repo-level consistency tests: the things that must agree across files (kinds, skills, prompts,
// manifests vs. index). Read-only against the real repo; the only writes go to a temp directory.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'devbok.mjs');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));

const scriptKinds = JSON.parse(read('scripts', 'devbok.mjs').match(/^const KINDS = (\[[^\]]*\]);/m)[1].replace(/'/g, '"'));
const modelSrc = read('devbok.html').match(/<script id="devbok-model">([\s\S]*?)<\/script>/)[1];
const shellKinds = vm.runInThisContext(`(function () {\n${modelSrc}\n;return devbokModel.KINDS; })()`);
const requiredPlaceholders = () => JSON.parse(read('scripts', 'devbok.mjs').match(/^const REQUIRED_PLACEHOLDERS = (\[[^\]]*\]);/m)[1].replace(/'/g, '"'));
const sharedDir = path.join(ROOT, 'prompts', 'shared');
const partials = () => (fs.existsSync(sharedDir) ? fs.readdirSync(sharedDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).filter((n) => n !== 'template' && n !== 'draft').sort() : []);
const SKILLS = ['devbok-new', 'devbok-update', 'devbok-delete', 'devbok-list'];

function frontmatter(skill) {
  const src = read('.claude', 'skills', skill, 'SKILL.md');
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${skill}/SKILL.md must start with a frontmatter block`);
  const fm = Object.fromEntries(m[1].split('\n').filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }));
  return { fm, body: m[2] };
}

describe('kinds agree everywhere', () => {
  test('script and shell define the same kinds in the same order', () => assert.deepEqual(shellKinds, scriptKinds));
  test('AGENTS.md documents exactly these kinds', () => {
    const documented = [...read('AGENTS.md').matchAll(/^\| `([a-z]+)`\s+\| `prompts\/\1\.md`/gm)].map((m) => m[1]);
    assert.deepEqual(documented, scriptKinds);
  });
  test('every kind has a prompt file', () => {
    for (const k of scriptKinds) assert.ok(exists('prompts', `${k}.md`), `prompts/${k}.md missing`);
  });
  test('no stray prompt files for unknown kinds', () => {
    const files = fs.readdirSync(path.join(ROOT, 'prompts')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
    assert.deepEqual(files.sort(), [...scriptKinds].sort());
  });
  test('the skills spell out the same kind list', () => {
    const { fm } = frontmatter('devbok-update');
    assert.ok(fm.description.includes(`[${scriptKinds.join('|')}]`), `devbok-update description must list ${scriptKinds.join('|')}`);
    const newBody = frontmatter('devbok-new').body;
    for (const k of scriptKinds) assert.ok(newBody.includes(`\`${k}\``), `devbok-new must mention \`${k}\``);
    for (const s of ['devbok-new', 'devbok-update']) {
      assert.match(frontmatter(s).body, /one `Agent` subagent \(`general-purpose`\) per prepared kind/, `${s} must launch one subagent per prepared kind`);
      assert.match(frontmatter(s).body, /not devbok-ready/, `${s} must explain how a not-ready prompt is skipped`);
    }
  });
});

describe('shared prompt partials', () => {
  const includesIn = (text) => [...text.matchAll(/\{\{include:([a-z0-9-]+)\}\}/g)].map((m) => m[1]);
  test('every partial starts with one H2 heading and has no other H1/H2 inside', () => {
    assert.ok(partials().length > 0);
    for (const n of partials()) {
      const lines = read('prompts', 'shared', `${n}.md`).split('\n');
      assert.match(lines[0], /^## \S/, `prompts/shared/${n}.md must start with a "## " heading on line 1`);
      assert.deepEqual(lines.slice(1).filter((l) => /^#{1,2} /.test(l)), [], `prompts/shared/${n}.md has extra H1/H2 headings`);
    }
  });
  test('every include resolves to a partial, and every partial is used', () => {
    const used = new Set();
    const sources = [
      ['prompts/shared/template.md', read('prompts', 'shared', 'template.md')],
      ...scriptKinds.map((k) => [`prompts/${k}.md`, read('prompts', `${k}.md`)]),
      ...partials().map((n) => [`prompts/shared/${n}.md`, read('prompts', 'shared', `${n}.md`)]),
    ];
    for (const [file, text] of sources) {
      for (const name of includesIn(text)) {
        used.add(name);
        assert.ok(exists('prompts', 'shared', `${name}.md`), `${file} includes {{include:${name}}} but prompts/shared/${name}.md does not exist`);
      }
    }
    for (const n of partials()) assert.ok(used.has(n), `prompts/shared/${n}.md is not included by any prompt`);
  });
  test('partials are documented in AGENTS.md', () => {
    const agents = read('AGENTS.md');
    assert.match(agents, /\{\{include:name\}\}/);
    for (const n of partials()) assert.ok(agents.includes(`\`${n}\``), `AGENTS.md must describe the partial \`${n}\``);
  });
});

describe('skills', () => {
  test('each skill has a frontmatter with matching name and a description', () => {
    for (const s of SKILLS) {
      const { fm } = frontmatter(s);
      assert.equal(fm.name, s);
      assert.ok(fm.description && fm.description.length > 20, `${s}: description`);
      assert.ok(fm['allowed-tools'], `${s}: allowed-tools`);
    }
  });
  test('the expensive and destructive skills are user-only', () => {
    for (const s of ['devbok-new', 'devbok-update', 'devbok-delete']) {
      assert.equal(frontmatter(s).fm['disable-model-invocation'], 'true', `${s} must set disable-model-invocation: true`);
    }
  });
  test('the generating skills run in the main context and may spawn agents', () => {
    for (const s of ['devbok-new', 'devbok-update']) {
      const { fm, body } = frontmatter(s);
      assert.equal(fm.context, undefined, `${s} must not set context: fork (a forked skill cannot spawn subagents)`);
      assert.match(fm['allowed-tools'], /\bAgent\b/);
      assert.match(body, /node scripts\/devbok\.mjs prepare <slug> <kind>/);
      assert.match(body, /node scripts\/devbok\.mjs record <slug> <kind> v<version>/);
      assert.match(body, /node scripts\/devbok\.mjs validate/);
      assert.match(body, /\$ARGUMENTS/);
    }
  });
  test('delete is a single script call with the arguments passed through', () => {
    const { fm, body } = frontmatter('devbok-delete');
    assert.equal(fm['allowed-tools'], 'Bash(node scripts/devbok.mjs delete:*)');
    assert.match(body, /node scripts\/devbok\.mjs delete \$ARGUMENTS/);
    assert.doesNotMatch(body, /rm -|Remove-Item|unlink/i);
  });
  test('list injects the script output at invocation time', () => {
    const { fm, body } = frontmatter('devbok-list');
    assert.match(body, /!`node scripts\/devbok\.mjs list`/);
    assert.equal(fm['disable-model-invocation'], undefined, 'list is harmless; the model may invoke it');
  });
  test('every script sub-command the skills mention exists', () => {
    const usage = read('scripts', 'devbok.mjs').match(/\/\*\*([\s\S]*?)\*\//)[1];
    const commands = [...usage.matchAll(/node scripts\/devbok\.mjs ([a-z]+)/g)].map((m) => m[1]);
    for (const s of SKILLS) {
      for (const m of frontmatter(s).body.matchAll(/node scripts\/devbok\.mjs ([a-z]+)/g)) {
        assert.ok(commands.includes(m[1]), `${s} mentions unknown command "${m[1]}"`);
      }
    }
  });
});

describe('prompt contract', () => {
  test('AGENTS.md lists the placeholders the script substitutes', () => {
    const vars = [...read('scripts', 'devbok.mjs').match(/const vars = \{([\s\S]*?)\};/)[1].matchAll(/\b([A-Z_]+):/g)].map((m) => m[1]);
    const agents = read('AGENTS.md');
    for (const v of vars) assert.ok(agents.includes(`\`{{${v}}}\``), `AGENTS.md must document {{${v}}}`);
    for (const r of requiredPlaceholders()) assert.ok(vars.includes(r), `required placeholder ${r} must be substituted`);
  });
  test('template.md owns the shape: declares the documented slots, includes every partial, adds no headings', () => {
    const tpl = read('prompts', 'shared', 'template.md');
    const slots = [...new Set([...tpl.matchAll(/\{\{slot:([a-z0-9-]+)\}\}/g)].map((m) => m[1]))];
    assert.deepEqual(slots, ['goal', 'design', 'content']);
    for (const s of slots) assert.ok(read('AGENTS.md').includes(`{{slot:${s}}}`), `AGENTS.md must document {{slot:${s}}}`);
    for (const n of partials()) assert.ok(tpl.includes(`{{include:${n}}}`), `template.md must include every partial (${n})`);
    assert.doesNotMatch(tpl, /^#{1,2} /m, 'the template has no headings of its own; partials and slots bring theirs');
    assert.match(tpl, /^TOPIC: \{\{TOPIC\}\}/, 'the brief starts with the topic line');
  });
  test('draft.md is the dry-run banner: one H2, no includes, documented', () => {
    const draft = read('prompts', 'shared', 'draft.md');
    assert.match(draft, /^## Draft mode/);
    assert.doesNotMatch(draft, /\{\{include:/);
    assert.match(draft, /--draft/, 'tells the agent to validate with --draft');
    const agents = read('AGENTS.md');
    assert.match(agents, /prepare <slug> <kind> \[--draft\]/);
    assert.match(agents, /#<slug>\/<kind>\/draft/);
    assert.match(frontmatter('devbok-update').fm.description, /\[draft\]/);
  });
  test('kind prompts in slot form are pure content: no TOPIC line, no includes', () => {
    for (const k of scriptKinds) {
      const src = read('prompts', `${k}.md`);
      if (!/^\{\{slot:[a-z-]+\}\}/m.test(src)) continue; // free-form prompts are checked by the render test
      assert.match(src, /^\{\{slot:/, `prompts/${k}.md must start with its first slot marker`);
      assert.doesNotMatch(src, /^TOPIC:/m, `prompts/${k}.md: the template owns the TOPIC line`);
      assert.doesNotMatch(src, /\{\{include:/, `prompts/${k}.md: the template owns the includes`);
    }
  });
  test('the real prompt files render cleanly through prepare, or are refused as not ready', () => {
    // Runs the actual prompts/ directory in a temp root. The only acceptable outcomes per kind: a clean
    // "not devbok-ready" refusal, or a successful render that contains the topic and output path and
    // leaves no placeholder behind. Anything else (missing partial, cycle, unknown placeholder) fails.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devbok-prompts-'));
    try {
      fs.cpSync(path.join(ROOT, 'prompts'), path.join(tmp, 'prompts'), { recursive: true });
      const env = { ...process.env, DEVBOK_ROOT: tmp };
      const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });
      assert.equal(run('init', 'probe', '--title', 'Probe', '--topic', 'Probe topic text').status, 0);
      for (const k of scriptKinds) {
        const r = run('prepare', 'probe', k);
        if (r.status !== 0) {
          assert.match(r.stderr, /not devbok-ready/, `prompts/${k}.md failed for another reason:\n${r.stderr}`);
          continue;
        }
        const j = JSON.parse(r.stdout);
        const rendered = fs.readFileSync(path.join(tmp, j.prompt), 'utf8');
        assert.ok(rendered.includes('Probe topic text'), `prompts/${k}.md: topic text not rendered`);
        assert.ok(rendered.includes(j.output), `prompts/${k}.md: output path not rendered`);
        assert.doesNotMatch(r.stderr, /unknown placeholder/, `prompts/${k}.md uses a placeholder the script does not know`);
        assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/, `prompts/${k}.md: a placeholder survived rendering`);
        assert.deepEqual([...j.includes].sort(), partials(), `prompts/${k}.md must include every shared partial - shared means shared by all kinds`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('shell and generated pages share one design', () => {
  // prompts/shared/page.md restates the shell's design tokens for the generating agents. The two must not drift:
  // change both together (and expect the artifacts to go stale).
  const SHARED_TOKENS = ['bg', 'fg', 'muted', 'line', 'soft', 'border'];
  const tokens = (css) => Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]));
  const split = (css) => { const i = css.indexOf('@media (prefers-color-scheme: dark)'); assert.ok(i > 0, 'dark block present'); return [tokens(css.slice(0, i)), tokens(css.slice(i))]; };
  const shellCss = read('devbok.html').match(/<style>([\s\S]*?)<\/style>/)[1];
  const page = read('prompts', 'shared', 'page.md');
  test('colour tokens match in light and dark', () => {
    const [shellLight, shellDark] = split(shellCss);
    const [pageLight, pageDark] = split(page);
    for (const t of SHARED_TOKENS) {
      assert.equal(pageLight[t], shellLight[t], `light --${t}: page.md says ${pageLight[t]}, devbok.html says ${shellLight[t]}`);
      assert.equal(pageDark[t], shellDark[t], `dark --${t}: page.md says ${pageDark[t]}, devbok.html says ${shellDark[t]}`);
    }
    assert.match(page, /--accent: \{\{ACCENT\}\}/);
    assert.match(page, /--accent: \{\{ACCENT_DARK\}\}/);
    const defaultAccent = read('scripts', 'devbok.mjs').match(/const DEFAULT_ACCENT = '(#[0-9a-f]{6})'/)[1];
    assert.equal(defaultAccent, shellLight.accent, "the script's default accent is the shell's own accent");
  });
  test('mono font and sidebar width match', () => {
    const mono = shellCss.match(/font-family: "([^"]+)"/)[1];
    assert.ok(page.includes(`"${mono}"`), `page.md must name the shell's mono font "${mono}"`);
    const width = shellCss.match(/--sidebar: (\d+)px/)[1];
    assert.ok(page.includes(`${width}px wide`), `page.md must state the shell's sidebar width (${width}px)`);
    const size = shellCss.match(/body \{[^}]*font-size: (\d+)px/)[1];
    assert.ok(page.includes(`mono at ${size}px`), `page.md must state the shell's sidebar font size (${size}px) in the typography rule`);
    assert.ok(page.includes(`.side {`) && page.match(/\.side \{[^}]*font-size: (\d+)px/)[1] === size, `the verbatim sidebar CSS must use ${size}px`);
  });
});

describe('repo integrity', () => {
  const topicDirs = () => fs.existsSync(path.join(ROOT, 'topics'))
    ? fs.readdirSync(path.join(ROOT, 'topics'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  test('topics/index.js is valid and matches the manifests', () => {
    const w = {};
    new Function('window', read('topics', 'index.js'))(w);
    assert.ok(Array.isArray(w.DEVBOK_TOPICS));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devbok-repo-'));
    try {
      fs.cpSync(path.join(ROOT, 'topics'), path.join(tmp, 'topics'), { recursive: true });
      const r = spawnSync(process.execPath, [SCRIPT, 'index'], { encoding: 'utf8', env: { ...process.env, DEVBOK_ROOT: tmp } });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(read('topics', 'index.js'), fs.readFileSync(path.join(tmp, 'topics', 'index.js'), 'utf8'),
        'topics/index.js is stale - run: node scripts/devbok.mjs index');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
  test('every topic directory has a manifest and every recorded artifact exists', () => {
    for (const slug of topicDirs()) {
      assert.match(slug, /^[a-z0-9][a-z0-9-]*$/, `topics/${slug}: not a valid slug`);
      assert.ok(exists('topics', slug, 'topic.json'), `topics/${slug}/topic.json missing`);
      const m = JSON.parse(read('topics', slug, 'topic.json'));
      assert.equal(m.slug, slug);
      assert.ok(m.title && m.topic, `${slug}: title and topic required`);
      const known = new Set();
      for (const k of scriptKinds) {
        const kk = m.kinds?.[k] ?? { next: 1, versions: [], pending: [] };
        for (const x of kk.versions) {
          assert.ok(exists('topics', slug, x.file), `${slug}: ${x.file} is recorded but missing`);
          assert.ok(x.v < kk.next, `${slug} ${k}: v${x.v} recorded but next is ${kk.next}`);
          known.add(x.file);
        }
        for (const x of kk.pending) { known.add(`${k}.v${x.v}.html`); assert.ok(x.v < kk.next); }
      }
      for (const f of fs.readdirSync(path.join(ROOT, 'topics', slug)).filter((f) => f.endsWith('.html'))) {
        assert.ok(known.has(f), `topics/${slug}/${f} is on disk but neither recorded nor pending`);
      }
    }
  });
  test('housekeeping files', () => {
    assert.match(read('.gitignore'), /^\.devbok\/$/m);
    assert.match(read('CLAUDE.md'), /@AGENTS\.md/);
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.scripts.test, /scripts\/\*\.test\.mjs/, 'npm test must pick up every test file');
  });
  test('rendered prompts in .devbok/ belong to a generation that is still pending', () => {
    // .devbok/ is git-ignored and legitimately exists while a generation is in flight; only files whose
    // version is neither pending nor about to be recorded are leftovers.
    if (!exists('.devbok')) return;
    for (const f of fs.readdirSync(path.join(ROOT, '.devbok'))) {
      if (/^[a-z0-9-]+\.[a-z]+\.draft\.(prompt\.md|html)$/.test(f)) continue; // dry-run files are throwaway and may linger
      const m = /^([a-z0-9-]+)\.([a-z]+)\.v(\d+)\.prompt\.md$/.exec(f);
      assert.ok(m, `.devbok/${f}: unexpected file`);
      const [, slug, kind, v] = m;
      const manifestFile = path.join(ROOT, 'topics', slug, 'topic.json');
      assert.ok(fs.existsSync(manifestFile), `.devbok/${f} belongs to a topic that no longer exists; delete the file`);
      const pending = (JSON.parse(fs.readFileSync(manifestFile, 'utf8')).kinds?.[kind]?.pending ?? []).some((x) => x.v === Number(v));
      assert.ok(pending, `.devbok/${f} lingers: ${slug} ${kind} v${v} is not pending (recorded or deleted); delete the file`);
    }
  });
});
