<!-- DRAFT - not devbok-ready yet: it deliberately contains none of the double-brace placeholders
     (TOPIC, OUTPUT, ...) from AGENTS.md "Prompt contract", so `prepare` refuses to run it.
     Idea captured 2026-09-07; the actual prompt is still to be written. -->

TOPIC:

# Cheat sheet (4th kind) - draft brief

A dense, printable reference card you keep open while coding rather than something you read:

- syntax and APIs,
- commands and flags,
- a modern-versus-legacy table,
- a version timeline of what changed when.

Cheap to generate and the most reused artifact day to day. The "night-before" sections in the study and experience prompts are a hint that this wants to exist on its own.

Notes for when the prompt is written:

- Same artifact contract as the others (single self-contained HTML at the OUTPUT path, provenance comment, validation), plus a `@media print` stylesheet: this one is meant to be printed or kept in a side window.
- Probably the kind that gets `/devbok-update <slug> cheatsheet` most often, because the version timeline goes stale fastest; keep it cheap (no long prose, no Q&A).
- Study and experience can keep their night-before sections; no need to strip them.
