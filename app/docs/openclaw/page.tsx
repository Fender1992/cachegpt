import type { Metadata } from 'next';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'OpenClaw Integration - CacheGPT',
  description: 'Use CacheGPT as your LLM provider in OpenClaw. Drop-in replacement for OpenAI and Anthropic APIs with built-in semantic caching.',
};

export default function OpenClawDocsPage() {
  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            CacheGPT + OpenClaw
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-12">
            Use CacheGPT as your LLM provider in OpenClaw. Semantic caching reduces API costs by 40-70%.
          </p>

          {/* Quick Start */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Quick Start
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Connect CacheGPT as a custom provider in one command:
            </p>
            <pre className="bg-gray-900 text-green-400 rounded-xl p-6 overflow-x-auto text-sm mb-4">
{`openclaw onboard \\
  --auth-choice custom-provider \\
  --custom-base-url "https://cachegpt.app/api/v1" \\
  --custom-api-key "YOUR_CACHEGPT_API_KEY" \\
  --custom-model-id "claude-sonnet-4-6" \\
  --custom-compatibility "anthropic" \\
  --custom-provider-id "cachegpt"`}
            </pre>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Replace <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">YOUR_CACHEGPT_API_KEY</code> with your key from the CacheGPT dashboard.
            </p>
          </div>

          {/* Get API Key */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              1. Get Your API Key
            </h2>
            <ol className="list-decimal list-inside text-gray-700 dark:text-gray-300 space-y-3">
              <li>Sign up at <a href="https://cachegpt.app" className="text-purple-600 dark:text-purple-400 underline">cachegpt.app</a> (free, no credit card)</li>
              <li>Go to Dashboard &rarr; API Keys</li>
              <li>Click &quot;Generate API Key&quot;</li>
              <li>Copy your <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">cgpt_sk_...</code> key</li>
            </ol>
          </div>

          {/* Supported APIs */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              2. Supported API Formats
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              CacheGPT supports both major LLM API formats:
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Anthropic Messages API</h3>
                <code className="text-sm text-purple-600 dark:text-purple-400">POST /api/v1/messages</code>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
                  Compatible with Anthropic&apos;s Claude API. Use with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">x-api-key</code> header.
                </p>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 mt-4 text-xs overflow-x-auto">
{`curl -X POST https://cachegpt.app/api/v1/messages \\
  -H "x-api-key: cgpt_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'`}
                </pre>
              </div>

              <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">OpenAI Chat Completions</h3>
                <code className="text-sm text-purple-600 dark:text-purple-400">POST /api/v1/chat/completions</code>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
                  Compatible with OpenAI&apos;s API. Use with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Authorization: Bearer</code>.
                </p>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 mt-4 text-xs overflow-x-auto">
{`curl -X POST https://cachegpt.app/api/v1/chat/completions \\
  -H "Authorization: Bearer cgpt_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'`}
                </pre>
              </div>
            </div>
          </div>

          {/* Docker Setup */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              3. Docker / Server Setup
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              For Docker-based OpenClaw deployments, add CacheGPT to your agent&apos;s <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">models.json</code>:
            </p>
            <pre className="bg-gray-900 text-green-400 rounded-xl p-6 overflow-x-auto text-sm">
{`// ~/.openclaw/agents/main/agent/models.json
{
  "providers": {
    "cachegpt": {
      "baseUrl": "https://cachegpt.app/api/v1",
      "api": "anthropic-messages",
      "models": [
        {
          "id": "claude-sonnet-4-6",
          "name": "Claude Sonnet 4.6 (via CacheGPT)",
          "reasoning": false,
          "input": ["text", "image"],
          "contextWindow": 200000,
          "maxTokens": 8192
        }
      ],
      "apiKey": "CACHEGPT_API_KEY"
    }
  }
}`}
            </pre>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-4">
              Then set your model to <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">cachegpt/claude-sonnet-4-6</code> in your OpenClaw config and pass <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">CACHEGPT_API_KEY</code> as an environment variable.
            </p>
          </div>

          {/* Why CacheGPT */}
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-8 border border-purple-200 dark:border-purple-800 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Why Use CacheGPT with OpenClaw?
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <div className="text-3xl mb-2">40-70%</div>
                <div className="text-gray-700 dark:text-gray-300 font-medium">Cost Reduction</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Semantic caching matches similar prompts using pgvector embeddings</div>
              </div>
              <div>
                <div className="text-3xl mb-2">&lt;10ms</div>
                <div className="text-gray-700 dark:text-gray-300 font-medium">Cache Hit Latency</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">vs 2-10 seconds for fresh LLM calls</div>
              </div>
              <div>
                <div className="text-3xl mb-2">500/day</div>
                <div className="text-gray-700 dark:text-gray-300 font-medium">Free Tier</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">No credit card required. All models included.</div>
              </div>
            </div>
          </div>

          {/* Available Models */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Available Models
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 text-gray-700 dark:text-gray-300">Model ID</th>
                    <th className="text-left py-3 text-gray-700 dark:text-gray-300">Provider</th>
                    <th className="text-left py-3 text-gray-700 dark:text-gray-300">Context</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600 dark:text-gray-400">
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-3"><code>claude-sonnet-4-6</code></td>
                    <td>Anthropic</td>
                    <td>200K</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-3"><code>claude-haiku-4-5</code></td>
                    <td>Anthropic</td>
                    <td>200K</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-3"><code>gpt-4o</code></td>
                    <td>OpenAI</td>
                    <td>128K</td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-3"><code>gemini-2.5-pro</code></td>
                    <td>Google</td>
                    <td>1M</td>
                  </tr>
                  <tr>
                    <td className="py-3"><code>llama-3.3-70b-versatile</code></td>
                    <td>Groq</td>
                    <td>128K</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
