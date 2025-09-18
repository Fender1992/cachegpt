'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

const pricingTiers = [
  {
    name: 'Free',
    id: 'free',
    price: 0,
    period: '',
    description: 'All features included - no limits',
    features: [
      'Unlimited requests',
      'Unlimited API keys',
      'Intelligent caching with semantic similarity',
      'Real-time analytics & dashboards',
      'OpenAI & Anthropic integration',
      'Vector similarity search',
      'Custom similarity threshold',
      'Webhooks & integrations',
      'CLI tool included',
      'Community support',
      'Full codebase access',
      'Self-hosted deployment'
    ],
    limitations: [],
    cta: 'Get Started Free',
    popular: true,
    disabled: false
  }
]

export default function PricingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-xl text-gray-600 mb-8">
            Save up to 80% on LLM API costs with intelligent caching - completely free!
          </p>
        </div>

        {/* Pricing Card */}
        <div className="flex justify-center">
          <div className="max-w-lg w-full">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.name}
                className="relative border-purple-500 border-2 shadow-xl"
              >
                <CardHeader className="text-center">
                  <CardTitle className="text-3xl">{tier.name}</CardTitle>
                  <div className="mt-4">
                    <div className="text-5xl font-bold text-purple-600">
                      Free
                    </div>
                    <p className="text-gray-600 mt-2 text-lg">{tier.description}</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-6">
                    {tier.features.map((feature) => (
                      <div key={feature} className="flex items-start">
                        <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-lg py-3"
                    onClick={() => router.push('/dashboard')}
                  >
                    {tier.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 bg-white rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">
            Frequently Asked Questions
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">How does the caching work?</h3>
              <p className="text-gray-600 text-sm">
                Our intelligent caching system uses both exact matching and
                semantic similarity to identify and serve cached responses,
                dramatically reducing API costs.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Why is it free?</h3>
              <p className="text-gray-600 text-sm">
                We believe in making AI accessible and want to help developers save on costs.
                No hidden fees, no upsells - just powerful caching technology.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Are there any limits?</h3>
              <p className="text-gray-600 text-sm">
                No limits! You get unlimited requests, API keys, and full access to all
                features. Perfect for everything from personal projects to enterprise use.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">How do I get started?</h3>
              <p className="text-gray-600 text-sm">
                Simply sign up for a free account, generate your API key, and
                start using our proxy endpoints. No credit card required.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}