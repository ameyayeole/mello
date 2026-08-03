import { create } from 'zustand';
import { ActivityId } from '@/types/models';
import { SectionId } from '@/constants/activities';
import { roundUpTo30 } from '@/utils/time';
import {
  DEFAULT_PEOPLE,
  MAX_PEOPLE,
  MIN_PEOPLE,
  STEP_COUNT,
  StoredEventDraft,
  clampMaxPeople,
} from '@/utils/eventDraft';
import type { DraftInput } from '@/services/eventDraftStore';

// ─── The in-progress event ───────────────────────────────────────────────────
// Everything the create wizard is holding, in one place outside the component
// tree.
//
// It lived as 26 useState hooks inside a 1,800-line component, which meant any
// change re-rendered all of it. Measured on device: scrolling one picker wheel
// re-rendered the whole flow, which re-rendered the *other* open wheel's 90
// rows. That is not a memoisation problem — it is a shape problem, and no
// amount of React.memo below the component fixes a component that re-renders
// for every field it owns. Each step now subscribes to the fields it actually
// reads.
//
// Deliberately module-level rather than context-scoped: there is one map and
// one create flow, so a second instance is not a thing that can happen. The
// price is that `reset()` has to be called on purpose rather than falling out
// of unmount — see the entry effect in the flow.
//
// Kept free of any React Native import on purpose. The mapping functions below
// are the parts most able to break silently, and they can only be tested
// without a renderer if this module never reaches a component.

export interface CreateEventDraft {
  // 'drop'   — waiting for a tap to plant the pin
  // 'form'   — the wizard card is up and the map pans under a fixed pin
  // 'submit' — the camera is closing in; the form is gone and cannot come back
  //            except via a failure
  phase: 'drop' | 'form' | 'submit';
  step: number;
  coord: { lat: number; lng: number } | null;
  locationName: string;
  activity: ActivityId | null;
  // UI-only, and still here rather than local to the step: a step unmounts when
  // you leave it, so a local filter would silently reset every time you stepped
  // back to the grid.
  sectionFilter: SectionId | 'all';
  title: string;
  description: string;
  photoUri: string | null;
  startDate: Date;
  durationH: number;
  // Text, not a number, so the field can be typed over directly. Everything
  // downstream reads it through clampMaxPeople.
  maxPeople: string;
  isPublic: boolean;
  requiresApproval: boolean;
  womenOnly: boolean;
  // The card's measured height. Lives here because the pin is centred against
  // it and the pin is not inside the card — without this the measurement would
  // have to be prop-drilled back up through the card to its sibling.
  cardH: number;
}

interface CreateEventActions {
  setPhase: (phase: CreateEventDraft['phase']) => void;
  setStep: (step: number) => void;
  next: () => void;
  back: () => void;
  setCoord: (coord: { lat: number; lng: number } | null) => void;
  setLocationName: (name: string) => void;
  setActivity: (activity: ActivityId) => void;
  setSectionFilter: (section: SectionId | 'all') => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setPhotoUri: (uri: string | null) => void;
  setStartDate: (date: Date) => void;
  // Day and minute-of-day are addressed separately by the two wheels, but
  // `startDate` stays the single source of truth both are read back out of.
  setStartDay: (epochMs: number) => void;
  setStartMinute: (minutesPastMidnight: number) => void;
  setDurationH: (hours: number) => void;
  setMaxPeople: (value: string) => void;
  // Steppers go through here so the clamp is applied at the source rather than
  // by each caller remembering to.
  nudgeMaxPeople: (delta: number) => void;
  setIsPublic: (on: boolean) => void;
  setRequiresApproval: (on: boolean) => void;
  setWomenOnly: (on: boolean) => void;
  setCardH: (height: number) => void;
  reset: () => void;
  hydrate: (draft: StoredEventDraft) => void;
}

export function defaultStart(): Date {
  return roundUpTo30(new Date(Date.now() + 60 * 60 * 1000));
}

// Not a constant: `startDate` has to be recomputed each time, or a session left
// open overnight resets to a start time in the past.
export function initialDraft(): CreateEventDraft {
  return {
    phase: 'drop',
    step: 0,
    coord: null,
    locationName: '',
    activity: null,
    sectionFilter: 'all',
    title: '',
    description: '',
    photoUri: null,
    startDate: defaultStart(),
    durationH: 2,
    maxPeople: String(DEFAULT_PEOPLE),
    isPublic: true,
    requiresApproval: false,
    womenOnly: false,
    cardH: 0,
  };
}

// ─── The two mappings ────────────────────────────────────────────────────────
// Both directions between the store and what goes on disk. Plain functions, and
// exported, because these are the code most able to fail silently: drop a field
// from either one and there is no type error, no test failure and no crash —
// just a draft that quietly forgets your description.

export function draftInputFrom(s: CreateEventDraft): DraftInput {
  return {
    step: s.step,
    coord: s.coord,
    locationName: s.locationName,
    activity: s.activity,
    title: s.title,
    description: s.description,
    photoUri: s.photoUri,
    startsAt: s.startDate.getTime(),
    durationH: s.durationH,
    maxPeople: s.maxPeople,
    isPublic: s.isPublic,
    requiresApproval: s.requiresApproval,
    womenOnly: s.womenOnly,
  };
}

// `phase` is decided by the caller, not here: only a draft that got as far as a
// pin can reopen the form, and that rule belongs with the code that also has to
// move the camera.
export function draftStateFrom(d: StoredEventDraft): Partial<CreateEventDraft> {
  return {
    step: d.step,
    coord: d.coord,
    locationName: d.locationName,
    activity: d.activity as ActivityId | null,
    title: d.title,
    description: d.description,
    photoUri: d.photoUri,
    startDate: new Date(d.startsAt),
    durationH: d.durationH,
    maxPeople: d.maxPeople,
    isPublic: d.isPublic,
    requiresApproval: d.requiresApproval,
    womenOnly: d.womenOnly,
  };
}

export const useCreateEventStore = create<CreateEventDraft & CreateEventActions>(
  (set) => ({
    ...initialDraft(),

    setPhase: (phase) => set({ phase }),
    setStep: (step) =>
      set({ step: Math.min(STEP_COUNT - 1, Math.max(0, step)) }),
    next: () => set((s) => ({ step: Math.min(s.step + 1, STEP_COUNT - 1) })),
    back: () => set((s) => ({ step: Math.max(s.step - 1, 0) })),

    setCoord: (coord) => set({ coord }),
    setLocationName: (locationName) => set({ locationName }),
    setActivity: (activity) => set({ activity }),
    setSectionFilter: (sectionFilter) => set({ sectionFilter }),
    setTitle: (title) => set({ title }),
    setDescription: (description) => set({ description }),
    setPhotoUri: (photoUri) => set({ photoUri }),

    setStartDate: (startDate) => set({ startDate }),
    setStartDay: (epochMs) =>
      set((s) => {
        const d = new Date(epochMs);
        const next = new Date(s.startDate);
        next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        return { startDate: next };
      }),
    setStartMinute: (mins) =>
      set((s) => {
        const next = new Date(s.startDate);
        next.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
        return { startDate: next };
      }),
    setDurationH: (durationH) => set({ durationH }),

    setMaxPeople: (maxPeople) => set({ maxPeople }),
    nudgeMaxPeople: (delta) =>
      set((s) => {
        const nextValue = clampMaxPeople(s.maxPeople) + delta;
        // Clamped at both ends, so a stepper held down at the limit cannot walk
        // the value out of range even if the disabled state lags a frame.
        return {
          maxPeople: String(
            Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, nextValue))
          ),
        };
      }),

    setIsPublic: (isPublic) => set({ isPublic }),
    setRequiresApproval: (requiresApproval) => set({ requiresApproval }),
    setWomenOnly: (womenOnly) => set({ womenOnly }),
    setCardH: (cardH) => set({ cardH }),

    reset: () => set(initialDraft()),
    hydrate: (draft) => set(draftStateFrom(draft)),
  })
);
