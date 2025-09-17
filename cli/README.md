# LLM Cache CLI

A command-line interface for managing and testing the LLM Cache Proxy. This CLI tool provides easy access to cache statistics, testing functionality, and configuration management.

## Installation

### From Source (Development)

1. Navigate to the CLI directory:
   ```bash
   cd cli
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Build the CLI:
   ```bash
   yarn build
   ```

4. Link for global use:
   ```bash
   yarn link
   ```

### Global Installation (Production)

```bash
npm install -g llm-cache-cli
# or
yarn global add llm-cache-cli
```

## Quick Start

1. Initialize configuration:
   ```bash
   llm-cache init
   ```

2. Test the connection:
   ```bash
   llm-cache test
   ```

3. View cache statistics:
   ```bash
   llm-cache stats
   ```

## Commands

### `llm-cache init`

Initialize the CLI configuration by setting up connection to your LLM Cache Proxy server.

**Interactive Setup:**
- Base URL of your LLM Cache Proxy
- API key for authentication
- Default LLM model to use
- Request timeout settings

### `llm-cache test`

Test the cache functionality by making sample requests and verifying cache behavior.

**Options:**
- `-m, --model <model>` - LLM model to test (default: gpt-3.5-turbo)
- `-q, --query <query>` - Test query (default: "Hello, world!")

**Example:**
```bash
llm-cache test -m gpt-4 -q "What is machine learning?"
```

**What it tests:**
- API connectivity and health
- Cache miss (first request)
- Cache hit (identical second request)
- Performance comparison
- Response validation

### `llm-cache stats`

Display comprehensive cache statistics and performance metrics.

**Options:**
- `-d, --days <days>` - Number of days to show (default: 7)

**Example:**
```bash
llm-cache stats -d 30
```

**Shows:**
- Total requests and cache hits
- Cache hit rate percentage
- Cost savings
- Response time comparisons
- Top models by usage
- Daily performance trends
- Performance insights and recommendations

### `llm-cache clear`

Clear cache entries to free up space or reset cache state.

**Options:**
- `--all` - Clear all cache entries
- `--older-than <hours>` - Clear entries older than X hours (default: 24)

**Examples:**
```bash
llm-cache clear --older-than 48
llm-cache clear --all
```

**Safety features:**
- Confirmation prompts for destructive operations
- Warning for recent entries
- Progress indicators

### `llm-cache config`

Manage CLI configuration settings.

**Options:**
- `--show` - Display current configuration
- `--set <key=value>` - Set a configuration value

**Examples:**
```bash
llm-cache config --show
llm-cache config --set baseUrl=https://api.example.com
llm-cache config --set timeout=60
```

**Interactive mode:**
Running `llm-cache config` without options opens an interactive menu for:
- Viewing configuration
- Editing values
- Resetting configuration
- Validating settings

## Configuration

The CLI supports multiple configuration sources (in order of precedence):

1. **Environment Variables:**
   - `LLM_CACHE_BASE_URL`
   - `LLM_CACHE_API_KEY`
   - `LLM_CACHE_DEFAULT_MODEL`
   - `LLM_CACHE_TIMEOUT`

2. **Local .env file** (in current directory)
3. **Config file** (`~/.llm-cache/config.json`)

### Configuration File Location

- **Linux/macOS:** `~/.llm-cache/config.json`
- **Windows:** `%USERPROFILE%\.llm-cache\config.json`

### Example .env file

```env
LLM_CACHE_BASE_URL=http://localhost:8000
LLM_CACHE_API_KEY=sk-your-api-key-here
LLM_CACHE_DEFAULT_MODEL=gpt-3.5-turbo
LLM_CACHE_TIMEOUT=30
```

## API Key Requirements

The CLI requires a valid API key from your LLM Cache Proxy instance:

- Must start with `sk-`
- Should have appropriate permissions for the operations you want to perform
- Admin permissions required for `stats` and `clear` commands

## Error Handling

The CLI provides detailed error messages and troubleshooting suggestions:

- **Connection errors:** Check base URL and network connectivity
- **Authentication errors:** Verify API key validity and permissions
- **API errors:** Detailed error responses from the server
- **Configuration errors:** Validation messages with suggestions

## Examples

### Complete Setup Workflow

```bash
# Initialize configuration
llm-cache init

# Test the setup
llm-cache test

# View initial statistics
llm-cache stats

# Make some API calls through your proxy...

# Check updated statistics
llm-cache stats -d 1

# Clear old cache entries
llm-cache clear --older-than 24
```

### Monitoring Workflow

```bash
# Daily stats check
llm-cache stats -d 1

# Weekly performance review
llm-cache stats -d 7

# Monthly cleanup
llm-cache clear --older-than 720  # 30 days
```

## Development

### Project Structure

```
cli/
├── src/
│   ├── commands/          # Command implementations
│   │   ├── init.ts
│   │   ├── test.ts
│   │   ├── stats.ts
│   │   ├── clear.ts
│   │   └── config.ts
│   ├── lib/               # Core libraries
│   │   ├── api.ts         # API client
│   │   ├── config.ts      # Configuration management
│   │   └── utils.ts       # Utility functions
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   └── index.ts           # Main entry point
├── bin/
│   └── llm-cache          # Executable script
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
yarn build
```

### Running in Development

```bash
yarn dev <command>
# or
NODE_ENV=development bin/llm-cache <command>
```

### TypeScript Support

The CLI is written in TypeScript with full type safety:
- Strongly typed API responses
- Configuration validation
- Error type definitions
- IDE support and autocompletion

## Troubleshooting

### Common Issues

**"Configuration missing" error:**
- Run `llm-cache init` to set up configuration
- Verify environment variables are set correctly

**Connection timeout:**
- Check if the LLM Cache Proxy server is running
- Verify the base URL is correct
- Increase timeout setting if needed

**Permission denied for admin commands:**
- Ensure your API key has admin/write permissions
- Check server logs for authentication issues

**Cache not working as expected:**
- Run `llm-cache test` to verify functionality
- Check similarity thresholds in server configuration
- Review query patterns for cache effectiveness

### Debug Mode

Set `NODE_ENV=development` for more detailed logging:

```bash
NODE_ENV=development llm-cache test
```

## Support

For issues and questions:
1. Check this README for common solutions
2. Review the main LLM Cache Proxy documentation
3. Check server logs for detailed error information
4. Verify your API key permissions and server configuration

## License

MIT License - see the main project LICENSE file for details.