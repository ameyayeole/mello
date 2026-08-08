export type ActivityId =
  // Nightlife & Parties
  | 'parties'
  | 'drinks'
  | 'house_party'
  | 'club_night'
  | 'boiler_room'
  | 'karaoke'
  // Music & Live
  | 'music'
  | 'live_gig'
  | 'open_mic'
  | 'jam_session'
  | 'standup'
  | 'concert'
  | 'dj_set'
  // Sports
  | 'cricket'
  | 'football'
  | 'badminton'
  | 'volleyball'
  | 'basketball'
  | 'table_tennis'
  | 'tennis'
  | 'running'
  | 'cycling'
  | 'swimming'
  // Wellness
  | 'gym'
  | 'yoga'
  | 'meditation'
  // Food & Drinks
  | 'coffee'
  | 'food'
  | 'brunch'
  // Outdoors & Travel
  | 'trekking'
  | 'camping'
  | 'beach'
  | 'road_trip'
  // Creative & Culture
  | 'art'
  | 'photography'
  | 'dance'
  | 'movies'
  // Social & Growth
  | 'study'
  | 'volunteering'
  | 'networking'
  | 'book_club'
  | 'board_games'
  // Play
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
  | 'wrap_unlocked'
  | 'note_received'
  | 'photo_liked'
  | 'photo_commented'
  | 'encore_requested'
  // Community posts (migration 046+)
  | 'post_liked'
  | 'post_commented'
  | 'comment_reply'
  | 'comment_liked'
  | 'comment_mention'
  | 'post_mention'
  | 'poll_closed';

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
  // Read off the verified ID and locked once kyc_status === 'approved'
  // (migration 036). Absent before that migration / verification.
  date_of_birth?: string | null;
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
  // 'poll' carries its question in `content`, so every surface that already
  // shows a message preview shows the question with no extra work.
  type: 'text' | 'system' | 'location' | 'image' | 'announcement' | 'poll';
  created_at: string;
  sender?: Profile;
  // Reply (migration 072). The quoted text and author are a snapshot taken when
  // the reply was sent — see the migration for why they are not a join.
  reply_to_id?: string | null;
  reply_preview?: string | null;
  reply_sender_name?: string | null;
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
  // Reply (migration 072). The quoted text and author are a snapshot taken when
  // the reply was sent — see the migration for why they are not a join.
  reply_to_id?: string | null;
  reply_preview?: string | null;
  reply_sender_name?: string | null;
  // Client-only optimistic state, same semantics as Message._status.
  _status?: 'sending' | 'failed';
}

// What a composer is replying to: the id to link, plus the snapshot to render
// and to store on the reply. Built by `replyTargetOf` in utils/chatActions so
// both threads truncate and label it the same way.
export interface ReplyTarget {
  id: string;
  preview: string;
  senderName: string;
}

// A poll attached to a chat message (migration 073). The question lives on the
// message's `content`; this is everything below it.
export interface MessagePollOption {
  id: string;
  idx: number;
  label: string;
  vote_count: number;
}

export interface MessagePoll {
  message_id: string;
  options: MessagePollOption[];
  // The option this viewer picked, or null if they have not voted. Votes are
  // readable only by their owner (RLS), so this is genuinely per-viewer.
  my_option_id: string | null;
}

// Which of the two chats a reaction hangs off. The table stores it as one of
// two nullable columns; everything above the service says 'event' | 'dm'.
export type ReactionTarget = 'event' | 'dm';

// A tapback (migration 041). One row per person per message.
// The minimum ReactionPills needs to group and count a reaction. Both
// MessageReaction and PhotoReaction satisfy it, which is what lets one pills
// component serve chat and the wrap gallery — two copies would drift.
export interface ReactionLike {
  user_id: string;
  emoji: string;
}

export interface MessageReaction extends ReactionLike {
  id: string;
  message_id: string | null;
  dm_id: string | null;
  created_at: string;
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

// Someone who finished the wrap's contribution flow. Shown on the wrap hub so
// the people who have not yet contributed can see who has.
export interface WrapContributor {
  id: string;
  name: string;
  photo_url: string | null;
}

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
  // ── The social gate (get_wrap_gate, migration 075) ────────────────────────
  // How many people finished the whole contribution flow.
  contributorCount: number;
  // How many are required before the recap opens. Computed SERVER-SIDE and
  // never recomputed here — two app versions must not disagree about whether a
  // wrap is unlocked.
  contributorsNeeded: number;
  contributors: WrapContributor[];
  // Negative before the event ends. Only compared against 48 (see wrapGate.ts).
  hoursSinceEnd: number;
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
  id: string;
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
  reactions?: PhotoReaction[];
  // The emoji I picked, if any. Null rather than false — "which one" replaced
  // "whether", and a boolean here would quietly discard the choice.
  myReaction?: string | null;
}

// Same shape as MessageReaction (041) minus the two-target check — a photo
// reaction has exactly one parent.
export interface PhotoReaction extends ReactionLike {
  id: string;
  photo_id: string;
  created_at: string;
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

// ── Community feed (posts) ───────────────────────────────────────────────────

export type PostType = 'text' | 'photo' | 'poll' | 'shared_wrap';
export type PostVisibility = 'public' | 'friends';

// One post as returned by the community_feed() RPC (author fields flattened).
export interface CommunityPost {
  id: string;
  author_id: string;
  author_name: string;
  author_photo_url: string | null;
  type: PostType;
  visibility: PostVisibility;
  body: string | null;
  media: string[];
  // Set only on shared_wrap posts → the referenced event's wrap (migration 060
  // returns it from the feed / user_posts RPCs).
  ref_wrap_event_id: string | null;
  // An event the author linked to this post (migration 070). Optional on every
  // type — a poll about an event is still a poll — and distinct from
  // ref_wrap_event_id, which is a *wrap* reference required on shared_wraps.
  ref_event_id: string | null;
  city: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  comments_enabled: boolean;
  created_at: string;
  // Ranking score from the frozen session snapshot (migration 066). Cards
  // ignore it; it is here for debugging "why is this post fourth?".
  score: number;
  // Present only on rows from community_feed_page. Pagination is driven by
  // `offset < session_total`, never by page length — a post moderated
  // mid-session drops out of its slice and shortens the page.
  session_id?: string;
  session_total?: number;
}

// One poll option with its aggregate (anonymous) tally. `vote_count` is the
// trigger-maintained count; who voted for what is never exposed.
export interface PollOption {
  id: string;
  idx: number;
  label: string;
  vote_count: number;
}

// A poll's render data, loaded per-post by usePoll (not folded into the feed).
// `my_option_id` is read from the viewer's own vote row — the only one RLS lets
// them see — and is null until they vote. A cast is locked (no changing it).
export interface Poll {
  post_id: string;
  closes_at: string;
  options: PollOption[];
  my_option_id: string | null;
}

// One comment as returned by post_comments_ranked / post_comment_replies.
// `body` is null when the comment is a tombstone (deleted parent kept for its
// replies → rendered as "comment removed"). `reply_count` is present on
// top-level rows only.
export interface PostComment {
  id: string;
  author_id: string;
  author_name: string;
  author_username: string;
  author_photo_url: string | null;
  body: string | null;
  mentions: string[];
  like_count: number;
  reply_count?: number;
  deleted: boolean;
  liked_by_me: boolean;
  created_at: string;
}
