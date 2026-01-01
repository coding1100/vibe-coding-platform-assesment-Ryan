import { task } from "@trigger.dev/sdk";
import { e2bClient } from "@/lib/e2b-client";

/**
 * Trigger.dev task for creating e2b sandboxes
 * 
 * This task can optionally chain write-files and run-command operations
 * to ensure they all run in the same execution context.
 */
export const createSandboxTask = task({
  id: "create-sandbox",
  run: async (payload: {
    timeout?: number;
    ports?: number[];
    // Optional: Chain operations in the same execution context
    writeFiles?: Array<{ path: string; content: string }>;
    runCommand?: {
      command: string;
      args?: string[];
      sudo?: boolean;
      wait?: boolean;
    };
  }) => {
    try {
      // Get fresh reference to ensure we're using the singleton
      const { e2bClient } = await import("@/lib/e2b-client");
      
      const result = await e2bClient.createSandbox({
        timeout: payload.timeout,
        ports: payload.ports,
      });

      await e2bClient.getSandbox(result.sandboxId);

      const response: {
        sandboxId: string;
        status: 'created' | 'created-with-operations';
        writeFilesResult?: any;
        runCommandResult?: any;
      } = {
        sandboxId: result.sandboxId,
        status: 'created',
      };

      // Note: Tasks cannot call other tasks directly.
      // If you need to chain operations, use the sandbox-operations task instead,
      // which handles all operations in a single execution context.
      // This task only creates the sandbox - additional operations should be done
      // via sandbox-operations task from the application code.

      return response;
    } catch (error) {
      throw error;
    }
  },
});

