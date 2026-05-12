import request from 'supertest';
import app from '../src/index';
import { claudeService } from '../src/services/claude.service';

// Increase timeout for real API calls
jest.setTimeout(30000);

describe('POST /webhook/message', () => {
  
  it('Test 1: Pre-Sales Availability (Happy Path)', async () => {
    const payload = {
      source: 'booking_com',
      guest_name: 'Priya Kapoor',
      message: 'We are planning a getaway from April 20-24. Is Villa B1 available? How many bedrooms?',
      timestamp: new Date().toISOString(),
      booking_ref: 'BOOK-005',
      property_id: 'villa-b1'
    };

    const response = await request(app)
      .post('/webhook/message')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message_id');
    expect(response.body.query_type).toBe('pre_sales_availability');
    expect(response.body.confidence_score).toBeGreaterThanOrEqual(0.85);
    expect(response.body.action).toBe('auto_send');
    expect(response.body).toHaveProperty('drafted_reply');
  });

  it('Test 2: Complaint (Escalation Path)', async () => {
    const payload = {
      source: 'whatsapp',
      guest_name: 'Vikram Singh',
      message: 'There is NO hot water and we have guests arriving in 4 hours. This is completely unacceptable. I want a refund immediately.',
      timestamp: new Date().toISOString(),
      booking_ref: 'NIS-2024-0891',
      property_id: 'villa-b1'
    };

    const response = await request(app)
      .post('/webhook/message')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.query_type).toBe('complaint');
    expect(response.body.action).toBe('escalate');
    // Confidence score should be forced low for complaints
    expect(response.body.confidence_score).toBeLessThanOrEqual(0.60);
  });

  it('Test 3: General Enquiry (Ambiguous)', async () => {
    const payload = {
      source: 'instagram',
      guest_name: 'Arjun Reddy',
      message: 'Hi! Do you have any availability coming up? Also, do you offer any special packages?',
      timestamp: new Date().toISOString(),
      booking_ref: 'DM-2026-001',
      property_id: 'villa-b1'
    };

    const response = await request(app)
      .post('/webhook/message')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(200);
    // Depending on Claude, it might be pre_sales_availability or general_enquiry
    // but the action should likely be agent_review because packages are missing from context
    expect(['pre_sales_availability', 'general_enquiry']).toContain(response.body.query_type);
    expect(response.body.action).toBe('escalate');
    expect(response.body.confidence_score).toBeLessThanOrEqual(0.50);
  });

  it('Should return 400 for invalid payload', async () => {
    const payload = {
      source: 'invalid_source', // Invalid source
      guest_name: 'Test',
      message: 'Hello'
    };

    const response = await request(app)
      .post('/webhook/message')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('details');
  });

  it('Test 5: Post-Sales Check-in Query', async () => {
    const payload = {
      source: 'whatsapp',
      guest_name: 'Anjali Patel',
      message: 'We are checking in tomorrow. Can you send the WiFi password and check-in instructions?',
      timestamp: new Date().toISOString(),
      booking_ref: 'NIS-2024-0892',
      property_id: 'villa-b1'
    };

    const response = await request(app)
      .post('/webhook/message')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.query_type).toBe('post_sales_checkin');
    expect(response.body.action).toBe('auto_send');
    expect(response.body.drafted_reply).toContain('Nistula@2024');
  });

  it('Test 6: Special Request (Early Check-in)', async () => {
    const payload = {
      source: 'airbnb',
      guest_name: 'Rohan Kumar',
      message: 'Is early check-in possible? We have a flight arriving at 11am.',
      timestamp: new Date().toISOString(),
      booking_ref: 'NIS-2024-0893',
      property_id: 'villa-b1'
    };

    const response = await request(app)
      .post('/webhook/message')
      .send(payload);

    expect(response.status).toBe(200);
    expect(['special_request', 'post_sales_checkin']).toContain(response.body.query_type);
  });

  it('Test 7: Very Long Message (>2000 chars)', async () => {
    const payload = {
      source: 'whatsapp',
      guest_name: 'Long Message Guest',
      message: 'a'.repeat(3000),
      timestamp: new Date().toISOString(),
      booking_ref: 'NIS-2024-0894',
      property_id: 'villa-b1'
    };

    const response = await request(app)
      .post('/webhook/message')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('drafted_reply');
  });

  it('Test 8: Claude API Timeout Handling', async () => {
    // Mock Claude API to fail
    const spy = jest.spyOn(claudeService, 'analyzeMessage').mockRejectedValue(
      new Error('API timeout after 30s')
    );

    const payload = {
      source: 'whatsapp',
      guest_name: 'Timeout Guest',
      message: 'Hello',
      timestamp: new Date().toISOString(),
      booking_ref: 'NIS-2024-0895',
      property_id: 'villa-b1'
    };

    const response = await request(app)
      .post('/webhook/message')
      .send(payload);

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error');
    
    spy.mockRestore();
  });

});
