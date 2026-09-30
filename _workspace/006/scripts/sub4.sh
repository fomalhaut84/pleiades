M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
cd $M; rm -rf plsq; git clone -q --branch dev /Users/sagan/workspace/pleiades plsq; cd plsq; git remote remove origin; git config user.email x@x; git config user.name scratch
git remote add fin $M/myFinance.git; git remote add fit $M/myFitness.git; git fetch -q fin dev; git fetch -q fit dev
git subtree add -q --squash --prefix=apps/finance fin $(git rev-parse fin/dev~1)
git subtree add -q --squash --prefix=apps/fitness fit $(git rev-parse fit/dev~1)
git subtree pull -q --squash --prefix=apps/finance fin dev -m "sync fin"
git subtree pull -q --squash --prefix=apps/fitness fit dev -m "sync fit"
echo "squash commits $(git rev-list --count HEAD)"; git log --oneline -6
git gc -q --prune=now; git count-objects -vH | grep size-pack
echo "reachable fin commits in squash repo: $(git rev-list HEAD | git -C . cat-file --batch-check | wc -l)"
for p in finance fitness; do r=$([ $p = finance ] && echo fin || echo fit); echo "$p tree==dev? $( [ "$(git rev-parse HEAD:apps/$p)" = "$(git rev-parse $r/dev^{tree})" ] && echo YES || echo NO)"; done
# after dropping remotes (true published size)
git remote remove fin; git remote remove fit; git gc -q --prune=now; git count-objects -vH | grep size-pack
cd $M/plx; git remote remove fin; git remote remove fit; git remote remove fitsim 2>/dev/null; git reset -q --hard HEAD~0; git reflog expire --expire=now --all; git gc -q --prune=now; echo "full-history repo (incl sim commits)"; git count-objects -vH | grep size-pack
