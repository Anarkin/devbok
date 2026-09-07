## How to deliver

You are running unattended inside devbok, a personal knowledge base, as one of several parallel generation jobs. Nobody can answer questions, so never ask any. If something genuinely affects the outcome — an ambiguous topic name, an unclear version or edition, several technologies sharing a name — decide, state the assumption in one sentence inside the hero summary, and proceed. The topic text at the top of this brief is the disambiguation; do not narrow or widen it.

Settle the full outline before writing anything, then deliver in ONE iteration. The only deliverable is a single self-contained HTML file written to exactly this path (build it in parts if it is large; never stream HTML into the chat, and do not create any other file):

    {{OUTPUT}}

Before finishing, run

    node scripts/devbok.mjs validate "{{OUTPUT}}"

and fix everything it lists under `errors`, and under `warnings` where reasonable. Then reply with the final validation JSON plus a 2–3 line summary of what the file contains.
