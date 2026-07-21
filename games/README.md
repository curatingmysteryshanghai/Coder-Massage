# Coder Massage game catalog

This directory contains released game packages and the collection registry. **Needlewhile / 扎会儿** is currently the only released and installable game.

## Released games

| No. | ID | Name | Category | Status | Install target | Portal |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | `needlewhile` | **[Needlewhile / 扎会儿](./needlewhile/)** | `tactile` | Available · user testing | `needlewhile@jieya` | Future-eligible; current route is direct |

The machine-readable repository registry is [`catalog.json`](./catalog.json). Plugin marketplaces must contain exactly the entries with `distribution.marketplace: true`. The current installed runtime is wired directly to Needlewhile and does not read this root catalog.

Distribution fields have separate meanings:

- `bundled` — the game module is included inside the installed compatibility package
- `installable` — users receive the game through the current collection install
- `marketplace` — the game owns a separate plugin marketplace entry
- `portal.eligible` — the bundled router may select the game

Future games will normally be bundled, installable, and Portal-eligible while keeping `marketplace: false`. Needlewhile remains the one marketplace entry and lifecycle owner.

## Working categories

| ID | 中文 | Meaning |
| --- | --- | --- |
| `tactile` | 触觉小动作 | Repeated clicking, tapping, pressing, placing, or dragging |
| `ambient` | 环境观察 | Watching, listening, or lightly changing a scene |
| `rhythmic` | 节律重复 | Repeating a simple action with loose timing |
| `spatial` | 空间漫游 | Wandering, arranging, tracing, or moving through a small space |

Each game has one primary category and may carry several interaction tags. Categories organize the collection without forcing installed paths to move.

## Status meanings

- **Concept** — an idea or visual study; excluded from installation and Portal routing
- **Experimental** — runnable by the team; excluded from user installation
- **Available** — validated, distributable, and eligible for the released experience
- **Retired** — kept for history; excluded from new sessions

## Runtime rule

There is one lifecycle owner and one collection Portal. Future games become modules inside that shared runtime. They do not register independent task hooks, controllers, or Portals.

See [repository architecture](../docs/ARCHITECTURE.md), [Portal contract](../docs/PORTAL.md), and [adding a game](../docs/ADDING_A_GAME.md).
