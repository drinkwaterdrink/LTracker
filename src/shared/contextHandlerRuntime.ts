export const CONTEXT_HANDLER_EXPERIMENTAL_ENABLED = false;
export const CONTEXT_HANDLER_DISABLED_REASON =
  "Context handler injection is disabled in 0.13 while the Lumiverse context handler return contract is being verified.";

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
