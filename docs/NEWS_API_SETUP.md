# News API Integration Setup

CacheGPT integrates with 4 major news APIs to provide real-time news context when users ask about current events. This ensures LLM responses include the latest information.

## 🌟 Features

- **Automatic Detection**: System detects when users ask about current events
- **Multi-Source Aggregation**: Combines results from 4 news APIs for comprehensive coverage
- **Smart Deduplication**: Removes duplicate articles across sources
- **Cache Integration**: News context included in cache invalidation logic
- **Free Tiers Available**: All 4 APIs offer free plans

## 📰 Supported News APIs

### 1. NewsAPI.org
- **Free Tier**: 100 requests/day
- **Coverage**: 80,000+ news sources worldwide
- **Best For**: General news, trending topics

**How to Get API Key:**
1. Visit: https://newsapi.org/register
2. Sign up with email
3. Verify email
4. Copy API key from dashboard
5. Add to `.env`: `NEWS_API_KEY=your_key_here`

**Documentation**: https://newsapi.org/docs

---

### 2. NewsData.io
- **Free Tier**: 200 requests/day
- **Coverage**: Global news in 50+ languages
- **Best For**: International news, high volume

**How to Get API Key:**
1. Visit: https://newsdata.io/register
2. Create account
3. Verify email
4. Get API key from dashboard
5. Add to `.env`: `NEWSDATA_API_KEY=your_key_here`

**Documentation**: https://newsdata.io/documentation

---

### 3. The Guardian API
- **Free Tier**: Unlimited (with rate limiting)
- **Coverage**: The Guardian's entire content archive
- **Best For**: UK news, in-depth journalism

**How to Get API Key:**
1. Visit: https://open-platform.theguardian.com/access/
2. Register for developer key
3. Agree to terms
4. Receive key via email
5. Add to `.env`: `GUARDIAN_API_KEY=your_key_here`

**Documentation**: https://open-platform.theguardian.com/documentation/

---

### 4. GNews API
- **Free Tier**: 100 requests/day
- **Coverage**: 60,000+ sources in 15 languages
- **Best For**: Breaking news, real-time updates

**How to Get API Key:**
1. Visit: https://gnews.io/
2. Click "Get API Key"
3. Sign up with email
4. Verify email
5. Copy API key
6. Add to `.env`: `GNEWS_API_KEY=your_key_here`

**Documentation**: https://gnews.io/docs/v4

---

## 🔧 Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# News API Keys (for real-time news context)
# NewsAPI.org - 100 requests/day free tier
NEWS_API_KEY=your_newsapi_key_here

# NewsData.io - 200 requests/day free tier
NEWSDATA_API_KEY=your_newsdata_key_here

# The Guardian API - Free with registration
GUARDIAN_API_KEY=your_guardian_api_key_here

# GNews API - 100 requests/day free tier
GNEWS_API_KEY=your_gnews_api_key_here
```

### Optional: Use Subset of APIs

You don't need all 4 API keys. The system will use whatever keys are available:

- **Minimum**: 1 API key (system will work but with limited coverage)
- **Recommended**: 2-3 API keys for redundancy
- **Optimal**: All 4 API keys for maximum coverage and reliability

If a key is missing, that API is simply skipped without errors.

---

## 🚀 How It Works

### 1. Automatic Detection

The system detects news-related queries by looking for keywords:

- Time-related: "today", "latest", "current", "recent", "now"
- News-related: "news", "breaking", "update", "happening"
- Context: "what's going on", "what happened", "tell me about"

### 2. Query Processing

When a news query is detected:

```typescript
// User asks: "What's the latest news about AI?"

1. Extract search query: "latest news about AI"
2. Fetch from all 4 APIs in parallel
3. Combine results (e.g., 20 total articles)
4. Sort by publication date
5. Deduplicate by title similarity
6. Return top 10 most recent articles
```

### 3. Context Injection

News articles are injected into the LLM prompt:

```
=== REAL-TIME NEWS CONTEXT (2025-10-02T10:30:00Z) ===
Sources: NewsAPI, NewsData.io, The Guardian, GNews

1. OpenAI Announces GPT-5 Release Date
   Major breakthrough in AI capabilities announced at developer conference...
   Published: 2025-10-02 09:15:00
   Source: NewsAPI: TechCrunch
   URL: https://techcrunch.com/...

2. New AI Regulations Proposed in EU
   European Parliament discusses comprehensive AI safety framework...
   Published: 2025-10-02 08:45:00
   Source: The Guardian
   URL: https://theguardian.com/...

=== END NEWS CONTEXT ===

Instructions: Use the above real-time news articles to provide current,
accurate information. Cite sources when referencing specific news items.
```

### 4. LLM Response

The LLM now has access to:
- Its training data (up to knowledge cutoff)
- Real-time news articles (published today)
- Ability to cite specific sources

Result: More accurate, up-to-date responses with proper attribution.

---

## 📊 Rate Limits & Cost

### Free Tier Limits

| API | Requests/Day | Requests/Month | Cost |
|-----|-------------|----------------|------|
| NewsAPI.org | 100 | 3,000 | Free |
| NewsData.io | 200 | 6,000 | Free |
| The Guardian | ~500 (rate limited) | ~15,000 | Free |
| GNews | 100 | 3,000 | Free |
| **Total** | **500** | **15,000** | **$0** |

### Paid Tiers (Optional)

If you need more requests:

- **NewsAPI.org**: $449/month for 250,000 requests
- **NewsData.io**: $199/month for 72,000 requests
- **The Guardian**: Always free (rate limited)
- **GNews**: $49/month for 100,000 requests

**Recommendation**: Start with free tiers. Monitor usage. Upgrade only if needed.

---

## 🧪 Testing

### Test News Integration

1. **Add at least one API key** to `.env`

2. **Restart your development server**:
```bash
yarn dev
```

3. **Test with news queries**:
```
User: "What's the latest news about climate change?"
User: "Tell me what happened today in technology"
User: "What are the current events in politics?"
```

4. **Check logs** for news API activity:
```
News context fetched: 10 articles from 3 sources
Sources: NewsAPI, GNews, The Guardian
```

### Verify API Keys Work

Test each API individually:

```bash
# Test NewsAPI
curl "https://newsapi.org/v2/everything?q=test&apiKey=YOUR_KEY"

# Test NewsData.io
curl "https://newsdata.io/api/1/news?apikey=YOUR_KEY&q=test"

# Test Guardian
curl "https://content.guardianapis.com/search?q=test&api-key=YOUR_KEY"

# Test GNews
curl "https://gnews.io/api/v4/search?q=test&token=YOUR_KEY"
```

Expected response: JSON with articles (not error message)

---

## 🔍 Monitoring

### Check News API Usage

The system logs news context usage:

```typescript
// In unified-chat route logs
console.log('[NEWS] Context fetched:', {
  articles: 10,
  sources: ['NewsAPI', 'GNews'],
  query: 'latest AI news'
});
```

### Monitor Rate Limits

Track your daily usage:

1. **NewsAPI Dashboard**: https://newsapi.org/account
2. **NewsData Dashboard**: https://newsdata.io/dashboard
3. **Guardian**: No dashboard (rate limited per IP)
4. **GNews Dashboard**: https://gnews.io/dashboard

---

## ⚠️ Troubleshooting

### No News Context Appearing

**Problem**: LLM responses don't include recent news

**Solutions**:
1. Check environment variables are set correctly
2. Verify API keys are valid (test with curl)
3. Ensure query uses keywords like "latest", "today", "current"
4. Check server logs for news API errors

### Rate Limit Exceeded

**Problem**: `429 Too Many Requests` error

**Solutions**:
1. Add more API keys (distribute load across services)
2. Upgrade to paid tier for high-traffic sites
3. Implement request queuing/throttling
4. Cache news results for 5-10 minutes

### API Key Invalid

**Problem**: `401 Unauthorized` or `Invalid API key`

**Solutions**:
1. Regenerate API key from provider dashboard
2. Check for typos in `.env` file
3. Verify no extra spaces or quotes around key
4. Restart server after updating `.env`

### Slow Response Times

**Problem**: Chat responses take 5+ seconds

**Solutions**:
1. News APIs run in parallel (shouldn't add much latency)
2. Check timeout settings (currently 5000ms per API)
3. Reduce number of articles fetched (currently 5 per API)
4. Pre-fetch common news topics in background

---

## 🎯 Best Practices

### 1. Start Small
- Add 1-2 API keys initially
- Monitor usage patterns
- Add more keys if needed

### 2. Monitor Costs
- Free tiers are generous (500 requests/day)
- Track usage in provider dashboards
- Set up alerts for approaching limits

### 3. Graceful Degradation
- System works with any combination of keys
- Missing keys are skipped silently
- No errors if all keys are missing (just no news context)

### 4. Cache Results
- News context included in LLM cache hash
- Same query within cache window reuses results
- Reduces API calls significantly

### 5. User Experience
- News queries return slightly slower (API fetch time)
- But responses are much more accurate and current
- Users appreciate up-to-date information

---

## 📈 Production Checklist

Before deploying to production:

- [ ] Add at least 2 news API keys to production `.env`
- [ ] Test news queries in staging environment
- [ ] Verify API keys work with curl/Postman
- [ ] Set up monitoring for rate limits
- [ ] Configure alerts for API errors
- [ ] Document which APIs are active
- [ ] Plan for scaling (paid tiers if needed)
- [ ] Add error handling for API failures
- [ ] Test cache invalidation with news context

---

## 🔗 Quick Links

- **NewsAPI.org**: https://newsapi.org
- **NewsData.io**: https://newsdata.io
- **The Guardian API**: https://open-platform.theguardian.com
- **GNews**: https://gnews.io

## 📞 Support

If you encounter issues:

1. Check this documentation first
2. Review server logs for specific errors
3. Test API keys individually
4. Open GitHub issue with error details
5. Contact support@cachegpt.io

---

**Last Updated**: October 2, 2025
**Version**: 1.0.0
**Maintainer**: CacheGPT Team
