# Mello — audit, 2026-07-24

Taken at `feat/event-sheet-redesign`, **re-measured after `ad05b6a`** (the
two-stop sheet). The original event-sheet trio has since shipped to
`origin/main`; this branch carries three newer commits on top.

> **This file is a point-in-time snapshot and the sheet moved under it.** §3b was
> rewritten once already. Re-measure before acting on any number here — §7 has
> the commands.

**Every number here was measured on the current tree.** Where a measurement
contradicts `CLEANUP.md`, this file wins and §1 says so. Where my first
measurement was wrong, §6 records that too — twice in this audit an alarming
number turned out to be a counting error, which is the same failure the last two
audits in this repo made.

---

## 0. The one-line summary

The codebase is in **better** shape than `CLEANUP.md` claims, and its cleanup
backlog is **entirely untouched**. Nothing regressed while the chat and
event-sheet redesigns shipped — but neither did the two ship blockers, which
have now been open across roughly forty commits of feature work.

There are exactly **two** new pieces of debt worth acting on, both created by the
redesigns, both measured in §3.

---

## 1. `CLEANUP.md` is stale — in three places

| Claim in `CLEANUP.md` | Reality now |
| --- | --- |
| "Branch `cleanup/design-system-and-tests`, **not pushed**, `main` untouched" | **Merged.** That work is in `main`. The header is misleading to anyone picking this up. |
| `npm test` → 64 passing, 6 suites | **142 passing, 10 suites** |
| `npm run lint` → 95 errors / 16 warnings | **92 errors / 16 warnings** |
| `npm run typecheck` → 0 | **0** ✅ correct |

The doc's headline framing — "here is a branch awaiting review" — is the single
most misleading thing in the repo right now. It reads as pending work; it is
shipped work.

**Recommendation:** fold this audit into `CLEANUP.md`, rewrite the header to
"shipped, backlog outstanding", and correct the three numbers.

---

## 2. The backlog is 100% intact

Every open item in `CLEANUP.md` §3 was re-checked against the current tree.
**None were quietly fixed.** None have rotted either — every file:line still
points at the real thing.

### 2a. Ship blockers 🚨

| Item | Verified at | State |
| --- | --- | --- |
| Placeholder bundle ID | `app.config.ts:12`, `:30` — still `com.yourcompany.mello` | **OPEN** |
| IAP fallback defaults to it | `verify-iap/index.ts:40`, `verify-boost/index.ts:40` — `?? 'com.yourcompany.mello'` | **OPEN** |
| Crash reporting / error boundary | `Sentry`, `ErrorBoundary`, `ErrorUtils` → **zero hits** across `src`, `app`, `App.tsx` | **OPEN** |

The bundle ID is the one that can take a customer's money and grant them
nothing: the bundle ID *is* the receipt check, so a placeholder means the store
charges and verification then rejects the genuine receipt. Silent — nothing in
the logs.

The two are related and should ship together: with no crash reporting, the
bundle-ID failure is also **invisible**. You would find out from an App Store
review.

### 2b. Known bugs

| Bug | Verified at | State |
| --- | --- | --- |
| `getFriendConversations` caps messages globally | `dm.service.ts:184` — `.limit(300)` | **OPEN** |
| `NearbyEvent` cast over unselected fields | `events.service.ts:80` — `as unknown as NearbyEvent[]` | **OPEN** |
| KYC workflow id hardcoded | `didit-create-session/index.ts:5` | **OPEN** |
| Push vs in-app copy drifted | `notificationCopy.ts` vs `send-push-notification` | **OPEN** (not re-verified this pass) |

### 2c. Risk reduction

- **No CI.** `.github/workflows/` does not exist. `typecheck`, `lint` and `test`
  all pass and *nothing runs them*. This is why §1's numbers drifted unnoticed.
- **Supabase client is untyped.** No `createClient<Database>`. This is the root
  cause of the bad cast above being expressible at all.

---

## 3. New debt, created by the redesigns

These are the only two findings that are genuinely new. Both are real, both are
measured, and both are the *good* kind of problem — localized and mechanical.

### 3a. The two chat threads were written twice 🔴 **highest-value cleanup**

`app/(tabs)/chats/[eventId].tsx` (1,107 lines) and
`app/(tabs)/chats/dm/[friendId].tsx` (727 lines) share **165 identical
non-trivial lines** — about **44% of the DM screen**.

This is not old drift. `git log -S` dates it precisely, and it is worse than
drift:

| Logic | Entered event chat | Entered DM chat |
| --- | --- | --- |
| Rubber-band time-gutter drag (`const RUBBER`, the `past * RUBBER` formula) | `1a48261` | **`1a48261` — same commit** |
| Send kick (`sendKick`) | `98d9d94` | **`98d9d94` — same commit** |

Each animation feature was **authored twice, in the same commit**. This is
copy-paste at write time, not two files growing apart. `RUBBER = 0.5` is
declared independently in both files; `TIME_GUTTER` is imported from a shared
module, so the two halves of one formula now live on opposite sides of a
copy-paste boundary.

**Why this matters beyond tidiness:** `CLEANUP.md` §1 records that these exact
two screens *already* held "verbatim copies that had drifted", and that
attachment-failure handling was fixed in one and not the other. The repo has
been bitten by this precise pattern, in these precise files, before.

Worth crediting: `b8b0ded refactor(chat): one MessageBubble for both threads`
did extract the bubble. The extraction stopped at the bubble and the later
animation work went around it.

**The seam:** the drag physics, the send kick, the tapback overlay and the
seen-set are all thread-level concerns that take a message list and produce
gestures — none of them touch what a message *is*. They belong in one
`useThreadPhysics`-shaped hook plus a shared composer, leaving each screen its
data source and its header. Estimated ~165 lines deleted, one copy of the
formula.

### 3b. `EventBottomSheet.tsx` nearly doubled 🟠

| | At the cleanup merge | First measured | After `ad05b6a` | Δ total |
| --- | --- | --- | --- | --- |
| Lines | 940 | 1,671 | **2,171** | **+1,231 (+131%)** |

`CLEANUP.md` §3e already flagged this file at 934 lines as needing work and
concluded "remainder is JSX volume". It has since **more than doubled**, and is
now the largest file in the codebase by ~795 lines.

**It grew 500 lines between two measurements taken in the same session.** That
is the finding — not the absolute number. This file is where event work lands,
and it is accreting faster than anything else in the repo.

**The geometry described in an earlier draft of this audit is already gone.**
`ad05b6a` replaced the three-stop sheet with two stops and a fixed 45% hero:
`revealDist` and `secondSnapPx` now have **zero occurrences**. Any plan written
against those symbols is stale on arrival — which is the concrete argument for
not scheduling a refactor of this file ahead of time.

The code itself is **good** — the animation comments explain the physics, the
failure modes and what was tried first. This is not slop. It is one file doing
thirteen things.

The JSX already carries its own seams as section comments, which is what makes
this mechanical rather than risky:

| Section | Self-contained? |
| --- | --- |
| Host row · info cards · premium/women-only pills | mostly presentational |
| **Pending join requests** (host only) | ✅ clean seam |
| **Actions** (ended / live × host / guest branches) | the dense one |
| **Who's going card** | ✅ clean seam |
| **Happening near you rail** | ✅ clean seam (`NearbyMini` already extracted) |
| **Safety popups** | ✅ clean seam |
| **Leave confirm + reason sheet** | ✅ clean seam |

`NearbyMini` was already pulled out to the top of the file — the pattern is
established, it just needs continuing.

**Caveat, and it is the important one:** the snap geometry and the hero reveal
are *coupled through measured layout* — whatever they are called this week.
`firstSnapPx` and `animatedIndex` survive; `secondSnapPx` and `revealDist` were
real when this paragraph was first written and are gone now. Extracting the
presentational sections is safe; touching the measurement/animation core is not,
and there is no screen-test coverage to catch a mistake.

**Recommendation: do not schedule this split as its own task.** Two
measurements a few hours apart disagreed by 500 lines and invalidated the
symbol names a plan would have to protect. Do it as part of the next change
that touches the sheet — when the geometry is already in your head, already
being device-tested, and the extraction pays for itself immediately. Splitting
it speculatively buys structure at the cost of a device regression in the most
intricate animation code in the app, and buys it against a moving target.

### 3c. Two invented palettes

Small, but they are new semantic colours living in screens:

- **Announcement palette** — `#B4690E`, `#FFF6E9`, `#E8940A`,
  `rgba(180,105,14,*)`: **11 occurrences in `chats/[eventId].tsx`**. A complete
  semantic colour family with no token.
- **Three category accent/tint pairs** — `EventBottomSheet.tsx:573-616`
  (`#7C5CE0`/`#F0ECFC`, `#C8791E`/`#FBF0E2`, `#D6478E`/`#FBE7F1`), attached to
  the safety-popup variants.

Both belong in `COLORS`. `AGENTS.md` is unambiguous: *"Never hardcode a colour."*

Also minor, in the otherwise-exemplary `WrapSheet.tsx`: a raw
`rgba(255,255,255,0.10)` (:128) and a bare `ActivityIndicator` where the
`Loader` primitive exists (22 files already use it; 9 still use
`ActivityIndicator` directly).

### 3d. Two dead scaffold files at the repo root 🟢 free win

`App.tsx` is still the **untouched Expo template**, verbatim:

```tsx
export default function App() {
  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
```

It is imported by `index.ts`, which calls `registerRootComponent(App)`. Both are
dead:

| Evidence | Value |
| --- | --- |
| `package.json` `main` | **`expo-router/entry`** — not `index.ts` |
| The real root | `app/_layout.tsx` (fonts, providers, auth, notifications) |
| Anything importing `App.tsx` | only `index.ts`, which is itself unreferenced |

So `index.ts` → `App.tsx` is a complete orphaned island: the entry point Expo
scaffolds before you adopt expo-router, left behind when the app moved to file
routing. Deleting both is a no-op at runtime.

Worth stating plainly because it is also a **trap**: `App.tsx` looks like the
root component. Anyone adding an error boundary or a provider "at the root" by
reading filenames will put it there, and it will never run. That is precisely
the mistake §5 item 2 must avoid — the boundary belongs in `app/_layout.tsx`.

---

## 4. What is genuinely clean — measured, not assumed

Recording these so nobody spends a day "fixing" them.

- **Zero dead exports.** A sweep of every `export const` / `export function` in
  `src/utils` and `src/hooks` produced exactly one candidate, `CITY_LIMIT_M` —
  and it is **live**, used at `useSwipeDeck.ts:188` in its own file. My sweep
  counted files, not call sites.

  **But see §3d — that sweep was scoped to `src/`, and it missed two dead files
  at the repo root.**
- **Clean deletion.** `useSelectedEventSheet` was removed by the event-sheet
  work with **zero dangling references**.
- **`catch (e: any)` is down to 2** (doc claims 8).
- **Colour drift has not regressed.** See §6 — this one nearly became a false
  alarm.
- **The new files are good.** `EventSheetStack.tsx` (75 lines) is a clean,
  well-commented seam. `WrapSheet.tsx` explicitly reuses `WrapChecklist` rather
  than copying it — *"It is the wrap hub's checklist in a sheet, not a second
  copy of it"* — which is exactly the instinct `AGENTS.md` asks for.
- **Shared chat logic was partly extracted already** — `useChatScroll`,
  `useReactions`, `useActiveChat`, `messageGroups` are all shared. §3a is the
  part that escaped, not a total failure.

---

## 5. Recommended order

Deliberately short. YAGNI applies to plans too. Revised after grilling — see
§5a for what changed and why.

0. **Verify the production build has its environment.** `eas.json`'s
   `production` profile has **no `env` block**, while `development`, `preview`
   and `ios-simulator` all define `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `supabase.ts:134` reads them with a
   non-null assertion. **Not proven broken** — EAS also serves env vars from
   the dashboard, which never appear in this file — but if the dashboard lacks
   them, a production build cannot reach its backend at all. Two minutes to
   rule out; outranks everything below if it is real.
1. **Restrict or rotate the committed Maps keys.** `GOOGLE_MAPS_IOS_KEY` /
   `GOOGLE_MAPS_ANDROID_KEY` are in tracked `eas.json` on a GitHub remote.
   The Supabase key beside them is fine — `sb_publishable_` is public by
   design — but Maps keys are billable and abusable if unrestricted.
2. **Make the IAP bundle-ID fallback throw.** The real identifier does not
   exist yet (stores not registered), so this ships the durable half: remove
   the placeholder default so a missing secret breaks the deploy rather than a
   customer's purchase. The bundle ID *is* the receipt check.
3. **An error boundary.** No dependency needed — expo-router wraps any route
   exporting `ErrorBoundary`. Kills the white screen today.
4. **CI** (`typecheck` + `test` gating, `lint` non-gating). ~20 lines. Do it
   early and every number in this document stays true by itself — the drift in
   §1 happened precisely because nothing ran these.
5. **De-duplicate the two chat threads** (§3a). The highest-value *code*
   cleanup: the two drag implementations are byte-identical including comments,
   so the extraction is mechanical, and it closes a bug class these two files
   have already been bitten by.
6. Tokenize the two invented palettes (§3c).
7. Supabase generated types → kills the `NearbyEvent` cast class of bug.
8. The remaining §2b bugs. The DM preview fix needs a migration + a
   `DISTINCT ON` RPC — in pattern with the existing 43 migrations and 14 RPC
   call sites, but it is backend work, not a service edit.
9. **Sentry**, as a pre-launch gate. There are no users yet, so a crash
   reporter reports nothing — but wiring it *during* launch week is worse.

**Not scheduled:** the `EventBottomSheet` split (§3b) — do it inside the next
change that touches the sheet, for the reason given there.

**Not recommended:** a general tokenization sweep, a `<Card>`/`<Chip>` primitive
push, or a React-Compiler bulk fix. `CLEANUP.md` §3d already measured the first
two and found the duplicates were not there — 51 "cards", 51 distinct. That
conclusion still holds and this audit found nothing to overturn it.

### 5a. What grilling changed

Recorded because each of these was a plan that survived writing and died on
questioning.

| Change | Why |
| --- | --- |
| Dropped the `EventBottomSheet` split from the schedule | Highest regression risk, zero functional benefit — and the symbols a plan would protect changed *during this session*. |
| Added items 0 and 1 | Found by reading build config, which the first pass never opened. Item 0 may outrank every original blocker. |
| Sentry moved from #2 to last | Adds a dependency, an account and a native rebuild, for an app with no users. The boundary is the half that helps a person today. |
| DM fix specified as a migration + RPC | The original step said "fetch the latest message per conversation" — a description, not an instruction. It needs `044_*.sql`. |
| Work branches off `origin/main` | Keeps cleanup separate from unverified sheet work, so a device regression has one candidate cause. |

The pattern: **the first pass over-valued structural tidiness and under-valued
build configuration.** Nothing in §3 could stop a launch. Item 0 might.

---

## 6. Where I was wrong

Both corrections came from `AGENTS.md`'s "measure before you claim" rule, and
both would have shipped as confident, wrong headlines.

1. **"Colour drift is 5.2× worse than documented."** I counted 549 raw colour
   literals against the doc's ~105. Wrong twice over: the doc's metric was *hex
   only* (I had included `rgba()`), and the top three files by count are
   `categoryStyle.ts` (88), `activities.ts` (86) and `notificationStyle.ts` (28)
   — **constants files, which are the legitimate home for colour definitions.**
   Outside `src/constants`, hex literals number **232 — versus 232 at the
   cleanup merge.** Excluding `#fff`/`#000` gives **97**, closely matching the
   doc's "~105". **No regression. The claim was an artefact of my grep.**

2. **"The chat duplication predates the redesign."** My first baseline was
   `f399d03`, which I took to be "before this work" — it is `main`'s tip and
   *already contains* the entire chat redesign. Only the 3 event-sheet commits
   are on this branch. `git log -S` gave the real answer (§3a).

3. **I read the branch topology wrong, twice.** I took `f399d03` to be "before
   this work" — it was `main`'s tip and already contained the whole chat
   redesign. Then I described this branch as carrying three unverified
   event-sheet commits; by the time I checked again those had shipped to
   `origin/main` and three *different* commits had replaced them. Local `main`
   was three behind the whole time and I never fetched.

4. **I audited source and never opened build config.** `eas.json` had a
   `production` profile with no environment at all, and live Maps keys
   committed to a tracked file. Neither is source code, so neither was in any
   grep I ran. §5 items 0 and 1 exist because someone asked a question I had
   not thought to ask.

This is the third audit in this repo to over-count on first pass. The pattern is
always the same: a grep that is broader than the metric it is compared against.

**The newer lesson is #3 and #4 together: a static audit is stale the moment it
is written, and it only covers what you thought to look at.** Between two
measurements in a single session, the largest file in the codebase grew 500
lines and two symbols this document told a future plan to protect stopped
existing. Re-measure before acting; do not trust a number in this file because
it is written down.

---

## 7. Verification

```sh
npm run typecheck   # 0 errors
npm test            # 142 passing, 10 suites
npm run lint        # 92 errors / 16 warnings — pre-existing, don't add
```

All three were run for this audit. **No device pass was run** — everything above
is static analysis, so nothing here validates that the event-sheet redesign
*looks* right. `CLEANUP.md` §4's device checklist still applies, and the
Android tab-bar section of it has still never been run on Android.
