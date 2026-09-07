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
    assert.ok(newBody.includes(`Launch ${['zero', 'one', 'two', 'three', 'four', 'five', 'six'][scriptKinds.length]} \`Agent\` subagents`), 'devbok-new must launch one subagent per kind');
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
  test('the real prompt files render cleanly through prepare, or are refused as not ready', () => {
    // Runs the actual prompts/ directory in a temp root. A prompt that is not devbok-ready must be refused;
    // a ready one must render the topic and output path and leave no placeholder behind.
    const required = requiredPlaceholders();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'devbok-prompts-'));
    try {
      fs.cpSync(path.join(ROOT, 'prompts'), path.join(tmp, 'prompts'), { recursive: true });
      const env = { ...process.env, DEVBOK_ROOT: tmp };
      const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });
      assert.equal(run('init', 'probe', '--title', 'Probe', '--topic', 'Probe topic text').status, 0);
      for (const k of scriptKinds) {
        const ready = required.every((p) => read('prompts', `${k}.md`).includes(`{{${p}}}`));
        const r = run('prepare', 'probe', k);
        if (!ready) {
          assert.equal(r.status, 1, `prompts/${k}.md is not ready and must be refused`);
          assert.match(r.stderr, /not devbok-ready/);
          continue;
        }
        assert.equal(r.status, 0, r.stderr);
        const j = JSON.parse(r.stdout);
        const rendered = fs.readFileSync(path.join(tmp, j.prompt), 'utf8');
        assert.ok(rendered.includes('Probe topic text'), `prompts/${k}.md: topic text not rendered`);
        assert.ok(rendered.includes(j.output), `prompts/${k}.md: output path not rendered`);
        assert.doesNotMatch(r.stderr, /unknown placeholder/, `prompts/${k}.md uses a placeholder the script does not know`);
        assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/, `prompts/${k}.md: a placeholder survived rendering`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
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
    assert.equal(exists('.devbok'), false, '.devbok/ (rendered prompts) should not linger between runs');
  });
});
