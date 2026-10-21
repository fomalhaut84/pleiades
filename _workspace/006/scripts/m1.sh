S=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono; cd $S
for r in myFinance myFitness; do echo "== $r"; g() { git -C $S/$r.git "$@"; }
 g rev-parse --short dev integration/pleiades main
 echo "commits dev: $(g rev-list --count dev)  all: $(g rev-list --count --all)  branches: $(g branch | wc -l)  tags: $(g tag | wc -l)"
 echo "dev not in int: $(g rev-list --count integration/pleiades..dev)  int not in dev: $(g rev-list --count dev..integration/pleiades)  main not in dev: $(g rev-list --count dev..main)"
 echo "first: $(g log --reverse --format='%ad' --date=short dev | head -1)  last: $(g log -1 --format='%ad' --date=short dev)"
 echo "author emails: $(g log --format='%ae' dev | sort | uniq -c | tr '\n' ';')"
 g count-objects -vH | tr '\n' ' '; echo
 echo "dev-reachable objects: $(g rev-list --objects dev | wc -l)"
 echo "dev tree files: $(g ls-tree -r dev --name-only | wc -l)"
done
