 [![npm version](https://img.shields.io/npm/v/cachegpt-cli)](https://www.npmjs.com/package/cachegpt-cli)
  [![npm downloads](https://img.shields.io/npm/dm/cachegpt-cli)](https://www.npmjs.com/package/cachegpt-cli)
  [![GitHub stars](https://img.shields.io/github/stars/Fender1992/cachegpt)](https://github.com/Fender1992/cachegpt)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
# CacheGPT - Zero-Setup AI Chat

Free AI chat with OAuth login - no API keys needed! Use premium models or add your own keys for enterprise mode.

## Features

- 🚀 **Zero Setup**: Login with Google/GitHub and start chatting immediately
- 🆓 **Free AI Chat**: Rotating free providers (no API keys required)
- 🔑 **Enterprise Mode**: Optional - add your own API keys for premium models
- 💰 **Cost Optimization**: Intelligent caching reduces API costs by up to 80%
- 🧠 **Semantic Caching**: Exact match + semantic similarity caching
- 📊 **Analytics**: Real-time usage statistics and cache insights
- 🖥️ **CLI Tool**: Command-line interface available via NPM
- 🔄 **Multi-Provider**: OpenAI, Anthropic, Google, Perplexity, and free providers
- 🎨 **Modern UI**: Responsive Next.js interface with dark mode

## Tech Stack

- **Framework**: Next.js 14 with TypeScript and App Router
- **Database**: Supabase (PostgreSQL with pgvector for semantic search)
- **Authentication**: Supabase Auth (OAuth + Email)
- **Deployment**: Vercel
- **CLI**: Node.js with Commander (published to NPM as `cachegpt-cli`)

## Quick Start

### Using the Web App

1. Visit **https://cachegpt.app**
2. Click "Login" and authenticate with Google/GitHub
3. Start chatting for free!

### Using the CLI

```bash
# Install globally from NPM
npm install -g cachegpt-cli

# Login (opens browser for OAuth)
cachegpt login

# Start chatting
cachegpt chat

# View all commands
cachegpt --help
```

## Local Development

### Prerequisites

- Node.js 18+
- Yarn (recommended) or npm
- Supabase account
- API keys for LLM providers (OpenAI, Anthropic, etc.)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/Fender1992/cachegpt.git
cd cachegpt
```

2. **Install dependencies:**
```bash
yarn install

# Optional: Install CLI dependencies
cd cli && yarn install && cd ..
```

3. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your Supabase and API key configuration
```

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
- `OPENAI_API_KEY` - OpenAI API key for server-side model rotation
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude models
- `JWT_SECRET` - Secret for JWT token signing

4. **Set up the database:**

Run the migration scripts in `database-scripts/` directory in your Supabase SQL editor, in order:
```sql
-- Run each file in numeric order:
-- 001_initial_schema.sql
-- 002_cache_tables.sql
-- ...through to the latest migration
```

Or use the migration script:
```bash
node scripts/apply-db-migration.js
```

5. **Run the development server:**
```bash
yarn dev
```

Visit `http://localhost:3000` to see your app!

### Building the CLI

```bash
cd cli
yarn build       # Compile TypeScript
yarn link        # Test locally before publishing
```

## Project Structure

```
cachegpt/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (Next.js serverless)
│   ├── chat/              # Chat interface
│   ├── login/             # Authentication pages
│   ├── admin/             # Admin dashboard
│   └── settings/          # User settings (API key management)
├── components/            # React components
├── lib/                   # Shared utilities
│   ├── supabase-client.ts    # Supabase client
│   ├── cache-lifecycle.ts    # Cache management
│   └── llm-client.ts         # LLM provider abstraction
├── cli/                   # CLI tool source
│   ├── src/
│   │   ├── commands/      # CLI command implementations
│   │   └── lib/           # CLI utilities
│   └── package.json       # Published to NPM as cachegpt-cli
├── database-scripts/      # SQL migrations
├── hooks/                 # React hooks
└── middleware/            # Next.js middleware
```

## CLI Commands

```bash
cachegpt login              # OAuth login (opens browser)
cachegpt chat               # Start interactive chat
cachegpt status             # Check authentication status
cachegpt api-keys add       # Add your own API keys (enterprise)
cachegpt api-keys view      # View configured keys
cachegpt api-keys test      # Test API key connections
cachegpt models             # List available models
cachegpt logout             # Logout from account
cachegpt --version          # Show version
```

## Deployment

### Vercel (Recommended)

1. Fork this repository
2. Connect to Vercel
3. Add environment variables in Vercel dashboard (see `.env.example`)
4. Deploy!

### Environment Setup

Required for production:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=your_secure_random_string
CRON_SECRET=your_cron_secret
```

## Features Deep Dive

### Intelligent Caching

- **Lifecycle Management**: Automatic cache expiration based on age and usage
- **Semantic Search**: Uses pgvector for finding similar queries
- **Context-Aware**: Invalidates cache when enrichment context changes
- **Query Classification**: Different TTLs for static vs time-sensitive queries

### Authentication

- **OAuth Flow**: Google and GitHub login via Supabase Auth
- **Email Authentication**: 6-digit code verification
- **Keyless by Default**: No API keys needed for standard users
- **Enterprise Mode**: Optional personal API key management

### Enterprise Mode

Users can add their own API keys via:
- Web UI: `/settings` page
- CLI: `cachegpt api-keys add`

Supported providers:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3.5 Sonnet, Opus, Haiku)
- Google (Gemini Pro)
- Perplexity

## Database Migrations

Migrations are in `database-scripts/` directory. Run them in numeric order.

Key migrations:
- `030_rbac_system.sql` - Role-based access control
- `031_cache_lifecycle_metadata.sql` - Cache lifecycle management
- `032_bug_tracker_system.sql` - Bug tracking and feedback

## Contributing

Pull requests are welcome! For major changes, please open an issue first.

### Development Workflow

1. Create a feature branch
2. Make your changes
3. Test locally with `yarn dev`
4. Update STATUS_2025_09_24.md with your changes
5. Submit a pull request

## Documentation

For detailed implementation notes, see:
- `STATUS_2025_09_24.md` - Current system state and recent changes
- `CLAUDE.md` - Instructions for Claude Code assistant

## License

MIT

## Support

- GitHub Issues: https://github.com/Fender1992/cachegpt/issues
- Production App: https://cachegpt.app
