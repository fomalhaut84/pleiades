#!/bin/bash
# $1 = repo root, $2 = label
root="$1"; label="$2"
inv=$(mktemp)
[ -d "$root/.claude/agents" ] && ls "$root/.claude/agents" | sed 's/\.md$//' | sed 's/^/agent:/' >> $inv
[ -d "$root/.claude/skills" ] && ls -d "$root/.claude/skills"/*/ 2>/dev/null | xargs -n1 basename | sed 's/^/skill:/' >> $inv
[ -d "$root/.claude/rules" ] && ls "$root/.claude/rules" | sed 's/\.md$//' | sed 's/^/rule:/' >> $inv
echo "### INVENTORY $label"
cat $inv
echo "### REFS $label"
files=$(find "$root/.claude" -name '*.md' -type f 2>/dev/null; [ -f "$root/CLAUDE.md" ] && echo "$root/CLAUDE.md")
while read -r e; do
  kind=${e%%:*}; name=${e#*:}
  case $kind in
    rule) pat="rules/${name}\.md|\`${name}\.md\`" ;;
    *)    pat="\b${name}\b" ;;
  esac
  for f in $files; do
    grep -nE --binary-files=text "$pat" "$f" 2>/dev/null | while IFS= read -r line; do
      ln=${line%%:*}
      src=${f#$root/}
      # skip self-definition (the file that IS the target)
      case "$src" in
        ".claude/agents/${name}.md"|".claude/skills/${name}/SKILL.md"|".claude/rules/${name}.md") continue ;;
      esac
      echo "$src|$ln|$kind:$name"
    done
  done
done < $inv | sort -t'|' -k1,1 -k2,2n | uniq
rm -f $inv
