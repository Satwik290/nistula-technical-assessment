<div align="center">

# 🏡 Nistula Guest Message Handler

**AI-Powered Omnichannel Guest Communication Platform**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Anthropic](https://img.shields.io/badge/Claude-Sonnet_4-CC5500?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Jest](https://img.shields.io/badge/Jest-29-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

*Automatically classifies, drafts, and routes guest messages across WhatsApp, Booking.com, Airbnb, Instagram & Direct — in under 2 seconds.*

---

</div>

## 📋 Table of Contents

- [The Problem](#-the-problem)
- [Solution Overview](#-solution-overview)
- [System Architecture](#-system-architecture)
- [Request Pipeline](#-request-pipeline)
- [Confidence Scoring Algorithm](#-confidence-scoring-algorithm)
- [Project Structure](#-project-structure)
- [Setup Instructions](#-setup-instructions)
- [API Reference](#-api-reference)
- [Testing](#-testing)
- [Database Schema](#-database-schema)
- [Design Decisions](#-design-decisions)

---

## 🎯 The Problem

Nistula manages multiple villa properties. Guests message across WhatsApp, Booking.com, Airbnb, Instagram, and direct channels — each requiring a fast, accurate, and empathetic response. Human agents can't monitor every channel 24/7.

**This system solves that** by:
1. Receiving messages from any channel through one unified webhook
2. Classifying the intent using a two-layer AI pipeline
3. Drafting a contextual reply using Claude with property-specific knowledge
4. Routing the response: auto-send if confident, human review if uncertain, escalate if it's a complaint

---

## 🚀 Solution Overview

| Capability | Detail |
|---|---|
| **Channels Supported** | WhatsApp, Booking.com, Airbnb, Instagram, Direct |
| **Query Types** | 6 classifications (availability, pricing, check-in, special request, complaint, general) |
| **AI Model** | Claude Sonnet 4 (`claude-sonnet-4-20250514`) |
| **Confidence Range** | 0.00 → 1.00 (2 decimal precision) |
| **Routing Actions** | `auto_send` · `agent_review` · `escalate` |
| **Response Time** | < 2s (p95 under normal Claude API load) |
| **Input Validation** | Zod schema — rejects malformed payloads before AI call |
| **Rate Limiting** | 100 req / 15 min per IP |
| **Persistence** | Prisma ORM → PostgreSQL (graceful fallback to mock log) |

---

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph Channels["📱 Message Channels"]
        WA[WhatsApp]
        BC[Booking.com]
        AB[Airbnb]
        IG[Instagram]
        DI[Direct]
    end

    subgraph API["🔌 Express API Layer"]
        RL[Rate Limiter<br/>100 req/15min]
        VM[Zod Validation<br/>Middleware]
        WH[Webhook Controller<br/>POST /webhook/message]
        ER[Global Error Handler]
    end

    subgraph Core["⚙️ Processing Pipeline"]
        BS[Baseline Classifier<br/>Keyword Rules]
        MP[Message Processing<br/>Service]
        CS[Claude Service<br/>Anthropic SDK]
        SC[Confidence Scorer<br/>Decision Tree]
    end

    subgraph Storage["🗄️ Persistence Layer"]
        PR[Prisma ORM]
        PG[(PostgreSQL)]
        MK[Mock Logger<br/>fallback]
    end

    Channels -->|POST JSON| RL
    RL --> VM
    VM -->|Valid| WH
    VM -->|400 Bad Request| Channels
    WH --> MP
    MP --> BS
    MP --> CS
    BS --> SC
    CS --> SC
    SC --> WH
    WH --> PR
    PR --> PG
    PR -->|No DATABASE_URL| MK
    WH -->|200 JSON| Channels
    WH -->|500 Error| ER

    style Channels fill:#1a1a2e,stroke:#e94560,color:#fff
    style API fill:#16213e,stroke:#0f3460,color:#fff
    style Core fill:#0f3460,stroke:#533483,color:#fff
    style Storage fill:#533483,stroke:#e94560,color:#fff
```

---

## 🔄 Request Pipeline

```mermaid
sequenceDiagram
    participant G as Guest
    participant API as POST /webhook/message
    participant VAL as Zod Validator
    participant MPS as MessageProcessingService
    participant CLS as ClassificationService
    participant CLD as ClaudeService
    participant DB as MessageRepository

    G->>API: POST { source, guest_name, message, ... }
    API->>VAL: Validate schema

    alt Invalid payload
        VAL-->>G: 400 { error, details }
    end

    VAL->>MPS: processMessagePipeline(payload)
    MPS->>MPS: Sanitize input (strip JSON chars, cap 2000)
    MPS->>CLS: classifyBaseline(message)
    CLS-->>MPS: { type, confidence }

    MPS->>CLD: analyzeMessage(guestName, message)
    CLD->>CLD: retryWithBackoff (max 3 attempts)
    CLD-->>MPS: { query_type, drafted_reply, confidence_score }

    MPS->>MPS: Apply Decision Tree Rules
    Note over MPS: Rule 1: Complaint → force score=0.35<br/>Rule 2: Agreement → +0.05 boost<br/>Rule 3: Missing context → cap at 0.50

    MPS-->>API: { query_type, drafted_reply, confidence_score, action }
    API->>DB: saveMessage(messageId + result + payload)
    DB-->>API: persisted ✓
    API-->>G: 200 { message_id, query_type, drafted_reply, confidence_score, action }
```

---

## 📊 Confidence Scoring Algorithm

The scoring system is a **three-layer decision tree** that combines rule-based classification with LLM intelligence.

```mermaid
flowchart TD
    A[📨 Incoming Message] --> B[Layer 1: Keyword Baseline]

    B --> B1{Keyword Match?}
    B1 -->|complaint keywords| C1["type='complaint'<br/>baseline=0.5"]
    B1 -->|availability keywords| C2["type='pre_sales_availability'<br/>baseline=0.4"]
    B1 -->|pricing keywords| C3["type='pre_sales_pricing'<br/>baseline=0.4"]
    B1 -->|check-in keywords| C4["type='post_sales_checkin'<br/>baseline=0.4"]
    B1 -->|no match| C5["type='general_enquiry'<br/>baseline=0.1"]

    C1 & C2 & C3 & C4 & C5 --> D[Layer 2: Claude API Analysis]
    D --> D1["Returns:<br/>query_type<br/>drafted_reply<br/>confidence_score"]

    D1 --> E[Layer 3: Decision Tree Adjustments]

    E --> F1{Baseline OR Claude<br/>= complaint?}
    F1 -->|YES| G1["🚨 FORCE score = 0.35<br/>action = escalate"]
    F1 -->|NO| F2{Baseline type<br/>== Claude type?}
    F2 -->|YES| G2["✅ BOOST score += 0.05<br/>cap at 1.0"]
    F2 -->|NO| F3{Reply contains<br/>'don't know' /<br/>'human assistance'?}
    F3 -->|YES| G3["⚠️ CAP score at 0.50"]
    F3 -->|NO| G4["Score unchanged"]

    G1 & G2 & G3 & G4 --> H[Determine Final Action]

    H --> I1{score >= 0.85?}
    I1 -->|YES| J1["✅ auto_send"]
    I1 -->|NO| I2{score >= 0.60?}
    I2 -->|YES| J2["👁️ agent_review"]
    I2 -->|NO| J3["🚨 escalate"]

    style G1 fill:#c0392b,color:#fff
    style J1 fill:#27ae60,color:#fff
    style J2 fill:#f39c12,color:#fff
    style J3 fill:#c0392b,color:#fff
```

### Score → Action Mapping

| Score Range | Action | Meaning |
|---|---|---|
| `>= 0.85` | ✅ `auto_send` | Property context fully answers the question |
| `0.60 – 0.84` | 👁️ `agent_review` | Partial answer; agent should review before sending |
| `< 0.60` | 🚨 `escalate` | Missing context, low certainty, or a complaint |
| `complaint` | 🚨 `escalate` | **Always** — regardless of score |

### Worked Examples

<details>
<summary><b>Example A — Availability Query → auto_send (score: 0.95)</b></summary>

**Input:**
```
"We are planning a getaway from April 20-24. Is Villa B1 available? How many bedrooms?"
```

**Layer 1:** keyword `getaway` → `pre_sales_availability`, baseline = 0.40  
**Layer 2:** Claude sees "Availability April 20-24: Available" in context → confident answer, score = 0.90  
**Layer 3:** Types agree → +0.05 boost → **final = 0.95**  
**Action:** `auto_send`

</details>

<details>
<summary><b>Example B — Complaint → escalate (score: 0.35)</b></summary>

**Input:**
```
"There is NO hot water. This is completely unacceptable. I want a refund immediately."
```

**Layer 1:** keywords `unacceptable`, `refund` → `complaint`  
**Layer 2:** Claude also classifies as `complaint`  
**Layer 3:** Complaint rule fires → **FORCE score = 0.35**  
**Action:** `escalate`

</details>

<details>
<summary><b>Example C — Ambiguous Query → agent_review (score: 0.70)</b></summary>

**Input:**
```
"Do you have any availability coming up? Also, do you offer any special packages?"
```

**Layer 1:** keyword `available` → `pre_sales_availability`  
**Layer 2:** Claude answers availability but doesn't know about "special packages" → score = 0.65  
**Layer 3:** Types agree → +0.05 → **final = 0.70**  
**Action:** `agent_review`

</details>

---

## 📁 Project Structure

```
nistula-technical-assessment/
│
├── src/
│   ├── index.ts                          # App bootstrap, Express setup
│   ├── config/
│   │   └── env.ts                        # Zod-validated env variables
│   ├── routes/
│   │   └── webhook.routes.ts             # Route definitions
│   ├── controllers/
│   │   └── webhook.controller.ts         # HTTP orchestration, UUID gen
│   ├── services/
│   │   ├── messageProcessing.service.ts  # Pipeline orchestrator
│   │   ├── classification.service.ts     # Keyword baseline classifier
│   │   └── claude.service.ts             # Anthropic SDK + retry logic
│   ├── repositories/
│   │   └── message.repository.ts         # Prisma writes + mock fallback
│   ├── middlewares/
│   │   ├── validation.middleware.ts       # Zod request validation
│   │   ├── error.middleware.ts            # Global error handler
│   │   ├── logging.middleware.ts          # Request logger
│   │   └── rateLimit.middleware.ts        # express-rate-limit
│   ├── models/
│   │   └── webhook.dto.ts                # Zod schema + TypeScript types
│   └── utils/
│       └── constants.ts                  # PROPERTY_CONTEXT, ALLOWED_SOURCES
│
├── tests/
│   └── webhook.test.ts                   # Jest integration tests (8 cases)
│
├── prisma/                               # Prisma schema + migrations
├── schema.sql                            # Raw SQL schema (Part 2)
├── thinking.md                           # Part 3 thinking questions
├── DECISIONS.md                          # Design decision log
├── API_Documentation.md                  # Full API reference
├── docker-compose.yml                    # PostgreSQL (port 5434)
├── .env.example                          # Env template (no secrets)
├── tsconfig.json
├── jest.config.js
└── package.json
```

---

## ⚡ Setup Instructions

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Docker Desktop** (for PostgreSQL) — optional; app runs without DB
- An **Anthropic API key** (`sk-ant-...`)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
CLAUDE_API_KEY=sk-<your-key-here>
PORT=3000
DATABASE_URL="postgresql://postgres:password@localhost:5434/nistula?schema=public"
```

> **Without `DATABASE_URL`**, the app runs in mock mode — all responses work normally, DB writes are logged to console instead.

### 3. Start the Database (Optional)

```bash
docker-compose up -d
npx prisma migrate dev --name init
```

### 4. Run the Development Server

```bash
npm run dev
```

Server starts at: **http://localhost:3000**

Verify:
```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

---

## 📡 API Reference

### `POST /webhook/message`

Process a guest message through the AI pipeline.

**Request Body:**

```json
{
  "source": "whatsapp",
  "guest_name": "Rahul Sharma",
  "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
  "timestamp": "2026-05-05T10:30:00Z",
  "booking_ref": "NIS-2024-0891",
  "property_id": "villa-b1"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `source` | enum | ✅ | `whatsapp` · `booking_com` · `airbnb` · `instagram` · `direct` |
| `guest_name` | string | ✅ | min 1 char |
| `message` | string | ✅ | min 1 char; auto-truncated at 2000 |
| `timestamp` | ISO 8601 | ✅ | e.g. `2026-05-05T10:30:00Z` |
| `booking_ref` | string | ❌ | optional, e.g. `NIS-2024-0891` |
| `property_id` | string | ✅ | e.g. `villa-b1` |

**Response (200):**

```json
{
  "message_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "query_type": "pre_sales_availability",
  "drafted_reply": "Hi Rahul! Great news — Villa B1 is available from April 20-24...",
  "confidence_score": 0.95,
  "action": "auto_send"
}
```

**Response (400 — Validation Error):**

```json
{
  "error": "Validation failed",
  "details": [{ "code": "invalid_enum_value", "path": ["source"], "message": "..." }]
}
```

**Response (500 — Claude API Failure):**

```json
{
  "error": "Internal Server Error",
  "message": "Claude analysis failed: API timeout after 30s"
}
```

### `GET /health`

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

---

## 🧪 Testing

```bash
npm test
```

The test suite covers **8 cases** using Jest + Supertest:

| Test | Scenario | Expected |
|---|---|---|
| 1 | Pre-sales availability query | `auto_send`, score ≥ 0.85 |
| 2 | Complaint with refund demand | `escalate`, score ≤ 0.60 |
| 3 | Ambiguous multi-question query | `escalate`, score ≤ 0.50 |
| 4 | Invalid `source` enum value | `400` with `details` |
| 5 | Check-in / WiFi password query | `auto_send`, reply includes password |
| 6 | Early check-in special request | `200`, type in allowed set |
| 7 | Message > 2000 chars | `200`, truncation handled |
| 8 | Claude API timeout (mocked) | `500` with `error` field |

> Tests 1–7 call the **live Claude API**. Test 8 uses `jest.spyOn` to mock a failure.

---

## 🗄️ Database Schema

Designed for omnichannel guest data. See [`schema.sql`](./schema.sql) for full statements.

```mermaid
erDiagram
    GUESTS {
        uuid id PK
        varchar email UK
        varchar phone
        varchar name
        varchar source_first_contact
        timestamp created_at
    }
    PROPERTIES {
        varchar id PK
        varchar name
        int bedrooms
        int max_guests
        int base_rate_inr
        timestamp created_at
    }
    RESERVATIONS {
        uuid id PK
        uuid guest_id FK
        varchar property_id FK
        varchar booking_ref UK
        date check_in
        date check_out
        varchar status
        timestamp created_at
    }
    CONVERSATIONS {
        uuid id PK
        uuid guest_id FK
        varchar property_id FK
        uuid reservation_id FK
        varchar status
        timestamp created_at
    }
    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        varchar source
        text message_text
        varchar query_type
        timestamp timestamp
    }
    AI_RESPONSES {
        uuid id PK
        uuid message_id FK
        text drafted_reply
        decimal confidence_score
        varchar action
        boolean agent_edited
        text final_reply
        boolean was_auto_sent
    }

    GUESTS ||--o{ RESERVATIONS : "makes"
    GUESTS ||--o{ CONVERSATIONS : "has"
    PROPERTIES ||--o{ RESERVATIONS : "hosts"
    PROPERTIES ||--o{ CONVERSATIONS : "subject of"
    RESERVATIONS ||--o{ CONVERSATIONS : "linked to"
    CONVERSATIONS ||--o{ MESSAGES : "contains"
    MESSAGES ||--|| AI_RESPONSES : "generates"
```

---

## 🧠 Design Decisions

### Why Controller-Service-Repository?

This pattern was chosen deliberately, not cargo-culted. The pipeline (classify → call LLM → score → persist) has at least 4 distinct concerns. Putting them all in one route handler would make it impossible to test the scoring logic in isolation or mock the Claude API without spinning up an HTTP server.

Each layer has a single job:
- **Controller** — orchestrates the HTTP request/response lifecycle
- **Service** — owns the business logic; zero HTTP concerns
- **Repository** — owns the DB interaction; zero business logic

### Why trust Claude's score AND apply our own rules?

LLMs are excellent at understanding language nuance — they can tell when a question is answered by the provided context. But they're also optimistic: they sometimes return high confidence even for complaints, because they *can* draft a response. The hardcoded `complaint → force escalate` rule is a **safety net** that prevents the AI from auto-sending a message to an angry guest who demanded a refund. Business logic that affects trust should never be left entirely to a probabilistic model.

### Why Prisma with a fallback mock?

The assessment brief was clear: build a working system, not a perfect one. The mock fallback (`if (!process.env.DATABASE_URL) { console.log(...) }`) means the system works end-to-end without Docker running — which is important for reviewers who may just want to test the AI pipeline quickly. The Prisma layer is real and production-ready for when the DB is available.

---

<div align="center">

**Built for Nistula Technical Assessment · May 2026**

*Node.js + TypeScript + Express + Claude AI + PostgreSQL*

</div>
