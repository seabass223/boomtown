# Boomtown v1 balance

All balance values live in typed configuration:

- Worker cargo: 3 items
- Gather time: 1.4 simulation seconds per item
- Firework: 1 wood + 1 water + 1 ore, 4 worker-seconds
- Launch Field: 6 wood + 6 stone
- Launch rack: 3 wood + 2 stone, 6 launch slots
- Success: completed Launch Field and at least 12 launchable fireworks
- Walking speed: 2.46 world units per simulation second

The fixed four-day schedule lasts approximately 8, 4, 2, or 1 real minutes at
the displayed 1×, 2×, 4×, and 8× speeds, excluding pauses and day summaries.

## Scripted playtest routes

These routes exercise the actual Shift-loop controls. Quarry-to-Factory yields
ore; Quarry-to-Launch Field yields stone.

| Scenario | Script | Validated deterministic result |
| --- | --- | --- |
| Failure | Spend all four days gathering without completing the Launch Field. | 24 produced/staged and four hypothetical racks still resolve to **No Show** because the field is incomplete. |
| Plausible success | Day 1: split workers between Lumber Mill → Launch Field and Quarry → Launch Field until the field and two racks are complete. Days 2–4: two workers each on Lumber Mill, Water Tower, and Quarry → Factory, with two hauling Factory → Launch Field. | 16 produced, 15 staged, 12 capacity, 12 launched: **Success, grade C**. |
| Optimized score | Complete the field and four or more racks early, then maintain balanced wood/water/ore delivery and two factory-output haulers. Add racks whenever staged output approaches capacity. | 42 produced, 40 staged, 36 capacity, 36 launched: **Success, grade S**. |

Every success route requires wood, water, ore, stone, factory input hauling,
factory output hauling, Launch Field construction, and rack capacity. Moving
workers between construction, balanced inputs, output hauling, and late rack
expansion prevents one static allocation from trivially maximizing the score.
The final-state outcomes above are locked by `tests/scoring.test.mjs`; the
allocation scripts are the repeatable control sequences used for playtesting.
