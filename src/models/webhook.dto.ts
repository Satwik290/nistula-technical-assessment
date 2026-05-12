import { z } from 'zod';
import { ALLOWED_SOURCES } from '../utils/constants';

export const WebhookPayloadSchema = z.object({
  source: z.enum(ALLOWED_SOURCES),
  guest_name: z.string().min(1, "Guest name is required"),
  message: z.string().min(1, "Message is required"),
  timestamp: z.string(),
  booking_ref: z.string().optional(),
  property_id: z.string()
});

export type WebhookPayloadDTO = z.infer<typeof WebhookPayloadSchema>;

export interface ClaudeResponseDTO {
  query_type: string;
  drafted_reply: string;
  confidence_score: number;
}
