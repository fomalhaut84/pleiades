SP=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad; M=$SP/mono; L=$M/x3logs; mkdir -p $L
export DATABASE_URL='postgresql://none:none@127.0.0.1:1/none' NEXT_TELEMETRY_DISABLED=1 CI=1
run() { local app=$1 name=$2; shift 2; local s=$(date +%s); ( cd $M/fr_mono/apps/$app && eval "$@" ) > $L/$app.$name.log 2>&1; local rc=$?; echo "$app $name rc=$rc $(( $(date +%s)-s ))s :: $(tail -1 $L/$app.$name.log | cut -c1-140)"; }
APP=$1
if [ $APP = finance ]; then
 run finance ci "npm ci --no-audit --no-fund"
 run finance lint "npm run lint"
 run finance tsc "npx tsc --noEmit"
 run finance test "npm run test:run"
 run finance build "npm run build"
else
 run fitness ci "npm ci --no-audit --no-fund"
 run fitness prisma "npx prisma generate"
 run fitness lint "npm run lint"
 run fitness typecheck "npm run typecheck"
 run fitness test "npm run test"
 run fitness build "npm run build"
fi
