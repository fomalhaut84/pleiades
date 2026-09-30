M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
cd $M; rm -rf ws; git clone -q $M/plx ws; cd ws; git remote remove origin
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json"));p.workspaces=["apps/*","packages/*"];fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
rm -f package-lock.json
s=$(date +%s); npm install --ignore-scripts --no-audit --no-fund > $M/ws.out 2>&1; e=$?; t=$(( $(date +%s)-s ))
echo "ws npm install exit=$e ${t}s"; grep -aiE 'warn|ERR' $M/ws.out | sort | uniq -c | sort -rn | head -15
[ -d node_modules ] && echo "root node_modules=$(du -sh node_modules | cut -f1)"
for a in apps/finance apps/fitness packages/notify; do [ -d $a/node_modules ] && echo "$a/node_modules=$(du -sh $a/node_modules | cut -f1) top=$(ls $a/node_modules | tr '\n' ' ' | cut -c1-300)"; done
echo "lock pkgs: $(node -e 'console.log(Object.keys(require("./package-lock.json").packages).length)') lock bytes: $(wc -c < package-lock.json)"
