{{slot:goal}}
I'm preparing for a technical interview on the topic above, and I have two equally important goals: genuinely UNDERSTAND the topic (mental models I can reason from, not memorized answers) AND pass the interview itself. Neither is secondary — teach me deeply, and drill me on exactly what interviewers ask.

{{slot:design}}
## Design the curriculum

Identify the core building blocks of the topic and order them as a learning sequence where each section builds on the previous ones. A focused library might genuinely have 6–8 sections, a full framework or platform 10–14; the right granularity is "one coherent interview theme per section". Then add one extra final section, "The big Q&A", for everything important that isn't a core building block.

{{slot:content}}
## The study guide

- Hero summary: a 3–5 sentence "state of the technology".
- The units are the numbered curriculum sections.
- Interview Q&A items are collapsed `<details>` self-quiz blocks: the question visible, the model answer hidden until clicked.
- Self-quiz blocks are `<details>`: a 1px `--border` box, a bold summary, and the marker in `--accent`. Answers are spoken-ready (3–6 sentences), carry lead-level nuance and name the trade-offs — not textbook definitions.
- Each core section must contain, in this order:
  1. An in-depth prose explanation (not bullet spam): how it works, what problem it solves, why it was designed this way, and what changed recently. Build a mental model I can reason from — when a concept is abstract, anchor it with a concrete running example or analogy.
  2. Realistic code examples with syntax highlighting, and comparison tables where they genuinely clarify.
  3. At least one "Interview trap" / "Gotcha" callout — the mistake candidates actually make on this topic.
  4. A short "Try it" block: 1–2 small hands-on exercises I can actually do to internalize the section (e.g. "build X", "break Y on purpose and observe Z"), each with the expected outcome or a solution sketch hidden in a collapsed block.
  5. 10 interview Q&A items (fewer only if the topic genuinely cannot support 10).
- The final "The big Q&A" section: 15–25 questions, scaled to the topic's breadth, grouped under themed dividers covering what the core sections don't — typically architecture & ecosystem decisions, security, performance & debugging, tooling, legacy/migration reality, and judgment/scenario questions ("how would you…", "what do you flag in code review", "how do you introduce X to a skeptical team"). Adapt the themes to what the topic actually demands.
- Close with a "Night-before cheat sheet": ~10 confident, speakable sentences summarizing the modern state of the topic.
- Depth over breadth within each section; prefer the questions interviewers actually ask over trivia.
- Teach for transfer: explanations should let me derive answers to questions I never rehearsed, not recite memorized ones. Connect sections where the same concept genuinely recurs.
