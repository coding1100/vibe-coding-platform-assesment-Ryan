import type { Command, CommandLog } from '@/components/commands-logs/types'
import type { DataPart } from '@/ai/messages/data-parts'
import type { ChatStatus, DataUIPart } from 'ai'
import { useMonitorState } from '@/components/error-monitor/state'
import { useMemo } from 'react'
import { create } from 'zustand'

interface SandboxStore {
  addGeneratedFiles: (files: string[]) => void
  addLog: (data: { sandboxId: string; cmdId: string; log: CommandLog }) => void
  addPaths: (paths: string[]) => void
  chatStatus: ChatStatus
  clearGeneratedFiles: () => void
  commands: Command[]
  fileContents: Map<string, Map<string, string>> // sandboxId -> Map<path, content>
  generatedFiles: Set<string>
  paths: string[]
  sandboxId?: string
  setChatStatus: (status: ChatStatus) => void
  setFileContent: (sandboxId: string, path: string, content: string) => void
  getFileContent: (sandboxId: string, path: string) => string | null
  setSandboxId: (id: string) => void
  setStatus: (status: 'running' | 'stopped') => void
  setUrl: (url: string, uuid: string) => void
  status?: 'running' | 'stopped'
  upsertCommand: (command: Omit<Command, 'startedAt'>) => void
  url?: string
  urlUUID?: string
}

function getBackgroundCommandErrorLines(commands: Command[]) {
  return commands
    .flatMap(({ command, args, background, logs = [] }) =>
      logs.map((log) => ({ command, args, background, ...log }))
    )
    .sort((logA, logB) => logA.timestamp - logB.timestamp)
    .filter((log) => log.stream === 'stderr' && log.background)
}

export function useCommandErrorsLogs() {
  const { commands } = useSandboxStore()
  const errors = useMemo(
    () => getBackgroundCommandErrorLines(commands),
    [commands]
  )
  return { errors }
}

export const useSandboxStore = create<SandboxStore>()((set, get) => ({
  addGeneratedFiles: (files) =>
    set((state) => ({
      generatedFiles: new Set([...state.generatedFiles, ...files]),
    })),
  addLog: (data) => {
    set((state) => {
      const idx = state.commands.findIndex((c) => c.cmdId === data.cmdId)
      if (idx === -1) {
        console.warn(`Command with ID ${data.cmdId} not found.`)
        return state
      }
      const updatedCmds = [...state.commands]
      updatedCmds[idx] = {
        ...updatedCmds[idx],
        logs: [...(updatedCmds[idx].logs ?? []), data.log],
      }
      return { commands: updatedCmds }
    })
  },
  addPaths: (paths) =>
    set((state) => ({ paths: [...new Set([...state.paths, ...paths])] })),
  chatStatus: 'ready',
  clearGeneratedFiles: () => set(() => ({ generatedFiles: new Set<string>() })),
  commands: [],
  fileContents: new Map<string, Map<string, string>>(),
  generatedFiles: new Set<string>(),
  paths: [],
  setChatStatus: (status) =>
    set((state) =>
      state.chatStatus === status ? state : { chatStatus: status }
    ),
  setFileContent: (sandboxId, path, content) => {
    set((state) => {
      const newFileContents = new Map(state.fileContents)
      if (!newFileContents.has(sandboxId)) {
        newFileContents.set(sandboxId, new Map<string, string>())
      }
      const sandboxFiles = newFileContents.get(sandboxId)!
      const normalizedPath = path.startsWith('/') ? path : `/${path}`
      sandboxFiles.set(normalizedPath, content)
      return { fileContents: newFileContents }
    })
  },
  getFileContent: (sandboxId, path) => {
    const state = get()
    const sandboxFiles = state.fileContents.get(sandboxId)
    if (!sandboxFiles) return null
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return sandboxFiles.get(normalizedPath) || sandboxFiles.get(path) || null
  },
  setSandboxId: (sandboxId) =>
    set(() => ({
      sandboxId,
      status: 'running',
      commands: [],
      paths: [],
      url: undefined,
      generatedFiles: new Set<string>(),
      // Don't clear fileContents - keep them for reading
    })),
  setStatus: (status) => set(() => ({ status })),
  setUrl: (url, urlUUID) => set(() => ({ url, urlUUID })),
  upsertCommand: (cmd) => {
    set((state) => {
      const existingIdx = state.commands.findIndex((c) => c.cmdId === cmd.cmdId)
      const idx = existingIdx !== -1 ? existingIdx : state.commands.length
      const prev = state.commands[idx] ?? { startedAt: Date.now(), logs: [] }
      const cmds = [...state.commands]
      cmds[idx] = { ...prev, ...cmd }
      return { commands: cmds }
    })
  },
}))

interface FileExplorerStore {
  paths: string[]
  addPath: (path: string) => void
}

export const useFileExplorerStore = create<FileExplorerStore>()((set) => ({
  paths: [],
  addPath: (path) => {
    set((state) => {
      if (!state.paths.includes(path)) {
        return { paths: [...state.paths, path] }
      }
      return state
    })
  },
}))

export function useDataStateMapper() {
  const { addPaths, setSandboxId, setUrl, upsertCommand, addGeneratedFiles, setFileContent } =
    useSandboxStore()
  const { errors } = useCommandErrorsLogs()
  const { setCursor } = useMonitorState()

  return (data: DataUIPart<DataPart>) => {
    switch (data.type) {
      case 'data-create-sandbox':
        if (data.data.sandboxId) {
          setSandboxId(data.data.sandboxId)
        }
        // If files were written during sandbox creation, add their paths and cache contents
        // Check both writeFilesResult.files and direct paths property
        const filePaths = data.data.paths || data.data.writeFilesResult?.files || []
        if (Array.isArray(filePaths) && filePaths.length > 0) {
          addPaths(filePaths)
          addGeneratedFiles(filePaths)
        }
        // Cache file contents if available in the response
        if (data.data.writeFilesResult?.fileContents && Array.isArray(data.data.writeFilesResult.fileContents)) {
          const sandboxId = data.data.sandboxId
          if (sandboxId) {
            for (const file of data.data.writeFilesResult.fileContents) {
              setFileContent(sandboxId, file.path, file.content)
            }
          }
        }
        // Also check direct fileContents property
        if (data.data.fileContents && Array.isArray(data.data.fileContents)) {
          const sandboxId = data.data.sandboxId
          if (sandboxId) {
            for (const file of data.data.fileContents) {
              setFileContent(sandboxId, file.path, file.content)
            }
          }
        }
        break
      case 'data-generating-files':
        if (data.data.status === 'uploaded') {
          setCursor(errors.length)
          addPaths(data.data.paths)
          addGeneratedFiles(data.data.paths)
          // Cache file contents if available
          if (data.data.fileContents && Array.isArray(data.data.fileContents)) {
            const sandboxId = data.data.sandboxId
            if (sandboxId) {
              for (const file of data.data.fileContents) {
                setFileContent(sandboxId, file.path, file.content)
              }
            }
          }
        }
        break
      case 'data-run-command':
        if (data.data.commandId) {
          // Add command to store for all statuses: executing, running, done, error
          // This ensures completed commands are also tracked so their logs can be fetched
          upsertCommand({
            background: data.data.status === 'running',
            sandboxId: data.data.sandboxId,
            cmdId: data.data.commandId,
            command: data.data.command,
            args: data.data.args,
            exitCode: data.data.exitCode,
          })
        }
        break
      case 'data-get-sandbox-url':
        if (data.data.url) {
          setUrl(data.data.url, crypto.randomUUID())
        }
        break
      default:
        break
    }
  }
}
