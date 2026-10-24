import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function summarizeSarif(sarif){
  if(!Array.isArray(sarif.runs)||!sarif.runs.length)throw Error('CodeQL SARIF runs missing');
  let results=0,criticalHigh=0;
  for(const run of sarif.runs){
    if(!Array.isArray(run.results))throw Error('CodeQL results missing');
    const driver=run.tool?.driver,extensions=run.tool?.extensions||[];
    for(const result of run.results){
      const location=result.rule,componentRef=location?.toolComponent;
      const component=componentRef
        ? (componentRef.index!==undefined?extensions[componentRef.index]
          : [driver,...extensions].find(c=>c&&(componentRef.guid?c.guid===componentRef.guid:c.name===componentRef.name)))
        : driver;
      const id=result.ruleId||location?.id;
      const indexed=component?.rules?.[location?.index??result.ruleIndex];
      const matches=[driver,...extensions].flatMap(c=>c?.rules||[]).filter(rule=>id&&rule.id===id);
      const rule=indexed&&(!id||indexed.id===id)?indexed:matches.length===1?matches[0]:undefined;
      if(!rule)throw Error('CodeQL result rule missing');
      results++;
      if(Number(rule.properties?.['security-severity']||0)>=7)criticalHigh++;
    }
  }
  return {results,criticalHigh};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const directory=process.argv[2];if(!directory)throw Error('Pass CodeQL output directory');
  const files=readdirSync(directory).filter(name=>name.endsWith('.sarif'));
  if(!files.length)throw Error('No CodeQL SARIF produced');
  for(const file of files){
    const summary=summarizeSarif(JSON.parse(readFileSync(join(directory,file),'utf8')));
    console.log(JSON.stringify({file,...summary}));
    if(summary.criticalHigh)process.exitCode=1;
  }
}
