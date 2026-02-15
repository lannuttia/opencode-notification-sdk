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

- [ ] Define default titles and messages for each `NotificationEvent` type
- [ ] Export `getDefaultTitle(event: NotificationEvent): string` function
- [ ] Export `getDefaultMessage(event: NotificationEvent): string` function
- [ ] Write tests in `tests/defaults.test.ts`
- [ ] Ensure tests pass and package builds cleanly

## Phase 4: Rate Limiter (`src/rate-limiter.ts`)

- [ ] Implement `parseISO8601Duration(duration: string): number` using `iso8601-duration` library
- [ ] Define `RateLimiterOptions` interface (duration: string, edge: "leading" | "trailing")
- [ ] Define `RateLimiter` interface with `shouldAllow(eventType: string): boolean`
- [ ] Implement `createRateLimiter(options: RateLimiterOptions): RateLimiter` using `throttle-debounce`
- [ ] Handle edge cases: zero duration disables rate limiting, per-event-type independent timers
- [ ] Write tests in `tests/rate-limiter.test.ts`
- [ ] Ensure tests pass and package builds cleanly

## Phase 5: Configuration (`src/config.ts`)

- [ ] Define `NotificationSDKConfig` interface matching the config file schema
- [ ] Implement `loadConfig(): NotificationSDKConfig` that reads `~/.config/opencode/notification.json`
- [ ] Handle missing config file gracefully (return all defaults)
- [ ] Handle malformed JSON gracefully (throw descriptive error)
- [ ] Validate config values (subagentNotifications enum, cooldown edge enum, event types)
- [ ] Implement `getBackendConfig<T>(config: NotificationSDKConfig, backendName: string): T | undefined`
- [ ] Write tests in `tests/config.test.ts` (mock filesystem reads)
- [ ] Ensure tests pass and package builds cleanly

## Phase 6: Shell Command Templates (`src/templates.ts`)

- [ ] Implement `resolveField($, commandTemplate, variables, fallback): Promise<string>` function
- [ ] Use `{var_name}` substitution syntax (not `${var_name}`)
- [ ] Handle null/undefined command template (return fallback)
- [ ] Handle command failure (return fallback)
- [ ] Handle empty stdout (return fallback)
- [ ] Create `tests/mock-shell.ts` shared mock BunShell factory
- [ ] Write tests in `tests/templates.test.ts`
- [ ] Ensure tests pass and package builds cleanly

## Phase 7: Session Filtering (`src/session.ts`)

- [ ] Implement `isChildSession(client, sessionId): Promise<boolean>` that calls `client.session.get()`
- [ ] Handle API failures gracefully (treat as root session)
- [ ] Implement `classifySession(client, sessionId, subagentMode): Promise<NotificationEvent | null>`
  - `"always"` -> always returns `session.complete`
  - `"never"` -> returns `session.complete` for root, `null` for child
  - `"separate"` -> returns `session.complete` for root, `subagent.complete` for child
- [ ] Write tests in `tests/session.test.ts`
- [ ] Ensure tests pass and package builds cleanly

## Phase 8: Event Classification (`src/events.ts`)

- [ ] Implement event metadata extraction for each event type
- [ ] Extract error message from `session.error` event properties
- [ ] Extract permission type and patterns from `permission.asked` event properties
- [ ] Extract session ID from event properties
- [ ] Build template variables record per event
- [ ] Write tests in `tests/events.test.ts`
- [ ] Ensure tests pass and package builds cleanly

## Phase 9: Plugin Factory (`src/plugin-factory.ts`)

- [ ] Implement `createNotificationPlugin(backend, options?): Plugin`
- [ ] Load config file on plugin initialization
- [ ] Initialize rate limiter from config
- [ ] Return `Hooks` with `event` handler and `tool.execute.before` handler
- [ ] In `event` handler: classify events, check enabled/rate-limit, resolve templates, call `backend.send()`
- [ ] In `tool.execute.before` handler: detect question tool, apply same pipeline
- [ ] Catch and ignore errors from `backend.send()`
- [ ] Pass backend config via `getBackendConfig()` if `backendConfigKey` is provided
- [ ] Write integration tests in `tests/plugin-factory.test.ts`
- [ ] Ensure tests pass and package builds cleanly

## Phase 10: Public API (`src/index.ts`)

- [ ] Export all public types and functions from `src/index.ts`
- [ ] Write export verification tests
- [ ] Ensure tests pass, lint is clean, and package builds cleanly

## Phase 11: CI Pipeline

- [ ] Create `.github/workflows/ci.yml` with matrix strategy for Node.js 20, 22, and 24
- [ ] Run lint, build, and test steps in CI
- [ ] Add publish step (runs only on latest Node.js version, on tag push)
