SP=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad; M=$SP/mono; R=$M/fr_mono; L=$M/x3logs
export DATABASE_URL='postgresql://none:none@127.0.0.1:1/none' NEXT_TELEMETRY_DISABLED=1 CI=1
cd $R; (npm --prefix packages/notify ci --no-audit --no-fund && npm run build) > $L/notify.build.log 2>&1; echo "notify build rc=$? dist=$(ls packages/notify/dist | wc -l)"
cd $R/apps/fitness
# 1a-3 src (fd8b7c5) 적용 — package.json·lock 제외
git -C $M/myFitness.git diff --name-only --diff-filter=AM integration/pleiades fd8b7c5 -- src | while read f; do mkdir -p $(dirname $f); git -C $M/myFitness.git show fd8b7c5:$f > $f; done
git -C $M/myFitness.git diff --name-only --diff-filter=D integration/pleiades fd8b7c5 -- src | xargs rm -f
echo "src changes applied: $(git status --short . | wc -l)"
s=$(date +%s); npm install --no-audit --no-fund @pleiades/notify@file:../../packages/notify > $L/fit.notify.install.log 2>&1; echo "npm install file: rc=$? $(( $(date +%s)-s ))s spec=$(node -p 'require("./package.json").dependencies["@pleiades/notify"]') link=$(readlink node_modules/@pleiades/notify)"
node -e 'const l=require("./package-lock.json").packages; console.log("lock entries:", JSON.stringify(l["node_modules/@pleiades/notify"]), Object.keys(l).filter(k=>k.includes("packages/notify")).join(","))'
rm -rf node_modules; s=$(date +%s); npm ci --no-audit --no-fund > $L/fit.notify.ci.log 2>&1; echo "npm ci rc=$? $(( $(date +%s)-s ))s link=$(readlink node_modules/@pleiades/notify)"
npx prisma generate >/dev/null 2>&1
for c in "npm run typecheck" "npm run lint" "npm run test" "npm run build"; do s=$(date +%s); eval "$c" > $L/fit.notify.$(echo $c | awk '{print $NF}').log 2>&1; echo "$c rc=$? $(( $(date +%s)-s ))s"; done
grep -aE 'Test Files|Tests ' $L/fit.notify.test.log | head -2
echo "bot bundle contains notify code: $(grep -ac 'pleiades/notify\|TelegramTransport\|createNotifier' dist/bot/standalone.cjs) ; external? $(grep -ac 'require(\"@pleiades/notify\")' dist/bot/standalone.cjs)"
grep -aE 'inferred your workspace|Detected additional lockfiles' $L/fit.notify.build.log | head -2
