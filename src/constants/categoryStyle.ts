import { ActivityId } from '@/types/models';

// Visual style per activity category, from the Mello design system.
// Display-only — does not alter Activity data or backend fields.
export interface CategoryStyle {
  accent: string;
  tint: string;
}

export const CATEGORY_STYLE: Record<ActivityId, CategoryStyle> = {
  coffee:   { accent: '#C8791E', tint: '#FBF0E2' },
  drinks:   { accent: '#FF5E5B', tint: '#FFF0EF' },
  music:    { accent: '#7C5CE0', tint: '#F0ECFC' },
  trekking: { accent: '#1FA463', tint: '#E6F5EE' },
  gym:      { accent: '#2A6FDB', tint: '#E9F0FC' },
  study:    { accent: '#0E8F8F', tint: '#E2F2F2' },
  parties:  { accent: '#D6478E', tint: '#FBE7F1' },
  gaming:   { accent: '#7C5CE0', tint: '#F0ECFC' },
};

export function categoryStyle(id: ActivityId | string): CategoryStyle {
  return CATEGORY_STYLE[id as ActivityId] ?? { accent: '#FF5E5B', tint: '#FFF0EF' };
}
