TOPIC:

I'm preparing for a technical interview, and I have two equally important goals: genuinely UNDERSTAND the topic (mental models I can reason from, not memorized answers) AND pass the interview itself. Neither is secondary — teach me deeply, and drill me on exactly what interviewers ask.
My level: lead engineer — calibrate everything for that: expect architecture and tradeoff discussions, design decisions at system scale, code-review judgment, and "how would you guide a team through X" scenarios, not just API recall. Fundamentals still belong in the guide, but treat them as things I verify quickly, not things I'm learning for the first time.

Build me a complete, self-contained interview study guide as a single downloadable HTML file — in ONE iteration if you have no questions. If something genuinely affects the outcome (ambiguous topic name, unclear version or edition, multiple technologies sharing the topic's name), ask your clarifying questions FIRST, all in one batch, before doing any other work — then deliver the complete guide in your next response. Do not ask about details you can safely assume (depth, structure, design): state those assumptions in one sentence and proceed.

## Step 1 — Research before writing anything

Search the web first to verify the current state of the topic: the latest stable version and its release date, what changed in the most recent release, what is newly stable, newly default, or newly deprecated, and what the current "modern way" is versus the legacy way still found in real codebases. The guide must reflect today's reality, not your training data. Include at least one very recent, citable change I can mention in the interview to sound current. If you have no web access in this environment, say so explicitly, state your knowledge-cutoff date, and clearly label anything that may have changed since — never invent a "latest version".

## Step 2 — Design the curriculum

Identify the core building blocks of the topic and order them as a learning sequence where each section builds on the previous ones. Let the topic determine the count: a focused library might genuinely have 6–8, a full framework or platform 10–14. Never pad a small topic with filler sections to reach a number, and never merge unrelated concepts to stay under one — the right granularity is "one coherent interview theme per section". Briefly state your chosen section list before building. Then add one extra final section: "The big Q&A" for everything important that isn't a core building block.

## Step 3 — Build the HTML file (the only deliverable)

Use your file-creation/code tools to build the file (in parts if it is large), then provide it as a download. If you cannot create files in this environment, say so BEFORE starting — do not stream the raw HTML into the chat, where it will truncate.

One self-contained .html file containing:

- A fixed sidebar navigation listing all sections (numbered, since the order is a real curriculum), with scrollspy highlighting of the current section, and a progress tracker: every section ends with a "Mark as studied" checkbox that fills a visual progress indicator in the sidebar. Keep progress in memory only — do NOT use localStorage (it is not supported in this environment).
- A hero header with: the topic, latest version + release date, a 3–5 sentence "state of the technology" summary, and small chips for the headline facts.
- Each core section must contain, in this order:
  1. An in-depth prose explanation (not bullet spam): how it works, what problem it solves, why it was designed this way, and what changed recently. Build a mental model I can reason from — when a concept is abstract, anchor it with a concrete running example or analogy.
  2. Realistic code examples with syntax highlighting (highlight.js from cdnjs), and comparison tables where they genuinely clarify.
  3. At least one "Interview trap" / "Gotcha" callout — the mistake candidates actually make on this topic.
  4. A short "Try it" block: 1–2 small hands-on exercises I can actually do to internalize the section (e.g. "build X", "break Y on purpose and observe Z"), each with the expected outcome or a solution sketch hidden in a collapsed block.
  5. 10 interview Q&A items (fewer only if the topic genuinely cannot support 10) as collapsed expandable `<details>` blocks: question visible, model answer hidden until clicked, so I can self-quiz. Answers must be spoken-ready (3–6 sentences), include lead-level nuance, and name tradeoffs — not textbook definitions.
- The final "Big Q&A" section: 15–25 questions, scaled to the topic's breadth, grouped under themed dividers covering what the core sections don't — typically architecture & ecosystem decisions, security, performance & debugging, tooling, legacy/migration reality, and judgment/scenario questions ("how would you…", "what do you flag in code review", "how do you introduce X to a skeptical team"). Adapt the themes to what the topic actually demands.
- Close with a "Night-before cheat sheet": ~10 confident, speakable sentences summarizing the modern state of the topic.

## Quality bar

- Modern-first, legacy-aware: teach the currently recommended approach, but explicitly name the older pattern I will meet in existing codebases — interviews reward navigating both.
- Be precise about versions: label features with the version where they became stable, default, or deprecated. Never present a deprecated pattern as current.
- Depth over breadth within each section. Prefer the questions interviewers actually ask over trivia.
- Teach for transfer: explanations should let me derive answers to questions I never rehearsed, not recite memorized ones. Connect sections to each other where concepts genuinely relate.
- Link the relevant official documentation page per section so I can go deeper after studying.
- Design: light, developer-oriented, visually grounded in the topic's own brand identity (its real logo colors / visual world — not a generic template), readable typography, responsive down to mobile, focus-visible states for keyboard use.
- Before delivering, programmatically validate the HTML (balanced tags, count the Q&A blocks per section) and report the totals. Then give me the file as a download, named after the topic (e.g. `signalr-study-guide.html`).
