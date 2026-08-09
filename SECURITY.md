# Security policy

Report vulnerabilities privately to the repository owner. Never include API
keys, workflow payloads, internal endpoints, or tenant identifiers in a public
issue.

Before a real deployment:

- replace development API keys with an identity-provider integration;
- store worker tokens and workflow secrets in a secret manager;
- set a narrow CORS_ORIGIN;
- apply the PostgreSQL migration with tenant RLS enforced;
- use a broker-backed outbox relay and structured, redacted observability.
