# Campus Drop teammate demo dataset

This is a data-only SQL dump generated without reading existing private accounts,
passwords, orders, tokens or payment data. Commit this folder with the project.
150 university names come from the Hipo public university directory (license included).
It is NOT an official UGC recognition register. Unknown cities/states/types require
verification. Guru Kashi University is included. Every campus and vendor is explicitly
demo-only, with illustrative food imagery, sample prices and fictional users.

Includes 150 campuses, 300 shops, 85 dishes per university (12,750 products),
1,950 university-scoped categories, 450 students, 300 vendor accounts, 450 addresses.
No fake orders, payments, reviews or financial settlements are represented as real.

## Import into a teammate's local project

Open PowerShell in `campus backend`, with the sibling admin/app folders present:

```powershell
docker compose up -d --build
docker compose cp demo-data/campus-drop-demo.sql postgres:/tmp/campus-drop-demo.sql
docker compose exec postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/campus-drop-demo.sql'
```

Wait for backend migrations to finish (backend healthy in `docker compose ps`) before
importing. This file requires the project schema; it does not create tables.
The import is transactional and safe to repeat for this fixture's deterministic IDs.
It does not overwrite edited records or reset passwords. Never import into production.

## Demo logins

Password for all generated demo accounts: `CampusDemo@2026!`

Guru Kashi demo students:
- `ramesh@demo.campusdrop.test`
- `mahesh@demo.campusdrop.test`
- `atul@demo.campusdrop.test`

Guru Kashi demo vendors: `seller1.1@demo.campusdrop.test`, `seller1.2@demo.campusdrop.test`.
Other universities use `ramesh.2@demo.campusdrop.test` etc. according to universities.json
order (one-based index). Demo addresses use non-routable placeholder phone 0000000000;
replace with your test phone if exercising phone validation. These accounts are created
by seed, not by an SMS verification flow.

An admin is created separately by the backend bootstrap configuration; its password
is deliberately not exported in this dataset. Both clients use the same backend API.
External illustrative image URLs require internet access and are not bundled files.

To regenerate the fixture: `node scripts/build-team-demo.cjs`. This fetches the latest
directory; use the committed SQL file for identical teammate data.
