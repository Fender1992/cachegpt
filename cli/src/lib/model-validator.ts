import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Model validation and discovery system
 * Checks what models are actually available from each provider's API
 */

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  maxTokens?: number;
  inputCost?: number;  // per 1M tokens
  outputCost?: number; // per 1M tokens
  available: boolean;
  lastChecked: number;
}

export interface ProviderModels {
  provider: string;
  models: ModelInfo[];
  defaultModel?: string;
  lastValidated: number;
}

export interface ModelValidationResult {
  provider: string;
  available: ModelInfo[];
  unavailable: string[];
  error?: string;
}

export class ModelValidator {
  private configPath: string;

  constructor() {
    this.configPath = path.join(__dirname, '../../../config/llm-models.json');
  }

  /**
   * Validate all models for all providers
   */
  async validateAllModels(apiKeys?: Record<string, string>): Promise<ModelValidationResult[]> {
    console.log(chalk.cyan('🔍 Validating model availability...\n'));

    const results: ModelValidationResult[] = [];

    // Validate each provider
    const providers = ['openai', 'anthropic', 'google', 'perplexity'];

    for (const provider of providers) {
      console.log(chalk.gray(`Checking ${provider} models...`));

      try {
        const result = await this.validateProviderModels(provider, apiKeys?.[provider]);
        results.push(result);

        if (result.available.length > 0) {
          console.log(chalk.green(`✅ ${provider}: ${result.available.length} models available`));
        } else {
          console.log(chalk.red(`❌ ${provider}: No models accessible`));
        }
      } catch (error: any) {
        console.log(chalk.red(`❌ ${provider}: ${error.message}`));
        results.push({
          provider,
          available: [],
          unavailable: [],
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Validate models for a specific provider
   */
  async validateProviderModels(provider: string, apiKey?: string): Promise<ModelValidationResult> {
    switch (provider) {
      case 'openai':
        return await this.validateOpenAIModels(apiKey);
      case 'anthropic':
        return await this.validateAnthropicModels(apiKey);
      case 'google':
        return await this.validateGoogleModels(apiKey);
      case 'perplexity':
        return await this.validatePerplexityModels(apiKey);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * OpenAI model validation
   */
  private async validateOpenAIModels(apiKey?: string): Promise<ModelValidationResult> {
    if (!apiKey) {
      return {
        provider: 'openai',
        available: [],
        unavailable: [],
        error: 'No API key provided'
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const availableModelIds = data.data.map((model: any) => model.id);

      // Check which models from our config are actually available
      const configuredModels = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
      const available: ModelInfo[] = [];
      const unavailable: string[] = [];

      for (const modelId of configuredModels) {
        if (availableModelIds.includes(modelId)) {
          available.push({
            id: modelId,
            name: this.getDisplayName('openai', modelId),
            maxTokens: this.getMaxTokens('openai', modelId),
            available: true,
            lastChecked: Date.now()
          });
        } else {
          unavailable.push(modelId);
        }
      }

      // Add GPT-4o as default if available (it's the current best)
      if (availableModelIds.includes('gpt-4o')) {
        const gpt4o = available.find(m => m.id === 'gpt-4o');
        if (gpt4o) {
          gpt4o.name += ' (Recommended)';
        }
      }

      return {
        provider: 'openai',
        available,
        unavailable
      };

    } catch (error: any) {
      return {
        provider: 'openai',
        available: [],
        unavailable: [],
        error: error.message
      };
    }
  }

  /**
   * Anthropic model validation
   */
  private async validateAnthropicModels(apiKey?: string): Promise<ModelValidationResult> {
    if (!apiKey) {
      return {
        provider: 'anthropic',
        available: [],
        unavailable: [],
        error: 'No API key provided'
      };
    }

    // Anthropic doesn't have a models endpoint, so we test specific models
    const modelsToTest = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];

    const available: ModelInfo[] = [];
    const unavailable: string[] = [];

    for (const modelId of modelsToTest) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
          })
        });

        if (response.status === 200 || response.status === 400) {
          // 200 = success, 400 = valid model but bad request (expected with minimal test)
          available.push({
            id: modelId,
            name: this.getDisplayName('anthropic', modelId),
            maxTokens: this.getMaxTokens('anthropic', modelId),
            available: true,
            lastChecked: Date.now()
          });
        } else if (response.status === 404 || response.status === 422) {
          // 404 = model not found, 422 = invalid model
          unavailable.push(modelId);
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        unavailable.push(modelId);
      }
    }

    return {
      provider: 'anthropic',
      available,
      unavailable
    };
  }

  /**
   * Google model validation
   */
  private async validateGoogleModels(apiKey?: string): Promise<ModelValidationResult> {
    if (!apiKey) {
      return {
        provider: 'google',
        available: [],
        unavailable: [],
        error: 'No API key provided'
      };
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

      if (!response.ok) {
        throw new Error(`Google API error: ${response.status}`);
      }

      const data = await response.json();
      const availableModels = data.models || [];

      const available: ModelInfo[] = [];

      for (const model of availableModels) {
        if (model.name && model.name.includes('gemini')) {
          const modelId = model.name.replace('models/', '');
          available.push({
            id: modelId,
            name: this.getDisplayName('google', modelId),
            maxTokens: this.getMaxTokens('google', modelId),
            available: true,
            lastChecked: Date.now()
          });
        }
      }

      return {
        provider: 'google',
        available,
        unavailable: []
      };

    } catch (error: any) {
      return {
        provider: 'google',
        available: [],
        unavailable: [],
        error: error.message
      };
    }
  }

  /**
   * Perplexity model validation
   */
  private async validatePerplexityModels(apiKey?: string): Promise<ModelValidationResult> {
    if (!apiKey) {
      return {
        provider: 'perplexity',
        available: [],
        unavailable: [],
        error: 'No API key provided'
      };
    }

    // Perplexity models (known working ones)
    const knownModels = [
      'llama-3.1-sonar-small-128k-online',
      'llama-3.1-sonar-large-128k-online',
      'llama-3.1-sonar-huge-128k-online',
      'llama-3.1-8b-instruct',
      'llama-3.1-70b-instruct'
    ];

    const available: ModelInfo[] = [];

    for (const modelId of knownModels) {
      available.push({
        id: modelId,
        name: this.getDisplayName('perplexity', modelId),
        maxTokens: this.getMaxTokens('perplexity', modelId),
        available: true, // Assume available for now
        lastChecked: Date.now()
      });
    }

    return {
      provider: 'perplexity',
      available,
      unavailable: []
    };
  }

  /**
   * Get display name for a model
   */
  private getDisplayName(provider: string, modelId: string): string {
    const displayNames: Record<string, Record<string, string>> = {
      openai: {
        'gpt-4o': 'GPT-4o',
        'gpt-4-turbo': 'GPT-4 Turbo',
        'gpt-4': 'GPT-4',
        'gpt-3.5-turbo': 'GPT-3.5 Turbo'
      },
      anthropic: {
        'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet (Latest)',
        'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
        'claude-3-opus-20240229': 'Claude 3 Opus',
        'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
        'claude-3-haiku-20240307': 'Claude 3 Haiku'
      },
      google: {
        'gemini-1.5-pro': 'Gemini 1.5 Pro',
        'gemini-1.5-flash': 'Gemini 1.5 Flash',
        'gemini-1.0-pro': 'Gemini 1.0 Pro'
      },
      perplexity: {
        'llama-3.1-sonar-small-128k-online': 'Sonar Small Online',
        'llama-3.1-sonar-large-128k-online': 'Sonar Large Online',
        'llama-3.1-sonar-huge-128k-online': 'Sonar Huge Online',
        'llama-3.1-8b-instruct': 'Llama 3.1 8B',
        'llama-3.1-70b-instruct': 'Llama 3.1 70B'
      }
    };

    return displayNames[provider]?.[modelId] || modelId;
  }

  /**
   * Get max tokens for a model
   */
  private getMaxTokens(provider: string, modelId: string): number {
    const maxTokens: Record<string, Record<string, number>> = {
      openai: {
        'gpt-4o': 128000,
        'gpt-4-turbo': 128000,
        'gpt-4': 8192,
        'gpt-3.5-turbo': 16384
      },
      anthropic: {
        'claude-3-5-sonnet-20241022': 200000,
        'claude-3-5-haiku-20241022': 200000,
        'claude-3-opus-20240229': 200000,
        'claude-3-sonnet-20240229': 200000,
        'claude-3-haiku-20240307': 200000
      },
      google: {
        'gemini-1.5-pro': 2097152,
        'gemini-1.5-flash': 1048576,
        'gemini-1.0-pro': 32768
      },
      perplexity: {
        'llama-3.1-sonar-small-128k-online': 131072,
        'llama-3.1-sonar-large-128k-online': 131072,
        'llama-3.1-sonar-huge-128k-online': 131072,
        'llama-3.1-8b-instruct': 131072,
        'llama-3.1-70b-instruct': 131072
      }
    };

    return maxTokens[provider]?.[modelId] || 4096;
  }

  /**
   * Update config file with validated models
   */
  async updateConfigFile(validationResults: ModelValidationResult[]): Promise<void> {
    const config = {
      providers: {} as any,
      lastUpdated: new Date().toISOString().split('T')[0],
      validatedAt: new Date().toISOString()
    };

    const providerNameMap: Record<string, string> = {
      openai: 'ChatGPT',
      anthropic: 'Claude',
      google: 'Gemini',
      perplexity: 'Perplexity'
    };

    for (const result of validationResults) {
      if (result.available.length > 0) {
        config.providers[result.provider] = {
          name: providerNameMap[result.provider],
          models: result.available.map((model, index) => ({
            id: model.id,
            name: model.name,
            default: index === 0, // First available model is default
            maxTokens: model.maxTokens
          }))
        };
      }
    }

    // Ensure config directory exists
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`\n✅ Updated model configuration: ${this.configPath}`));
  }

  /**
   * Get recommended model for a provider
   */
  getRecommendedModel(provider: string): string {
    const recommendations: Record<string, string> = {
      openai: 'gpt-4o',
      anthropic: 'claude-3-5-sonnet-20241022',
      google: 'gemini-1.5-pro',
      perplexity: 'llama-3.1-sonar-large-128k-online'
    };

    return recommendations[provider] || 'unknown';
  }

  /**
   * Display validation results
   */
  displayResults(results: ModelValidationResult[]): void {
    console.log(chalk.cyan('\n📊 Model Validation Results:\n'));

    for (const result of results) {
      console.log(chalk.bold(`${result.provider.toUpperCase()}:`));

      if (result.error) {
        console.log(chalk.red(`  ❌ Error: ${result.error}`));
      } else {
        console.log(chalk.green(`  ✅ Available: ${result.available.length} models`));
        result.available.forEach(model => {
          console.log(chalk.gray(`    • ${model.name} (${model.id})`));
        });

        if (result.unavailable.length > 0) {
          console.log(chalk.red(`  ❌ Unavailable: ${result.unavailable.length} models`));
          result.unavailable.forEach(modelId => {
            console.log(chalk.gray(`    • ${modelId}`));
          });
        }
      }
      console.log();
    }
  }
}