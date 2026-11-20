# UI Design Notes

Why the UI looks the way it does, and what is left. Short on purpose.

## Direction

A modern, cool, slightly playful workspace for teachers: true graphite in dark mode, crisp cool-grey in light mode, one vivid accent, a gradient hero on the Evaluation and Review gate screens, and small touches of motion that reward interaction.

This is the third pass. The first was a navy and purple-gradient look that read as generic. The second went calm and neutral and felt flat. The navy-tinted dark mode in between looked off, so dark mode is now neutral graphite and all the colour comes from the accent.

What stayed from the cleanup: no emoji icons, no invented claims, no pill badges on everything, sentence-case labels, real keyboard and screen-reader support.

## Palettes

Three palettes, chosen with the swatches in the header. The choice is saved. Aurora is the default.

| Palette | Accent | Partner (hero gradient) | Feel |
|---|---|---|---|
| Aurora | Teal-cyan | Blue | Cool, clean, modern |
| Ember | Orange | Magenta | Warm sunset, saffron-leaning |
| Iris | Indigo | Violet | The original look, retuned |

Each palette is a set of CSS variables in `src/styles.css` (`--accent-50..950` and `--partner-50..950`). Tailwind's `indigo` scale points at the accent and `violet`/`purple` at the partner, so every existing class follows the active palette. Adding a fourth palette means adding one `html[data-palette='...']` block, one entry in `PALETTES` (`theme.service.ts`) and one swatch.

Each palette is built so step 600 passes AA with white text, step 700 passes as text on light surfaces, step 300 passes as text on the dark surface, and step 400 takes dark text on dark mode buttons.

## Light and dark mode

A moon/sun toggle sits in the header. `ThemeService` (`src/app/core/services/theme.service.ts`) sets `<html data-theme>` and `<html data-palette>` and saves both in `localStorage` (`ai-kaksha-theme`, `ai-kaksha-palette`). A small inline script in `src/index.html` applies the saved choices, or the OS setting for the theme if nothing is saved, before first paint, so there is no flash. A saved choice always beats the OS setting. Tailwind's `dark:` variant is bound to the attribute (`@custom-variant dark`), so every existing `dark:` class follows the toggle.

## Motion

All of it is CSS, in `src/styles.css`, and all of it switches off under `prefers-reduced-motion`.

- Screens fade and rise in on navigation; strips and question lists stagger in.
- Cards (`.lift`) rise 2 px and pick up the accent on hover.
- The hero gradient drifts slowly (`.hero-surface`).
- Buttons lift on hover and press down on click.
- `.wave-live` (breathing bars) is available for any live-audio display; the current Voice copilot has no waveform, so it is unused for now.

## Tokens

| Token | Value | Why |
|---|---|---|
| Heading font | Newsreader (serif, semibold) | Typographic contrast against the interface font |
| UI font | Hanken Grotesk | Clear at small sizes, not Inter |
| Code font | IBM Plex Mono | Tool names, hashes, windows |
| `slate` scale | Cool graphite, `#f7f8fa` to `#0a0c12` | Remapped, so every `slate-*` class follows it in both modes |
| Figure rules | accent, partner, sky, orange | A thin colour rule on top of each key figure |
| Green / amber / rose | Tailwind defaults | Only for meaning: correct, caution, error |

Because the templates use `slate` and `indigo` almost everywhere, redefining those scales restyles every screen, including the evaluation screens, without editing them.

## What changed (and stayed)

- **Shell**: gradient logo tile, underline tabs, soft brand tint at the top of every page, palette swatches, theme toggle. Navigation now also works on a phone (it scrolls sideways). It was hidden below 768 px before.
- **Shared components**: `app-button` has vivid primary, quiet danger, and two variants for the gradient hero (`light`, `outline-light`). The `icon` input is kept so old callers compile but draws nothing. `app-status-badge` no longer pulses or shouts in caps. `app-stat-card` gets a colour rule and the hover lift.
- **Exam studio and Review gate (exam-publish mock-up)**: the four identical stat cards became one ruled, colour-topped strip (or were removed where they repeated the header). Q-number tiles, difficulty chips, a solid chat bubble.
- **Voice copilot**: now Paritosh's chat-style Gemini Live interface (sidebar, thread, composer, suggestions). It already follows the palette, fonts, theme and navigation through the shared tokens, so it was left as designed. Only the decorative emoji were replaced: the suggestion icons became a small accent arrow with a hover nudge, and the success check became an inline icon. The earlier hero-panel version of this page no longer exists.
- **Evaluation and Review gate** (merged to `main` after the first passes): the same hero header, a colour-ruled stats strip with meaningful colours (green approved, amber needs-review), an upload icon instead of an emoji, one corner radius throughout, and the card hover lift. Logic, stores and tests are untouched.
- **Evaluation setup layout**: the old right column held only an empty "Agent activity" card. It is now a three-step tracker (scheme, answer sheets, grade and review) across the top, then two balanced columns: marking scheme on the left, the answer-sheet upload on the right (sticky, so it stays in view while a long scheme is reviewed) with the AI-learning note under it. Saved marksheets run full width below, and the activity log appears only once it has entries. Step 2 shows as locked until a scheme is approved.
- **Copy**: invented claims were removed ("Tamper Proof", "Gemini Verified", "Zero Latency Loop", "Cosine Sim < 0.85"). Only on-screen text changed, nothing renamed in code.
- **Accessibility**: labelled close, theme and palette controls, `role="dialog"` on the publish modal, options are real radio buttons (keyboard works), visible focus ring, `prefers-reduced-motion` respected, 44 px nav targets.

## How it was checked

- `ng build` has no errors (one warning from the `@google/genai` package's own `p-retry` dependency, not from our code). `ng test` 95/95 (9 are new, for the theme service, theme toggle and palette picker; the rest are the existing suites, all passing). Backend `npm test` 17/17.
- axe-core (WCAG 2.0/2.1/2.2 A and AA plus best-practice): **0 violations in 30 runs**: 3 palettes x 2 modes x (4 pages + the open publish dialog). Run against the pages' first-load states.
- In a real browser: palette swap changes the accent, the choice survives a reload, arrow keys move between swatches, cards lift on hover, the hero gradient drifts, and under reduced motion the animations and transitions are off.
- Theme toggle: click flips the page and the browser colour, survives navigation and reload, a saved choice beats the OS, and with nothing saved it follows the OS.

## Kept on purpose

- **✓ ✗ ◐ ⚠ in the evaluation screens.** These are text symbols, not decoration: the tick and cross on a marked paper, drawn into the downloadable PDF and described to the AI in the grading prompt, and they let verdicts read without relying on colour alone (a stated requirement in the plan). They are not emoji and were not removed.
- **`/review-gate` now shows the evaluation Review Gate** (answers the AI was under 90% sure about), per `app.routes.ts`. The earlier exam-publish mock-up in `features/exam-studio/review-gate.component.ts` is unrouted and was restyled in the first pass, so it matches if it is ever wired back in.

## Not verified

The populated states of the evaluation screens (graded sheets, the results table, flagged-answer cards, the marked-paper viewer) need real graded data and a Firebase project, so they were checked only through their unit tests and the stylesheet tokens, not visually. Look at them once with real data.

## Things to know

- **Fonts load from Google Fonts** (`src/index.html`). With no internet, the browser falls back to Georgia and the system sans, so layout still works but looks plainer. For a demo on unreliable Wi-Fi, load the page once beforehand, or self-host the fonts.
- **No sideways page scroll.** Message text (`p`, `li`, `dd`, headings, labels, and the text inside alert/status banners) wraps even a single very long word, such as an id or an error code, and the app shell clips horizontal overflow. Wide components such as the results table and the PDF viewer keep their own scrolling. Without this, a long unbroken word in an error banner stretched the whole page.
- **Small buttons are 36 px tall** (above the WCAG 2.2 AA minimum of 24 px), a trade-off for a dense desktop tool. Nav links, the logo and the header controls are 44 px.
- **To undo**: `src/styles.css`, `src/index.html`, `src/app/app.html`, the shared components and `ThemeService` carry the visual system. The rest are screen templates.
