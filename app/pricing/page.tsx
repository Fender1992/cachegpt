'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

const pricingTiers = [
  {
    name: 'Free Forever',
    id: 'free',
    price: 0,
    period: 'forever',
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
  const [annual, setAnnual] = useState(false)
  const [currentPlan, setCurrentPlan] = useState('free')
  const router = useRouter()

  const handleUpgrade = async (planId: string) => {
    if (planId === 'enterprise') {
      // Redirect to contact form or email
      if (typeof window !== 'undefined') {
        window.location.href = 'mailto:sales@llmcacheproxy.com?subject=Enterprise Plan Inquiry'
      }
      return
    }

    if (planId === currentPlan) {
      return
    }

    // Call API to upgrade plan
    try {
      const response = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_name: planId }),
      })

      if (response.ok) {
        const data = await response.json()
        alert(`Successfully upgraded to ${planId} plan!`)
        setCurrentPlan(planId)
        router.push('/dashboard')
      } else {
        const error = await response.json()
        alert(`Upgrade failed: ${error.detail}`)
      }
    } catch (error) {
      alert('Failed to upgrade plan. Please try again.')
    }
  }

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
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-500">
                  Open Source & Free
                </Badge>
                <CardHeader className="text-center">
                  <CardTitle className="text-3xl">{tier.name}</CardTitle>
                  <div className="mt-4">
                    <div className="text-5xl font-bold text-purple-600">
                      $0
                      <span className="text-lg font-normal text-gray-500">
                        /{tier.period}
                      </span>
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
              <h3 className="font-semibold mb-2">Why is it completely free?</h3>
              <p className="text-gray-600 text-sm">
                We believe in open source and want to help developers save on AI costs.
                The entire codebase is available for self-hosting and customization.
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
              <h3 className="font-semibold mb-2">Can I self-host this?</h3>
              <p className="text-gray-600 text-sm">
                Absolutely! The complete source code is available on GitHub.
                Deploy on your own infrastructure for full control and privacy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}