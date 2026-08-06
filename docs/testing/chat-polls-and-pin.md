# Polls in the event chat, and the pinned-message jump — device test sheet

**Run `supabase/migrations/073_chat_polls.sql` in the Supabase SQL editor before
section B.** Without it, sending a poll fails on the `messages_type_check`
constraint — the message never sends at all, so nothing is half-created.

**What changed:**

| Area | Change |
| --- | --- |
| Migration 073 | `message_polls` / `message_poll_options` / `message_poll_votes`, RLS by event membership, a trigger-maintained `vote_count`, and `'poll'` added to the `messages` type constraint. Its own tables rather than an extension of the community's polls (058) — see the migration's header for why: the shape is the same, the *ownership* and therefore every policy is not. |
| `chatPolls.service` + `useMessagePolls` | Fetch, vote, and live counts. Results update for everyone via `message_poll_options` on the realtime publication. |
| `PollBubble` | Full width, like a system notice — a poll is addressed to the room, not to the person opposite you. Options to tap, then bars once you have voted. |
| `PollComposer` | A sheet: question + 2–4 answers. Four is the community polls' ceiling, kept the same on purpose. |
| The composer's `+` | Was the photo picker directly; now an `OptionSheet` with Photo and Poll. |
| `PinnedMessageBanner` | The whole bar is now a button that **jumps to the message**. The unpin ✕ still wins inside it. |

The poll's question lives on the message's `content`, so every existing preview
of a message — the Inbox row, a reply quote, the pinned bar, a push notification
— shows the question with no further work. The Inbox prefixes it with "Poll:".

**Unverified, all of it.** No component test is possible here (Reanimated under
Jest), and the RLS is reasoned from the policies rather than exercised.

---

## A · The pinned message

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| A1 | As the host, long-press a message → **Pin message**. Scroll away from it | The bar under the header shows it. Tap the bar | Nothing happens on tap | ☐ | ☐ |
| A2 | Tap the pinned bar | The thread scrolls to that message and centres it | It jumps to the bottom, or nothing moves | ☐ | ☐ |
| A3 | Pin a message, then scroll far enough that it leaves the loaded page (50+ messages) | The bar is still there and readable, but **not** tappable — there is nowhere to go | It looks tappable and does nothing | ☐ | ☐ |
| A4 | Tap the **✕** on the bar | It unpins. It must not also fire the jump | Both happen, or the ✕ is hard to hit | ☐ | ☐ |
| A5 | As a non-host, tap the bar | It jumps. There is no ✕ — unpinning is the host's | A non-host can unpin | ☐ | ☐ |
| A6 | Pin an image message, and an announcement | The bar reads "📷 Photo" / the announcement's copy, and both jump | ☐ | ☐ |

## B · Sending a poll

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| B1 | Tap the **+** in the composer | A sheet with Photo and Poll. Photo still opens the picker exactly as before | The + goes straight to the picker (the menu did not land) | ☐ | ☐ |
| B2 | Poll → write a question and two answers → **Send poll** | It appears in the thread as a full-width poll card with both options | ☐ | ☐ | |
| B3 | Try to send with an empty question, or with only one answer filled | **Send poll** stays disabled | It sends a poll nobody can answer | ☐ | ☐ |
| B4 | Add options up to the fourth | **Add option** disappears at four | A fifth is possible | ☐ | ☐ |
| B4a | With the keyboard up, check the **Send poll** button and the last answer | Both reachable — the sheet lifts above the keyboard and its content scrolls inside what is left | The keyboard covers the button or the lower fields | ☐ | ☐ |
| B4b | Four answers, keyboard up, on the **smallest** device you have | The card scrolls; the title does not get pushed off the top | Anything unreachable | ☐ | ☐ |
| B4c | Tap between fields with the keyboard up | Focus moves without the sheet jumping or closing | The sheet dismisses on a tap meant for a field | ☐ | ☐ |
| B4d | Look at the sheet's edges | The title, fields, note and button are inset from both sides — `Sheet` pads only the bottom, so the content brings its own | Anything touching the screen edge | ☐ | ☐ |
| B5 | Send a poll with the network off | The bubble disappears and an alert says it was not sent — no half-made poll left in the thread | A poll card with no options, permanently | ☐ | ☐ |
| B6 | Send a poll, then watch it for a second | The card appears immediately with the question and two grey rows, then the options fill in | The question appears with nothing under it | ☐ | ☐ |

## C · Voting

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | :-: | :-: |
| C1 | Tap an option | It flips to results immediately: bars grow from zero, your pick has a check and the coral fill | A round trip's delay before anything moves | ☐ | ☐ |
| C2 | Try to vote again, or change your vote | You cannot — the card only shows results now. **A cast is final**, by design and by the absence of an UPDATE policy | Vote changing is possible | ☐ | ☐ |
| C3 | **Two devices.** Vote on one and watch the other | Counts and percentages update live, without leaving the thread | Nothing until you reopen the chat | ☐ | ☐ |
| C4 | On the second device, check whose vote shows | Only *its own* pick has the check. You must not be able to tell who voted for what — votes are readable only by their owner | Someone else's pick marked | ☐ | ☐ |
| C5 | Leave the event, then look at the chat (if reachable) | You cannot read or vote on the poll — the policies key off `is_event_attendee` | ☐ | ☐ | |
| C6 | Vote with the network off | It shows your pick, then rolls back when the insert fails | It stays as though the vote landed | ☐ | ☐ |

## D · The poll among everything else in the thread

| # | Do | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D1 | The poll card in **dark mode** | Legible: glass panel, bars visible, coral fill on your pick | ☐ | ☐ |
| D2 | Reply to a poll (swipe it right) | The quote shows the question | ☐ | ☐ |
| D3 | **Pin** a poll, then tap the bar | The bar shows the question and jumps to the poll | ☐ | ☐ |
| D4 | Long-press a poll → Copy | Copies the question | ☐ | ☐ |
| D5 | Delete a poll message (yours, or as host) | It goes, and its votes go with it (`ON DELETE CASCADE`) | ☐ | ☐ |
| D6 | The Inbox row for a chat whose last message is a poll | "Poll: <question>" | ☐ | ☐ |
| D7 | A poll in a thread you scroll fast | The card holds its height; bars do not re-animate on every re-entry | ☐ | ☐ |
| D8 | Send a poll in a chat the **host has locked** | You cannot — the composer is hidden for non-hosts, so the + is gone with it | ☐ | ☐ |
