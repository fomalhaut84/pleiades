SP=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad; M=$SP/mono; R=$M/fr_mono; L=$M/x3logs
export DATABASE_URL='postgresql://none:none@127.0.0.1:1/none' NEXT_TELEMETRY_DISABLED=1 CI=1
cd $R; (npm ci --no-audit --no-fund && npm run build) > $L/notify.build.log 2>&1; echo "root ci+notify build rc=$? dist=$(ls packages/notify/dist | wc -l)"
cd $R/apps/fitness
for c in "npm run typecheck" "npm run lint" "npm run test" "npm run build"; do s=$(date +%s); eval "$c" > $L/fit.notify.$(echo $c | awk '{print $NF}').log 2>&1; echo "$c rc=$? $(( $(date +%s)-s ))s"; done
grep -aE 'Test Files|Tests ' $L/fit.notify.test.log | head -2
echo "bot bundle: notify symbols $(grep -ac 'TelegramTransport\|createNotifier\|maxLength' dist/bot/standalone.cjs) · require(@pleiades/notify) $(grep -ac 'require("@pleiades/notify")' dist/bot/standalone.cjs) · bundled-from path $(grep -ac 'packages/notify/dist' dist/bot/standalone.cjs)"
ls .next/server >/dev/null 2>&1 && echo "next build output: yes"
