# Targeted Search (Conseguir) Specification

## Purpose

Let a tenant register a sourcing request, search its own inventory first, then opt in to fan out to already-connected tenants only, without auto-sharing or owning CRM pipeline.

## Requirements

### Requirement: Own-Inventory-First Search

The system MUST search the requesting tenant's own synced inventory before offering any network fan-out.

#### Scenario: Own inventory match found first
- GIVEN a tenant registers a sourcing request matching one of its own vehicles
- WHEN the search runs
- THEN the own-inventory match is shown before any network option is presented

### Requirement: Opt-In Fan-Out to Connected Tenants Only

The system MUST require an explicit opt-in action before searching beyond the tenant's own inventory, and MUST restrict that fan-out to tenants with an active mutual connection (per network-authorization). Unconnected tenants' vehicles MUST NOT appear.

#### Scenario: Fan-out limited to connected tenants
- GIVEN tenant A is connected to tenant B but not tenant C
- WHEN tenant A opts in to network fan-out for a sourcing request
- THEN matching vehicles from tenant B may appear
- AND no vehicle from tenant C appears

### Requirement: No Auto-Share; Explicit Proceed Fires Opportunity Event

A match MUST NOT automatically share the vehicle or notify its owner. Only when the requester explicitly proceeds MUST the system fire an event that creates an Opportunity in V2's CRM; Red Aliados MUST NOT manage or store CRM pipeline state beyond that trigger.

#### Scenario: Match alone does not share
- GIVEN a fan-out search returns a match
- WHEN the requester merely views the match
- THEN no data has been shared with the match owner and no Opportunity exists yet

#### Scenario: Proceeding creates a V2 Opportunity
- GIVEN the requester selects a match and explicitly proceeds
- WHEN they confirm
- THEN an event fires that creates an Opportunity in V2's CRM
- AND Red Aliados does not track further pipeline stages for it
