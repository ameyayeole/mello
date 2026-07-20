# Mello — Cleanup Status & TODO

Branch: `cleanup/design-system-and-tests` (18 commits, **not pushed**, `main` untouched)

**Verified at the tip of the branch:**

| Check | `main` | Now |
| --- | --- | --- |
| `npm run typecheck` | 0 errors | **0 errors** |
| `npm run lint` | 99 errors / 43 warnings | **95 errors / 16 warnings** |
| `npm test` | *(no test runner)* | **64 passing, 6 suites** |

Every number below was measured, not estimated.

> ⚠️ **Nothing on this branch has run on a device.** That is now ~40 screens of
> changes plus a type scale that touches every screen using a shared primitive.
> **Do the device pass in §4 before writing any more code.** Stacking more
> changes on an unverified pile is how a regression becomes unfindable.

---

## 1. Bugs fixed ✅

Real defects, not tidying. Each one is verified.

- [x] **Search crashed on any comma** — raw input was interpolated into PostgREST filter grammar, so `"coffee, bandra"` produced HTTP 400 before reaching the database. Verified against the live API: 400 → 200.
- [x] **Failures silently downgraded** — `searchUsers` retried on *any* error, turning real failures into name-only results. It also masked the bug above. Narrowed to the missing-column case (`42703`) it exists for.
- [x] **Empty error alerts** — `catch (e: any) { alert(e.message) }` in 46 places showed a blank alert whenever the thrown value had no message.
- [x] **One event, two different times** — cards said "Today 7:00 PM", the sheet said "Tonight". The sheet carried a private copy of the formatter. One shared helper now.
- [x] **Android status-bar overlap** — `react-native`'s `SafeAreaView` is iOS-only and renders as a plain `View` on Android. 39 screens had content underneath it. Now **zero**.
- [x] **iOS modals padded twice** — `safe-area-context` reports *window* insets regardless of presentation. Fixed centrally via `Screen`'s `modal` prop, applied to all 12 modal routes.
- [x] **Event chat input couldn't grow** — fixed 42px single line while DMs grew to 120px. Both now grow; Return inserts a newline, only the send button sends.
- [x] **Attachment failures swallowed** in event chat but handled in DMs — the two screens held verbatim copies that had drifted.
- [x] **Optimistic-update race** — join/leave/approve/reject snapshotted for rollback *without* cancelling in-flight queries. A refetch already on the wire could land after the optimistic write and overwrite it: Join flipped to "Going", then snapped back on a slow connection.
- [x] **Edit screen could save an invalid party size** — it had its own `parseInt` with **no clamp**, so an edit could set a size the create flow rejects. Both now share `utils/eventDraft`.
- [x] **IAP receipt check defaulted to a placeholder bundle ID** — *rolled back at your request, still open. See §3a.*

## 2. Structural cleanup ✅

| | Was | Now |
| --- | --- | --- |
| Core `SafeAreaView` (Android bug) | 39 | **0** |
| Hand-rolled headers | 32 | **16** *(all justified — see §5)* |
| Duplicated empty states | 17 | 3 |
| Ad-hoc button styles | 97 | ~58 |
| Raw hex literals | 289 | ~105 |
| Multi-file query keys typed by hand | 81 | **0** |
| `catch (e: any)` | 46 | **8** |
| Hand-rolled `<Modal>` overlays | 16 | **12** |
| Raw font sizes in `ui/` primitives | 13 | **2** *(emoji glyphs)* |
| Lint **warnings** | 43 | **16** |
| Dead files / unused deps | — | 5 deleted / 4 removed |

- [x] **Button system** — exactly three variants: coral (major CTAs only), black (workhorse default), white (low-stakes). No pills. `secondary` is the default so coral stays rare.
- [x] **`NavButton`** — one bare-glyph back/close/dismiss affordance; no grey circle. `IconButton` keeps its chip for on-screen actions.
- [x] **`Screen`, `ScreenHeader`, `TextField`, `EmptyState`, `EventRow`** — the primitives whose absence made forking easier than reusing.
- [x] **`queryKeys` registry** — 15 multi-file families, each exposing `all` (invalidate) and `of()` (read). Verified byte-identical to the 26 literals it replaced.
- [x] **Test infrastructure** — Jest + jest-expo per the Expo 56 docs, scoped to `src/utils` and `src/services`.
- [x] **`Sheet` / `Dialog`** — one overlay primitive; the nested-`Pressable` dismiss trick is written once instead of sixteen times. Adopted in 4 of 16.
- [x] **Type scale replaced** — the old `TYPE` had 11 steps, **zero importers**, and values matching nothing the app rendered. New scale is 9 steps, whole pixels, named by role. Adopted in the `ui/` primitives only; **no text moved more than 0.5px**.
- [x] **`import/first` warnings** — a stray `const` between the imports in `map.tsx` was generating 21 warnings on its own.

---

## 3. Not done — the honest list

### 3a. Ship blockers 🚨

- [ ] **Real bundle identifier.** `app.config.ts:12,30` is still Expo's placeholder `com.yourcompany.mello`, mirrored as a silent fallback in `verify-iap` and `verify-boost`. The bundle ID *is* the receipt check — with a placeholder, the store charges the customer and verification then rejects their genuine receipt. **Billed, granted nothing, nothing in the logs.** Needs the identifier from App Store Connect / Play Console, set in both places plus the `IAP_BUNDLE_ID` Supabase secret. The fallback should throw, not default.
- [ ] **Crash reporting + error boundary.** Zero hits for `Sentry`, `ErrorBoundary`, `ErrorUtils`. Today a render error in production is a white screen and you find out from an App Store review. **Highest-value item on this page.**

### 3b. Known bugs, unfixed 🐛

- [ ] **`dm.service.ts:132`** — `getFriendConversations` caps at `.limit(300)` messages *globally*, so a heavy user's quiet conversations show no preview.
- [ ] **`notificationCopy.ts` vs `send-push-notification/index.ts`** — a 16-case switch duplicated across the network boundary, **already drifted in the default case**. Push text and in-app text disagree.
- [ ] **`events.service.ts:79`** — casts to `NearbyEvent[]` while not selecting 4 of its required fields. `undefined` at runtime, invisible to `tsc`.
- [ ] **`supabase/functions/didit-create-session/index.ts:5`** — KYC `WORKFLOW_ID` hardcoded; should be env.

### 3c. Risk reduction 🛡️

- [ ] **CI.** `typecheck`, `lint` and `test` all exist and nothing runs them. ~20 lines. (A workflow was written and rolled back with the production work — easy to restore.)
- [ ] **Supabase generated types.** `createClient()` is untyped — the root cause of the remaining 8 `as any` *and* of the bad cast above being possible. Turns a class of runtime bug into compile errors.
- [ ] **52 React Compiler lint errors.** Not style nits; React 19's compiler flagging unsafe code. Needs triage, not a bulk fix.
  - `react-hooks/immutability` × 26 — mutating props or state
  - `react-hooks/refs` × 17 — reading a ref during render
  - `react-hooks/set-state-in-effect` × 7 — cascading re-renders
  - `react-hooks/purity` × 2 — impure call during render
- [ ] 39 × `react/no-unescaped-entities` — cosmetic, `--fix`-able.

### 3d. Design system, partly adopted 🎨

- [x] ~~Type scale~~ — replaced and adopted in primitives. **The 500-odd screen-level sizes are deliberately NOT migrated** — see the note below.
- [ ] **Finish `Sheet` / `Dialog`** — 12 hand-rolled `<Modal>`s remain. 8 are real overlays following the same pattern as the 4 already converted; **4 are full-screen viewers** (photo viewers, scanner, image bubble) and are a different shape that probably should not use this primitive.
- [ ] **`<Card>`** — ~25 copies, radius drifting 16/18/20/22/24.
- [ ] **`<Chip>` / `<Badge>`** — ~145 instances. *Biggest remaining, do it last.*
- [ ] **`<Loader>` / skeletons** — 22 files use a bare `ActivityIndicator`.
- [ ] **`<ListRow>`** (14 copies), **`<Divider>`** (5).
- [ ] **`SPACING` / `RADIUS` / `SHADOWS`** — still **0 importers**, 1278 raw spacing numbers. Same argument as the type scale: adopt in primitives first, migrate screens as a review.

> **Why the 555 screen font sizes were left alone.** Measured: 34 distinct
> sizes, **35% half-points**, and `12.5` is the single most-used size in the
> codebase. Snapping them onto any scale changes 9–56% of the app's text
> depending on the scale chosen. Critically, there is **no latent role
> structure to recover** — `bold` spans 11.5–15px and `medium` spans 10.5–14
> with no dominant size in either, so sizes were picked per screen, not per
> role. Deciding that a given 12.5px meta row becomes `caption` is ~500
> individual *design* judgements, not a refactor. Migrate a screen at a time,
> as you touch it, with the result on screen in front of you.

### 3e. Large files 📄

- [ ] **`CreateEventFlow.tsx` — 1375 lines.** Rules extracted and tested; the rest is **deliberately left alone**. `phase`/`step`/`coord`/`locationName` are entangled with the pin animation and the `useImperativeHandle` contract `map.tsx` calls into, and `handleHost` interleaves its network call with a two-beat camera choreography. Needs a device to verify, not a refactor.
- [ ] **`EventBottomSheet.tsx` — 934 lines** (was 1045). Mutations extracted, deduplicated, bug-fixed, covered. Remainder is JSX volume.
- [x] ~~`edit/[eventId].tsx` — duplicated limits, unclamped party size, `onMapPress(e: any)`, hardcoded Mumbai coords~~ — all fixed.
- [ ] **`edit/[eventId].tsx` — the 12-setState `useEffect` with the `seeded` guard** (`:109`). The fix is not to tidy the effect but to delete it: split the form into a child component keyed by `event.id`, so its `useState` initialisers run once with the event already loaded. No effect, no `seeded` flag, no cascading render. **Deferred on purpose** — it means moving ~450 lines of JSX on a screen with no test coverage and no device verification. Do it as its own isolated batch.

---

## 4. What to test 🧪

Nothing on this branch has run on a device. Ordered by risk — **do §4.0 first**;
if it fails, stop and report rather than working through the rest.

Run on both platforms. `npx expo start -c` (the `-c` clears the bundler cache —
the token and primitive changes will otherwise serve stale modules).

### 4.0 Smoke test — 5 minutes, do this first

If any of these fail the branch is broken and the rest of the list is noise.

- [ ] App launches past the splash screen without a red box
- [ ] Sign in works
- [ ] Map tab renders with pins
- [ ] Tap a pin → event sheet opens → Join works
- [ ] Dashboard, Explore, Chats, Profile tabs all render
- [ ] Create an event end to end

### 4.1 Type scale & primitives — NEW, touches every screen

The scale changed sizes by up to 0.5px inside `Button`, `TextField`,
`ScreenHeader`, `EmptyState`, `SectionLabel`, `AttendeeStack` and
`CategoryPill` — which is nearly every screen. Look for **truncation and
wrapping**, not for size: a label that fitted at 11.5px and now wraps at 11px
is the failure mode.

- [ ] Button labels on all three sizes — nothing clipped or wrapped
- [ ] `TextField` labels, error text, hint text, character counters
- [ ] Screen header titles and subtitles — long event titles still truncate with `…` on one line
- [ ] Section labels (the small uppercase headers)
- [ ] Attendee stack overflow count (`+3`) still fits inside its circle
- [ ] Category pills — label and emoji still aligned
- [ ] Empty states — icon, title and body

### 4.2 Overlays — NEW

Four moved to the shared `Sheet`/`Dialog`. Card corner radius changed slightly
(20/24/26 → 22) and the scrim is now one value.

- [ ] **Chat message long-press menu** (`OptionSheet`) — opens, actions fire, **tapping the card itself does NOT dismiss it**, tapping the backdrop does
- [ ] **Note composer** (Rate flow → pencil) — keyboard pushes the sheet up, does not cover the input
- [ ] **Block confirm dialog** — centred, Cancel and Block both work
- [ ] **Superlatives picker** — opens, selecting a person closes it
- [ ] On all four: backdrop dim looks consistent, and the sheet clears the home indicator at the bottom

### 4.3 Edit event — NEW

- [ ] Open an event you host → Edit. Every field prefilled correctly
- [ ] Change the party size to `999` → saves as **50**, not 999
- [ ] Change it to `abc` or empty → falls back sensibly, does not crash
- [ ] Tap the map to move the location → pin moves, address updates
- [ ] Save → changes appear on the event sheet and the dashboard

### Android — highest priority
The `SafeAreaView` → `Screen` swap touched ~40 screens and Android is the half that was broken before. One regression already shipped here.

- [ ] Every screen with a header clears the status bar — no content underneath it
- [ ] Onboarding: welcome → permissions → guidelines
- [ ] Premium, Explore, Settings, Profile edit
- [ ] Map's floating search/filter bar sits below the status bar
- [ ] Profile photo viewer's ✕ button sits below the status bar

### iOS modals — the double-padding fix
- [ ] No dead band above the header on: Wishlist, Edit event, Settings, Profile edit, Change password, Change email, Verify, Notifications, Search, Map filters, Premium
- [ ] Swipe screen — compare against the screenshot that started this; gap should shrink by ~one status bar
- [ ] Inverse check: headers must not now be *too tight* or clipped by the card's rounded corner
- [ ] Control group (pushed, not presented): Attendees, Manage event, Check-in, Friends — should look unchanged

### Optimistic updates — the race fix
- [ ] Join an event → button flips to "Going" and **stays** (test on a throttled connection)
- [ ] Leave an event
- [ ] As host: approve and reject a pending request
- [ ] Going-count matches the visible attendee list after each action
- [ ] Bookmark / unbookmark → badge fills instantly, Wishlist reflects it

### Buttons & nav
- [ ] Back arrows are a plain dark glyph, slightly larger, **no grey circle**
- [ ] Dark headers (chat, DM, Check-in, Swipe): bare **white** glyph, still legible
- [ ] The ⋯ chat menu and refresh-QR **keep** their chips — only navigation went bare
- [ ] Tap slightly *outside* a back arrow — it should still fire
- [ ] Gallery photo viewer: ✕ bare, trash + flag chipped, row not lopsided
- [ ] Manage event: **Edit** chip is white with a border, dark text, routes correctly
- [ ] Coral appears only on major CTAs (sign in, host, pay, check in, Join in the sheet)

### Chat
- [ ] Type two lines with Return between them, send — both lines render in the bubble
- [ ] Long message grows the input to ~3 lines then scrolls internally; send button stays pinned to the bottom
- [ ] Return inserts a newline in **both** event chat and DMs; only the button sends
- [ ] Attach a photo in both; also **cancel** the picker — must do nothing, not error
- [ ] Report a message in both — all four reasons + Cancel, "Report sent" confirms

### Time formatting
- [ ] Event after 5pm today → **"Tonight"** on the card *and* in the sheet
- [ ] Before 5pm → "Today". Tomorrow → "Tomorrow". Both places agree.
- [ ] Next week → card `Jul 27, 8:30 PM`, sheet `Sun, 27 Jul` / `8:30 PM` *(different by design)*

### Cache invalidation — the query-key registry
Failure mode is "screen doesn't refresh", so test the write paths.

- [ ] Create an event → appears on dashboard + profile without pull-to-refresh
- [ ] Edit an event → change shows on dashboard, map and sheet
- [ ] Notifications → "Mark all" clears the dashboard unread dot
- [ ] Block someone → their events vanish from the map/nearby feed
- [ ] Send/accept a friend request → both profiles update
- [ ] Wrap: rate someone or add a photo → checklist reflects it

### Headers
- [ ] Wrap screens: **Event wrap**, Add your photos, Photo pool, Superlatives, Rate the event, Who did you meet?
- [ ] Titles are now **left-aligned** where some were centred — intended, but say if it reads wrong
- [ ] Photo pool: bookmark button top-right only when there are savable photos; title must not shift when absent
- [ ] Wishlist / Who did you meet? use a **chevron-down**, not an arrow; both dismiss
- [ ] Notifications: "Mark all" top-right still works
- [ ] Search: autofocus fires, clear ✕ appears on typing
- [ ] Check-in: fully black, light status bar, refresh rotates the code — watch for a white status-bar flash on entry
- [ ] Swipe: dark band keeps its **rounded bottom corners**

### Regression sweep
- [ ] Sign in / sign up / password reset
- [ ] Create an event end to end — pin drop, camera zoom, both animation beats
- [ ] Search with a comma: `coffee, bandra` returns results instead of an error

---

## 5. Deliberately not changed

Recorded so nobody "fixes" them later.

- **16 remaining hand-rolled headers** — not title bars. Chat headers embed an avatar and presence dot (needs a centre slot); tab-root headers are heroes with no back button; the auth screens' `header:` is a block of onboarding copy; recap is a floating back button over a confetti hero; premium is a brand-centred modal header with close on the *right*; search is a search bar.
- **Prettier is not enforced via lint** — it would reformat 109 of 170 files in one pass and bury every real change. Scripts exist to run deliberately.
- **`chatKey` / `ChatKey`** — an audit flagged these as dead. **Wrong**: 7 live call sites.
- **`app/events/wrap/[eventId].tsx` vs `app/wrap/[eventId].tsx`** — not duplicates. Private attendee hub vs public read-only wrap; different data sources and auth boundaries.
- **`app/events/host/[eventId].tsx`** (676 lines) — 0 `useState`, 0 `useEffect`, all data via `useQuery`. Length is JSX volume.
- **Coral selection-state chips** (`chipActive`, `pillSelected`, `tagChipOn`) — coral means *selected* there, not *press me*. Different from the three-button rule.
- **Reanimated is not imported in `jest.setup.js`** — Reanimated 4 initialises its worklets runtime on import and throws under Jest, taking out every suite. Component tests will need a worklets mock.
- **Component tests use `MutationObserver`, not `renderHook`** — RNTL 14 on React 19 left `result.current` undefined for every test after the first. The harness cost more than the coverage was worth.

---

## 6. When you come back

**Before writing any more code:**

1. **Run §4.0** (5 min smoke test). If it fails, stop — report what broke and
   which screen.
2. **Run §4.1 and §4.2** — the newest and least verified work.
3. **Run the Android pass (§4.3 onward)** — the half that was broken before this
   branch, and where one regression already shipped and had to be caught by eye.

**Then, in this order:**

4. Bundle ID + make the IAP fallback throw 🚨 *(needs the real identifier from
   App Store Connect / Play Console — this is the only blocker that can take a
   customer's money and give them nothing)*
5. CI — `typecheck` + `test` gating, `lint` non-gating for now
6. Sentry + an error boundary 🚨 *(highest-value item on this page: today a
   render error in production is a white screen with zero telemetry)*
7. Supabase generated types — kills a class of runtime bug
8. The four known bugs in §3b
9. Finish `Sheet`/`Dialog` (8 overlays), then `<Card>` / `<ListRow>` / `<Divider>`
10. The `edit/[eventId].tsx` form extraction, as its own batch
11. Triage the 52 React Compiler errors
12. `<Chip>` and spacing tokens — last, they are the widest

**Do not** mass-migrate font sizes or spacing across screens without a design
review. See the note in §3d.

---

## 7. How to pick this back up

```sh
git checkout cleanup/design-system-and-tests
npm ci                 # lockfile is clean; verifies nothing drifted
npm run typecheck      # must be 0
npm test               # must be 64/64
npm run lint           # 95 errors / 16 warnings, all pre-existing
npx expo start -c
```

Nothing is pushed. `main` is untouched, so `git checkout main` abandons all of
it cleanly if you want to start over.

The commit history is deliberately readable — 18 commits split by concern, each
message explaining *why* rather than restating the diff. `git log --oneline
main..HEAD` is the fastest way back into context.
