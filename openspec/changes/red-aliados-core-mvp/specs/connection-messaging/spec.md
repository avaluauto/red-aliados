# Connection Messaging Specification

## Purpose

Lightweight, origin-scoped messaging thread for traceable pre- and post-acceptance negotiation, with real contact revealed only on acceptance.

## Requirements

### Requirement: Origin-Scoped Thread

The system MUST provide one message thread per `connection_request` origin, visible only to the two participating tenants (per network-authorization), backed by Supabase Realtime on a single `messages` table.

#### Scenario: Thread visible to both participants
- GIVEN a connection request between tenant A and tenant B
- WHEN either tenant opens the thread
- THEN both can read and send messages in real time
- AND no third tenant can read the thread

### Requirement: Contact Reveal Only on Acceptance

The thread MUST NOT surface the counterpart's phone/WhatsApp until the connection request is accepted; once accepted, the contact becomes visible per tenant-directory rules.

#### Scenario: No contact shown while pending
- GIVEN a pending connection request with an active thread
- WHEN either party views the thread
- THEN no phone/WhatsApp value is shown

#### Scenario: Contact appears after acceptance
- GIVEN the request transitions to `accepted`
- WHEN either party reopens the thread
- THEN the counterpart's phone/WhatsApp is now visible for off-platform negotiation

### Requirement: Scope Cap

The system MUST NOT implement attachments, presence indicators, or read receipts in this MVP.

#### Scenario: Feature absence verified
- GIVEN the messaging UI
- WHEN a user looks for attachment upload, presence, or read-receipt controls
- THEN none exist
