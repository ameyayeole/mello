# The dealt event card

**Date:** 2026-08-03
**Status:** design agreed, not built

Replaces the event bottom sheet with a card that is dealt out of whatever you
tapped, lands centre screen over an 80%-dimmed world, and flips to show its
back.

---

## 1 · Why

The event detail is a `@gorhom/bottom-sheet` with two snap points, and every
animation in its 2,216 lines hangs off `animatedIndex` — the drag progress
between those stops. The hero photo grows because the white card slides down to
uncover it; the description reveals from behind a pinned CTA; the attendee
stack flies right as the roster sweeps in from the left. All of it is
choreography invented to make a *sheet* feel good.

A card is a different object with a different axis. Porting that choreography
onto it would be forcing old solutions onto a problem that no longer exists.

The card also has to work somewhere the sheet never did: the community feed
shows event cards inline every few posts. That makes the card a reusable object
rather than one screen's detail view, and it is the reason the presentation and
the content are separated below.

## 2 · The shape of it

Four pieces. Three new, one extracted.

### `DealtCard` — `src/components/ui/`

The presentation, and nothing else. It owns:

- the deal-from-origin animation and its reverse
- the dim
- the flip
- the four gestures and the haptic score

It knows nothing about events. Props:

```ts
{
  front: ReactNode;
  back: ReactNode;
  // Screen rect of the element this was dealt from, as measureInWindow
  // returns it: { x, y, width, height }. null = no origin (deep link,
  // or any card after the first in a deck) — see §4 and §6.
  origin: Rect | null;
  onPass: () => void;   // swiped left
  onSave: () => void;   // swiped right
  onDismiss: () => void; // dragged down, or the dim was tapped
}
```

It lives in `ui/` because it is needed twice by construction — an event card
today, and whatever community deals later. It takes `front`/`back` as children
rather than knowing about content, which is what keeps that true.

### `EventCard` — `src/components/events/`

The card *object*. Full-bleed photo; the content on a `Glass` panel with
`tier="onPhoto"`, inset from the card's edges in the lower third. Category pill
top-left, save/share top-right.

Carries: host row, title, when · where · distance, attendee stack with
"N going · M spots", and the one primary action.

Renders at any size. The same component is the community feed's inline card and
`DealtCard`'s front face — which is what makes the deal read as a continuation
of the thing you touched rather than a swap.

**Use `Glass`, do not hand-roll the panel.** The `onPhoto` tier already carries
the Android degradation (see §7).

### `EventCardBack` — `src/components/events/`

Description, full roster, secondary actions. This is the only scrolling surface
in the design.

**Amended 2026-08-04 — the "happening near you" rail is cut.** It was built and
then removed on review of the first device run: a card you opened to decide
about *one* event should not be advertising four others underneath it. Cutting
it also removes the only horizontal scroll nested inside the back face's
vertical scroll, which was one of the sheet's Android risk rows.

### `useEventCard` — `src/hooks/`

An **extraction**, not a rewrite. The following lives in `EventBottomSheet.tsx`
today, is business logic rather than UI, and would be expensive and dangerous to
retype from memory:

- the pre-join safety queue — four sequenced popups (first join, women-only,
  new host, party/alcohol), each marking its flag seen, with the join firing
  only once the whole queue clears and cancelling if any is dismissed
- the two-step leave flow, recording a reason to `event_leave_feedback`
- the join gate matrix: `tooFar` / premium / women-only / full / pending /
  requires-approval
- the host's approve/reject rows, Mello+ ranked first
- the optimistic wishlist mutation and its rollback

`useEventParticipation` already exists and is already factored for testing
(`participationMutations` is a plain factory). This hook sits alongside it.

### State

`uiStore.selectedEventId` is replaced by:

```ts
dealtCard: {
  ids: string[];       // the deck
  index: number;       // which one is face up
  origin: Rect | null; // where it was dealt from
} | null
```

The opener supplies the deck and the origin; the card owns everything after
that. Every call site measures its own origin with `measureInWindow`.

## 3 · The motion

### Deal — 620ms, `cubic-bezier(.2, .7, .3, 1)`

| Offset | State |
| --- | --- |
| 0 | At the origin's centre, scaled to the origin's own size, −16°, opacity 0.15 |
| 0.45 | 42% of the way home, lifted 26pt above the straight line, scale 0.62, −7° |
| 0.82 | Home, scale 1.03, +1° — the overshoot |
| 1 | Settled |

The lift at the midpoint is what makes it an arc rather than a slide. The
overshoot at 0.82 is what gives it mass.

~~**The origin element scales to 0.6 and fades out as the card leaves it.**
They are the same object, so both cannot be on screen at once. It returns on
dismiss. This is not decoration — without it the motion reads as a card
appearing *near* a pin rather than as the pin opening.~~

**Amended 2026-08-04 — cut, deliberately, and not built.** The implementation
plan never carried this requirement across; the final review caught that, and
the call on reviewing it is to drop it rather than build it late. The reasoning,
recorded so nobody re-derives it:

- **It has no single home.** Nothing subscribes to `uiStore.dealtCard` except
  `EventDealtCard`, and the origin element belongs to the *opener* — a map
  marker, a rail item, a wishlist row, a friend-profile row, a notification
  banner. There are twelve of them. Any version of this is twelve edits plus a
  shared hook, and every one of the twelve is a place it can silently rot when
  a thirteenth opener is added — the same failure `DISCOVERY_FEED_KEYS` exists
  to prevent, reproduced in layout.
- **The dim already does most of the work.** §3's dim reaches 80% over
  `COLORS.ink` across the same 620ms, so by the time the card lands the origin
  element is at ~20% brightness and effectively gone. The fade this asked for
  is not absent; it is just not a separate animation.
- **The premise the paragraph rests on is weaker than it reads.** "A card
  appearing *near* a pin" is what happens when the card starts somewhere
  arbitrary. It does not: it starts at the origin's exact measured rect, at the
  origin's own scale, and grows out of it. The continuity that paragraph is
  protecting is carried by the start transform, not by hiding the element.
- **Nothing about it is verifiable without a device**, and it would be twelve
  files of unverifiable layout change in a fix wave.

The device sheet's row M1 is corrected to match — it previously asserted the
pin "fades back in", which described a feature that was never built.

If this is ever revisited, the mechanism to build is one hook reading the dealt
event's id out of the store, applied as a one-line style at each opener — not
twelve hand-rolled fades.

### Dismiss — 380ms, ease-in

The same path in reverse, accelerating away rather than easing out.

### Flip — 460ms, `rotateY`

**Implemented as an opacity cross-fade at 90°, not `backfaceVisibility`.** Each
face's opacity flips 0↔1 at exactly edge-on. `backfaceVisibility: 'hidden'` on a
3D-rotated view has a long history of Android inconsistency, and it fails
*visibly but strangely* — both faces ghosting through each other — which is the
worst kind of bug to hand to someone testing on a device you don't have.

### Dim

80%, over `COLORS.ink`, fading in across the deal. A blur is applied alongside
it and will silently do nothing on Android (§7).

### Haptics

| Moment | Feedback |
| --- | --- |
| Touch down on the origin | `Haptics.selectionAsync()` |
| The card lands (~560ms) | `Haptics.impactAsync(Medium)` |
| Flip crosses edge-on | `Haptics.impactAsync(Light)` |
| Swipe crosses threshold | `Haptics.selectionAsync()` |
| Save commits | `Haptics.notificationAsync(Success)` |

The landing thud and the edge-on click are the two that carry the whole feel.
Both fire from the animation's own progress, not from a `setTimeout`.

## 4 · Origins

The rule: **the card is dealt from whatever you touched.**

| Opened from | Origin |
| --- | --- |
| Map pin | the marker's rect |
| Community feed inline card | that card's rect |
| Home / friend profile / wishlist / swipe deck | the tapped card's rect |
| Tapped in-app notification | the banner's rect, if it is still on screen |
| Deep link, or a notification whose banner has gone | **bottom edge** — the card is flicked up from below screen and arcs in |

The bottom-edge fallback is a real motion rather than a shrug: same 620ms, same
arc and overshoot, starting off-screen below at scale 0.55 and −14°.

## 5 · Gestures

| Input | Result |
| --- | --- |
| Tap the card | Flip |
| Swipe left | Pass — next card deals in |
| Swipe right | Save — next card deals in |
| Drag down | Send it home |
| Drag up | Rubber-bands, no action |
| Tap the dim | Send it home |

Threshold is `width * 0.28`, matching `app/events/swipe.tsx` exactly, so
horizontal means the same thing on this card as on every other card in the app.

On the back face vertical is scroll; a tap returns to the front.

## 6 · The deck, and the quota trap

Swiping a card away deals the next one in behind it. The deck comes from
whatever opened it: a map pin deals the events in view (`useNearbyEvents`), the
wishlist deals your saved list, the swipe deck deals its own queue.

### The stack is visible

The deck is not a queue you can't see. **Four cards behind the top one are
rendered, thrown left and right like a hand someone actually put down**, with a
"N more behind" count under it.

| Depth | Rotation | Offset | Scale |
| --- | --- | --- | --- |
| 1 | −4° | −6.8, +5 | 0.96 |
| 2 | +5.25° | +8.8, +10 | 0.92 |
| 3 | −6.5° | −10.8, +15 | 0.88 |
| 4 | +7.75° | +12.8, +20 | 0.84 |

Anything deeper than 4 sits at depth 4's transform with opacity 0, so cards fade
in as the stack shortens rather than popping into existence.

Two things that are not decoration:

**The mess is deterministic — a fixed table, not random jitter.** A random angle
re-rolls on every re-render, so a card visibly twitches when something unrelated
updates. That reads as a rendering fault, not as charm, and it is exactly the
kind of thing nothing in the test suite would catch.

**The cards behind are dimmed to 82% brightness.** Without it the stack competes
with the card you are meant to be reading.

**Only the top card renders a real blurred `Glass` panel.** The four behind get a
flat fill at the same colour. Five stacked `BlurView`s is a genuine iOS cost for
something that is dimmed, rotated and mostly occluded — nobody can tell the
difference, and it is not worth five backdrop blurs to find out.

### What the stack settles

**The next card is already on screen, so it is never "dealt" at all.** Swiping
the top card away just promotes the one behind it — every remaining card
animates to the transform one depth shallower, over 460ms. Only the *first* card
of a session is dealt from an origin.

This replaces an earlier answer to the same problem. Without a visible stack,
card two would have had to rise from behind card one out of nothing, because its
own pin may be off screen or not on the map at all. The stack makes the question
disappear.

Dismiss still splits: the **first** card returns to its origin (the origin
element itself is not hidden or restored — see the amendment in §3).
**Once you have swiped at least once, dismiss is a plain downward exit** — there is nothing on screen that the current card came out of,
and flying back to the original pin would be a lie about which event you are
looking at.

`queryKeys.events.nearby` is **already** in `DISCOVERY_FEED_KEYS`
(`src/constants/queryKeys.ts:184`), so a deck built on `useNearbyEvents` needs
no new key and blocking will still clear it.

**`swipe()` from `useSwipeDeck` must not be wired to this by default.** It
records a permanent pass *and* consumes one of ten daily free swipes for
non-premium users (`useSwipeDeck.ts:168`). Wired naively, browsing the map
quietly eats a user's swipe quota — with no error, no type failure and nothing
in the test suite that could catch it.

So:

- **Map / feed / wishlist / profile** — right = `saveEvent` (the existing
  wishlist mutation, optimistic), left = advance only. No quota, no permanent
  pass.
- **Swipe deck** — delegates to that screen's own `swipe()`, quota and all,
  because that is the contract there.

`DealtCard` takes `onPass`/`onSave` and holds no opinion.

## 7 · Android

Three things degrade, all knowingly:

1. **The glass panel.** There is no true backdrop blur on Android; `Glass`
   falls back to `glassOnPhotoSolid`, a flat translucent fill. Face C will look
   flatter there. Accepted.
2. **The dim's blur** does nothing. It is dim-only on Android.
3. **3D `rotateY` at 60fps** over a full-bleed `expo-image` is the real
   unknown, and the reason the flip is a cross-fade rather than
   `backfaceVisibility`.
4. **Five stacked cards, each with a photo.** Five `expo-image`s mounted at
   once, four of them rotated and scaled. Mitigated by only the top card
   carrying a real blur (§6), but the image cost is unavoidable and Android is
   where it will show first.

`react-native`'s `SafeAreaView` is a no-op on Android, so anything measuring
against screen edges uses `useSafeAreaInsets`.

## 8 · What is deleted

In the same branch, after the card is proven:

- `src/components/events/EventBottomSheet.tsx` (2,216 lines)
- `src/components/events/EventSheetStack.tsx`
- `RevealingText`, `StickyPrimary`, `useEnterOnScroll`
- `@gorhom/bottom-sheet` from `package.json` — **only after verifying nothing
  else imports it.** The app's own `Sheet`/`Dialog` are `Overlay`-based, not
  gorhom, but this must be grepped rather than assumed.

All five call sites switch together. The sheet is not left running alongside
the card: two ways to open an event is the exact failure mode `AGENTS.md` opens
by warning about.

The attendee hand-off is rebuilt flip-native rather than ported — the front's
face-pile is on the front, the roster is on the back, and the turn is what moves
them between.

## 9 · Verification

`npm run typecheck` at 0, `npm test` green, `npm run lint` no new errors — none
of which can see any of the above. Reanimated 4 throws on import under Jest and
there is no screen-test coverage, so **passing checks say nothing about whether
this works.**

Testable by extraction: `useEventCard`'s safety-queue sequencing and the join
gate matrix are plain logic and get unit tests, the way `participationMutations`
did.

Everything else needs a device. A sheet goes in `docs/testing/`, ordered by
risk, with the rows that check *reasoning* rather than something observed marked
as such. The highest-risk rows:

1. Flip framerate on Android over a full-bleed photo
2. Scroll and swipe framerate with five stacked cards mounted
3. The glass panel's flat-fill degradation on Android
4. Haptic timing — whether the landing thud actually lands with the card
5. Origin measurement from a map marker while the map is mid-pan
6. That a map-dealt swipe does **not** decrement `swipesLeft`

---

## Decisions taken, and what was rejected

| Decision | Rejected alternative |
| --- | --- |
| The card is the whole detail and it flips | A first-look card handing off to the existing full-screen sheet |
| Dealt from the tapped element | Always dealt from the bottom edge — reversed after seeing both; the origin version explains itself and generalises |
| Tap flips | Drag-to-flip — collides with left/right pass/save, which already has that meaning app-wide |
| Face C, glass panel on a full-bleed photo | A: full-bleed with a gradient. B: photo over a white body — rejected as the bottom sheet in a smaller box |
| Presentation and content split | One `EventCard` that owns its own presentation — would not survive community's inline use |
| A visible, messy stack of four behind the top card | A barely-there ±1.5° hint, and a ±9° scatter that competed with the card you are reading |
| Logic extracted to a hook | Rewriting the safety queue from scratch |
