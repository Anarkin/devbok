---
name: devbok-list
description: List devbok topics with the latest version of each artifact kind and staleness markers. Usage - /devbok-list
allowed-tools: Bash(node scripts/devbok.mjs list:*)
---

## Current topics

!`node scripts/devbok.mjs list`

Show the table above to the user as-is (if it is missing, run `node scripts/devbok.mjs list` yourself and show that). A `*` marks an artifact whose latest version does not match the current prompt file; suggest `/devbok-update <slug> <kind>` for those - or, if the user says that page was already patched onto the new prompt by hand, `node scripts/devbok.mjs restamp <slug>`, which re-validates it and stamps it without regenerating. Do not run anything else.
