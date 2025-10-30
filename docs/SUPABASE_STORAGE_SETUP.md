# Supabase Storage Setup Guide

## Overview
This guide walks you through setting up Supabase Storage for conversation file uploads in CacheGPT.

## Step 1: Create Storage Bucket (via Supabase Dashboard)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_ID
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"** button
4. Configure the bucket:
   - **Name**: `conversation-files`
   - **Public bucket**: ❌ (Leave unchecked - we want private bucket with RLS)
   - **File size limit**: `30 MB` (31457280 bytes)
   - **Allowed MIME types**: Leave empty or specify:
     - `application/pdf`
     - `text/*`
     - `image/*`
     - `application/json`
5. Click **"Create bucket"**

## Step 2: Create RLS Policies (via Supabase Dashboard)

After creating the bucket, set up Row Level Security policies:

### 2.1 Navigate to Policies

1. In the Storage section, click on your `conversation-files` bucket
2. Click on **"Policies"** tab
3. Click **"New policy"**

### 2.2 Policy 1: Allow Upload to Own Folder

**Policy name**: `Users can upload files to their own folder`

**Allowed operation**: `INSERT`

**Target roles**: `authenticated`

**USING expression**: Leave empty (INSERT doesn't use USING)

**WITH CHECK expression**:
```sql
bucket_id = 'conversation-files'
AND (storage.foldername(name))[1] = auth.uid()::text
```

Click **"Review"** then **"Save policy"**

### 2.3 Policy 2: Allow View Own Files

**Policy name**: `Users can view their own files`

**Allowed operation**: `SELECT`

**Target roles**: `authenticated`

**USING expression**:
```sql
bucket_id = 'conversation-files'
AND (storage.foldername(name))[1] = auth.uid()::text
```

**WITH CHECK expression**: Leave empty (SELECT doesn't use WITH CHECK)

Click **"Review"** then **"Save policy"**

### 2.4 Policy 3: Allow Update Own Files (Optional)

Only needed if you want users to be able to overwrite files.

**Policy name**: `Users can update their own files`

**Allowed operation**: `UPDATE`

**Target roles**: `authenticated`

**USING expression**:
```sql
bucket_id = 'conversation-files'
AND (storage.foldername(name))[1] = auth.uid()::text
```

**WITH CHECK expression**:
```sql
bucket_id = 'conversation-files'
AND (storage.foldername(name))[1] = auth.uid()::text
```

Click **"Review"** then **"Save policy"**

### 2.5 Policy 4: Allow Delete Own Files

**Policy name**: `Users can delete their own files`

**Allowed operation**: `DELETE`

**Target roles**: `authenticated`

**USING expression**:
```sql
bucket_id = 'conversation-files'
AND (storage.foldername(name))[1] = auth.uid()::text
```

**WITH CHECK expression**: Leave empty (DELETE doesn't use WITH CHECK)

Click **"Review"** then **"Save policy"**

## Step 3: Verify Environment Variables

Ensure these are set in your `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Step 4: Test Storage Setup

After creating the bucket and policies, test with this simple script:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Test upload (must be authenticated)
async function testUpload() {
  const userId = 'YOUR_USER_ID' // Get from auth session
  const testFile = new Blob(['Hello World'], { type: 'text/plain' })
  const filePath = `${userId}/test/test.txt`

  const { data, error } = await supabase.storage
    .from('conversation-files')
    .upload(filePath, testFile)

  console.log('Upload result:', { data, error })
}

// Test download
async function testDownload() {
  const userId = 'YOUR_USER_ID'
  const filePath = `${userId}/test/test.txt`

  const { data, error } = await supabase.storage
    .from('conversation-files')
    .download(filePath)

  console.log('Download result:', { data, error })
}
```

## Storage Path Structure

Files will be organized as:
```
conversation-files/
  {user_id}/
    {conversation_id}/
      {file_id}.pdf
      {file_id}.txt
      ...
    unlinked/
      {file_id}.jpg  (files not yet linked to conversation)
```

## RLS Policy Explanation

### How the policies work:

1. **User Folder Isolation**: `(storage.foldername(name))[1] = auth.uid()::text`
   - Extracts the first folder from the path (user_id)
   - Ensures it matches the authenticated user's ID
   - Users can ONLY access files in folders named with their own UUID

2. **Bucket Restriction**: `bucket_id = 'conversation-files'`
   - Ensures policies only apply to our specific bucket
   - Prevents cross-bucket access

3. **Operation Control**:
   - INSERT: Upload new files
   - SELECT: Download/view files
   - UPDATE: Overwrite existing files
   - DELETE: Remove files

## Common Issues & Solutions

### Issue 1: "new row violates row-level security policy"
**Solution**: Ensure the file path starts with the user's ID: `${userId}/...`

### Issue 2: "permission denied for relation objects"
**Solution**: Don't create policies via SQL - use the Supabase Dashboard

### Issue 3: Files upload but can't download
**Solution**: Make sure you created the SELECT policy for downloads

### Issue 4: Public URLs don't work
**Solution**: Bucket is private - use signed URLs or the download method with auth

## Getting Signed URLs

For temporary public access (e.g., sharing files):

```typescript
const { data, error } = await supabase.storage
  .from('conversation-files')
  .createSignedUrl(`${userId}/path/to/file.pdf`, 3600) // 1 hour expiry

console.log('Signed URL:', data?.signedUrl)
```

## Next Steps

After completing this setup:
1. Run the test script above to verify everything works
2. Update your application code to use Storage instead of database BLOBs
3. Monitor storage usage in Supabase Dashboard > Storage
4. Set up storage quotas if needed for different user tiers

## Resources

- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [Storage RLS Policies](https://supabase.com/docs/guides/storage/security/access-control)
- [Storage Client Library](https://supabase.com/docs/reference/javascript/storage-from-upload)
