-- =========================================================================
-- NISTULA UNIFIED MESSAGING PLATFORM SCHEMA
-- =========================================================================

-- Design Decision: We use UUIDs for primary keys to ensure global uniqueness,
-- especially important for a distributed system or when importing data from
-- external channels like WhatsApp, Booking.com, etc.

-- 1. Guests Table
-- Stores a single unified profile for a guest.
-- Hardest Design Decision: How to link guests across different channels?
-- Reason: A guest might message from WhatsApp (phone number) and Booking.com (email).
-- We need a unified profile. We'll store primary contact info here, but specific 
-- channel identities (like a WhatsApp number or Booking.com ID) should ideally 
-- be in a separate `guest_identities` table if there are many. For simplicity 
-- in this schema, we store the primary email and phone, and assume matching 
-- logic happens at the application layer to resolve to a `guest_id`.
CREATE TABLE guests (
    guest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Properties Table
-- Stores details about properties.
CREATE TABLE properties (
    property_id VARCHAR(100) PRIMARY KEY, -- e.g., 'villa-b1'
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Reservations Table
-- Links a guest to a specific property and booking.
CREATE TABLE reservations (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID NOT NULL REFERENCES guests(guest_id) ON DELETE CASCADE,
    property_id VARCHAR(100) NOT NULL REFERENCES properties(property_id),
    booking_ref VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'NIS-2024-0891'
    check_in_date DATE,
    check_out_date DATE,
    status VARCHAR(50) DEFAULT 'confirmed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Conversations Table
-- Groups messages together. Linked to a guest and optionally a reservation.
-- Design Decision: A conversation might start before a reservation exists 
-- (pre-sales), so `reservation_id` is nullable.
CREATE TABLE conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID NOT NULL REFERENCES guests(guest_id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES reservations(reservation_id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'closed', 'needs_attention'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Messages Table
-- Stores all inbound and outbound messages across all channels.
CREATE TABLE messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    source_channel VARCHAR(50) NOT NULL, -- 'whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct'
    message_text TEXT NOT NULL,
    
    -- AI and Processing Metadata
    query_type VARCHAR(100), -- e.g., 'pre_sales_availability', 'complaint'
    confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
    action_taken VARCHAR(50), -- 'auto_send', 'agent_review', 'escalate'
    processing_status VARCHAR(50) DEFAULT 'pending', -- 'ai_drafted', 'agent_edited', 'auto_sent', 'delivered'
    
    -- Agent Tracking
    handled_by_agent_id UUID, -- References an internal users/agents table (omitted for brevity)
    
    -- Timestamps
    channel_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- When it was actually sent/received on the channel
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_conversations_guest_id ON conversations(guest_id);
CREATE INDEX idx_reservations_guest_id ON reservations(guest_id);
CREATE INDEX idx_reservations_booking_ref ON reservations(booking_ref);

-- =========================================================================
-- HARDEST DESIGN DECISION
-- =========================================================================
-- The hardest design decision was determining how to associate a message with a 
-- reservation versus a guest, particularly when handling omnichannel communications. 
-- In hospitality, a guest (e.g., Rahul) might inquire about a future booking on 
-- Instagram (no reservation yet) and later complain about a current stay on 
-- WhatsApp (linked to a reservation). 
-- 
-- I chose to introduce a `conversations` table as an intermediary between `messages` 
-- and `guests/reservations`. This allows a conversation to exist independently of 
-- a reservation (for pre-sales inquiries) while still being tied to the `guest_id`. 
-- If the conversation turns into a booking, or relates to an existing booking, the 
-- `reservation_id` on the `conversations` table can be populated. This creates a 
-- clean hierarchy where we don't have to duplicate `guest_id` or `reservation_id` 
-- on every single message row, while keeping the data perfectly normalized.
