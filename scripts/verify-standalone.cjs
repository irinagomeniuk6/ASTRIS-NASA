'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..');
function verify(file=path.join(project,'ASTRIS.html')){
  const html=fs.readFileSync(file,'utf8'),index=fs.readFileSync(path.join(project,'dist/index.html'),'utf8');
  const expectedScripts=[...index.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,expectedScripts.length,'All source scripts must be embedded');
  scripts.forEach((s,i)=>new vm.Script(s[1],{filename:expectedScripts[i]}));
  assert.equal(/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/i.test(html),false,'No external script or stylesheet resources');
  assert.equal((html.match(/data:image\/jpeg;base64,/g)||[]).length,6,'Six embedded portraits');
  assert.ok(html.includes('ASTRIS_HUMAN_MESH'),'Embedded human model');
  console.log('Verified standalone: '+scripts.length+' scripts, six portraits, embedded styles and model.');
  return true;
}
if(require.main===module)verify(process.argv[2]);
module.exports={verify};
