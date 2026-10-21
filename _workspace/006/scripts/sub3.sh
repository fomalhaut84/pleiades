M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono
cd $M; rm -rf fitsim; git clone -q --branch dev $M/myFitness.git fitsim; cd fitsim; git remote remove origin; git config user.email x@x; git config user.name sim
# simulated upstream change: edit package.json description-free line: README first line
printf '\n<!-- upstream sim -->\n' >> README.md; git commit -qam "sim: upstream README"; echo "upstream sim $(git rev-parse --short HEAD)"
cd $M/plx
# pleiades-side change to same file & different file
printf '\n<!-- pleiades sim -->\n' >> apps/fitness/README.md; git commit -qam "pleiades: README edit"
git remote add fitsim $M/fitsim; git fetch -q fitsim dev
git subtree pull -q --prefix=apps/fitness fitsim dev 2>&1 | tail -3; echo "exit=$?"; git status --short | head
git merge --abort 2>/dev/null; git status --short | head -3
echo "--- non-conflicting case"
git reset -q --hard HEAD~0
