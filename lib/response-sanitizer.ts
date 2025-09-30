/**
 * Comprehensive response sanitization utility
 * Cleans AI model responses of execution tags, artifacts, and formatting issues
 */

/**
 * Remove model-specific execution and control tags
 */
function removeExecutionTags(response: string): string {
  return response
    // Python execution tags
    .replace(/<\|python_start\|>/g, '')
    .replace(/<\|python_end\|>/g, '')
    .replace(/<\|python\|>/g, '')

    // Generic execution tags
    .replace(/<\|execution\|>/g, '')
    .replace(/<\|end_execution\|>/g, '')
    .replace(/<\|exec\|>/g, '')
    .replace(/<\|\/exec\|>/g, '')

    // Tool/function call tags
    .replace(/<\|tool_call\|>/g, '')
    .replace(/<\|end_tool_call\|>/g, '')
    .replace(/<\|function\|>/g, '')
    .replace(/<\|\/function\|>/g, '')

    // Code execution tags
    .replace(/<\|code\|>/g, '')
    .replace(/<\|\/code\|>/g, '')

    // Reasoning/thinking tags (keep content but remove tags)
    .replace(/<think>/g, '')
    .replace(/<\/think>/g, '')
    .replace(/<thinking>/g, '')
    .replace(/<\/thinking>/g, '')

    // Instruction tags
    .replace(/\[INST\]/g, '')
    .replace(/\[\/INST\]/g, '')
    .replace(/<\|im_start\|>/g, '')
    .replace(/<\|im_end\|>/g, '')

    // System/assistant tags
    .replace(/<\|system\|>/g, '')
    .replace(/<\|assistant\|>/g, '')
    .replace(/<\|user\|>/g, '')
}

/**
 * Clean up code blocks that are incomplete or empty
 */
function cleanCodeBlocks(response: string): string {
  return response
    // Remove empty code blocks
    .replace(/```[\w]*\s*\n\s*```/g, '')

    // Remove code blocks with only whitespace
    .replace(/```[\w]*\s*\n\s+\n\s*```/g, '')

    // Fix unclosed code blocks at the end
    .replace(/```[\w]*\s*\n([^`]+)$/g, (match, code) => {
      // If it looks like incomplete code, remove the opening marker
      if (code.trim().split('\n').length < 3) {
        return code.trim()
      }
      // Otherwise close it properly
      return match + '\n```'
    })
}

/**
 * Remove function/tool call JSON artifacts
 */
function removeFunctionCallArtifacts(response: string): string {
  // Remove standalone function call JSON objects
  const functionCallPattern = /\{[\s\n]*"(function|tool|name)":\s*"[^"]+",[\s\n]*"(arguments|parameters)":\s*\{[^}]*\}[\s\n]*\}/g
  let cleaned = response.replace(functionCallPattern, '')

  // Remove "Calling function..." type messages
  cleaned = cleaned.replace(/^(Calling|Invoking|Executing)\s+(function|tool):\s*.+$/gm, '')

  return cleaned
}

/**
 * Clean up excessive whitespace and formatting
 */
function normalizeWhitespace(response: string): string {
  return response
    // Remove multiple consecutive blank lines (more than 2)
    .replace(/\n\s*\n\s*\n+/g, '\n\n')

    // Remove trailing whitespace from lines
    .replace(/[ \t]+$/gm, '')

    // Trim overall response
    .trim()
}

/**
 * Remove common AI artifacts and hallucinations
 */
function removeArtifacts(response: string): string {
  return response
    // Remove "Here's the output:" type prefixes before empty output
    .replace(/^(Here's?|This is|The)\s+(the\s+)?(output|result|response):\s*$/gim, '')

    // Remove standalone "Output:" or "Result:" with nothing after
    .replace(/^(Output|Result):\s*$/gim, '')

    // Remove "I'll execute..." promises without actual results
    .replace(/^I'?ll\s+(execute|run|call).*$/gim, '')
}

/**
 * Detect if response is just raw JSON/XML and try to extract meaningful text
 */
function extractFromStructuredData(response: string): string {
  // If response starts with JSON object
  if (response.trim().startsWith('{') && response.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(response)
      // Common fields that contain the actual response
      if (parsed.response) return parsed.response
      if (parsed.content) return parsed.content
      if (parsed.text) return parsed.text
      if (parsed.message) return parsed.message
      if (parsed.answer) return parsed.answer

      // If no obvious field, return original
      return response
    } catch {
      // Not valid JSON, return as-is
      return response
    }
  }

  return response
}

/**
 * Main sanitization function - applies all cleaning steps
 */
export function sanitizeResponse(response: string): string {
  if (!response || typeof response !== 'string') {
    return response
  }

  let cleaned = response

  // Apply all sanitization steps in order
  cleaned = extractFromStructuredData(cleaned)
  cleaned = removeExecutionTags(cleaned)
  cleaned = removeFunctionCallArtifacts(cleaned)
  cleaned = removeArtifacts(cleaned)
  cleaned = cleanCodeBlocks(cleaned)
  cleaned = normalizeWhitespace(cleaned)

  // If sanitization removed everything, return original
  if (!cleaned || cleaned.length < 10) {
    return response
  }

  return cleaned
}

/**
 * Check if response contains execution artifacts that should be sanitized
 */
export function hasExecutionArtifacts(response: string): boolean {
  if (!response) return false

  const artifactPatterns = [
    /<\|python_end\|>/,
    /<\|execution\|>/,
    /<\|tool_call\|>/,
    /```[\w]*\s*\n\s*```/,
    /\{"function":\s*"/,
    /^Calling (function|tool):/m
  ]

  return artifactPatterns.some(pattern => pattern.test(response))
}