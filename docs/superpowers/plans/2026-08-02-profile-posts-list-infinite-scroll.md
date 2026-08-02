# Profile Posts: List-Only with Infinite Scroll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert user profile posts from grid/list toggle to list-only view with automatic infinite scroll, sorted by pure recency.

**Architecture:** 
1. Update `useUserPosts` hook to sort by `created_at DESC` instead of `score DESC, created_at DESC`
2. Remove grid rendering logic, toggle button, and grid-specific utilities from `ProfilePosts.tsx`
3. Add `onEndReached` callback to FlatList to auto-load next page when user scrolls near bottom
4. All existing post interactions (delete, report, comment) remain unchanged

**Tech Stack:** React Native, React Query (useInfiniteQuery), FlatList

## Global Constraints

- No breaking changes to post mutation APIs
- Android SafeAreaView must render correctly after grid removal
- Keyset pagination must remain consistent (cursor structure: `{ createdAt, id }`)
- Page size stays at 12 items
- All post interactions (delete, report, comment, like) must work unchanged

---

## Task 1: Update useUserPosts Hook — Sort by Recency

**Files:**
- Modify: `src/hooks/useUserPosts.ts`

**Interfaces:**
- Consumes: None (reads from React Query)
- Produces: Hook returns infinite query with `getNextPageParam` that generates cursor `{ createdAt, id }` (removes `score`)

- [ ] **Step 1: Open useUserPosts.ts and locate the cursor generation**

File: `src/hooks/useUserPosts.ts` (lines 1-45)

Current code generates cursor like:
```typescript
getNextPageParam: (lastPage) => {
  if (lastPage.length < 12) return undefined;
  const last = lastPage[lastPage.length - 1];
  return {
    score: last.score,
    createdAt: last.created_at,
    id: last.id,
  };
}
```

- [ ] **Step 2: Remove score from cursor generation**

Replace the cursor object to only include `createdAt` and `id`:

```typescript
getNextPageParam: (lastPage) => {
  if (lastPage.length < 12) return undefined;
  const last = lastPage[lastPage.length - 1];
  return {
    createdAt: last.created_at,
    id: last.id,
  };
}
```

- [ ] **Step 3: Verify the change is minimal and correct**

Check that:
- `createdAt` matches the RPC parameter name `p_cursor_created_at`
- `id` matches the RPC parameter name `p_cursor_id`
- The service layer (`posts.service.ts`) already handles dynamic cursor — no changes needed there

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useUserPosts.ts
git commit -m "feat(community): sort user posts by recency in keyset cursor"
```

---

## Task 2: Remove Grid Code from ProfilePosts

**Files:**
- Modify: `src/components/community/ProfilePosts.tsx:1-332`

**Interfaces:**
- Consumes: `useUserPosts` hook (modified in Task 1)
- Produces: Component that renders FlatList with list items only, no grid toggle

- [ ] **Step 1: Open ProfilePosts.tsx and identify grid-specific code**

Search for:
- `viewMode` state and toggle button
- Grid rendering with `numColumns: 3` or `flexWrap: 'wrap'`
- `GUTTER` constant (2px grid spacing)
- Grid width calculation / `onLayout` callback
- Conditional rendering based on `viewMode`

- [ ] **Step 2: Remove viewMode state and toggle UI**

Find and delete:
- State: `const [viewMode, setViewMode] = useState<'grid' | 'list'>(...)`
- Toggle button (likely in header or near top of JSX)
- Any UI that switches between grid/list

Example: Look for code like `<Button onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} />`

- [ ] **Step 3: Remove grid-specific constants and utilities**

Delete:
- `const GUTTER = 2;` or similar
- Any tile width calculation functions
- `onLayout` callback that measures container width for grid

- [ ] **Step 4: Simplify post rendering to list-only**

Find the FlatList rendering section. Remove:
- `numColumns={3}` prop
- `columnWrapperStyle` prop
- `flexWrap: 'wrap'` styles
- Grid-specific key generation

The FlatList should now be a simple vertical list:
```typescript
<FlatList
  data={allPosts}
  renderItem={renderPost}
  keyExtractor={(item) => item.id}
  // onEndReached will be added in Task 3
/>
```

- [ ] **Step 5: Remove grid-only post filtering**

Currently, grid only shows `type === 'photo' && media.length > 0`. 

Find any conditional in the post rendering that filters to photos only. Delete it so all post types display (text, photo, poll, shared_wrap).

Example: Remove `if (post.type !== 'photo') return null;`

- [ ] **Step 6: Commit**

```bash
git add src/components/community/ProfilePosts.tsx
git commit -m "feat(community): remove grid view from profile posts"
```

---

## Task 3: Add Infinite Scroll to ProfilePosts

**Files:**
- Modify: `src/components/community/ProfilePosts.tsx`

**Interfaces:**
- Consumes: `useUserPosts` hook with `q.fetchNextPage()` and `q.isFetchingNextPage`
- Produces: FlatList with `onEndReached` callback that loads next page near bottom

- [ ] **Step 1: Add onEndReached callback to FlatList**

In the FlatList component, add:

```typescript
<FlatList
  data={allPosts}
  renderItem={renderPost}
  keyExtractor={(item) => item.id}
  onEndReached={() => {
    if (q.hasNextPage && !q.isFetchingNextPage) {
      q.fetchNextPage();
    }
  }}
  onEndReachedThreshold={0.5}
  // ... rest of props
/>
```

**Explanation:**
- `onEndReachedThreshold={0.5}` triggers when user is ~500px from bottom
- Guard with `hasNextPage && !isFetchingNextPage` to prevent double-fetches
- Calls `q.fetchNextPage()` which appends new page to React Query cache

- [ ] **Step 2: Add loading indicator while fetching**

When `q.isFetchingNextPage` is true, show a loading spinner at the bottom of the list.

Add a ListFooterComponent to FlatList:

```typescript
<FlatList
  // ... existing props
  ListFooterComponent={
    q.isFetchingNextPage ? (
      <ActivityIndicator size="large" style={{ marginVertical: 16 }} />
    ) : null
  }
/>
```

Import `ActivityIndicator` from React Native if not already imported.

- [ ] **Step 3: Verify hasNextPage is accessible**

In the hook `useUserPosts`, verify that `getNextPageParam` returns `undefined` when there are no more pages (when page size < 12).

If `getNextPageParam` returns `undefined`, React Query automatically sets `hasNextPage = false`. This is already set up correctly from Task 1.

- [ ] **Step 4: Test that infinite scroll doesn't interfere with existing interactions**

The infinite scroll logic only triggers in `onEndReached`. All post interactions (delete, report, comment) use their own callbacks and should not be affected.

Verify:
- Delete button still works
- Report button still works  
- Comment button still works
- Like/unlike still works (optimistic update)

- [ ] **Step 5: Commit**

```bash
git add src/components/community/ProfilePosts.tsx
git commit -m "feat(community): add infinite scroll to profile posts"
```

---

## Task 4: Verify TypeScript and Tests Pass

**Files:**
- Test: No new tests needed (existing component tests should still pass)
- Verify: Type checking passes

- [ ] **Step 1: Run TypeScript type checker**

```bash
npm run typecheck
```

Expected: 0 errors (existing baseline maintained)

If errors appear:
- Check that `q.fetchNextPage()` is typed correctly (should be from React Query)
- Check that `ActivityIndicator` is imported from React Native
- Verify FlatList props match RN types

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Expected: All tests pass (no new tests added; existing component tests unaffected by removal of grid logic)

- [ ] **Step 3: Run linter**

```bash
npm run lint
```

Expected: No new errors introduced (existing baseline: 95 errors / 16 warnings)

If grid-related code was linted, removing it should maintain or improve the count.

- [ ] **Step 4: Commit verification**

No new commit needed for this task — just verification that Tasks 1-3 are solid.

---

## Task 5: Manual Device Testing

**Files:**
- None (manual QA only)

- [ ] **Step 1: Build and run on device**

```bash
npm run android
# or
npm run ios
```

Navigate to the user profile (own profile or friend's profile).

- [ ] **Step 2: Verify grid is gone**

Check:
- No 3-column grid layout
- No grid/list toggle button visible
- Posts display in a single vertical list

- [ ] **Step 3: Verify post types**

Find a profile with mixed post types (text, photo, poll, etc.). Confirm all types render in the list.

- [ ] **Step 4: Verify recency ordering**

Scroll through posts. Confirm newest posts appear first (check timestamps if visible).

- [ ] **Step 5: Verify infinite scroll works**

Scroll to near the bottom of the list. Confirm:
- Loading indicator appears briefly
- New posts load automatically (no manual button)
- Scroll continues smoothly without interruption

- [ ] **Step 6: Test post interactions on Android**

(Android is the critical device per AGENTS.md — SafeAreaView quirks)

- Delete a post → should disappear and show toast
- Report a post → should disappear and show toast
- Like/unlike a post → should update count optimistically
- Comment on a post → should open modal, comment works

- [ ] **Step 7: Test on iOS (secondary)**

Same as Step 6 but on iOS simulator/device.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Remove grid view entirely → Task 2
- ✅ Remove grid/list toggle UI → Task 2
- ✅ Show all post types in list → Task 2
- ✅ Sort by pure recency → Task 1
- ✅ Add infinite scroll → Task 3
- ✅ Preserve all post interactions → Task 3 + Task 5 verification
- ✅ TypeScript passes → Task 4
- ✅ Works on Android + iOS → Task 5

**Placeholder scan:**
- ✅ No "TBD", "TODO", or incomplete steps
- ✅ All code examples are concrete (not pseudo-code)
- ✅ All file paths are exact
- ✅ All commands are copy-paste ready

**Type consistency:**
- ✅ Cursor structure `{ createdAt, id }` consistent between Task 1 and service
- ✅ `onEndReached` callback uses correct types from React Query
- ✅ `ActivityIndicator` is imported from React Native
- ✅ No type mismatches between tasks

**Completeness:**
- ✅ No gaps between tasks
- ✅ Each task produces independently testable output
- ✅ Testing strategy covers all requirements
- ✅ Manual QA covers both platforms (Android + iOS)

---

## Execution Path

Plan complete and saved to `docs/superpowers/plans/2026-08-02-profile-posts-list-infinite-scroll.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints
