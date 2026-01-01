import { SyntaxHighlighter } from './syntax-highlighter'
import { PulseLoader } from 'react-spinners'
import { memo } from 'react'
import useSWR from 'swr'

interface Props {
  sandboxId: string
  path: string
}

export const FileContent = memo(function FileContent({
  sandboxId,
  path,
}: Props) {
  const searchParams = new URLSearchParams({ path })
  const content = useSWR(
    `/api/sandboxes/${sandboxId}/files?${searchParams.toString()}`,
    async (pathname: string, init: RequestInit) => {
      const response = await fetch(pathname, init)
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = errorText
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.error || errorText
        } catch {
          // Not JSON, use text as-is
        }
        throw new Error(errorMessage)
      }
      
      const text = await response.text()
      return text
    },
    { 
      refreshInterval: 1000,
      shouldRetryOnError: false, // Don't retry on 503 errors (process isolation)
    }
  )

  if (content.isLoading) {
    return (
      <div className="absolute w-full h-full flex items-center text-center">
        <div className="flex-1">
          <PulseLoader className="opacity-60" size={8} />
        </div>
      </div>
    )
  }

  if (content.error) {
    return (
      <div className="absolute w-full h-full flex items-center justify-center p-4">
        <div className="text-center text-sm text-gray-600 max-w-md">
          <p className="font-semibold text-red-600 mb-2">Error reading file</p>
          <p className="text-xs">{content.error.message}</p>
          {content.error.message.includes('different worker process') && (
            <p className="text-xs mt-2 text-gray-500">
              Note: Files can only be read if the sandbox is in the same worker process. 
              This is a limitation of Trigger.dev's process isolation.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (!content.data) {
    return (
      <div className="absolute w-full h-full flex items-center text-center">
        <div className="flex-1">
          <PulseLoader className="opacity-60" size={8} />
        </div>
      </div>
    )
  }

  return <SyntaxHighlighter path={path} code={content.data} />
})
