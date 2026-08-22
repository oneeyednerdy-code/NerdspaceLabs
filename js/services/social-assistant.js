import {storage} from '../storage.js';
const K='social-templates';
export const PLATFORMS={bluesky:{limit:300},x:{limit:280},threads:{limit:500},discord:{limit:2000},mastodon:{limit:500}};
export function templates(){return storage.get(K,{goingLive:'{message}\n🎮 {game}\n🔗 {twitch_url}',recap:'{message}\n🎮 {game}\n🔗 {vod_url}'});}
export function saveTemplates(v){storage.set(K,v);}
export function renderTemplate(t,data={}){return String(t).replace(/\{(\w+)\}/g,(_,k)=>data[k]??'').trim();}
export function platformStatus(text,platform){const limit=PLATFORMS[platform]?.limit||500;return {length:[...text].length,limit,remaining:limit-[...text].length};}