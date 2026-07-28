# Community Phase 3a — Photo posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans. Steps use `- [ ]`.

**Goal:** Post 1–N photos with an optional caption, rendered as a swipeable
carousel with `onPhoto` glass chrome — reusing `PhotoGridPicker` and the existing
storage encoder.

**Architecture:** No schema/RPC change — `posts.media TEXT[]`, `type='photo'`, and
`community_feed`'s `media` column already exist (migrations 044/045); `CommunityPost`
already carries `media`/`type`. **This sub-phase is code-only, no SQL.** Photos
upload to the public `event-photos` bucket (016 policies: public read, uid-folder
write) with a `post-` prefix, mirroring `uploadWrapPhoto`. Compose folds photos
into the existing `ComposePostSheet` (attach 0–N → it becomes a `photo` post);
a new local `PhotoCarousel` renders the media. **Caption @mentions are Phase 3b**
(the caption is plain text here); **Profile Posts tab is 3c.**

**Tech Stack:** expo-image-picker, expo-file-system upload, Reanimated 4, TanStack
Query v5, expo-haptics.

## Global Constraints
- Never hardcode a colour/font/radius — `COLORS`/`FONTS`/`TYPE_SIZE`/`RADIUS`/`SPACING`.
- No new glass tier: on-photo chrome uses **`onPhoto`** (`Glass` tier already exists).
- Reuse, don't fork: `PhotoGridPicker`, `encodeForUpload` (via a new storage fn),
  the `postMutations` factory pattern, `Sheet`/`Button`/`TextField`.
- Feed invalidation goes through `queryKeys.community.feed.all` (never hand-typed).

---

### Task 1: Storage — uploadPostPhotos

**Files:**
- Modify: `src/services/storage.service.ts`

**Interfaces:**
- Produces: `uploadPostPhoto(userId, uri) => Promise<string>`,
  `uploadPostPhotos(userId, uris) => Promise<string[]>` (preserves order; passes
  through entries already `http`).

- [ ] **Step 1:** Add, mirroring `uploadWrapPhoto` / `uploadProfilePhotos`:

```ts
/**
 * Uploads a Community photo-post image to the public event-photos bucket
 * (016 policies) under the author's uid folder, `post-` prefixed so post media
 * is distinguishable from covers/wraps. Compressed via the shared encoder.
 */
export async function uploadPostPhoto(userId: string, uri: string): Promise<string> {
  const encoded = await encodeForUpload(uri, { maxWidth: 1280 });
  const path = `${userId}/post-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.${encoded.ext}`;
  await uploadFileFromUri('event-photos', path, encoded.uri, encoded.contentType);
  const { data } = supabase.storage.from('event-photos').getPublicUrl(path);
  return data.publicUrl;
}

/** Resolves an ordered URI list to public URLs — remote kept, local uploaded. */
export async function uploadPostPhotos(userId: string, uris: string[]): Promise<string[]> {
  return Promise.all(
    uris.map((uri) =>
      uri.startsWith('http') ? Promise.resolve(uri) : uploadPostPhoto(userId, uri)
    )
  );
}
```

- [ ] **Step 2:** `npm run typecheck` → 0. Commit.

---

### Task 2: Service — createPhotoPost

**Files:**
- Modify: `src/services/community/posts.service.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createPhotoPost({ authorId, body, media, visibility, city }) => Promise<string>`.

- [ ] **Step 1:** Add below `createTextPost`:

```ts
export async function createPhotoPost(params: {
  authorId: string;
  body: string; // caption; may be empty for a pure-photo post
  media: string[]; // public URLs, ordered
  visibility: PostVisibility;
  city: string | null;
}): Promise<string> {
  const caption = params.body.trim();
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'photo',
      body: caption.length > 0 ? caption : null,
      media: params.media,
      visibility: params.visibility,
      city: params.city,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
```

- [ ] **Step 2:** typecheck → 0. Commit.

---

### Task 3: Mutation — photo create path (upload then insert)

**Files:**
- Modify: `src/hooks/usePostMutations.ts`
- Test: `src/hooks/__tests__/usePostMutations.test.ts` (extend if present, else create)

**Interfaces:**
- Consumes: `uploadPostPhotos`, `createPhotoPost`, `createTextPost`.
- Produces: `CreatePostArgs` gains `media?: string[]` (local/remote URIs). When
  non-empty the mutation uploads then inserts a photo post; else a text post.

- [ ] **Step 1: Failing test** — the media path uploads then creates a photo post:

```ts
import { postMutations } from '@/hooks/usePostMutations';
import * as storage from '@/services/storage.service';
import * as posts from '@/services/community/posts.service';
import { QueryClient } from '@tanstack/react-query';

jest.mock('@/services/storage.service');
jest.mock('@/services/community/posts.service');

const user = { id: 'u1', city: 'BLR' } as any;
const mfc = (qc: QueryClient) => ({ client: qc, meta: undefined }) as any;

it('uploads media then creates a photo post', async () => {
  (storage.uploadPostPhotos as jest.Mock).mockResolvedValue(['http://a', 'http://b']);
  (posts.createPhotoPost as jest.Mock).mockResolvedValue('p1');
  const qc = new QueryClient();
  const { create } = postMutations(qc, user);
  await create.mutationFn!(
    { body: 'hi', visibility: 'friends', media: ['file://a', 'file://b'] },
    mfc(qc)
  );
  expect(storage.uploadPostPhotos).toHaveBeenCalledWith('u1', ['file://a', 'file://b']);
  expect(posts.createPhotoPost).toHaveBeenCalledWith(
    expect.objectContaining({ authorId: 'u1', media: ['http://a', 'http://b'], body: 'hi' })
  );
});

it('creates a text post when no media', async () => {
  (posts.createTextPost as jest.Mock).mockResolvedValue('p2');
  const qc = new QueryClient();
  const { create } = postMutations(qc, user);
  await create.mutationFn!({ body: 'hi', visibility: 'friends' }, mfc(qc));
  expect(posts.createTextPost).toHaveBeenCalled();
  expect(storage.uploadPostPhotos).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run → fail** (`media` not handled).
- [ ] **Step 3: Implement.** Extend `CreatePostArgs` and the `create` factory:

```ts
export type CreatePostArgs = {
  body: string;
  visibility: PostVisibility;
  media?: string[]; // local file:// or remote http URIs; empty/undefined ⇒ text post
};
```

```ts
const create: UseMutationOptions<string, unknown, CreatePostArgs> = {
  mutationFn: async (args) => {
    if (args.media && args.media.length > 0) {
      const urls = await uploadPostPhotos(user!.id, args.media);
      return createPhotoPost({
        authorId: user!.id,
        body: args.body,
        media: urls,
        visibility: args.visibility,
        city: user?.city ?? null,
      });
    }
    return createTextPost({
      authorId: user!.id,
      body: args.body,
      visibility: args.visibility,
      city: user?.city ?? null,
    });
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
  },
};
```

(Add imports for `uploadPostPhotos`, `createPhotoPost`.)

- [ ] **Step 4: Run → pass.** typecheck → 0. Commit.

---

### Task 4: Composer — photos in ComposePostSheet

**Files:**
- Modify: `src/components/community/ComposePostSheet.tsx`

**Interfaces:**
- Consumes: `useCreatePost` (now media-aware), `PhotoGridPicker`.

Behaviour: attach up to 6 photos; a post is valid when it has **a caption OR at
least one photo**; the caption is optional (and becomes the photo caption). While
uploading, the button shows loading (the mutation now spans upload+insert).

- [ ] **Step 1:** Add `const [photos, setPhotos] = useState<string[]>([]);`. Render
  `<PhotoGridPicker photos={photos} onChange={setPhotos} max={6} />` under the
  `TextField`. Include `photos` in `reset()`.
- [ ] **Step 2:** Change the gate:

```ts
const hasPhotos = photos.length > 0;
const canPost =
  (trimmed.length > 0 || hasPhotos) && trimmed.length <= MAX && !create.isPending;
```

- [ ] **Step 3:** Pass media + relax placeholder:

```ts
create.mutate(
  { body: trimmed, visibility, media: photos },
  { /* existing onSuccess/onError */ }
);
```
Placeholder: `hasPhotos ? 'Add a caption…' : "What's happening in your city?"`;
drop `showCount`'s required-ness (keep it — count still valid). Keep `autoFocus`.

- [ ] **Step 4:** typecheck → 0; lint the file. Commit.

---

### Task 5: Render — PhotoCarousel + PostCard photo branch

**Files:**
- Create: `src/components/community/PhotoCarousel.tsx`
- Modify: `src/components/community/PostCard.tsx`

**Interfaces:**
- Produces: `<PhotoCarousel media={string[]} />` — paged horizontal image pager,
  square (`aspectRatio: 1`), `cover`; for N>1 shows an `onPhoto` glass index
  counter (`i/N`) top-right and a dots row; `impactAsync(Light)` on page change.
  Single photo → no counter/dots.

- [ ] **Step 1:** Build `PhotoCarousel` with a paged `FlatList` (horizontal,
  `pagingEnabled`, `snapToInterval` = item width from `useWindowDimensions` minus
  the card's horizontal padding). Track index via `onMomentumScrollEnd`. Counter
  = `<Glass tier="onPhoto" radius={RADIUS.full}>` with white `TYPE_SIZE.micro`
  text; dots = active/inactive pills. No colour literals (`COLORS.white`, and for
  inactive dots use an existing token or a commented one-off rgba — glyph metric).

- [ ] **Step 2:** In `PostCard`, add before the action bar:

```tsx
{post.type === 'photo' && post.media.length > 0 ? (
  <>
    <PhotoCarousel media={post.media} />
    {post.body ? <TextPostBody body={post.body} /> : null}
  </>
) : null}
```

Keep the existing `text` branch. The carousel bleeds to the card edges — wrap it
so it cancels the card's `SPACING[4]` horizontal padding (`marginHorizontal:
-SPACING[4]`) and clips with the card radius on the top only is unnecessary
(carousel has its own radius); give the carousel `RADIUS.xl` corners and keep it
inside the padded column with a small vertical gap.

- [ ] **Step 3:** typecheck → 0; lint both files. Commit.

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green (new mutation tests);
  `npm run lint` on touched files → no new.
- Append a **Phase 3a** section to `docs/superpowers/tests/community-manual-qa.md`
  (no DB checks — code-only). Device: compose with 1 and with N photos (+caption
  and caption-less); publish shows loading during upload then the post appears at
  top; carousel swipes with Light haptic, dots + `i/N` track; single photo has no
  chrome; Android flat-glass counter still legible; friends/public visibility still
  respected; delete-own removes it.
- Update memory `community-phase-progress.md` (3a done, no migration; 3b/3c next).
