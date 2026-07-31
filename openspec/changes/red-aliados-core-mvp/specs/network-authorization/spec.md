# Network Authorization Specification

## Purpose

Enforce closed-by-default visibility via four layered checks in RLS, not client code. Nothing is open by default.

## Requirements

### Requirement: Four-Layer Authorization

The system MUST enforce, in RLS, all four layers before any network resource (tenant, vehicle, connection, message) is visible: (1) module enabled for the tenant, (2) active mutual connection with the resource-owning tenant when the resource is connection-scoped, (3) the requesting user is granted network access by their tenant admin, (4) the resource is otherwise eligible for visibility (e.g. not expired/rejected).

#### Scenario: All four layers pass
- GIVEN a user whose tenant has the module enabled, is mutually connected to tenant B, and is granted network access
- WHEN they query tenant B's synced vehicles
- THEN the vehicles are returned

#### Scenario: Any single layer fails denies access
- GIVEN a user granted network access, tenant module enabled, but no active connection to tenant B
- WHEN they query tenant B's vehicles or contact
- THEN zero rows are returned

### Requirement: Deny-by-Default Enforcement Point

RLS policies MUST default-deny; the system MUST NOT rely on client-side UI guards as a security boundary. UI guards MAY exist only as UX convenience.

#### Scenario: Unconnected tenant sees nothing
- GIVEN tenant A has zero connections
- WHEN any user of tenant A queries peer inventory, requests, or contacts
- THEN the response contains zero rows, verified independent of the UI layer

#### Scenario: Direct API/table access still denied
- GIVEN an authenticated but unauthorized user queries a table directly (bypassing app UI)
- WHEN the query executes
- THEN RLS still returns zero rows for resources outside their authorized scope
