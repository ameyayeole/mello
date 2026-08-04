# Edit profile — audit and redesign plan

Measured on `app/profile/edit.tsx` (425 lines) at `1874f61`. Every count below
was grepped, not estimated.

> **Status: all four phases implemented.** Phase 1 shipped as its own commit
> (correctness, no pixels moved); phases 2–4 as the redesign commit. The audit
> below is kept as written so the reasoning stays checkable — §1 describes the
> state *before* the fixes. Device rows are in
> `docs/testing/settings-audit-fixes.md`.
>
> One residual risk, reasoned not observed: `edit.tsx` now mounts its own
> `AppBackground`, and it is presented over Settings which mounts another. The
> blob drift is per-instance, so during the modal's slide the two are briefly at
> different phases. At 0.26 peak alpha on a 440px soft blob with a 40px travel,
> the seam should be imperceptible — but it is the one thing worth looking at
> first on a device.

---

## 0. Why it reads as old

It isn't mainly the layout. Three specific things date it:

1. **It's the only screen in the settings cluster that never got the glass
   pass.** Settings is `Glass` panels over `AppBackground`; tapping *Edit
   profile* drops you onto flat `COLORS.surface` cards on a plain background.
   The seam is the surface tier, not the spacing.
2. **It has two labelling systems at once.** `DISPLAY NAME`, `USERNAME`, `AGE`
   and `BIO` use `TextField`'s built-in `label`. `PHOTOS`, `GENDER` and
   `INTERESTS` use a hand-rolled `styles.label` `Text`. They are different
   components rendering the same idea, and `SectionLabel` — which exists for
   exactly this — is used by neither.
3. **Everything selectable is a pill.** Gender and interests are
   `RADIUS.full` chips (2 call sites, lines 393 and 408). The app's locked
   design language has one pill, `CategoryPill`, and this screen doesn't use it.

---

## 1. Bugs found (independent of any redesign)

These are worth fixing whether or not the visual work happens.

### 1.1 The BIO field is covered by the keyboard — **high**

`edit.tsx:164` is `<Screen modal>`. Every other text-entry screen in the cluster
passes `keyboardAvoiding`:

| Screen | Props |
| --- | --- |
| `change-password.tsx:89` | `<Screen modal keyboardAvoiding>` |
| `change-email.tsx:50` | `<Screen modal keyboardAvoiding>` |
| **`edit.tsx:164`** | **`<Screen modal>`** |

BIO is a `multiline` field at the bottom of a `ScrollView`. Reasoned, not
observed: focusing it should put the caret behind the keyboard. One-word fix.

### 1.2 The Save button lies about being disabled — **high**

`edit.tsx:170-189`. `disabled` tests five conditions; the greyed-out style
tests one:

```tsx
disabled={loading || !name.trim() || photos.length === 0 ||
          usernameStatus === 'taken' || usernameStatus === 'invalid' ||
          usernameStatus === 'checking'}
...
<Text style={[styles.save, !name.trim() && styles.saveDisabled]}>Save</Text>
```

With a name typed but **no photos**, Save renders in full coral and does
nothing when tapped. Same for a username still being checked. This is the worst
kind of dead control — it looks live.

### 1.3 Validation is split across two mechanisms in one screen

Username errors already render inline via `TextField`'s `error` prop
(`edit.tsx:224`). The other four validations are `Alert.alert` (name required,
invalid age, invalid username, username taken) — and two of those are *about the
username field that already has an inline error slot.*

### 1.4 No unsaved-changes guard

The header uses `backIcon="close"`, so the X silently discards a half-edited
profile. The create flow solved this exact problem with `DiscardDialog`.

### 1.5 Minor

- `parseInt(age)` with no radix; no upper bound on age (`edit.tsx:123`).
- Interests are uncapped while photos cap at 6 — no product reason found for
  the asymmetry, worth a decision either way.
- 3 hardcoded colours, all of which have exact tokens:

| Line | Literal | Token |
| --- | --- | --- |
| 323 | `rgba(15,24,44,0.55)` | closest is `inkLabel` (0.50) — needs a call |
| 348 | `rgba(15,24,44,0.5)` | `COLORS.inkLabel` (exact match) |
| 422 | `rgba(15,24,44,0.7)` | no exact token; `textSecondary` is the intent |

- `TouchableOpacity` for Save (`edit.tsx:170`) where the app uses
  `PressableScale`.

---

## 2. Redesign plan

Sequenced so each phase is independently shippable and bisectable. **Phase 1 is
a bugfix commit with no visual change; phase 2+ is the redesign.** Keeping them
apart is the point — mixing them means a regression can't be traced to either.

### Phase 1 — correctness only (no pixels move)

1. Add `keyboardAvoiding` to `<Screen>` (1.1).
2. Extract the Save-enabled test into one `canSave` const and drive both
   `disabled` and the style from it (1.2).
3. Move the four `Alert.alert` validations to `TextField error` on the field
   they concern; keep `showError` for unexpected service failures — that is the
   split the rest of the cluster now uses (1.3).
4. Replace the 3 hardcoded colours; swap `TouchableOpacity` → `PressableScale`.

Verifiable by `tsc` + the existing suite. Needs a device pass only for 1.1.

### Phase 2 — surface tier

5. Wrap the form groups in `Glass tier="panel"` the way `SettingsCard` does, so
   the screen belongs to the same surface family as the settings screen that
   launches it. This is the single change that does most of the "feels new" work.
6. Replace the hand-rolled `styles.label` with `SectionLabel` for PHOTOS /
   GENDER / INTERESTS, so there is one label system.

**Open question for phase 2:** `TextField` draws its own bordered box. Nested
inside a `Glass` panel that is a box-in-a-box. Two options — worth deciding
before writing code:

- **(a)** Panels wrap only the non-`TextField` groups (photos, gender,
  interests); text fields stay as they are on the plain background.
- **(b)** Add a `bare` prop to `TextField` that drops its border, and let the
  panel supply the container — closer to the settings-row look, more work, and
  it touches a primitive used across the app.

I'd start with (a): it is reversible and doesn't put a new prop on a shared
primitive to serve one screen.

### Phase 3 — selection controls

7. Gender and interests become one selectable-chip component instead of two
   copies of `styles.pill`.

**`CategoryPill` is not a drop-in.** Measured: it takes `emoji`, `label`,
`color`, `style` and has **no `onPress` and no `selected` state** — it is a
display pill.

**Resolved (measured):** the create flow's `SectionPills` is *not* the same
shape — it is a horizontal single-select filter row with a travelling
indicator, not a wrapping multi-select grid. So there is no third caller: the
only two are gender and interests, both inside `edit.tsx`.

That puts it under AGENTS.md's own bar — "if you need it once, keep it local; a
premature primitive is as bad as a fork". So: **one local `SelectChip` in
`edit.tsx`**, not a `ui/` primitive, and not a change to `CategoryPill`.
Promote it later if a third caller actually appears.

Note these stay pill-shaped. The "no pill buttons" rule in AGENTS.md is about
`Button`; selection chips are pills throughout the app (`SectionPills`,
`CategoryPill`), and squaring them off here would fight the design language.

### Phase 4 — the exit

8. Add a `DiscardDialog`-style guard on close when the form is dirty (1.4).
   `ConfirmDialog` (just added in `ui/`) covers this with no new component:
   `tone="destructive"`, "Discard changes?".

---

## 3. What this plan deliberately does not do

- **No restructure into a store or step files.** The create wizard needed that
  at 1,846 lines and 26 `useState`s; this screen is 425 lines and 11. Applying
  that pattern here would be cargo-culting the fix for a problem it doesn't have.
- **No photo-picker changes.** `PhotoGridPicker` is a separate component and was
  not audited.
- **No change to the KYC identity lock.** The locked name/age/gender behaviour
  is enforced server-side by migration 036 and is correct as written.
