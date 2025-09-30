/**
 * API Key validation utilities
 * Validates format and tests connection for each provider
 */

interface ValidationResult {
  valid: boolean
  error?: string
}

export const validateApiKeyFormat = (provider: string, apiKey: string): ValidationResult => {
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, error: 'API key cannot be empty' }
  }

  switch (provider) {
    case 'openai':
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI keys must start with "sk-"' }
      }
      if (apiKey.length < 40) {
        return { valid: false, error: 'OpenAI key appears too short' }
      }
      break

    case 'anthropic':
      if (!apiKey.startsWith('sk-ant-')) {
        return { valid: false, error: 'Anthropic keys must start with "sk-ant-"' }
      }
      if (apiKey.length < 50) {
        return { valid: false, error: 'Anthropic key appears too short' }
      }
      break

    case 'google':
      if (!apiKey.startsWith('AIza')) {
        return { valid: false, error: 'Google keys must start with "AIza"' }
      }
      if (apiKey.length < 30) {
        return { valid: false, error: 'Google key appears too short' }
      }
      break

    case 'perplexity':
      if (!apiKey.startsWith('pplx-')) {
        return { valid: false, error: 'Perplexity keys must start with "pplx-"' }
      }
      if (apiKey.length < 20) {
        return { valid: false, error: 'Perplexity key appears too short' }
      }
      break

    default:
      return { valid: false, error: 'Unknown provider' }
  }

  return { valid: true }
}

export const testApiKeyConnection = async (
  provider: string,
  apiKey: string
): Promise<ValidationResult> => {
  try {
    // Format validation first
    const formatCheck = validateApiKeyFormat(provider, apiKey)
    if (!formatCheck.valid) {
      return formatCheck
    }

    // Test actual API connection
    const response = await fetch('/api/test-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey })
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        valid: false,
        error: result.error || `Connection test failed (${response.status})`
      }
    }

    return { valid: true }
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || 'Network error during validation'
    }
  }
}