# Part 3 — Thinking Questions

**Scenario:** It is 3am. A guest at Villa B1 sends a WhatsApp message:
> "There is no hot water and we have guests arriving for breakfast in 4 hours. This is unacceptable. I want a refund for tonight."

---

### Question A — The Immediate Response

**Message the AI sends right now:**

> Hi Vikram — I'm so sorry. No hot water at 3am with guests arriving in 4 hours is a serious problem and we are treating it that way.
>
> Our emergency caretaker has been alerted and will call you within 15 minutes. If the heater can't be fixed quickly, we will arrange a portable hot water solution before your guests arrive.
>
> Our manager will also contact you directly to discuss tonight's charges.
>
> Emergency line if you need us before then: +91-XXXX-XXXX-XXXX (say "Villa B1 urgent").

**Why this wording:**
The message acknowledges the severity without sounding scripted. It leads with a concrete action and a time commitment — not an apology loop. It surfaces the refund topic ("discuss tonight's charges") without either promising or refusing one, because that decision belongs to a human. Guests in crisis need to feel heard and see movement, not platitudes.

---

### Question B — The System Design

The moment the webhook receives this message and the confidence score is forced to `0.35` with `action = escalate`, the following happens:

**0–2 minutes:**
- The escalation record is written to `ai_responses` with `action = 'escalate'`
- An outbound alert fires via SMS + push to the property manager and on-call caretaker
- A high-priority support ticket is created with tag `URGENT: MAINTENANCE` and the full message thread attached
- The AI's drafted reply is sent to the guest immediately — not held for agent approval

**5–30 minutes:**
- If no human acknowledges the ticket within 10 minutes, a second alert escalates to the property owner
- The caretaker calls the guest directly
- If the issue is fixable (heater reset, pilot light), it's resolved on-site. If not, a portable workaround is arranged
- The agent opens the ticket, reviews the drafted reply, and logs the actual action taken

**If no human responds within 30 minutes:**
- A final escalation SMS goes to the owner with a clear message: "Guest at Villa B1 has not received a response. Ticket open 30 minutes."
- The ticket status auto-escalates to `CRITICAL` in the dashboard
- A secondary on-call number is tried

**Logged throughout:**
- Every alert sent and to whom, with timestamps
- Which agent acknowledged and when
- The caretaker's action log (fixed / workaround / unresolved)
- Whether a refund was offered, amount, and authorizing agent

---

### Question C — The Learning

This is the third hot water complaint in 60 days at Villa B1. The system should flag this as a **property-level pattern**, not an isolated incident.

**What the system does automatically:**
- After the second complaint of the same type within 60 days, a `property_alert` record is created: `{ property: "villa-b1", issue_type: "hot_water", count: 2, window: "60d" }`
- On the third, the owner receives a report: "Villa B1 has had 3 hot water complaints in 60 days. This requires a maintenance inspection before the next check-in."

**What I'd build to prevent a fourth:**
1. **Trend dashboard** — A simple table: property × complaint type × count in rolling 30/60/90 days. Visible to the operations manager weekly.
2. **Mandatory maintenance gate** — After 2 complaints of the same type, the next check-in is gated: the caretaker must mark a maintenance checklist complete before the property status is set to "ready". The checklist item for "hot water heater inspected" is pre-populated.
3. **Predictive scheduling** — Log *when* failures happen (season, ambient temp, occupancy level). If the heater consistently fails in winter or under 6+ guests, schedule a pre-season service every October automatically.
4. **Root cause capture** — The caretaker's resolution log must include a `root_cause` field (e.g. "sediment buildup", "pilot light", "power trip"). After 3 occurrences with the same root cause, that's a replacement decision, not a repair one.

The goal is to make the fourth complaint structurally impossible, not just unlikely.
