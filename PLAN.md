# Implementation Plan

## Phase 1: Project Scaffolding

- [x] Initialize npm project with `package.json` (name: `opencode-notification-sdk`, type: module, main/types entry points, engines: node >=20)
- [x] Add `@opencode-ai/plugin` as a peer dependency
- [x] Add `iso8601-duration` and `throttle-debounce` as runtime dependencies
- [x] Add dev dependencies: TypeScript, Vitest, ESLint with typescript-eslint, `@types/throttle-debounce`, `@types/node`
- [x] Create `tsconfig.json` with strict TypeScript config targeting ESNext
- [x] Create `vitest.config.ts`
- [x] Create `eslint.config.js` with no-cast rule (`@typescript-eslint/consistent-type-assertions` with `assertionStyle: "never"`)
- [x] Create `.npmrc` with `registry=https://registry.npmjs.org`
- [x] Verify project scaffolding builds and lints cleanly

## Phase 2: Core Types (`src/types.ts`)

- [x] Define `NotificationEvent` string literal union type (`session.complete`, `subagent.complete`, `session.error`, `permission.requested`, `question.asked`)
- [x] Define `EventMetadata` interface (sessionId, isSubagent, projectName, timestamp, error?, permissionType?, permissionPatterns?)
- [x] Define `NotificationContext` interface (event, title, message, metadata)
- [x] Define `NotificationBackend` interface with `send(context: NotificationContext): Promise<void>`
- [x] Write type conformance tests in `tests/types.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 3: Default Notification Content (`src/defaults.ts`)

- [x] Define default titles and messages for each `NotificationEvent` type
- [x] Export `getDefaultTitle(event: NotificationEvent): string` function
- [x] Export `getDefaultMessage(event: NotificationEvent): string` function
- [x] Write tests in `tests/defaults.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 4: Rate Limiter (`src/rate-limiter.ts`)

- [x] Implement `parseISO8601Duration(duration: string): number` using `iso8601-duration` library
- [x] Define `RateLimiterOptions` interface (duration: string, edge: "leading" | "trailing")
- [x] Define `RateLimiter` interface with `shouldAllow(eventType: string): boolean`
- [x] Implement `createRateLimiter(options: RateLimiterOptions): RateLimiter` using `throttle-debounce`
- [x] Handle edge cases: zero duration disables rate limiting, per-event-type independent timers
- [x] Write tests in `tests/rate-limiter.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 5: Configuration (`src/config.ts`)

- [x] Define `NotificationSDKConfig` interface matching the config file schema
- [x] Implement `loadConfig(): NotificationSDKConfig` that reads `~/.config/opencode/notification.json`
- [x] Handle missing config file gracefully (return all defaults)
- [x] Handle malformed JSON gracefully (throw descriptive error)
- [x] Validate config values (subagentNotifications enum, cooldown edge enum, event types)
- [x] Implement `getBackendConfig(config: NotificationSDKConfig, backendName: string): Record<string, unknown> | undefined` (no generic `T` parameter due to no-cast rule)
- [x] Write tests in `tests/config.test.ts` (mock filesystem reads)
- [x] Ensure tests pass and package builds cleanly

## Phase 6: Shell Command Templates (`src/templates.ts`)

- [x] Implement `resolveField($, commandTemplate, variables, fallback): Promise<string>` function
- [x] Use `{var_name}` substitution syntax (not `${var_name}`)
- [x] Handle null/undefined command template (return fallback)
- [x] Handle command failure (return fallback)
- [x] Handle empty stdout (return fallback)
- [x] Create `tests/mock-shell.ts` shared mock BunShell factory
- [x] Write tests in `tests/templates.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 7: Session Filtering (`src/session.ts`)

- [x] Implement `isChildSession(client, sessionId): Promise<boolean>` that calls `client.session.get()`
- [x] Handle API failures gracefully (treat as root session)
- [x] Implement `classifySession(client, sessionId, subagentMode): Promise<NotificationEvent | null>`
  - `"always"` -> always returns `session.complete`
  - `"never"` -> returns `session.complete` for root, `null` for child
  - `"separate"` -> returns `session.complete` for root, `subagent.complete` for child
- [x] Write tests in `tests/session.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 8: Event Classification (`src/events.ts`)

- [x] Implement event metadata extraction for each event type
- [x] Extract error message from `session.error` event properties
- [x] Extract permission type and patterns from `permission.asked` event properties
- [x] Extract session ID from event properties
- [x] Build template variables record per event
- [x] Write tests in `tests/events.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 9: Plugin Factory (`src/plugin-factory.ts`)

- [x] Implement `createNotificationPlugin(backend, options?): Plugin`
- [x] Load config file on plugin initialization
- [x] Initialize rate limiter from config
- [x] Return `Hooks` with `event` handler and `tool.execute.before` handler
- [x] In `event` handler: classify events, check enabled/rate-limit, resolve templates, call `backend.send()`
- [x] In `tool.execute.before` handler: detect question tool, apply same pipeline
- [x] Catch and ignore errors from `backend.send()`
- [x] Pass backend config via `getBackendConfig()` if `backendConfigKey` is provided
- [x] Write integration tests in `tests/plugin-factory.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 10: Public API (`src/index.ts`)

- [x] Export all public types and functions from `src/index.ts`
- [x] Write export verification tests
- [x] Ensure tests pass, lint is clean, and package builds cleanly

## Phase 11: CI Pipeline

- [x] Create `.github/workflows/ci.yml` with matrix strategy for Node.js 20, 22, and 24
- [x] Run lint, build, and test steps in CI
- [x] Add publish step (runs only on latest Node.js version, on tag push)

## Phase 12: Fix Lint Errors

- [x] Fix type assertion (`as`) violations in `tests/mock-shell.ts` to comply with `@typescript-eslint/consistent-type-assertions` rule
- [x] Ensure `npm run lint` passes cleanly

## Phase 13: Plugin Factory Signature Fix

- [ ] Update `createNotificationPlugin` signature to match spec: `(backend, options?: { backendConfigKey?: string }): Plugin`
- [ ] Load config from file instead of accepting `configOverride` parameter
- [ ] Make backend config available when `backendConfigKey` is provided
- [ ] Update tests to use the new signature
- [ ] Ensure tests pass, lint is clean, and package builds cleanly

## Phase 14: Documentation

- [ ] Create `docs/creating-a-plugin.md` with:
  - Overview of SDK architecture
  - Prerequisites
  - Implementing `NotificationBackend`
  - Using `createNotificationPlugin()`
  - Configuration guide
  - Complete example
  - Testing tips
