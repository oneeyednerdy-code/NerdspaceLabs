const KEY='nerdspace-workspace-v1';
const defaults={goal:'raid',sort:'recommended',pageSize:12,weights:{audience:20,games:25,tags:15,genre:10,schedule:25,language:5},presets:[]};
export function getWorkspace(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}}
export function saveWorkspace(patch){const next={...getWorkspace(),...patch};localStorage.setItem(KEY,JSON.stringify(next));return next}
export function savePreset(name,filters,weights){const w=getWorkspace(),preset={id:String(Date.now()),name:String(name||'Preset').slice(0,40),filters,weights};w.presets=[preset,...(w.presets||[]).filter(x=>x.name!==preset.name)].slice(0,12);return saveWorkspace(w)}
export function normalizeWeights(weights){const e=Object.entries(weights).map(([k,v])=>[k,Math.max(0,Number(v)||0)]),sum=e.reduce((a,[,v])=>a+v,0)||1;return Object.fromEntries(e.map(([k,v])=>[k,v/sum]))}
