# Collection Portal contract

The Coder Massage Portal is the opt-in boundary between an AI task and a small waiting-time experience.

## Current behavior

There is one available game, so the complete route is:

```text
AI task starts → small inline Portal → user clicks → browser Portal → Needlewhile
```

The current release does not select among multiple games. It does not open a browser before the user clicks.

## Planned behavior

When at least two games are released and bundled into the collection runtime:

```text
AI task starts
      ↓
one collection Portal
      ↓ user chooses to enter
select one eligible game for this run
      ↓
game view ↔ user-triggered switcher ↔ another eligible game
      ↓
same task completion and ending state
```

## Selection rules

1. Candidate games come from the released runtime catalog.
2. A candidate must be `available`, installable in the collection build, and `portal.eligible: true`.
3. Selection happens once when a run first enters the browser experience.
4. Reopening the same run restores its selected game.
5. Random weights may tune variety; selection never depends on prompt content.
6. With one candidate, that game is selected deterministically.
7. Retired, experimental, missing, or invalid games are excluded.

## Switching rules

- Switching is always initiated by the user.
- The current task clock and `startedAt` value remain unchanged.
- Task label, tool-step count, completion state, and lifecycle lease remain shared.
- The switcher lists only games bundled and validated in the installed release.
- A game may save ephemeral view state in memory for the current run; it must not persist prompt content.
- The switcher is hidden or disabled when only one game is eligible.

## Interaction principles

- Entry is visible, small, and easy to ignore.
- A game can be understood without instructions and left without penalty.
- No game requires score chasing, streak maintenance, or task-like progress.
- Keyboard shortcuts reserved by the browser or operating system remain usable.
- Sound starts only after user interaction and always has a visible control.
- Reduced-motion preferences and keyboard access are part of release validation.

## Compatibility

The initial multi-game implementation should keep `needlewhile@jieya` as the installed compatibility shell and preserve the current Hook commands. Generic collection tool names may be added later, while existing Needlewhile tool names remain as aliases until a tested migration is complete.

## Privacy

The router must stay local and loopback-only. Game selection must not inspect raw prompts, build behavioral profiles, call a remote recommendation service, or add analytics. A random choice is a play mechanic, not a personalization system.
