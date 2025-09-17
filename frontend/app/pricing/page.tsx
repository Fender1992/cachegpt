'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const pricingTiers = [
  {
    name: 'Developer',
    id: 'free',
    price: 0,
    period: 'forever',
    description: 'Perfect for getting started',
    features: [
      '1,000 requests/month',
      '1 API key',
      '24-hour cache retention',
      'Community support',
      'Basic analytics'
    ],
    limitations: [
      'No custom similarity threshold',
      'No webhooks',
      'No priority support'
    ],
    cta: 'Current Plan',
    popular: false,
    disabled: false
  },
  {
    name: 'Startup',
    id: 'startup',
    price: 29,
    period: 'month',
    description: 'For growing teams',
    features: [
      '25,000 requests/month',
      '5 API keys',
      '7-day cache retention',
      'Email support',
      'Advanced analytics',
      'Custom similarity threshold',
      'Basic webhooks'
    ],
    limitations: [
      'No SSO integration',
      'No A/B testing'
    ],
    cta: 'Upgrade Now',
    popular: true,
    disabled: false
  },
  {
    name: 'Business',
    id: 'business',
    price: 199,
    period: 'month',
    description: 'For scaling companies',
    features: [
      '500,000 requests/month',
      '25 API keys',
      '30-day cache retention',
      'Priority support',
      'Full analytics suite',
      'A/B testing',
      'Advanced webhooks',
      'SSO integration'
    ],
    limitations: [],
    cta: 'Upgrade Now',
    popular: false,
    disabled: false
  },
  {
    name: 'Enterprise',
    id: 'enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations',
    features: [
      'Unlimited requests',
      'Unlimited API keys',
      'Custom cache retention',
      'Dedicated support',
      'SLA guarantees',
      'White-label options',
      'On-premise deployment',
      'Custom integrations'
    ],
    limitations: [],
    cta: 'Contact Sales',
    popular: false,
    disabled: false
  }
]

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)
  const [currentPlan, setCurrentPlan] = useState('free')
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleUpgrade = async (planId: string) => {
    if (planId === 'enterprise') {
      // Redirect to contact form or email
      window.location.href = 'mailto:sales@llmcacheproxy.com?subject=Enterprise Plan Inquiry'
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
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-xl text-gray-600 mb-8">
            Save up to 80% on LLM API costs with intelligent caching
          </p>

          {/* Annual/Monthly Toggle */}
          <div className="inline-flex items-center space-x-4 bg-white rounded-lg p-1 shadow-sm">
            <button
              className={`px-4 py-2 rounded-md transition-colors ${
                !annual
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              onClick={() => setAnnual(false)}
            >
              Monthly
            </button>
            <button
              className={`px-4 py-2 rounded-md transition-colors ${
                annual
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              onClick={() => setAnnual(true)}
            >
              Annual
              <Badge className="ml-2" variant="secondary">
                Save 20%
              </Badge>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {pricingTiers.map((tier) => (
            <Card
              key={tier.name}
              className={`relative ${
                tier.popular ? 'border-blue-500 border-2 shadow-xl' : ''
              }`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-2xl">{tier.name}</CardTitle>
                <div className="mt-4">
                  <div className="text-4xl font-bold">
                    {typeof tier.price === 'number' ? (
                      <>
                        ${annual && tier.price > 0
                          ? Math.floor(tier.price * 0.8)
                          : tier.price}
                        {tier.period && (
                          <span className="text-sm font-normal text-gray-500">
                            /{tier.period}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-3xl">{tier.price}</span>
                    )}
                  </div>
                  <p className="text-gray-600 mt-2">{tier.description}</p>
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
                  {tier.limitations.map((limitation) => (
                    <div key={limitation} className="flex items-start">
                      <X className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-500">
                        {limitation}
                      </span>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  variant={tier.popular ? 'default' : 'outline'}
                  disabled={tier.id === currentPlan}
                  onClick={() => handleUpgrade(tier.id)}
                >
                  {tier.id === currentPlan ? 'Current Plan' : tier.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
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
              <h3 className="font-semibold mb-2">Can I change plans anytime?</h3>
              <p className="text-gray-600 text-sm">
                Yes! You can upgrade or downgrade your plan at any time. Changes
                take effect immediately, with prorated billing.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What happens if I exceed my limits?</h3>
              <p className="text-gray-600 text-sm">
                Free plans are hard-capped at their limits. Paid plans can
                continue with overage charges at competitive rates.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Do you offer custom plans?</h3>
              <p className="text-gray-600 text-sm">
                Absolutely! Our Enterprise plan can be customized to meet your
                specific needs. Contact our sales team for details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}