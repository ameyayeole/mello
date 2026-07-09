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
  | 'join_request'
  | 'join_approved'
  | 'event_update'
  | 'new_message'
  | 'event_starting_soon'
  | 'friend_joined_event';

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

export interface EventParticipant extends Profile {
  status: ParticipantStatus;
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
  type: 'text' | 'system' | 'location';
  created_at: string;
  sender?: Profile;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  type: 'text';
  created_at: string;
  sender?: Profile;
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
