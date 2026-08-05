# Opening a chat from the map — device test sheet

Two bugs, both about what happens when a conversation is opened from a tab that
is not Inbox:

1. **The map stayed painted behind the thread.** Opening a chat from the map
   left the map visible under the conversation — shifted ~50pt left, with the
   app background showing in the strip it vacated — while the chat itself worked
   normally (you could still type and send).
2. **Back walked into the previous thread.** Back from a chat opened this way
   sometimes landed in whatever conversation had been open earlier instead of
   the Inbox list.

**What changed:**

| Area | Change |
| --- | --- |
| `app/(tabs)/_layout.tsx` | The **map** tab is now `animation: 'none'`. The other four keep `shift`. This is what makes react-navigation *detach* the map when it is blurred instead of only fading it to `opacity: 0` — see the comment on the screen for why the fade was never enough for a native map. |
| `src/utils/chatActions.ts` | `openEventChat` / `openDmChat` — **the fix.** Every one of the 17 "open chat" call sites now goes through them, and they pass `withAnchor: true`, which loads the Inbox list as the stack's anchor beneath the thread. Without it the thread was the stack's only route, there was nothing to pop back to, and back fell through to the tab navigator's history — out to the tab you came from, back into the Inbox, which still had a thread loaded. That is what walked through old chats one press at a time. |
| `app/(tabs)/chats/_layout.tsx` | Both conversation routes are `dangerouslySingular` with a constant id, so `StackRouter` reuses the open thread's route with the new params instead of pushing a second one. The stack cannot accumulate threads. |
| `app/(tabs)/profile.tsx` | The hosted-event **Chat** button pushed `/chats/event/<id>` — no such route. It went to +not-found. |
| Both conversation screens | Split into a route wrapper that renders the screen under `key={eventId}`/`key={friendId}`. A reused route keeps its key, so without this the incoming thread would render with the previous one's messages and scroll position still in state. |
| `src/hooks/useBackToInbox.ts` (new) | The header back action: `popToTop`, so one press lands on the list even when the stack legitimately holds an event chat *and* a DM. |
| `src/services/realtime.ts` (new) | `freshChannel` — a realtime channel under a name nobody else can be holding. `useDirectChat`, `useEventChat`, `useReactions` and `useNotifications` now use it, and all four tear down with `removeChannel`. This is the fix for the render error that opening a thread while the same thread was already on the stack produced ("cannot add `postgres_changes` callbacks … after `subscribe()`"). |

Run on **iOS and Android**. Section A is reasoning-checked only — the fix is
inferred from react-navigation's `activityState` interpolation, and **has not
been seen working on a device**. Section B is the same: the reset was chosen to
run after the push animation specifically so it would not disturb it, but that
timing is an argument, not an observation.

**Setup:** an account that is a participant (not host) in at least two events
with chats, one of them visible as a pin on the map, plus one DM thread.

---

## A · The map must not show through a conversation

The exact repro from the bug: cold start matters, so **force-quit the app before
A1**.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| A1 | Cold start → Map tab → tap a pin for an event you have joined → **Open chat** on the dealt card | The thread opens over the app's drifting background. No map, no pins, no coral **+**, no locate button behind the messages | Any part of the map screen visible behind the thread — this is the original bug | ☐ | ☐ |
| A2 | Same as A1, but with the thread open, scroll the messages | Background stays the app background throughout | A map appears behind the thread once the list moves | ☐ | ☐ |
| A3 | Back to the Inbox list, then to the Map tab, then open a chat again (2nd and 3rd time) | Same as A1 every time | It is clean the first time and dirty later, or the reverse | ☐ | ☐ |
| A4 | From the map, open a chat for an event you **host** (host panel → chat), and a DM from the map's dealt card if reachable | Same as A1 | Only the participant path is clean | ☐ | ☐ |

## A2 · What the map fix costs

The map no longer cross-fades. This is the deliberate trade — these rows are
checking it reads as intentional rather than broken.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| A5 | Tab to Map from Home, Community, Inbox and Profile, a few times each | The map appears at once instead of fading in. Crisp, not a flash of white/grey or a visible jump of the map's own content | A blank or grey frame before the map, or the map arriving at the wrong region and then correcting | ☐ | ☐ |
| A6 | Swipe between tabs across the map (Community → Map → Inbox by swipe) | Same as A5; the swipe still lands on the right tab | The swipe stalls at the map or skips it | ☐ | ☐ |
| A7 | Pan/zoom the map, tab away to Home, come back | The map is where you left it — same region, same pins. It is *detached* while blurred, not unmounted, so this must survive | The map resets to your location or to the fallback centre, or reloads its tiles from scratch | ☐ | ☐ |
| A8 | Start the create-event flow on the map, and with it open try to leave the tab | Unchanged from before: the bar is hidden, you cannot leave mid-flow | The flow loses its draft or the map detaches under it | ☐ | ☐ |
| A9 | Deal a card on the map, expand the deck, then open a chat from it | The card/deck is gone (it closes before navigating) and the thread is clean per A1 | A card is left floating over the conversation — it lives in a `FullWindowOverlay`, which no amount of detaching hides | ☐ | ☐ |

## B · Back always goes to the Inbox list

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
**Relaunch the app before this section.** A stack that accumulated threads before
this change stays accumulated — the router only stops it growing from here.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| B1 | Map tab → **Open chat** on a dealt card → **one** back press | The Inbox **list** | Any thread. This is the reported bug: it used to take one press per chat opened that session | ☐ | ☐ |
| B2 | Map → open chat A → Map → open chat B → Map → open chat C → back **once** | The Inbox list | Chat B, then A — the stack is still accumulating | ☐ | ☐ |
| B3 | Inbox → open thread A → **without going back**, Map tab → open chat B → back | The Inbox list. A is not underneath | Thread A | ☐ | ☐ |
| B4 | Repeat B3, then use the **iOS swipe-back gesture** / **Android hardware back** instead of the button | The Inbox list — the gesture is covered because the stack itself only ever holds one thread, not because the button was special-cased | Thread A | ☐ | – |
| B5 | Repeat B3 but reach B from a notification, from search, from a Home row, and from the profile sheet's **Message** | The Inbox list every time | Any single entry point still stacks | ☐ | ☐ |
| B6 | From event chat A, open a DM via the profile sheet, then press back | The Inbox list (one press). An event chat and a DM are the one case the stack holds two of, which is why back pops to the top rather than one screen | Event chat A | ☐ | ☐ |
| B7 | Same as B6 but with the **swipe/hardware back** | Event chat A — the honest answer for the gesture in the one two-deep case, and the row exists so it is a known result rather than a surprise | Anything else (a dead end, the Home tab) | ☐ | ☐ |
| B8 | Open a chat from a **notification tap on a cold start** → back | The Inbox list — *not* the Home tab, and not a dead end | Back does nothing, or drops you on Home | ☐ | ☐ |
| B9 | In a thread, type a draft, tab away to Map, come back to Inbox | Still in that thread, draft intact | The thread is gone | ☐ | ☐ |
| B10 | The hosted-event **Chat** button on your own Profile tab | That event's chat | "Unmatched Route" / +not-found — it used to push a route that does not exist | ☐ | ☐ |
| B11 | Anywhere back is pressed in a thread, watch Metro's console | Nothing logged | `The action 'POP_TO_TOP' was not handled by any navigator` — that means a thread was opened without its anchor, i.e. by something that still bypasses `chatActions` | ☐ | ☐ |

## B2 · What the singular route costs

Opening a thread while another is open now *reuses* that route rather than
pushing, so there is no slide between two threads — and the screen remounts on
the param change. These rows are checking the remount is clean.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| B10 | From event chat A, open event chat B (Map → dealt card, or a Home row) | B's header, messages, pinned banner and composer — all B's, immediately. No slide is expected here | A's messages under B's header, even for a moment; A's unread divider; A's draft in the composer | ☐ | ☐ |
| B11 | Same for DM → DM (open a DM, then another person's DM from the Inbox) | The second person's thread, cleanly | The first person's messages or avatar linger | ☐ | ☐ |
| B12 | Open the thread you are **already in** (from the profile sheet of the person whose DM you are in, or the same event's chat from a Home row) | Nothing happens — same thread, no flicker, no second copy | A remount that scrolls you back to the bottom, or the render error from section C | ☐ | ☐ |
| B13 | Scroll a long thread up, tab away, come back | Your scroll position is where you left it (this route is reused, not remounted, when params have not changed) | It jumps to the bottom | ☐ | ☐ |

## C · The realtime channel collision

The render error, and the reason it is in this sheet: a thread that throws during
render never runs the stack collapse, so bug 2 was partly bug 1 in disguise.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| C1 | Open a DM with X → tap X's avatar → **Message** on the profile sheet | The DM opens and shows messages | "Render Error — cannot add `postgres_changes` callbacks … after `subscribe()`" | ☐ | ☐ |
| C2 | With that DM open, reach the same DM again from the Inbox list and from a notification | Opens each time, messages intact | The same render error | ☐ | ☐ |
| C3 | Same as C1/C2 for an **event** chat (open it, then reach the same event's chat from the map or a home row) | Opens each time | The render error, or the *older* copy of the thread going dead — it used to have its channel swept out from under it | ☐ | ☐ |
| C4 | In a DM, have the other side send while you watch | The message appears **once** | Twice or more — a channel was reused and its bindings doubled | ☐ | ☐ |
| C5 | Open and close ten threads, then have someone send to one of them | One banner, one message, no slowdown | Duplicates, or the socket dropping — that would mean channels are accumulating in the registry | ☐ | ☐ |
| C6 | Send a tapback, and receive one, after opening/closing several threads | One reaction, applied once | Doubled or missing reactions | ☐ | ☐ |
| C7 | Background the app, receive a DM, foreground it | One banner, badge count right | No banner (the notifications channel did not come back) or a duplicate | ☐ | ☐ |

## D · Nothing else moved

| # | Do | Expect | iOS | Android |
| --- | --- | --- | --- | --- |
| D1 | Tab between the other four tabs | The `shift` cross-fade is still there, unchanged | ☐ | ☐ |
| D2 | Long-press the tab bar and scrub across all five tabs, releasing on the map | The bar's pickup/scrub still works; releasing on the map lands there | ☐ | ☐ |
| D3 | Unread badge on Inbox while a chat is open elsewhere | Still counts and clears as before | ☐ | ☐ |
| D4 | Presence dots (Friends, Inbox, a DM) with two devices | Still live — `usePresence` is untouched and deliberately still shares one channel, since presence needs every peer on the same topic | ☐ | ☐ |
