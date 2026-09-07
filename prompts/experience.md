TOPIC:

I'm preparing for behavioural interviews ("tell me about a time you…") that center on a specific technical stack, and I have two equally important goals: genuinely RECALL and shape my OWN real experiences into confident, well-structured stories AND understand the technology deeply enough that every story holds up under drill-down. Neither is secondary — the stories are ideation scaffolds to jog my memory and teach me the STAR-shaped delivery, and they must double as real technical teaching about the topic so the experience layer reinforces genuine depth, not interview theatre.
My level: lead engineer — calibrate the ceiling for that, and make the drill chains hard: expect architecture and tradeoff probing, incident-command judgment, "how did you get the team to agree", and "at what scale does this break" follow-ups, not just "what did you do". Keep the tier range visible though (Junior → Principal per story) so I can pick the right altitude for the level I'm actually interviewing at.

Build me a complete, self-contained behavioural-story bank as a single downloadable HTML file — in ONE iteration if you have no questions. If something genuinely affects the outcome (ambiguous topic name, unclear version or edition, multiple technologies sharing the topic's name), ask your clarifying questions FIRST, all in one batch, before doing any other work — then deliver the complete bank in your next response. Do not ask about details you can safely assume (story count, tier spread, design): state those assumptions in one sentence and proceed.

These stories are IDEATION SCAFFOLDS, never a fabricated history to recite as-is. Every worked example is fiction I replace with my own equivalent — label it as such (see below). The reader's goal is genuine recall and confident delivery of their OWN experience.

## Step 1 — Research before writing anything

Search the web first to verify the current technical reality of the topic: the latest stable version and its release date, what changed in the most recent release, what is newly default or newly deprecated, and which failure modes, tools, and fixes are current versus legacy. The story details — symptoms, diagnostics, tools, resolutions, numbers — must be plausible for real production use TODAY, not a version that shipped years ago. Include at least one very recent, citable detail I can weave into a story to sound current. If you have no web access in this environment, say so explicitly, state your knowledge-cutoff date, and clearly label anything that may have changed since — never invent a "latest version".

## Step 2 — Design the story bank

Choose a diverse set of archetypes, one per story, specialised to the topic — span a broad range so no two stories share the same shape. Draw from (and extend as the topic warrants): a performance problem you diagnosed, a hard architectural trade-off, a production incident/outage, a migration or version upgrade, a technical disagreement with a colleague, a nasty debugging session, a scaling challenge, a security issue found or fixed, a tech-debt paydown/refactor, mentoring or levelling someone up, a scope/deadline negotiation, a data-loss or corruption scare, ambiguous or shifting requirements, a cross-team or integration dependency, a project that failed or was cancelled, a cost-optimisation win, introducing a new tool, on-call firefighting, a CI/test/reliability improvement, pushing back on a stakeholder or manager.

Aim for 20 distinct, non-overlapping stories spanning the tier range from mid up to principal. If the topic genuinely can't sustain 20 non-overlapping stories, produce as many as it honestly supports and say so — never pad with near-duplicates, and if two archetypes would produce near-identical stories for this topic, drop one and add a different angle. Briefly state your chosen story list (title + archetype + tier) before building. Then add one extra final section: "The big behavioural Q&A" for the cross-cutting prompts that aren't tied to a single story.

## Step 3 — Build the HTML file (the only deliverable)

Use your file-creation/code tools to build the file (in parts if it is large), then provide it as a download. If you cannot create files in this environment, say so BEFORE starting — do not stream the raw HTML into the chat, where it will truncate.

One self-contained .html file containing:

- A fixed sidebar navigation listing all stories (numbered, since order and coverage matter), with scrollspy highlighting of the current story, and a progress tracker: every story ends with a "Mark as prepped" checkbox that fills a visual progress indicator in the sidebar. Keep progress in memory only — do NOT use localStorage (it is not supported in this environment).
- A hero header with: the topic, latest version + release date, a 3–5 sentence "how to use this" summary (these are scaffolds — replace every worked example with your own real experience; the `EXAMPLE — replace with your own` label marks fiction, not your history; use the recall prompts to find your equivalent and the drill chains to pressure-test it), and small chips for the headline facts (story count, archetypes covered, tier range).
- Immediately below the hero: a coverage table (`<table>`) mapping each story to its archetype and tier, so I see the spread at a glance and can spot gaps in my own history. Columns: **#**, **Story title**, **Archetype**, **Tier**.
- Embed machine provenance as an HTML comment near the top of `<body>` (use the original, unslugified topic; set `generated` to today's date):

  ```html
  <!--
  prompt: prompt__experience-stories.md
  topic: "{{TOPIC}}"
  generated: <YYYY-MM-DD>
  -->
  ```

- Each story section must contain, in this order:
  1. A header with the story's number, a short descriptive title, a **tier chip** (Junior / Mid / Senior / Staff / Principal), and an **archetype chip**.
  2. **(a) Worked example** — labelled `EXAMPLE — replace with your own`. An in-depth, first-person, specific account (real numbers, real symptoms, real trade-offs) written as flowing prose, not bullet spam: the challenge → what was used and how → what broke → what you'd do differently. Concrete enough to be memorable, and dual-purpose: it must also teach the underlying topic concept (a memory-leak story teaches the GC internals). When the story genuinely turns on code or config, include a realistic snippet with syntax highlighting (highlight.js from cdnjs), and a comparison table where it truly clarifies a trade-off.
  3. A **"What the interviewer is really probing"** callout — the signal behind the prompt and the mistake candidates actually make on this archetype (rambling with no result, no ownership of the failure, taking solo credit for team work, etc.).
  4. **(b) STAR/CARL scaffold** — Situation → Task → Action → Result → what I'd do differently: a reusable skeleton I drop my own facts into.
  5. **(c) Recall prompts** — a short hands-on block of 3–5 questions that surface MY OWN equivalent experience ("When did you last watch {{TOPIC}} behave differently under load than in dev?"), with a hidden hint or example answer sketch in a collapsed block.
  6. **(d) Follow-up drill chain** — 4–6 likely interviewer drill-downs (why? → what if? → at what scale does this break? → what did you trade away? → what would you do differently now?) as collapsed expandable `<details>` blocks: question visible, spoken-ready model answer (3–6 sentences, lead-level nuance, names tradeoffs) hidden until clicked, so I can self-quiz.
- The final "The big behavioural Q&A" section: 15–25 cross-cutting behavioural prompts, scaled to the topic, grouped under themed dividers (e.g. failure & ownership, conflict & influence, leadership & mentoring, ambiguity & prioritisation, values & motivation). Each as a collapsed `<details>` block where the answer names which of my prepared stories to deploy and what the interviewer wants to hear. Adapt themes to what the topic and the lead-engineer level actually demand.
- Close with a "Night-before cheat sheet": ~10 confident, speakable sentences on delivering behavioural stories well for this topic (lead with the situation in one line, quantify the result, own the "what I'd do differently", separate "I" from "we" honestly, tie the technical decision back to the topic's real tradeoffs).

## Quality bar

- Scaffolds, not scripts: every worked example is labelled `EXAMPLE — replace with your own` and is explicitly fiction to trigger my recall — never presented as something I actually did.
- Dual-purpose depth: each story teaches the underlying topic concept accurately, so preparing behaviourally also sharpens my technical depth. Advanced/expert ceiling; real trade-offs and "it depends, because…" over generic advice.
- Modern & accurate: symptoms, tools, and fixes must be plausible for the latest stable version. Label anything version-specific with the version where it became true; never build a story around a deprecated pattern presented as current.
- Specific over vague: concrete numbers, symptoms, and decisions make a story memorable and reusable. No hand-waving, no filler stories.
- Teach for transfer: the scaffolds and drill chains should let me improvise credible answers to follow-ups I never rehearsed, not recite a fixed script. Connect stories where the same underlying concept recurs.
- Neutral and reusable: no company names, no assumptions beyond the topic.
- Design: light, developer-oriented, visually grounded in the topic's own brand identity (its real logo colors / visual world — not a generic template), readable typography, responsive down to mobile, focus-visible states for keyboard use.
- Before delivering, programmatically validate the HTML (balanced tags, count the stories and the drill blocks per story) and report the totals. Then give me the file as a download, named after the topic (e.g. `react-server-components-experience-stories.html`).
