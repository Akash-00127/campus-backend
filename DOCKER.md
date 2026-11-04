# Run Campus Drop locally with Docker

From this folder, start PostgreSQL and the backend with:

```powershell
docker compose up -d --build --wait
```

The backend runs independently. Optional clients require sibling folders `../campus admin`
and `../campus app`. When present, run `docker compose --profile clients up -d --build`.
Service addresses:

- Student app web preview (Docker): http://localhost:8090
- Admin panel (Docker): http://localhost:3010
- NestJS API: http://localhost:4000/v1/health
- PostgreSQL: localhost:5434

The first run creates database tables and the initial administrator. Default local credentials are `admin@campusdrop.local` and `CampusDropAdmin2026`. Change them in `.env` before using any non-local environment.

To view startup logs:

```powershell
docker compose logs -f
```

To stop services while keeping the database data:

```powershell
docker compose down
```
