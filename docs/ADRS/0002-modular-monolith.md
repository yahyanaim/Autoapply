# ADR 0002: modular monolith for MVP

- Status: accepted
- Date: 2026-07-25

## Decision

Ship one NestJS API deployment with explicit domain modules, Prisma
repositories, wrapped external providers, Redis/BullMQ, and a shared database.

## Consequences

Transactions and deployment remain simple. AI, storage, payments, time, and
queues stay behind injectable boundaries so a proven scaling trigger can move a
module without rewriting its callers.
