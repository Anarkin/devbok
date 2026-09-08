{{slot:goal}}
I want a dense, printable reference card for the topic above that I keep open while coding — something I scan, not something I read: syntax and APIs, commands and flags, what's modern versus what's legacy, and a version timeline of what changed when. No prose to study, no Q&A; density, accuracy and currency are the whole point. This is the artifact I'll regenerate most often, so keep it cheap and tight.

{{slot:design}}
## Design the card

Let the topic decide the sections (a language wants more syntax, a CLI tool more commands, a database more query and administration idioms), typically 6–12 dense sections drawn from: syntax essentials; the APIs and types reached for daily; commands, flags and configuration (CLI, project and config files); idioms and patterns, each shown the modern way with the legacy equivalent alongside; gotchas and pitfalls, one line each; a modern-versus-legacy table; and a version timeline. Prefer what a working engineer uses weekly over the exotic — link the docs for the rest.

{{slot:content}}
## The reference card

- Hero summary: 3 sentences — what is on the card and which version it reflects; no "how to use". Chips: the version facts only.
- The units are the card's sections.
- Layout: one column, the sections stacked in order so the page reads top to bottom like every other devbok page — never a multi-column grid of sections. Each section is a compact card; the content column may be up to 120ch wide because every row is a task or concept on the left and the syntax or command on the right in monospace, with a minimal example where the syntax alone is not obvious. No paragraph longer than two lines.
- Section content:
  - Syntax and APIs: the constructs and calls I reach for daily, each with a minimal, correct example.
  - Commands and flags: the ones actually used, with the one-liner each achieves.
  - Idioms and gotchas: the modern way with the legacy pattern I'll still meet in real codebases, and one-line pitfalls.
  - Modern-versus-legacy table. Columns: **Task**, **Modern**, **Legacy still seen**, **Since**.
  - Version timeline, latest first: version, date, what changed in one line each, marking newly stable, newly default and newly deprecated — the part most likely to go stale, so verify it against the research.
- Print: a `@media print` stylesheet that hides the sidebar and chrome, prints black on white on 2–4 A4/Letter pages, avoids page breaks inside a section, and prints links as plain text.
- Every item must be correct for the latest stable version, labelled with the version where it became true when that matters. Terse beats complete: if something needs a paragraph, it does not belong on the card.
