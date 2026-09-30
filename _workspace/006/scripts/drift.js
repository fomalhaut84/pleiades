const SP=process.argv[2], M=SP+"/mono";
const ws=require(M+"/ws/package-lock.json").packages;
for (const [app,lk,pk] of [["apps/finance","fin.lock.json","fin.pkg.json"],["apps/fitness","fit.lock.json","fit.pkg.json"]]){
  const svc=require(SP+"/"+lk).packages; const pkg=require(SP+"/"+pk);
  let same=0,diff=0,missing=0; const dl=[];
  for (const [k,v] of Object.entries(svc)){ if(!k.startsWith("node_modules/")||k.split("node_modules/").length>2) continue;
    const name=k.slice(13); const w=ws[app+"/node_modules/"+name]||ws["node_modules/"+name];
    if(!w){missing++;continue} if(w.version===v.version) same++; else {diff++; dl.push(name+" "+v.version+"→"+w.version)} }
  const direct=Object.keys({...pkg.dependencies,...pkg.devDependencies});
  const dd=dl.filter(x=>direct.includes(x.split(" ")[0]));
  const ov=Object.keys(pkg.overrides||{}).map(o=>o.replace(/@\d.*$/,""));
  const od=dl.filter(x=>ov.includes(x.split(" ")[0]));
  console.log(app,"top-level same",same,"diff",diff,"missing",missing,"| direct-dep diffs:",dd.length,dd.join(", "),"| override-target diffs:",od.join(", "));
}
