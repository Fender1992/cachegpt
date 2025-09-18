'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function TermsPage() {
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
            <h1 className="text-xl font-bold">Terms of Service</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-lg p-8 shadow-sm">
          <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-8">Effective Date: January 1, 2024 | Last Updated: January 17, 2025</p>

          <div className="prose prose-gray max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-600 mb-4">
                By accessing or using CacheGPT ("Service"), you agree to be bound by these Terms of Service ("Terms").
                If you disagree with any part of these terms, you do not have permission to access the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
              <p className="text-gray-600 mb-4">
                CacheGPT provides an intelligent caching proxy service for Large Language Model (LLM) APIs. The Service
                includes but is not limited to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>API request caching and optimization</li>
                <li>Response adaptation using AI models</li>
                <li>Analytics and usage tracking</li>
                <li>API key management</li>
                <li>Command-line interface tools</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">3. Account Registration</h2>
              <p className="text-gray-600 mb-4">
                To use certain features of the Service, you must register for an account. You agree to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Promptly notify us of any unauthorized use</li>
                <li>Accept responsibility for all activities under your account</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">4. API Usage and Limitations</h2>
              <p className="text-gray-600 mb-4">Your use of the Service is subject to the following limitations:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>Rate limits may be applied to prevent abuse</li>
                <li>You may not use the Service for illegal or unauthorized purposes</li>
                <li>You may not attempt to bypass any Service limitations</li>
                <li>You may not resell or redistribute the Service without permission</li>
                <li>You must comply with the terms of service of underlying LLM providers</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">5. Acceptable Use Policy</h2>
              <p className="text-gray-600 mb-4">You agree NOT to use the Service to:</p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>Generate harmful, offensive, or illegal content</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on intellectual property rights</li>
                <li>Transmit malware, viruses, or malicious code</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Engage in any activity that disrupts the Service</li>
                <li>Use the Service for spam or unsolicited communications</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">6. Data and Privacy</h2>
              <p className="text-gray-600 mb-4">
                Your use of the Service is also governed by our <Link href="/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link>.
                By using the Service, you consent to:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>The collection and use of data as described in our Privacy Policy</li>
                <li>The caching of API requests and responses for service optimization</li>
                <li>Anonymous usage analytics for service improvement</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">7. Intellectual Property</h2>
              <p className="text-gray-600 mb-4">
                The Service and its original content, features, and functionality are owned by CacheGPT and are protected
                by international copyright, trademark, patent, trade secret, and other intellectual property laws.
              </p>
              <p className="text-gray-600 mb-4">
                Content generated through the Service may be subject to the intellectual property policies of the underlying
                LLM providers.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">8. Disclaimer of Warranties</h2>
              <p className="text-gray-600 mb-4">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED,
                INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
              </p>
              <p className="text-gray-600 mb-4">
                We do not guarantee that the Service will be uninterrupted, secure, or error-free.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">9. Limitation of Liability</h2>
              <p className="text-gray-600 mb-4">
                IN NO EVENT SHALL CACHEGPT, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT,
                INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION, LOSS OF PROFITS,
                DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">10. Indemnification</h2>
              <p className="text-gray-600 mb-4">
                You agree to defend, indemnify, and hold harmless CacheGPT and its affiliates from any claims, damages,
                obligations, losses, liabilities, costs, or debt arising from:
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
                <li>Your use of and access to the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any third-party rights</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">11. Termination</h2>
              <p className="text-gray-600 mb-4">
                We may terminate or suspend your account and access to the Service immediately, without prior notice or liability,
                for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">12. Changes to Terms</h2>
              <p className="text-gray-600 mb-4">
                We reserve the right to modify these Terms at any time. If we make material changes, we will notify you
                via email or through the Service. Your continued use of the Service after changes constitutes acceptance
                of the modified Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">13. Governing Law</h2>
              <p className="text-gray-600 mb-4">
                These Terms shall be governed by and construed in accordance with the laws of the United States,
                without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">14. Contact Information</h2>
              <p className="text-gray-600">
                For questions about these Terms, please contact us at:
              </p>
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-600">
                  Email: <a href="mailto:legal@cachegpt.io" className="text-purple-600 hover:underline">legal@cachegpt.io</a><br/>
                  Support: <Link href="/support" className="text-purple-600 hover:underline">cachegpt.io/support</Link>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}