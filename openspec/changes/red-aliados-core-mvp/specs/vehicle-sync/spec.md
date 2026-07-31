# Vehicle Sync Specification

## Purpose

Maintain a read-only, eventually-consistent mirror of V2 tenants, contacts, and vehicles. V2 is the sole writer; Red Aliados never writes back.

## Requirements

### Requirement: Outbox Ingestion

The system MUST ingest vehicle/tenant events from V2's outbox via the `ingest-vehicle-event` Edge Function and record processed events in `sync_event_log` to guarantee idempotency.

#### Scenario: Vehicle created in V2 appears in mirror
- GIVEN V2 emits a vehicle-created outbox event
- WHEN `ingest-vehicle-event` processes it
- THEN the vehicle appears in Red Aliados' read model
- AND the event id is recorded in `sync_event_log`

#### Scenario: Duplicate webhook delivery is a no-op
- GIVEN an event id already present in `sync_event_log`
- WHEN the same webhook is delivered again
- THEN no duplicate row is created and no error is raised

### Requirement: Reconciliation Backstop

The system MUST run `reconcile-outbox` on a schedule (pg_cron) to detect and repair missed or out-of-order events; the webhook path alone MUST NOT be trusted as the sole source of truth.

#### Scenario: Dropped event is repaired
- GIVEN a webhook delivery for a vehicle update was lost
- WHEN `reconcile-outbox` next runs
- THEN the missing state is detected and the mirror is corrected

### Requirement: Read-Only Mirror

The system MUST NOT expose any write path from Red Aliados back to vehicle or tenant data.

#### Scenario: No local vehicle creation
- GIVEN any authenticated Red Aliados user
- WHEN they attempt to create or edit a vehicle record
- THEN no such capability exists in the system
