# VILOB Light V0.9A — Maritime Foundations & Coastal Galley

**Status:** implemented, regression-checked; extended natural run and target-PC speed remain open. 2026-11-20.  
**Baseline:** V0.8J. **Scope:** first navy feature release; no sea combat, naval trade, cargo carriage or land-army transport yet.

## Approved progression

- Ancient (고대): `목재 가공` unlocks **연안 노선** and a paid coastal **항구 Lv.1**.
- Medieval (중세): 항구 Lv.2, **중세 갤리선** with `상업 교통망` research.
- Early modern / industrial: 항구 Lv.3, 대형 범선 / 증기 수송선 with higher technology requirements. These hulls are presently travel-only; actual shipping comes in V0.9B.
- More advanced navy combat, blockade and amphibious actions remain future V0.9-series work.

## Actual V0.9A implementation

1. **Dedicated coastal dock slot.** At most one harbor per settlement, on a coastal land tile with an adjacent orthogonal water tile, using a separate port slot. Existing ordinary 6/6 building-slot saturation on the 658-year world no longer blocks every port; no general slot, no port or materials are created free.
2. **Ports:** Lv.1 build 550 Gold, 1.2 AP, 65 wood, 35 stone, 90 days (technology discounts apply). Lv.2 upgrade 1800 Gold, 3 AP, 130 wood, 90 stone, 30 iron, 160 days. Lv.3 upgrade 4500 Gold, 5 AP, 180 wood, 140 stone, 120 iron, 14 steel, 16 machine parts, 240 days. Coastal land, nation ownership, and technology gates apply. An Lv.1 harbor under a paid level-up can still fulfill its current Lv.1 harbor function.
3. **Coastal Galley (연안 노선):** 600 Gold, 1 AP, 75 wood, 5 iron, 90 days; 8 real crew; 60 hull HP; movement 5 days per four-direction connected sea tile; coastline-limited; 8 Gold/quarter upkeep. Spawned initially as an uncrewed hull, not as free soldiers.
4. **Additional initial hull definitions** allow medieval galley, large sailing transport, steam transport; higher tech/port levels required, steam movement pays coal at the time of voyage order. None yet carries armies or goods.
5. **Real ship/fleet ledger:** Separate `Ship`/`Fleet` from land `Army`; generated IDs, construction dates, paid hull cost, physical water-tile location, route and due-date, HP, crew culture, upkeep, retirement and conservation counters. Ships presently start in individual fleets; multi-ship fleet merging and battle control are future features.
6. **Real population crew recruitment:** crew pulled from associated settlement's culture population without duplicating citizens; military-population and culture-conservation auditing updated; ship decommissioning returns crew to a lawful settlement.
7. **Event-based sea navigation:** water-tile BFS and a coastline-distance limit on smaller hulls, no land crossings, no teleportation or crossing distinct water bodies; moves align with simulation time jumps, not daily global scans. Fuel is paid in advance for steam voyages.
8. **AI:** coastal AI with sufficient research/resources can fund a harbor; a conservative limit of one test hull per nation until naval logistics is released; AI crews and carries out short sea patrols or returns to port. Inland nations are not forced into naval construction.
9. **UI & persistence:** military tab naval panel, map fleet markers, player-controlled construction/commissioning/crew and navigation controls; new save key and migration from V0.8J/V0.8I. Old saves migrate with zero retroactively spawned navy assets.

## Actual tests completed

- Node.js syntax check of all 11 JS parts: **PASS**.
- Browser Chromium desktop 1440×820 and mobile 390×844: V0.9A standalone and fully inlined flat bundle tested (all flat JS parts loaded in original order): **PASS**, 0 uncaught script errors during startup. Direct localhost/file URL navigation was restricted by the browser environment, so this is not a live GitHub Pages deployment test.
- Older 658-year world/day 78,900 import (from V0.8I): **PASS**, validateWorld, navy initially empty and unminted.
- Paid harbor construction in actual 658-year save: **PASS** (architectural tech discounts produced 550G, 1.2 AP, 51 wood, 27 stone actual cost).
- Controlled actual-asset test: **PASS** ship ordered with 600G/1 AP/75wood/5iron debited (AP restored to minimum in the *test fixture* after civil AI spending); after 90 simulated days ship completed. Eight real inhabitants recruited from settlement: settlement -8, ship +8, national military population and global culture totals unchanged. One connected water tile voyage completed after 5 days; unload/reload and RNG verified. Does not imply the fixture action is fully natural AI.
- 658-year fully natural 360 additional days (up to 79,260): **PASS** with periodic world and culture verification; seven paid ports, seven ships, 56 ship crew, AI sailing and arrivals observed. This is distinct from the controlled fixture test.
- New seeded world comparison with V0.8J, three seeds ×30 days: **PASS** matching RNG/population/gold before any navy effects arise.
- 390+ day 658-year run, 1,200/3,600-day runs, full target-PC x10 performance and real host GitHub Pages smoke: **NOT verified**. Prolonged simulation also stalled under the prior V0.8J baseline in a similar era, so cannot yet attribute it to new navy code or rule it out.

## Known limitations and future work

- No useful naval cargo/land army transport, combat, escort, blockade, repair or seaworthiness casualty model yet (V0.9B+).
- The first release conservatively uses one ship per fleet. Repair, boarding, battle and salvage require next-stage designs.
- AI naval spending is deliberately capped while ships provide patrol rather than trade/combat utility.
- Coastal-port capture/stranded home-port transitions require more integration in future war-focused navy patches.
- Use exported backup before opening a large V0.8J save and verify x10 performance on the user's device.
