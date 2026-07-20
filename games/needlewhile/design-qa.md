# Needlewhile Ver.0.2 · Design and Interaction QA

Result: passed for the local game surface

## Evidence

- Ver.0.2 generated concept: `design/concept-ver-0.2.png`
- Desktop Portal: `design/preview-portal-ver-0.2.png`
- Desktop game, 36 needles: `design/preview-game-ver-0.2.png`
- Desktop ending: `design/preview-ending-ver-0.2.png`
- Mobile Portal: `design/preview-mobile-portal-ver-0.2.png`
- Mobile game, 14 needles: `design/preview-mobile-game-ver-0.2.png`
- README preview: `design/preview.png` (same verified desktop game state)
- Render method: Codex in-app Browser against the real loopback lifecycle server
- Desktop QA viewport: 1440 × 900
- Mobile QA viewport: 390 × 844
- Final visual inspection: original-resolution `view_image` review of the generated concept and latest browser screenshots

## Concept-to-build comparison

1. **Opt-in entry:** the generated concept's central pixel vortex became a real animated Portal. It is the only active entry target before the game; task hooks do not open a browser.
2. **Layout:** task information stays in the upper-left, the version remains upper-right/low-left on mobile, the yarn remains dominant and centered, and utility controls stay in the lower-left.
3. **Task detail:** the implementation expands the concept with a concrete sanitized task label, client-aware status, elapsed time, tool-step count, and local pin count. A two-line cap preserves detail without covering the game.
4. **Yarn refinement:** the transparent illustrated yarn asset is retained for clean edges. A masked two-direction fine-fiber layer adds subtle strand texture; it follows palette filters and avoids a baked checkerboard or opaque rectangle.
5. **Needle depth and distribution:** sampling reaches the center/front face and the outer rim. Separate foreground/background layers create depth; the desktop evidence contains both layers and multiple near-center targets.
6. **Palette variation:** the background and yarn filter change as a paired palette. Browser QA changed teal/yellow to mint/purple and confirmed both computed background color and yarn filter changed.
7. **Ending:** the completed state dims and contracts the yarn/pin field, shows a pixel vortex, reports the task as complete, runs the countdown, and attempts a tab close. A normal-tab fallback explains how to close when the browser refuses script-driven closing.
8. **Typography:** the original monospaced, sparse, flat-print direction remains. Controls use square borders and step timing rather than rounded app-card styling.

## Functional checks

- Portal button resolved uniquely and changed the page from `data-entry="portal"` to the focused game state.
- `Escape` kept the pin count at `000`; Space, left-click, and right-click advanced it to `003`.
- Dense placement reached 41 local pins: 23 front-zone, 18 rim-zone, 6 background-layer, 35 foreground-layer, and 6 within a normalized 0.16 center radius. Minimum observed normalized distance was about 0.047.
- The palette button changed the body from `rgb(242, 207, 98)` to `rgb(191, 224, 201)` and applied a yarn hue/filter transform.
- A lifecycle `stop` changed the interface to `Codex 已完成`, exposed the completion panel, ran the countdown to `00`, and showed the normal-tab close fallback after `window.close()` was rejected.
- A new lifecycle `start` cleanly cancelled the previous ending and restored an active mobile Portal.
- A real Playwright active→active replacement cleared `003` old pins to `000`, switched the task title, and kept `Escape` at `000` with no console errors.
- No browser console warnings or errors were recorded.

## Responsive and accessibility checks

- No document overflow at 1440 × 900 or 390 × 844.
- The game container remained visually fixed at scroll position 0 even when long needles expanded its internal scroll extent; `overflow: clip` prevents keyboard focus from shifting the corner UI.
- The mobile Portal button fits within 335 × 295 px, task status spans the safe 22–368 px range, controls stay above the lower edge, and the hint remains inside the right edge.
- Every interactive control has a unique accessible name and visible keyboard focus treatment.
- The task and completion regions use live announcements; decorative Portal/fiber layers are hidden from accessibility APIs.
- `prefers-reduced-motion` collapses sustained animations and transitions.

## Resolved findings during QA

- **P1 · hidden scroll-container drift:** dense long needles increased the game surface's internal scroll size. Keyboard focus shifted the top status area off-screen despite `overflow: hidden`. Switched the page and game surface to `overflow: clip`; repeated desktop/mobile input kept both scroll offsets at zero.
- **P1 · browser takeover:** removed Chrome/Edge selection, isolated browser profile creation, app mode, maximize, and full-screen flags. Start hooks are now state-only; explicit `open` uses the OS default browser.
- **P1 · delayed ending race:** an older turn's late stop could remove its replacement. Protocol 2 treats explicit stale run IDs as no-ops and namespaces leases by client/session/run.
- **P1 · mixed concurrent status:** title, timer, tool count, and client now come from one focused run. The global round revision advances only on a new start, so concurrent heartbeats can change focus without repeatedly clearing the yarn.
- **P2 · center dead zone:** the old radius excluded the ball's front center. Ver.0.2 uses a dedicated front-face distribution and independent approach angles.
- **P2 · task-title truncation:** the first pass used a single 390 px line. It now uses up to 520 px and a two-line clamp on desktop while preserving the mobile layout.

## Remaining host-specific deviations

- The Codex inline MCP Apps Portal is packaged separately from the game surface and still needs a post-install desktop-host render smoke test.
- Claude Code intentionally uses an explicit external browser link because it has no documented arbitrary-HTML chat widget surface.
- WorkBuddy's right-side local Web preview and a Coze custom Chat SDK host are documented adapter paths; neither client runtime is installed on this Mac for end-to-end UI testing.
- Normal browsers may reject `window.close()` for a user-opened tab. The countdown and ending remain visible and switch to a clear manual-close message.
