import { NextRequest, NextResponse } from 'next/server'

/**
 * Tauri auto-updater endpoint.
 * URL pattern: /api/desktop/update/:target/:arch/:current_version
 * Returns update manifest or 204 No Content if already up to date.
 */

// Current desktop app version — update this when releasing new versions
const LATEST_VERSION = '1.0.0'
const RELEASE_DATE = '2025-09-25T00:00:00Z'

// Download URLs per platform (update these to point to your actual CDN/storage)
const DOWNLOAD_URLS: Record<string, string> = {
  'darwin-aarch64': 'https://cachegpt.app/releases/desktop/CacheGPT_latest_aarch64.app.tar.gz',
  'darwin-x86_64': 'https://cachegpt.app/releases/desktop/CacheGPT_latest_x64.app.tar.gz',
  'windows-x86_64': 'https://cachegpt.app/releases/desktop/CacheGPT_latest_x64-setup.nsis.zip',
  'linux-x86_64': 'https://cachegpt.app/releases/desktop/CacheGPT_latest_amd64.AppImage.tar.gz',
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ params: string[] }> }
) {
  const segments = (await params).params
  if (segments.length < 3) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const [target, arch, currentVersion] = segments

  // If already on latest version, return 204
  if (currentVersion === LATEST_VERSION) {
    return new NextResponse(null, { status: 204 })
  }

  const platformKey = `${target}-${arch}`
  const downloadUrl = DOWNLOAD_URLS[platformKey]

  if (!downloadUrl) {
    return NextResponse.json(
      { error: `Unsupported platform: ${platformKey}` },
      { status: 404 }
    )
  }

  // Return Tauri updater manifest
  return NextResponse.json({
    version: LATEST_VERSION,
    notes: 'New version available! Check the changelog at https://cachegpt.app/changelog',
    pub_date: RELEASE_DATE,
    url: downloadUrl,
    signature: '', // Populate with actual signature for production
  })
}
