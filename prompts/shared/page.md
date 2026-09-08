## The page

One self-contained `.html` file that starts with `<!doctype html>` and ends with `</html>`. The only external resources allowed are highlight.js (its script and one theme stylesheet) from https://cdnjs.cloudflare.com and one Google Font, Cascadia Mono; all other CSS and JS is inline. The document `<title>` is `{{TITLE}} · {{KIND}} · devbok`.

Put this provenance comment immediately after `<body>`, verbatim:

    <!-- devbok
    slug: {{SLUG}}
    kind: {{KIND}}
    version: {{VERSION}}
    topic: "{{TOPIC}}"
    prompt: {{PROMPT_FILE}}@{{PROMPT_HASH}}
    generated: {{DATE}}
    -->

- **Hero, verbatim** — the first thing in the content column, identical in structure on every page; only the facts on the meta line, the summary and the chips differ:

      <header class="hero">
        <h1>{{TITLE}}</h1>
        <p class="meta">{{KIND}} · <latest stable version> · released <date></p>
        <p class="summary">3–5 sentences; the kind-specific section below says what they must cover.</p>
        <p class="chips"><span class="chip">…</span> <span class="chip">…</span></p>
      </header>

      .hero { margin: 0 0 24px; padding: 0 0 24px; border-bottom: 2px solid var(--line); }
      .hero h1 { margin: 0 0 8px; font-size: 2em; line-height: 1.2; font-weight: 700; }
      .hero .meta { margin: 0 0 12px; font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; color: var(--muted); }
      .hero .summary { margin: 0 0 12px; }
      .hero .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }

  The `<h1>` is the topic's title exactly as given, `{{TITLE}}` — never with a kind suffix, never the full topic sentence; the kind is on the meta line. Nothing sits above the hero.
- **Fixed sidebar navigation** listing all units (numbered — order matters), with scrollspy highlighting of the current unit. No progress tracking, no "mark as done" checkboxes. If the page keeps any state at all (which blocks are open, say), persist it in localStorage under keys that start with `devbok:{{SLUG}}:{{KIND}}:v{{VERSION}}:`.
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

  The accent is the topic's brand colour, chosen once per topic and identical on all of its pages. Use it for the active sidebar item, links, chip and callout borders and small markers — never for body text or large fills; `--accent-soft` is its only background use (the active sidebar item, a highlighted table row). Page and sidebar backgrounds are plain `--bg`, cards and code blocks `--soft`: no tinted surfaces. No theme toggle: the system setting decides.
- **Typography** — prose in the system sans-serif, `font-family: system-ui, sans-serif` (no web font), 16px, line-height 1.6; headings in the same family, weight 700: `h1` 2em (the hero only), `h2` 1.5em (every unit heading), `h3` 1.17em. Everything monospace — code blocks, inline code, chips, metadata and the sidebar — in `"Cascadia Mono"` (Google Fonts; fallback `Consolas, monospace`) at 12px, the size the devbok index page uses for its own sidebar: mono at 12px everywhere, no other size. No other families.
- **Layout** — a fixed left sidebar 260px wide (markup and CSS below, verbatim), then a content column with 24px padding and a max-width of 80ch (unless the kind-specific section says otherwise), hero first. Below 720px the sidebar becomes a toggle; add that media query yourself.
- **Sidebar, verbatim** — every devbok page uses exactly this markup and CSS. Only the titles, the hrefs and the footer text differ between pages:

      <nav class="side" aria-label="Units">
        <ol class="units">
          <li><a href="#u01"><span class="n">01</span><span class="t">First unit title</span></a></li>
          <li><a href="#u02"><span class="n">02</span><span class="t">Second unit title</span></a></li>
        </ol>
        <footer>{{TITLE}} · {{KIND}} · version {{VERSION}} · {{DATE}}</footer>
      </nav>

      .side { position: fixed; top: 0; bottom: 0; left: 0; width: 260px; display: flex; flex-direction: column; background: var(--bg); border-right: 2px solid var(--line); font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; }
      .units { list-style: none; margin: 0; padding: 12px 0; overflow-y: auto; flex: 1; }
      .units a { display: grid; grid-template-columns: 2.5em 1fr; padding: 9px 20px; color: var(--fg); text-decoration: none; line-height: 1.4; }
      .units .n { color: var(--muted); }
      .units a:hover { background: var(--soft); }
      .units a[aria-current="true"] { background: var(--accent-soft); color: var(--accent); }
      .units a[aria-current="true"] .n { color: var(--accent); }
      .side footer { padding: 12px 20px; border-top: 2px solid var(--line); color: var(--muted); font-size: 11px; line-height: 1.5; }

  The entries are the page's units in document order, numbered `01`, `02`, … with two digits, the closing sections included: there are no unnumbered entries and no `0`. The hero and everything in it (chips, a coverage or topic-map table) are not units and do not appear. Each unit's own heading carries the same number (`01 First unit title`) and the id its link targets. Scrollspy sets `aria-current="true"` on the link of the unit in view. Nothing else goes in the sidebar.
- **Components** — chips: mono, uppercase, `--soft` background, 1px `--border`, 4px radius. Callouts (gotchas, "what the interviewer is really probing"): `--soft` background with a 3px `--accent` left border. `<details>` self-quiz blocks: 1px `--border` box, bold summary, marker in `--accent`. Tables: 1px `--border` row lines, header text in `--muted`.
- **No horizontal scrolling, ever** — the document must never be wider than its viewport, at any width from 360px up. Block code scrolls inside its own `<pre>` (`overflow-x: auto`); every table sits in a wrapper with `overflow-x: auto`; inline `<code>` in running text wraps (`overflow-wrap: anywhere`, and never `white-space: nowrap`); every grid or flex item that can hold code or a table has `min-width: 0`; never use `100vw`.
- Responsive down to mobile, focus-visible outlines in `--accent`. The page is displayed inside an iframe by the devbok index and also opened on its own: no top-level navigation, no assumptions about window size.
