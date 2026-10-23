# Campus Drop implementation

## Agreed launch flow
One Expo application with student and vendor onboarding; one Next.js operations console;
one NestJS API and PostgreSQL database. Admin-approved campus membership and vendor
applications. Campus-isolated catalog, single-vendor cart, COD checkout, seller delivery,
profiles, notifications and auditable administration. No invented production catalog.

## Sequence
1. Consolidate runtime on TypeORM; preserve legacy Prisma source without executing it.
2. Authentication with database-backed authorization and approval gates.
3. University/campus administration and vendor onboarding; profile management.
4. Catalog and stock, authoritative pricing, idempotent COD orders and seller fulfillment.
5. Admin operations and Expo role-specific screens connected to the same endpoints.
6. Durable notification inbox/outbox and optional Firebase delivery.
7. Compile, business-rule tests and PostgreSQL integration verification.

## External configuration
Production database, approved university/campus catalog, Firebase service credentials,
mobile push configuration and online payment merchant credentials are operator supplied.
COD does not require a payment gateway. Online payments remain disabled until implemented
and verified. No production migrations or data deletions without checking the target.

## Scope decisions
Admin approval is the initial membership verification method. Sellers deliver their own
orders. Currency is INR in paise. COD collection is separate from delivery confirmation.
Universities listed in the directory are not automatically serviceable. Archive records
instead of deleting order history. Advanced shipping, returns, multi-campus exceptions,
online gateway/refunds and automated settlements require subsequent implementation.
