---
name: devbok-update
description: Generate a NEW version of an existing devbok topic's artifacts (all four kinds, or just one), or a quick draft for a layout check. Older versions are kept. Usage - /devbok-update <slug> [study|experience|interview|cheatsheet] [draft]
disable-model-invocation: true
allowed-tools: Bash(node scripts/devbok.mjs:*), Read, Agent
---

Generate new artifact version(s) for: `$ARGUMENTS`

`scripts/devbok.mjs` owns every deterministic decision (version numbers, manifest, index). You own only: parsing the arguments and delegating generation to subagents. Never write artifact HTML yourself, never delete anything, and never run this flow unless the user invoked `/devbok-update`. Do NOT use `context: fork` for this skill: it must run in the main context so it can launch parallel subagents.

## 1. Parse the arguments

- First token is the slug. Optional tokens after it, in any order: a kind (`study`, `experience`, `interview` or `cheatsheet`) and/or the word `draft`. Anything else: stop and show the usage line above.
- `draft` means a dry run: no version is reserved or recorded, the pages land in `.devbok/`, and the run takes minutes rather than half an hour. Use it to check layout and design after a prompt change.
- Read `topics/<slug>/topic.json`. If it does not exist, stop and tell the user to run `/devbok-new <slug>: <topic text>`. Its `topic` field is the text the prompts receive and its `accent` field is the colour all of the topic's pages share; never modify them here (the user edits them by hand to rephrase the topic or change the colour).
- Kinds to generate: the one given, otherwise all four.

## 2. Prepare one rendered prompt per kind

For each selected kind (append `--draft` for a dry run):

```
node scripts/devbok.mjs prepare <slug> <kind>
```

Each successful call prints JSON with `version` (the new, never-reused number), `output` (the exact HTML path to write) and `prompt` (the rendered prompt file). If a call fails with "not devbok-ready", that kind's prompt does not fill every slot the template declares: skip the kind and tell the user, so a half-finished prompt edit cannot block the others. Any other failure: stop, show the message verbatim, and launch nothing. If no kind could be prepared, report that and stop.

## 3. Generate the prepared kinds in parallel

Launch one `Agent` subagent (`general-purpose`) per prepared kind, all in ONE message so they run concurrently; same model for drafts and real runs (the rendered brief already carries the draft instructions). Give each exactly this brief, with the paths from step 2 filled in:

> Read `<prompt path>` and follow it exactly. It is a complete, self-contained brief with the topic already filled in. Its only deliverable is the single HTML file at `<output>`; write it there, in parts if it is large. Sibling agents for the other kinds are generating at the same time and share your scratchpad directory: keep every intermediate file in a `<slug>-<kind>/` subdirectory of it, never at the top level under a generic name like `p00.html`. Do not ask questions: state assumptions and proceed. When done, run `node scripts/devbok.mjs validate "<output>"`, fix anything it reports under `errors`, and reply with the final validation JSON plus a 2-3 line summary of what the file contains.

Wait for all of them to finish. Do not generate any of them yourself if one fails; report instead.

## 4. Record and report

For a draft run there is nothing to record: report each `output` path and tell the user to open `devbok.html#<slug>/<kind>/draft` (the draft appears in the version dropdown only while that link is open; the next draft overwrites it, deleting the topic removes it). Otherwise, for every prepared kind whose subagent finished, run:

```
node scripts/devbok.mjs record <slug> <kind> v<version>
```

`record` re-validates the file, adds it to the manifest (previous versions stay), and rebuilds `topics/index.js`. If it fails, show the error and leave that version pending. Finally run `node scripts/devbok.mjs list`, show the table, and tell the user to open `devbok.html#<slug>/<kind>` (the newest version is selected by default; older ones are in the version dropdown).
