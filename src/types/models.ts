export type ActivityId =
  | 'coffee'
  | 'gym'
  | 'drinks'
  | 'trekking'
  | 'study'
  | 'music'
  | 'parties'
  | 'gaming';

export type FriendStatus = 'pending' | 'accepted' | 'blocked';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'join_request'
  | 'join_approved'
  | 'event_update'
  | 'new_message'
  | 'event_starting_soon'
  | 'friend_joined_event'
  | 'event_boosted'
  | 'host_announcement'
  | 'mention'
  // Post-event wrap (migration 032)
  | 'wrap_ready'
  | 'note_received'
  | 'photo_liked'
  | 'photo_commented'
  | 'encore_requested';

export type ParticipantStatus = 'pending' | 'approved';

export type Gender = 'male' | 'female' | 'non-binary' | 'other';

export type KycStatus =
  | 'none'
  | 'in_progress'
  | 'pending_review'
  | 'approved'
  | 'declined'
  | 'expired';

export interface Profile {
  id: string;
  name: string;
  // Unique handle (migration 029). Optional so the app still works before the
  // migration is applied.
  username?: string;
  photo_url: string | null;
  // Up to 6 gallery photos. The first is mirrored into photo_url (the avatar).
  photos: string[];
  age: number | null;
  gender: Gender | null;
  bio: string | null;
  city: string | null;
  interests: ActivityId[];
  events_hosted: number;
  events_attended: number;
  friends_count: number;
  thumbs_count: number;
  is_ghost_mode: boolean;
  kyc_status: KycStatus;
  kyc_verified_at: string | null;
  // Mello+ subscription. Optional so the app still works before migration 024.
  is_premium?: boolean;
  premium_until?: string | null;
  premium_plan?: 'weekly' | 'monthly' | null;
  expo_push_token: string | null;
  last_seen: string;
  created_at: string;
}

export interface Coords {
  lat: number;
  lng: number;
}

export interface NearbyEvent {
  id: string;
  host_id: string;
  activity: ActivityId;
  title: string;
  description: string | null;
  image_url: string | null;
  location_name: string | null;
  starts_at: string;
  ends_at: string | null;
  max_people: number | null;
  is_public: boolean;
  requires_approval: boolean;
  // Optional so the app still works before migration 018 is applied.
  women_only?: boolean;
  distance_m: number | null;
  participant_count: number;
  lat: number;
  lng: number;
  // Flattened host fields, returned by events_within_radius since migration
  // 017. Optional so the app still works before that migration is applied.
  host_name?: string;
  host_photo_url?: string | null;
  // KYC-approved host, returned by the feed RPCs since migration 024.
  host_verified?: boolean;
  // Boost (migration 026). boosted_until rides along on SELECT * queries
  // (getEventDetail / getMyEvents); is_boosted is the precomputed flag the feed
  // RPCs return. Both optional so the app still works before 026 is applied.
  boosted_until?: string | null;
  is_boosted?: boolean;
  // Chat features (migration 030). Optional pre-migration.
  chat_locked?: boolean;
  pinned_message_id?: string | null;
  host?: Profile;
}

// A ranked event for the Explore feed. Flattened host fields + the social/score
// signals returned by the explore_feed() RPC.
export interface ExploreEvent extends NearbyEvent {
  host_name: string;
  host_photo_url: string | null;
  created_at: string;
  friends_count: number;
  score: number;
}

// ─── LIVE ACTIVITY FEED (Explore → "Live" tab, migration 027) ────────────────
// The kinds of "moment" the activity_feed() RPC streams. Each row is one thing
// that just happened in the app; the card renders differently per kind.
export type MomentKind = 'live_now' | 'event_boosted' | 'event_joined';

export interface ActivityMoment {
  moment_id: string;
  kind: MomentKind;
  sort_ts: string;
  event_id: string;
  title: string;
  activity: ActivityId;
  image_url: string | null;
  location_name: string | null;
  starts_at: string;
  ends_at: string | null;
  distance_m: number | null;
  host_id: string;
  host_name: string;
  host_photo_url: string | null;
  host_verified: boolean;
  // event_joined only: the most-recent joiner. Null for live_now / event_boosted.
  actor_id: string | null;
  actor_name: string | null;
  actor_photo_url: string | null;
  participant_count: number;
  friends_count: number;
  // event_joined only: joiners behind the actor ("+N others").
  extra_count: number;
  is_boosted: boolean;
}

// A wishlisted event with just enough attendee info for the wishlist cards
// (avatar stack + first few names).
export interface SavedEventItem extends NearbyEvent {
  attendees: Pick<Profile, 'id' | 'name' | 'photo_url'>[];
}

export interface EventParticipant extends Profile {
  status: ParticipantStatus;
  // Door check-in (migration 034). Optional pre-migration.
  checked_in_at?: string | null;
}

// The host's door secret for one event (migration 034). The token rides in the
// displayed QR; the code is the read-aloud fallback for guests who can't scan.
export interface CheckinQr {
  token: string;
  code: string;
}

// Result of an attendee checking themselves in (check_in_self RPC).
export type CheckinStatus = 'ok' | 'already' | 'bad_secret' | 'not_approved';

export interface CheckinResult {
  status: CheckinStatus;
  title?: string;
  checked_in_at?: string;
}

export interface EventDetail extends NearbyEvent {
  // All participants (both approved and pending). The UI splits these.
  participants: EventParticipant[];
}

export interface Message {
  id: string;
  event_id: string;
  sender_id: string;
  content: string;
  type: 'text' | 'system' | 'location' | 'image' | 'announcement';
  created_at: string;
  sender?: Profile;
  // Client-only optimistic state. Undefined once the server confirms the row
  // (via the realtime echo). 'sending' = in flight, 'failed' = insert errored.
  _status?: 'sending' | 'failed';
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  type: 'text' | 'image';
  created_at: string;
  // Read receipt (migration 031): set when the recipient opens the chat.
  read_at?: string | null;
  sender?: Profile;
  // Client-only optimistic state, same semantics as Message._status.
  _status?: 'sending' | 'failed';
}

// Per-user conversation preferences (migration 030). One row per (user, chat).
export interface ChatPref {
  user_id: string;
  chat_type: 'event' | 'dm';
  chat_id: string;
  pinned_at: string | null;
  muted: boolean;
  cleared_at: string | null;
}

export interface FriendConversation {
  friend: Profile;
  lastMessage: DirectMessage | null;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendStatus;
  created_at: string;
  updated_at: string;
  friend?: Profile;
}

export interface Notification {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  type: NotificationType;
  event_id: string | null;
  is_read: boolean;
  payload: Record<string, unknown>;
  created_at: string;
  sender?: Profile;
  event?: NearbyEvent;
}

// ── Post-event wrap (migrations 032/033) ─────────────────────────────────────

export type SuperlativeCategory =
  | 'mvp'
  | 'first_to_arrive'
  | 'next_host'
  | 'best_vibes';

export type PhotoReportReason =
  | 'inappropriate'
  | 'not_this_event'
  | 'spam'
  | 'remove_me'
  | 'other';

// The caller's progress through the wrap checklist for one event.
export interface WrapStatus {
  coAttendeeCount: number;
  ratedCount: number;
  myPhotoCount: number;
  votedCategories: SuperlativeCategory[];
  feedbackDone: boolean;
  isHost: boolean;
  viewCount: number;
  encoreRequested: boolean;
  encoreCount: number;
}

export interface CoAttendee {
  id: string;
  name: string;
  username?: string;
  photo_url: string | null;
  age: number | null;
  bio: string | null;
  thumbs_count: number;
  kyc_status?: KycStatus;
  isHost: boolean;
}

export interface WrapNote {
  id: string;
  event_id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  photo_url: string | null;
  opened_at: string | null;
  created_at: string;
  sender?: Profile;
  eventTitle?: string;
}

export interface WrapPhotoComment {
  photo_id: string;
  user_id: string;
  content: string;
  mentions: string[];
  created_at: string;
  author?: Profile;
}

export interface WrapPhoto {
  id: string;
  event_id: string;
  uploader_id: string;
  url: string;
  caption: string | null;
  mentions: string[];
  like_count: number;
  hidden: boolean;
  created_at: string;
  uploader?: Profile;
  comments?: WrapPhotoComment[];
  myLike?: boolean;
}

export interface SuperlativeWinner {
  category: SuperlativeCategory;
  votes: number;
  winner_id: string | null;
  winner_name: string | null;
  winner_photo_url: string | null;
}

export interface WrapSummary {
  attendeeCount: number;
  photoCount: number;
  likeCount: number;
  commentCount: number;
  messageCount: number;
  myThumbsReceived: number;
  superlatives: SuperlativeWinner[];
}

export interface EventFeedbackSummary {
  upCount: number;
  downCount: number;
  notes: string[];
}

// One wrap card in the Explore feed (from get_explore_wraps).
export interface ExploreWrap {
  event_id: string;
  title: string;
  activity: ActivityId;
  location_name: string | null;
  ended_at: string;
  photo_count: number;
  top_photos: { id: string; url: string; like_count: number }[];
}

// One photo row of the public gallery (from get_public_wrap).
export interface PublicWrapPhoto {
  event_id: string;
  title: string;
  activity: ActivityId;
  location_name: string | null;
  ended_at: string;
  photo_id: string;
  url: string;
  caption: string | null;
  like_count: number;
  uploader_id: string;
  uploader_name: string;
  uploader_photo_url: string | null;
}
