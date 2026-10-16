# thebetterconsultant
The Better Consultant 
# Culture and Quality Toolkit: hosted version

public/index.html        the page
functions/api/run.js     server route that holds the key and calls the worker

## Deploy (Cloudflare Pages, about 10 minutes)
1. In this folder: `npx wrangler pages deploy public --project-name cq-toolkit`
   (wrangler picks up ./functions automatically)
2. Cloudflare dashboard > Workers & Pages > cq-toolkit > Settings > Variables and secrets, add:
   - ACCESS_CODES = comma-separated codes you hand out (secret)
   - WORKER_KEY   = the worker key (secret)
   - WORKER_URL   = https://xtkhzicrloqwgxdsfwvc.supabase.co/functions/v1/issue
   - DAILY_LIMIT  = 20   (optional)
3. Optional daily limit: create a KV namespace and bind it to the project with the variable name RUNS.
4. Redeploy once so the settings apply, then add a custom domain under Custom domains.
