M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
for r in myFinance myFitness; do g() { git -C $M/$r.git "$@"; }; echo "== $r dev top-level"; g ls-tree --name-only dev | tr '\n' ' '; echo
 echo "-- .github:"; g ls-tree -r --name-only dev -- .github | tr '\n' ' '; echo
 echo "-- .claude files: $(g ls-tree -r --name-only dev -- .claude | wc -l)  CLAUDE.md: $(g cat-file -e dev:CLAUDE.md 2>/dev/null && echo yes || echo no)"
 echo "-- int/pleiades .claude files: $(g ls-tree -r --name-only integration/pleiades -- .claude | wc -l) CLAUDE.md: $(g cat-file -e integration/pleiades:CLAUDE.md 2>/dev/null && echo yes || echo no)"
 echo "-- gitignore claude lines:"; g show dev:.gitignore | /usr/bin/grep -anE 'claude|CLAUDE|\.env|node_modules|\.next|generated'
 for f in .env.example ecosystem.config.js ecosystem.config.cjs prisma/schema.prisma .nvmrc .node-version next.config.ts next.config.mjs next.config.js vitest.config.mts vitest.config.ts eslint.config.mjs tsconfig.json postcss.config.mjs; do g cat-file -e dev:$f 2>/dev/null && printf "%s " $f; done; echo
 echo "-- deploy/ scripts/:"; g ls-tree -r --name-only dev -- deploy scripts | tr '\n' ' '; echo
 echo "-- prisma: $(g ls-tree -r --name-only dev -- prisma | wc -l) files, migrations dirs $(g ls-tree --name-only dev:prisma/migrations 2>/dev/null | wc -l)"
done
echo "== pleiades dev top-level & .github"; git -C /Users/sagan/workspace/pleiades ls-tree --name-only dev | tr '\n' ' '; echo; git -C /Users/sagan/workspace/pleiades ls-tree -r --name-only dev -- .github | tr '\n' ' '; echo
