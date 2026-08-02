# Profile Posts: List-Only with Infinite Scroll

**Date:** 2026-08-02  
**Scope:** Phase 1 - Feature Implementation  
**Status:** Design Approved

## Overview

Convert the user profile posts display from a grid/list toggle to a list-only view with automatic infinite scroll. Posts will be ordered by pure recency (newest first) and display all post types (text, photo, poll, shared_wrap).

## Requirements

| Requirement | Status |
|---|---|
| Remove grid view entirely | Phase 1 |
| Remove grid/list toggle UI | Phase 1 |
| Show all post types in list | Phase 1 |
| Sort by pure recency (created_at DESC) | Phase 1 |
| Add infinite scroll (load before bottom) | Phase 1 |
| Preserve all post interactions (delete, report, comment) | Phase 1 |
| Refactor component architecture | Phase 2 |

## Architecture

### Files Modified (Phase 1)

#### 1. `src/components/community/ProfilePosts.tsx` (332 lines)

**Remove:**
- Grid rendering logic (FlatList with `numColumns: 3`, flex wrapping)
- Grid-specific styling and calculations:
  - `GUTTER` constant (2px)
  - Tile width calculation
  - `onLayout` callback for grid width measurement
  - Grid-specific `key` generation
- Grid/list view toggle:
  - `viewMode` state
  - Toggle button UI
  - Conditional rendering branches (`viewMode === 'grid' ? ... : ...`)
- Grid-only post type filtering (currently only shows `type === 'photo'`)

**Keep:**
- Post item rendering (works for all types)
- Delete/report/comment dialogs
- Like/unlike functionality
- Error and empty states
- Loading states
- FlatList container structure
- All React Query hooks and mutations

**Add:**
- `onEndReached` callback on FlatList (scroll position tracking)
- Loading indicator UI when `isFetchingNextPage === true`
- Call to `q.fetchNextPage()` in `onEndReached`
- `onEndReachedThreshold={0.5}` on FlatList (load when ~500px from bottom)

#### 2. `src/hooks/useUserPosts.ts` (45 lines)

**Modify:**
- Change keyset pagination sort order from `(score DESC, created_at DESC, id)` to `(created_at DESC, id)`
- Update cursor structure passed to API:
  - Remove `score` field
  - Keep `createdAt` and `id` fields
- API call remains the same; only the cursor values change

#### 3. `src/services/community/posts.service.ts` (no code changes)

**No changes needed** — the `getUserPosts` RPC already handles dynamic cursor values. Changing what fields we send in the cursor is transparent to this layer.

---

## Behavior

### Sorting
- **Before:** Keyset cursor `(score DESC, created_at DESC, id)` — popular posts ranked higher
- **After:** Keyset cursor `(created_at DESC, id)` — newest posts always first

### Infinite Scroll
- Triggers when user scrolls to within ~500px of list bottom (`onEndReachedThreshold={0.5}`)
- Calls `q.fetchNextPage()` on the infinite query
- Shows loading indicator during fetch
- No manual "Load more" button
- Gracefully stops when no more pages available (`hasNextPage === false`)

### Post Types
- **Before:** Grid only showed photo posts (`type === 'photo' && media.length > 0`)
- **After:** List shows all types (text, photo, poll, shared_wrap)

### Interactions (Unchanged)
- Delete post → removes from list and invalidates cache
- Report post → removes from list and invalidates cache
- Like/unlike → optimistic update
- Comment → opens sheet modal
- Post still visible during comment/report operations (no loading blocker)

---

## Data Flow

```
User scrolls near bottom
  ↓
onEndReached fires
  ↓
fetchNextPage() called
  ↓
useUserPosts sends new cursor (createdAt DESC, id)
  ↓
posts.service.getUserPosts() → user_posts RPC
  ↓
Server returns next 12 posts (ordered by recency)
  ↓
React Query appends to `pages` array
  ↓
FlatList re-renders with new items
```

---

## Error Handling

**No changes to error handling.** Existing error states apply:
- Network error → error message shown, "Retry" button
- Empty state → "No posts yet" message
- Post deletion → remove item from list, show toast
- Post report → remove item from list, show toast

---

## Testing Strategy

**Verify:**
1. Grid view removed entirely (no conditional rendering)
2. Toggle button gone
3. All post types render (pick profile with mixed post types)
4. Sorting is newest-first (check timestamps)
5. Infinite scroll triggers before bottom (scroll near end, verify load)
6. Delete/report/comment still work
7. No loading state blocker on interactions
8. Empty state shows when no posts exist
9. On Android SafeAreaView renders correctly (grid deletion may affect layout)

**Not in scope:** Phase 2 will handle component architecture review.

---

## Phase 2 (Future)

After Phase 1 ships and is verified working:
- Refactor ProfilePosts.tsx for clarity
- Remove any remaining dead utilities
- Restructure component if architecture is unclear
- Separate concerns if component grew during feature work

---

## Dependencies

- React Query `useInfiniteQuery` hook (existing)
- RLS permissions on `user_posts` RPC (existing)
- Reanimated for smooth scrolling (existing)

---

## Success Criteria

- ✅ Grid view removed
- ✅ Toggle removed
- ✅ All post types show in list
- ✅ Posts ordered newest-first
- ✅ Infinite scroll works (loads ~500px before bottom)
- ✅ All post interactions work (delete, report, comment, like)
- ✅ No errors in console
- ✅ Works on Android + iOS
