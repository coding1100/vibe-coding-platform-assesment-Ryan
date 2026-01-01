import { task } from "@trigger.dev/sdk";
import { e2bClient } from "@/lib/e2b-client";
import { createSandboxAdapter } from "@/lib/sandbox-adapter";

/**
 * Trigger.dev task for reading files from e2b sandbox
 * 
 * This task ensures file reading happens in the same execution context
 * as the sandbox creation/write operations.
 */
export const readFileTask = task({
  id: "read-file",
  run: async (payload: {
    sandboxId: string;
    path: string;
  }) => {
    try {
      const { e2bClient } = await import("@/lib/e2b-client");
      
      const sandbox = await e2bClient.getSandbox(payload.sandboxId);
      const adapter = createSandboxAdapter(payload.sandboxId, sandbox);
      
      const stream = await adapter.readFile({ path: payload.path });
      
      if (!stream) {
        return {
          success: false,
          error: 'File not found',
          content: null,
        };
      }

      // Read all chunks from the stream
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Combine chunks into a single buffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to string
      const content = new TextDecoder().decode(combined);

      return {
        success: true,
        content,
        path: payload.path,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        content: null,
      };
    }
  },
});

