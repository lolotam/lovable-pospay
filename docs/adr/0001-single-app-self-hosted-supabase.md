# ADR-0001 — One TanStack Start app on self-hosted Supabase

**Status:** Accepted (Waleed, 2026-11-17)

## Context
PRD v1.1 assumed NestJS + Redis. Phase 1 PRD §10 approved a simpler direction.

## Decision
One React app (TanStack Start) with server functions; self-hosted Supabase Postgres via `pg`;
Better Auth for identity; RLS through `withUser()` and role `pospay_app`; Dockerfile deploy from
GitHub to Dokploy with `NITRO_PRESET=node-server`.

## Consequences
No separate API service or queue in Phase 1. Server functions outside Lovable Cloud are
unproven until the first Dokploy deploy. Background jobs (reminders, rating requests) need a
scheduler decision later.
