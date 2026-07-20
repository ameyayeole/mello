// TanStack Query matches cache keys by prefix: invalidating ['myEvents'] also
// refetches ['myEvents', userId]. The app leans on that everywhere — reads are
// scoped to a user, invalidations usually aren't — but the relationship was
// never written down, so it held only because everyone happened to type the
// same string. A typo in either half fails silently: no type error, no lint
// warning, just a screen that quietly stops refreshing.
//
// Each family exposes `all` (the prefix you invalidate) and `of(...)` (the
// exact key you read with), which makes that prefix relationship explicit.
//
// Only keys used in more than one file live here. A key with a single call
// site has nothing to stay in sync with, and routing it through here would be
// indirection for its own sake.

// Ids reach these builders in three shapes: `string` from route params,
// `undefined` from `user?.id` before auth resolves, and `null` from nullable
// state. All three serialize into a key fine, so the builders accept any.
type Id = string | null | undefined;

export const queryKeys = {
  // Nearby-events map/feed. `nearby` is a sub-prefix, so invalidating `all`
  // clears it too.
  events: {
    all: ['events'] as const,
    nearby: ['events', 'nearby'] as const,
  },
  eventDetail: {
    all: ['eventDetail'] as const,
    of: (eventId: Id) => ['eventDetail', eventId] as const,
  },
  myEvents: {
    all: ['myEvents'] as const,
    of: (userId: Id) => ['myEvents', userId] as const,
  },
  joinedEvents: {
    all: ['joinedEvents'] as const,
    of: (userId: Id) => ['joinedEvents', userId] as const,
  },
  exploreFeed: {
    all: ['exploreFeed'] as const,
    of: (
      userId: Id,
      lat: number | null,
      lng: number | null,
      activity: string | null,
      boostedOnly: boolean
    ) => ['exploreFeed', userId, lat, lng, activity, boostedOnly] as const,
  },
  savedEvents: {
    all: ['savedEvents'] as const,
    of: (userId: Id) => ['savedEvents', userId] as const,
  },
  savedEventIds: {
    all: ['savedEventIds'] as const,
    of: (userId: Id) => ['savedEventIds', userId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    of: (userId: Id) => ['notifications', userId] as const,
  },
  notificationsUnread: {
    all: ['notificationsUnread'] as const,
    of: (userId: Id) => ['notificationsUnread', userId] as const,
  },
  chatPrefs: {
    all: ['chatPrefs'] as const,
    of: (userId: Id) => ['chatPrefs', userId] as const,
  },
  // Post-event wrap. Scoped per viewer as well as per event — what you owe the
  // wrap (ratings left, photos added) differs by who is asking.
  wrap: {
    all: ['wrap'] as const,
    of: (eventId: Id, userId: Id) =>
      ['wrap', eventId, userId] as const,
  },
  wrapAttendees: {
    all: ['wrapAttendees'] as const,
    of: (eventId: Id, userId: Id) =>
      ['wrapAttendees', eventId, userId] as const,
  },
  // Whether `meId` has blocked `otherId` — direction matters, so both ids are
  // part of the key.
  blocked: {
    all: ['blocked'] as const,
    of: (meId: Id, otherId: Id) =>
      ['blocked', meId, otherId] as const,
  },
  profile: {
    all: ['profile'] as const,
    of: (userId: Id) => ['profile', userId] as const,
  },
  friendships: {
    all: ['friendships'] as const,
    of: (userId: Id) => ['friendships', userId] as const,
  },
} as const;
