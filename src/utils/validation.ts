import { z } from 'zod';
import { ACTIVITIES } from '@/constants/activities';

const activityIds = ACTIVITIES.map((a) => a.id) as [string, ...string[]];

export const ProfileSetupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  age: z.number().min(18, 'Must be 18+').max(100, 'Invalid age'),
  bio: z.string().max(200).optional(),
});

export const CreateEventSchema = z.object({
  activity: z.enum(activityIds as [string, ...string[]]),
  title: z.string().min(3, 'Title too short').max(80),
  description: z.string().max(500).optional(),
  startsAt: z.date(),
  endsAt: z.date().optional(),
  maxPeople: z.number().min(2).max(20).optional(),
  isPublic: z.boolean().default(true),
  locationLat: z.number(),
  locationLng: z.number(),
  locationName: z.string().optional(),
});

export type ProfileSetupForm = z.infer<typeof ProfileSetupSchema>;
export type CreateEventForm = z.infer<typeof CreateEventSchema>;
