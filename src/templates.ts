import type { PluginInput } from "@opencode-ai/plugin";
import type { NotificationContext } from "./types.js";
import { buildTemplateVariables } from "./events.js";

/**
 * Pure, synchronous string interpolation of `{var_name}` placeholders
 * from a {@link NotificationContext}.
 *
 * Substitutes all `{var_name}` placeholders with the corresponding values
 * derived from the context. Unrecognized variable names are substituted
 * with empty strings. Performs no I/O, no shell execution, and has no
 * side effects.
 *
 * @param template - A template string containing `{var_name}` placeholders.
 * @param context - The notification context from which to derive variable values.
 * @returns The resulting string with all placeholders substituted.
 */
export function renderTemplate(
  template: string,
  context: NotificationContext,
): string {
  const variables = buildTemplateVariables(context.event, context.metadata);
  return substituteVariables(template, variables);
}

/**
 * Execute a shell command and return its trimmed stdout.
 *
 * @param $ - The Bun shell from {@link PluginInput}.
 * @param command - The shell command string to execute.
 * @returns A promise that resolves to the trimmed stdout if the command
 *   succeeds (exit code 0).
 * @throws If the command fails (non-zero exit code) or throws an exception.
 */
export async function execCommand(
  $: PluginInput["$"],
  command: string,
): Promise<string> {
  const result = await $`${{ raw: command }}`.nothrow().quiet();
  const output = result.text().trim();

  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed with exit code ${String(result.exitCode)}: ${command}`,
    );
  }

  return output;
}

function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

/**
 * Resolve a notification field (title or message) by executing a shell command
 * template, falling back to a default value.
 *
 * If the command template is `null` or `undefined`, returns the fallback directly.
 * Otherwise, substitutes all `{var_name}` placeholders with values from the
 * variables record, executes the command via the Bun shell, and returns the
 * trimmed stdout. Returns the fallback if the command fails (non-zero exit,
 * exception, or empty output).
 *
 * @param $ - The Bun shell from {@link PluginInput}.
 * @param commandTemplate - The shell command template string, or `null`/`undefined` to use the fallback.
 * @param variables - A record of variable names to substitute in the template.
 * @param fallback - The default value to return when no template is configured or the command fails.
 * @returns The resolved field value (trimmed command output or fallback).
 */
export async function resolveField(
  $: PluginInput["$"],
  commandTemplate: string | null | undefined,
  variables: Record<string, string>,
  fallback: string,
): Promise<string> {
  if (commandTemplate == null) {
    return fallback;
  }

  const command = substituteVariables(commandTemplate, variables);

  try {
    const result = await $`${{ raw: command }}`.nothrow().quiet();
    const output = result.text().trim();

    if (result.exitCode !== 0 || output === "") {
      return fallback;
    }

    return output;
  } catch {
    return fallback;
  }
}
