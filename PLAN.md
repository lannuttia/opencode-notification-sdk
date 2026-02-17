# Implementation Plan

## Phase 1: Project Scaffolding

- [x] Initialize npm project with `package.json` (name: `opencode-notification-sdk`, type: module, main/types entry points, engines: node >=20)
- [x] Add `@opencode-ai/plugin` as a peer dependency
- [x] Add dev dependencies: TypeScript, Vitest, ESLint with typescript-eslint, `@types/node`
- [x] Create `tsconfig.json` with strict TypeScript config targeting ESNext
- [x] Create `vitest.config.ts`
- [x] Create `eslint.config.js` with no-cast rule (`@typescript-eslint/consistent-type-assertions` with `assertionStyle: "never"`)
- [x] Create `.npmrc` with `registry=https://registry.npmjs.org`
- [x] Verify project scaffolding builds and lints cleanly

## Phase 2: Core Types (`src/types.ts`)

- [x] Define `NotificationEvent` string literal union type (`session.idle`, `session.error`, `permission.asked`)
- [x] Define `EventMetadata` interface (sessionId, projectName, timestamp, error?, permissionType?, permissionPatterns?)
- [x] Define `NotificationContext` interface with only `event` and `metadata` (no `title` or `message`)
- [x] Define `NotificationBackend` interface with `send(context: NotificationContext): Promise<void>`
- [x] Update type conformance tests in `tests/types.test.ts` to match new `NotificationContext` shape
- [x] Ensure tests pass and package builds cleanly

## Phase 3: Remove Default Notification Content

- [x] Delete `src/defaults.ts` (the SDK does not provide default titles/messages)
- [x] Delete `tests/defaults.test.ts`
- [x] Remove all references to `getDefaultTitle` and `getDefaultMessage` from the codebase
- [x] Ensure tests pass and package builds cleanly

## Phase 4: Configuration (`src/config.ts`)

- [x] Define `NotificationSDKConfig` interface with `enabled`, `events`, and `backend` fields only (no `templates`)
- [x] Implement `loadConfig(backendConfigKey?)` that reads from `~/.config/opencode/notification-<key>.json` (or `notification.json` when no key)
- [x] Implement `getConfigPath(backendConfigKey?)` for computing config file path
- [x] Handle missing config file gracefully (return all defaults)
- [x] Handle malformed JSON gracefully (throw descriptive error)
- [x] Implement `getBackendConfig(config, backendName)` that returns `config.backend`
- [x] Remove `templates` and `TemplateConfig` from config schema
- [x] Update tests in `tests/config.test.ts` to remove template references
- [x] Ensure tests pass and package builds cleanly

## Phase 5: Content Utilities (`src/templates.ts`)

- [x] Replace `resolveField()` with three composable functions:
  - `renderTemplate(template, context)` -- pure synchronous string interpolation of `{var}` placeholders from `NotificationContext`
  - `execCommand($, command)` -- executes a shell command and returns trimmed stdout; rejects on failure
  - `execTemplate($, template, context)` -- combines `renderTemplate()` and `execCommand()`
- [x] Update `tests/mock-shell.ts` if needed
- [x] Rewrite tests in `tests/templates.test.ts` for new function signatures
- [x] Ensure tests pass and package builds cleanly

## Phase 6: Event Filtering (`src/events.ts`)

- [x] Implement event metadata extraction for each event type
- [x] Implement subagent suppression: use `client.session.get()` to check `parentID` for `session.idle` and `session.error` events
- [x] Handle session lookup failures gracefully (fall through and send notification)
- [x] Extract error message from `session.error` event properties
- [x] Extract permission type and patterns from `permission.asked` event properties
- [x] Extract session ID from event properties
- [x] Build template variables record per event
- [x] Write tests in `tests/events.test.ts`
- [x] Ensure tests pass and package builds cleanly

## Phase 7: Plugin Factory (`src/plugin-factory.ts`)

- [x] Implement `createNotificationPlugin(backend, options?): Plugin`
- [x] Load config file on plugin initialization using `backendConfigKey` to determine file path
- [x] Return `Hooks` with `event` handler only (no `tool.execute.before`)
- [x] In `event` handler: handle `session.idle`, `session.error`, and `permission.asked` events
- [x] For `session.idle` and `session.error`: perform subagent suppression via `client.session.get()`
- [x] For `permission.asked`: always send notification (no subagent check)
- [x] Check ordering: `config.enabled` → `config.events[eventType].enabled` → subagent suppression → construct `NotificationContext` → call `backend.send(context)` (no title/message resolution)
- [x] Remove title/message resolution from plugin factory (backends decide their own content)
- [x] Call `backend.send()`, catch and ignore errors
- [x] Plugin factory tests must NOT use `vi.mock()` -- supply dependencies directly
- [x] Update integration tests in `tests/plugin-factory.test.ts` to match new `NotificationContext` shape (no title/message)
- [x] Ensure tests pass and package builds cleanly

## Phase 8: Public API (`src/index.ts`)

- [x] Export spec-required items: `createNotificationPlugin`, `renderTemplate`, `execCommand`, `execTemplate`, `loadConfig`, `getBackendConfig` (values), `NotificationBackend`, `NotificationContext`, `NotificationEvent`, `EventMetadata`, `NotificationSDKConfig` (types)
- [x] Do NOT export internal helpers (`NOTIFICATION_EVENTS`, `parseConfigFile`)
- [x] Update export verification tests in `tests/index.test.ts`
- [x] Ensure tests pass, lint is clean, and package builds cleanly

## Phase 9: CI Pipeline

- [x] Create `.github/workflows/ci.yml` with Bun 1.x for lint, build, and test
- [x] Run lint, build, and test steps in CI
- [x] Add publish step (runs only on latest Node.js version, on tag push)

## Phase 10: Documentation

- [x] Update `docs/creating-a-plugin.md` to reflect new API (no title/message on context, content utilities instead of shell templates)
- [x] Update `README.md` to reflect new API (no title/message, content utilities, no templates in config)

## Phase 11: JSDoc Docstrings on Public API

- [x] Update JSDoc docstrings on all exported items to match new API
- [x] Ensure tests pass, lint is clean, and package builds cleanly

## Phase 12: Spec Alignment Fixes

- [x] Update `getBackendConfig` to accept a `backendName` parameter matching the spec signature `getBackendConfig(config, backendName)`
- [x] Update tests for `getBackendConfig` to cover new signature
- [x] Update CI pipeline (`.github/workflows/ci.yml`) to use Bun 1.x instead of Node.js matrix, per spec: "CI matrix running lint, build, and test against the latest Bun 1.x release"
- [x] Update README.md and docs to reflect new `getBackendConfig` signature
- [x] Ensure tests pass, lint is clean, and package builds cleanly
