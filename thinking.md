# Part 3 — Thinking Question

**SCENARIO:** It is 3am. A guest at Villa B1 sends a WhatsApp message: "There is no hot water and we have guests arriving for breakfast in 4 hours. This is unacceptable. I want a refund for tonight."

### Question A — The Immediate Response
**What should the AI reply right now at 3am? Write the actual message. Explain in 2-3 lines why you chose this wording.**

**Reply:**
"Hi there, I am so sorry to hear about the hot water issue at Villa B1, especially with guests arriving soon. I have immediately escalated this to our 24/7 on-call team, and someone will reach out to you shortly to get this fixed. Please allow us a moment to address this, and management will discuss your compensation request in the morning."

**Explanation:**
At 3 AM, an AI cannot physically fix a geyser nor authorize a refund. The priority is de-escalation: validating their frustration, assuring them that action is being taken immediately (escalation to an emergency human contact), and deferring the financial demand to management during daytime.

### Question B — The System Design
**What should the platform do beyond sending a message? Walk through the full system response: what gets triggered, who gets notified, what gets logged, what happens if no human responds within 30 minutes.**

**System Response:**
- **0-2 minutes**: The system classifies the message as a `complaint` with low confidence, sends the automated empathetic response, logs the entry, and triggers a high-priority PagerDuty/WhatsApp alert to the on-call property manager and caretaker.
- **5-30 minutes**: The incident appears on the priority dashboard. If no staff acknowledges the alert within 30 minutes, the system initiates an automated phone call to the on-call manager and caretaker.
- **2+ hours**: If still unacknowledged, the issue escalates to the Level 2 Operations Director. The system automatically creates a follow-up task for the morning team to handle the refund request. 

### Question C — The Learning
**This is the third time in two months a guest has complained about hot water at Villa B1. What should the system do with this pattern? What would you build to prevent this complaint from happening a fourth time?**

**System Action:**
The analytics dashboard should flag recurring entity-based anomalies (e.g., `query_type: complaint` + keyword `hot water` + `property: Villa B1` > 2 times).

**Prevention Build:**
I would build a "Preventative Maintenance Workflow" module. When a threshold of similar hardware complaints is breached for a specific property, the system automatically:
1. Opens a high-priority maintenance ticket assigned to the vendor/plumber.
2. Blocks out the property calendar for a 1-day maintenance window if the issue isn't resolved permanently.
3. Alerts the Operations Team to replace the unit rather than repairing it, moving from reactive patching to proactive resolution.
