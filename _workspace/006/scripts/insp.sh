cd /private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
while read r p; do echo "=== $r $p"; git -C $r.git log --all -p --text -U0 --format= -- "$p" | grep --binary-files=text -E '^\+' | grep --binary-files=text -iE 'postgres|PASSWORD|SECRET|TOKEN|API_KEY|KEY *=|KEY *:|PRIVATE KEY' | sed -E 's/(:\/\/[^:]+:)([^@]{0,2})[^@]*@/\1\2***@/; s/([=:] *["'"'"']?)([A-Za-z0-9+\/_-]{3})[A-Za-z0-9+\/_-]{8,}/\1\2***/' | sort -u | head -12; done <<L
myFinance src/mcp/__tests__/logger.test.ts
myFinance .env.example
myFinance docs/architecture.md
myFinance docs/milestone-2.md
myFinance docs/specs/366-deploy-automation.md
myFitness src/lib/nutrition/food-db-mfds.ts
myFitness .env.example
myFitness docs/architecture.md
myFitness docs/specs/1-project-init.md
L
