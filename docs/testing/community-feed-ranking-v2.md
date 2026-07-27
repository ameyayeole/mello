# Community feed ranking v2 — device test sheet

Run on **iOS and Android**. Android is not optional: `minimumViewTime` behaves
differently there and `react-native`'s `SafeAreaView` is a no-op, so a whole
class of bug is invisible on iOS.

Tick each row on each platform. A row that cannot be run (no second account, no
cross-city posts) is **BLOCKED**, not passed — note it and come back.

**Setup you need before starting:**

| Need | Why |
| --- | --- |
| Two accounts, friends with each other | Sections C, D |
| A third account, not a friend, same city | D5, D6 |
| An account with **no** friends and **no** city set | D10 — the empty-feed guard |
| At least 25 posts in the pool, mixed types | Paging and diversity need volume |
| At least 3 photo posts from one author | D6 |

---

## A · Baseline — before any migration

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| A1 | Open Community, scroll to the end | Note how many posts before it stops | ☐ | ☐ |
| A2 | Note the top 5 post ids | The "before" ranking, for comparison | ☐ | ☐ |

## B · Phase 1 — scoring (migration 064)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| B1 | Vote on a poll from a second account, wait 10 min | The poll rises in the feed | ☐ | ☐ |
| B2 | Scroll the feed | No visible change otherwise — 064 is a scoring change only | ☐ | ☐ |

## C · Phase 2 — impressions (migration 065)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| C1 | Scroll slowly through 5 posts, dwelling on each | `post_impressions` gains 5 rows, `views = 1` | ☐ | ☐ |
| C2 | Flick fast past 10 posts without stopping | Those posts are **absent** — `minimumViewTime` filtered them | ☐ | ☐ |
| C3 | Scroll the same 5 posts again immediately | `views` still `1` — the 5-minute guard held | ☐ | ☐ |
| C4 | Switch tabs mid-scroll, come back | The tail flushed on blur; no rows lost | ☐ | ☐ |
| C5 | Kill the app mid-scroll | No crash, no unhandled rejection in the log | ☐ | ☐ |
| C6 | Turn on airplane mode and scroll | Feed still scrolls; no error banner, no red box | ☐ | ☐ |
| C7 | Confirm the feed order is unchanged from A2 | 065 must not affect ranking | ☐ | ☐ |

Query for C1/C3:

```sql
SELECT post_id, views, last_seen_at FROM post_impressions
WHERE user_id = '<your uid>' ORDER BY last_seen_at DESC LIMIT 20;
```

## D · Phase 3 — the snapshot (migration 066)

The main event.

### Pagination integrity

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D1 | Scroll 5+ pages, watching for repeats | **No card appears twice.** The single most likely regression | ☐ | ☐ |
| D2 | Scroll to the end, note the last post | Reaching the end does not error or hang | ☐ | ☐ |
| D3 | From another account, hide/report a post mid-scroll, then keep paging | The feed **keeps going**. A short page must not end it | ☐ | ☐ |
| D4 | Scroll down 5 pages, switch tabs, come back | Position and order preserved; no reshuffle | ☐ | ☐ |

### Ranking

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D5 | Compare the top 10 against A2 | Order has genuinely changed — friends and fresh photos higher | ☐ | ☐ |
| D6 | Scan 20 cards for runs | No two consecutive from the same author; no two consecutive photos | ☐ | ☐ |
| D7 | Have a friend post; refresh | It appears high, but a fresh engaged local post can still outrank it | ☐ | ☐ |
| D8 | Scroll past a post 3 times over 15+ minutes, then refresh | It is gone from the feed | ☐ | ☐ |

### The own-post pin

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D9 | Post something | It appears at **position 1** | ☐ | ☐ |
| D10 | Switch tabs and come back (within 5 min) | Still pinned — a focus refetch does not release it | ☐ | ☐ |
| D11 | **Pull to refresh** (within 5 min) | Pin **released**; the post drops to its organic slot | ☐ | ☐ |
| D12 | Pull to refresh again | Still unpinned. **This is the bug the release exists to prevent** | ☐ | ☐ |
| D13 | Post again | Pinned again — posting re-arms it | ☐ | ☐ |
| D14 | Post, wait 6 minutes, switch tabs and back | Unpinned by time alone, no gesture needed | ☐ | ☐ |
| D15 | Post 2 posts inside 5 min | Both pinned, newest first | ☐ | ☐ |

### Edge cases

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D16 | Sign in as the no-friends / no-city account | Feed is **not empty** | ☐ | ☐ |
| D17 | Block someone with posts in your feed, then refresh | Their posts are gone | ☐ | ☐ |
| D18 | Scroll to the bottom of tier 1 | Stops after one empty tier advance — correct until Phase 4 | ☐ | ☐ |
| D19 | Watch for a phantom "New posts ↑" pill | It only appears for genuinely new content | ☐ | ☐ |

## E · Phase 4 — the endless tail (migration 069)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| E1 | Scroll to the bottom of tier 1 | More posts load — cross-city ones you have not seen | ☐ | ☐ |
| E2 | Keep scrolling to the true end | "You're all caught up" + the events rail | ☐ | ☐ |
| E3 | Check the tail for repeats | **No post from earlier in the session reappears** | ☐ | ☐ |
| E4 | Confirm the marker is absent on an empty feed | `CommunityNudgeCard` owns that state, not the marker | ☐ | ☐ |
| E5 | Pull to refresh from the bottom | A fresh tier-1 session, scrolled to the top | ☐ | ☐ |

---

## Sign-off

| | iOS | Android |
| --- | --- | --- |
| Device / OS version | | |
| Build | | |
| Date | | |
| Tester | | |
| Blocked rows | | |
