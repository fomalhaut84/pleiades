SP=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad; M=$SP/mono; FR=$SP/fr/bin/git-filter-repo
cd $M; rm -rf fr_*
CB='import re
return re.sub(rb"(?<![\w/])#(\d+)", rb"fit#\1", message)'
rw() { # $1 dir $2 back-count
  git clone -q --no-local --no-tags --single-branch --branch dev $M/myFitness.git $1
  ( cd $1; [ "$2" != 0 ] && git reset -q --hard HEAD~$2; git remote remove origin
    s=$(date +%s); $FR --quiet --force --to-subdirectory-filter apps/fitness --message-callback "$CB" >/dev/null 2>&1; echo "$1 rc=$? $(( $(date +%s)-s ))s tip=$(git rev-parse --short HEAD) commits=$(git rev-list --count HEAD)" )
}
rw fr_a 0; rw fr_b 0; rw fr_old 5
echo "determinism a==b: $( [ $(git -C fr_a rev-parse HEAD) = $(git -C fr_b rev-parse HEAD) ] && echo YES || echo NO)"
echo "old tip ancestor of new? $(git -C fr_a merge-base --is-ancestor $(git -C fr_old rev-parse HEAD) HEAD 2>/dev/null; git -C fr_a cat-file -e $(git -C fr_old rev-parse HEAD) 2>/dev/null && git -C fr_a merge-base --is-ancestor $(git -C fr_old rev-parse HEAD) HEAD && echo YES || echo NO)"
echo "remaining unqualified #N in rewritten msgs: $(git -C fr_a log --format=%B | grep -aoE '(^|[^[:alnum:]/])#[0-9]+' | wc -l)  fit#N: $(git -C fr_a log --format=%B | grep -aoE 'fit#[0-9]+' | wc -l)"
echo "tree check apps/fitness == dev tree: $( [ $(git -C fr_a rev-parse HEAD:apps/fitness) = $(git -C $M/myFitness.git rev-parse dev^{tree}) ] && echo YES || echo NO)"
echo "root entries: $(git -C fr_a ls-tree --name-only HEAD | tr '\n' ' ')"
# mono: pleiades + old rewrite merged, then new rewrite merged
rm -rf fr_mono; git clone -q --branch dev /Users/sagan/workspace/pleiades fr_mono; cd fr_mono; git remote remove origin; git config user.email x@x; git config user.name s
git remote add fitrw ../fr_old; git fetch -q fitrw
git merge -q --allow-unrelated-histories --no-edit fitrw/dev 2>&1 | tail -2; echo "after first merge commits=$(git rev-list --count HEAD)"
git remote set-url fitrw ../fr_a; git fetch -q fitrw
git merge --no-edit fitrw/dev 2>&1 | tail -2; echo "after incremental merge commits=$(git rev-list --count HEAD) parents=$(git log -1 --format=%P | wc -w)"
echo "path log apps/fitness/package.json: $(git log --oneline -- apps/fitness/package.json | wc -l) (service: $(git -C $M/myFitness.git log --oneline dev -- package.json | wc -l))"
echo "blame commits: $(git blame -s apps/fitness/package.json | cut -c1-8 | sort -u | wc -l) (service: $(git -C $M/myFitness.git blame -s dev -- package.json | cut -c1-8 | sort -u | wc -l))"
git gc -q --prune=now; git count-objects -vH | grep size-pack
