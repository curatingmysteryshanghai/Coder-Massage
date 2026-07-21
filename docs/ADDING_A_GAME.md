# Adding a game to Coder Massage

Every game begins as a concept and earns its way into the installable collection. Creating a folder is not enough to make a game available.

## 1. Choose a status

- `concept` — written idea or visual study
- `experimental` — locally runnable team prototype
- `available` — released and safe for the collection Portal
- `retired` — no longer selected or installed

Concepts and experiments stay outside public marketplace catalogs. Only `available` games may enter the released runtime.

## 2. Choose one primary category

The working taxonomy is maintained in [games/README.md](../games/README.md):

- `tactile` — repeated clicking, tapping, pressing, placing, or dragging
- `ambient` — watching, listening, or lightly changing a scene
- `rhythmic` — repeating a simple action with loose timing
- `spatial` — wandering, arranging, tracing, or moving through a small space

Categories describe the dominant waiting-time ritual. Interaction tags can capture secondary behaviors.

## 3. Add catalog metadata

Add an entry to `games/catalog.json` with:

- stable lowercase `id`
- localized display names
- primary category and interaction tags
- status and release stage
- repository path
- installation eligibility and plugin mapping
- bundled-package and marketplace-entry flags
- Portal eligibility and future selection weight

An unreleased game must set `distribution.bundled`, `distribution.installable`, `distribution.marketplace`, and `portal.eligible` to `false`.

For a future released module inside the shared runtime, the usual combination is `bundled: true`, `installable: true`, `marketplace: false`, and `portal.eligible: true`. Needlewhile remains the separate marketplace entry and lifecycle owner.

## 4. Respect the single-runtime rule

Future games are modules of one Coder Massage runtime. A game module must not define its own:

- `UserPromptSubmit`, `PostToolUse`, or `Stop` hooks
- marketplace plugin entry
- installer
- MCP server or Portal tool
- task lease, controller, or access token

The collection owns those responsibilities once. This prevents duplicate Portals and keeps all games on the same AI task clock.

## 5. Meet the release bar

Before changing a game to `available`, verify:

- immediate, low-attention interaction with no required tutorial
- user-controlled entry, exit, sound, and, once the multi-game switcher exists, switching
- keyboard, pointer, responsive, reduced-motion, and basic screen-reader behavior
- no score pressure, streaks, ads, accounts, analytics, or prompt persistence
- deterministic behavior when it is the only eligible game
- correct completion behavior when the AI task ends
- self-contained assets and no unexpected remote network requests
- automated validation and browser QA evidence
- inclusion in integrity manifests and release notes

## 6. Promote deliberately

Promotion to `available` requires all of these in one reviewed change:

1. runtime module bundled inside the single installed collection package;
2. catalog entry marked available;
3. collection validator updated or already compatible;
4. Portal selection tests, plus switch tests once at least two games are eligible;
5. installer/cache snapshot verification;
6. owner-reviewed Hook changes if command hashes changed;
7. multilingual catalog and README updates.

Until this checklist passes, the default install set remains exactly `needlewhile`.
