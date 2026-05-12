# Design Decisions

This document outlines the key design decisions made during the implementation of the Nistula Technical Assessment.

## 1. Technology Stack: Node.js, Express, and TypeScript

**Decision**: Use Node.js with Express and TypeScript instead of Python/FastAPI or plain JavaScript.
**Rationale**:
- **Type Safety**: TypeScript provides compile-time checks that prevent common errors (like typos in payload fields), making the code more maintainable.
- **Express ecosystem**: Express is lightweight and perfect for a simple webhook endpoint.
- **Asynchronous handling**: Node.js handles I/O operations (like calling the Claude API) extremely well.

## 2. Database Schema: The `conversations` Table

**Decision**: Introduce a `conversations` table between `guests` and `messages`, instead of linking messages directly to reservations or guests.
**Rationale**:
- **Omnichannel complexity**: A guest might message from WhatsApp without a booking yet (pre-sales). Linking messages directly to a `reservation_id` would fail here.
- **Normalization**: It prevents duplicating `guest_id` and `reservation_id` on every message row.
- **Context grouping**: It allows grouping messages into logical threads (conversations) which can later be linked to a reservation once booked.

## 3. AI Integration and Confidence Scoring

**Decision**: Instruct Claude to return structured JSON including a confidence score, rather than calculating confidence deterministically in code.
**Rationale**:
- Natural language queries are hard to score deterministically. Claude understands if the provided context actually answers the question.
- **Safety Net**: We implemented a hardcoded rule in code: if Claude classifies a message as a `complaint`, the confidence score is automatically overridden to be low (< 0.60), forcing an `escalate` action regardless of what the LLM outputted. This prevents AI from confidently mishandling complaints.

## 4. Part 3: Thinking Question Approach

**Decision**: Focus on de-escalation and structured escalation paths.
**Rationale**:
- At 3 AM, an AI cannot authorize refunds or fix hardware. Validating emotion and assuring human intervention is the best path.
- The system cascade (0-2m, 5-30m, 2h+) ensures accountability even if staff are asleep initially.
