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

- [x] Define `NotificationEvent` string literal union type (`session.idle`, `session.error`, `permission.asked`)
- [x] Define `EventMetadata` interface (sessionId, projectName, timestamp, error?, permissionType?, permissionPatterns?)
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

- [x] Define `NotificationSDKConfig` interface matching the config file schema (no `subagentNotifications` field)
- [x] Implement `loadConfig(): NotificationSDKConfig` that reads `~/.config/opencode/notification.json`
- [x] Handle missing config file gracefully (return all defaults)
- [x] Handle malformed JSON gracefully (throw descriptive error)
- [x] Validate config values (cooldown edge enum, event types)
- [x] Implement `getBackendConfig(config: NotificationSDKConfig, backendName: string): Record<string, unknown> | undefined`
- [x] Write tests in `tests/config.test.ts`
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

## Phase 7: Event Filtering (`src/events.ts`)

- [x] Implement event metadata extraction for each event type
- [x] Implement subagent suppression: use `client.session.get()` to check `parentID` for `session.idle` and `session.error` events
- [x] Handle session lookup failures gracefully (fall through and send notification)
- [x] Extract error message from `session.error` event properties
- [x] Extract permission type and patterns from `permission.asked` event properties
- [x] Extract session ID from event properties
- [x] Build template variables record per event
- [x] Write tests in `tests/events.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 8: Plugin Factory (`src/plugin-factory.ts`)

- [x] Implement `createNotificationPlugin(backend, options?): Plugin`
- [x] Load config file on plugin initialization
- [x] Initialize rate limiter from config
- [x] Return `Hooks` with `event` handler only (no `tool.execute.before`)
- [x] In `event` handler: handle `session.idle`, `session.error`, and `permission.asked` events
- [x] For `session.idle` and `session.error`: perform subagent suppression via `client.session.get()`
- [x] For `permission.asked`: always send notification (no subagent check)
- [x] Check `config.enabled`, `config.events[eventType].enabled`, rate limiter
- [x] Resolve title and message via shell command templates or defaults
- [x] Call `backend.send()`, catch and ignore errors
- [x] Plugin factory tests must NOT use `vi.mock()` -- supply dependencies directly
- [x] Write integration tests in `tests/plugin-factory.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 9: Public API (`src/index.ts`)

- [x] Export all public types and functions from `src/index.ts`
- [x] Write export verification tests
- [x] Ensure tests pass, lint is clean, and package builds cleanly

## Phase 10: CI Pipeline

- [x] Create `.github/workflows/ci.yml` with matrix strategy for Node.js 20, 22, and 24
- [x] Run lint, build, and test steps in CI
- [x] Add publish step (runs only on latest Node.js version, on tag push)

## Phase 11: Documentation

- [x] Create `docs/creating-a-plugin.md` matching prompt spec
- [x] Create `README.md` documenting install, configure, and use

## Phase 12: JSDoc Docstrings on Public API

- [x] Add JSDoc docstrings to all exported items
- [x] Ensure tests pass, lint is clean, and package builds cleanly

## Phase 13: Config Model Alignment (per-backend config files)

Align the config model with the spec: each backend plugin gets its own config file
(`~/.config/opencode/notification-<backendConfigKey>.json`) with a singular `backend`
key instead of a shared config file with a `backends` map.

- [ ] Change `NotificationSDKConfig.backends` to `backend: Record<string, unknown>` (singular)
- [ ] Update `loadConfig()` to accept optional `backendConfigKey` parameter for config file path
- [ ] Update `getBackendConfig<T>()` to be generic and read from `config.backend`
- [ ] Update `parseConfigFile` to parse singular `backend` key
- [ ] Update `createNotificationPlugin` to pass `backendConfigKey` to `loadConfig`
- [ ] Fix check ordering: per-event enabled check before subagent suppression
- [ ] Remove extra exports not in spec (`NOTIFICATION_EVENTS`, `parseConfigFile`)
- [ ] Update all tests to match new config model
- [ ] Update README.md and docs/creating-a-plugin.md for per-backend config files
- [ ] Ensure tests pass, lint is clean, and package builds cleanly
