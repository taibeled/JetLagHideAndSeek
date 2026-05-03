# TODO: E2E / Component Tests — Train Line Dropdown

These test cases require browser automation (Playwright) or React component testing
(React Testing Library). Neither is currently set up in this codebase.

---

## Required Infrastructure

1. **Playwright** (E2E, full browser) or **React Testing Library + jsdom** (component tests)
2. **Overpass API mocking** — network intercept layer so tests don't hit live Overpass
3. **CAS server mock** or in-memory Fastify instance for sharing/load scenarios
4. **Nanostores reset/seed helpers** to prime state before each test

---

## Test Cases

### C1: Dropdown populates with lines from nearest station

| Step | Expected |
|------|----------|
| Add a "same-train-line" matching question centered near Shinjuku-sanchome | Question card appears |
| Unlock the question | Train line dropdown is enabled |
| Open the train line dropdown | Dropdown shows "(auto-detect from nearest station)" + one entry per line (no duplicates, no route_master) |
| Verify no direction noise in labels | Labels like "Fukutoshin Line" not "Fukutoshin Line (Wakoshi --> Shibuya)" |

### C2: Selecting a line updates the station preview

| Step | Expected |
|------|----------|
| With question unlocked, open dropdown and select a specific line | Dropdown closes, shows selected line name |
| Wait for station preview to load | "Stations matched: N" shows N > 0 |
| Scroll the station list | All stations visible, scrollable pane works |
| Select "auto-detect" | Preview updates to show auto-detect stations |

### C3: Station preview handles empty results

| Step | Expected |
|------|----------|
| Select a line that has no station nodes in the loaded area | "No stations found for this line" displayed |
| Count shows "Stations matched: 0" | |

### C4: Station preview shows "Loading stations..." during fetch

| Step | Expected |
|------|----------|
| Select a line while Overpass calls are slow (simulate network delay) | "Loading stations..." shown | 
| Fetch completes | Text changes to "Stations matched: N" with list |

### C5: Selected line clears when pin moves to incompatible station

| Step | Expected |
|------|----------|
| Select a line specific to current station | Line shown in dropdown |
| Move seeker pin to a station on a different line's network | Dropdown resets to "(auto-detect from nearest station)" |
| `selectedTrainLineId` is undefined | Station preview shows auto-detect results |

### C6: Loading state shows in dropdown trigger

| Step | Expected |
|------|----------|
| Unlock question fresh after pin move | Dropdown trigger shows "Loading train lines..." |
| Overpass call completes | Trigger shows "(auto-detect from nearest station)" or selected line |

### C7: Locked question preserves selection display

| Step | Expected |
|------|----------|
| Select a line, lock the question | Dropdown shows the line name, disabled |
| Result toggle (Same/Different) is disabled | Cannot change |
| Reload from same shared URL | Line selection preserved in dropdown |

### C8: Backward compatibility — legacy same-train-line without selection

| Step | Expected |
|------|----------|
| Load a shared URL with a same-train-line question that has no `selectedTrainLineId` | Dropdown shows "(auto-detect from nearest station)" |
| Result is computed by `trainLineNodeFinder` auto-detect | Correct behavior |

### C9: Hiderification with selected line

| Step | Expected |
|------|----------|
| Set hider location | |
| Select a specific train line in the matching question | |
| Click Hider Mode | Question computes `same` based on `findNodesOnTrainLine(selectedTrainLineId)` |
| Result toggle updates | Correct yes/no answer |

### C10: ZoneSidebar filters hiding zones with selected line

| Step | Expected |
|------|----------|
| Enable "Display hiding zones" | |
| Add a same-train-line question with a specific line selected and `same=true` | |
| Trigger station discovery | Only stations on the selected line shown in hiding zone |
| ZoneSidebar count reflects filtered count | |

### C11: Custom-only station list with selected line

| Step | Expected |
|------|----------|
| Enable "Use custom station list", disable "Include default stations" | |
| Select a line in the matching question | Warning toast: "'Same train line' isn't supported with custom-only station lists; skipping this filter." |
| ZoneSidebar filtering is skipped | |

### C12: Wire serialization with selectedTrainLineId

| Step | Expected |
|------|----------|
| Create state with same-train-line question + selected line | |
| Share via CAS (`sid=` URL) | |
| Load shared URL in fresh browser | `selectedTrainLineId` and `selectedTrainLineLabel` survive round-trip |
| SID is deterministic | Same state = same SID |
