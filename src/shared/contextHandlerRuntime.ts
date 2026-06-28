export const CONTEXT_HANDLER_EXPERIMENTAL_ENABLED = false;
export const CONTEXT_HANDLER_DISABLED_REASON =
  "Context handler injection remains disabled in 0.14; safe normal prompt injection uses the Lumiverse interceptor path instead.";

export interface ContextHandlerRuntimeInput {
  context: unknown;
  enabled?: boolean;
  run: (context: unknown) => Promise<unknown>;
  onError?: (message: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runContextHandlerFailSafe(input: ContextHandlerRuntimeInput): Promise<unknown> {
  if (input.enabled !== true) return null;
  try {
    return await input.run(input.context);
  } catch (error) {
    input.onError?.(errorMessage(error));
    return null;
  }
}
