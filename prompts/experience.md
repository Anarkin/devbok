{{slot:goal}}
I'm preparing for behavioural interviews ("tell me about a time you…") that center on the topic above, and I have two equally important goals: genuinely RECALL and shape my OWN real experiences into confident, well-structured stories AND understand the technology deeply enough that every story holds up under drill-down. Neither is secondary — the stories are ideation scaffolds to jog my memory and teach me STAR-shaped delivery, and they must double as real technical teaching about the topic, so the experience layer reinforces genuine depth, not interview theatre.

These stories are IDEATION SCAFFOLDS, never a fabricated history to recite as-is. Every worked example is fiction I replace with my own equivalent, and is labelled as such. Make the drill chains hard: architecture and trade-off probing, incident-command judgment, "how did you get the team to agree", "at what scale does this break" — not just "what did you do". Keep the tier range visible per story (Junior → Principal).

{{slot:design}}
## Design the story bank

Choose a diverse set of archetypes, one per story, specialised to the topic — span a broad range so no two stories share the same shape. Draw from (and extend as the topic warrants): a performance problem you diagnosed, a hard architectural trade-off, a production incident/outage, a migration or version upgrade, a technical disagreement with a colleague, a nasty debugging session, a scaling challenge, a security issue found or fixed, a tech-debt paydown/refactor, mentoring or levelling someone up, a scope/deadline negotiation, a data-loss or corruption scare, ambiguous or shifting requirements, a cross-team or integration dependency, a project that failed or was cancelled, a cost-optimisation win, introducing a new tool, on-call firefighting, a CI/test/reliability improvement, pushing back on a stakeholder or manager.

Aim for 20 distinct, non-overlapping stories spanning the tiers from mid up to principal; if two archetypes would produce near-identical stories for this topic, drop one and add a different angle. Then add one extra final section, "The big behavioural Q&A", for the cross-cutting prompts that aren't tied to a single story.

{{slot:content}}
## The story bank

- Hero summary: a 3–5 sentence "how to use this" — these are scaffolds; replace every worked example with your own real experience; the `EXAMPLE — replace with your own` label marks fiction, not your history; use the recall prompts to find your equivalent and the drill chains to pressure-test it. Chips: story count, archetypes covered, tier range.
- Immediately below the hero: a coverage table mapping each story to its archetype and tier, so I see the spread at a glance and can spot gaps in my own history. Columns: **#**, **Story title**, **Archetype**, **Tier**.
- The units are the numbered stories.
- Self-quiz blocks are `<details>`: a 1px `--border` box, a bold summary, and the marker in `--accent`.
- Each story must contain, in this order:
  1. A header with the story's number, a short descriptive title, a **tier chip** (Junior / Mid / Senior / Staff / Principal), and an **archetype chip**.
  2. **(a) Worked example** — labelled `EXAMPLE — replace with your own`. An in-depth, first-person, specific account (real numbers, real symptoms, real trade-offs) written as flowing prose, not bullet spam: the challenge → what was used and how → what broke → what you'd do differently. Concrete enough to be memorable, and dual-purpose: it must also teach the underlying topic concept (a memory-leak story teaches the GC internals). When the story genuinely turns on code or config, include a realistic snippet, and a comparison table where it truly clarifies a trade-off. Set it at no named company, so I can drop in my own.
  3. A **"What the interviewer is really probing"** callout — the signal behind the prompt and the mistake candidates actually make on this archetype (rambling with no result, no ownership of the failure, taking solo credit for team work, etc.).
  4. **(b) STAR/CARL scaffold** — Situation → Task → Action → Result → what I'd do differently: a reusable skeleton I drop my own facts into.
  5. **(c) Recall prompts** — a short hands-on block of 3–5 questions that surface MY OWN equivalent experience ("When did you last watch {{TITLE}} behave differently under load than in dev?"), each with a hidden hint or example answer sketch in a collapsed block.
  6. **(d) Follow-up drill chain** — 4–6 likely interviewer drill-downs (why? → what if? → at what scale does this break? → what did you trade away? → what would you do differently now?) as collapsed `<details>` self-quiz blocks: the question visible, a spoken-ready model answer (3–6 sentences, lead-level nuance, names the trade-offs) hidden until clicked.
- The final "The big behavioural Q&A" section: 15–25 cross-cutting behavioural prompts, scaled to the topic, grouped under themed dividers (e.g. failure & ownership, conflict & influence, leadership & mentoring, ambiguity & prioritisation, values & motivation). Each as a collapsed `<details>` block whose answer names which of my prepared stories to deploy and what the interviewer wants to hear. Adapt the themes to what the topic and the level actually demand.
- Close with a "Night-before cheat sheet": ~10 confident, speakable sentences on delivering behavioural stories well for this topic (lead with the situation in one line, quantify the result, own the "what I'd do differently", separate "I" from "we" honestly, tie the technical decision back to the topic's real trade-offs).
- Scaffolds, not scripts: every worked example is explicitly fiction to trigger my recall — never presented as something I actually did.
- Dual-purpose depth: each story teaches the underlying topic concept accurately, so preparing behaviourally also sharpens my technical depth. Real trade-offs and "it depends, because…" over generic advice.
- Plausible today: symptoms, diagnostics, tools, resolutions and numbers must hold for real production use on the latest stable version; never build a story around a deprecated pattern presented as current.
- Teach for transfer: the scaffolds and drill chains should let me improvise credible answers to follow-ups I never rehearsed, not recite a fixed script. Connect stories where the same underlying concept recurs.
