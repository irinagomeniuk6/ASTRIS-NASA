'use strict';
// Small ZIP writer using only Node built-ins; no system archiver is required.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const project=path.resolve(__dirname,'..');
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let n=0xffffffff;for(const byte of data)n=crcTable[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function filesUnder(relative){const directory=path.join(project,relative);return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{const name=path.posix.join(relative,e.name);if(e.isSymbolicLink())throw Error('Symlinks are not packaged: '+name);return e.isDirectory()?filesUnder(name):[name];});}
function zip(entries){
  const chunks=[],central=[];let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name,'utf8'),raw=entry.data,compressed=zlib.deflateRawSync(raw),crc=crc32(raw),head=Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(8,8);head.writeUInt16LE(33,12);head.writeUInt32LE(crc,14);head.writeUInt32LE(compressed.length,18);head.writeUInt32LE(raw.length,22);head.writeUInt16LE(name.length,26);
    chunks.push(head,name,compressed);
    const item=Buffer.alloc(46);item.writeUInt32LE(0x02014b50,0);item.writeUInt16LE(20,4);item.writeUInt16LE(20,6);item.writeUInt16LE(0x800,8);item.writeUInt16LE(8,10);item.writeUInt16LE(33,14);item.writeUInt32LE(crc,16);item.writeUInt32LE(compressed.length,20);item.writeUInt32LE(raw.length,24);item.writeUInt16LE(name.length,28);item.writeUInt32LE(offset,42);central.push(item,name);offset+=head.length+name.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,directory,end]);
}
function pack(output=path.join(project,'ASTRIS-project.zip')){
  require('./build-standalone.cjs').build();
  const docs=fs.readdirSync(project).filter(name=>name.endsWith('.md')).sort();
  const names=[...filesUnder('dist'),...filesUnder('tests'),...filesUnder('scripts'),...docs,'package.json','server.cjs','cloud-store.cjs','supabase-schema.sql','.env.example','Dockerfile','render.yaml','.dockerignore','.gitignore','CONTROL-RESULTS.json','ASTRIS.html',...(fs.existsSync(path.join(project,'TEST-RESULTS.txt'))?['TEST-RESULTS.txt']:[])];
  const file=path.resolve(output);if(names.some(name=>path.resolve(project,name)===file))throw Error('Archive cannot overwrite a packaged source file.');
  const entries=names.map(name=>({name,data:fs.readFileSync(path.join(project,name))}));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,zip(entries));
  console.log('Packaged '+entries.length+' files: '+file);return file;
}
if(require.main===module)pack(process.argv[2]);
module.exports={pack,crc32};
