SP=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad
for r in myFinance myFitness; do echo "== $r"; F=$SP/$r.added
 git -C $SP/mono/$r.git log --all -p --text -U0 --format= | /usr/bin/grep -a -E '^\+' > $F; wc -l < $F
 echo "chat_id numeric assigns:"; /usr/bin/grep -a -iE '(CHAT_ID|chatId|chat_id)S?[^=:]*[=:] *["'"'"']?-?[0-9]{6,}' $F | sed -E 's/[0-9]{6,}/<N>/g' | sort -u | head -5
 echo "emails:"; /usr/bin/grep -a -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[a-z]{2,}' $F | /usr/bin/grep -viE 'noreply|example|localhost' | sed -E 's/^[^@]*@/***@/' | sort | uniq -c | sort -rn | head -8
done
