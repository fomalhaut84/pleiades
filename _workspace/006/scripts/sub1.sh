set -e
M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
cd $M; rm -rf plx; git clone -q --branch dev /Users/sagan/workspace/pleiades plx; cd plx; git remote remove origin
git config user.email x@x; git config user.name scratch
git --version; git subtree --help >/dev/null 2>&1 && echo subtree-ok
echo "base: $(git rev-parse --short HEAD) commits $(git rev-list --count HEAD)"; git count-objects -vH | grep size-pack
git ls-tree --name-only HEAD | tr '\n' ' '; echo
git remote add fin $M/myFinance.git; git remote add fit $M/myFitness.git
git fetch -q fin dev; git fetch -q fit dev
# add at one commit before dev tip (first-parent) to test pull later
FIN1=$(git rev-parse fin/dev~1); FIT1=$(git rev-parse fit/dev~1)
echo "fin dev~1 $FIN1 fit dev~1 $FIT1"
/usr/bin/time -p git subtree add -q --prefix=apps/finance fin $FIN1 2>&1 | tail -3
/usr/bin/time -p git subtree add -q --prefix=apps/fitness fit $FIT1 2>&1 | tail -3
echo "after add: commits $(git rev-list --count HEAD)"; git gc -q; git count-objects -vH | grep size-pack
git ls-tree --name-only HEAD | tr '\n' ' '; echo
git log --oneline -3
/usr/bin/time -p git subtree pull -q --prefix=apps/finance fin dev 2>&1 | tail -4
/usr/bin/time -p git subtree pull -q --prefix=apps/fitness fit dev 2>&1 | tail -4
git log --oneline -4
echo "fin diff vs dev tip: $(git diff --stat fin/dev HEAD:apps/finance 2>/dev/null | tail -1)"
for p in finance fitness; do r=$([ $p = finance ] && echo fin || echo fit); echo "$p tree==dev? $( [ "$(git rev-parse HEAD:apps/$p)" = "$(git rev-parse $r/dev^{tree})" ] && echo YES || echo NO)"; done
echo "commits $(git rev-list --count HEAD)"; git gc -q; git count-objects -vH | grep size-pack
