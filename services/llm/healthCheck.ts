/**
 * Internal LLM Health Check Service
 *
 * Monitors health of internal LLM provider with caching to avoid excessive health checks.
 */

import { LLM_CONFIG } from '@/config/llmConfig';

interface HealthStatus {
  healthy: boolean;
  lastCheck: number;
  lastError?: string;
}

class InternalLLMHealthChecker {
  private status: HealthStatus = {
    healthy: false,
    lastCheck: 0,
  };

  private checkInProgress = false;

  /**
   * Check if internal LLM is healthy (with caching)
   */
  async isHealthy(): Promise<boolean> {
    const now = Date.now();
    const cacheValid = (now - this.status.lastCheck) < LLM_CONFIG.internal.healthCheckIntervalMs;

    // Return cached result if still valid
    if (cacheValid) {
      return this.status.healthy;
    }

    // If check already in progress, return last known status
    if (this.checkInProgress) {
      return this.status.healthy;
    }

    // Perform health check
    return await this.performHealthCheck();
  }

  /**
   * Perform actual health check
   */
  private async performHealthCheck(): Promise<boolean> {
    if (!LLM_CONFIG.internal.enabled) {
      this.status.healthy = false;
      this.status.lastCheck = Date.now();
      return false;
    }

    this.checkInProgress = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(LLM_CONFIG.internal.healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const healthy = response.ok;
      this.status = {
        healthy,
        lastCheck: Date.now(),
        lastError: healthy ? undefined : `HTTP ${response.status}`,
      };

      if (healthy) {
        console.log('[INTERNAL-LLM-HEALTH] Health check passed');
      } else {
        console.warn('[INTERNAL-LLM-HEALTH] Health check failed:', response.status, response.statusText);
      }

      return healthy;
    } catch (error: any) {
      const errorMessage = error.name === 'AbortError' ? 'Timeout' : error.message;
      this.status = {
        healthy: false,
        lastCheck: Date.now(),
        lastError: errorMessage,
      };

      console.error('[INTERNAL-LLM-HEALTH] Health check error:', errorMessage);
      return false;
    } finally {
      this.checkInProgress = false;
    }
  }

  /**
   * Force a health check (bypass cache)
   */
  async forceCheck(): Promise<boolean> {
    this.status.lastCheck = 0; // Invalidate cache
    return await this.isHealthy();
  }

  /**
   * Get last health status (without performing check)
   */
  getLastStatus(): HealthStatus {
    return { ...this.status };
  }
}

// Singleton instance
export const internalLLMHealthChecker = new InternalLLMHealthChecker();
