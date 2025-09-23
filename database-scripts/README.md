# CacheGPT Database Scripts

This folder contains all database scripts that reflect the current state and setup of the CacheGPT database.

## Script Order and Purpose

### 1. `001_base_schema.sql`
- **Purpose**: Core database schema with main tables
- **Contains**:
  - `cached_responses` (partitioned cache table)
  - `user_profiles` (user profile management)
  - `usage` (analytics and tracking)
  - `oauth_providers` (empty - to be repurposed)
  - `api_keys` (empty - to be repurposed)
  - `popular_queries` (unused - to be removed)

### 2. `002_auth_profiles.sql`
- **Purpose**: Authentication and user profile setup
- **Contains**:
  - `profiles` table creation
  - User triggers for profile creation
  - Row Level Security (RLS) policies
  - User management functions

### 3. `003_anonymous_caching.sql`
- **Purpose**: Support for anonymous users and chat caching
- **Contains**:
  - Anonymous user support in `usage` table
  - Chat caching columns (`prompt`, `response`, `tokens_used`, etc.)
  - Cache statistics view
  - Cleanup functions for old anonymous data

### 4. `004_cli_auth_optimization.sql` ✅ **COMPLETED**
- **Purpose**: CLI authentication system with new tables
- **Contains**:
  - Create `cli_auth_sessions` table for browser-to-CLI OAuth
  - Create `user_provider_credentials` table for LLM tokens
  - Remove unused tables
  - Add CLI authentication functionality
  - Optimize database for CLI OAuth flow

## Current Database State ✅ **AFTER OPTIMIZATION**

Your database now contains these core tables:
- ✅ `cached_responses_2025_09/10/11` (partitioned cache - 2 rows in Sept)
- ✅ `user_profiles` (2 rows)
- ✅ `usage` (analytics - 152 kB)
- ✅ `cli_auth_sessions` (56 kB) - NEW: Browser-to-CLI OAuth
- ✅ `user_provider_credentials` (96 kB, 1 row) - NEW: LLM provider tokens

## Database Optimization Results

✅ **Created CLI Authentication Tables**
✅ **Cleaned Up Unused Tables**
✅ **Streamlined Database Structure**
✅ **CLI Authentication Ready**

Your CLI authentication flow should now work properly!