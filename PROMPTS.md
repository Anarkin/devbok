# The prompt contract

How a brief is assembled, and the rules a file under `prompts/` has to keep. **Read this before editing
anything in `prompts/`** - `scripts/devbok.mjs prepare` and `scripts/repo.test.mjs` both enforce it, so a
prompt that breaks a rule here fails loudly rather than producing a bad artifact. The rest of the repo is
described in [AGENTS.md](AGENTS.md).

`prompts/shared/template.md` gives every brief its shape. It is the only file that pulls in the shared partials (`{{include:name}}` → `prompts/shared/<name>.md`; partials may include partials, cycles are refused, a missing partial fails `prepare` before anything changes), and it declares the slots a kind prompt fills:

```
TOPIC: {{TOPIC}}
{{slot:goal}}                 the kind's goal paragraph
{{include:persona}}  {{include:delivery}}  {{include:research}}
{{slot:design}}               the kind's own design section, with its own ## heading
{{include:page}}
{{slot:content}}              what the artifact must contain, with its own ## heading, incl. kind-specific quality items
{{include:quality}}
```

`prompts/shared/draft.md` is the dry-run banner `prepare --draft` prepends to the assembled brief. Like the template it is not a partial, so the include-all rule does not apply to it; it still starts with one `## ` heading.

A kind prompt (`prompts/<kind>.md`) is pure content: blocks introduced by a marker line `{{slot:name}}`, nothing before the first marker, no `TOPIC:` line, no includes (placeholders such as `{{TOPIC}}` may be used inside a block). See `prompts/study.md` for the reference. A kind prompt is **devbok-ready** when it fills every slot the template declares; a free-form prompt (no markers) or one with an unfilled slot is refused with "not devbok-ready" and the generating skills skip that kind. An unknown slot, a duplicate slot, or text before the first marker is a hard error. The "stale" hash is computed on the assembled text (template + partials + kind file), so editing any of them marks the affected artifacts stale.

Two rules for `prompts/shared/`, both enforced by `scripts/repo.test.mjs`:

- A partial holds only text that applies to **every** kind. Anything true for just some kinds lives in those kind prompts, even if that repeats a few lines. Only the template includes partials, so this holds by construction.
- Every partial starts with exactly one `## ` heading on its first line and contains no other `#`/`##` heading (H3 and below are fine), so the assembled brief has one consistent heading level.

| partial    | heading        | provides                                                                                                   |
|------------|----------------|------------------------------------------------------------------------------------------------------------|
| `persona`  | Who I am       | level calibration: lead/principal engineer, ceiling visible up to principal                                |
| `delivery` | How to deliver | unattended, never ask, one file at `{{OUTPUT}}`, run `validate`, report                                    |
| `research` | Research first | web research before writing: latest version, modern vs legacy, dated with `{{DATE}}`                       |
| `page`     | The page       | everything an artifact page shares: self-contained file, provenance, hero, sidebar with scrollspy, localStorage prefix, code and tables, and the fixed design system - the shell's tokens light and dark, system sans + Cascadia Mono, verbatim hero and 260px sidebar - with the topic's `{{ACCENT}}` / `{{ACCENT_DARK}}` |
| `quality`  | Quality bar    | topic decides the shape, modern-first legacy-aware, version precision, specific over vague, official-doc links, no assumptions about me |

Not shared, on purpose - no file in `prompts/shared/` may mention any of these, partials, the template and the draft banner alike, because at least one kind has none of them. `scripts/repo.test.mjs` reads the list below and enforces it, so add a term when one kind grows something the others do not have:

    <details>
    self-quiz
    depth over breadth
    teach for transfer
    coverage table
    topic map
    what the interviewer is really probing

They live in the kind prompts that want them, repeated where several do. Not wanted anywhere: progress tracking ("mark as studied" checkboxes, progress bars); the `page` partial forbids it.

`prepare` substitutes these placeholders in the assembled text; the template (with its partials) must contain the required ones:

| placeholder       | required | value                                                             |
|-------------------|----------|-------------------------------------------------------------------|
| `{{TOPIC}}`       | yes      | full topic text, verbatim from `topic.json`                       |
| `{{OUTPUT}}`      | yes      | absolute path of the HTML file to write, e.g. `C:/Code/devbok/topics/csharp/study.v2.html` |
| `{{TITLE}}`       |          | short display title                                               |
| `{{SLUG}}`        |          | slug                                                              |
| `{{KIND}}`        |          | `study` / `experience` / `interview` / `cheatsheet`               |
| `{{VERSION}}`     |          | version number, e.g. `2`                                          |
| `{{DATE}}`        |          | today, `YYYY-MM-DD`                                               |
| `{{PROMPT_FILE}}` |          | `study.md` etc.                                                   |
| `{{PROMPT_HASH}}` |          | 8-hex hash of the prompt file that produced this render           |
| `{{ACCENT}}`      |          | the topic's accent colour from `topic.json`, e.g. `#512bd4`   |
| `{{ACCENT_DARK}}` |          | a lighter tint of it for dark backgrounds, derived by the script |

A kind prompt fills its slots and nothing more: the partials already make every brief non-interactive (a subagent cannot ask anything, so "state assumptions and proceed" - the topic text is the disambiguation), name the single deliverable at `{{OUTPUT}}`, ask for web research, point at `node scripts/devbok.mjs validate {{OUTPUT}}`, and require HTML that satisfies the artifact contract below.
