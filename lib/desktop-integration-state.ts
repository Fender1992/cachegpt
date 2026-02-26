/**
 * Server-side utilities for desktop integration OAuth flow.
 * Handles decoding the base64 state param, validating the user,
 * and posting integration results to the desktop-exchange endpoint.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface DesktopState {
  /** Polling state UUID */
  s: string
  /** User ID */
  u: string
  /** Desktop flag */
  d: boolean
}

/**
 * Decode the base64-encoded desktop state param.
 * Returns the decoded state or null if it's not a valid desktop state.
 */
export function decodeDesktopState(stateParam: string | null): DesktopState | null {
  if (!stateParam) return null
  try {
    const decoded = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'))
    if (decoded && decoded.s && decoded.u && decoded.d === true) {
      return decoded as DesktopState
    }
    return null
  } catch {
    return null
  }
}

/**
 * Validate that the userId from the desktop state actually exists.
 * Returns the userId if valid, null otherwise.
 */
export async function validateDesktopUserId(userId: string): Promise<string | null> {
  if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) return null
  try {
    const { data } = await supabase.auth.admin.getUserById(userId)
    return data?.user ? userId : null
  } catch {
    return null
  }
}

/**
 * Post the integration result to the desktop-exchange table.
 * The desktop app polls this table to pick up the result.
 */
export async function postDesktopIntegrationResult(
  pollingState: string,
  result: { success: boolean; provider: string; error?: string }
): Promise<void> {
  await supabase
    .from('desktop_auth_pending')
    .upsert({
      state: pollingState,
      tokens: result,
      created_at: new Date().toISOString(),
    })
}

/**
 * Return an HTML page for the desktop OAuth callback.
 * Shown in the system browser after OAuth completes — tells user to close the tab.
 */
export function desktopCallbackHtml(provider: string, success: boolean, error?: string): string {
  const title = success ? 'Connected!' : 'Connection Failed'
  const message = success
    ? `${provider} has been connected successfully. You can close this tab and return to the desktop app.`
    : `Failed to connect ${provider}: ${error || 'Unknown error'}. Please close this tab and try again.`
  const color = success ? '#22c55e' : '#ef4444'

  return `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#111827;}
.card{text-align:center;padding:2rem;max-width:400px;}
.icon{font-size:3rem;margin-bottom:1rem;}
h1{font-size:1.5rem;margin-bottom:0.5rem;color:${color};}
p{color:#6b7280;line-height:1.5;}</style>
</head><body><div class="card">
<div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
<h1>${title}</h1>
<p>${message}</p>
</div></body></html>`
}
