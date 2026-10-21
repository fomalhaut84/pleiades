M=/private/tmp/claude-501/-Users-sagan-workspace-pleiades/849b31ab-9cee-4f62-bd09-4d6e481e9df1/scratchpad/mono; P=/Users/sagan/workspace/pleiades; SP=$M/..
git -C $M/myFinance.git show dev:package.json > $SP/fin.pkg.json; git -C $M/myFitness.git show dev:package.json > $SP/fit.pkg.json
git -C $M/myFinance.git show dev:package-lock.json > $SP/fin.lock.json; git -C $M/myFitness.git show dev:package-lock.json > $SP/fit.lock.json
git -C $P show dev:packages/notify/package.json > $SP/notify.pkg.json; git -C $P show dev:package.json > $SP/root.pkg.json; git -C $P show dev:packages/notify/package-lock.json > $SP/notify.lock.json 2>/dev/null; git -C $P show dev:package-lock.json > $SP/root.lock.json
node -e '
const fs=require("fs");const sp=process.argv[1];
const L=n=>JSON.parse(fs.readFileSync(sp+"/"+n));
const S={fin:[L("fin.pkg.json"),L("fin.lock.json")],fit:[L("fit.pkg.json"),L("fit.lock.json")],notify:[L("notify.pkg.json"),fs.existsSync(sp+"/notify.lock.json")&&fs.statSync(sp+"/notify.lock.json").size?L("notify.lock.json"):null],root:[L("root.pkg.json"),L("root.lock.json")]};
const keys=["next","react","react-dom","prisma","@prisma/client","@prisma/adapter-pg","typescript","vitest","grammy","node-cron","pino","eslint","eslint-config-next","tailwindcss","@types/node","@types/react","recharts","zod","@modelcontextprotocol/sdk","postcss","vite"];
for(const [k,[p,l]] of Object.entries(S)){console.log("##",k,"name=",p.name,"engines=",JSON.stringify(p.engines||null),"workspaces=",JSON.stringify(p.workspaces||null),"overrides=",JSON.stringify(p.overrides||null),"deps=",Object.keys(p.dependencies||{}).length,"devDeps=",Object.keys(p.devDependencies||{}).length,"lockpkgs=",l?Object.keys(l.packages).length-1:"-");}
console.log("| pkg | fin spec→lock | fit spec→lock | notify | ");
for(const k of keys){const row=[k];for(const n of ["fin","fit","notify"]){const [p,l]=S[n];const spec=(p.dependencies||{})[k]||(p.devDependencies||{})[k]||(p.peerDependencies||{})[k];const lk=l&&l.packages["node_modules/"+k]?l.packages["node_modules/"+k].version:"";row.push(spec?spec+(lk?"→"+lk:""):(lk?"(transitive "+lk+")":"-"));}console.log("| "+row.join(" | ")+" |");}
' $SP
