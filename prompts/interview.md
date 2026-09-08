{{slot:goal}}
I'm preparing for technical interviews and want to master the topic above completely — every question an interviewer could ask about it, up to the depth expected at the top of the IC ladder. Build me a complete question bank, not a question list: first the full topic map, then every question worth preparing, each with its answer, a concrete example, the follow-ups an interviewer would probe with, and the common wrong answer that gets candidates rejected — plus the open-ended judgment questions and the design exercises this topic leads to.

{{slot:design}}
## Design the topic map

Map every sub-area of the topic that can be tested in interviews, from fundamentals and syntax through internals, performance, debugging, security, and architecture-level judgment. Derive the structure from the topic itself. For each sub-area decide how often it is asked (often / sometimes / rarely) and whether it is interview-critical or merely nice to know, and order the sub-areas most-frequently-asked first — that is the order I'll work through them. Size each sub-area's question set to how heavily it is probed (typically 6–12 questions for the most-asked, 3–5 for the rarely probed), and make sure the bank as a whole covers the entire depth range: from the universal screeners everyone gets to the questions only the most senior candidates see. Completeness lives in the map, not in an endless list: the whole bank should land around 80–150 fully worked questions. If the topic genuinely wants more than that, it is too broad for one bank — say so in the hero and name the narrower sub-topics that deserve a bank of their own. Then add two final sections: "Judgment calls" for the open-ended questions with no single right answer, and "Design exercises" where the topic connects to system design (schema design for a database, API architecture for a framework, and so on) — if it genuinely doesn't, drop that section and say so in the hero.

{{slot:content}}
## The question bank

- Hero summary: 3–5 sentences on what interviews for this topic actually test and how to use the bank (work down the map in frequency order). Chips: sub-area count, question count, depth range, number of design exercises.
- Immediately below the hero: the topic map as a table, one row per sub-area, linking to its section. Columns: **#**, **Sub-area**, **Asked** (often / sometimes / rarely), **Critical** (yes / nice to know), **Questions**.
- The units are the numbered sub-areas, in the map's order.
- Self-quiz blocks are `<details>`: a 1px `--border` box, a bold summary, and the marker in `--accent`.
- Each sub-area section must contain, in this order:
  1. A 2–4 sentence orientation: what this sub-area is, why interviewers test it, and what depth is expected at which level.
  2. Its questions, most frequently asked first, each a collapsed `<details>` self-quiz block: the question visible with a small depth chip (screener / mid / senior / principal); hidden until clicked: the spoken-ready answer (3–6 sentences), a concrete example (code, config, query, or scenario — whatever fits), the 2–4 follow-up questions an interviewer would probe with (with a one-line answer each), and the common WRONG answer that gets candidates rejected, clearly labelled.
- The "Judgment calls" section: 8–12 open-ended design/judgment questions within this topic, each a collapsed block whose hidden part says what a strong answer demonstrates at the highest level and which trade-offs it names unprompted.
- The "Design exercises" section: 2–4 full exercises where the topic connects to system design, each with the prompt, the clarifying questions I should ask, and — in a collapsed block so I can attempt it first — a strong solution outline and the trade-offs I'm expected to name unprompted.
- Close with a "Night-before cheat sheet": the 10 most-asked questions of the whole bank with a one-sentence answer each.
- Frequency and criticality must reflect real interview practice for this topic, not textbook order or the author's taste.
- The "wrong answer" must be the mistake candidates actually make — the plausible one, never a strawman.
- Answers explain the why, so I can handle a rephrased question, not just the memorized one; prefer the questions interviewers actually ask over trivia.
