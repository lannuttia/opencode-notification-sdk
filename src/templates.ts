import type { BunShell } from "@opencode-ai/plugin/shell";

function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

export async function resolveField(
  $: BunShell,
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
