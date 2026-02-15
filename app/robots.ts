import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/settings/', '/dashboard/'],
    },
    sitemap: 'https://cachegpt.app/sitemap.xml',
  }
}
