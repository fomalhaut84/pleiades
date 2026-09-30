M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
for r in myFinance myFitness; do g() { git -C $M/$r.git "$@"; }; echo "== $r"
 echo "-- process.env keys (src/ scripts/ prisma.config.ts next.config.mjs ecosystem):"
 g grep --text -ohE 'process\.env\.[A-Z0-9_]+|process\.env\[["'"'"'][A-Z0-9_]+' dev -- src prisma.config.ts next.config.mjs ecosystem.config.js | sed -E 's/.*env(\.|\[.)//' | sort | uniq -c | sort -rn | awk '{printf "%s(%s) ",$2,$1}'; echo
 echo "-- .env.example keys:"; g show dev:.env.example | /usr/bin/grep -aoE '^[A-Z0-9_]+=' | tr -d = | tr '\n' ' '; echo
 echo "-- ecosystem apps/ports:"; g show dev:ecosystem.config.js | /usr/bin/grep -anE "name:|PORT|port|args|script:|cwd" | sed 's/^/   /'
 echo "-- instrumentation / cron start sites:"; g grep --text -nlE 'cron\.schedule|startScheduler|setInterval\(' dev -- src | tr '\n' ' '; echo
 g cat-file -e dev:src/instrumentation.ts 2>/dev/null && { echo "-- src/instrumentation.ts:"; g show dev:src/instrumentation.ts | /usr/bin/grep -anE 'NEXT_RUNTIME|import\(|env\.|start|register' ; }
done
