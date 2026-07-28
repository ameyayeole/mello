# Community — Final polish pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close out the Community feature (all 7 build phases done) with the
deferred polish: the **"New posts ↑" pill**, **Send-to-a-Mello-DM** sharing, a
**copy/text sweep**, the **Phase-1 parked cleanup**, and consolidating **all
testing into one doc**.

**Architecture:** No schema changes — this is all client + docs. Send-to-DM reuses
`sendDirectMessage` (dm.service) + `useFriends`; the pill uses a FlatList ref +
`useFocusEffect` refetch; cleanup deletes two verified-orphan files.

**Tech Stack:** React Native, TanStack Query v5, expo-router, expo-haptics.

## Global Constraints
- Never hardcode a colour/font/radius — `COLORS` / `FONTS` / `TYPE_SIZE` / `RADIUS` / `SPACING`.
- Reuse, don't fork: `Sheet` / `Avatar` / `PressableScale` / `Button`,
  `sendDirectMessage`, `useFriends`, `sharePost`, `useCommunityFeed`.
- **Measured facts** (grepped): `ExploreEventCard.tsx` + `useExploreWraps.ts` have
  **zero importers** → safe to delete. `app/(tabs)/community.tsx` has **no**
  hardcoded colour literals → the "3 hardcoded colours" parked item is already
  resolved; do not invent a fix.
- Keep the copy sweep **conservative** — only change genuinely inconsistent or
  weak strings; list every change. Don't mass-rewrite working microcopy.

---

### Task 1: One testing doc — merge strays into community-manual-qa.md

**Files:**
- Modify: `docs/superpowers/tests/community-manual-qa.md`
- Delete: `docs/superpowers/tests/2026-07-25-community-phase-1-test-plan.md`
- Delete: `docs/superpowers/tests/2026-07-25-community-phase-2a-test-plan.md`

The two stray docs are **automated** (jest) test plans for phases already shipped
and covered by real tests; `community-manual-qa.md` is the running device/DB
checklist spanning all phases. Consolidate to one.

- [ ] **Step 1:** Read both stray docs. Anything in them that is a **device/DB
  check not already** in `community-manual-qa.md`'s Phase 1 / 2a sections → append
  under those sections. (Most of it is jest-spec description already implemented;
  don't copy that — only genuine manual checks.)
- [ ] **Step 2:** Add a short note under the manual-QA title: "This is the single
  testing doc for Community — device + DB checks for all phases. Automated
  coverage lives in jest (`src/**/__tests__`)."
- [ ] **Step 3:** `git rm` both stray docs.
- [ ] **Step 4:** Commit (`docs(community): consolidate testing into community-manual-qa`).

---

### Task 2: Phase-1 parked cleanup — remove orphans

**Files:**
- Delete: `src/components/ExploreEventCard.tsx`
- Delete: `src/hooks/useExploreWraps.ts`

**Interfaces:** none — both are verified orphans (no importers).

- [ ] **Step 1:** Re-verify zero importers right before deleting:
  `grep -rn "ExploreEventCard\|useExploreWraps" src app | grep -v "ExploreEventCard.tsx\|useExploreWraps.ts"`
  → must be empty. If anything shows up, STOP and reassess.
- [ ] **Step 2:** `git rm` both files.
- [ ] **Step 3:** `npm run typecheck` → 0 (proves nothing referenced them);
  `npx jest --forceExit` → green. Commit
  (`chore(community): remove orphaned ExploreEventCard + useExploreWraps`).

---

### Task 3: "New posts ↑" pill

**Files:**
- Modify: `app/(tabs)/community.tsx`

**Interfaces:** none exported.

Behaviour (spec §6): on focus/refetch, if the top-of-feed post changed while the
user is scrolled down, a floating **"New posts ↑"** pill appears; tapping it
scrolls to top and clears. Because the ranked score is frozen within a session
(materialized, 10-min refresh), a changed top id reliably means new content, not
a re-rank — noted in a comment.

- [ ] **Step 1: Refs + state.** Add:

```ts
import { useEffect, useRef } from 'react'; // extend existing import
import { useFocusEffect } from 'expo-router';
// ...
const listRef = useRef<FlatList<CommunityPost>>(null);
const scrollY = useRef(0);
const knownTopId = useRef<string | null>(null);
const [showNewPill, setShowNewPill] = useState(false);
```

- [ ] **Step 2: Refetch on focus.**

```ts
useFocusEffect(
  useCallback(() => {
    feed.refetch();
  }, [feed])
);
```

- [ ] **Step 3: Detect a new top.** After `posts` is computed:

```ts
useEffect(() => {
  const topId = posts[0]?.id;
  if (!topId) return;
  if (knownTopId.current === null) {
    knownTopId.current = topId; // first load — nothing is "new"
    return;
  }
  if (topId !== knownTopId.current) {
    // New content at the top. If the user is near the top, just adopt it
    // silently; if scrolled down, surface the pill so they can jump up.
    if (scrollY.current > 400) setShowNewPill(true);
    else knownTopId.current = topId;
  }
}, [posts]);
```

- [ ] **Step 4: Wire the FlatList.** Add `ref={listRef}`, and capture scroll:
  in the existing (or a new) `onScroll`, set `scrollY.current = e.nativeEvent.contentOffset.y`
  (use `scrollEventThrottle={16}`). If a `RefreshControl` `onRefresh` exists, have
  it also `knownTopId.current = posts[0]?.id ?? null; setShowNewPill(false);`.

- [ ] **Step 5: The pill.** Render above the list (absolute, top-centered), only
  when `showNewPill`:

```tsx
{showNewPill ? (
  <PressableScale
    style={styles.newPill}
    onPress={() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      knownTopId.current = posts[0]?.id ?? null;
      setShowNewPill(false);
      Haptics.selectionAsync();
    }}
    accessibilityRole="button"
    accessibilityLabel="Scroll to new posts"
  >
    <Icon name="arrowUp" size={15} color={COLORS.white} />
    <Text style={styles.newPillText}>New posts</Text>
  </PressableScale>
) : null}
```

  Styles (coral pill, floating): `newPill` — `position:'absolute'`, centered via
  `alignSelf:'center'`, `top: SPACING[2]`, `zIndex: 10`, `flexDirection:'row'`,
  `gap: SPACING[1.5]`, `paddingVertical: SPACING[2]`, `paddingHorizontal:
  SPACING[4]`, `borderRadius: RADIUS.full`, `backgroundColor: COLORS.primary`,
  plus a subtle shadow token if one exists. `newPillText` — `FONTS.bold`,
  `TYPE_SIZE.caption`, `COLORS.white`. Confirm an up-arrow glyph name (`arrowUp`
  / `chevronUp`); use whichever exists in `Icon.tsx`.

- [ ] **Step 6:** `npm run typecheck` → 0; `npm run lint` touched → no new. Commit
  (`feat(community): "new posts" pill on focus refetch`).

---

### Task 4: Send-to-a-Mello-DM

**Files:**
- Create: `src/components/community/SharePostSheet.tsx`
- Modify: `src/components/community/PostActionBar.tsx`

**Interfaces:**
- Consumes: `useFriends`, `sendDirectMessage`, `sharePost`, `Sheet`, `Avatar`.
- Produces: `<SharePostSheet post visible onClose />`.

Behaviour: the share glyph now opens a sheet offering (a) send the post's deep
link to a friend's DM — a horizontal friend picker — and (b) "Share to other
apps" → the existing native sheet. Sending navigates to that DM.

- [ ] **Step 1: Build SharePostSheet.**

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Sheet, Avatar, Button, PressableScale } from '@/components/ui';
import { useFriends } from '@/hooks/useFriends';
import { sendDirectMessage } from '@/services/dm.service';
import { sharePost } from '@/utils/sharePost';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';

export function SharePostSheet({
  post,
  visible,
  onClose,
}: {
  post: CommunityPost;
  visible: boolean;
  onClose: () => void;
}) {
  const meId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const { friends } = useFriends();
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  async function sendToFriend(friendId: string) {
    if (!meId || sendingTo) return;
    setSendingTo(friendId);
    const url = Linking.createURL(`post/${post.id}`);
    const preview = post.body
      ? `"${post.body.slice(0, 100)}"`
      : `${post.author_name} on Mello`;
    try {
      await sendDirectMessage(meId, friendId, `${preview}\n${url}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      router.push(`/(tabs)/chats/dm/${friendId}`);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} grabber style={styles.card}>
      <Text style={styles.title}>Share post</Text>

      {friends.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {friends.map((f) => (
            <PressableScale
              key={f.friend.id}
              scaleTo={0.94}
              style={styles.friend}
              disabled={!!sendingTo}
              onPress={() => sendToFriend(f.friend.id)}
              accessibilityRole="button"
              accessibilityLabel={`Send to ${f.friend.name}`}
            >
              <Avatar name={f.friend.name} uri={f.friend.photo_url} size={56} />
              <Text style={styles.friendName} numberOfLines={1}>
                {f.friend.name}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>Add friends to send posts directly.</Text>
      )}

      <Button
        variant="secondary"
        size="lg"
        label="Share to other apps"
        onPress={() => {
          onClose();
          sharePost(post);
        }}
        fullWidth
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[5], gap: SPACING[4] },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  row: { gap: SPACING[3], paddingVertical: SPACING[1] },
  friend: { alignItems: 'center', gap: SPACING[1.5], width: 68 },
  friendName: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
  empty: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
  },
});
```

  Confirm `Avatar` accepts `uri` + `name` + `size` (it's used that way elsewhere;
  match the real prop names). Confirm the friend list item shape — `useFriends`
  returns `friends` where each row has `.friend: Profile` (Friendship type,
  models.ts:265). Adjust if the accessor differs.

- [ ] **Step 2: Open it from PostActionBar.** Replace the direct
  `onPress={() => sharePost(post)}` with sheet state:

```tsx
const [shareOpen, setShareOpen] = useState(false);
// ...share glyph:
onPress={() => setShareOpen(true)}
// ...after the <View style={styles.bar}> closes, before the component returns end:
```

  Render `<SharePostSheet post={post} visible={shareOpen} onClose={() => setShareOpen(false)} />`
  inside a wrapping fragment (PostActionBar currently returns a single `<View>` —
  wrap the `<View style={styles.bar}>` and the sheet in a `<>`). Keep the existing
  `useState` import.

- [ ] **Step 3:** `npm run typecheck` → 0; `npm run lint` touched → no new;
  `npx jest --forceExit` → green. Commit
  (`feat(community): send-to-DM share sheet (friend picker + external)`).

---

### Task 5: Copy / text polish sweep (conservative)

**Files:** as needed among the community components (list the exact edits made).

Review Community-facing strings for consistency. **Only** apply changes that are
clear improvements; list each in the commit body. Candidate checks:

- [ ] **Step 1:** Grep the surfaces and read them:
  `grep -rn "placeholder=\|title=\|label=\|>[A-Z].*</Text>" src/components/community app/post src/components/community/*.tsx` — collect the
  placeholders, empty states, button labels, dialog copy.
- [ ] **Step 2:** Apply only consistency fixes, e.g.:
  - Ellipsis consistency: use `…` (single glyph) not `...` across composer
    placeholders.
  - Empty-state parallelism: "No posts yet." / "No photo posts yet." /
    "No comments yet" — make terminal punctuation consistent.
  - Verify notification bodies read cleanly (they were set per-phase; likely fine).
  Do **not** restyle or restructure — text only.
- [ ] **Step 3:** `npm run typecheck` → 0; `npx jest --forceExit` → green (copy in
  `notificationCopy` is asserted — update those tests if you touch that copy).
  Commit (`polish(community): consistent microcopy`) with the change list in the body.

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green; `npm run lint` → no new
  (baseline ≤95 errors / 16 warnings).
- Append a **Final pass** section to `community-manual-qa.md`:
  - **Device:** scrolling down then a background refetch (leave + return to the
    tab) surfaces the **"New posts ↑"** pill; tapping it scrolls to top and clears;
    at the top, new content adopts silently (no pill). The share glyph opens the
    **Share post** sheet; tapping a friend sends the post link to their DM and
    lands you in that DM; "Share to other apps" opens the native sheet; a
    friendless account shows the add-friends hint. Nothing references the deleted
    ExploreEventCard/useExploreWraps (app builds + runs).
- Update memory `community-feed-project.md`: **Community feature complete** — all 7
  phases + final pass done; only migration-apply/device-QA remain as ops.
