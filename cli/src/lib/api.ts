import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Config, ChatCompletionRequest, ChatCompletionResponse, StatsResponse, ApiError } from '../types';

export class ApiClient {
  private client: AxiosInstance;

  constructor(config: Config) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: (config.timeout || 30) * 1000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'llm-cache-cli/1.0.0'
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // Server responded with error status
          const apiError: ApiError = {
            error: error.response.statusText || 'API Error',
            message: error.response.data?.detail || error.response.data?.message || error.message,
            detail: error.response.data
          };
          throw apiError;
        } else if (error.request) {
          // Request was made but no response received
          throw {
            error: 'Network Error',
            message: 'No response received from server. Please check your connection and base URL.',
            detail: error.code
          } as ApiError;
        } else {
          // Something else happened
          throw {
            error: 'Request Error',
            message: error.message,
            detail: error
          } as ApiError;
        }
      }
    );
  }

  async healthCheck(): Promise<any> {
    const response = await this.client.get('/health');
    return response.data;
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<{
    data: ChatCompletionResponse;
    headers: Record<string, string>;
  }> {
    const response: AxiosResponse<ChatCompletionResponse> = await this.client.post('/api/v1/chat/completions', request);
    return {
      data: response.data,
      headers: response.headers as Record<string, string>
    };
  }

  async getStats(days: number = 7): Promise<StatsResponse> {
    const response = await this.client.get(`/admin/stats?days=${days}`);
    return response.data;
  }

  async clearCache(options: { all?: boolean; olderThanHours?: number } = {}): Promise<any> {
    const params = new URLSearchParams();

    if (options.olderThanHours !== undefined) {
      params.append('older_than_hours', options.olderThanHours.toString());
    }

    const response = await this.client.delete(`/admin/cache/clear?${params.toString()}`);
    return response.data;
  }

  async getCacheEntries(limit: number = 50, offset: number = 0): Promise<any> {
    const response = await this.client.get(`/api/cache?limit=${limit}&offset=${offset}`);
    return response.data;
  }
}

export function createApiClient(config: Config): ApiClient {
  return new ApiClient(config);
}