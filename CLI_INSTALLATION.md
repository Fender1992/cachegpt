# LLM Cache CLI Installation Guide

This guide explains how to install and use the LLM Cache CLI tool for Phase 4 of the LLM Cache Proxy project.

## Prerequisites

- Node.js 16 or higher
- Access to a running LLM Cache Proxy server
- Valid API key from the LLM Cache Proxy

## Installation Options

### Option 1: Quick Installation (Recommended)

```bash
# Navigate to the CLI directory
cd cli

# Run the installation script
./install.sh
```

### Option 2: Manual Installation

```bash
# Navigate to the CLI directory
cd cli

# Install dependencies
npm install --no-bin-links

# Build the CLI
npm run build

# Test the installation
./bin/llm-cache --help
```

### Option 3: Global Installation

After building the CLI:

```bash
# Link globally (requires admin privileges)
cd cli
npm link

# Now you can use it from anywhere
llm-cache --help
```

## Quick Start

1. **Initialize Configuration:**
   ```bash
   ./bin/llm-cache init
   ```
   This will prompt you for:
   - Base URL (e.g., http://localhost:8000)
   - API key (starts with sk-)
   - Default model (e.g., gpt-3.5-turbo)
   - Timeout (in seconds)

2. **Test Connection:**
   ```bash
   ./bin/llm-cache test
   ```

3. **View Statistics:**
   ```bash
   ./bin/llm-cache stats
   ```

## Available Commands

- `init` - Initialize configuration
- `test` - Test cache functionality with sample requests
- `stats` - Display cache statistics and performance metrics
- `clear` - Clear cache entries
- `config` - Manage configuration settings

## Configuration

The CLI supports configuration through:

1. **Environment Variables:**
   ```bash
   export LLM_CACHE_BASE_URL=http://localhost:8000
   export LLM_CACHE_API_KEY=sk-your-key-here
   export LLM_CACHE_DEFAULT_MODEL=gpt-3.5-turbo
   export LLM_CACHE_TIMEOUT=30
   ```

2. **Local .env file:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Config file:** `~/.llm-cache/config.json` (created by `init` command)

## Project Integration

The CLI is integrated into the main project:

```bash
# From the project root
npm run install-cli  # Install CLI dependencies
npm run build-cli    # Build the CLI
npm run cli          # Run the CLI
```

## Features

### Test Command
- Tests both cache miss and cache hit scenarios
- Measures performance improvements
- Validates API connectivity
- Shows detailed response information

### Stats Command
- Cache hit rates and performance metrics
- Cost savings calculations
- Model usage breakdown
- Daily performance trends
- Actionable recommendations

### Clear Command
- Clear cache entries by age
- Safety confirmations for destructive operations
- Progress indicators
- Post-operation statistics

### Config Command
- Interactive configuration management
- Validation of settings
- Masked API key display
- Support for environment variables

## File Structure

```
cli/
├── src/
│   ├── commands/          # Command implementations
│   │   ├── init.ts       # Initialize configuration
│   │   ├── test.ts       # Test functionality
│   │   ├── stats.ts      # Statistics display
│   │   ├── clear.ts      # Cache clearing
│   │   └── config.ts     # Configuration management
│   ├── lib/
│   │   ├── api.ts        # API client
│   │   ├── config.ts     # Configuration management
│   │   └── utils.ts      # Utility functions
│   ├── types/
│   │   └── index.ts      # TypeScript types
│   └── index.ts          # Main entry point
├── bin/
│   └── llm-cache         # Executable script
├── dist/                 # Compiled JavaScript (generated)
├── README.md             # Detailed CLI documentation
├── install.sh            # Installation script
├── .env.example          # Example environment config
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## Troubleshooting

### Common Issues

1. **Permission errors during installation:**
   - Use `--no-bin-links` flag with npm install
   - Run installation script instead of manual install

2. **Connection errors:**
   - Verify the LLM Cache Proxy server is running
   - Check the base URL in configuration
   - Ensure API key is valid and has appropriate permissions

3. **Configuration issues:**
   - Run `llm-cache config --show` to verify settings
   - Use `llm-cache init` to reconfigure
   - Check environment variables are set correctly

### WSL/Windows Specific

If you encounter symlink permission errors:
```bash
npm install --no-bin-links
```

This is already handled by the installation script.

## Usage Examples

### Testing Different Models
```bash
./bin/llm-cache test -m gpt-4 -q "Explain quantum computing"
```

### Getting Extended Statistics
```bash
./bin/llm-cache stats -d 30  # Last 30 days
```

### Clearing Old Cache
```bash
./bin/llm-cache clear --older-than 48  # Clear entries older than 48 hours
```

### Managing Configuration
```bash
./bin/llm-cache config --show              # View current config
./bin/llm-cache config --set timeout=60    # Set timeout to 60 seconds
```

## Next Steps

After installation:

1. Configure the CLI with your server details
2. Test the connection to ensure everything works
3. Use the stats command to monitor cache performance
4. Integrate the CLI into your development workflow
5. Set up regular cache maintenance with the clear command

The CLI provides a complete interface for managing and monitoring your LLM Cache Proxy installation according to Phase 4 specifications.