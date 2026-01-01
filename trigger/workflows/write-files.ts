import { task } from "@trigger.dev/sdk";
import { createSandboxAdapter } from "@/lib/sandbox-adapter";

/**
 * Trigger.dev task for writing files to e2b sandbox
 * 
 * NOTE: This task requires the sandbox to exist in the global cache,
 * which means it must have been created in the same worker process.
 */
export const writeFilesTask = task({
  id: "write-files",
  run: async (payload: {
    sandboxId: string;
    files: Array<{ path: string; content: string }>;
  }) => {
    try {
      const { e2bClient } = await import("@/lib/e2b-client");
      const sandbox = await e2bClient.getSandbox(payload.sandboxId);
      const adapter = createSandboxAdapter(payload.sandboxId, sandbox);

      await adapter.writeFiles(
        payload.files.map((file) => ({
          path: file.path,
          content: Buffer.from(file.content, 'utf8'),
        }))
      );

      return {
        status: 'success' as const,
        filesWritten: payload.files.length,
      };
    } catch (error) {
      throw error;
    }
  },
});

