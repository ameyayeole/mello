# Skeleton loading states — device test sheet

Implements `docs/superpowers/specs/2026-08-04-skeleton-loading-states-design.md`.

Thirteen surfaces stopped showing a spinner (or, on three of them, a **lie**) and
now hold the shape of what is coming. Per-item stagger came off both lists; the
swap is one crossfade.

**What changed:**

| Area | Change |
| --- | --- |
| `ui/Skeleton.tsx` | `SkeletonGroup` (one shared clock for every bone under it) + `SkeletonBone`. A bone outside a group, or a device asking for reduced motion, renders static grey rather than throwing. |
| `components/skeletons/` | The six shapes. Each takes `count` and renders itself repeated. |
| `skeletonBone` / `skeletonSheen` | New in **both** palettes. Dark inverts them — a white lift, and a *dimmer* sheen, since 45% white over an 8% bone is a flash rather than a highlight. |
| 13 surfaces | Skeleton instead of `<Loader />`, or instead of nothing. |
| Motion | The community feed's 60ms-per-card stagger and the chats list's 45ms-per-row stagger are gone, with `useArrivalAnimation` and the `animate`/`index` props they fed. `LinearTransition` on chat rows **stays** — that is the re-sort glide, motion marking a change rather than an arrival. |
| `Loader.tsx` | Its "deliberately not a skeleton" comment was wrong once this landed. Replaced with the rule: an inline action spinner is a `Loader`; anything standing in for a list is a skeleton. |

**No component test is possible** — Reanimated 4 throws on import under Jest,
which is why `src/**/__tests__/` covers only utils, services and hooks. There is
no logic here to extract; it is all layout and animation. `tsc` passing says
nothing about whether this looks right, so **everything below needs eyes.**

Ordered by risk, per the spec.

---

## 1 · Android glass — the highest-risk item

The sheen is calibrated on iOS. Android has no backdrop blur, so `Glass` is a
flat fill at a much higher opacity (`glassPanelSolid` 0.86 vs `glassPanel` 0.68)
and a light band tuned against the blurred version may wash out entirely.

| # | Do | Expect | Fails if | Android |
| --- | --- | --- | --- | :-: |
| 1a | Open the **Inbox** on Android with the network throttled | The sweep is visible crossing each bone | No sweep at all — bones read as static grey. Then `skeletonSheen` needs raising for Android specifically | ☐ |
| 1b | Same in **dark** mode | Visible, and *not* a hard white flash | Either invisible or glaring | ☐ |
| 1c | The community feed and the wishlist on Android | Same | ☐ | |
| 1d | Compare a bone against the panel behind it | The bone reads as a shape, not a smudge. `skeletonBone` is 10% ink where `inkSubtle` (7%) had disappeared against glass | Bones invisible against the sheet | ☐ |

## 2 · Layout continuity — does each surface hold its height

The crossfade only reads as a swap if the bones occupy the space the content
will. A skeleton shorter or taller than its content makes the list jump. **No
test catches this**; it needs looking at, on all thirteen.

| # | Surface | Shape | Watch for | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| 2a | Inbox, Events tab | `SkeletonChatRow` | The frosted **sheet** must not appear at the swap — the skeleton renders inside the real `Glass` panel with the same inset dividers | ☐ | ☐ |
| 2b | Inbox, Direct tab | `SkeletonChatRow` | Same | ☐ | ☐ |
| 2c | Community feed | `SkeletonPostCard` | Card height vs a real post. Every third card omits the media block on purpose — a feed that always promises a photo is lying about what is coming | ☐ | ☐ |
| 2d | A post's detail screen | `SkeletonPostCard count={1}` | ☐ | ☐ | |
| 2e | A profile's posts | `SkeletonPostCard count={2}` | ☐ | ☐ | |
| 2f | Notifications | `SkeletonNotifRow` | The 46pt glyph circle lines up with the real one | ☐ | ☐ |
| 2g | Search (people and chat mode) | `SkeletonPersonRow` | ☐ | ☐ | |
| 2h | Blocked users | `SkeletonPersonRow count={4}` | ☐ | ☐ | |
| 2i | An event's attendees | `SkeletonPersonRow` | ☐ | ☐ | |
| 2j | Comment sheet | `SkeletonPersonRow count={4}` | Inside a bottom sheet — check it does not overflow the sheet's height | ☐ | ☐ |
| 2k | Profile bottom sheet | `SkeletonPersonRow count={3}` | ☐ | ☐ | |
| 2l | Wishlist | `SkeletonEventCard` | A solid card, not glass, because `WishlistCard` is solid | ☐ | ☐ |
| 2m | An event chat, and a DM | `SkeletonBubble` | Bones sit **bottom-up**, against the composer, because the threads are inverted lists. Widths alternate sides in a fixed pattern — if they differ between two opens of the same thread, someone made them random | ☐ | ☐ |

## 3 · The three lies

These were bugs, not slow spinners. Each told the user they had nothing while
the fetch was in flight.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| 3a | With **chats**, open the Inbox on a cold start / throttled network | Bones, then your chats | *"No event chats yet"* first — the branch order regressed | ☐ | ☐ |
| 3b | Same on the **Direct** tab | Bones, then your DMs | *"No direct messages yet"* | ☐ | ☐ |
| 3c | Open the profile of someone **with posts**, throttled | Bones, then the posts | *"No posts yet."* | ☐ | ☐ |
| 3d | Now check a genuinely **empty** case of each — a new account's Inbox, a profile with no posts | The empty state, and no bones lingering | Bones forever, which is the same bug wearing the fix's clothes | ☐ | ☐ |

## 4 · Reduced motion

`useReducedMotion` is inferred from Reanimated's docs, not observed.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| 4a | iOS: Settings → Accessibility → Motion → **Reduce Motion** on. Android: Settings → Accessibility → **Remove animations**. Then open any surface above | Static grey bones. No sweep, and no stutter from a loop that started and was cut off | The sweep still runs, or the bones vanish entirely | ☐ | ☐ |
| 4b | Turn it back off and reopen | The sweep is back | ☐ | ☐ | |

## 5 · Slow network, and the loop over time

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| 5a | Throttle to 3G and watch a skeleton for **10 seconds** | The sweep repeats smoothly, every bone in phase — one clock drives all of them | Bones drifting out of step with each other (that would mean the group's context is not reaching them), or the loop hitching | ☐ | ☐ |
| 5b | The Inbox with ~8 rows: 8 rows × 4 bones | Smooth. This is the case the shared clock exists for — 32 bones, one driver | Frame drops | ☐ | ☐ |
| 5c | Kill the network entirely and open a surface | The skeleton animates until the query fails. **A skeleton that never resolves is as broken as a spinner that never resolves, and more convincing** — note anywhere it can hang forever with no error state | ☐ | ☐ | |
| 5d | The crossfade itself, at normal speed | Bones fade out (150ms) as the content fades in (200ms) — one swap, not two events. Nothing staggers in afterwards | Rows arriving one at a time after the skeleton, which would mean a stagger survived | ☐ | ☐ |

## 6 · Not changed — confirm they still spin

| # | Surface | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| 6a | Saving a profile, confirming a scan, sending a message | The inline spinner, as before | ☐ | ☐ |
| 6b | `events/edit`, `events/host`, `events/checkin`, `events/scan` | The full-screen spinner — these load into layouts a skeleton cannot predict | ☐ | ☐ |
| 6c | A chat list re-sorting when a new message arrives | The row still **glides** to the top. `LinearTransition` was kept deliberately | Rows snapping into place | ☐ | ☐ |
