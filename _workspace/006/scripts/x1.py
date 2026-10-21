import re,subprocess,collections
S="/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono"
OPEN={97,96,95,82,66,48,17,11}
KW=re.compile(r'\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b[:\s]+((?:[\w.-]+/[\w.-]+)?#(\d+))',re.I)
QUAL=re.compile(r'\b([\w.-]+/[\w.-]+)#(\d+)')
PLAIN=re.compile(r'(?<![\w/])#(\d+)')
for r in ["myFinance","myFitness"]:
  out=subprocess.run(["git","-C",f"{S}/{r}.git","log","dev","--format=%H%x00%B%x01"],capture_output=True,text=True).stdout
  commits=[c for c in out.split("\x01") if c.strip()]
  kw_all=0;kw_unq=0;kw_open=collections.Counter();qual=collections.Counter();qual_commits=set();plain_open=collections.Counter();kwc=set()
  for c in commits:
    h,_,msg=c.strip().partition("\x00")
    for m in KW.finditer(msg):
      kw_all+=1; kwc.add(h)
      ref=m.group(2)
      if "/" not in ref:
        kw_unq+=1
        if int(m.group(3)) in OPEN: kw_open[int(m.group(3))]+=1
    for m in QUAL.finditer(msg):
      qual[m.group(1)]+=1; qual_commits.add(h)
    for m in PLAIN.finditer(msg):
      if int(m.group(1)) in OPEN: plain_open[int(m.group(1))]+=1
  print(f"== {r} commits={len(commits)} kw_refs={kw_all} (commits {len(kwc)}) unqualified_kw={kw_unq} kw_on_pleiades_open_numbers={dict(kw_open)}")
  print(f"   qualified refs by repo: {dict(qual)} (commits {len(qual_commits)})")
  print(f"   any #N equal to pleiades open numbers (unqualified): {dict(plain_open)}")
