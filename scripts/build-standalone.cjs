'use strict';
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'..'),dist=path.join(project,'dist');
function localFile(name){const file=path.resolve(dist,name);if(!file.startsWith(dist+path.sep))throw Error('Resource must be inside dist: '+name);return file;}
function build(output=path.join(project,'ASTRIS.html')){
  let html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
  html=html.replace('href="icon.svg"',()=> 'href="data:image/svg+xml,'+encodeURIComponent(fs.readFileSync(localFile('icon.svg'),'utf8'))+'"');
  html=html.replace(/<link rel="stylesheet" href="([^"]+)">/g,(_,name)=>'<style>'+fs.readFileSync(localFile(name),'utf8')+'</style>');
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(_,name)=>{
    let code=fs.readFileSync(localFile(name),'utf8');
    if(name==='portraits.js')code=code.replace(/assets\/a[1-6]\.jpg/g,asset=>'data:image/jpeg;base64,'+fs.readFileSync(localFile(asset)).toString('base64'));
    return '<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>';
  });
  const file=path.resolve(output);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,html);
  require('./verify-standalone.cjs').verify(file);
  return file;
}
if(require.main===module)console.log('Built '+build(process.argv[2]));
module.exports={build};
