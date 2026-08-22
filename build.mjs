import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root=process.cwd(), dist=path.join(root,'dist');
await rm(dist,{recursive:true,force:true});
await mkdir(path.join(dist,'assets'),{recursive:true});

const result=await build({
  entryPoints:['js/app.js'],
  bundle:true,minify:true,target:['es2020'],format:'esm',
  outdir:path.join(dist,'assets'),entryNames:'app-[hash]',metafile:true
});
let appAsset='';
for(const [out,meta] of Object.entries(result.metafile.outputs)){
  if(meta.entryPoint) appAsset='/'+path.relative(dist,out).replaceAll('\\','/');
}
const css=await readFile(path.join(root,'css/styles.css'),'utf8');
const min=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').replace(/\s*([{}:;,>])\s*/g,'$1').trim();
const hash=createHash('sha256').update(min).digest('hex').slice(0,8);
const cssAsset=`/assets/styles-${hash}.css`;
await writeFile(path.join(dist,cssAsset.slice(1)),min);

for(const page of ['index.html','privacy.html']){
  let html=await readFile(path.join(root,page),'utf8');
  html=html.replace('href="css/styles.css"',`href="${cssAsset}"`)
           .replace('<script type="module" src="js/app.js"></script>',`<script type="module" src="${appAsset}"></script>`);
  await writeFile(path.join(dist,page),html);
}
await cp(path.join(root,'_headers'),path.join(dist,'_headers'));
await cp(path.join(root,'manifest.webmanifest'),path.join(dist,'manifest.webmanifest'));
await cp(path.join(root,'sw.js'),path.join(dist,'sw.js'));
await writeFile(path.join(dist,'version.json'),JSON.stringify({name:'Nerdspace Labs Dashboard',version:'1.21.8'},null,2));
console.log('Built Nerdspace Labs Dashboard Alpha 1.21.8 into dist/');
