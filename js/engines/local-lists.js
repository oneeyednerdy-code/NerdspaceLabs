const KEY='nerdspace-creator-lists-v1';
const EMPTY={favorites:[],collabs:[],raidLater:[],notes:{}};
function read(){try{return {...EMPTY,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...EMPTY}}}
function write(v){localStorage.setItem(KEY,JSON.stringify(v));return v}
export function getLists(){return read()}
export function toggleList(list,id){const d=read(),a=new Set(d[list]||[]);a.has(id)?a.delete(id):a.add(id);d[list]=[...a];return write(d)}
export function setNote(id,note){const d=read();d.notes[id]=String(note||'').slice(0,1000);return write(d)}
export function clearLists(){localStorage.removeItem(KEY)}
