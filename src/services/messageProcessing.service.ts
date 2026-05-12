import { claudeService } from './claude.service';
import { classificationService } from './classification.service';
import { WebhookPayloadDTO } from '../models/webhook.dto';

export class MessageProcessingService {
  public async processMessagePipeline(payload: WebhookPayloadDTO) {
    const { guest_name, message } = payload;
    
    // 1. Get Baseline
    const baseline = classificationService.classifyBaseline(message);
    
    // 2. Call Claude API
    const claudeResult = await claudeService.analyzeMessage(guest_name, message);
    
    // 3. Multi-factor scoring algorithm
    let finalType = claudeResult.query_type;
    let finalConfidence = claudeResult.confidence_score;
    
    // Rule 1: Complaints override and force low confidence
    if (baseline.type === 'complaint' || finalType === 'complaint') {
      finalType = 'complaint';
      finalConfidence = Math.min(finalConfidence, 0.4); 
    }
    
    // Rule 2: Agreement boost
    if (baseline.type === claudeResult.query_type && finalType !== 'complaint') {
      finalConfidence = Math.min(finalConfidence + 0.05, 1.0);
    }
    
    // Rule 3: Missing context penalty
    if (claudeResult.drafted_reply.includes("don't know") || claudeResult.drafted_reply.includes("human assistance")) {
      finalConfidence = Math.min(finalConfidence, 0.5);
    }

    // 4. Determine Action
    let action = 'escalate';
    if (finalType === 'complaint') {
      action = 'escalate';
    } else if (finalConfidence >= 0.85) {
      action = 'auto_send';
    } else if (finalConfidence >= 0.60) {
      action = 'agent_review';
    }
    
    return {
      query_type: finalType,
      drafted_reply: claudeResult.drafted_reply,
      confidence_score: Number(finalConfidence.toFixed(2)),
      action: action
    };
  }
}

export const messageProcessingService = new MessageProcessingService();
