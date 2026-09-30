M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono; SINCE=2026-07-02
fit() { git -C $M/myFitness.git "$@"; }; fin() { git -C $M/myFinance.git "$@"; }
echo "window: --since=$SINCE (90d before 2026-09-30)"
echo "fit dev commits total 90d: $(fit rev-list --count --since=$SINCE dev) (no-merges $(fit rev-list --count --no-merges --since=$SINCE dev))"
echo "fin dev commits total 90d: $(fin rev-list --count --since=$SINCE dev) (no-merges $(fin rev-list --count --no-merges --since=$SINCE dev))"
F3=$(fit diff --name-only integration/pleiades fd8b7c5 -- src | grep -v __tests__)
echo "--- 1a-3 (fit) files from fd8b7c5 diff (non-test): $(echo $F3 | wc -w)"
echo "src/bot/notifications/** : $(fit rev-list --count --no-merges --since=$SINCE dev -- src/bot/notifications) commits · files $(fit ls-tree -r --name-only dev -- src/bot/notifications | wc -l)"
for f in $F3; do fit cat-file -e dev:$f 2>/dev/null && echo "  $f $(fit rev-list --count --no-merges --since=$SINCE dev -- $f)" || echo "  $f (dev 에 없음)"; done
echo "  union(1a-3 non-test files): $(fit rev-list --count --no-merges --since=$SINCE dev -- $F3)"
F4=$(fin grep --text -lE 'sendHtml\(|getAllowedChatIds|bot\.api\.(sendMessage|sendDocument)' dev -- src | cut -d: -f2- | grep -v __tests__ | grep -v '^src/bot/utils/telegram.ts$')
echo "--- 1a-4 (fin) outbound callers (git grep sendHtml(|getAllowedChatIds|bot.api.send*, excl tests & telegram.ts): $(echo $F4 | wc -w) files"
echo "  union: $(fin rev-list --count --no-merges --since=$SINCE dev -- $F4 src/bot/utils/telegram.ts) commits"
for f in $F4 src/bot/utils/telegram.ts; do n=$(fin rev-list --count --no-merges --since=$SINCE dev -- $f); [ $n -gt 0 ] && echo "  $f $n"; done
echo "  files with 0 commits in 90d: $(for f in $F4; do [ $(fin rev-list --count --no-merges --since=$SINCE dev -- $f) = 0 ] && echo x; done | wc -l)"
