export interface Config {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  timeout: number;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  cached?: boolean;
  cache_type?: string;
  similarity?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StatsResponse {
  totalRequests: number;
  cacheHits: number;
  cacheHitRate: number;
  costSaved: number;
  avgCacheResponseTime: number;
  avgMissResponseTime: number;
  topModels?: Array<{
    name: string;
    requests: number;
    hitRate: number;
  }>;
  dailyStats?: Array<{
    date: string;
    requests: number;
    cacheHits: number;
    hitRate: number;
  }>;
}

export interface ApiError {
  error: string;
  message: string;
  detail?: string;
}