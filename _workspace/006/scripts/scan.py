import re,subprocess,sys,collections
repo=sys.argv[1]
P={
 'telegram_bot_token':r'\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b',
 'aws_key':r'\bAKIA[0-9A-Z]{16}\b',
 'anthropic_key':r'sk-ant-[A-Za-z0-9_-]{20,}',
 'openai_key':r'\bsk-(proj-)?[A-Za-z0-9]{20,}',
 'github_token':r'\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}',
 'slack':r'xox[abpr]-[A-Za-z0-9-]{10,}',
 'private_key':r'-----BEGIN [A-Z ]*PRIVATE KEY-----',
 'google_api':r'AIza[0-9A-Za-z_-]{35}',
 'jwt':r'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
 'db_url_with_pw':r'postgres(ql)?://[^:\s/@\'"]+:[^@\s\'"<>$]{3,}@',
 'discord_webhook':r'discord(app)?\.com/api/webhooks/\d+/[A-Za-z0-9_-]{20,}',
 'generic_assign':r'(?i)\b[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|API_KEY|APIKEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*[\'"]?[A-Za-z0-9+/_\-]{16,}',
}
R={k:re.compile(v) for k,v in P.items()}
out=subprocess.run(['git','-C',repo,'log','--all','-p','--no-color','--format=COMMIT %H','-U0','--no-ext-diff','--text'],capture_output=True,text=True,errors='replace').stdout
hits=collections.OrderedDict(); c=None; f=None
for line in out.splitlines():
  if line.startswith('COMMIT '): c=line[7:15]; continue
  if line.startswith('+++ '): f=line[6:] if line.startswith('+++ b/') else line[4:]; continue
  if line.startswith('+') and not line.startswith('+++'):
    for k,r in R.items():
      m=r.search(line)
      if m:
        val=m.group(0)
        # placeholder heuristic, value never printed
        ph=bool(re.search(r'(?i)x{4,}|your|example|changeme|placeholder|dummy|test|fake|<|\.\.\.|process\.env|0{6,}|1234567|abc',val+line))
        hits.setdefault((k,f,ph),[]).append(c)
for (k,f,ph),cs in hits.items():
  print(f"{k}\t{'placeholder?' if ph else 'REVIEW'}\t{f}\tcommits={len(set(cs))}\tfirst={cs[-1]}")
