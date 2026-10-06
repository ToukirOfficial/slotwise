# 0006 — The widget is a Web Component with Shadow DOM

## Context
Businesses embed booking on sites we don't control: WordPress themes, Laravel apps, plain HTML. Their CSS
must not break the widget, the widget's CSS must not leak into their page, and it has to load fast on a phone.

## Decision
- A custom element `<slotwise-booking business="…">`, written in vanilla TypeScript, with all markup and styles
  inside a **Shadow DOM**. esbuild bundles it into one IIFE (`/widget/v1.js`, about 5 KB gzipped; the build
  fails above the 30 KB budget).
- It talks only to `/api/v1/public/*` on the server it was loaded from (taken from `document.currentScript`),
  with `credentials: 'omit'`, and holds no secrets.
- All server text is set with `textContent`, never `innerHTML`, so a business name can't inject markup.
- Accessibility (WCAG 2.2 AA): real buttons and labelled inputs, 44 px targets, visible focus outlines, focus
  moved to each step's heading, and `aria-live` regions for errors and the "just taken" message. Button text
  is black or white, whichever has the higher contrast against the brand colour.
- The hosted page `/b/{slug}` uses the same element, so there is one booking UI to maintain.

## Alternatives
- **An iframe.** Isolation is strong, but sizing is awkward on mobile, it's harder to theme, and focus handling
  across frames is poor.
- **A React bundle.** It's 40+ KB before any of our code, and it can clash with a host page that already runs React.

## Consequences
- No runtime dependencies to update in the widget.
- `v1` is in the path, so a breaking change can ship as `v2.js` without breaking existing embeds.
