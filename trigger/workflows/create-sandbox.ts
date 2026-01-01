import { task } from "@trigger.dev/sdk";
import { e2bClient } from "@/lib/e2b-client";
import { writeFilesTask } from "./write-files";
import { runCommandTask } from "./run-command";

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

      if (payload.writeFiles && payload.writeFiles.length > 0) {
        const writeResult = await writeFilesTask.invoke({
          sandboxId: result.sandboxId,
          files: payload.writeFiles,
        });
        response.writeFilesResult = writeResult;
        response.status = 'created-with-operations';
      }

      if (payload.runCommand) {
        const commandResult = await runCommandTask.invoke({
          sandboxId: result.sandboxId,
          command: payload.runCommand.command,
          args: payload.runCommand.args,
          sudo: payload.runCommand.sudo,
          wait: payload.runCommand.wait ?? true,
        });
        response.runCommandResult = commandResult;
        response.status = 'created-with-operations';
      }

      return response;
    } catch (error) {
      throw error;
    }
  },
});

