import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export class MessageRepository {
  public async saveMessage(data: any): Promise<void> {
    if (!process.env.DATABASE_URL) {
      console.log('[Mock DB] Message saved (DB skipped):', data.message_id);
      return;
    }

    try {
      // Ensure property exists to satisfy foreign key constraint
      if (data.property_id) {
        await prisma.property.upsert({
          where: { id: data.property_id },
          update: {},
          create: {
            id: data.property_id,
            name: 'Villa B1', // Default or fallback name
          }
        });
      }

      // Create message record
      const message = await prisma.message.create({
        data: {
          id: data.message_id,
          guest_id: null, // Populated after guest lookup if implemented
          property_id: data.property_id,
          source: data.source,
          message_text: data.message_text || data.message,
          query_type: data.query_type,
          booking_ref: data.booking_ref,
          timestamp: new Date(data.timestamp),
        },
      });

      await prisma.aiResponse.create({
        data: {
          id: uuidv4(),
          message_id: data.message_id,
          drafted_reply: data.drafted_reply,
          confidence_score: data.confidence_score,
          action: data.action,
        },
      });

      console.log('[✓ DB] Message + Response saved:', data.message_id);
    } catch (error: any) {
      console.error('[✗ DB] Save failed:', error);
      throw new Error(`Failed to persist message: ${error.message}`);
    }
  }
}

export const messageRepository = new MessageRepository();
