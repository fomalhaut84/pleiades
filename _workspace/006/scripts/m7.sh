M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
for r in myFinance myFitness; do g() { git -C $M/$r.git "$@"; }; echo "== $r  diff dev → integration/pleiades (tree)"
 g diff --stat dev integration/pleiades | tail -1
 g diff --name-status dev integration/pleiades | awk '{print $1, $2}' | sed 's/^/  /'
 echo "-- commits int not in dev:"; g log --oneline dev..integration/pleiades | sed 's/^/  /'
 echo "-- fd8b7c5 here? $(g cat-file -t fd8b7c5 2>/dev/null)"; g branch --contains fd8b7c5 2>/dev/null | head -3
 g branch --list 'integration/*' | sed 's/^/  br /'
done
