# Replies, opening position and the keyboard — device test sheet

Three changes to both threads (event chat and DM), from one report: a chat opened
part-way up itself, there was no way to reply to a specific message, and the
keyboard could not be swiped away.

**Run `supabase/migrations/072_message_replies.sql` in the Supabase SQL editor
before any of section B.** Without it every reply fails to send — the insert
carries columns the table does not have — and the bubble shows "Not sent · tap to
retry". Nothing else in this sheet depends on it.

**What changed:**

| Area | Change |
| --- | --- |
| Both lists are now `inverted` | The newest message is index 0 and offset 0 *is* the bottom, so a thread opens at the last message because that is where a list starts. No scroll on open, nothing to animate. This is what WhatsApp, Telegram and Instagram all do, and it replaced three attempts at scrolling to the bottom after the fact. |
| `useChatScroll` | Reduced to almost nothing: it reverses `messages` for the list and offers `scrollToLatest` / `scrollToMessage`. The initial scroll-to-end, the "follow new messages only if you were at the bottom" bookkeeping and the keyboard re-pin are all gone — inverted makes each of them structural rather than something to manage. The open-at-first-unread behaviour is gone too; see the comment for what it would need to come back. |
| Inverted's three traps | Each cell carries `scaleY: -1`, which silently flips vertical *directions* inside it. So: `MessageBubble` takes an `inverted` prop (the send entrance came in from above without it), the announcement card's entrance became `FadeInUp`, the DM's `ListEmptyComponent` is counter-flipped, and `keyboardDismissMode` dropped from iOS's `interactive` to `on-drag` because interactive dismissal followed the drag the wrong way. `removeClippedSubviews` is now iOS-only — inverted + Android clipping is the long-standing blank-row bug. |
| `MessageBubble` | Owns swipe-right-to-reply (rightward drags only) and renders the quote block. The thread's time-reveal drag is now leftward-only, which is the whole of the arbitration between the two. |
| `ReplyQuote`, `ReplyComposerBar` | New. The quote inside a bubble, and the "Replying to X" bar above the composer. |
| Both threads | Reply state, a **Reply** row at the top of the long-press sheet, tap-a-quote-to-jump, and `keyboardDismissMode`. |
| Migration 072 | `reply_to_id` + a snapshot of the quoted text and author on both message tables. |

Run on **iOS and Android**. The gesture rows are the ones worth someone's time:
three horizontal gestures now share this screen (reply right, times left, and the
list's own vertical scroll) and only the direction thresholds keep them apart.

---

## A · Where a thread opens

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| A1 | Open a chat with a long history (**50+ messages**) | The last message, at the bottom, on the first frame. **No movement at all** — not a jump, not a crawl, not a settle | Any visible scrolling on open | ☐ | ☐ |
| A1a | Same, on the slowest device you have, several times | Identical. There is no timing involved any more, so a slow device should differ only in how fast the rows paint | Movement on open, or an empty gap that fills in | ☐ | ☐ |
| A1b | Open a chat, then tap the composer to raise the keyboard | The last message stays put above the keyboard | The keyboard covers the newest messages | ☐ | ☐ |
| A1c | Scroll up 20 messages, then raise the keyboard | You stay where you were | It jumps to the end | ☐ | ☐ |
| A2 | Open a chat with 10+ unread messages | Still the bottom | It lands on the first unread (the old behaviour) | ☐ | ☐ |
| A3 | Open a chat with **two** messages in it | Both sit at the *bottom*, just above the composer — not floating at the top of an empty screen | Messages pinned to the top | ☐ | ☐ |
| A3a | Open a brand-new DM with no messages | The "Say hi" empty state, the right way up | Upside-down text or a mirrored avatar — the counter-flip on `ListEmptyComponent` is missing | ☐ | ☐ |
| A4 | Scroll up 20 messages, stay there, have someone send | You do not move a pixel. An insert at index 0 is below your viewport now, so this is structural rather than a guard that can fail | The thread jumps | ☐ | ☐ |
| A5 | At the bottom, have someone send | The message appears at the bottom and the thread stays with it | It does not appear until you scroll | ☐ | ☐ |
| A6 | Scroll up into history, then **send** a message | It brings you back down to your own message | You are left in the history with no idea it sent | ☐ | ☐ |
| A7 | Scroll all the way up through a long thread and back down, twice | Rows paint normally throughout — no blank bubbles, no gaps | Blank rows (this is what `removeClippedSubviews` being iOS-only guards against) | ☐ | ☐ |
| A8 | Send a message and watch its entrance | It rises **from behind the composer**, as before | It drops in from above — `inverted` is not reaching `MessageBubble` | ☐ | ☐ |
| A9 | Have a host post an announcement while you watch (or send one) | The card rises into place | It drops from above | ☐ | – |
| A10 | Check the time dividers and the message grouping in a long thread | Unchanged: dividers above the first message of a new time block, runs still tucked together, avatar on the last of a run | Dividers under their messages, or grouping that looks inside-out — the neighbour lookup is reversed | ☐ | ☐ |

## B · Swipe right to reply

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| B1 | Swipe a received message right, past about a thumb's width, and let go | The row slides with your finger, a reply arrow fades in to its left, one light haptic as it arms, and the composer shows "Replying to <name>" with the keyboard up | Nothing happens (the row is claimed by the wrong gesture), or it replies without the haptic | ☐ | ☐ |
| B2 | Swipe one of **your own** messages right | Same, and the bar reads "Replying to You" | Your name instead of "You" | ☐ | ☐ |
| B3 | Swipe right only a little (under the trigger) and let go | The row springs back, no reply, no haptic | It replies anyway | ☐ | ☐ |
| B4 | Swipe past the trigger, then drag **back** under it and let go | No reply. The haptic fires again if you cross out and back in | It replies from a cancelled drag | ☐ | ☐ |
| B5 | Send the reply | The quote sits above your text in the bubble, ink-tinted; the "Replying to" bar disappears | The quote is missing, unreadable on the ink bubble, or the bar stays | ☐ | ☐ |
| B5a | Reply to a **long** message (a full paragraph) | The quote shows exactly **three lines** and ends in "…" at the end of the third line. The coral spine runs the full height of the quote, corner to corner | Two lines; a "…" mid-line or in the middle of the block; a quote that just stops with no ellipsis; a spine with gaps at the top or bottom | ☐ | ☐ |
| B5d | Reply to a long message with a **one-word** reply ("Okay") | The bubble is as wide as the quote needs — the quote is *not* squeezed into the width of the word "Okay". This is the exact failure `flex: 1` caused: a zero flex-basis contributes nothing to the bubble's own measurement, so the quote wrapped one word per line | A tall narrow column of single words | ☐ | ☐ |
| B5e | Reply to a **short** message with a long reply | The bubble is as wide as the reply; the quote's tinted block still spans that full width rather than stopping at its text | The quote block only as wide as its own words, floating in a wide bubble | ☐ | ☐ |
| B5b | Reply to a message of one or two lines | No ellipsis at all, and the block is only as tall as the text | A stray "…" on a message that fits | ☐ | ☐ |
| B5c | Turn the system font size up (Settings → Display → Text Size) and look at B5a again | Still three lines, still ending in "…" — the clamp is on rendered lines, not on a character count | Four lines, clipped text, or the ellipsis disappearing | ☐ | ☐ |
| B6 | Have the other side reply to one of your messages | Their reply arrives **with** the quote already rendered — no blank quote that fills in later. This is the whole reason the quote is stored on the row | An empty quote block until you leave and come back | ☐ | ☐ |
| B7 | Tap the quote on a reply whose original is still in the thread | It scrolls to the original, centred | Nothing, or it jumps to the bottom | ☐ | ☐ |
| B8 | Reply to a photo | The quote reads "[photo]", not a URL | A URL, or the quote is unreadable over the image | ☐ | ☐ |
| B9 | Attach a photo *while* a reply is pending | Decide what you expect and note it: the photo currently sends **without** the quote (only the text composer carries the reply). If that reads wrong, that is a finding, not a bug you have to fix here | — | ☐ | ☐ |
| B10 | Reply, then cancel with the ✕ | The bar goes, the draft text stays, the next message sends unquoted | The draft is cleared, or the reply is still attached | ☐ | ☐ |
| B11 | Long-press a message → **Reply** | Same as the swipe. The row is first in the sheet and says "Or swipe the message right" | Missing on messages you can reply to | ☐ | ☐ |
| B12 | Reply with the network off | The bubble shows "Not sent · tap to retry"; tapping retry re-sends it **with the quote intact** | The retry sends the text without the quote | ☐ | ☐ |
| B13 | Delete the message a reply quotes, then look at the reply | The reply and its quote are still readable; tapping the quote no longer jumps | The reply disappears, or the quote goes blank | ☐ | ☐ |
| B14 | Reply in an **event chat** to someone, then check the same in a **DM** | Both work. In a DM the quoted name is the friend's, never "Them" | "Them" in a DM quote | ☐ | ☐ |
| B15 | Swipe right on a *sending* message (send with a slow connection and try immediately) | It does not swipe — there is no server row yet for a reply to point at | It offers a reply | ☐ | ☐ |

## C · The three gestures sharing this screen

The rows most likely to fail, and the reason for section C existing at all.

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| C1 | Drag the thread **left** anywhere | The timestamps still slide in from the right gutter, whole column together, and spring back | The reveal is dead (the reply gesture claimed the drag), or it now also moves on rightward drags | ☐ | ☐ |
| C2 | Scroll the list fast, vertically, with slightly slanted swipes | Scrolls normally. No row creeps sideways, no accidental replies | A reply fires from a scroll | ☐ | ☐ |
| C3 | Long-press a message | The tapback bar still opens over the bubble, correctly positioned | The long-press is eaten by the pan, or the anchor is off by the swipe offset | ☐ | ☐ |
| C4 | Tap a mention, an avatar, and a photo | All still work | Any of them is swallowed | ☐ | ☐ |
| C5 | Swipe right **on the very edge** of the screen (iOS back-swipe zone) | The system back gesture wins there and leaves the thread — do not fight it. Away from the edge, the reply wins | A reply fires *and* the screen pops | ☐ | – |
| C6 | Reply-swipe a row, then immediately scroll | The row returns to place; nothing is left offset | A row stays pushed right (the finalize did not run) | ☐ | ☐ |

## D · The keyboard

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| D1 | With the keyboard up, drag the thread **down** | The keyboard dismisses as the drag starts, both platforms | Nothing happens, or it dismisses on an *upward* drag instead — that is iOS's `interactive` mode reading the inverted list backwards, which is why both platforms are on `on-drag` | ☐ | ☐ |
| D2 | With the keyboard up, tap a bubble / a mention / the quote on a reply | The tap lands *and* the keyboard behaves. The tap is not eaten by the dismiss | The first tap only dismisses | ☐ | ☐ |
| D3 | With the keyboard up, type a long message | The composer grows, the thread stays above it, no gap opens under the input | A gap between the keyboard and the composer | ☐ | ☐ |
| D4 | Keyboard up, then swipe it down, then send | Sends normally; the composer keeps its bottom inset with the keyboard down | The composer sits on the home indicator | ☐ | ☐ |
| D5 | Start a reply with the keyboard **down** | The keyboard comes up with the cursor in the composer | You have to tap the input yourself | ☐ | ☐ |
