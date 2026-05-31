# Sapho Cloudflare task-score worker

This worker backs the dashboard's cross-device state:

- task scores
- leisure scores
- Hedonic Calculator draft state

It is designed to be paired with a Cloudflare D1 database and the dashboard's `SAPHO_TASK_SCORE_API_URL` setting.

## Endpoints

- `GET /api/health`
- `GET /api/task-scores`
- `GET /api/task-scores/:taskId`
- `POST /api/task-scores/:taskId`
- `GET /api/leisure-scores`
- `GET /api/leisure-scores/:itemId`
- `POST /api/leisure-scores/:itemId`
- `GET /api/hedonic-state`
- `POST /api/hedonic-state`

## Notes

- Set `SAPHO_TASK_SCORE_TOKEN` as a secret if you want write protection.
- Use the D1 migrations in `migrations/` to create tables.
- Replace the placeholder `database_id` in `wrangler.toml` before deployment.
