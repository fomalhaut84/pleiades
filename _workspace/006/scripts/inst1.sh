M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
mkdir -p $M/solo; cd $M/solo
for r in myFinance myFitness; do rm -rf $r; mkdir $r; git -C $M/$r.git archive dev | tar -x -C $r
 cd $r; s=$(date +%s); npm ci --ignore-scripts --no-audit --no-fund --loglevel=error >/dev/null 2>$M/solo/$r.err; e=$?; t=$(( $(date +%s)-s ))
 echo "$r npm ci exit=$e ${t}s node_modules=$(du -sh node_modules | cut -f1) pkgs=$(find node_modules -name package.json -maxdepth 3 -path '*node_modules/*/package.json' | wc -l)"; tail -2 $M/solo/$r.err; cd ..
done
