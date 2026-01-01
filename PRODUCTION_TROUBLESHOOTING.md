# Production Deployment Troubleshooting Guide

## Common Issues When Sandboxes Don't Work in Production

### 0. No Runs Appearing in Trigger.dev Dashboard

**Symptoms**: When you trigger a sandbox creation from the frontend, nothing appears in the Trigger.dev "Runs" section, even though everything is deployed and environment variables are set.

**Possible Causes & Solutions**:

1. **Task Not Deployed**:
   - Go to [Trigger.dev Dashboard](https://cloud.trigger.dev) → Your Project → Tasks
   - Verify `sandbox-operations` task exists and shows as "Deployed"
   - If not deployed, check GitHub Actions or run: `npx trigger.dev@latest deploy`

2. **Incorrect API Key**:
   - Verify `TRIGGER_API_KEY` in Vercel matches the API key from Trigger.dev Dashboard
   - Go to Trigger.dev Dashboard → Manage → API keys
   - Ensure you're using the **API Key** (not Access Token)
   - The API key should start with `tr_` or similar

3. **Project ID Mismatch**:
   - Check `trigger.config.ts` - the `project` field should match your Trigger.dev project ID
   - Format: `proj_xxxxx`
   - Verify in Trigger.dev Dashboard → Project Settings

4. **Environment Variable Not Set for Production**:
   - In Vercel: Settings → Environment Variables
   - Ensure `TRIGGER_API_KEY` is set for **Production** environment (not just Preview/Development)
   - Redeploy after adding/updating variables

5. **Silent Trigger Failure**:
   - Check Vercel Function Logs for errors
   - Look for console logs starting with `[create-sandbox]`
   - The code now tries `tasks.trigger()` first, then falls back to `task.trigger()`
   - Check for authentication errors (401/403) or "task not found" errors

6. **SDK Initialization Issue**:
   - The Trigger.dev SDK should automatically use `TRIGGER_API_KEY` from environment
   - Ensure `TRIGGER_API_URL` is correct (defaults to `https://api.trigger.dev`)
   - For custom instances, set `TRIGGER_API_URL` in Vercel

**Debugging Steps**:
1. Check Vercel Function Logs (Deployments → Your Deployment → Functions → View Logs)
2. Look for `[create-sandbox]` console logs
3. Check Trigger.dev Dashboard → Runs (should show runs even if they fail)
4. Verify task is deployed: Dashboard → Tasks → `sandbox-operations`
5. Test API key manually: Use Trigger.dev API or dashboard to trigger a test run

**Quick Test**:
```bash
# From your local machine (with TRIGGER_API_KEY set)
curl -X POST https://api.trigger.dev/v1/tasks/sandbox-operations/trigger \
  -H "Authorization: Bearer YOUR_TRIGGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"createSandbox": {"timeout": 600000}}'
```

If this works but your app doesn't, the issue is in the application code or environment variable configuration.

### 1. Environment Variables Not Set in Vercel

**Symptoms**: Sandbox creation fails with "E2B_API_KEY is not configured" or "TRIGGER_API_KEY is not configured"

**Solution**:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add the following variables:
   - `E2B_API_KEY` - Your e2b API key
   - `TRIGGER_API_KEY` - Your Trigger.dev API key (from Dashboard → Manage → API keys)
   - `OPENAI_API_KEY` - Your OpenAI API key (or use AI Gateway)
3. **Important**: Make sure to set them for **Production** environment (not just Preview/Development)
4. Redeploy after adding variables

### 2. Trigger.dev Tasks Not Deployed

**Symptoms**: Task triggering fails or returns "task not found"

**Solution**:
1. Check if tasks are deployed:
   - Go to [Trigger.dev Dashboard](https://cloud.trigger.dev)
   - Check your project → Tasks
   - Verify `sandbox-operations` task exists and is deployed
2. If not deployed, run:
   ```bash
   npx trigger.dev@latest deploy
   ```
   Or ensure your CI/CD pipeline has deployed them (check GitHub Actions)
3. Verify the project ID in `trigger.config.ts` matches your Trigger.dev project

### 3. Vercel Function Timeout

**Symptoms**: Request times out, sandbox creation hangs

**Solution**:
- **Hobby Plan**: 10 second timeout (too short for sandbox creation)
- **Pro Plan**: 60 second timeout (may still be tight)
- **Enterprise**: Custom timeout

**Workaround**: 
- The `waitForRunOutput` function waits up to 30 seconds (60 attempts × 500ms)
- If this exceeds Vercel's timeout, consider:
  1. Upgrade to Vercel Pro for 60s timeout
  2. Make the task trigger async (don't wait for result immediately)
  3. Use webhooks/SSE for real-time updates instead of polling

### 4. Missing publicAccessToken

**Symptoms**: "No access token available to retrieve run output"

**Solution**:
- The code falls back to `TRIGGER_API_KEY` if `publicAccessToken` is missing
- Ensure `TRIGGER_API_KEY` is set in Vercel environment variables
- Check Trigger.dev dashboard to verify API key has correct permissions

### 5. Network/Firewall Issues

**Symptoms**: Cannot connect to Trigger.dev API or e2b API

**Solution**:
- Vercel serverless functions should have outbound internet access
- Check Vercel logs for network errors
- Verify API endpoints are accessible:
  - Trigger.dev: `https://api.trigger.dev`
  - e2b: Check e2b API status

### 6. Task Execution Errors

**Symptoms**: Task triggers but fails during execution

**Solution**:
1. Check Trigger.dev Dashboard → Runs
2. Look for failed runs and error messages
3. Common issues:
   - `E2B_API_KEY` not set in Trigger.dev task environment
   - e2b API rate limits
   - Sandbox creation timeout

### 7. Environment Variable Scope

**Symptoms**: Variables work locally but not in production

**Solution**:
- In Vercel, environment variables can be scoped to:
  - Production
  - Preview
  - Development
- **Make sure to set variables for Production environment**
- Variables set for Preview/Development won't work in Production

## Debugging Steps

### Step 1: Check Environment Variables
```bash
# In Vercel, check logs for:
console.log('E2B_API_KEY exists:', !!process.env.E2B_API_KEY)
console.log('TRIGGER_API_KEY exists:', !!process.env.TRIGGER_API_KEY)
```

### Step 2: Check Trigger.dev Task Status
1. Go to Trigger.dev Dashboard
2. Check "Runs" tab for recent executions
3. Look for errors or failed runs
4. Check task logs for detailed error messages

### Step 3: Check Vercel Function Logs
1. Go to Vercel Dashboard → Your Project → Functions
2. Check execution logs for errors
3. Look for timeout errors or network failures

### Step 4: Test Task Triggering
Add logging to see what's happening:
```typescript
console.log('[create-sandbox] Triggering task...')
const handle = await sandboxOperationsTask.trigger({...})
console.log('[create-sandbox] Handle:', handle)
```

## Quick Checklist

- [ ] `E2B_API_KEY` set in Vercel (Production environment)
- [ ] `TRIGGER_API_KEY` set in Vercel (Production environment)
- [ ] `OPENAI_API_KEY` or AI Gateway configured
- [ ] Trigger.dev tasks deployed (check dashboard)
- [ ] Project ID in `trigger.config.ts` matches Trigger.dev project
- [ ] Vercel plan supports required timeout (Pro recommended)
- [ ] No firewall/network restrictions
- [ ] Check Vercel function logs for errors
- [ ] Check Trigger.dev dashboard for failed runs

## Getting More Information

1. **Enable verbose logging**: Check `trigger.config.ts` - `logLevel: "log"` is already set
2. **Check browser console**: Look for errors in the frontend
3. **Check network tab**: See if API calls are failing
4. **Vercel Analytics**: Check function execution times and errors

## Still Not Working?

1. Check the exact error message in Vercel logs
2. Check Trigger.dev dashboard for task execution errors
3. Compare local `.env.local` with Vercel environment variables
4. Verify API keys are valid and not expired
5. Check if there are rate limits being hit

