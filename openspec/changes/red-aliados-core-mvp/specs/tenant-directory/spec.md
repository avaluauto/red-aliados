# Tenant Directory Specification

## Purpose

Mirror tenant identity and a single responsible contact, and control when contact details versus reputation are visible to a prospective counterpart.

## Requirements

### Requirement: One Contact Per Tenant

The system MUST store exactly one responsible contact (name, phone/WhatsApp) per tenant record, synced from V2. The system MUST NOT model contacts per-vehicle or per-connection.

#### Scenario: Contact sourced from tenant sync
- GIVEN V2 syncs tenant B with a responsible contact (name, phone)
- WHEN Red Aliados mirrors tenant B
- THEN exactly one contact record exists for tenant B, independent of how many vehicles or connections it has

### Requirement: Reputation Visible Pre-Connection

The system MUST show a tenant's computed reputation score on its directory/candidate card to a prospective counterpart when a `connection_requests` row with `status` of `suggested` or `pending` links the two tenants (see network-connections: Candidate Visibility Tier), as long as authorization layers 1 and 3 (module enabled, network access granted) pass. The system MUST NOT expose reputation for a tenant with no such linking row — there is no open directory browsing of the entire network; a tenant with neither a `suggested`/`pending` connection request nor an active connection to another tenant MUST see zero rows for that tenant (see network-authorization).

#### Scenario: Candidate card shows reputation before connecting
- GIVEN tenant A (network access granted) and tenant B are linked by a `suggested` or `pending` connection request
- WHEN the candidate card renders
- THEN tenant B's reputation score/badge is visible
- AND tenant B's phone/WhatsApp is NOT visible

#### Scenario: No reputation visibility without a linking request
- GIVEN tenant A and tenant C have no `suggested`/`pending` connection request and no active connection between them
- WHEN tenant A attempts to browse tenant C's directory/candidate card
- THEN zero rows are returned for tenant C

### Requirement: Contact Reveal Gated by Acceptance

Phone/WhatsApp contact details MUST remain hidden until a mutual connection between the two tenants is accepted (see network-connections). The system MUST NOT reveal contact details for pending, rejected, or expired requests.

#### Scenario: Contact hidden while request pending
- GIVEN tenant A sent a connection request to tenant B that is still pending
- WHEN tenant A views tenant B's directory entry
- THEN no phone/WhatsApp value is returned

#### Scenario: Contact revealed after acceptance
- GIVEN tenant B accepted tenant A's connection request
- WHEN tenant A views tenant B's directory entry
- THEN tenant B's phone/WhatsApp is now visible
