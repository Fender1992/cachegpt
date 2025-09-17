# Setup Instructions for LLM Cache Proxy

## Prerequisites
- Node.js and Yarn installed
- Supabase account and project created
- Python 3.9+ (for backend, if needed)

## Database Setup (IMPORTANT)

You need to run these SQL scripts in your Supabase SQL Editor in this order:

### 1. Create Tables
Run the contents of `sql/setup_database.sql` in Supabase SQL Editor to create all necessary tables.

### 2. Enable Row Level Security (RLS)
Run the contents of `sql/setup_rls_policies.sql` to set up proper permissions. This is CRITICAL for the application to work properly.

## Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
yarn install
```

3. Start the development server:
```bash
yarn dev
```

The frontend will be available at http://localhost:3000

## How to Use

### 1. Sign Up / Sign In
- Go to http://localhost:3000
- Click "Need an account? Sign Up" to create a new account
- Enter your email and password
- Check your email for confirmation (if email confirmation is enabled in Supabase)
- Sign in with your credentials

### 2. Dashboard Features
Once logged in, you'll see:
- **Statistics**: Total requests, cache hit rate, cost saved, average response time
- **Usage Chart**: Visual representation of your API usage over time
- **API Keys Management**: Create and manage your API keys

### 3. Creating API Keys
- Enter a name for your API key in the input field
- Click "Create Key"
- Your key will appear in the table below
- Click the eye icon to view the full key
- Click the copy icon to copy it to clipboard
- Click the trash icon to delete the key

### 4. Using Your API Key
Once you have an API key, you can use it to make requests to the cache proxy:

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer sk-your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Troubleshooting

### "Error creating user profile" during sign up
This means RLS policies are not set up. Run `sql/setup_rls_policies.sql` in Supabase SQL Editor.

### API keys not showing in dashboard
1. Check browser console for errors
2. Ensure the `api_keys` table exists in Supabase
3. Verify RLS policies are enabled

### Cannot create API keys
1. Make sure you're logged in
2. Check that the `api_keys` table has proper RLS policies
3. Look for errors in the browser console

## Backend Setup (Optional)

If you want to run the Python backend:

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Start the FastAPI server:
```bash
cd app
uvicorn main:app --reload
```

The backend API will be available at http://localhost:8000