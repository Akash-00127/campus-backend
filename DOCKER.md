# Run Campus Drop locally with Docker

From this folder, start every service with:

```powershell
docker compose up -d --build
```

The stack uses one PostgreSQL database and starts these services:

- Student app web preview: http://localhost:8082
- Admin panel: http://localhost:3002
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
