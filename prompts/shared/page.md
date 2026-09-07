## The page

One self-contained `.html` file that starts with `<!doctype html>` and ends with `</html>`. The only external resources allowed are highlight.js (its script and one theme stylesheet) from https://cdnjs.cloudflare.com and the two Google Fonts named below; all other CSS and JS is inline.

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

### Design system

Every devbok page shares one design, so the pages of a topic read as siblings of each other and of the devbok index page they are shown in. Only the accent is the topic's own. Do not invent a palette or a layout — implement this one:

- **Colours** — define exactly these custom properties on `:root` and use them for everything except syntax highlighting:

      :root { color-scheme: light;
        --bg: #ffffff; --fg: #111111; --muted: #6b6b6b; --line: #111111; --soft: #f4f4f4; --border: #cccccc;
        --accent: {{ACCENT}}; --accent-soft: color-mix(in srgb, var(--accent) 12%, var(--bg)); }
      @media (prefers-color-scheme: dark) { :root { color-scheme: dark;
        --bg: #222222; --fg: #cccccc; --muted: #8f8f8f; --line: #111111; --soft: #2c2c2c; --border: #4a4a4a;
        --accent: {{ACCENT_DARK}}; --accent-soft: color-mix(in srgb, var(--accent) 16%, var(--bg)); } }

  The accent is the topic's brand colour, chosen once per topic and identical on all of its pages. Use it for the active sidebar item, links, chip and callout borders, the progress bar and small markers — never for body text or large fills; `--accent-soft` is its only background use (the active sidebar item, a highlighted table row). Page and sidebar backgrounds are plain `--bg`, cards and code blocks `--soft`: no tinted surfaces. No theme toggle: the system setting decides.
- **Typography** — prose in `Inter` (Google Fonts; fallback `system-ui, sans-serif`), 16px, line-height 1.6, headings weight 700 in the same family; code, chips, the sidebar and all metadata in `"Cascadia Mono"` (Google Fonts; fallback `Consolas, monospace`), 13px. No other families.
- **Layout** — a fixed left sidebar 260px wide, full height, `--bg` background with a 2px `--line` right border, the units listed in the mono font with the active one in `--accent`; a content column with 24px padding and a max-width of 80ch (unless the kind-specific section says otherwise), hero first. Below 720px the sidebar becomes a toggle.
- **Components** — chips: mono, uppercase, `--soft` background, 1px `--border`, 4px radius. Callouts (gotchas, "what the interviewer is really probing"): `--soft` background with a 3px `--accent` left border. `<details>` self-quiz blocks: 1px `--border` box, bold summary, marker in `--accent`. Tables: 1px `--border` row lines, header text in `--muted`. Progress bar: `--soft` track, `--accent` fill. Native checkboxes.
- **No horizontal scrolling, ever** — the document must never be wider than its viewport, at any width from 360px up. Block code scrolls inside its own `<pre>` (`overflow-x: auto`); every table sits in a wrapper with `overflow-x: auto`; inline `<code>` in running text wraps (`overflow-wrap: anywhere`, and never `white-space: nowrap`); every grid or flex item that can hold code or a table has `min-width: 0`; never use `100vw`.
- Responsive down to mobile, focus-visible outlines in `--accent`. The page is displayed inside an iframe by the devbok index and also opened on its own: no top-level navigation, no assumptions about window size.
