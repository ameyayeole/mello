import { ActivityId } from '@/types/models';

// Visual style per activity category, from the Mello design system.
// Display-only — does not alter Activity data or backend fields.
export interface CategoryStyle {
  accent: string;
  tint: string;
}

export const CATEGORY_STYLE: Record<ActivityId, CategoryStyle> = {
  // Nightlife & Parties — pink/magenta (Boiler Room leans purple/underground)
  parties:      { accent: '#D6478E', tint: '#FBE7F1' },
  drinks:       { accent: '#FF5E5B', tint: '#FFF0EF' },
  house_party:  { accent: '#D6478E', tint: '#FBE7F1' },
  club_night:   { accent: '#B5439E', tint: '#F7E6F4' },
  boiler_room:  { accent: '#7C5CE0', tint: '#F0ECFC' },
  karaoke:      { accent: '#D6478E', tint: '#FBE7F1' },

  // Music & Live — purple
  music:        { accent: '#7C5CE0', tint: '#F0ECFC' },
  live_gig:     { accent: '#7C5CE0', tint: '#F0ECFC' },
  open_mic:     { accent: '#8A5BD8', tint: '#F1ECFB' },
  jam_session:  { accent: '#7C5CE0', tint: '#F0ECFC' },
  standup:      { accent: '#9B57C9', tint: '#F4EAFA' },
  concert:      { accent: '#7C5CE0', tint: '#F0ECFC' },
  dj_set:       { accent: '#6E4FD6', tint: '#EEE9FB' },

  // Sports — blue
  cricket:      { accent: '#2A6FDB', tint: '#E9F0FC' },
  football:     { accent: '#2A6FDB', tint: '#E9F0FC' },
  badminton:    { accent: '#2A6FDB', tint: '#E9F0FC' },
  volleyball:   { accent: '#2A6FDB', tint: '#E9F0FC' },
  basketball:   { accent: '#2A6FDB', tint: '#E9F0FC' },
  table_tennis: { accent: '#2A6FDB', tint: '#E9F0FC' },
  tennis:       { accent: '#2A6FDB', tint: '#E9F0FC' },
  running:      { accent: '#2A6FDB', tint: '#E9F0FC' },
  cycling:      { accent: '#2A6FDB', tint: '#E9F0FC' },
  swimming:     { accent: '#2A6FDB', tint: '#E9F0FC' },

  // Wellness — teal/green
  gym:          { accent: '#2A6FDB', tint: '#E9F0FC' },
  yoga:         { accent: '#1FA463', tint: '#E6F5EE' },
  meditation:   { accent: '#0E8F8F', tint: '#E2F2F2' },

  // Food & Drinks — warm amber
  coffee:       { accent: '#C8791E', tint: '#FBF0E2' },
  food:         { accent: '#C8791E', tint: '#FBF0E2' },
  brunch:       { accent: '#C8791E', tint: '#FBF0E2' },

  // Outdoors & Travel — green
  trekking:     { accent: '#1FA463', tint: '#E6F5EE' },
  camping:      { accent: '#1FA463', tint: '#E6F5EE' },
  beach:        { accent: '#0E8F8F', tint: '#E2F2F2' },
  road_trip:    { accent: '#C8791E', tint: '#FBF0E2' },

  // Creative & Culture — lilac
  art:          { accent: '#7C5CE0', tint: '#F0ECFC' },
  photography:  { accent: '#7C5CE0', tint: '#F0ECFC' },
  dance:        { accent: '#D6478E', tint: '#FBE7F1' },
  movies:       { accent: '#7C5CE0', tint: '#F0ECFC' },

  // Social & Growth — teal
  study:        { accent: '#0E8F8F', tint: '#E2F2F2' },
  volunteering: { accent: '#1FA463', tint: '#E6F5EE' },
  networking:   { accent: '#0E8F8F', tint: '#E2F2F2' },
  book_club:    { accent: '#0E8F8F', tint: '#E2F2F2' },
  board_games:  { accent: '#7C5CE0', tint: '#F0ECFC' },

  // Play — purple
  gaming:       { accent: '#7C5CE0', tint: '#F0ECFC' },
};

export function categoryStyle(id: ActivityId | string): CategoryStyle {
  return CATEGORY_STYLE[id as ActivityId] ?? { accent: '#FF5E5B', tint: '#FFF0EF' };
}
