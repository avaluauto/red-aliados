# Identity Bridge Specification

## Purpose

Trust V2-issued JWTs as the sole identity source. Red Aliados has zero local user table, zero password flow, zero self-registration.

## Requirements

### Requirement: Federated JWT Trust

The system MUST validate incoming session tokens as V2-issued JWTs via Supabase Third-Party Auth (JWKS, asymmetric signature). The system MUST NOT accept or issue locally-signed session tokens.

#### Scenario: Valid V2 JWT signs in
- GIVEN a user holds a valid, unexpired V2-issued JWT
- WHEN they open Red Aliados
- THEN the app establishes a session from the JWT
- AND no registration or login form is shown

#### Scenario: Invalid or tampered JWT rejected
- GIVEN a JWT fails JWKS signature verification
- WHEN the user attempts to load the app
- THEN access is denied and no session is established

### Requirement: Claim Contract

The system MUST derive `tenant_id`, `red_aliados_enabled`, and `role` exclusively from JWT claims. The system MUST NOT create, cache, or store a local user or profile record.

#### Scenario: Claims drive authorization
- GIVEN a JWT with `tenant_id`, `red_aliados_enabled: true`, `role`
- WHEN the session bootstraps
- THEN those claim values are used directly for authorization checks
- AND no row is written to any local users table

### Requirement: Module Gate

The system MUST deny all application access when `red_aliados_enabled` is `false` or absent, without offering a registration path.

#### Scenario: Module disabled for tenant
- GIVEN a JWT with `red_aliados_enabled: false`
- WHEN the user opens Red Aliados
- THEN they see a "not enabled" state, not a registration form
- AND no queries against network data execute
