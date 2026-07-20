# Needlewhile Ver.0.2 · Design and Interaction QA

Result: passed for the local game surface

## Evidence

- Ver.0.2 generated concept: `design/concept-ver-0.2.png`
- Desktop Portal: `design/preview-portal-ver-0.2.png`
- Desktop game, 42 needles: `design/preview-game-ver-0.2.png`
- Desktop ending: `design/preview-ending-ver-0.2.png`
- Mobile Portal: `design/preview-mobile-portal-ver-0.2.png`
- Mobile game, 30 needles: `design/preview-mobile-game-ver-0.2.png`
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
5. **Needle depth and distribution:** sampling reaches the center/front face and the outer rim. Front-facing needles use a spherical projection: center needles shorten and recede, outer needles lengthen, contact marks clarify the landing point, and foreground/background occlusion preserves depth.
6. **Palette variation:** the background and yarn filter change as a paired palette. Pointer activation returns focus to the toy so keyboard play continues; keyboard activation preserves focus on the button.
7. **Ending:** the completed state dims and contracts the yarn/pin field, shows a pixel vortex, reports the task as complete, runs the countdown, and attempts a tab close. A normal-tab fallback explains how to close when the browser refuses script-driven closing.
8. **Typography:** the original monospaced, sparse, flat-print direction remains. Controls use square borders and step timing rather than rounded app-card styling.

## Functional checks

- Portal button resolved uniquely and changed the page from `data-entry="portal"` to the focused game state.
- `Escape` kept the pin count at `000`; Space advanced it to `001`, pointer activation of Palette returned focus to the toy, and ArrowRight advanced it to `002`.
- The desktop evidence contains 42 local pins: 17 front-zone, 25 rim-zone, 5 near-head-on approaches, and 42 visible contact marks. The mobile evidence contains 30 pins, including 2 near-head-on approaches and 30 contact marks.
- Pointer activation changed the palette to peach and returned focus to the toy. Keyboard activation with Enter kept focus on `palette-toggle`.
- A lifecycle `stop` changed the interface to `Task complete`, exposed the completion panel, ran the countdown, and kept the elapsed clock frozen at `completedAt`.
- A new lifecycle `start` cleanly cancelled the previous ending and restored an active mobile Portal.
- The same controller state and `startedAt` were observed before Portal entry, in the full game, and after completion; elapsed time already accrued before the click and continued without reset.
- All static game copy, control labels, status text, fallback copy, document language, and ARIA names are English.
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
- **P1 · browser takeover:** removed Chrome/Edge selection, isolated browser profile creation, app mode, maximize, and full-screen flags. The Codex start hook may request a small inline launcher; only a user click or explicit `open` asks the OS default browser to open the game.
- **P1 · delayed ending race:** an older turn's late stop could remove its replacement. Protocol 2 treats explicit stale run IDs as no-ops and namespaces leases by client/session/run.
- **P1 · mixed concurrent status:** title, timer, tool count, and client now come from one focused run. The global round revision advances only on a new start, so concurrent heartbeats can change focus without repeatedly clearing the yarn.
- **P2 · center dead zone:** the old radius excluded the ball's front center. Ver.0.2 uses a dedicated front-face distribution and independent approach angles.
- **P2 · task-title truncation:** the first pass used a single 390 px line. It now uses up to 520 px and a two-line clamp on desktop while preserving the mobile layout.
- **P2 · finite Portal loop:** the supplied GIF's Netscape loop count was `5`, which produced six passes. It is now `0`, the GIF convention for infinite looping.
- **P2 · palette focus loss:** pointer activation left focus on the Palette button, so the next Space press re-triggered the control instead of adding a needle. Pointer activation now restores toy focus while keyboard activation keeps normal button semantics.
- **P2 · head-on needle perspective:** front-center needles previously read as equal-length flat overlays. Spherical projection, distance-based length, contact compression, and stronger center occlusion now make the approach angle visually coherent.

## Remaining host-specific deviations

- The Codex inline MCP Apps Portal is packaged separately from the game surface and still needs a post-install desktop-host render smoke test.
- Claude Code intentionally uses an explicit external browser link because it has no documented arbitrary-HTML chat widget surface.
- WorkBuddy's right-side local Web preview and a Coze custom Chat SDK host are documented adapter paths; neither client runtime is installed on this Mac for end-to-end UI testing.
- Normal browsers may reject `window.close()` for a user-opened tab. The countdown and ending remain visible and switch to a clear manual-close message.

## Inline MCP Portal mini redesign · runtime 0.4.6

### Source and evidence

- Approved source: the user-supplied eight-frame `return-portal-entrance.gif`.
- Production asset: `adapters/openai-app/assets/portal-icon.gif` (32 × 42 native animation, eight 80ms frames, infinite Netscape loop, embedded as a transparent data URI and displayed proportionally at 34px high).
- Earlier exact resource capture: `design/preview-inline-portal-0.4.2.png`; runtime 0.4.6 keeps the recolored supplied animation looping and routes its click through the app-only local launch tool.
- Earlier source-versus-browser comparison: `design/inline-portal-reference-comparison-0.4.2.jpg`.
- Render path: the MCP adapter's real `resources/read` HTML, including its embedded GIF data URI, served locally and inspected with the Codex in-app Browser.
- QA surface: a temporary 200 × 120 preview viewport; measured component dimensions are fixed independently at 44 × 44.

### Visual comparison and required states

- The implementation keeps the supplied GIF's exact silhouette, eight-frame motion, transparency, and pixel construction while changing only its palette.
- The component contains no visible text, card, title, description, background fill, or persistent border.
- Ready state: one 44 × 44 transparent link with the proportionally scaled 34px-high GIF; the link receives the loopback URL from tool-result metadata.
- Waiting state: the same geometry remains stable, `aria-disabled="true"` is exposed, and the supplied GIF animation continues without a gray filter, loading copy, or layout shift.
- Hover/active/focus rules remain bounded to the 44 × 44 target. Reduced-motion preference swaps the GIF for its recolored static first frame; keyboard focus stays visible without adding a resting border.

### Functional and accessibility checks

- The ready DOM exposes exactly one link named `Open the Needlewhile time portal`; the decorative image has empty alt text.
- Both the body and interactive surface measure 44 × 44, with transparent backgrounds and zero border width. The image displays proportionally at 34px high and reports `image-rendering: pixelated`.
- The widget emitted `ui/notifications/size-changed` and kept the compatibility intrinsic-height notification.
- The current Codex host is asked to auto-expand the compact widget in its own chronological tool row. Codex exposes no plugin slot inside the host-owned `已处理` divider, so exact horizontal adjacency remains a host feature request.
- The successful MCP result contained no visible content or structured narration; its loopback launch URL remained in widget-only `_meta`.
- No browser console warnings or errors were recorded in waiting or ready states.

### QA history

- Pass 1 preserved the compact borderless behavior but drifted toward a smooth textile illustration; the user rejected that art direction.
- Pass 2 used the approved generated reference directly and restored deliberate pixel art.
- Pass 3 replaces that sprite with the user's supplied eight-frame GIF, recolors only its original palette, and removes extra CSS motion and disabled grayscale treatment.

Final result: passed
