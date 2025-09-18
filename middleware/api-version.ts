import { NextRequest, NextResponse } from 'next/server'

export interface ApiVersion {
  version: string
  deprecated: boolean
  deprecationDate?: Date
  sunsetDate?: Date
  features: string[]
}

export const API_VERSIONS: Record<string, ApiVersion> = {
  'v1': {
    version: 'v1',
    deprecated: false,
    features: [
      'basic_chat',
      'cache_lookup',
      'usage_tracking',
      'simple_auth'
    ]
  },
  'v2': {
    version: 'v2',
    deprecated: false,
    features: [
      'enhanced_chat',
      'streaming',
      'function_calling',
      'advanced_cache',
      'fine_tuning',
      'batch_processing',
      'webhook_callbacks',
      'custom_models'
    ]
  }
}

export function getApiVersion(request: NextRequest): string {
  // Check header for version
  const headerVersion = request.headers.get('x-api-version')
  if (headerVersion && API_VERSIONS[headerVersion]) {
    return headerVersion
  }

  // Check URL path for version
  const pathMatch = request.url.match(/\/api\/(v\d+)/)
  if (pathMatch && API_VERSIONS[pathMatch[1]]) {
    return pathMatch[1]
  }

  // Default to v1
  return 'v1'
}

export function addVersionHeaders(response: NextResponse, version: string): NextResponse {
  const versionInfo = API_VERSIONS[version]

  response.headers.set('x-api-version', version)
  response.headers.set('x-api-features', versionInfo.features.join(','))

  if (versionInfo.deprecated) {
    response.headers.set('x-api-deprecated', 'true')
    if (versionInfo.sunsetDate) {
      response.headers.set('x-api-sunset', versionInfo.sunsetDate.toISOString())
    }
    response.headers.set('warning', `299 - "This API version is deprecated and will be sunset on ${versionInfo.sunsetDate?.toDateString()}"`)
  }

  // Add available versions
  response.headers.set('x-api-versions', Object.keys(API_VERSIONS).join(','))

  return response
}

export function validateVersionAccess(version: string, apiKey: string): boolean {
  // In production, check if the API key has access to this version
  // For now, allow all versions
  return true
}