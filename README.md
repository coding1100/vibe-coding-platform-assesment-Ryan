# Vibe Coding Platform

An AI-powered coding platform that enables users to create full-stack applications through natural language prompts. The platform uses **e2b sandboxes** for secure code execution and **Trigger.dev** for workflow orchestration, built on Next.js with the AI SDK.

## 🎯 Overview

This platform allows users to:
- **Create isolated sandbox environments** - Secure, containerized execution environments
- **Generate and manage code files** - AI-powered file generation and editing
- **Execute commands in real-time** - Run shell commands with live output streaming
- **Preview web applications** - View running applications with port forwarding
- **Stream command output and logs** - Real-time log streaming from command execution
- **Interactive chat interface** - Natural language interaction with AI coding assistant

## 🏗️ Architecture

### Technology Stack

- **Next.js 16** - React framework with App Router
- **e2b SDK** (`@e2b/code-interpreter`) - Sandbox execution environment
- **Trigger.dev** - Workflow orchestration and task management
- **AI SDK** (`ai`, `@ai-sdk/*`) - AI integration with OpenAI/Anthropic models
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Zod** - Schema validation

## 🚀 Getting Started

### Prerequisites

- **Node.js 22.x** - Required runtime
- **pnpm 9.13.0+** - Package manager (or compatible version)
- **e2b API key** - [Get one here](https://e2b.dev) → Dashboard → API Keys
- **Trigger.dev API key** - [Get one here](https://trigger.dev) → Project → Manage → API keys
- **OpenAI API key** - [Get one here](https://platform.openai.com/api-keys) (optional if using AI Gateway)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd vibe-coding-platform
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   OR
   npm install --legacy-peer-deps
   ```

3. **Set up Trigger.dev**:
   - Get your Project ID from [Trigger.dev Dashboard](https://cloud.trigger.dev)
   - Find the Project ID in your dashboard (format: `proj_xxxxx`)
   - Initialize Trigger.dev:
     ```bash
     npx trigger.dev@latest init -p YOUR_PROJECT_ID
     ```
   - **When prompted, select "CLI"** (not "Trigger.dev MCP")
   - Create an API key: Dashboard → **Manage** → **API keys** → Create new key

4. **Configure environment variables**:
   ```bash
   cp env.example .env.local
   ```
   
   Edit `.env.local` with your API keys:
   - `E2B_API_KEY` - Required for sandbox operations
   - `TRIGGER_API_KEY` - Required for workflow orchestration
   - `OPENAI_API_KEY` - Required if not using AI Gateway
   - `AI_GATEWAY_BASE_URL` - Optional, for Vercel AI Gateway
   - `AI_GATEWAY_API_KEY` - Optional, for Vercel AI Gateway

5. **Start development servers**:
   
   **Terminal 1 - Trigger.dev dev server**:
   ```bash
   npx trigger.dev@latest dev
   ```
   Keep this running to connect local tasks to Trigger.dev cloud.
   
   **Terminal 2 - Next.js dev server**:
   ```bash
   pnpm dev
   ```

6. **Open the application**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
vibe-coding-platform/
├── ai/                          # AI integration layer
│   ├── constants.ts            # Model constants and configuration
│   ├── gateway.ts              # AI Gateway/OpenAI provider setup
│   ├── messages/               # Message type definitions
│   └── tools/                  # AI tool definitions
│       ├── create-sandbox.ts   # Create e2b sandbox tool
│       ├── run-command.ts      # Execute commands tool
│       ├── generate-files.ts   # Generate and write files tool
│       ├── get-sandbox-url.ts  # Get preview URLs tool
│       └── index.ts            # Tool exports
├── app/                         # Next.js App Router
│   ├── api/                    # API routes
│   │   ├── chat/               # Chat API endpoint
│   │   └── sandboxes/          # Sandbox operations API
│   │       └── [sandboxId]/    # Sandbox-specific routes
│   │           ├── cmds/       # Command execution endpoints
│   │           └── files/      # File operations endpoints
│   ├── chat.tsx                # Chat UI component
│   ├── file-explorer.tsx       # File explorer UI
│   ├── logs.tsx                # Logs viewer UI
│   ├── preview.tsx              # Preview panel UI
│   ├── page.tsx                # Main page layout
│   └── state.ts                # Zustand state management
├── components/                  # React UI components
│   ├── chat/                   # Chat message components
│   ├── commands-logs/          # Command logs components
│   ├── error-monitor/          # Error monitoring
│   ├── file-explorer/          # File explorer components
│   ├── settings/               # Settings UI
│   └── ui/                     # Reusable UI components
├── lib/                         # Core libraries
│   ├── e2b-client.ts           # e2b SDK wrapper and sandbox management
│   ├── trigger-client.ts       # Trigger.dev client and task exports
│   ├── sandbox-adapter.ts      # Adapter layer for e2b compatibility
│   ├── file-cache.ts           # File content caching
│   ├── command-cache.ts        # Command output caching
│   └── chat-context.tsx        # Chat context provider
├── trigger/                     # Trigger.dev workflows
│   └── workflows/              # Task definitions
│       ├── create-sandbox.ts   # Sandbox creation task
│       ├── run-command.ts      # Command execution task
│       ├── write-files.ts      # File writing task
│       ├── read-file.ts       # File reading task
│       └── sandbox-operations.ts # Combined operations task
├── trigger.config.ts           # Trigger.dev configuration
├── package.json                # Dependencies and scripts
└── env.example                 # Environment variables template
```

## 🔧 Architecture

### Core Components

#### 1. **e2b Client** (`lib/e2b-client.ts`)
- Manages e2b sandbox lifecycle (create, retrieve, close)
- Maintains global sandbox store for cross-process access
- Handles sandbox reconnection via `Sandbox.connect()`
- Generates hosted URLs for port forwarding
- Tracks command execution state

#### 2. **Sandbox Adapter** (`lib/sandbox-adapter.ts`)
- Bridges e2b SDK APIs with expected interface
- Maintains compatibility with UI components
- Handles file operations (read/write)
- Executes commands with streaming support
- Provides command log streaming interface

#### 3. **Trigger.dev Workflows** (`trigger/workflows/`)
- **sandbox-operations.ts** - Combined task for sandbox operations
- **create-sandbox.ts** - Sandbox creation task
- **run-command.ts** - Command execution task
- **write-files.ts** - File writing task
- **read-file.ts** - File reading task

#### 4. **AI Tools** (`ai/tools/`)
- **create-sandbox.ts** - Creates e2b sandboxes via Trigger.dev
- **run-command.ts** - Executes commands in sandboxes
- **generate-files.ts** - Generates file contents using AI and writes to sandbox
- **get-sandbox-url.ts** - Gets preview URLs for exposed ports

#### 5. **State Management** (`app/state.ts`)
- Zustand store for sandbox state
- Command tracking and log management
- File system state
- Chat status tracking

### Data Flow

```
User Input (Chat)
  ↓
AI Agent (AI SDK) → Tool Selection
  ↓
AI Tools (create-sandbox, run-command, generate-files)
  ↓
Trigger.dev Tasks (sandbox-operations)
  ↓
e2b Client → Sandbox Adapter
  ↓
e2b Sandbox (Execution)
  ↓
Results → Caching (FileCache, CommandCache)
  ↓
Real-time Streaming → API Routes
  ↓
UI Updates (React Components)
```

### Key Features

- **Process Isolation Handling**: Uses global stores to maintain sandbox references across Trigger.dev task executions
- **Caching Strategy**: File and command output caching for performance
- **Real-time Streaming**: Command logs streamed via Server-Sent Events (SSE)
- **Error Handling**: Comprehensive error monitoring and reporting
- **Port Forwarding**: Automatic URL generation for exposed ports

## 🔑 Key Concepts

### Sandbox Lifecycle

1. **Creation**: Sandboxes are created via Trigger.dev tasks to ensure proper execution context
2. **Storage**: Sandboxes stored in global Map for cross-process access
3. **Reconnection**: If sandbox not in cache, attempts to reconnect using `Sandbox.connect()`
4. **Timeout**: Sandboxes auto-close after timeout (default: 10 minutes, max: 45 minutes)
5. **Cleanup**: Sandboxes can be manually closed or auto-cleanup on timeout

### Command Execution

- Commands run in isolated shell sessions (no persistent state between commands)
- Use absolute or relative paths instead of `cd` commands
- Commands can run in background (`wait: false`) or wait for completion (`wait: true`)
- Real-time log streaming via async iterators
- Command output cached for API route access

### File Operations

- Files written to `/home/user/` directory in sandbox
- File contents cached on server for fast retrieval
- Supports batch file operations
- Automatic directory creation

### Port Forwarding

- Ports exposed when creating sandbox
- URLs generated in format: `https://{sandboxId}-{port}.e2b.app`
- Common ports: 3000 (Next.js), 8000 (Python), 5000 (Flask)

## 🛠️ Development

### Available Scripts

```bash
# Development
pnpm dev              # Start Next.js dev server with Turbopack
pnpm build            # Build for production
pnpm start            # Start production server
pnpm type-check       # TypeScript type checking
pnpm lint             # ESLint code linting
```

### Development Workflow

1. **Start Trigger.dev dev server** (required):
   ```bash
   npx trigger.dev@latest dev
   ```

2. **Start Next.js dev server**:
   ```bash
   pnpm dev
   ```

3. **Make changes**:
   - Edit code in `app/`, `components/`, `lib/`, or `trigger/workflows/`
   - Trigger.dev tasks auto-reload
   - Next.js hot-reloads on file changes

### Building for Production

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

**Note**: In production, Trigger.dev tasks run in the cloud. Ensure your Trigger.dev project is properly configured.

## 📝 Environment Variables

| Variable | Description | Required | How to Get |
|----------|-------------|----------|-----------|
| `E2B_API_KEY` | e2b API key for sandbox operations | ✅ **Yes** | [e2b.dev](https://e2b.dev) → Dashboard → API Keys |
| `TRIGGER_API_KEY` | Trigger.dev API key | ✅ **Yes** | [trigger.dev](https://trigger.dev) → Project → Manage → API keys |
| `TRIGGER_API_URL` | Trigger.dev API URL | ❌ No | Defaults to `https://api.trigger.dev` |
| `OPENAI_API_KEY` | OpenAI API key | ⚠️ Conditional | [platform.openai.com](https://platform.openai.com) → API Keys (required if not using AI Gateway) |
| `AI_GATEWAY_BASE_URL` | Vercel AI Gateway URL | ❌ Optional | [vercel.com](https://vercel.com) → AI Gateway |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway API key | ❌ Optional | [vercel.com](https://vercel.com) → AI Gateway |

**Configuration Priority**:
1. If `AI_GATEWAY_BASE_URL` or `AI_GATEWAY_API_KEY` is set → Uses AI Gateway
2. If only `OPENAI_API_KEY` is set → Uses direct OpenAI API
3. If neither is set → Error (no AI provider available)

## 🚨 Important Notes

### Process Isolation

- **Trigger.dev tasks run in separate processes** - Sandboxes created in one task may not be accessible in another
- **Solution**: Use `sandbox-operations` task which ensures all operations run in the same execution context
- **Global Stores**: Sandboxes stored in global Map to persist across task executions in the same worker

### Caching Strategy

- **File Cache**: File contents cached on server for fast retrieval
- **Command Cache**: Command outputs cached for API route access
- **Cache Invalidation**: Caches cleared when sandbox is closed

### Production Considerations

- **Sandbox Storage**: Currently uses in-memory storage. For production, consider:
  - Database (PostgreSQL, MongoDB) for sandbox metadata
  - Redis for sandbox state caching
  - Scheduled cleanup jobs for inactive sandboxes
- **Error Handling**: Comprehensive error monitoring via `ErrorMonitor` component
- **Rate Limiting**: Consider implementing rate limits for API routes
- **Authentication**: Add authentication for production deployments

### Known Limitations

- Sandboxes are lost on server restart (in-memory storage)
- Command execution uses fresh shell sessions (no persistent state)
- Port forwarding requires ports to be specified at sandbox creation

## 🐛 Troubleshooting

### Common Issues

1. **"E2B_API_KEY is not configured"**
   - Ensure `.env.local` has `E2B_API_KEY` set
   - Restart both Trigger.dev and Next.js servers after adding env vars
   - Verify the API key is valid at [e2b.dev](https://e2b.dev)

2. **"Sandbox not found"**
   - Sandboxes are tracked in memory - lost on server restart
   - Create a new sandbox
   - Check if Trigger.dev task is running in the same process

3. **"Trigger.dev task failed"**
   - Ensure Trigger.dev dev server is running: `npx trigger.dev@latest dev`
   - Check Trigger.dev dashboard for task errors
   - Verify `TRIGGER_API_KEY` is set correctly
   - Check `trigger.config.ts` has correct project ID

4. **Command execution fails**
   - Commands run in fresh shell sessions - use absolute/relative paths
   - Check command syntax and arguments
   - Review e2b sandbox logs in dashboard

5. **Port forwarding not working**
   - Ports must be specified when creating sandbox
   - Verify URL format: `https://{sandboxId}-{port}.e2b.app`
   - Check if service is running on the specified port

6. **AI model not available**
   - Verify `OPENAI_API_KEY` or `AI_GATEWAY_BASE_URL` is set
   - Check AI Gateway configuration if using Gateway
   - Review available models in settings panel

## 📚 Additional Resources

- [e2b Documentation](https://e2b.dev/docs) - Sandbox execution environment
- [Trigger.dev Documentation](https://trigger.dev/docs) - Workflow orchestration
- [AI SDK Documentation](https://sdk.vercel.ai/docs) - AI integration
- [Next.js Documentation](https://nextjs.org/docs) - React framework
- [Technical Flow Documentation](./TECHNICAL_FLOW.md) - Detailed technical flow

## 📄 License

MIT

## 🤝 Contributing

This project is based on the Vercel Vibe Coding Platform. Contributions are welcome!

---

**Built with**: Next.js, e2b, Trigger.dev, AI SDK, TypeScript
