'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, MessageCircle, Book, AlertCircle, Send, Check, Loader2 } from 'lucide-react'

export default function SupportPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    category: 'general',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      setSubmitted(true)
      setFormData({
        name: '',
        email: '',
        subject: '',
        category: 'general',
        message: '',
      })
    } catch (err) {
      setError('Failed to send message. Please try again or email support@cachegpt.io directly.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const faqs = [
    {
      question: 'How do I get started with CacheGPT?',
      answer: 'Sign up for a free account, generate your API key, and follow our Quick Start guide in the documentation.',
    },
    {
      question: 'What LLM providers are supported?',
      answer: 'We support OpenAI (GPT-3.5, GPT-4), Anthropic (Claude), Google (Gemini), and custom endpoints.',
    },
    {
      question: 'How does the caching work?',
      answer: 'We use semantic similarity matching with vector embeddings to identify and serve cached responses, reducing API costs by up to 80%.',
    },
    {
      question: 'Is my data secure?',
      answer: 'Yes. We use TLS encryption for data in transit, AES-256 for data at rest, and follow industry best practices for security.',
    },
    {
      question: 'Can I delete my cached data?',
      answer: 'Yes. You can delete cached data anytime through the CLI using "cachegpt clear" or via your dashboard.',
    },
    {
      question: 'What are the rate limits?',
      answer: 'Free accounts have generous rate limits of 1000 requests per day. Contact us if you need higher limits.',
    },
  ]

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
            <h1 className="text-xl font-bold">Support</h1>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Link href="/docs" className="bg-white rounded-lg p-6 shadow-sm border hover:shadow-md transition">
            <div className="flex items-center mb-3">
              <Book className="w-6 h-6 text-purple-600 mr-3" />
              <h3 className="text-lg font-semibold">Documentation</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Comprehensive guides, API reference, and tutorials.
            </p>
          </Link>

          <a href="mailto:support@cachegpt.io" className="bg-white rounded-lg p-6 shadow-sm border hover:shadow-md transition">
            <div className="flex items-center mb-3">
              <Mail className="w-6 h-6 text-purple-600 mr-3" />
              <h3 className="text-lg font-semibold">Email Support</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Get help directly at support@cachegpt.io
            </p>
          </a>

          <Link href="#faq" className="bg-white rounded-lg p-6 shadow-sm border hover:shadow-md transition">
            <div className="flex items-center mb-3">
              <MessageCircle className="w-6 h-6 text-purple-600 mr-3" />
              <h3 className="text-lg font-semibold">FAQs</h3>
            </div>
            <p className="text-gray-600 text-sm">
              Find answers to common questions below.
            </p>
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <h2 className="text-2xl font-bold mb-6">Contact Us</h2>

            {submitted ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Message Sent!</h3>
                  <p className="text-gray-600">We'll get back to you within 24 hours.</p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-4 text-purple-600 hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    id="category"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="general">General Inquiry</option>
                    <option value="technical">Technical Support</option>
                    <option value="billing">Billing Question</option>
                    <option value="feature">Feature Request</option>
                    <option value="bug">Bug Report</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    id="subject"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    id="message"
                    required
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  />
                </div>

                {error && (
                  <div className="flex items-center text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* FAQs */}
          <div id="faq">
            <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <details key={index} className="bg-white rounded-lg shadow-sm">
                  <summary className="px-6 py-4 cursor-pointer hover:bg-gray-50 font-medium">
                    {faq.question}
                  </summary>
                  <div className="px-6 pb-4 text-gray-600">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>

            <div className="mt-8 bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="font-semibold mb-2">Still need help?</h3>
              <p className="text-gray-600 text-sm mb-3">
                Our support team is here to help you 24/7.
              </p>
              <div className="flex flex-col space-y-2">
                <a href="mailto:support@cachegpt.io" className="text-purple-600 hover:underline text-sm">
                  Email: support@cachegpt.io
                </a>
                <span className="text-gray-600 text-sm">
                  Response time: Within 24 hours
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}