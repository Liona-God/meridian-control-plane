# Contributing

Treat workflow state changes as compatibility-sensitive behavior. A change to
roles, run status, idempotency, audit events, or the shared contracts requires
tests at the core and API boundary.

Before opening a pull request:

    npm run check

Do not introduce a bypass around workspace authorization merely to simplify an
endpoint. Put reusable behavior in packages/core and leave transport concerns
in the API package.
