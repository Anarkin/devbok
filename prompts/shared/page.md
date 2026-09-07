## The page

One self-contained `.html` file that starts with `<!doctype html>` and ends with `</html>`. The only external resources allowed are highlight.js (its script and one theme stylesheet) from https://cdnjs.cloudflare.com and, optionally, Google Fonts; all other CSS and JS is inline.

Put this provenance comment immediately after `<body>`, verbatim:

    <!-- devbok
    slug: {{SLUG}}
    kind: {{KIND}}
    version: {{VERSION}}
    topic: "{{TOPIC}}"
    prompt: {{PROMPT_FILE}}@{{PROMPT_HASH}}
    generated: {{DATE}}
    -->

- **Hero header**: the topic, latest version + release date, a 3–5 sentence summary (the kind-specific section below says what it must cover), and small chips for the headline facts.
- **Fixed sidebar navigation** listing all units (numbered — order matters), with scrollspy highlighting of the current unit. If the page keeps any state (progress, collapsed blocks), persist it in localStorage under keys that start with `devbok:{{SLUG}}:{{KIND}}:v{{VERSION}}:`.
- **Code** with syntax highlighting; **comparison tables** where they genuinely clarify.
- **Design**: developer-oriented, readable typography, visually grounded in the topic's own brand identity (its real logo colours / visual world — not a generic template). Light and dark, following `prefers-color-scheme`, with no toggle. Responsive down to mobile, focus-visible states for keyboard use. The page is displayed inside an iframe by the devbok index and also opened on its own: no top-level navigation, no assumptions about window size.
