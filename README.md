# Campus Drop

Campus-isolated marketplace with an Expo student/vendor app, Next.js operations panel,
and one NestJS REST API using TypeORM and PostgreSQL. This release implements the COD,
seller-delivery launch flow. It does not implement every feature in the long-term brief.

## Open the local projects

The existing local setup is already migrated. Run `powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1`
from this backend directory to start PostgreSQL, API and admin. Open http://127.0.0.1:3000/login.
The generated owner credentials are in `.local/LOCAL-ACCESS.txt`; do not share or commit that file.
The API health endpoint is http://127.0.0.1:4000/v1/health.

The active application database is the PostgreSQL connection in `DATABASE_URL`. This workstation uses
`127.0.0.1:5432/campus_drop_dev` with password authentication. The former `55439` cluster is an
isolated test-only fixture; the API, admin panel and mobile app never use it.
`campus_drop_dev` contains the active development tenant and catalog. `campus_drop_test` is only used
when explicitly running integration tests; never deploy either local fixture.

The machine's global npm shim is broken. Until repaired, use
`node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"` in place of `npm`.

In `../campus app`, configure `EXPO_PUBLIC_API_URL` then run `npm start`.
Android emulator default: `http://10.0.2.2:4000/v1`. A physical phone needs the computer's
LAN address and permission to reach port 4000. Production must use HTTPS.
In `../campus admin`, `BACKEND_URL` is server-only and defaults to `http://localhost:4000/v1`.
Both clients use the same API; neither connects directly to PostgreSQL.

## First real order

1. Sign into admin. Create a university and its campus. Configure fees, COD limit and service availability.
2. Register a vendor in the app or create one in admin. Review and approve the vendor in admin.
3. Sign in as that vendor. Complete the shop profile, daily IST hours, products, prices and stock; open the shop.
4. Register a student at that university/campus. Verify the student's membership through your real-world process, then approve in admin.
5. Student adds a campus address, browses eligible shops, adds products from one shop and checks out with COD.
6. Vendor accepts, prepares, marks ready and starts delivery. Student supplies the delivery PIN at handover.
7. Vendor records the exact cash collected separately. Admin can inspect the order timeline and accrued commission.

Selecting a campus at registration is a claim, not proof. The admin verification gate is intentional.
Daily operating windows support overnight hours (for example 20:00–03:00); manual closure takes precedence.
Preparation time is an estimate, not a 15-minute delivery guarantee. Shops fulfill the student's selected
vendor order; automatic nearest-shop routing is not implemented.

## Source layout

- `src/modules/auth`: password/JWT authentication, live account checks and role guards.
- `src/modules/catalog`: tenant boundaries, shop hours, products, addresses and stock administration.
- `src/modules/orders`: authoritative prices, transactional stock, idempotency, state transitions and COD records.
- `src/modules/admin`: operations, approvals, policies, content settings and audit entries.
- `src/modules/notifications`: inbox, support and optional Firebase outbox worker.
- `src/modules/shared`: validated request DTOs, supporting entities and safe error handling.
- `src/platform/entities.ts`: retained core TypeORM entities.
- `src/database`: data source, reviewed migrations and initial administrator bootstrap.
- `tests`: HTTP/PostgreSQL integration tests and operating-hours tests.

Legacy Prisma and older platform source files are retained but excluded from the active runtime.
There is one active authentication implementation and one TypeORM data source. Do not run legacy Prisma scripts.

## New environment

Provision PostgreSQL with a dedicated password-authenticated application role. Copy `.env.example` to `.env`,
set DATABASE_URL, independent random JWT/PIN secrets and the exact admin CORS origin. Install with `npm ci`.
Run `npm run db:migrate`, then set ADMIN_EMAIL and a strong ADMIN_PASSWORD and run `npm run db:seed`.
Remove the bootstrap password from the environment afterwards. Build with `npm run build`; start with `npm start`.

The initial migration is for an empty database. Existing production databases require an inspected baseline/data
migration and backup; do not run this initial migration blindly against an older populated schema.
Schema synchronization is disabled. Migration rollback intentionally requires manual review.
`scripts/prepare-test-db.cjs` was used to generate the initial schema during development; it is not a routine startup command.

## Verification

With the isolated test database migrated, run `npm test`. Override TEST_DATABASE_URL if needed;
the database name must remain `campus_drop_test`. Tests never use the application's DATABASE_URL.
They exercise authorization, tenant isolation, concurrent stock/idempotency, state transitions, COD,
PIN validation, cancellation, notification ownership and token revocation.
With the local services running, `node scripts/smoke-admin.cjs` checks authenticated admin pages and login protection.

Admin: `npm run build`. App: `npx tsc --noEmit` and
`npx expo export --platform android --output-dir .build/android --max-workers 2`.
An export checks bundling; it does not replace physical-device, accessibility or store-release testing.

## Notifications

The database inbox works without Firebase. Optional Android push uses Firebase HTTP v1 with
FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY on the backend. Never put the service-account
private key in the app. Configure GOOGLE_SERVICES_JSON on the Expo build machine and make a native
development/release build; enable notifications from Account on a real device. Expo Go is not a push test.
The transactional outbox retries failed sends and removes invalid device tokens. iOS native push is not wired yet.

## Remaining production work

Online payments/webhook verification/refunds, coupons, reviews, variants/add-ons, tax policy/invoicing,
automated settlement payouts, delivery-partner assignment/maps, university-transfer verification,
password recovery/OTP, granular permission management and advanced analytics are not implemented.
The app cart is held in memory; checkout retry keys are persisted. Image URLs are supported; file uploads are not.
Content settings control selected home text, not arbitrary application layouts.

Before live trading, supply real university/vendor data and verification procedures, configure HTTPS,
managed PostgreSQL backups/restore checks, monitoring and retention, test actual devices and Firebase,
and review campus access, cash reconciliation, cancellation/refund and tax rules with the business.
Scale initially as one modular API; add shared rate-limit storage and independent queue workers when
running multiple instances. No production-scale load test has been performed.
