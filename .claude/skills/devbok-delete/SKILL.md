---
name: devbok-delete
description: Delete a whole devbok topic, or one version of one artifact. Deterministic, user-only. Usage - /devbok-delete <slug>  |  /devbok-delete <slug> <kind> v<N>
disable-model-invocation: true
allowed-tools: Bash(node scripts/devbok.mjs delete:*)
---

Run exactly this one command, with the arguments passed through unchanged:

```
node scripts/devbok.mjs delete $ARGUMENTS
```

Then show its output verbatim. Do not interpret the arguments, do not retry with different ones, and do not delete anything by any other means. If the script rejects the arguments, show its message and stop. Version numbers are never reused after a delete; that is intended.
