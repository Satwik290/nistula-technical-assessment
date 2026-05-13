-- =========================================================================
-- NISTULA UNIFIED MESSAGING PLATFORM — FULL SCHEMA
-- PostgreSQL 15+
-- =========================================================================
-- Design goal: One record per guest across all channels. One table for all
-- inbound messages. Every AI decision is auditable and human-correctable.
-- =========================================================================


-- =========================================================================
-- 1. GUESTS
-- One record per real person, regardless of which channel they used.
-- =========================================================================
CREATE TABLE guests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(255) UNIQUE,           -- Primary dedup key
  phone                VARCHAR(20),                   -- Secondary dedup key
  name                 VARCHAR(255) NOT NULL,
  source_first_contact VARCHAR(50),                   -- Which channel found us first
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Design note: We deduplicate on email (UNIQUE constraint) as the primary
-- identity anchor. Phone is stored but not UNIQUE because guest numbers
-- change more often than emails and carrier recycling causes false matches.
-- A real system would use fuzzy matching + a merge queue for edge cases.


-- =========================================================================
-- 2. PROPERTIES
-- Each managed villa/property.
-- =========================================================================
CREATE TABLE properties (
  id                    VARCHAR(50) PRIMARY KEY,       -- e.g. "villa-b1"
  name                  VARCHAR(255) NOT NULL,
  location              VARCHAR(255),
  bedrooms              INT,
  max_guests            INT,
  base_rate_inr         INT,                           -- per night, up to max_base_guests
  max_base_guests       INT DEFAULT 4,                 -- guests included in base rate
  extra_guest_rate_inr  INT,                           -- per night, per extra guest
  check_in_time         TIME DEFAULT '14:00',
  check_out_time        TIME DEFAULT '11:00',
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);


-- =========================================================================
-- 3. RESERVATIONS
-- Confirmed bookings linking a guest to a property for a date range.
-- =========================================================================
CREATE TABLE reservations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id     UUID REFERENCES guests(id) ON DELETE SET NULL,
  property_id  VARCHAR(50) REFERENCES properties(id),
  booking_ref  VARCHAR(100) UNIQUE NOT NULL,            -- e.g. "NIS-2024-0891"
  check_in     DATE NOT NULL,
  check_out    DATE NOT NULL,
  num_guests   INT NOT NULL DEFAULT 1,
  status       VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- confirmed, cancelled, completed
  channel      VARCHAR(50),                             -- booking.com, airbnb, direct, etc.
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_dates CHECK (check_out > check_in)
);

-- Design note: booking_ref is declared UNIQUE here and is the JOIN key
-- between inbound messages and reservations. A message that arrives with
-- a booking_ref but no matching row is a pre-sales or pre-migration message.


-- =========================================================================
-- 4. CONVERSATIONS
-- A thread: one guest ↔ one property ↔ optionally one reservation.
-- Groups messages into logical sessions.
-- =========================================================================
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id        UUID REFERENCES guests(id) ON DELETE SET NULL,
  property_id     VARCHAR(50) REFERENCES properties(id),
  reservation_id  UUID REFERENCES reservations(id) ON DELETE SET NULL,  -- NULL for pre-sales
  status          VARCHAR(50) NOT NULL DEFAULT 'active',  -- active, resolved, escalated
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Design note: Conversations exist as a middle layer so we can group
-- messages into threads without requiring a reservation. A guest can
-- message before they book (pre-sales), and the conversation can be
-- retroactively linked to a reservation once one is created.
-- Without this table, we'd have to link messages directly to reservations,
-- which breaks for pre-sales, Instagram DMs, and anonymous enquiries.


-- =========================================================================
-- 5. MESSAGES
-- Every inbound message across all channels. Append-only.
-- =========================================================================
CREATE TABLE messages (
  id                UUID PRIMARY KEY,                  -- Assigned by application (UUID v4)
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  guest_id          UUID REFERENCES guests(id) ON DELETE SET NULL,
  property_id       VARCHAR(50) REFERENCES properties(id),
  source            VARCHAR(50) NOT NULL,               -- whatsapp, booking_com, airbnb, instagram, direct
  source_message_id VARCHAR(255) UNIQUE,                -- Platform-native message ID for dedup
  message_text      TEXT NOT NULL,
  query_type        VARCHAR(50),                        -- Classification result (set after AI analysis)
  booking_ref       VARCHAR(100),                       -- Raw ref from payload; may be unmatched
  timestamp         TIMESTAMP NOT NULL,                 -- When the guest sent the message
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Design note: source_message_id is UNIQUE to prevent duplicate ingestion
-- if a webhook is retried (which all real platforms do). Without this,
-- a platform retry would create a duplicate message record and trigger
-- a second AI response to the same guest.


-- =========================================================================
-- 6. AI_RESPONSES
-- One row per message. Tracks the full AI → human → final reply lifecycle.
-- =========================================================================
CREATE TABLE ai_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID REFERENCES messages(id) ON DELETE CASCADE UNIQUE,
  drafted_reply     TEXT NOT NULL,                      -- Original Claude output
  confidence_score  DECIMAL(4, 3) NOT NULL,             -- 0.000 to 1.000
  action            VARCHAR(50) NOT NULL,                -- auto_send, agent_review, escalate
  query_type        VARCHAR(50),                        -- Classification label
  agent_edited      BOOLEAN NOT NULL DEFAULT FALSE,     -- Did an agent modify the reply?
  final_reply       TEXT,                               -- What was actually sent (null if escalated)
  was_auto_sent     BOOLEAN NOT NULL DEFAULT FALSE,     -- Was it sent without human intervention?
  agent_id          VARCHAR(100),                       -- Which agent acted on it (if any)
  actioned_at       TIMESTAMP,                          -- When it was sent or escalated
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Design note: Separating ai_responses from messages allows the AI draft
-- to be treated as a mutable staging record. The agent may rewrite it
-- entirely before sending. Storing both `drafted_reply` and `final_reply`
-- lets us later diff AI output vs human edits and fine-tune the prompt.
-- `was_auto_sent=TRUE` + `agent_edited=FALSE` means the AI was trusted
-- enough to send with no human involvement — a key metric for quality tracking.


-- =========================================================================
-- INDEXES — for query patterns in the application
-- =========================================================================
CREATE INDEX idx_guests_email          ON guests(email);
CREATE INDEX idx_guests_phone          ON guests(phone);
CREATE INDEX idx_reservations_booking  ON reservations(booking_ref);
CREATE INDEX idx_reservations_guest    ON reservations(guest_id);
CREATE INDEX idx_conversations_guest   ON conversations(guest_id);
CREATE INDEX idx_conversations_res     ON conversations(reservation_id);
CREATE INDEX idx_messages_convo        ON messages(conversation_id);
CREATE INDEX idx_messages_guest        ON messages(guest_id);
CREATE INDEX idx_messages_property     ON messages(property_id);
CREATE INDEX idx_messages_timestamp    ON messages(timestamp DESC);
CREATE INDEX idx_messages_booking_ref  ON messages(booking_ref);
CREATE INDEX idx_messages_source       ON messages(source);
CREATE INDEX idx_ai_responses_message  ON ai_responses(message_id);
CREATE INDEX idx_ai_responses_action   ON ai_responses(action);


-- =========================================================================
-- DESIGN DECISIONS
-- =========================================================================
--
-- Q: Why not link messages directly to reservations?
-- A: Pre-sales guests have no reservation yet. Instagram DMs may never have
--    one. Forcing a reservation FK on messages would break the omnichannel
--    promise. The Conversations table decouples message threading from
--    reservation state. A conversation starts open, and reservation_id is
--    filled in when (and if) a booking happens.
--
-- Q: Why is query_type on BOTH messages and ai_responses?
-- A: Messages.query_type is set from classification and is immutable — it
--    records what the guest asked. ai_responses.query_type is what the AI
--    labelled it after analysis. They should usually match, but tracking both
--    allows us to measure classification drift over time.
--
-- Q: Why DECIMAL(4,3) for confidence_score and not FLOAT?
-- A: FLOAT is imprecise for decimal values. A score of 0.35 stored as FLOAT
--    can read back as 0.3499999. We care about comparisons like score >= 0.85,
--    so exact decimal storage matters. DECIMAL(4,3) gives us 0.000–1.000 with
--    no rounding surprises.
--
-- Q: What's the hardest design decision?
-- A: The hardest decision was the Conversations table. The naive design puts
--    guest_id and reservation_id directly on messages. That works until you
--    hit: (1) pre-sales DMs with no reservation, (2) guests on multiple
--    concurrent bookings, (3) wanting to group a 3-message thread without
--    requiring a booking reference in every message. The Conversations table
--    adds one JOIN to every query, but it correctly models reality: a
--    "conversation" is a context unit that exists independently of whether
--    a booking exists. The cost is complexity; the gain is that the schema
--    never lies about the data.
