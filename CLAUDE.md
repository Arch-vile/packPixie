# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start all dev servers (Turbo)
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm type-check   # TypeScript checks across all packages
pnpm test         # Run all tests
pnpm clean        # Clean build artifacts
```

## Project Structure

pnpm + Turbo monorepo with three packages:

- `apps/api` — Fastify backend (Lambda in prod, HTTP server locally)
- `apps/client` — React 19 SPA (Vite, S3 + CloudFront)
- `packages/model` — Shared TypeScript types (`@packpixie/model`)

## Key Documentation

Read these before making architectural changes:

- `app-architecture.md` — System design, auth flow, API surface, data model, concurrency
- `dynamoDB-architecture.md` — DynamoDB single-table design and access patterns
- `app-description.md` — Product specification and usage model
- `README.md` — Local development setup and environment variables
- `infra/readme.md` — Terraform initialization and CI/CD secrets

## Conventions

- User identity always comes from verified JWT claims (`request.user`), never from request params or body
- API routes are split into public (no auth) and protected (auth required) scopes in `apps/api/src/routes/api.ts`
- Fastify plugins that need to share hooks/decorators with sibling routes must be wrapped with `fastify-plugin`
- Do not remove TODO comments from code
- CLAUDE.md is the single place for agent instructions — do not use memory files
- Keep CLAUDE.md lean: commands, conventions, pointers to docs. Do not duplicate architecture or application details here — those belong in the dedicated documentation files listed above
