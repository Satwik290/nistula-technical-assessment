import Anthropic from '@anthropic-ai/sdk';
import { PROPERTY_CONTEXT } from '../utils/constants';
import { ClaudeResponseDTO } from '../models/webhook.dto';
import { env } from '../config/env';

const anthropic = new Anthropic({
  apiKey: env.CLAUDE_API_KEY,
});

export const SYSTEM_PROMPT = `You are a customer service agent for Nistula, managing Villa B1.
Analyze the guest message and return a JSON object with:
1. "query_type": Classification (pre_sales_availability, pre_sales_pricing, post_sales_checkin, special_request, complaint, general_enquiry).
2. "drafted_reply": Reply based ONLY on the context below. If the context does not contain the answer, state that you don't know and offer human assistance.
3. "confidence_score": Score between 0 and 1.

Property Context:
${PROPERTY_CONTEXT}

Respond ONLY with valid JSON:
{
  "query_type": "string",
  "drafted_reply": "string",
  "confidence_score": number
}`;

export class ClaudeService {
  public async analyzeMessage(guestName: string, messageText: string): Promise<ClaudeResponseDTO> {
    // Edge case: handle long messages
    let processedMessage = messageText;
    if (messageText.length > 2000) {
      processedMessage = messageText.substring(0, 2000) + "... [Message truncated for length]";
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Guest Name: ${guestName}\nMessage: ${processedMessage}`
        }
      ],
      temperature: 0.1,
    });

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const responseText = contentBlock.text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse JSON from Claude response');
    }

    return JSON.parse(jsonMatch[0]) as ClaudeResponseDTO;
  }
}

export const claudeService = new ClaudeService();
