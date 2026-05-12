import { claudeService } from './claude.service';
import { classificationService } from './classification.service';
import { WebhookPayloadDTO } from '../models/webhook.dto';

export class MessageProcessingService {
  public async processMessagePipeline(payload: WebhookPayloadDTO & { _messageId?: string }) {
    const { guest_name, message, source, booking_ref, property_id, timestamp } = payload;
    
    // Sanitize input to prevent prompt injection
    const sanitizedMessage = message
      .replace(/[{}\[\]]/g, '') // Remove JSON-like syntax
      .substring(0, 2000); // Enforce length limit
      
    // 1. Get Baseline
    const baseline = classificationService.classifyBaseline(sanitizedMessage);
    
    // 2. Call Claude API
    const claudeResult = await claudeService.analyzeMessage(guest_name, sanitizedMessage);
    
    // 3. Multi-factor scoring algorithm
    let finalType = claudeResult.query_type;
    let finalConfidence = claudeResult.confidence_score;
    
    // Rule 1: Complaint Detection & Force Escalation
    const isComplaint = baseline.type === 'complaint' || finalType === 'complaint';
    if (isComplaint) {
      finalType = 'complaint';
      finalConfidence = 0.35; // Always < 0.60 for escalation
    }
    
    // Rule 2: Agreement boost (only if not a complaint)
    if (!isComplaint && baseline.type === claudeResult.query_type) {
      finalConfidence = Math.min(finalConfidence + 0.05, 1.0);
    }
    
    // Rule 3: Missing Context Penalty
    const replyLower = claudeResult.drafted_reply.toLowerCase();
    if (replyLower.includes("don't know") ||
        replyLower.includes("don't have") ||
        replyLower.includes("human assistance")) {
      finalConfidence = Math.min(finalConfidence, 0.50);
    }

    // 4. Determine Action
    const action = this.determineAction(finalType, finalConfidence);
    
    return {
      query_type: finalType,
      drafted_reply: claudeResult.drafted_reply,
      confidence_score: Number(finalConfidence.toFixed(2)),
      action: action
    };
  }

  private determineAction(queryType: string, confidence: number): string {
    if (queryType === 'complaint') {
      return 'escalate'; // Always escalate complaints
    }
    if (confidence >= 0.85) {
      return 'auto_send'; // High confidence
    }
    if (confidence >= 0.60) {
      return 'agent_review'; // Medium confidence
    }
    return 'escalate'; // Low confidence or missing context
  }
}

export const messageProcessingService = new MessageProcessingService();
