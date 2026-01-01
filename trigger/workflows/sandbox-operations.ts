import { task } from "@trigger.dev/sdk";
import { e2bClient } from "@/lib/e2b-client";
import { createSandboxAdapter } from "@/lib/sandbox-adapter";
import { FileCache } from "@/lib/file-cache";

/**
 * Combined task for sandbox operations that ensures all operations
 * run in the same execution context.
 * 
 * This task can:
 * - Create a sandbox (if sandboxId not provided)
 * - Write files to the sandbox
 * - Run commands in the sandbox
 * 
 * All operations happen in the same execution context, so the sandbox
 * is accessible throughout.
 */
export const sandboxOperationsTask = task({
  id: "sandbox-operations",
  run: async (payload: {
    // If sandboxId is provided, use existing sandbox from cache
    // If not provided, create a new sandbox
    sandboxId?: string;
    createSandbox?: {
      timeout?: number;
      ports?: number[];
    };
    writeFiles?: Array<{ path: string; content: string }>;
    readFile?: {
      path: string;
    };
    runCommand?: {
      command: string;
      args?: string[];
      sudo?: boolean;
      wait?: boolean;
    };
  }) => {
    const { e2bClient } = await import("@/lib/e2b-client");
    
    let sandboxId: string;
    let sandboxCreated = false;

    if (payload.sandboxId) {
      try {
        await e2bClient.getSandbox(payload.sandboxId);
        sandboxId = payload.sandboxId;
      } catch (error) {
        const cachedFiles = FileCache.getFiles(payload.sandboxId);
        const result = await e2bClient.createSandbox({
          timeout: 600000,
          ports: [],
        });
        sandboxId = result.sandboxId;
        sandboxCreated = true;
        
        if (cachedFiles && cachedFiles.length > 0) {
          const sandbox = await e2bClient.getSandbox(sandboxId);
          const adapter = createSandboxAdapter(sandboxId, sandbox);
          await adapter.writeFiles(
            cachedFiles.map((file) => ({
              path: file.path,
              content: Buffer.from(file.content, 'utf8'),
            }))
          );
          FileCache.setFiles(sandboxId, cachedFiles);
          FileCache.clearSandbox(payload.sandboxId);
        }
      }
    } else if (payload.createSandbox) {
      const result = await e2bClient.createSandbox({
        timeout: payload.createSandbox.timeout,
        ports: payload.createSandbox.ports,
      });
      sandboxId = result.sandboxId;
      sandboxCreated = true;
    } else {
      throw new Error("Either sandboxId or createSandbox must be provided");
    }

    // Verify sandbox is accessible
    const sandbox = await e2bClient.getSandbox(sandboxId);
    const adapter = createSandboxAdapter(sandboxId, sandbox);

    const response: {
      sandboxId: string;
      sandboxCreated: boolean;
      writeFilesResult?: any;
      readFileResult?: any;
      runCommandResult?: any;
    } = {
      sandboxId,
      sandboxCreated,
    };

    if (payload.writeFiles && payload.writeFiles.length > 0) {
      const filesToWrite = payload.writeFiles.map((file) => ({
        path: file.path,
        content: Buffer.from(file.content, 'utf8'),
      }));
      
      await adapter.writeFiles(filesToWrite);
      FileCache.setFiles(sandboxId, payload.writeFiles);
      
      response.writeFilesResult = {
        status: 'success',
        filesWritten: payload.writeFiles.length,
        files: payload.writeFiles.map(f => f.path),
        fileContents: payload.writeFiles.map(f => ({
          path: f.path,
          content: f.content,
        })),
      };
    }

    if (payload.readFile) {
      try {
        const cachedContent = FileCache.getFile(sandboxId, payload.readFile.path);
        if (cachedContent !== null) {
          response.readFileResult = {
            success: true,
            content: cachedContent,
            path: payload.readFile.path,
            fromCache: true,
          };
        } else {
          const stream = await adapter.readFile({ path: payload.readFile.path });
          
          if (!stream) {
            response.readFileResult = {
              success: false,
              error: 'File not found',
              content: null,
            };
          } else {
            const chunks: Uint8Array[] = [];
            for await (const chunk of stream) {
              chunks.push(chunk);
            }

            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }

            const content = new TextDecoder().decode(combined);
            FileCache.setFile(sandboxId, payload.readFile.path, content);

            response.readFileResult = {
              success: true,
              content,
              path: payload.readFile.path,
              fromCache: false,
            };
          }
        }
      } catch (error) {
        const cachedContent = FileCache.getFile(sandboxId, payload.readFile.path);
        if (cachedContent !== null) {
          response.readFileResult = {
            success: true,
            content: cachedContent,
            path: payload.readFile.path,
            fromCache: true,
          };
        } else {
          response.readFileResult = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            content: null,
          };
        }
      }
    }

    if (payload.runCommand) {
      const cmd = await adapter.runCommand({
        cmd: payload.runCommand.command,
        args: payload.runCommand.args,
        sudo: payload.runCommand.sudo,
        detached: !payload.runCommand.wait,
      });

      if (payload.runCommand.wait) {
        const result = await cmd.wait();
        const stdout = await result.stdout();
        const stderr = await result.stderr();
        
        response.runCommandResult = {
          commandId: cmd.cmdId,
          exitCode: result.exitCode,
          stdout,
          stderr,
          status: 'completed' as const,
        };
        
        const { CommandCache } = await import("@/lib/command-cache");
        CommandCache.setCommand({
          cmdId: cmd.cmdId,
          sandboxId,
          command: payload.runCommand.command,
          args: payload.runCommand.args,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: result.exitCode,
          startedAt: Date.now() - 5000,
          completedAt: Date.now(),
          status: 'completed',
        });
      } else {
        response.runCommandResult = {
          commandId: cmd.cmdId,
          status: 'running' as const,
        };
      }
    }

    return response;
  },
});

