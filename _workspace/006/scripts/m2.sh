S=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
for r in myFinance myFitness; do echo "== $r"; g() { git -C $S/$r.git "$@"; }
 for ref in dev integration/pleiades main; do echo "$ref $(g rev-parse --short $ref)"; done
 echo "dev-only pack bytes: $(g rev-list --objects dev | g pack-objects --stdout -q 2>/dev/null | wc -c)"
 echo "dev-only blobs uncompressed total: $(g rev-list --objects dev | g cat-file --batch-check='%(objecttype) %(objectsize)' | awk '$1=="blob"{s+=$2}END{print s}')"
 echo "-- top10 blobs (dev history)"
 g rev-list --objects dev | g cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | awk '$1=="blob"' | sort -k3 -n -r | awk '!seen[$4]++' | head -10 | awk '{printf "%s %.1fKB %s\n",substr($2,1,8),$3/1024,$4}'
 echo "-- dev HEAD tree size: $(g ls-tree -r -l dev | awk '{s+=$4}END{print s}')"
done
S2=/Users/sagan/workspace/pleiades; echo "== pleiades"; git -C $S2 count-objects -vH | tr '\n' ' '; echo; git -C $S2 rev-list --count dev
