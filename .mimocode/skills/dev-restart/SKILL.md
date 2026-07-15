---
name: dev-restart
description: Kill and restart the Express dev server on port 8080, verify health endpoint, and check TypeScript compilation
---

# Dev Server Restart

Restarts the Express/Vite dev server, verifies it's healthy, and optionally runs a TypeScript type check.

## Usage

Run this after making code changes to verify everything compiles and the server starts correctly.

## Procedure

1. Kill any existing `tsx server.ts` process
2. Start the server in the background with `nohup`
3. Wait for the server to be ready
4. Verify the health endpoint responds
5. (Optional) Run TypeScript type check to catch compilation errors

## Commands

```bash
# Full restart with health check
pkill -f "tsx server.ts" 2>/dev/null; sleep 1 && nohup npx tsx server.ts > /tmp/autoapply-server.log 2>&1 & sleep 3 && curl -s http://localhost:8080/api/v1/health

# Quick type check (run after any code edit)
npx tsc --noEmit 2>&1 | head -10

# Check server logs if health check fails
cat /tmp/autoapply-server.log | tail -50
```

## Notes

- Server runs on port **8080** (not 3000)
- Health endpoint: `/api/v1/health`
- Logs are written to `/tmp/autoapply-server.log`
- Use `sleep 2-3` after starting to allow server initialization
- If health check fails, check logs for import errors or missing dependencies
