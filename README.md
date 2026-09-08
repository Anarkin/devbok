# devbok - Developer's Body of Knowledge

A personal interview-prep knowledge base. Each **topic** gets four generated, versioned, self-contained
HTML artifacts - a study guide, a behavioural story bank, a question bank and a printable cheat sheet -
browsed through the static `devbok.html` shell.

- **Read it** - open `devbok.html` straight from disk, or serve the folder with any static server.
  Deep links: `devbok.html#<slug>/<kind>/v<N>`; omit the version for the latest.
- **Generate** - open this folder in Claude Code and run `/devbok-new`, `/devbok-update`, `/devbok-list`
  or `/devbok-delete`. The prompts live in `prompts/`, everything deterministic in `scripts/devbok.mjs`.
- **Test** - `npm test` (Node's built-in runner, no dependencies).

How it fits together, and the contracts a change has to keep: [AGENTS.md](AGENTS.md).
