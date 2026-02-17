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

/**
 * Combine {@link renderTemplate} and {@link execCommand} into a single
 * operation: render template variables into a command string, execute it,
 * and return the stdout.
 *
 * @param $ - The Bun shell from {@link PluginInput}.
 * @param template - A command template string containing `{var_name}` placeholders.
 * @param context - The notification context from which to derive variable values.
 * @returns A promise that resolves to the trimmed stdout of the executed command.
 * @throws If the command fails (non-zero exit code) or throws an exception.
 */
export async function execTemplate(
  $: PluginInput["$"],
  template: string,
  context: NotificationContext,
): Promise<string> {
  const command = renderTemplate(template, context);
  return execCommand($, command);
}

function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

