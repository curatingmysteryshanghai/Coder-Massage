# Needlewhile v0.3.0 · Design QA

Result: passed

## Evidence

- Accepted concept: `design/concept.png`
- Implemented state: `design/preview.png`
- Side-by-side comparison: generated and inspected during the final QA pass; the accepted concept and final implementation remain in `design/`
- Desktop viewport: 1586 × 992, active task, 48 needles
- Mobile viewport: 390 × 844, active task, 8 needles
- Render method: Codex in-app Browser with the project’s local lifecycle server
- Visual inspection: original-resolution `view_image` review of the concept, implementation, and combined comparison

## Comparison

1. Layout: the toy remains full-bleed with the yarn ball centered and corner UI anchored to the same four visual zones as the concept.
2. Palette: the implementation keeps a solid warm butter-yellow field, teal/cream yarn, black outlines, and coral/cream/mustard pin heads. The source’s subtle vignette was intentionally omitted to honor the requested pure-color background.
3. Yarn asset: the implemented raster asset preserves the concept’s wound-yarn construction, crop, transparent edge, and hand-inked line quality. There is no loose yarn end or cast shadow.
4. Needles: the implementation uses generated raster sprites with long, slender shafts. New needles remain long; older needles progressively sink into the ball so repeated input stays readable and satisfying.
5. Typography and icons: monospaced uppercase status copy, three-digit count, lower-corner hints, and the speaker control match the concept’s sparse interface and remain legible on desktop and mobile.

## Functional checks

- Keyboard input adds one needle and updates the count.
- Left click and right click add needles; the browser context menu is suppressed inside the toy.
- The sound control toggles `SOUND ON` / `SOUND OFF` and exposes an accessible pressed state.
- The procedural audio path contains a fine tip transient, wool-compression noise, and a short dry rustle tail; rapid cadence is attenuated to avoid harsh stacking.
- When lifecycle state becomes complete, the interface changes to `AI IS DONE`, audio is stopped, and further inputs no longer add needles.
- A replacement turn in the same Claude session removes a stale interrupted-turn lease.
- Chrome and Edge app launches request maximized full-screen mode.

## Responsive and accessibility checks

- No horizontal or vertical document overflow at 1586 × 992 or 390 × 844.
- Dynamic needle lengths are clamped to available viewport space.
- The sound button has an accessible name, keyboard focus treatment, and a practical mobile target.
- Decorative images have empty alt text; the game surface has an application label and a live needle-count announcement.
- Reduced-motion preference disables sustained floating and insertion animation.
- No browser console errors or warnings were observed in the tested path.

## Resolved findings

- P2 · Focus border: the game surface previously drew an unintended inset black frame after programmatic focus. Removed the surface focus outline while retaining a visible focus treatment on the actual sound button.
- P2 · Needle clipping: long needles previously crossed the viewport edge at dense states. Length is now calculated against the available ray-to-edge distance with a safety margin.
- P2 · Interrupted Claude turn: a skipped ending hook could leave the page active. A new run for the same session now supersedes its stale lease.
