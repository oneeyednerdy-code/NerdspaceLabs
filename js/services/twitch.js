import { APP_CONFIG } from '../../config.js';
import { getToken } from '../auth.js';

export async function helix(path, params = {}) {
  const token = getToken();
  if (!token) throw new Error('Not connected to Twitch.');
  const url = new URL(APP_CONFIG.apiBaseUrl + path);
  for (const [k,v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const r = await fetch(url, {headers:{Authorization:`Bearer ${token}`}});
  if (!r.ok) {
    let message = `Twitch request failed (${r.status}).`;
    try { const b = await r.json(); message = b.message || b.error || message; } catch {}
    const error = new Error(message); error.status=r.status; throw error;
  }
  return r.json();
}

export async function paginate(path, params={}, {maxPages=10,maxItems=1000,dataPath='data'}={}) {
  const items=[]; let after=''; let pages=0; let lastBody=null;
  do {
    const body=await helix(path,{...params,after:after||undefined}); lastBody=body; pages++;
    const page=dataPath==='segments' ? (body.data?.segments||[]) : (body.data||[]);
    items.push(...page);
    after=body.pagination?.cursor||body.data?.pagination?.cursor||'';
  } while(after && pages<maxPages && items.length<maxItems);
  return {items:items.slice(0,maxItems),pages,lastBody,truncated:Boolean(after)};
}
export async function getUser(id) { const b=await helix('/users',id?{id}:{}); return b.data?.[0]||null; }
export async function getUserByLogin(login) { const b=await helix('/users',{login:String(login||'').trim().toLowerCase()}); return b.data?.[0]||null; }
export async function getUsers(ids=[]) { const u=[...new Set(ids.filter(Boolean))]; if(!u.length)return[]; const out=[]; for(let i=0;i<u.length;i+=100){const b=await helix('/users',{id:u.slice(i,i+100)});out.push(...(b.data||[]));} return out; }
export async function getChannel(id) { const b=await helix('/channels',{broadcaster_id:id});return b.data?.[0]||null; }
export async function getChannels(ids=[]) { const u=[...new Set(ids.filter(Boolean))]; const out=[]; for(let i=0;i<u.length;i+=100){const b=await helix('/channels',{broadcaster_id:u.slice(i,i+100)});out.push(...(b.data||[]));} return out; }
export async function getStream(id) { const b=await helix('/streams',{user_id:id});return b.data?.[0]||null; }
export async function getStreams(ids=[]) { const u=[...new Set(ids.filter(Boolean))];const out=[];for(let i=0;i<u.length;i+=100){const b=await helix('/streams',{user_id:u.slice(i,i+100)});out.push(...(b.data||[]));}return out; }
export async function searchChannels(query,max=40) { if(!String(query||'').trim())return[];return (await paginate('/search/channels',{query:String(query).trim(),first:'20'},{maxPages:Math.ceil(max/20),maxItems:max})).items; }
export async function getRecentVideos(id,max=100) { return (await paginate('/videos',{user_id:id,type:'archive',first:'100'},{maxPages:Math.ceil(max/100),maxItems:max})).items; }
export async function getGames(ids) { const u=[...new Set(ids.filter(Boolean))];const out=[];for(let i=0;i<u.length;i+=100){const b=await helix('/games',{id:u.slice(i,i+100)});out.push(...(b.data||[]));}return out; }
export async function getFollowedStreams(userId,max=500) { return (await paginate('/streams/followed',{user_id:userId,first:'100'},{maxPages:Math.ceil(max/100),maxItems:max})).items; }
export async function getFollowedChannels(userId,max=1000) { return (await paginate('/channels/followed',{user_id:userId,first:'100'},{maxPages:Math.ceil(max/100),maxItems:max})).items; }
export async function getClips(id,max=100,days=90) { const end=new Date(),start=new Date(end.getTime()-days*86400000); return (await paginate('/clips',{broadcaster_id:id,first:'100',started_at:start.toISOString(),ended_at:end.toISOString()},{maxPages:Math.ceil(max/100),maxItems:max})).items; }
export async function getFollowerTotal(id) { try { const b=await helix('/channels/followers',{broadcaster_id:id,first:'1'}); return Number(b.total||0); } catch { return null; } }
export async function getSchedule(id,max=50) { try { return (await paginate('/schedule',{broadcaster_id:id,first:'25'},{maxPages:2,maxItems:max,dataPath:'segments'})).items; } catch { return []; } }
export async function getSchedules(ids=[],limit=24) { const out=new Map(); const list=[...new Set(ids.filter(Boolean))].slice(0,limit); let cursor=0; const workers=Array.from({length:Math.min(4,list.length)},async()=>{while(cursor<list.length){const id=list[cursor++];out.set(id,await getSchedule(id,25));}}); await Promise.all(workers); return out; }
