'use strict';
const fs=require('node:fs'),path=require('node:path'),B=require('../dist/benchmark.js');
B.run((n,total)=>console.log('Control series '+n+'/'+total)).then(report=>{
  const file=path.resolve(__dirname,'../CONTROL-RESULTS.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  console.table(report.aggregate.map(({horizon,n,mae,rmse,naiveRmse,coverage})=>({horizon,n,mae,rmse,naiveRmse,coverage})));
  console.log('Saved '+file);
}).catch(error=>{console.error(error.message);process.exitCode=1;});
