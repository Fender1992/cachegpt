import fs from 'fs';
import path from 'path';
import os from 'os';
import { Config } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.llm-cache');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ENV_FILE = path.join(process.cwd(), '.env');

export function loadConfig(): Partial<Config> {
  let config: Partial<Config> = {};

  // First, try to load from config file
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
      config = JSON.parse(configData);
    }
  } catch (error) {
    console.error('Error loading config file:', error);
  }

  // Then, try to load from .env file
  try {
    if (fs.existsSync(ENV_FILE)) {
      const envData = fs.readFileSync(ENV_FILE, 'utf8');
      const envLines = envData.split('\n');

      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');

          switch (key.trim()) {
            case 'LLM_CACHE_BASE_URL':
              config.baseUrl = value;
              break;
            case 'LLM_CACHE_API_KEY':
              config.apiKey = value;
              break;
            case 'LLM_CACHE_DEFAULT_MODEL':
              config.defaultModel = value;
              break;
            case 'LLM_CACHE_TIMEOUT':
              config.timeout = parseInt(value, 10);
              break;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading .env file:', error);
  }

  // Finally, check environment variables
  if (process.env.LLM_CACHE_BASE_URL) {
    config.baseUrl = process.env.LLM_CACHE_BASE_URL;
  }
  if (process.env.LLM_CACHE_API_KEY) {
    config.apiKey = process.env.LLM_CACHE_API_KEY;
  }
  if (process.env.LLM_CACHE_DEFAULT_MODEL) {
    config.defaultModel = process.env.LLM_CACHE_DEFAULT_MODEL;
  }
  if (process.env.LLM_CACHE_TIMEOUT) {
    config.timeout = parseInt(process.env.LLM_CACHE_TIMEOUT, 10);
  }

  return config;
}

export function saveConfig(config: Config): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Failed to save config: ${error}`);
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function validateConfig(config: Partial<Config>): string[] {
  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push('Base URL is required');
  } else {
    try {
      new URL(config.baseUrl);
    } catch {
      errors.push('Base URL must be a valid URL');
    }
  }

  if (!config.apiKey) {
    errors.push('API key is required');
  } else if (!config.apiKey.startsWith('sk-')) {
    errors.push('API key should start with "sk-"');
  }

  if (config.timeout !== undefined && (config.timeout < 1 || config.timeout > 300)) {
    errors.push('Timeout must be between 1 and 300 seconds');
  }

  return errors;
}