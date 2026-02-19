# opencode-notification-sdk

[![CI](https://github.com/lannuttia/opencode-notification-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/lannuttia/opencode-notification-sdk/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/lannuttia/opencode-notification-sdk/graph/badge.svg)](https://codecov.io/gh/lannuttia/opencode-notification-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/lannuttia/opencode-notification-sdk/blob/main/LICENSE)
[![Known Vulnerabilities](https://snyk.io/test/github/lannuttia/opencode-notification-sdk/badge.svg)](https://snyk.io/test/github/lannuttia/opencode-notification-sdk)

A TypeScript SDK that provides a standard notification decision engine for [OpenCode](https://opencode.ai) plugins. Backend notification plugins (ntfy.sh, desktop notifications, Slack, etc.) only need to implement a simple `send()` method -- the SDK handles everything else.

## Features

- **Event filtering** -- determines which OpenCode events should trigger notifications
- **Subagent suppression** -- silently suppresses notifications from sub-agent (child) sessions
- **Content utilities** -- composable functions for producing dynamic notification content: `renderTemplate()`, `execCommand()`, `execTemplate()`

## Supported Events

| Event | Description |
|---|---|
| `session.idle` | Agent finished generating and is waiting for input |
| `session.error` | Session encountered an error |
| `permission.asked` | Agent needs user permission to continue |

## Installation

```bash
bun add opencode-notification-sdk
```

`@opencode-ai/plugin` is a peer dependency and must be available in the consuming project:

```bash
bun add -d @opencode-ai/plugin
```

## Quick Start

Create a notification backend and wire it into an OpenCode plugin:

```typescript
import type { NotificationBackend, NotificationContext } from "opencode-notification-sdk";
import { createNotificationPlugin, renderTemplate } from "opencode-notification-sdk";

const myBackend: NotificationBackend = {
  async send(context: NotificationContext): Promise<void> {
    const title = renderTemplate("OpenCode: {event}", context);
    const message = renderTemplate("{project} - {session_id}", context);
    console.log(`[${title}] ${message}`);
  },
};

const plugin = createNotificationPlugin(myBackend, {
  backendConfigKey: "mybackend",
});

export default plugin;
```

That's it. The SDK handles event filtering and subagent suppression. Your backend decides what content to produce and how to deliver it.

## Configuration

Each backend plugin has its own config file. The config file path is determined by the `backendConfigKey` provided to `createNotificationPlugin()`:

```
~/.config/opencode/notification-<backendConfigKey>.json
```

For example, a plugin with `backendConfigKey: "ntfy"` reads from `~/.config/opencode/notification-ntfy.json`. If no `backendConfigKey` is provided, the SDK falls back to `~/.config/opencode/notification.json`.

When the config file does not exist, all defaults are used (everything enabled, empty backend config).

### Config File Schema

```json
{
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true }
  },
  "backend": {
    "topic": "my-topic",
    "server": "https://ntfy.sh"
  }
}
```

### Config Options

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Global kill switch for all notifications |
| `events` | `object` | (all enabled) | Per-event enable/disable toggles |
| `events.<type>.enabled` | `boolean` | `true` | Whether this event type triggers notifications |
| `backend` | `object` | `{}` | Backend-specific configuration for this plugin |

### Variable Substitution

All string values in the config file support two placeholder syntaxes, expanded before validation:

- **`{env:VAR_NAME}`** -- replaced with the value of the corresponding environment variable. If the variable is not set, the placeholder is replaced with an empty string.
- **`{file:path/to/file}`** -- replaced with the trimmed contents of the specified file. Paths can be absolute (`/`), home-relative (`~`), or relative to the config file's directory. If the file does not exist or cannot be read, the placeholder is replaced with an empty string.

This allows sensitive values (tokens, topics, etc.) to be externalized from the config file, making the config safe to commit to version control.

```json
{
  "backend": {
    "topic": "{env:NTFY_TOPIC}",
    "token": "{file:~/.secrets/ntfy-token}"
  }
}
```

### Content Utilities

The SDK provides three composable functions for producing dynamic notification content. Backends call these as needed:

#### `renderTemplate(template, context)`

Pure, synchronous string interpolation. Substitutes `{var_name}` placeholders with values from the `NotificationContext`.

#### `execCommand($, command)`

Executes a shell command via the Bun `$` shell and returns trimmed stdout. Rejects on failure.

#### `execTemplate($, template, context)`

Combines `renderTemplate()` and `execCommand()`: renders placeholders, then executes the resulting command.

#### Template Variables

| Variable | Source | Description |
|---|---|---|
| `{event}` | `context.event` | The event type string (e.g., `session.idle`) |
| `{time}` | `context.metadata.timestamp` | ISO 8601 timestamp |
| `{project}` | `context.metadata.projectName` | Project directory name (basename) |
| `{session_id}` | `context.metadata.sessionId` | The session ID (empty string if unavailable) |
| `{error}` | `context.metadata.error` | The error message (empty string if not present) |
| `{permission_type}` | `context.metadata.permissionType` | The permission type (empty string if not present) |
| `{permission_patterns}` | `context.metadata.permissionPatterns` | Comma-separated list of patterns (empty string if not present) |

## API Reference

### `createNotificationPlugin(backend, options?)`

Creates a fully functional OpenCode plugin from a backend implementation.

```typescript
function createNotificationPlugin(
  backend: NotificationBackend,
  options?: { backendConfigKey?: string }
): Plugin;
```

- `backend` -- an object implementing the `NotificationBackend` interface
- `options.backendConfigKey` -- determines the config file path (`~/.config/opencode/notification-<key>.json`)

### `loadConfig(backendConfigKey?)`

Loads the notification SDK configuration from the appropriate config file. Accepts an optional `backendConfigKey` to determine the config file path.

```typescript
function loadConfig(backendConfigKey?: string): NotificationSDKConfig;
```

### `getBackendConfig(config, backendName)`

Extracts the backend-specific configuration from the full config.

```typescript
function getBackendConfig(
  config: NotificationSDKConfig,
  backendName: string
): Record<string, unknown>;
```

### `renderTemplate(template, context)`

Pure, synchronous string interpolation of `{var_name}` placeholders from a `NotificationContext`.

```typescript
function renderTemplate(template: string, context: NotificationContext): string;
```

### `execCommand($, command)`

Executes a shell command string and returns its trimmed stdout.

```typescript
function execCommand($: PluginInput["$"], command: string): Promise<string>;
```

### `execTemplate($, template, context)`

Renders template variables into a command string, executes it, and returns the stdout.

```typescript
function execTemplate($: PluginInput["$"], template: string, context: NotificationContext): Promise<string>;
```

### Types

```typescript
// The three supported notification event types
type NotificationEvent = "session.idle" | "session.error" | "permission.asked";

// Context passed to backend.send()
interface NotificationContext {
  event: NotificationEvent;
  metadata: EventMetadata;
}

// Event metadata
interface EventMetadata {
  sessionId: string;
  projectName: string;
  timestamp: string;
  error?: string;
  permissionType?: string;
  permissionPatterns?: string[];
}

// Interface backends must implement
interface NotificationBackend {
  send(context: NotificationContext): Promise<void>;
}

// Full configuration schema
interface NotificationSDKConfig {
  enabled: boolean;
  events: Record<NotificationEvent, { enabled: boolean }>;
  backend: Record<string, unknown>;
}
```

## Creating a Custom Plugin

See [docs/creating-a-plugin.md](docs/creating-a-plugin.md) for a comprehensive guide on building your own notification backend plugin, including:

- Implementing the `NotificationBackend` interface
- Using `createNotificationPlugin()` with backend-specific configuration
- Using content utilities (`renderTemplate()`, `execCommand()`, `execTemplate()`) to produce notification content
- A complete working example (webhook notifier)
- Testing tips

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Lint
bun run lint

# Build
bun run build
```

## License

MIT
