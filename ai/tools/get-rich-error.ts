interface Params {
  args?: Record<string, unknown>
  action: string
  error: unknown
}

/**
 * Allows to parse a thrown error to check its metadata and construct a rich
 * message that can be handed to the LLM.
 * Updated to work with e2b errors instead of Vercel Sandbox errors.
 */
export function getRichError({ action, args, error }: Params) {
  const fields = getErrorFields(error)
  let message = `Error during ${action}: ${fields.message}`
  if (args) message += `\nParameters: ${JSON.stringify(args, null, 2)}`
  if (fields.json) message += `\nJSON: ${JSON.stringify(fields.json, null, 2)}`
  if (fields.text) message += `\nText: ${fields.text}`
  return {
    message: message,
    error: fields,
  }
}

function getErrorFields(error: unknown): {
  message: string
  json?: any
  text?: string
} {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      json: error,
    }
  } else {
    // Handle e2b errors - they're typically Error instances
    // Check for common e2b error patterns
    const errorMessage = error.message
    const errorName = error.name
    
    // Try to extract structured error info if available
    let json: any = { name: errorName, message: errorMessage }
    
    // If error has additional properties, include them
    if ('code' in error) {
      json.code = (error as any).code
    }
    if ('status' in error) {
      json.status = (error as any).status
    }
    
    return {
      message: errorMessage,
      json,
    }
  }
}
