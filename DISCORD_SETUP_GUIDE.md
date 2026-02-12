# Discord Integration Setup Guide

## ✅ Database Migration Complete!

Your database now has the Discord integration tables ready.

## 🔧 Next Steps

### 1. Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name it (e.g., "CacheGPT")
4. Go to **OAuth2** → **General**
5. Copy your **Client ID** and **Client Secret**

### 2. Configure OAuth2

In your Discord app settings:

1. **OAuth2** → **Redirects**
   - Add: `http://localhost:3000/api/integrations/discord/callback` (for development)
   - Add: `https://your-domain.com/api/integrations/discord/callback` (for production)

2. **OAuth2** → **OAuth2 URL Generator**
   - Select scopes:
     - `identify` - Get user info
     - `guilds` - List servers
     - `messages.read` - Read message history
   - Copy the generated URL (optional, for testing)

### 3. Add Environment Variables

Add to your `.env.local` or production environment:

```env
# Discord OAuth
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
NEXT_PUBLIC_DISCORD_CLIENT_ID=your_client_id_here
```

### 4. Test the Integration

1. **Start your app**: `npm run dev`
2. **Go to Settings**: Navigate to `/settings`
3. **Find Discord Integration**: In the Integrations section
4. **Connect Discord**: Click "Connect Discord"
5. **Authorize**: Select servers you want to connect
6. **Wait for Sync**: Initial sync will start automatically

### 5. Verify It Works

Try these queries in chat:
- "What Discord servers am I connected to?"
- "Show me recent Discord messages"
- "What was discussed in #general today?"
- "Find Discord conversations about [topic]"

## 🎉 You're All Set!

The Discord integration is now ready to use. It will:
- Sync messages from your Discord servers
- Index them for semantic search
- Provide context in your AI chats
- Update automatically when you ask Discord-related questions

## 📊 Monitor Status

Check the integration status in Settings:
- **Connected**: OAuth successful
- **Syncing**: Currently fetching messages
- **Server Count**: Number of servers connected
- **Channel Count**: Number of channels indexed
- **Message Count**: Number of message chunks stored

## 🔍 Troubleshooting

### "Discord connection failed"
- Verify environment variables are set
- Check Discord app redirect URL matches exactly
- Ensure client ID and secret are correct

### "No servers found"
- Make sure you selected servers during OAuth
- Check you have message read permissions
- Try manual sync button in settings

### "No messages appearing in chat"
- Wait for initial sync to complete (can take a few minutes)
- Check message count in settings
- Verify you're asking Discord-related questions

## 🚀 Advanced Usage

### Query Examples
```
"What did @username say about the bug?"
"Show Discord messages from yesterday in #development"
"Find discussions about deployment in MyServer"
"What was the decision about the API design?"
```

### Filtering
- **By Time**: today, yesterday, this week, last week
- **By Server**: "in server ServerName"
- **By Channel**: "in #channel-name"
- **By Author**: "from @username"

## 📝 Notes

- Only text channels are indexed (not voice)
- Private DMs are NOT accessed
- Respects Discord permissions
- Syncs last 100 messages per channel
- Updates can be triggered manually

Enjoy your Discord-powered AI assistant!