# API Versioning

## Strategy

Hybrid versioning combining semantic versioning with Git commit SHA:

- Format: `{major}.{minor}.{patch}-{git-sha}`
- Example: `1.0.0-a3f8b92`

## How It Works

### Development

The API reads version from `src/version.json`. Default file contains:

```json
{
  "version": "dev"
}
```

No configuration needed - just run:

```bash
pnpm dev
```

### CI/CD Deployment

1. Version is automatically generated from `package.json` + Git SHA
2. Written to `src/version.json` before build
3. Bundled with the deployment artifact
4. Verified after deployment by checking `/api/status` endpoint

### Version Endpoint

```bash
curl https://your-api.com/api/status
```

Response:

```json
{
  "status": "running",
  "version": "1.0.0-a3f8b92",
  "timestamp": "2026-01-04T12:00:00.000Z"
}
```

## Updating Version

1. Update `version` in `apps/api/package.json`
2. Commit and push to main branch
3. CI will automatically generate full version with Git SHA and bake it into the build
