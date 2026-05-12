import request from 'supertest';
import app from '../src/index';

// Increase timeout for real API calls
jest.setTimeout(30000);

describe('POST /webhook/message', () => {
  
  it('Test 1: Pre-Sales Availability (Happy Path)', async () => {
    const payload = {
      source: 'booking_com',
      guest_name: 'Priya Kapoor',
      message: 'We are planning a getaway from May 10–15. Is Villa B1 available? How many bedrooms?',
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
    expect(response.body.action).toBe('agent_review');
    expect(response.body.confidence_score).toBeLessThan(0.85);
    expect(response.body.confidence_score).toBeGreaterThanOrEqual(0.50);
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

});
