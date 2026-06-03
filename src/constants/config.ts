export const CONFIG = {
  defaultRadiusMeters: 5000,
  maxRadiusMeters: 20000,
  messagesPageSize: 50,
  eventsPageSize: 20,
  mapRefetchIntervalMs: 60_000,
  mapStaletimeMs: 30_000,
  locationDistanceIntervalMeters: 50,
} as const;
