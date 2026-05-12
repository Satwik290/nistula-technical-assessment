import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { processMessage } from '../services/claude';

const router = Router();

interface WebhookPayload {
  source: string;
  guest_name: string;
  message: string;
  timestamp: string;
  booking_ref: string;
  property_id: string;
}

function determineAction(confidenceScore: number, queryType: string): string {
  if (queryType === 'complaint') {
    return 'escalate';
  }
  if (confidenceScore > 0.85) {
    return 'auto_send';
  }
  if (confidenceScore >= 0.60 && confidenceScore <= 0.85) {
    return 'agent_review';
  }
  return 'escalate';
}

router.post('/message', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload: WebhookPayload = req.body;

    // Basic validation
    if (!payload.message || !payload.guest_name || !payload.source) {
      res.status(400).json({ error: 'Missing required fields: message, guest_name, source' });
      return;
    }

    const allowedSources = ['whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct'];
    if (!allowedSources.includes(payload.source)) {
      res.status(400).json({ error: `Invalid source. Must be one of: ${allowedSources.join(', ')}` });
      return;
    }

    // Call Claude API for classification and drafted reply
    const claudeResult = await processMessage(payload.guest_name, payload.message);

    // Determine the action based on confidence score and query type
    const action = determineAction(claudeResult.confidence_score, claudeResult.query_type);

    // Construct the final normalized response
    const responseData = {
      message_id: uuidv4(),
      query_type: claudeResult.query_type,
      drafted_reply: claudeResult.drafted_reply,
      confidence_score: claudeResult.confidence_score,
      action: action
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Return a 500 error, but you might want to return a fallback response in a real system
    res.status(500).json({ error: 'Failed to process message' });
  }
});

export default router;
