import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful and professional customer service agent for Nistula, managing Villa B1 in Assagao, North Goa.

Property Context:
- Property: Villa B1, Assagao, North Goa
- Bedrooms: 3 | Max guests: 6 | Private pool: Yes
- Check-in: 2pm | Check-out: 11am
- Base rate: INR 18,000 per night (up to 4 guests)
- Extra guest: INR 2,000 per night per person
- WiFi password: Nistula@2024
- Caretaker: Available 8am to 10pm
- Chef on call: Yes, pre-booking required
- Availability April 20-24: Available
- Cancellation: Free up to 7 days before check-in

Task:
Analyze the incoming guest message and provide:
1. "query_type": Classify the message into one of these exact categories: pre_sales_availability, pre_sales_pricing, post_sales_checkin, special_request, complaint, general_enquiry.
2. "drafted_reply": A professional drafted reply answering the guest's query based ONLY on the provided property context. If the context does not contain enough information to answer fully, acknowledge that and offer to connect them with a human agent. Do not invent information.
3. "confidence_score": A number between 0 and 1 indicating how confident you are in your reply based on the provided context.
   - 0.9 to 1.0: Context fully answers the question.
   - 0.6 to 0.89: Context partially answers, or the query is slightly ambiguous.
   - Below 0.6: Context does not answer the question, or it's a complex complaint/special request needing human intervention. Note: ALWAYS give complaints a confidence score below 0.6.

Respond ONLY with a valid JSON object matching this schema:
{
  "query_type": "string",
  "drafted_reply": "string",
  "confidence_score": "number"
}`;

export interface ClaudeResponse {
  query_type: string;
  drafted_reply: string;
  confidence_score: number;
}

export async function processMessage(guestName: string, messageText: string): Promise<ClaudeResponse> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Guest Name: ${guestName}\nMessage: ${messageText}`
        }
      ],
      temperature: 0.1,
    });

    const contentBlock = response.content[0];
    if (contentBlock.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const responseText = contentBlock.text;
    
    // Parse JSON from the response (handling potential markdown formatting like \`\`\`json)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse JSON from Claude response');
    }

    const parsedData: ClaudeResponse = JSON.parse(jsonMatch[0]);
    
    // Additional validation
    if (parsedData.query_type === 'complaint' && parsedData.confidence_score >= 0.6) {
        parsedData.confidence_score = 0.5; // Force low confidence for complaints as a safety net
    }

    return parsedData;
  } catch (error) {
    console.error('Error in Claude service:', error);
    throw error;
  }
}
