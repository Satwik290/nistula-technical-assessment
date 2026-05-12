import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { messageProcessingService } from '../services/messageProcessing.service';
import { messageRepository } from '../repositories/message.repository';
import { WebhookPayloadDTO } from '../models/webhook.dto';

export class WebhookController {
  public async handleMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    const messageId = uuidv4(); // Generate FIRST

    try {
      const payload: WebhookPayloadDTO = req.body; // Guaranteed by validation middleware

      // Process and pass message_id through pipeline
      const result = await messageProcessingService.processMessagePipeline({
        ...payload,
        _messageId: messageId, // Add as internal field
      });

      // Construct final response
      const responseData = {
        message_id: messageId,
        query_type: result.query_type,
        drafted_reply: result.drafted_reply,
        confidence_score: result.confidence_score,
        action: result.action
      };

      // Persist to database with same messageId
      await messageRepository.saveMessage({
        ...responseData,
        ...payload,
      });

      res.status(200).json(responseData);
    } catch (error) {
      next(error); // Pass to error middleware
    }
  }
}

export const webhookController = new WebhookController();
