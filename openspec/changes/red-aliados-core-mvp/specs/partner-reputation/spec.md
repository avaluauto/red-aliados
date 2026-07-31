# Partner Reputation Specification

## Purpose

Compute a system-owned reputation score from how tenants respond to connection requests, penalizing silence more than explicit rejection.

## Requirements

### Requirement: Response Events Recorded

The system MUST record a response event (`accepted`, `rejected`, or `expired`) with response time for every terminal `connection_request` outcome.

#### Scenario: Event captured on each outcome
- GIVEN a connection request reaches a terminal state
- WHEN the outcome is `accepted`, `rejected`, or `expired`
- THEN a response event is recorded with the outcome type and elapsed response time

### Requirement: Score Computation and Expiry Penalty

The system MUST compute a reputation score from accumulated response events and response time. Expiry (ignoring a request for 48h) MUST reduce the score more than an explicit rejection of equivalent context.

#### Scenario: Expiry penalizes more than rejection
- GIVEN two otherwise-identical requests, one expired and one explicitly rejected
- WHEN scores are recomputed
- THEN the tenant with the expired request has a lower resulting score than the tenant with the rejection

#### Scenario: Score is read-only
- GIVEN any tenant user
- WHEN they attempt to directly set or edit their own reputation score
- THEN no such capability exists; the score is derived only from response events
