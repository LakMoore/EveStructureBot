# EveStructureBot - Copilot Instructions

## Project Purpose

This repository contains a TypeScript Discord bot that monitors EVE Online corporation structures, starbases, and notifications and posts alerts to configured Discord channels.

## Tech Stack

- Runtime: Node.js (targeted in package.json engines)
- Language: TypeScript (`strict: true`, `moduleResolution: nodenext`)
- Discord: `discord.js` v14
- EVE APIs:
  - SSO: `@after_ice/eve-sso`
  - ESI: `@localisprimary/esi`
- Persistence: `node-persist`

## Core Architecture

- Bot bootstrap and shared utilities: `src/Bot.ts`
- Command registration list: `src/Commands.ts`
- Command contract: `src/Command.ts`
- Event listeners:
  - `src/listeners/ready.ts` (polling loop)
  - `src/listeners/interactionCreate.ts` (slash/autocomplete/button dispatch)
- EVE auth and membership logic: `src/EveSSO.ts`
- Polling processors:
  - `src/structures.ts`
  - `src/starbases.ts`
  - `src/notifications.ts`
- Notification message routing/handlers: `src/data/notification.ts`
- Persistence schema and migration logic: `src/data/data.ts`

## Run and Build

- Build: `npm run build`
- Start (build + run): `npm run start`
- Run built app: `npm run run`
- Debug: `npm run debug`

## Data and State Rules

- Treat `data.authenticatedCorps` as the single source of truth for tracked corp state.
- Any mutation to persisted bot state should be followed by `await data.save()` unless part of an intentionally batched flow.
- Preserve backwards-compat migration logic in `Data.init()` when changing data shapes.
- Do not remove deprecated fields (`channelId`, `characters`) unless all migration paths and existing persisted data compatibility are handled.

## Command Development Rules

- Add new commands in `src/commands/*.ts` and register them in `src/Commands.ts`.
- For command handlers:
  - Validate channel type before text-channel-only operations.
  - Provide user-visible error feedback for precondition failures.
  - Do not mix response styles incorrectly (avoid `reply` after `deferReply`/`followUp`).
- For sensitive/admin actions (`remove`, `configure`, `set_ping`, debug commands), explicitly enforce permission checks in command metadata and/or runtime checks.

## Authorization Rules

- Discord permissions are the authorization boundary for bot usage.
- If a user has permission to use the bot in a channel, they are authorized to use bot commands in that channel.
- Do not add custom per-user authorization layers unless explicitly requested.

## Security and Privacy Rules

- Never log secrets or token payloads.
- Avoid logging full auth/token objects; log minimal metadata only.
- Ensure all logging paths redact token-like fields (`authToken`, `refreshToken`, `access_token`, `refresh_token`, `authorization`).
- Never commit real credentials, live token values, or production IDs beyond what already exists in config/docs.

## Polling and API Call Rules

- Preserve role-aware character selection via `getWorkingChars()`.
- Keep per-corp operations resilient: failures in one corp/channel should not break all polling.
- Prefer typed error guards over `any` in catch blocks.
- Keep Discord messaging centralized through `sendMessage()` where practical for consistent logging and error handling.

## Style and Change Scope

- Keep edits focused and minimal; do not refactor large modules unless requested.
- Maintain existing naming conventions and file organization.
- Keep comments concise and only where logic is non-obvious.

## Known Project Pitfalls (Avoid Repeating)

- `reload` command currently has interaction lifecycle issues and command lookup assumptions; be careful when changing command reload behavior.
- Several modules rely on broad `catch (error: any)` paths; introduce type-safe guards when touching these areas.
- Some command flows assume text channels and silently no-op otherwise; add explicit feedback if you modify them.
- Notification handler functions are already high complexity; prefer extracting helpers over adding nested conditions.

## Testing and Validation Expectations

- Minimum checks after non-trivial edits:
  - `npm run build`
  - Validate changed command flow manually (defer/reply/followUp correctness)
- If behavior impacts polling or notifications, describe expected runtime behavior in the PR/summary and call out untested paths.

## Deployment Context

- CI workflow (`.github/workflows/main.yml`) deploys on push to `main` via SSH and restarts PM2 process `StructureBot`.
- Avoid changes that assume local-only runtime behavior without noting deployment impact.
