# Network Connections Specification

## Purpose

Double opt-in connection lifecycle between tenants, with a 48h expiry window and reciprocal edges on acceptance. Includes a manual, operator-seeded cold-start path for the pilot.

## Requirements

### Requirement: Connection Request Origins

The system MUST support `connection_request` rows with `origin_type` of `vehicle_interest`, `search_match`, or `direct` (Avaluauto-suggested candidate).

#### Scenario: Vehicle-interest origin
- GIVEN a user is viewing a peer tenant's vehicle at the `candidate` visibility tier (see Requirement: Candidate Visibility Tier)
- WHEN they initiate a connection request
- THEN a `connection_request` row is created with `origin_type = vehicle_interest`

### Requirement: Suggested Status for Seeded Requests

Seeded requests (see Manual Cold-Start Seeding) MUST be created with `status = 'suggested'` and `expires_at = null`. A `suggested` request MUST NOT expire and MUST NOT emit `reputation_events`. When the recipient tenant acts on a suggested request, the row MUST transition to `status = 'pending'` with `expires_at = now() + interval '48 hours'`; from that point the standard 48-hour expiry and reputation-event rules (see 48-Hour Expiry with Double Opt-In) apply as for any other pending request.

#### Scenario: Suggested request created inert
- GIVEN an operator seeds a `direct`-origin `connection_request` for tenant A and tenant B
- WHEN the row is inserted
- THEN `status = 'suggested'` and `expires_at = null`
- AND no `reputation_events` row is emitted
- AND the request does not expire regardless of elapsed time

#### Scenario: Recipient acts on a suggestion
- GIVEN a `suggested` connection request links tenant A and tenant B
- WHEN the recipient tenant acts on it
- THEN the row transitions to `status = 'pending'` with `expires_at = now() + interval '48 hours'`
- AND subsequent accept/reject/expiry and reputation-event behavior follows the standard pending-request rules

### Requirement: Manual Cold-Start Seeding (Direct Origin)

For this MVP, `connection_request` rows with `origin_type = direct` MUST be insertable only by an operator/service role via direct database access (e.g. Supabase Studio), not by tenant end-users. The system MUST NOT require a dedicated admin UI or automated matching engine for this capability in this MVP; those are explicitly out of scope.

#### Scenario: Operator seeds a suggested candidate
- GIVEN an Avaluauto operator identifies tenant A and tenant B as a good candidate pair
- WHEN the operator inserts a `connection_request` row with `origin_type = direct` via Studio
- THEN the row is created with `status = 'suggested'` (see Requirement: Suggested Status for Seeded Requests), not as a live pending request
- AND no admin screen was required to produce it

#### Scenario: End-user cannot create a direct-origin request
- GIVEN a tenant end-user
- WHEN they use the app UI
- THEN they have no path to create a `connection_request` with `origin_type = direct`

### Requirement: Candidate Visibility Tier

While a `connection_request` row with `status` of `suggested` or `pending` links two tenants, each tenant MUST be able to view the other's vehicles at the `candidate` visibility tier: the vehicle row is visible, but the owning tenant's name and contact details MUST be masked (see tenant-directory, network-authorization). This tier is narrower than full connection visibility, which requires an active `connection_edges` row (see 48-Hour Expiry with Double Opt-In). A tenant pair with neither a `suggested`/`pending` connection request nor an active `connection_edges` row between them MUST see zero rows for each other, consistent with network-authorization's deny-by-default enforcement — the candidate tier does not relax that default, it only names the intermediate state.

#### Scenario: Candidate tier masks identity before connection
- GIVEN tenant A and tenant B are linked by a `suggested` connection request and no `connection_edges` row exists between them
- WHEN tenant A queries tenant B's vehicles
- THEN tenant B's vehicles are returned
- AND tenant B's name and contact details are masked/omitted

#### Scenario: No visibility without a linking request or edge
- GIVEN tenant A and tenant C have no `connection_request` row (suggested or pending) and no `connection_edges` row between them
- WHEN tenant A queries tenant C's vehicles
- THEN zero rows are returned

### Requirement: 48-Hour Expiry with Double Opt-In

The system MUST require explicit acceptance by the recipient tenant; it MUST NOT auto-accept. A pending request MUST expire automatically 48 hours after creation if left unanswered.

#### Scenario: Accepted within window
- GIVEN a pending connection request younger than 48h
- WHEN the recipient explicitly accepts
- THEN reciprocal `connection_edges` rows are created for both tenants
- AND the request outcome is recorded as `accepted`

#### Scenario: Explicitly rejected
- GIVEN a pending connection request
- WHEN the recipient explicitly rejects
- THEN no `connection_edges` are created
- AND the outcome is recorded as `rejected`

#### Scenario: Ignored past 48 hours
- GIVEN a pending connection request with no response
- WHEN 48 hours elapse
- THEN the request auto-transitions to `expired`
- AND no `connection_edges` are created
