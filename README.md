# Nistula Technical Assessment - Guest Message Handler

This repository contains the completed Nistula Technical Assessment, featuring an automated guest message handler, a database schema design, and a system design thinking exercise.

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file from `.env.example` and add your Anthropic API key:
   ```bash
   CLAUDE_API_KEY=sk-ant-...
   PORT=3000
   DATABASE_URL="postgresql://postgres:password@localhost:5432/nistula?schema=public"
   ```

3. **Database Setup (Docker):**
   Start the PostgreSQL database using Docker Compose:
   ```bash
   docker-compose up -d
   ```

4. **Run the Server:**
   ```bash
   npm run dev
   ```
   The server will start on `http://localhost:3000`.

## Confidence Scoring Logic

We use a **Multi-Factor Scoring Algorithm** (Decision Tree) to determine the confidence score and the resulting action:

1. **Baseline Classification**: A rule-based keyword match checks for high-risk words (e.g., "broken", "refund") to establish a baseline type and confidence.
2. **Claude API Evaluation**: The message is sent to Claude with the property context. Claude returns a classification and its own confidence score.
3. **Decision Tree Logic**:
   - **Complaints**: If either baseline or Claude detects a complaint, the score is forced to be low (< 0.4) and the action is forced to `escalate`.
   - **Agreement Boost**: If Claude's classification matches the baseline keyword match, confidence is boosted by +0.05.
   - **Missing Context Penalty**: If Claude's reply indicates it doesn't know the answer (due to missing context in the prompt), confidence is capped at 0.5.

### Scoring Breakdown Examples:
- **Availability Query** (Context contains answer): Score ~0.90 -> `auto_send`
- **Ambiguous Query** (Context partially covers): Score ~0.70 -> `agent_review`
- **Complaint** (AC broken): Score <= 0.40 -> `escalate`

## Architecture Decisions

- **Why Node vs Python?** Node.js with Express and TypeScript was chosen for its excellent async performance handling I/O (like API calls) and strong type safety.
- **Why this project structure?** We split the pipeline into `messageProcessor` (logic), `propertyContext` (data), and `claudePrompt` (integration) to keep the code modular and testable (Separation of Concerns).
- **What would you do differently with more time?** I would implement the actual Prisma database writes in the webhook handler to persist the messages and responses as per the designed schema.

## Testing

To run the health check:
```bash
curl http://localhost:3000/health
```

To test the webhook, use the following curl commands:

**Test 1: Pre-Sales Availability (Happy Path)**
```bash
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
```

**Test 2: Complaint (Escalation Path)**
```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "source": "whatsapp",
    "guest_name": "Vikram Singh",
    "message": "There is NO hot water and we have guests arriving in 4 hours. This is completely unacceptable. I want a refund immediately.",
    "timestamp": "2026-05-05T10:30:00Z",
    "booking_ref": "NIS-2024-0891",
    "property_id": "villa-b1"
  }'
```

## API Documentation

### Endpoint: `POST /webhook/message`

**Request Schema (Validated via Zod):**
```json
{
  "source": "whatsapp" | "booking_com" | "airbnb" | "instagram" | "direct",
  "guest_name": "string",
  "message": "string",
  "timestamp": "string",
  "booking_ref": "string",
  "property_id": "string"
}
```

**Response Schema:**
```json
{
  "message_id": "uuid",
  "query_type": "string",
  "drafted_reply": "string",
  "confidence_score": number,
  "action": "auto_send" | "agent_review" | "escalate"
}
```
