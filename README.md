# CacheGPT - Intelligent LLM Caching Proxy

A high-performance caching proxy for Large Language Model APIs with semantic search, subscription management, and a downloadable CLI tool.

## Features

- 🚀 **Intelligent Caching**: Exact match and semantic similarity caching
- 💰 **Cost Optimization**: Reduce API costs by up to 80% through intelligent caching
- 🔐 **Authentication & Authorization**: JWT-based auth with API key management
- 💳 **Subscription Management**: Tiered plans with usage tracking
- 📊 **Analytics Dashboard**: Real-time usage statistics and insights
- 🖥️ **CLI Tool**: Downloadable command-line interface for Windows/Mac/Linux
- 🔄 **Multi-Provider Support**: OpenAI and Anthropic API compatibility

## Tech Stack

- **Backend**: FastAPI (Python 3.10+)
- **Frontend**: Next.js 14 with TypeScript
- **Database**: Supabase (PostgreSQL with pgvector)
- **Deployment**: Vercel
- **CLI**: Node.js with Commander

## Quick Start

### Prerequisites

- Node.js 16+
- Python 3.10+
- Supabase account
- OpenAI API key

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/Fender1992/cachegpt.git
cd cachegpt
```

2. Install dependencies:
```bash
# Backend
pip install -r requirements.txt

# Frontend
cd frontend && yarn install

# CLI
cd cli && yarn install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run the development servers:
```bash
# Backend
python -m uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend && yarn dev
```

## Deployment to Vercel

1. Fork this repository
2. Connect your GitHub repo to Vercel
3. Add environment variables in Vercel dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
   - `JWT_SECRET`

4. Deploy!

## CLI Tool

Download the CLI executable from the dashboard or build it yourself:

```bash
cd cli
yarn build:exe  # Creates Windows executable
```

Usage:
```bash
llm-cache init       # Configure the CLI
llm-cache test       # Test connection
llm-cache stats      # View statistics
llm-cache --help     # Show all commands
```

## Project Structure

```
cachegpt/
├── app/                 # FastAPI backend
│   ├── routers/        # API endpoints
│   ├── services/       # Business logic
│   ├── models/         # Data models
│   └── main.py         # App entry point
├── frontend/           # Next.js frontend
│   ├── app/           # App router pages
│   ├── components/    # React components
│   └── lib/           # Utilities
├── cli/               # CLI tool source
│   ├── src/          # TypeScript source
│   └── bin/          # Executable scripts
├── api/              # Vercel serverless functions
└── sql/              # Database migrations
```

## API Documentation

Once running, visit:
- API Docs: `http://localhost:8000/docs`
- Frontend: `http://localhost:3000`

## Environment Variables

See `.env.example` for all required environment variables.

## Database Setup

Run the SQL scripts in `/sql` directory in your Supabase SQL editor to set up the required tables and functions.

## Contributing

Pull requests are welcome! For major changes, please open an issue first.

## License

MIT

## Support

For issues and questions, please open a GitHub issue.