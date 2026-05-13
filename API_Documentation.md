# Nistula Guest Message Handler — API Documentation

**Version:** 1.0.0  
**Base URL:** `http://localhost:3000`  
**Last Updated:** May 13, 2026

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Endpoints](#endpoints)
3. [Request Schema](#request-schema)
4. [Response Schema](#response-schema)
5. [Confidence Scoring](#confidence-scoring)
6. [Error Reference](#error-reference)
7. [Code Examples](#code-examples)
8. [Rate Limiting](#rate-limiting)
9. [Testing](#testing)

---

## Quick Start

```bash
# 1. Install and run
npm install && npm run dev

# 2. Send a test message
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "source": "whatsapp",
    "guest_name": "Rahul Sharma",
    "message": "Is the villa available from April 20 to 24?",
    "timestamp": "2026-05-13T10:30:00Z",
    "property_id": "villa-b1"
  }'
```

**Response:**
```json
{
  "message_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "query_type": "pre_sales_availability",
  "drafted_reply": "Hi Rahul! Great news — Villa B1 is available from April 20-24...",
  "confidence_score": 0.95,
  "action": "auto_send"
}
```

---

## Endpoints

### `POST /webhook/message`

Process a guest message through the AI classification and response pipeline.

**Content-Type:** `application/json`

---

### `GET /health`

Health check. Not rate-limited.

**Response (200):**
```json
{ "status": "ok" }
```

---

## Request Schema

All fields are validated by Zod before reaching the controller. Invalid requests are rejected with `400` before any Claude API call is made.

```typescript
{
  source:      "whatsapp" | "booking_com" | "airbnb" | "instagram" | "direct"  // Required
  guest_name:  string    // Required, min 1 char
  message:     string    // Required, min 1 char — auto-truncated at 2000 chars
  timestamp:   string    // Required, ISO 8601 — e.g. "2026-05-13T10:30:00Z"
  booking_ref: string    // Optional — e.g. "NIS-2024-0891"
  property_id: string    // Required — e.g. "villa-b1"
}
```

---

## Response Schema

### Success (`200`)

```typescript
{
  message_id:       string   // UUID v4, generated server-side
  query_type:       string   // One of 6 classification types (see below)
  drafted_reply:    string   // AI-generated response, safe to send on "auto_send"
  confidence_score: number   // 0.00 – 1.00, 2 decimal places
  action:           "auto_send" | "agent_review" | "escalate"
}
```

### Query Type Values

| Value | Meaning |
|---|---|
| `pre_sales_availability` | Guest asking about dates or availability |
| `pre_sales_pricing` | Guest asking about rates or costs |
| `post_sales_checkin` | Confirmed guest asking about check-in, WiFi, access |
| `special_request` | Early check-in, transfers, dietary needs |
| `complaint` | Dissatisfaction, hardware failure, refund demand |
| `general_enquiry` | Amenities, policies, parking, pets |

### Action Values

| Action | Trigger | Meaning |
|---|---|---|
| `auto_send` | `confidence >= 0.85` | Send `drafted_reply` directly to guest |
| `agent_review` | `0.60 <= confidence < 0.85` | Queue for human review before sending |
| `escalate` | `confidence < 0.60` OR `query_type == complaint` | Route to human immediately — do not send AI reply |

---

## Confidence Scoring

### How It Works

The confidence score is produced by a **three-layer algorithm** — not just the LLM output.

#### Layer 1 — Keyword Baseline

Before calling Claude, a keyword scan classifies the message type and sets a starting position. This catches obvious patterns like `"refund"`, `"unacceptable"` (→ complaint) without spending API tokens.

#### Layer 2 — Claude Analysis

The message is sent to `claude-sonnet-4-20250514` with the full property context (rates, availability, WiFi password, etc). Claude returns:
- `query_type` — its own classification
- `drafted_reply` — a response based *only* on the provided context
- `confidence_score` — how well the context answered the question

Temperature is set to `0.1` to minimize variance between runs.

#### Layer 3 — Decision Tree Adjustments

```
RULE 1 (Complaint Safety Net):
  IF baseline.type == "complaint" OR claude.type == "complaint"
  → FORCE confidence = 0.35
  → FORCE action = "escalate"
  Rationale: Never auto-send to an angry guest. Hard override prevents
  a confident-sounding AI reply from bypassing escalation.

RULE 2 (Agreement Boost):
  IF baseline.type == claude.type AND type != "complaint"
  → confidence += 0.05 (capped at 1.0)
  Rationale: If two independent classifiers agree, the answer is
  more likely correct. Small boost to reflect that convergence.

RULE 3 (Missing Context Penalty):
  IF drafted_reply contains "don't know" OR "don't have" OR "human assistance"
  → confidence = min(confidence, 0.50)
  Rationale: Claude is instructed to admit when the context doesn't
  contain the answer. If it does, we cap the score to prevent auto-send.
```

### Score → Action Reference

| Score | Action | Real Meaning |
|---|---|---|
| `>= 0.85` | `auto_send` | Context fully covers the question |
| `0.60 – 0.84` | `agent_review` | Partial answer or minor ambiguity |
| `< 0.60` | `escalate` | Missing context, uncertain, or complaint |
| `any` + complaint | `escalate` | **Always — rule 1 overrides** |

---

## Error Reference

All error responses follow this shape:

```json
{
  "error": "string",
  "message": "string",
  "details": [ ... ]
}
```

### `400` — Validation Failed

**Cause:** Payload fails Zod schema check.

```json
{
  "error": "Validation failed",
  "details": [
    {
      "code": "invalid_enum_value",
      "path": ["source"],
      "message": "Invalid enum value. Expected 'whatsapp' | 'booking_com' | 'airbnb' | 'instagram' | 'direct', received 'telegram'"
    }
  ]
}
```

Common triggers:
- `source` not in the allowed enum
- `guest_name` or `message` is empty string
- `property_id` missing
- `timestamp` missing

---

### `429` — Rate Limited

**Cause:** IP exceeded 100 requests in 15 minutes.

```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

**Headers returned:**
```
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1715425200
```

Wait for the reset timestamp before retrying.

---

### `500` — Internal Server Error

**Cause:** Claude API failure, JSON parse error, or unhandled exception.

```json
{
  "error": "Internal Server Error",
  "message": "Claude analysis failed: API timeout after 30 seconds"
}
```

The Claude service automatically retries **3 times with exponential backoff** on `429` rate limit errors before returning a `500`. Other errors (auth failure, parse failure) propagate immediately.

---

## Code Examples

### Node.js (fetch)

```javascript
const response = await fetch('http://localhost:3000/webhook/message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: 'whatsapp',
    guest_name: 'Rahul Sharma',
    message: 'Is the villa available April 20-24?',
    timestamp: new Date().toISOString(),
    property_id: 'villa-b1'
  })
});

const data = await response.json();

if (data.action === 'auto_send') {
  await sendToGuest(data.drafted_reply);
} else if (data.action === 'agent_review') {
  await queueForReview(data);
} else {
  await escalateToManager(data);
}
```

### Python

```python
import requests
from datetime import datetime, timezone

payload = {
    'source': 'booking_com',
    'guest_name': 'Priya Kapoor',
    'message': 'What is the WiFi password?',
    'timestamp': datetime.now(timezone.utc).isoformat(),
    'property_id': 'villa-b1'
}

res = requests.post('http://localhost:3000/webhook/message', json=payload)
data = res.json()

print(f"Action: {data['action']} | Score: {data['confidence_score']}")
```

### cURL — Full Test Suite

```bash
# Test 1: Availability (expects auto_send)
curl -s -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{"source":"whatsapp","guest_name":"Rahul","message":"Is Villa B1 available April 20-24?","timestamp":"2026-05-13T10:30:00Z","property_id":"villa-b1"}' | jq .

# Test 2: Complaint (expects escalate)
curl -s -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{"source":"whatsapp","guest_name":"Vikram","message":"No hot water. Unacceptable. I want a refund.","timestamp":"2026-05-13T03:00:00Z","property_id":"villa-b1"}' | jq .

# Test 3: Validation error (expects 400)
curl -s -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{"source":"telegram","guest_name":"Test","message":"Hello","timestamp":"2026-05-13T10:00:00Z","property_id":"villa-b1"}' | jq .
```

---

## Rate Limiting

- **Policy:** 100 requests per 15 minutes per IP address
- **Scope:** `/webhook/message` only. `/health` is exempt.
- **Retry-After:** Check the `RateLimit-Reset` header for the Unix timestamp when the window resets.

The Claude service itself implements separate retry logic for Anthropic's own rate limits (HTTP 429 from Claude API), using exponential backoff: 2s → 4s → 8s before failing.

---

## Testing

```bash
npm test
```

8 integration tests using Jest + Supertest. Tests 1–7 call the live Claude API. Test 8 uses `jest.spyOn` to simulate an API timeout without network calls.

```
✓ Pre-Sales Availability (Happy Path)
✓ Complaint — force escalate
✓ Ambiguous multi-question — missing context penalty
✓ Invalid payload — 400 validation error
✓ Post-Sales check-in — WiFi password in reply
✓ Special Request — early check-in
✓ Long message (>2000 chars) — truncation handled
✓ Claude API timeout (mocked) — 500 returned
```

> Set `jest.setTimeout(30000)` in the test file to accommodate real API latency.
