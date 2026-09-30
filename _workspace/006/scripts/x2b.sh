SP=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad; M=$SP/mono; FR=$SP/fr/bin/git-filter-repo
cd $M; rm -rf frf_*
CB='import re
return re.sub(rb"(?<![\w/])#(\d+)", rb"fin#\1", message)'
for d in frf_a frf_b; do git clone -q --no-local --no-tags --single-branch --branch dev $M/myFinance.git $d; (cd $d; git remote remove origin; $FR --quiet --force --to-subdirectory-filter apps/finance --message-callback "$CB" >/dev/null 2>&1; echo "$d rc=$? tip=$(git rev-parse --short HEAD) commits=$(git rev-list --count HEAD)"); done
echo "fin determinism: $( [ $(git -C frf_a rev-parse HEAD) = $(git -C frf_b rev-parse HEAD) ] && echo YES || echo NO) tree==dev: $( [ $(git -C frf_a rev-parse HEAD:apps/finance) = $(git -C $M/myFinance.git rev-parse dev^{tree}) ] && echo YES || echo NO)"
echo "remaining close-keyword refs in rewritten fin+fit: $(for d in frf_a fr_a; do git -C $d log --format=%B; done | grep -aiEo '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[: ]+([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#[0-9]+' | wc -l)"
for d in frf_a fr_a; do git -C $d log --format=%B | grep -aiEo '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[: ]+([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)?#[0-9]+'; done
cd fr_mono; git remote add finrw ../frf_a; git fetch -q finrw; git merge -q --allow-unrelated-histories --no-edit finrw/dev; echo "mono commits=$(git rev-list --count HEAD) root: $(git ls-tree --name-only HEAD | tr '\n' ' ')"; git remote remove finrw; git remote remove fitrw; git gc -q --prune=now; git count-objects -vH | grep size-pack
echo "fin path log: $(git log --oneline -- apps/finance/package.json | wc -l) blame: $(git blame -s apps/finance/package.json | cut -c1-8 | sort -u | wc -l)"
