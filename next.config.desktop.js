/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'out-desktop',
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://cachegpt.app',
    NEXT_PUBLIC_IS_DESKTOP: 'true',
  },
  // Skip routes that are web-only or require server-side rendering
  experimental: {},
}

module.exports = nextConfig
