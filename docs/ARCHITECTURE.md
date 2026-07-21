# Coder Massage repository architecture

This document separates the public product, the stable installation namespace, and the future multi-game runtime.

## Identity boundary

| Layer | Name | Stability |
| --- | --- | --- |
| Product | **Coder Massage / coder马杀鸡** | Public-facing and allowed to evolve |
| Repository and marketplace | `jieya` | Compatibility identifier; keep stable |
| Current game | **Needlewhile / 扎会儿** | Game 01 and the only current install target |
| Current Codex plugin | `needlewhile@jieya` | Installed-user contract; keep stable |

Changing the GitHub repository name, marketplace name, game path, or plugin ID would require an explicit installation migration. Product copy and display metadata can change independently.

## Repository layers

```text
/
├── README*.md                         localized product entry points
├── docs/                              operations and design contracts
│   ├── INSTALLATION.md                canonical install/upgrade runbook
│   ├── ARCHITECTURE.md                this document
│   ├── PORTAL.md                      future routing and switching contract
│   └── ADDING_A_GAME.md               game promotion checklist
├── games/
│   ├── catalog.json                   release status and category registry
│   ├── README.md                      human-readable game catalog
│   └── needlewhile/                   current compatibility shell and Game 01
├── .agents/plugins/marketplace.json   Codex marketplace: Needlewhile only
├── .claude-plugin/marketplace.json    Claude marketplace: Needlewhile only
├── install.sh / install.ps1           stable collection installers
└── scripts/validate.mjs               collection contract validator
```

## Current release model

Needlewhile owns the only lifecycle integration:

```text
UserPromptSubmit → start one local task lease → offer one opt-in Portal
PostToolUse      → heartbeat the same lease
Stop             → complete the same lease and close the experience
```

The repository catalogs expose one plugin sourced from `games/needlewhile`. The root installer therefore installs one item: `needlewhile@jieya`.

This is intentional during user testing. Additional games must not be added as separate hook-owning marketplace plugins. Multiple plugins with their own `UserPromptSubmit` hooks would create duplicate Portals and competing controllers.

## Game catalog model

`games/catalog.json` is the repository source of truth for product status, category, installation eligibility, and planned Portal eligibility. The current installed runtime does not read this file; it is still hardwired to Needlewhile.

When the multi-game router is implemented, release validation must copy or generate a runtime-safe snapshot at the planned in-package path `games/needlewhile/collection/catalog.json`. The installed router may read only that bundled snapshot. The root catalog and bundled snapshot must match before release.

Statuses:

- `concept` — documented idea; never installed or selected
- `experimental` — runnable by the team; excluded from public installation and random routing
- `available` — validated, distributable, and eligible for the released collection
- `retired` — retained for history; excluded from installation and routing

`distribution.bundled` means the module is included in the compatibility package. `distribution.installable` means users receive it through the collection install. `distribution.marketplace` is narrower: the game owns a separate marketplace entry. Only available and installable games may set `marketplace: true`; future bundled games normally keep it false so Needlewhile remains the one lifecycle-owning plugin. The collection validator currently locks the user-visible install set and marketplace owner to `needlewhile`.

## Future multi-game runtime

The collection will continue to have one lifecycle owner, one loopback controller, one task lease, and one Portal. Future released games become content modules inside that runtime. They do not bring their own hooks, installers, MCP servers, or task clocks.

The existing `games/needlewhile` source remains the compatibility shell until a separately tested package-source migration is justified. Future runtime modules will be bundled under `games/needlewhile/collection/games/<game-id>/`, while the repository-level catalog continues to describe every game. This preserves the plugin ID, marketplace source root, and Hook entrypoint; normal upgrade verification and owner Hook review still apply.

When the multi-game router ships:

1. A task starts and creates one run identity.
2. The user chooses to enter the Portal for the first time.
3. The router selects one eligible game and stores that selection for the run.
4. Reopening the Portal returns to the same selection.
5. A user may explicitly switch games inside the browser experience.
6. Switching preserves `startedAt`, task state, completion state, and access token.
7. With one eligible game, selection always resolves to Needlewhile and the switcher stays hidden.

See [PORTAL.md](./PORTAL.md) for the interaction contract.

## Invariants

Every repository change must preserve these rules:

1. **One lifecycle owner.** A task produces at most one Portal and one controller lease.
2. **Opt-in entry.** Hooks may prepare state and request the small inline Portal; they never take over the browser or full screen automatically.
3. **Current install scope.** `sh ./install.sh --codex` installs only `needlewhile@jieya` until a reviewed release changes the collection contract.
4. **Stable task time.** Entering or switching games never resets the AI task clock.
5. **Local privacy.** Loopback-only networking, no global key capture, no prompt persistence, no analytics.
6. **Self-contained releases.** An available game has metadata, assets, validation, accessibility behavior, and a documented lifecycle fit.
7. **Owner security boundary.** Hook trust remains an owner-only approval.

## Version layers

The collection version, game runtime version, visual design label, lifecycle protocol, and adapter version serve different purposes. Keep them explicit rather than collapsing them into one number:

- collection information architecture: root `package.json`
- Needlewhile runtime/plugin: `games/needlewhile/package.json` and plugin manifests
- experience/design label: Needlewhile product documentation
- lifecycle protocol: runtime lease contract
- host adapter: MCP/Portal integration package

## Change strategy

- Documentation, localization, catalog metadata, and public display names can evolve on normal branches.
- Hook commands, plugin IDs, marketplace source paths, lifecycle namespaces, and controller state paths require isolated install/upgrade tests.
- A future move from the Needlewhile compatibility shell to a collection-level package is a migration project, not a directory cleanup.
