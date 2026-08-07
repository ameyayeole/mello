# The wrap — start here

**Everything needed to build the post-event wrap.** If you are an agent picking
this up cold, read this file, then the spec, then the plan for the phase you are
on. Nothing else in `docs/superpowers/` is about this work.

---

## Read this first: the wrap already exists

**5,532 lines of it ship today.** A previous design session was written on the
premise that the feature barely existed, proposed components that were already
there under different names, and reported three surfaces as missing that were
not. Everything below is the correction.

Before you build **anything** here:

- **Grep for it.** `RateCard` was proposed as a new `UpForItCard`. `DealtCard`
  was proposed as a new `WrapPromptCard`. Both already existed.
- **Read `src/components/ui/` first.** `AGENTS.md` records that 31 screens
  hand-rolled a header and 97 ad-hoc button styles existed because forking was
  cheaper than fixing. Do not add to that.
- **Never accept "we don't have X" without finding X.**

| Already ships | Where |
| --- | --- |
| Wrap hub + 7 sub-screens | `app/events/wrap/` |
| Swipe rating deck (pan, fling, stamps, undo, notes) | `app/events/wrap/rate/[eventId].tsx` |
| Post-event sheet | `src/components/wrap/WrapSheet.tsx` |
| Chat banner | `app/(tabs)/chats/[eventId].tsx:725` |
| Home entry card | `src/components/wrap/WrapEntryCard.tsx` |
| Share to community, end to end | `ShareWrapSheet` → `SharedWrapCard` → `PostCard` |
| Dealt-card primitive | `src/components/ui/DealtCard.tsx` |
| Solar icon set | `Icon.tsx` → `react-native-solar-icons` |
| Lottie | `lottie-react-native`, `assets/lottie/celebration.json` |
| Seen-once flags | `src/services/seenFlags.ts` |

---

## What is being built

The wrap changes from a **private checklist** into a **group artifact**:

1. The recap unlocks when **enough of the group** contributes — not when you
   finish your own steps.
2. The four scattered wrap routes become **one flow** ending in a single
   `wrap_contributions` row.
3. A **dealt card** at launch becomes the one post-event takeover; the chat's
   auto-opening sheet is retired.

**Tone:** playful and energetic. Lottie character animation is the hero.

---

## The documents

| Read | For |
| --- | --- |
| **[spec](specs/2026-08-07-wrap-social-gate-design.md)** | the design and every *why*. Read before any plan. |
| [Lottie manifest](specs/2026-08-07-wrap-lottie-manifest.md) | the 7 motion assets, 2 blocking |
| [Phase 1 plan](plans/2026-08-07-wrap-social-gate-phase-1.md) | the gate — migrations, RPC, unlock rule |
| [Phase 2a plan](plans/2026-08-07-wrap-social-gate-phase-2a.md) | the flow shell + the marker write |
| [Phase 2b plan](plans/2026-08-07-wrap-social-gate-phase-2b.md) | carousel, note-on-card, reasons, hold |
| [Phase 3 plan](plans/2026-08-07-wrap-social-gate-phase-3.md) | launch card, chat pin, Home |

**Order is not optional.** Phase 1 builds the gate; **2a is what makes it
useful** — until the marker row is written, no wrap ever opens except by
force-unlock. 2b and 3 are independent of each other but both need 2a.

```
Phase 1 ──▶ Phase 2a ──┬──▶ Phase 2b
  gate       the flow   └──▶ Phase 3
```

---

## The five decisions most likely to get quietly undone

Each of these looks like arbitrary friction from inside the code. Each has a
reason, and the reason is in the spec.

1. **The 48-hour escape hatch is not optional.** Without it, a 3-person event
   where the other two never reopen the app locks the recap *permanently* for
   the one person who did everything. Spec §4.3.

2. **48h is the *unlock* clock, not the contribution window.** `wrap_window_open`
   gates **seven** RLS policies and stays at 7 days. Dropping it to 48h closes
   photos, ratings, notes, votes and encore on day three. Spec §4.3.

3. **Thumbs-down reasons stay optional.** The flow is mandatory to unlock the
   wrap. If a 👎 costs a required modal while a 👍 costs nothing, you have priced
   honesty and people will thumbs-up everyone to get through — cleaner-looking
   data that is less true. Spec §6.

4. **Skip only above 15 people, for the same reason.** A long deck in front of a
   gate gets rushed, and a rushed rating is worse than a skipped one because it
   looks like signal. Spec §5.3.

5. **The threshold `N` lives in SQL only.** If the client also computed it, two
   app versions could disagree about whether a wrap is unlocked. Spec §4.2.

---

## Two things that are not private, whatever the copy says

Both of these were written as "private" in an earlier draft and were **wrong**.
Check the RLS before writing copy that promises privacy.

- **Rewind/encore is public.** `encore_requests_select` is
  `USING (is_event_attendee(...))` — every attendee can read the table, `user_id`
  included, and the hub already shows the tally. The count is the point.
- **A safety thumbs-down files a real report.** Once reasons are collected,
  "thumbs down stay between you and no one" is false and must be rewritten.

**Copy that promises privacy the schema does not provide is worse than no copy.**

---

## Verifying

```sh
npm run typecheck   # must stay at 0
npm test            # must stay green
npm run lint        # 0 errors / 65 warnings pre-existing — don't add
```

**There is no component or screen test coverage** — Reanimated 4 throws on
import under Jest — so **`tsc` passing does not mean the UI is right.** That is
why every phase extracts its rules into pure functions (`wrapGate.ts`,
`wrapRating.ts`, `wrapDeal.ts`, `wrapFlowStore.ts`) and why every phase ends
with a device sheet in `docs/testing/`.

**Test on Android specifically.** `SafeAreaView` is a no-op there, there is no
true backdrop blur so `Glass` falls back to a flat fill, and that whole class of
bug is invisible on iOS.

---

## Still outstanding, and not the implementer's to decide

- **The brand logo has not been delivered.** `MelloLogo` stands in on the launch
  card. **Lottie L1 is blocked on it** — it animates over that mark.
- **Which Home treatment survives** (§7.3). Both get built and compared on a
  device; the loser is deleted before merge. If both are still in the tree at
  review, Phase 3 Task 5 is not finished.
