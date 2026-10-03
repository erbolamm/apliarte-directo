import { build } from 'esbuild';
import postcss from 'postcss';
import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const base=path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(base,'dist'),{recursive:true});
await build({entryPoints:[path.join(base,'src/main.tsx')],bundle:true,format:'iife',platform:'browser',target:'es2020',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},outfile:path.join(base,'dist/office-3d.js'),logLevel:'info'});
const original=await readFile(path.join(base,'src/scene.css'),'utf8');
const tree=postcss.parse(original);
tree.walkRules(rule=>{
 if(rule.parent?.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;
 rule.selectors=rule.selectors.map(selector=>selector.trim()===':root'?'.real-office':selector.trim()==='.dark'?'html[data-theme="dark"] .real-office':`.real-office ${selector}`);
});
const css=tree.toString()+'\n'+await readFile(path.join(base,'src/interface.css'),'utf8');
await writeFile(path.join(base,'dist/office-3d.css'),css);
const repoPublic = path.resolve(base, '../public');
try {
  await copyFile(path.join(base, 'dist/office-3d.js'), path.join(repoPublic, 'office-3d.js'));
  // public/office-3d.css is hand-maintained (crystal walls, damas board):
  // never overwrite it from dist. Port new styles by hand when needed.
} catch (e) {
  console.warn('Could not copy to public:', e);
}
