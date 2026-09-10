# Logic Fit Notification Architecture

## Boundary

All supported notification events follow one path:

`Business event -> central notification service -> in-app + email + audit`

The first catalogued events are the existing platform-scoped
`gym_registration_requested` and `trainer_registration_requested` events. A
new notification is not invented for an operation that does not already exist
in the product.

## Durable in-app center

`saas_notifications` stores the normalized notification envelope:

- type, category, severity, title and bounded message
- tenant scope, audience role and optional recipient user
- actor, entity type/id, action URL and UTC timestamps
- a durable dedupe key and optional expiry

`saas_notification_reads` stores per-user read state. The API exposes a
paginated list, unread count, single-item read and mark-all-read operations.
The notification routes use the existing authentication, tenant context,
permissions and RLS boundary; the browser never chooses an audience or tenant
scope.

Platform notifications use a null tenant scope and are visible only inside
platform context. Tenant notifications must carry their tenant id and are
visible only in that tenant context. URLs rendered by the notification center
are restricted to same-origin relative paths.

## Registration delivery contract

Registration request creation records its platform-scoped audit event and
durable in-app notification inside the same SQL transaction as the request
insert. Email is dispatched only after the transaction resolves successfully.
A duplicate idempotent request does not create a second event or email. Email
delivery failure is isolated from the already-saved registration request and is
reported with event/channel metadata only.

The email channel is server-side SMTP and is disabled unless
`EMAIL_ENABLED=true` and the SMTP/recipient configuration is present. SMTP
credentials belong only in the deployment secret store. Messages contain
bounded review details; capability tokens, payment-proof storage keys and
idempotency values are never included.

## Notification versus audit

An in-app notification is actionable user-facing information. An audit record
is an append-only operational/accountability record. They can share the same
business event and entity id, but neither is substituted for the other. Audit
retention and notification expiry/read state therefore remain independent.

## Process status and timelines

Notifications are summaries and actions, not a replacement for a process
timeline. Registration status remains owned by the existing registration
request state machine (`pending`, `approved`, `rejected` and other existing
terminal states). The request record and its audit entries remain the source
of truth for status history; a notification links to that existing review
surface through its bounded action URL.

The same rule applies to trainer and member activity timelines: the existing
scoped service/API owns the timeline and notifications may point to it, but a
notification must not duplicate or rewrite its entries. Any future event added
to the center must name its source entity, lifecycle owner and retention
policy, then add authorization and deduplication tests before it is catalogued.

## Browser behavior

The shared notification-center script is loaded by the authenticated SaaS,
Platform Admin and Independent Trainer shells. It creates a bell on demand,
loads only after interaction, supports unread count, pagination, refresh and
read state, and fails quietly for unauthenticated pages. It uses text nodes for
server content, supports RTL/light/dark/responsive layouts, and does not expose
notification secrets or private transport details. Member and trainer-client
portals use capability-code sessions rather than account sessions, so the
account notification center is not mounted there.

## Deduplication and adding events

The central service coalesces in-flight delivery and the database enforces a
unique dedupe key. Default keys include event type, scope, audience/recipient
and entity id. Email and in-app delivery must remain server-directed.

To add an event:

1. Add a named business event to `EVENT_CATALOG` with explicit audience,
   tenant scope, channels and dedupe identity.
2. Normalize and bound all user-visible fields.
3. Persist in-app state in the originating transaction when atomicity matters.
4. Dispatch external channels after commit.
5. Add tests for authorization, tenant scope, duplicate delivery and channel
   failure isolation.

Never call email, audit or browser notification code directly from a route or
public request payload.
