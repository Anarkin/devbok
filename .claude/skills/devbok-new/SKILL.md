---
name: devbok-new
description: Create a new devbok topic and generate version 1 of its four artifacts (study, experience, interview, cheatsheet). Usage - /devbok-new [slug:] <topic text>
disable-model-invocation: true
allowed-tools: Bash(node scripts/devbok.mjs:*), Read, Agent
---

Create a new devbok topic from: `$ARGUMENTS`

`scripts/devbok.mjs` owns every deterministic decision (slug validation, version numbers, manifest, index). You own only: parsing the arguments, choosing a slug and a title, and delegating generation to subagents. Never write artifact HTML yourself. Never run this flow unless the user invoked `/devbok-new`. Do NOT use `context: fork` for this skill: it must run in the main context so it can launch parallel subagents.

## 1. Parse the arguments

- If the text starts with `<word>:` and `<word>` matches `^[a-z0-9-]+$`, then `<word>` is the slug and everything after the colon (trimmed) is the topic text.
- Otherwise the whole text is the topic. Propose a short slug: 1-3 words, lowercase, hyphenated, no filler words. Examples: `c#` -> `csharp`; `ASP.NET Core & .NET runtime (assume C# is covered ...)` -> `dotnet`; `System design interviews (as a full-stack .NET engineer ...)` -> `system-design`; `SQL Server and PostgreSQL (...)` -> `sql`.
- Sanitize it: `node scripts/devbok.mjs slug "<proposed>"` and use the printed value.
- Choose a display title of at most 40 characters for the sidebar, for example `System design (.NET full-stack)`. The topic text itself is stored verbatim and is what the prompts receive, so never shorten or "improve" it.

## 2. Register the topic

```
node scripts/devbok.mjs init <slug> --title "<title>" --topic "<topic text verbatim>"
```

If it fails because the slug already exists, stop and tell the user to run `/devbok-update <slug>` instead (or pick another slug with `/devbok-new other-slug: <topic>`).

## 3. Prepare one rendered prompt per kind

Run, for each of `study`, `experience`, `interview`, `cheatsheet`:

```
node scripts/devbok.mjs prepare <slug> <kind>
```

Each successful call prints JSON with `version`, `output` (the exact HTML path to write) and `prompt` (the rendered prompt file with the topic filled in). If a call fails with "not devbok-ready", that kind's prompt has not been refactored yet: skip the kind and tell the user. Any other failure: stop, show the message verbatim, and launch nothing. If no kind could be prepared, report that and stop; the topic stays registered and `/devbok-update <slug>` picks it up once a prompt is ready.

## 4. Generate the prepared kinds in parallel

Launch one `Agent` subagent (`general-purpose`) per prepared kind, all in ONE message so they run concurrently. Give each exactly this brief, with the paths from step 3 filled in:

> Read `<prompt path>` and follow it exactly. It is a complete, self-contained brief with the topic already filled in. Its only deliverable is the single HTML file at `<output>`; write it there, in parts if it is large. Do not ask questions: state assumptions and proceed. When done, run `node scripts/devbok.mjs validate "<output>"`, fix anything it reports under `errors`, and reply with the final validation JSON plus a 2-3 line summary of what the file contains.

Wait for all of them to finish. Do not generate any of them yourself if one fails; report instead.

## 5. Record and report

For every prepared kind whose subagent finished, run:

```
node scripts/devbok.mjs record <slug> <kind> v<version>
```

`record` re-validates the file, adds it to the manifest, and rebuilds `topics/index.js`. If it fails, show the error and leave that version pending; do not delete anything. Finally run `node scripts/devbok.mjs list`, show the table, and tell the user to open `devbok.html#<slug>/study`.
