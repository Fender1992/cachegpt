import modelConfig from '@/config/llm-models.json'

export interface LLMModel {
  id: string
  name: string
  default?: boolean
  maxTokens: number
}

export interface LLMProvider {
  name: string
  models: LLMModel[]
}

class LLMConfig {
  private config = modelConfig
  private lastChecked: Date | null = null
  private checkInterval = 24 * 60 * 60 * 1000 // 24 hours

  async getProviders(): Promise<Record<string, LLMProvider>> {
    // Check for updates if needed
    await this.checkForUpdates()
    return this.config.providers
  }

  async getDefaultModel(provider: string): Promise<string> {
    const providers = await this.getProviders()
    const providerConfig = providers[provider]
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`)
    }

    const defaultModel = providerConfig.models.find(m => m.default)
    return defaultModel?.id || providerConfig.models[0].id
  }

  async getModelsForProvider(provider: string): Promise<LLMModel[]> {
    const providers = await this.getProviders()
    const providerConfig = providers[provider]
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`)
    }
    return providerConfig.models
  }

  private async checkForUpdates() {
    // Skip if recently checked
    if (this.lastChecked && Date.now() - this.lastChecked.getTime() < this.checkInterval) {
      return
    }

    try {
      // Try to fetch latest config from API
      const response = await fetch(this.config.updateUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        // Short timeout to avoid blocking
        signal: AbortSignal.timeout(5000)
      }).catch(() => null)

      if (response?.ok) {
        const latestConfig = await response.json()

        // Enhanced version comparison logic
        if (this.shouldUpdateConfig(this.config, latestConfig)) {
          const oldVersion = this.config.lastUpdated
          this.config = latestConfig
          console.log(`LLM models configuration updated from ${oldVersion} to ${latestConfig.lastUpdated}`)

          // Log specific model changes
          this.logModelChanges(oldVersion, latestConfig)
        }
      }
    } catch (error) {
      // Silently fail - use existing config
      console.error('Failed to check for model updates:', error)
    }

    this.lastChecked = new Date()
  }

  private shouldUpdateConfig(currentConfig: any, latestConfig: any): boolean {
    // Check if lastUpdated is newer
    if (latestConfig.lastUpdated > currentConfig.lastUpdated) {
      return true
    }

    // Check if number of providers changed
    const currentProviders = Object.keys(currentConfig.providers || {}).length
    const latestProviders = Object.keys(latestConfig.providers || {}).length
    if (latestProviders !== currentProviders) {
      return true
    }

    // Check if any provider has different models
    for (const provider in latestConfig.providers) {
      const currentModels = currentConfig.providers?.[provider]?.models || []
      const latestModels = latestConfig.providers[provider].models || []

      if (currentModels.length !== latestModels.length) {
        return true
      }

      // Check model IDs
      const currentModelIds = new Set(currentModels.map((m: any) => m.id))
      const latestModelIds = new Set(latestModels.map((m: any) => m.id))

      if (currentModelIds.size !== latestModelIds.size ||
          ![...currentModelIds].every(id => latestModelIds.has(id))) {
        return true
      }
    }

    return false
  }

  private logModelChanges(oldVersion: string, newConfig: any) {
    const changes = []

    for (const provider in newConfig.providers) {
      const models = newConfig.providers[provider].models || []
      const defaultModel = models.find((m: any) => m.default)
      if (defaultModel) {
        changes.push(`${provider}: ${defaultModel.name} (${defaultModel.id})`)
      }
    }

    if (changes.length > 0) {
      console.log('Active models after update:', changes.join(', '))
    }
  }

  // Get the most advanced model for a provider
  async getMostAdvancedModel(provider: string): Promise<string> {
    const models = await this.getModelsForProvider(provider)
    // First model in list is typically the most advanced
    return models[0]?.id || 'unknown'
  }
}

// Singleton instance
export const llmConfig = new LLMConfig()

// Export convenience functions
export async function getDefaultModel(provider: string): Promise<string> {
  return llmConfig.getDefaultModel(provider)
}

export async function getProviders(): Promise<Record<string, LLMProvider>> {
  return llmConfig.getProviders()
}

export async function getMostAdvancedModel(provider: string): Promise<string> {
  return llmConfig.getMostAdvancedModel(provider)
}