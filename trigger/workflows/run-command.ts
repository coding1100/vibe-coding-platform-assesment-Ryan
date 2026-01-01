import { task } from "@trigger.dev/sdk";
import { e2bClient } from "@/lib/e2b-client";
import { createSandboxAdapter } from "@/lib/sandbox-adapter";

/**
 * Trigger.dev task for running commands in e2b sandbox
 * 
 * This task orchestrates command execution through Trigger.dev,
 * providing error handling and observability.
 */
export const runCommandTask = task({
  id: "run-command",
  run: async (payload: {
    sandboxId: string;
    command: string;
    args?: string[];
    sudo?: boolean;
    wait?: boolean;
  }) => {
    try {
      const { e2bClient } = await import("@/lib/e2b-client");
      const sandbox = await e2bClient.getSandbox(payload.sandboxId);
      const adapter = createSandboxAdapter(payload.sandboxId, sandbox);

      const cmd = await adapter.runCommand({
        cmd: payload.command,
        args: payload.args,
        sudo: payload.sudo,
        detached: !payload.wait,
      });

      if (payload.wait) {
        const result = await cmd.wait();

        return {
          commandId: cmd.cmdId,
          exitCode: result.exitCode,
          stdout: await result.stdout(),
          stderr: await result.stderr(),
          status: 'completed' as const,
        };
      } else {
        return {
          commandId: cmd.cmdId,
          status: 'running' as const,
        };
      }
    } catch (error) {
      throw error;
    }
  },
});

