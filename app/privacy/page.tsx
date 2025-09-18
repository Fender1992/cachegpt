'use client'

import Link from 'next/link'
import { ArrowLeft, Shield, Lock, Eye, Database, Globe, Mail } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="flex items-center space-x-2 text-gray-600 hover:text-purple-600 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-xl font-bold">Privacy Policy</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-lg p-8 shadow-sm">
          <div className="flex items-center mb-6">
            <Shield className="w-8 h-8 text-purple-600 mr-3" />
            <h1 className="text-3xl font-bold">Privacy Policy</h1>
          </div>
          <p className="text-sm text-gray-500 mb-8">Effective Date: January 1, 2024 | Last Updated: January 17, 2025</p>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-8">
            <p className="text-purple-800 text-sm">
              <strong>Our Commitment:</strong> We take your privacy seriously. This policy describes how we collect,
              use, and protect your information when you use CacheGPT.
            </p>
          </div>

          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Database className="w-5 h-5 mr-2 text-gray-600" />
                1. Information We Collect
              </h2>

              <h3 className="text-lg font-medium mb-2">Account Information</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4 mb-4">
                <li>Email address</li>
                <li>Username (optional)</li>
                <li>Hashed password (never stored in plain text)</li>
                <li>Account creation date</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">API Usage Data</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4 mb-4">
                <li>API request metadata (timestamps, models used)</li>
                <li>Cached queries and responses (for service functionality)</li>
                <li>Usage statistics (request counts, cache hit rates)</li>
                <li>API keys (encrypted)</li>
              </ul>

              <h3 className="text-lg font-medium mb-2">Technical Information</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>IP addresses (for security and rate limiting)</li>
                <li>Browser type and version</li>
                <li>Operating system</li>
                <li>Request headers</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Eye className="w-5 h-5 mr-2 text-gray-600" />
                2. How We Use Your Information
              </h2>
              <p className="text-gray-600 mb-4">We use the collected information to:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>Provide and maintain the CacheGPT service</li>
                <li>Process and cache API requests efficiently</li>
                <li>Generate usage analytics and statistics</li>
                <li>Detect and prevent abuse or fraudulent activity</li>
                <li>Send service-related communications</li>
                <li>Improve service performance and features</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Lock className="w-5 h-5 mr-2 text-gray-600" />
                3. Data Security
              </h2>
              <p className="text-gray-600 mb-4">We implement industry-standard security measures including:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>TLS/SSL encryption for all data in transit</li>
                <li>AES-256 encryption for sensitive data at rest</li>
                <li>Bcrypt hashing for passwords</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication</li>
                <li>Rate limiting and DDoS protection</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">4. Data Retention</h2>
              <p className="text-gray-600 mb-4">We retain your data as follows:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li><strong>Account data:</strong> Until account deletion</li>
                <li><strong>Cached responses:</strong> 30 days (configurable)</li>
                <li><strong>Usage logs:</strong> 90 days</li>
                <li><strong>Security logs:</strong> 1 year</li>
              </ul>
              <p className="text-gray-600 mt-4">
                You can request data deletion at any time through your account settings or by contacting support.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">5. Data Sharing</h2>
              <p className="text-gray-600 mb-4">
                We do NOT sell, trade, or rent your personal information. We may share data only in these circumstances:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>With your explicit consent</li>
                <li>To comply with legal obligations or court orders</li>
                <li>To protect against fraud or security threats</li>
                <li>With service providers under strict confidentiality agreements</li>
                <li>In aggregated, anonymized form for analytics</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Globe className="w-5 h-5 mr-2 text-gray-600" />
                6. Third-Party Services
              </h2>
              <p className="text-gray-600 mb-4">We integrate with the following third-party services:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li><strong>LLM Providers:</strong> OpenAI, Anthropic, Google (for API proxying)</li>
                <li><strong>Hugging Face:</strong> For embedding generation and response adaptation</li>
                <li><strong>Supabase:</strong> Database and authentication</li>
                <li><strong>Vercel:</strong> Hosting and analytics</li>
              </ul>
              <p className="text-gray-600 mt-4">
                Each service has its own privacy policy. We recommend reviewing them.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">7. Your Rights (GDPR/CCPA)</h2>
              <p className="text-gray-600 mb-4">You have the right to:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Rectification:</strong> Correct inaccurate data</li>
                <li><strong>Deletion:</strong> Request deletion of your data ("right to be forgotten")</li>
                <li><strong>Portability:</strong> Export your data in a machine-readable format</li>
                <li><strong>Restriction:</strong> Limit how we process your data</li>
                <li><strong>Objection:</strong> Opt-out of certain data uses</li>
              </ul>
              <p className="text-gray-600 mt-4">
                To exercise these rights, contact <a href="mailto:privacy@cachegpt.io" className="text-purple-600 hover:underline">privacy@cachegpt.io</a>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">8. Cookies</h2>
              <p className="text-gray-600 mb-4">We use cookies for:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>Authentication and session management</li>
                <li>Security (CSRF protection)</li>
                <li>User preferences</li>
                <li>Analytics (anonymous usage patterns)</li>
              </ul>
              <p className="text-gray-600 mt-4">
                You can control cookies through your browser settings. Disabling cookies may limit some features.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">9. Children's Privacy</h2>
              <p className="text-gray-600">
                CacheGPT is not intended for users under 13 years of age. We do not knowingly collect personal
                information from children. If we discover such data, we will promptly delete it.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">10. International Data Transfers</h2>
              <p className="text-gray-600">
                Your data may be processed in countries other than your own. We ensure appropriate safeguards
                are in place for international transfers, including Standard Contractual Clauses and adequacy decisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">11. Changes to This Policy</h2>
              <p className="text-gray-600">
                We may update this policy periodically. We will notify you of material changes via email or
                through the service. Continued use after changes constitutes acceptance.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Mail className="w-5 h-5 mr-2 text-gray-600" />
                12. Contact Us
              </h2>
              <p className="text-gray-600 mb-4">For privacy-related questions or concerns:</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-600">
                  <strong>Data Protection Officer</strong><br/>
                  Email: <a href="mailto:privacy@cachegpt.io" className="text-purple-600 hover:underline">privacy@cachegpt.io</a><br/>
                  Support: <Link href="/support" className="text-purple-600 hover:underline">cachegpt.io/support</Link><br/>
                  Response Time: Within 48 hours
                </p>
              </div>
            </section>

            <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 text-sm">
                <strong>Your Privacy Matters:</strong> We are committed to protecting your data and being transparent
                about our practices. If you have any concerns, please don't hesitate to contact us.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}