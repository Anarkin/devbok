## The page

One self-contained `.html` file that starts with `<!doctype html>` and ends with `</html>`. The only external resources allowed are the highlight.js script from https://cdnjs.cloudflare.com (the script alone — never one of its theme stylesheets, see **Code** below) and one Google Font, Cascadia Mono; all other CSS and JS is inline. The document `<title>` is `{{TITLE}} · {{KIND}} · devbok`.

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
        <p class="meta">…</p>
        <p class="summary">…</p>
        <p class="chips"><span class="chip">…</span> <span class="chip">…</span></p>
      </header>

      .hero { margin: 0 0 24px; padding: 0 0 24px; border-bottom: 2px solid var(--line); }
      .hero h1 { margin: 0 0 8px; font-size: 2em; line-height: 1.2; font-weight: 700; }
      .hero .meta { margin: 0 0 12px; font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; color: var(--muted); }
      .hero .summary { margin: 0 0 12px; }
      .hero .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }

  The `<h1>` is the topic's title exactly as given, `{{TITLE}}` — never with a kind suffix, never the full topic sentence. The meta line reads `{{KIND}} · <latest stable version> · released <date>`. The summary is the 3–5 sentences the kind-specific section asks for; the chips carry the headline facts. Nothing sits above the hero.
- **State** — no progress tracking, no "mark as done" checkboxes. If the page keeps any state at all (which blocks are open, say), persist it in localStorage under keys that start with `devbok:{{SLUG}}:{{KIND}}:v{{VERSION}}:`. The sidebar is specified below, verbatim.
- **Code** — coloured, block and inline; the palette is fixed and specified below. **Comparison tables** where they genuinely clarify.

### Design system

Every devbok page shares one design, so the pages of a topic read as siblings of each other and of the devbok index page they are shown in. Only the accent is the topic's own. Do not invent a palette or a layout — implement this one:

- **Colours** — define exactly these custom properties on `:root` and use them for everything, syntax highlighting included:

      :root { color-scheme: light;
        --bg: #ffffff; --fg: #111111; --muted: #6b6b6b; --line: #111111; --soft: #f4f4f4; --border: #cccccc;
        --accent: {{ACCENT}}; --accent-soft: color-mix(in srgb, var(--accent) 12%, var(--bg));
        --code: color-mix(in srgb, var(--accent) 70%, var(--fg));
        --hl-kw: #a626a4; --hl-str: #50a14f; --hl-num: #986801; --hl-cmt: #6b6b6b; --hl-type: #0184bc; --hl-fn: #4078f2; --hl-attr: #986801; }
      @media (prefers-color-scheme: dark) { :root { color-scheme: dark;
        --bg: #222222; --fg: #cccccc; --muted: #8f8f8f; --line: #111111; --soft: #2c2c2c; --border: #4a4a4a;
        --accent: {{ACCENT_DARK}}; --accent-soft: color-mix(in srgb, var(--accent) 16%, var(--bg));
        --hl-kw: #c678dd; --hl-str: #98c379; --hl-num: #d19a66; --hl-cmt: #8f8f8f; --hl-type: #56b6c2; --hl-fn: #61afef; --hl-attr: #e5c07b; } }

  The accent is the topic's brand colour, chosen once per topic and identical on all of its pages. Use it for the active sidebar item, links, chip and callout borders and small markers — never for body text or large fills; `--accent-soft` is its only background use (the active sidebar item, a highlighted table row), and `--code` (the accent muted into `--fg`) is its only text use, on inline code. Page and sidebar backgrounds are plain `--bg`, cards and code blocks `--soft`: no tinted surfaces. No theme toggle: the system setting decides.
- **Typography** — prose in the system sans-serif, `font-family: system-ui, sans-serif` (no web font), 16px, line-height 1.6; headings in the same family, weight 700: `h1` 2em (the hero only), `h2` 1.5em (every unit heading), `h3` 1.17em. Everything monospace — code blocks, inline code, chips, metadata and the sidebar — in `"Cascadia Mono"` (Google Fonts; fallback `Consolas, monospace`) at 12px, the size the devbok index page uses for its own sidebar: mono at 12px everywhere, no other size. No other families.
- **Code, verbatim** — one palette for the whole knowledge base; do not pick a highlight.js theme and do not invent colours. Block code is highlighted by highlight.js, inline code is not: a fragment in running prose is one word or one expression, so it gets a single colour (`--code`) rather than tokenised confetti. Load the highlight.js script from the CDN and **no theme stylesheet at all** — the `--hl-*` tokens above are the theme, and a `styles/*.css` from cdnjs would only be a second, light-only palette fighting them in dark mode. These rules, verbatim:

      code { background: var(--soft); border: 1px solid var(--border); border-radius: 3px; padding: 0 .3em; color: var(--code); overflow-wrap: anywhere; }
      pre { background: var(--soft); border: 1px solid var(--border); border-radius: 4px; padding: 12px 14px; overflow-x: auto; line-height: 1.5; margin: 14px 0; max-width: 100%; }
      pre code { background: none; border: 0; border-radius: 0; padding: 0; color: inherit; white-space: pre; overflow-wrap: normal; }
      .hljs { color: var(--fg); background: transparent; }
      .hljs-keyword, .hljs-built_in, .hljs-literal, .hljs-selector-tag { color: var(--hl-kw); }
      .hljs-string, .hljs-regexp, .hljs-selector-attr { color: var(--hl-str); }
      .hljs-number, .hljs-symbol { color: var(--hl-num); }
      .hljs-comment, .hljs-quote, .hljs-doctag { color: var(--hl-cmt); font-style: italic; }
      .hljs-title, .hljs-title.class_, .hljs-type, .hljs-name, .hljs-section, .hljs-selector-class, .hljs-selector-pseudo { color: var(--hl-type); }
      .hljs-title.function_ { color: var(--hl-fn); }
      .hljs-meta, .hljs-attr, .hljs-attribute, .hljs-tag, .hljs-property, .hljs-variable { color: var(--hl-attr); }
      .hljs-template-tag, .hljs-template-variable { color: var(--hl-attr); }
      .hljs-code, .hljs-formula { color: var(--hl-cmt); }
      .hljs-operator, .hljs-subst, .hljs-punctuation, .hljs-params { color: var(--fg); }
      .hljs-emphasis { font-style: italic; } .hljs-strong { font-weight: 700; }

  Every block gets an explicit language — `<pre><code class="language-csharp">` — because highlight.js guesses badly on short snippets; run it once with `hljs.highlightAll()` and let it fail silently if the CDN is unreachable, since colour is decoration and the page must read without it. Inline `<code>` is never given a language class and never highlighted.
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
      .units a { display: grid; grid-template-columns: 2.5em 1fr; padding: 9px 20px 9px 17px; border-left: 3px solid transparent; color: var(--fg); text-decoration: none; line-height: 1.4; }
      .units .n { color: var(--muted); font-weight: 400; }
      .units a:hover { background: var(--soft); }
      .units a[aria-current="true"] { background: var(--accent-soft); border-left-color: var(--accent); font-weight: 700; }
      .side footer { padding: 12px 20px; border-top: 2px solid var(--line); color: var(--muted); line-height: 1.5; }

  The entries are the page's units in document order, numbered `01`, `02`, … with two digits, the closing sections included: there are no unnumbered entries and no `0`. Neither the hero nor anything a kind places between it and the first unit is a unit, so none of it appears here. Each unit's own heading carries the same number (`01 First unit title`) and the id its link targets. Scrollspy sets `aria-current="true"` on the link of the unit in view. The unit in view is marked by the tint and the accent bar, never by colouring its label: an accent is a brand colour of any luminance, and as text on a 12% tint of itself many of them are unreadable. This is exactly how the devbok index marks the open topic, so the two sidebars read as one. Nothing else goes in the sidebar.
- **Components** — chips: mono, uppercase, `--soft` background, 1px `--border`, 4px radius. Callouts: `--soft` background with a 3px `--accent` left border. Tables: 1px `--border` row lines, header text in `--muted`. A kind that asks for collapsible blocks says how they look.
- **No horizontal scrolling, ever** — the document must never be wider than its viewport, at any width from 360px up. Block code scrolls inside its own `<pre>` (`overflow-x: auto`); every table sits in a wrapper with `overflow-x: auto`; inline `<code>` in running text wraps (`overflow-wrap: anywhere`, and never `white-space: nowrap`); every grid or flex item that can hold code or a table has `min-width: 0`; never use `100vw`.
- **This is checked** — `node scripts/devbok.mjs validate` reads the file's own path, so it knows the slug, kind and version, and fails the page when the `<title>`, the hero `<h1>`, the hero's `meta` / `summary` / `chips`, `<nav class="side">`, `<ol class="units">`, the two-digit unit numbers, `aria-current`, the code palette (every `--code` / `--hl-*` token declared, and no highlight.js theme stylesheet), a cheat sheet's `@media print`, or the provenance comment do not match what is written above. None of it is a suggestion.
- Responsive down to mobile, focus-visible outlines in `--accent`. The page is displayed inside an iframe by the devbok index and also opened on its own: no top-level navigation, no assumptions about window size.
