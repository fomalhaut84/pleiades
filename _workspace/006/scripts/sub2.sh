M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
cd $M/plx
echo "--- add commit body"; git log -1 --format=%B 0ecbca2
echo "--- path history: pleiades apps/finance/package.json vs fin dev package.json"
echo "mono log -- path: $(git log --oneline -- apps/finance/package.json | wc -l)  | fin dev log -- package.json: $(git -C $M/myFinance.git log --oneline dev -- package.json | wc -l)"
echo "mono log --follow: $(git log --oneline --follow -- apps/finance/package.json | wc -l)"
echo "blame distinct commits mono: $(git blame --line-porcelain apps/finance/package.json | grep -a '^author-time' | wc -l) lines, $(git blame -s apps/finance/package.json | cut -c1-8 | sort -u | wc -l) commits; fin: $(git -C $M/myFinance.git blame -s dev -- package.json | cut -c1-8 | sort -u | wc -l) commits"
echo "--- conflict test: modify apps/fitness file locally then pull again after simulated new dev commit"
