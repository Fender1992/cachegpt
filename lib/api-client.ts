/**
 * API Client — abstracts fetch calls for web and desktop (Tauri) environments.
 * On web, all paths are relative. On desktop, they're prefixed with the production URL.
 */

const PRODUCTION_URL = 'https://cachegpt.app'

/** Detect if running inside Tauri desktop app (v2 uses __TAURI_INTERNALS__, withGlobalTauri exposes __TAURI__) */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
}

/** Get the base URL for API calls */
export function getApiBaseUrl(): string {
  if (isDesktop()) return PRODUCTION_URL
  return ''
}

/** Prefix the base URL to a path */
export function apiUrl(path: string): string {
  return `${getApiBaseUrl()}${path}`
}

/**
 * Fetch wrapper that handles URL prefixing and credentials for both web and desktop.
 * Drop-in replacement for fetch('/api/...', init).
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(path)

  // Merge default options
  const mergedInit: RequestInit = {
    ...init,
    credentials: isDesktop() ? 'omit' : (init?.credentials ?? 'include'),
  }

  // On desktop, ensure Authorization header is present (no cookies available)
  // The caller is responsible for setting the Authorization header

  return fetch(url, mergedInit)
}
