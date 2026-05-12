# Nistula Technical Assessment - Guest Message Handler

This repository contains the completed Nistula Technical Assessment, including a webhook handler for guest messages, a PostgreSQL database schema design, and a system design thinking exercise.

## Project Structure

- `src/` - Contains the Express.js webhook API.
  - `src/index.ts` - Application entry point.
  - `src/routes/webhook.ts` - Webhook routing and logic.
  - `src/services/claude.ts` - Integration with Anthropic's Claude API.
- `schema.sql` - PostgreSQL schema design (Part 2).
- `thinking.md` - Answers to the 3 AM scenario (Part 3).

## Setup Instructions

1. **Clone the repository:**
   \`\`\`bash
   git clone <repository-url>
   cd nistula-technical-assessment
   \`\`\`

2. **Install Dependencies:**
   Ensure you have Node.js installed, then run:
   \`\`\`bash
   npm install
   \`\`\`

3. **Environment Variables:**
   Copy the example environment file and add the provided Claude API key.
   \`\`\`bash
   cp .env.example .env
   \`\`\`
   Edit `.env` to include the `CLAUDE_API_KEY`.

4. **Run the Server:**
   To run in development mode with `ts-node`:
   \`\`\`bash
   npm run dev
   \`\`\`
   The server will start on `http://localhost:3000`.

## Testing the API

You can test the endpoint using `curl`:

**Test 1: Pre-sales Availability (Should Auto Send)**
\`\`\`bash
curl -X POST http://localhost:3000/webhook/message \
-H "Content-Type: application/json" \
-d '{
   "source": "whatsapp",
   "guest_name": "Rahul Sharma",
   "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
   "timestamp": "2026-05-05T10:30:00Z",
   "booking_ref": "NIS-2024-0891",
   "property_id": "villa-b1"
}'
\`\`\`

**Test 2: Complaint (Should Escalate)**
\`\`\`bash
curl -X POST http://localhost:3000/webhook/message \
-H "Content-Type: application/json" \
-d '{
   "source": "whatsapp",
   "guest_name": "Rahul Sharma",
   "message": "The AC is broken and the room is hot. Fix it now.",
   "timestamp": "2026-05-05T10:30:00Z",
   "booking_ref": "NIS-2024-0891",
   "property_id": "villa-b1"
}'
\`\`\`

**Test 3: General Enquiry (Should likely result in agent_review or escalate as pets are not mentioned in context)**
\`\`\`bash
curl -X POST http://localhost:3000/webhook/message \
-H "Content-Type: application/json" \
-d '{
   "source": "whatsapp",
   "guest_name": "Rahul Sharma",
   "message": "Do you allow pets at the villa?",
   "timestamp": "2026-05-05T10:30:00Z",
   "booking_ref": "NIS-2024-0891",
   "property_id": "villa-b1"
}'
\`\`\`

## Confidence Scoring Logic

The confidence scoring determines the `action` field in the final JSON response. Since LLMs process natural language, traditional deterministic confidence scoring isn't applicable. Instead, we instruct Claude via the System Prompt to output a `confidence_score` between 0 and 1 based on how well the provided `Property Context` answers the guest's query.

- **0.90 - 1.0 (auto_send):** The context perfectly answers the question (e.g., standard check-in times, explicit availability).
- **0.60 - 0.89 (agent_review):** The context partially answers the question, or the query is ambiguous and a human should verify the drafted reply.
- **Below 0.60 (escalate):** The context does not answer the question, or the query is a `complaint` or a complex `special_request`. 

**Safety Net:** As an additional programmatic safety measure, if Claude classifies the message as a `complaint` but erroneously assigns a high confidence score, the server code forces the confidence score to `0.5`, ensuring the action resolves to `escalate`.

### Action Mapping:
- `confidence_score > 0.85` AND not a complaint ➔ `auto_send`
- `0.60 <= confidence_score <= 0.85` AND not a complaint ➔ `agent_review`
- `confidence_score < 0.60` OR query is `complaint` ➔ `escalate`
