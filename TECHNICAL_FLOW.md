# Technical Flow Documentation

This document describes the technical flow of the Vibe Coding Platform, from user input to code execution and real-time updates.

## Overview

The platform follows a request-response pattern with real-time streaming capabilities:

```
User Input → AI Processing → Tool Execution → Sandbox Operations → Real-time Updates → UI
```

## Core Flow

### 1. User Input & Chat Processing

**Entry Point**: `app/chat.tsx`
- User submits message via chat interface
- Message sent to `/api/chat` endpoint

**API Route**: `app/api/chat/route.ts`
- Validates bot detection
- Retrieves available AI models
- Creates UI message stream
- Configures AI SDK with tools

### 2. AI Tool Selection

**AI Tools**: `ai/tools/index.ts`
- `createSandbox` - Creates new e2b sandbox
- `runCommand` - Executes commands in sandbox
- `generateFiles` - Generates and writes files
- `getSandboxURL` - Gets preview URLs

**Tool Execution Flow**:
```
AI Agent → Tool Call → Tool Execute Function → Trigger.dev Task
```

### 3. Trigger.dev Task Execution

**Task**: `trigger/workflows/sandbox-operations.ts`
- Handles sandbox creation, file operations, and command execution
- Ensures all operations run in same execution context
- Uses `e2bClient` to manage sandboxes

**Key Operations**:
- **Create Sandbox**: `e2bClient.createSandbox()`
- **Write Files**: `sandboxAdapter.writeFiles()`
- **Run Command**: `sandboxAdapter.runCommand()`
- **Read File**: `sandboxAdapter.readFile()`

### 4. e2b Sandbox Management

**Client**: `lib/e2b-client.ts`
- Maintains global sandbox store (Map)
- Handles sandbox lifecycle (create, retrieve, close)
- Supports reconnection via `Sandbox.connect()`
- Generates hosted URLs for port forwarding

**Adapter**: `lib/sandbox-adapter.ts`
- Bridges e2b SDK with expected interface
- Handles command execution with streaming
- Manages file operations
- Provides log streaming interface

### 5. Real-time Streaming

**Command Logs**: `app/api/sandboxes/[sandboxId]/cmds/[cmdId]/logs/route.ts`
- Streams command output via Server-Sent Events (SSE)
- Format: NDJSON (newline-delimited JSON)
- Streams stdout/stderr in real-time

**Client Streaming**: `components/commands-logs/commands-logs-stream.tsx`
- Fetches logs for running commands
- Updates Zustand store with log entries
- Handles command completion

### 6. State Management

**Store**: `app/state.ts` (Zustand)
- Sandbox state (ID, commands, files)
- Command tracking and logs
- File system state
- Chat status

**Caching**:
- **File Cache**: `lib/file-cache.ts` - Server-side file content cache
- **Command Cache**: `lib/command-cache.ts` - Server-side command output cache

### 7. UI Updates

**Components**:
- `app/chat.tsx` - Chat interface with message display
- `app/file-explorer.tsx` - File tree and content viewer
- `app/logs.tsx` - Command logs viewer
- `app/preview.tsx` - Preview panel with iframe

**Real-time Updates**:
- UI components subscribe to Zustand store
- Store updates trigger React re-renders
- Streaming data updates store incrementally

## Detailed Flows

### Flow 1: Create Sandbox

```
User: "Create a new sandbox"
  ↓
AI Tool: createSandbox
  ↓
Trigger.dev: sandbox-operations task
  ↓
e2bClient.createSandbox()
  ↓
Store in global Map
  ↓
Return sandboxId
  ↓
UI: Display sandbox created message
```

### Flow 2: Generate and Write Files

```
User: "Create a React app"
  ↓
AI Tool: generateFiles
  ↓
AI generates file contents
  ↓
For each file chunk:
  ↓
Trigger.dev: sandbox-operations task (writeFiles)
  ↓
sandboxAdapter.writeFiles()
  ↓
Cache files on server
  ↓
UI: Update file explorer
```

### Flow 3: Execute Command

```
User: "Run npm install"
  ↓
AI Tool: runCommand
  ↓
Trigger.dev: sandbox-operations task (runCommand)
  ↓
sandboxAdapter.runCommand()
  ↓
Command starts execution
  ↓
Cache command in server store
  ↓
UI: Show command in logs panel
  ↓
Client: Fetch logs via SSE
  ↓
Stream logs to UI in real-time
```

### Flow 4: Stream Command Logs

```
Command executing in sandbox
  ↓
Logs generated (stdout/stderr)
  ↓
Client: GET /api/sandboxes/{id}/cmds/{cmdId}/logs
  ↓
API: Check command cache
  ↓
If cached: Stream cached output
  ↓
If not cached: Get from sandbox adapter
  ↓
Stream via SSE (NDJSON format)
  ↓
Client: Parse NDJSON lines
  ↓
Update Zustand store
  ↓
UI: Display logs in real-time
```

## Data Structures

### Sandbox State
```typescript
{
  sandboxId: string
  commands: Command[]
  files: FileTree
}
```

### Command
```typescript
{
  cmdId: string
  sandboxId: string
  command: string
  args: string[]
  exitCode?: number
  logs: LogEntry[]
  status: 'running' | 'completed' | 'error'
}
```

### Log Entry
```typescript
{
  data: string
  stream: 'stdout' | 'stderr'
  timestamp: number
}
```

## Key Design Decisions

1. **Trigger.dev for Orchestration**: Ensures operations run in same execution context
2. **Global Sandbox Store**: Persists sandboxes across task executions
3. **Adapter Pattern**: Bridges e2b SDK with expected interface
4. **Caching Strategy**: Improves performance and enables API route access
5. **SSE for Streaming**: Real-time log streaming without WebSockets
6. **Zustand for State**: Lightweight state management for UI

## Error Handling

- **Tool Errors**: Caught in tool execute functions, returned as rich errors
- **Task Errors**: Propagated from Trigger.dev tasks
- **Sandbox Errors**: Handled in e2b client with reconnection attempts
- **Stream Errors**: Caught in streaming routes, returned as error logs

## Performance Considerations

- **File Caching**: Reduces repeated file reads
- **Command Caching**: Enables fast log retrieval
- **Lazy Loading**: Components load on demand
- **Streaming**: Incremental updates reduce latency
- **Global Stores**: Avoids repeated sandbox lookups

