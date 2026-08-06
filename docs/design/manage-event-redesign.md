# Manage event — redesign brief

**Screen:** `app/events/host/[eventId].tsx` (703 lines)
**Visual spec:** [`manage-event-redesign.html`](./manage-event-redesign.html) — open it in a
browser. It is self-contained (fonts inlined, no network), has before/after phone frames at
1px-per-point, a Live/Ended toggle, and the exact tokens for every surface.
**Device sheet:** [`../testing/manage-event-redesign.md`](../testing/manage-event-redesign.md)

Read `AGENTS.md` and `DESIGN.md` first. Nothing here overrides them.

---

## What this is

The host panel is the last screen still built in the old language: a 160pt photo thumbnail
inside a white card, under two promo cards ringed in different saturated colours. The
redesign gives the event its photo **full-bleed at screen-width square** and drops the whole
page onto it as **one smoked-glass sheet**.

It is not a new pattern. It is `app/(tabs)/profile.tsx`'s photo-and-sheet structure, ported —
same tree, same three animated styles, same five constants. §04 of the HTML spec has the
transcribed JSX and a table of what each constant defends against.

**Scope: reskin and reorder.** No new routes, no service changes, no new queries. Two
exceptions, both called out below.

---

## Decisions needed before some of this can land

| # | Question | Blocks |
| --- | --- | --- |
| D1 | **Expired requests.** A pending request on an ended event currently renders a live **Approve**. The spec collapses it to a muted, non-actionable "N requests expired". UI-only, no service change — but it changes what the screen *does*. Yes/no? | Commit 6, partially |
| D2 | **Chat tile has no unread source.** `queryKeys` has `unreadDms` / `unreadDmCounts` — both DM-only. There is no per-event-thread unread count, so the chat tile can never badge. Add one, or ship with only two of three tiles able to dot? | The dot on that tile only |
| D3 | **"Open event chat" loses its full-width button** and becomes one of three tiles, leaving the live screen with no full-width CTA. Deliberate — a host makes no single decision on this page. Disagree and it goes back. | Commit 3 |
| D4 | **Attributable event feedback.** Out of scope here. `get_event_feedback` returns `{ upCount, downCount, notes: string[] }` with no author, and the UI tells people it is anonymous. Making individual votes attributable needs a schema change plus a cutover where existing submissions stay anonymous. Separate piece of work. | Nothing in this brief |

---

## Commit order

Six commits, in this order. **Do not merge a refactor with a redesign** — if one commit
changes both structure and appearance, nobody can tell which caused a regression and it
cannot be bisected.

### 1 — Fix the dark-mode bug

`ParticipantRow.tsx:242`, `backgroundColor: '#F0F1F3'` is a literal inside a `themedStyles`
factory: the chip stays near-white on the dark palette while its glyph stays ink. Affects
message and overflow on every attendee row, on two screens.

Ship this on its own. It is a bug fix, it is revertible, and it does not need any of the
rest of this.

While here, the other literals in these three files:

| Location | Today | Becomes |
| --- | --- | --- |
| `host:551` | `rgba(31,164,99,0.10)` | `COLORS.successTint` |
| `host:468`, `host:488` | `rgba(255,94,91,0.25 / 0.28)` — `#FF5E5B`, the **retired** coral | `COLORS.primary` is `#F95B5B`. Borders are removed entirely in commit 3; use the token until then. |
| `host:680` | `rgba(201,147,10,0.35)` | Removed in commit 5 |
| `host:232`, `ParticipantRow:237`, `BoostCard:314` | `'#fff'` | `COLORS.white` |
| `BoostCard:416` | `rgba(255,106,43,0.18)` | Derive from `BOOST_ACCENT` |
| `BoostCard:327` | `shadowColor: '#000'` | `COLORS.ink` — blue-black, never neutral |

### 2 — Port the hero and the sheet

The structural commit. **Content stays as it is** — same sections, same order, same
components — but they now sit inside the sheet on the on-dark ramp. Reordering happens in
commit 3, so this one can be reviewed as "did the port work".

Copy the tree from `app/(tabs)/profile.tsx:376–470` and the styles at `:855–890`. §04 of the
HTML spec has it transcribed with annotations.

**Constants** — only `HERO_RATIO` changes:

```ts
const HERO_RATIO      = 1;    // profile is 1.25. DESIGN.md §7: "a screen-width square"
const SHEET_RADIUS    = 32;
const PARALLAX        = 0.5;
const PHOTO_BLEED     = 250;
const SHEET_UNDERHANG = 500;
const KEN_BURNS_SCALE = 1.07;
const KEN_BURNS_MS    = 24000;
```

**Three animated styles, and they cannot be merged:**

- `photoStyle` — `y < 0` → `scale(1 - y / photoHeight)`; `y >= 0` → `translateY(y * PARALLAX)`.
  Two branches, one job: the photo's bottom edge never parts from the sheet.
- `kenStyle` — its own layer *inside* the parallax one. The two motions have different
  origins (parallax scales from the bottom to stay welded; Ken Burns from the centre so it
  creeps). One combined transform breaks both.
- `frostStyle` — `translateY(scrollY - photoHeight + SHEET_RADIUS)`. The frost lives inside
  the sheet and the sheet scrolls, so it is counter-translated by the sheet's own offset.
  Real glass does not drag its reflection along with it.

**Six deltas from profile:**

1. `HERO_RATIO = 1`.
2. **The caption is a sibling of `photoInner`, anchored to the window's bottom — not a
   child.** Profile's name lives in the sheet; an event's title belongs to the image. As a
   child it inherits the pull-down `scale` and the title balloons on overscroll.
3. Fallback is the category tint + `ActivityGlyph`, at **16:9 not 1:1** — a square of flat
   colour is a lot of nothing. Drop Ken Burns and parallax there; motion on a flat field is
   visibly fake.
4. **Do not copy profile's `backdrop={photo ? … : undefined}`.** Profile can drop the
   backdrop because its fallback fills the hero. On an event the 16:9 fallback leaves the
   sheet doing a real backdrop-blur and printing an edge where the field stops — the exact
   failure DESIGN.md §3 records. Pass a plain `<View>` of the category tint instead.
5. Bottom inset is `insets.bottom`, not `tabBarInset` — this route is outside the tab
   navigator. `<Screen edges={['top']}>` must not also inset the bottom or it pads twice.
6. Leave the hero inert. Profile's window is a `Pressable` opening a photo viewer; a
   lightbox is a new surface and this is a reskin. Keep it a plain `<View>`.

**Two rules that fail silently:**

- **The photo must stay inside the scroller.** Pinning it looks identical at rest and wrong
  the instant you scroll — the sheet slides across an image that never moved.
- **`transformOrigin: 'bottom'` on `photoInner` is load-bearing.** Without it the pull-down
  scales from centre, the bottom edge lifts off the sheet, and a hairline of what is behind
  shows through — only while dragging.

**This also deletes a blocker.** `<AppBackground>` is mounted in `app/(tabs)/_layout.tsx:504`
and once in `app/profile/settings.tsx`. This route is outside the tabs tree, so its floor is
a flat `#F2F2F4` — an ordinary `<Glass>` panel here would blur flat grey and read as a white
box. A `backdrop` pane composites its own blurred copy, so what sits behind stops mattering:
no third `<AppBackground>`, and no Android blur problem, because an image blur needs no
platform support.

**On-dark ramp inside the sheet.** `white` → `textOnDark` → `textOnDarkMuted`, on
`fillOnDark` / `fillOnDarkStrong` with `borderOnDark`. The ink ramp never appears on this
surface. **Cards nested in the sheet are a translucent white lift, not a second `<Glass>`** —
a blur inside a blur is a native blur view per row and reads as mud.

### 3 — Reorder, pulse strip, action tiles

New order: hero → pulse strip → action tiles → **requests** → attendees → wishlist. Requests
move from fourth to third, above the promos. The order is urgency, not feature.

- **Pulse strip** — one lift, three stats: going / requests / wishlisted. Replaces four
  scattered copies of the same numbers (the going-pill, the `Wishlisted · N` header, and the
  stats row inside `BoostCard`'s boosted state). **The requests figure goes coral above
  zero** and stays white at zero. That is the whole attention mechanism.
- **Action tiles** — three equal lifts replacing two ringed promos and the black button.
  Identical surface, only the glyph is coloured. **No sub-labels** (`QR`, `2 left`, `6 in`
  are gone); state is a dot on the glyph well. Boosted is carried by the well going solid
  `BOOST_ACCENT` with a white flame, because a dot cannot say "23h left".
- **The dot is `COLORS.primary`, not `COLORS.error`.** `#EF4444` next to `#F95B5B` reads as
  two rival reds, and this marks "something here", not "something wrong".
- The boost pitch copy moves into the sheet `BoostCard` already opens. The tile is a door;
  the sell belongs where the purchase is. `BoostCard`'s modal is otherwise untouched.
- Delete the bespoke `emptyCard` / `emptyText`; use `<EmptyState>` from `ui/`.
- "See all" becomes a `PressableScale` with `accessibilityRole="button"`. Today it is a bare
  `<Text onPress>` with no hit-slop and no pressed state.

### 4 — People rows

`ParticipantRow` gains `surface?: 'card' | 'row'`. **Add the prop, do not fork the
component** — the attendees screen keeps `'card'`.

- `'row'` renders transparent inside one lift, with 1pt `borderOnDark` dividers between rows
  and none at the ends. Six attendees means one surface, not six.
- **Attendee rows gain add-friend**: *avatar · name · add-friend · DM · ⋯*.
  `sendFriendRequest()` already exists in `friends.service.ts`; glyph is `userPlus`, swapping
  to a muted `check` once sent. **Use `getRelationship()`** — the glyph must already know
  friend / pending / none or it will offer to add someone you added last week.
- Request rows keep Approve / ✕ only. You connect with people after you have let them in.
- Three glyphs is the ceiling. At 375pt the row is 335 wide; 38 avatar + three ~26pt targets
  leaves ~190pt for the name. A fourth does not fit — anything else goes in the `⋯` menu.
- All row actions are bare glyphs with hit-slop (≥44pt), not chips.

### 5 — Wishlist

Locked, the section is **the same row stack as requests and attendees, frosted over**, with
the crown and a `Mello+` pill centred on the frost. Unlocked, the frost lifts and it is real
rows — not today's chip cloud. One row treatment across all three people-sections.

**The rows behind the frost must be placeholders.** `getEventSavers` is
`enabled: isHost && premium` — a free host never receives the list, and that is correct, not
a limitation to work around. A blur is a visual effect, not a security boundary: fetch the
names to blur them and they sit in the response, the query cache and the component tree.
**Do not enable that query for non-premium hosts.** Skeleton rows driven by `saversCount`
give the real count with no real identities.

One blur pane over the stack, not one per row. Android falls back to a flat fill, which is
fine — the job is to obscure, and what it obscures is placeholder.

Gold survives as the crown on `PREMIUM_GOLD_TINT_ON_DARK` (already exists, currently unused
here) and the pill. The `rgba(201,147,10,0.35)` ring goes.

### 6 — Ended state

Gated by `hasWrapped(event)`, which already exists.

- Header title → **"After the event"** (the same swap `celebrate=1` already does).
- Hero unchanged; eyebrow flips to `Ended · <date>`, the coral pulse dot goes
  `textOnDarkMuted`. **No desaturation** — that would be a new effect.
- **Position 1:** 👍 / 👎 / 🔁 stats + the coral **"Open the event wrap"** CTA. Replaces the
  pulse strip; live counts are history. **"want it again" → "Rewind"**.
- **Position 2:** chat as one full-width lift. Check-in and boost are meaningless post-event.
- **Position 3: "Notes for you" — a carousel**, one note per slide, sender's face and name
  attached, with a pager. This is `wrap_notes`, which already exists:
  `getReceivedNotes(userId)` (`wrap.service.ts:149`) returns `WrapNote[]` carrying
  `sender?: Profile`. Authored data by construction — no schema change, no anonymity to
  break.
  - Filter to `event_id`. `getReceivedNotes` returns every event's notes, so **add a
    per-event variant** rather than over-fetching.
  - Reading a slide should call `markNoteOpened(id)` once — not on every re-render — or the
    note stays "new" forever in the wrap.
  - `photo_url` is nullable. The slide height must not jump between a note with one and a
    note without as you swipe.
  - Section absent when the host received none.
- Wishlist section drops entirely — dead information after the fact.
- **D1:** requests collapse to a muted, non-actionable "N requests expired".

---

## Do not touch

- **Services and queries.** Every `useQuery`, key and invalidation stays exactly as it is.
  Cache bugs fail silently — no type error, no crash, just a count that stops moving.
- **The boost sheet.** Credits, packs, purchase flow. Only `BoostCard`'s collapsed row
  becomes a tile.
- **Routes.** edit, checkin, attendees, wrap, premium, friends — same paths, same params.
- **Section names.** "Attendees" stays "Attendees" — the linked screen's tabs are keyed
  `attendees` / `requests` and a rename would drift them apart.
- **New host actions.** No share, no cancel-event, no invite. `shareEvent()` exists and is
  used by the created screen; adding it here is a follow-up, not part of this.

## Verify

```sh
npm run typecheck   # must stay at 0
npm test            # must stay green
npm run lint        # 0 errors / 65 warnings are pre-existing; don't add
```

`tsc` passing does not mean the UI is right — there is no snapshot or screen coverage. Work
the device sheet, **Android included**. Sections A and E are the ones checking reasoning
rather than something already observed; those are the ones worth the time.
