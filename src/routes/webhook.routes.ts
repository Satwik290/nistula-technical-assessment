import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { validateRequest } from '../middlewares/validation.middleware';
import { WebhookPayloadSchema } from '../models/webhook.dto';

const router = Router();

router.post(
  '/message',
  validateRequest(WebhookPayloadSchema),
  webhookController.handleMessage.bind(webhookController)
);

export default router;
