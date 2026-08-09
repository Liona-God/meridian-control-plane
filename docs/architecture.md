# Architecture

## Execution lifecycle

    editor triggers active workflow with idempotency key
                         |
                         v
                    queued run + audit + outbox
                         |
                         v
                 worker claims bounded runnable set
                         |
        +----------------+------------------+
        |                                   |
        v                                   v
   executable step                    approval step
        |                                   |
        v                                   v
  running or terminal               waiting_approval
                                            |
                                            v
                                      owner approves
                                            |
                                            v
                                          queued

The core process intentionally executes one step per worker tick. This makes
the durable state transition between steps explicit and limits recovery scope
after a process crash.

## Tenancy and authorization

Every aggregate holds a workspace id. The domain service looks up the actor's
workspace member record before each read or mutation. The PostgreSQL migration
adds row-level security based on app.workspace_id, making a missing repository
filter a defense-in-depth failure rather than a cross-tenant data leak.

## Storage

The SQLite adapter stores each aggregate as JSON alongside indexed routing
columns. It is a practical local and single-node option that preserves the
same store port used by the core. The migration in packages/database/migrations
is normalized PostgreSQL schema intended for concurrent production access.

## Outbox

The service writes an outbox event with every externally relevant workflow
transition. A production relay can claim undelivered rows using SKIP LOCKED,
publish them to a broker, and mark delivery atomically with retry metadata.
The reference keeps these records inspectable while the local worker performs
only core step execution.
