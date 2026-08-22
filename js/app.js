import { APP_CONFIG } from '../config.js';
import { beginLogin, consumeOAuthHash, validateToken, logout } from './auth.js';
import { storage } from './storage.js';
import { loadCreatorData } from './services/data-orchestrator.js';
import { getUserByLogin,getUsers,getChannel,getStream,searchChannels,getSchedule,getRecentVideos } from './services/twitch.js';
import { summarizeGameHistory,buildGameSignals } from './engines/game-radar.js';
import { inferSchedule } from './engines/schedule.js';
import { buildSignals } from './engines/signals.js';
import { filterCreators,uniqueOptions } from './engines/filter-engine.js';
import { rankRaidCandidates } from './integrations/wormhole.js';
import { scheduleProfile,scheduleCompatibility,formatOverlap,weeklyWindows,findCommonWindows } from './integrations/solstice.js';
import { creatorMatch } from './integrations/nerdsync.js';
import { downloadDiagnostics } from './diagnostics.js';
import { getLists,toggleList,setNote,clearLists } from './engines/local-lists.js';
import { proxiedImage } from './services/images.js';
import { getWorkspace,saveWorkspace,savePreset } from './engines/workspace-settings.js';
import { paginate } from './engines/pagination.js';
import { normalizeGenre,CREATOR_GENRES } from './engines/genre-taxonomy.js';
import { createLaunchFlow } from './services/launch-flow.js';
import { recordLaunchEvent,downloadLaunchDiagnostic,copyLaunchDiagnostic,launchElapsedSeconds } from './services/launch-diagnostics.js';

const state={user:null,channel:null,stream:null,videos:[],followedStreams:[],followedChannels:[],clips:[],followerTotal:null,publishedSchedule:[],inferredSchedule:[],gameHistory:[],gameSignals:[],tracker:null,igdbGames:[],raidMatches:[],creatorMatches:[],providerStatus:{},profiles:[],schedules:new Map(),scheduleEvidence:new Map(),scheduleScanCursor:0,scheduleScanning:false,cleanupRows:[],cleanupCursor:0,cleanupScanning:false,errors:[]};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profileMap=()=>new Map(state.profiles.map(p=>[p.id,p]));
function setStatus(t,k=''){const e=$('#systemStatus');e.textContent=t;e.dataset.kind=k}
function showView(id){
  const target=document.getElementById(id);
  if(!target||!target.classList.contains('view')){
    recordLaunchEvent('navigation','invalid view',id||'');
    return;
  }
  $$('.view').forEach(v=>v.hidden=v!==target);
  $$('[data-view]').forEach(b=>{
    const active=b.dataset.view===id;
    b.classList.toggle('active',active);
    if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  recordLaunchEvent('navigation','view opened',id);
  if(id==='schedule'&&state.user&&state.scheduleScanCursor===0&&!state.scheduleScanning)setTimeout(scanScheduleBatch,0);
  window.scrollTo({top:0,left:0,behavior:'auto'});
}
function observedSegments(videos=[]){return videos.slice(0,30).map(v=>{const start=new Date(v.created_at);const h=Number(String(v.duration).match(/(\d+)h/)?.[1]||0),m=Number(String(v.duration).match(/(\d+)m/)?.[1]||0);const end=new Date(start.getTime()+Math.max(60,h*60+m)*60000);return {startTime:start.toISOString(),endTime:end.toISOString()}})}
function referenceStream(){if(state.stream)return state.stream;const v=state.videos[0];if(!v)return null;return {user_id:state.user.id,viewer_count:state.tracker?.avg_viewers||state.tracker?.average_viewers||Math.max(1,v.view_count||1),started_at:v.created_at,game_id:state.channel?.game_id||'',game_name:state.channel?.game_name||'',tags:state.channel?.tags||[]}}
const PROVIDER_INFO={
'twitch.identity':['Core Twitch','Your Twitch identity and profile.'],
'twitch.channel':['Core Twitch','Your current channel/category information.'],
'twitch.live':['Core Twitch','Your current live stream state.'],
'twitch.vods':['Core Twitch','Recent broadcasts used for your own observed schedule evidence.'],
'twitch.followedLive':['Network Twitch','Channels you follow that are live now.'],
'twitch.followedChannels':['Network Twitch','The channels you follow; paginated up to the configured limit.'],
'twitch.networkProfiles':['Network Twitch','Profile images and creator descriptions for loaded network creators.'],
'twitch.networkChannels':['Network Twitch','Current channel metadata for live followed creators.'],
'twitch.networkSchedules':['Network Twitch','Published schedules preloaded for a small live subset; Schedule Match can scan more on demand.'],
'twitch.games':['Core Twitch','Twitch game/category metadata and box art.'],
'twitch.schedule':['Core Twitch','Your published Twitch schedule.'],
'twitch.followers':['Core Twitch','Your channel follower total only.'],
'twitch.clips':['Core Twitch','Recent clip/category evidence for Game Radar.'],
'twitchtracker.summary':['Supplemental','Public channel summary context; not used as timestamped schedule history.'],
'twitchtracker.games':['Supplemental','Public category context for Game Radar.'],
'igdb.games':['Supplemental','Genre, theme and game-mode enrichment.'],
'twitch.profileImages':['Network Twitch','Creator profile images returned by Twitch.'],
'twitch.streamImages':['Network Twitch','Live preview images returned by Twitch.'],
'twitch.gameArt':['Network Twitch','Twitch category box art.']
};
function providerRows(){
 const groups=new Map();
 for(const [k,v] of Object.entries(state.providerStatus)){const [group,why]=PROVIDER_INFO[k]||['Other','Additional provider data.'];if(!groups.has(group))groups.set(group,[]);groups.get(group).push({k,v,why})}
 const order=['Core Twitch','Network Twitch','Supplemental','Other'];
 return order.filter(g=>groups.has(g)).map(g=>`<section class="inspector-group"><div class="section-head"><h2>${esc(g)}</h2><span>${groups.get(g).filter(x=>x.v.ok).length}/${groups.get(g).length} ready</span></div>${groups.get(g).map(({k,v,why})=>`<article class="inspector-row"><div><strong>${esc(k)}</strong><p>${esc(why)}</p><small>${v.ok?`Loaded${Number.isFinite(v.count)?` • ${v.count} records`:''}`:esc(v.error||'Unavailable')}</small></div><div class="confidence ${v.ok?'good':''}">${v.ok?'OK':'!'}</div></article>`).join('')}</section>`).join('')
}
function options(select,values){const current=select.value;select.innerHTML='<option value="">Any</option>'+values.map(v=>`<option>${esc(v)}</option>`).join('');select.value=current}
function filters(prefix){return {search:$(`#${prefix}Search`)?.value||'',minViewers:$(`#${prefix}Min`)?.value||0,maxViewers:$(`#${prefix}Max`)?.value||0,games:[$(`#${prefix}Game`)?.value].filter(Boolean),language:$(`#${prefix}Language`)?.value||'',genres:[$(`#${prefix}Genre`)?.value].filter(Boolean),tags:($(`#${prefix}Tags`)?.value||'').split(',').map(x=>x.trim()).filter(Boolean)}}
function twitchUrl(login){return `https://www.twitch.tv/${encodeURIComponent(login||'')}`}
function creatorCard(stream,score,evidence={},kind='raid'){
 const p=profileMap().get(stream.user_id)||{};const tags=(stream.tags||[]).slice(0,5);const photo=proxiedImage(stream.profile_image_url||p.profile_image_url||stream.game_box_art_url||'');
 return `<article class="creator-tool-card">
 <img class="creator-photo" src="${esc(photo)}" data-fallback="${esc(proxiedImage(stream.game_box_art_url||''))}" alt="${esc(stream.user_name||p.display_name||'Creator')} profile image" loading="lazy" referrerpolicy="no-referrer">
 <div class="creator-main"><h3>${esc(stream.user_name||p.display_name||stream.user_login)}</h3>
 <p>${esc(stream.game_name||'No category')} • ${Number(stream.viewer_count||0).toLocaleString()} viewers • ${esc(stream.language||'—')}</p>
 <p>${esc(stream.title||stream.creator_description||p.description||'')}</p>${stream.stream_thumbnail_url?`<img class="stream-preview" src="${esc(proxiedImage(stream.stream_thumbnail_url))}" alt="${esc(stream.user_name||'Creator')} live preview" loading="lazy" referrerpolicy="no-referrer">`:''}
 <div class="tag-row">${(stream.genres||[]).slice(0,3).map(t=>`<span class="tag genre-tag">${esc(t)}</span>`).join('')}${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
 <div class="creator-actions"><button class="mini-btn" data-details="${esc(stream.user_id)}">View Details</button><a class="mini-btn" href="${twitchUrl(stream.user_login)}" target="_blank" rel="noopener">Twitch</a><button class="mini-btn" data-send-game="${esc(stream.game_name||'')}">Find same game</button><button class="mini-btn" data-send-tags="${esc(tags.join(','))}">Use tags</button><button class="mini-btn" data-list="favorites" data-creator="${esc(stream.user_id)}">★ Favorite</button><button class="mini-btn" data-list="collabs" data-creator="${esc(stream.user_id)}">Collab</button><button class="mini-btn" data-list="raidLater" data-creator="${esc(stream.user_id)}">Raid later</button></div>
 <p>${kind==='raid'?`Audience ${evidence.live??'—'}% • Game ${evidence.game??'—'}% • Tags ${evidence.tags??'limited'}`:`Schedule ${evidence.schedule??'—'}% • Game ${evidence.games??'—'}% • Tags ${evidence.tags??'—'}% • ${formatOverlap(evidence)}`}</p>
 </div><div class="scorebox">${score}%<small>${kind==='raid'?'RAID FIT':'CREATOR FIT'}</small></div></article>`;
}
function renderTools(){
 const games=uniqueOptions(state.followedStreams,'game_name'),langs=uniqueOptions(state.followedStreams,'language'),genres=[...new Set([...CREATOR_GENRES,...state.followedStreams.flatMap(x=>(x.genres||[]).map(normalizeGenre))])].sort((a,b)=>a.localeCompare(b));
 options($('#raidGenre'),genres);options($('#matchGenre'),genres);options($('#raidLanguage'),langs);options($('#matchLanguage'),langs);
 const rf=filters('raid');const visibleRaid=filterCreators(state.raidMatches,rf);
 $('#raidCount').textContent=`${visibleRaid.length} MATCHES`;$('#raidList').innerHTML=visibleRaid.slice(0,80).map(s=>creatorCard(s,s.raidScore,s.raidEvidence,'raid')).join('')||'<p class="empty">No creators match these filters.</p>';
 const mf=filters('match');const minOverlap=Number($('#matchOverlap')?.value||0);
 const base=filterCreators(state.creatorMatches.map(x=>x.stream),mf);const allowed=new Set(base.map(x=>x.user_id));
 const visibleMatch=state.creatorMatches.filter(x=>allowed.has(x.stream.user_id)&&x.match.overlapMinutes>=minOverlap);
 $('#matchCount').textContent=`${visibleMatch.length} MATCHES`;$('#creatorMatchList').innerHTML=visibleMatch.slice(0,80).map(x=>creatorCard(x.stream,x.match.score,x.match,'match')).join('')||'<p class="empty">No creators match these collaboration filters.</p>';
 bindCrossToolActions();bindCreatorDetails();bindImageFallbacks();
}
function bindImageFallbacks(){$$('.creator-photo,.stream-preview').forEach(img=>img.addEventListener('error',()=>{const fb=img.dataset.fallback;if(fb&&img.src!==fb){img.src=fb;delete img.dataset.fallback}else img.classList.add('image-missing')},{once:true}))}
function bindCrossToolActions(){
 $$('[data-list]').forEach(b=>b.onclick=()=>{toggleList(b.dataset.list,b.dataset.creator);renderSavedCreators()});
 $$('[data-send-game]').forEach(b=>b.onclick=()=>{showView('raid');$('#raidGame').value=b.dataset.sendGame;renderTools()});
 $$('[data-send-tags]').forEach(b=>b.onclick=()=>{showView('match');$('#matchTags').value=b.dataset.sendTags;renderTools()});
}
function countBy(values){const m=new Map();for(const v of values.filter(Boolean))m.set(v,(m.get(v)||0)+1);return [...m].sort((a,b)=>b[1]-a[1])}
function renderNetwork(){const live=state.followedStreams||[],games=countBy(live.map(x=>x.game_name)),genres=countBy(live.flatMap(x=>x.genres||[])),tags=countBy(live.flatMap(x=>x.tags||[]));$('#networkLiveCount').textContent=live.length;$('#networkGameCount').textContent=games.length;$('#networkGenreCount').textContent=genres.length;$('#networkTagCount').textContent=tags.length;const rows=(a,t)=>a.slice(0,15).map(([n,c])=>`<article class="data-row"><div><strong>${esc(n)}</strong><small>${c} live creators</small></div><button class="mini-btn" data-net-${t}="${esc(n)}">Use filter</button></article>`).join('');$('#networkGames').innerHTML=rows(games,'game');$('#networkGenres').innerHTML=rows(genres,'genre');$('#networkTags').innerHTML=rows(tags,'tag');$$('[data-net-game]').forEach(b=>b.onclick=()=>{showView('raid');$('#raidGame').value=b.dataset.netGame;renderTools()});$$('[data-net-genre]').forEach(b=>b.onclick=()=>{showView('raid');$('#raidGenre').value=b.dataset.netGenre;renderTools()});$$('[data-net-tag]').forEach(b=>b.onclick=()=>{showView('raid');$('#raidTags').value=b.dataset.netTag;renderTools()})}
function renderScheduleMatrix(){const mine=scheduleProfile(state.publishedSchedule,observedSegments(state.videos)),wins=weeklyWindows(mine),days=['SUN','MON','TUE','WED','THU','FRI','SAT'];$('#scheduleMatrix').innerHTML=days.map((d,i)=>`<div class="schedule-day"><span>${d}</span><div class="schedule-track">${wins.filter(w=>w.day===i).map(w=>`<i class="schedule-block" style="left:${w.start/1440*100}%;width:${Math.max(.5,(w.end-w.start)/1440*100)}%"></i>`).join('')}</div></div>`).join('')}
function renderCommonWindows(){const mine=scheduleProfile(state.publishedSchedule,observedSegments(state.videos)),top=state.creatorMatches.slice(0,3).map(x=>scheduleProfile(state.schedules.get(x.stream.user_id)||[],[])).filter(x=>x.segments.length),min=Number($('#windowMin')?.value||60),w=findCommonWindows([mine,...top.slice(0,2)],min),days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],fmt=m=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;$('#commonWindows').innerHTML=w.map(x=>`<article class="data-row"><div><strong>${days[x.day]} ${fmt(x.start)}–${fmt(x.end)}</strong><small>${x.minutes} minutes common availability</small></div><div class="confidence good">OPEN</div></article>`).join('')||'<p class="empty">No common window found.</p>'}
function renderSavedCreators(){const l=getLists(),all=new Map((state.followedStreams||[]).map(x=>[String(x.user_id),x])),ids=[...new Set([...l.favorites,...l.collabs,...l.raidLater])];$('#savedCreators').innerHTML=ids.map(id=>{const c=all.get(String(id));if(!c)return'';const f=[l.favorites.includes(id)?'★ Favorite':'',l.collabs.includes(id)?'Potential collab':'',l.raidLater.includes(id)?'Raid later':''].filter(Boolean).join(' • ');return `<article class="data-row"><div style="width:100%"><strong>${esc(c.user_name||c.user_login)}</strong><small>${esc(f)}</small><textarea class="saved-note" data-note="${esc(id)}" placeholder="Local note…">${esc(l.notes[id]||'')}</textarea></div></article>`}).join('')||'<p class="empty">No saved creators yet.</p>';$$('[data-note]').forEach(t=>t.onchange=()=>setNote(t.dataset.note,t.value))}

const workspace=getWorkspace();
const WEIGHT_LABELS={audience:'Audience',games:'Games',tags:'Tags',genre:'Genre',schedule:'Schedule',language:'Language'};
function renderWorkspaceControls(){if(!$('#weightGrid'))return;$('#weightGrid').innerHTML=Object.entries(WEIGHT_LABELS).map(([k,label])=>`<label class="weight-row"><span>${label}</span><input type="range" min="0" max="50" step="5" value="${workspace.weights?.[k]??0}" data-weight="${k}"><output>${workspace.weights?.[k]??0}%</output></label>`).join('');$$('[data-weight]').forEach(el=>el.oninput=()=>{el.nextElementSibling.value=el.value+'%';workspace.weights={...workspace.weights,[el.dataset.weight]:Number(el.value)};saveWorkspace({weights:workspace.weights})});$('#resultSort').value=workspace.sort||'recommended';$('#pageSize').value=String(workspace.pageSize||12);renderPresets()}
function renderPresets(){if(!$('#presetRow'))return;$('#presetRow').innerHTML=(workspace.presets||[]).map(p=>`<button class="preset-chip" data-preset="${esc(p.id)}">${esc(p.name)}</button>`).join('')||'<small>No saved presets yet.</small>'}
function openCreatorDrawer(id){const c=(state.followedStreams||[]).find(x=>String(x.user_id)===String(id));if(!c)return;const p=profileMap().get(c.user_id)||{};$('#drawerName').textContent=c.user_name||p.display_name||'Creator';$('#drawerBody').innerHTML=`${c.profile_image_url?`<img class="creator-photo" src="${esc(proxiedImage(c.profile_image_url))}" alt="">`:''}<p>${esc(c.creator_description||p.description||'No creator description available.')}</p><div class="stat-grid compact"><article><span>VIEWERS</span><strong>${c.viewer_count??'—'}</strong></article><article><span>GAME</span><strong>${esc(c.game_name||'—')}</strong></article><article><span>GENRES</span><strong>${esc((c.genres||[]).slice(0,2).join(', ')||'—')}</strong></article><article><span>TAGS</span><strong>${(c.tags||[]).length}</strong></article></div><div class="creator-reasons"><span>Current Twitch information</span><span>${(c.genres||[]).join(', ')||'Genre evidence unavailable'}</span><span>${(c.tags||[]).slice(0,5).join(', ')||'Tag evidence unavailable'}</span></div><div class="creator-actions"><a class="primary mini-btn" target="_blank" rel="noopener" href="${twitchUrl(c.user_login)}">Open Twitch</a><button class="mini-btn" data-list="collabs" data-creator="${esc(c.user_id)}">Potential Collab</button><button class="mini-btn" data-list="raidLater" data-creator="${esc(c.user_id)}">Raid Later</button></div>`;$('#drawerBackdrop').hidden=false;$('#creatorDrawer').hidden=false;bindCrossToolActions()}
function closeCreatorDrawer(){if($('#drawerBackdrop'))$('#drawerBackdrop').hidden=true;if($('#creatorDrawer'))$('#creatorDrawer').hidden=true}
function bindCreatorDetails(){$$('[data-details]').forEach(b=>b.onclick=()=>openCreatorDrawer(b.dataset.details))}


let discoverySource='all';
function creatorGenres(c){return (c.genres||[]).map(normalizeGenre)}
function isFollowingCreator(c){return (state.following||state.followed||[]).some(x=>String(x.user_id||x.to_id||x.id)===String(c.user_id))}
function discoveryPool(){
  const followed=state.followedStreams||[];
  const discovered=state.discoveryFeed||state.discovery||state.searchResults||state.categoryStreams||[];
  const map=new Map();
  [...followed,...discovered].forEach(c=>{if(c?.user_id)map.set(String(c.user_id),c)});
  let out=[...map.values()];
  if(discoverySource==='following')out=out.filter(isFollowingCreator);
  if(discoverySource==='outside')out=out.filter(c=>!isFollowingCreator(c));
  return out;
}
function scheduleEvidence(c){
  const mine=scheduleProfile(state.publishedSchedule,observedSegments(state.videos));
  const scanned=state.scheduleEvidence.get(String(c.user_id));
  const theirs=scanned?.profile||scheduleProfile(state.schedules.get(c.user_id)||[],[]);
  try{const e=scheduleCompatibility(mine,theirs);return {minutes:e.overlapMinutes||0,score:e.score||0,source:scanned?.source||theirs.type,confidence:theirs.confidence||0,sharedDays:e.sharedDays||[]}}catch{return {minutes:0,score:0,source:'none',confidence:0,sharedDays:[]}}
}
function followedCreatorBase(){
 const pmap=profileMap(),live=new Map((state.followedStreams||[]).map(x=>[String(x.user_id),x]));
 return (state.followedChannels||[]).map(f=>{const id=String(f.broadcaster_id),p=pmap.get(id)||{},l=live.get(id)||{};return {...p,...l,user_id:id,user_login:l.user_login||f.broadcaster_login||p.login,user_name:l.user_name||f.broadcaster_name||p.display_name,followed_at:f.followed_at,genres:l.genres||[],tags:l.tags||[]}})
}
function renderFollowerScheduleMatches(){
 const host=$('#scheduleFollowerMatches');if(!host)return;
 const q=($('#scheduleFollowerSearch')?.value||'').trim().toLowerCase(),min=Number($('#scheduleMinOverlap')?.value||0),day=$('#scheduleDay')?.value||'',game=($('#scheduleMatchGame')?.value||'').trim().toLowerCase(),liveOnly=$('#scheduleLiveOnly')?.checked;
 let rows=followedCreatorBase().filter(c=>state.scheduleEvidence.has(String(c.user_id))||state.schedules.has(c.user_id)).map(c=>({c,e:scheduleEvidence(c)})).filter(({c,e})=>(!q||[c.user_name,c.game_name,...(c.tags||[])].join(' ').toLowerCase().includes(q))&&e.minutes>=min&&(!game||String(c.game_name||'').toLowerCase().includes(game))&&(!liveOnly||c.type==='live'||c.viewer_count!=null)&&(!day||e.sharedDays.includes(day.slice(0,3))));
 const sort=$('#scheduleSort')?.value||'overlap';rows.sort((a,b)=>sort==='name'?String(a.c.user_name).localeCompare(String(b.c.user_name)):sort==='viewers'?(b.c.viewer_count||0)-(a.c.viewer_count||0):b.e.minutes-a.e.minutes);
 $('#scheduleMatchCount').textContent=rows.length;
 host.innerHTML=rows.map(({c,e})=>`<article class="schedule-match-card">${c.profile_image_url?`<img src="${esc(proxiedImage(c.profile_image_url))}" alt="">`:'<div class="schedule-avatar-placeholder"></div>'}<div><strong>${esc(c.user_name||c.user_login)}</strong><div class="muted">${esc(c.game_name||'Offline / no current category')}</div><div class="schedule-evidence">${e.source==='published'?'Published Twitch schedule':'30-day VOD timing'} • ${e.confidence}% evidence${e.sharedDays.length?' • '+esc(e.sharedDays.join(', ')):''}</div></div><span class="overlap-pill">${Math.floor(e.minutes/60)}h ${e.minutes%60}m overlap</span></article>`).join('')||'<div class="empty">No scanned creators match these schedule filters. Use “Scan 50 creators” to load schedule evidence.</div>';
}
async function scanScheduleBatch(){
 if(state.scheduleScanning)return;
 state.scheduleScanning=true;
 const btn=$('#scheduleScanBtn'),more=$('#scheduleScanMoreBtn'),status=$('#scheduleScanStatus');
 if(btn)btn.disabled=true;if(more)more.disabled=true;
 const all=followedCreatorBase(),batch=all.slice(state.scheduleScanCursor,state.scheduleScanCursor+50);
 if(!batch.length){if(status)status.textContent='All loaded followed channels have been scanned.';state.scheduleScanning=false;return}
 let done=0,published=0,observed=0,none=0,next=0;
 const cutoff=Date.now()-30*86400000;
 if(status)status.textContent=`Scanning ${batch.length} creators… 0/${batch.length}`;
 const workers=Array.from({length:4},async()=>{while(next<batch.length){const c=batch[next++];try{
   const pub=await getSchedule(c.user_id,25);
   if(pub.length){state.schedules.set(c.user_id,pub);state.scheduleEvidence.set(String(c.user_id),{source:'published',profile:scheduleProfile(pub,[])});published++}
   else{
     const vids=(await getRecentVideos(c.user_id,20)).filter(v=>new Date(v.created_at).getTime()>=cutoff);
     const obs=observedSegments(vids);
     if(obs.length){state.scheduleEvidence.set(String(c.user_id),{source:'observed',profile:scheduleProfile([],obs)});observed++}
     else{state.scheduleEvidence.set(String(c.user_id),{source:'none',profile:scheduleProfile([],[])});none++}
   }
 }catch(e){state.scheduleEvidence.set(String(c.user_id),{source:'none',profile:scheduleProfile([],[])});none++;state.errors.push({time:new Date().toISOString(),message:`Schedule scan ${c.user_login}: ${e.message}`})}
 done++;if(status)status.textContent=`Scanning ${batch.length} creators… ${done}/${batch.length}`;renderFollowerScheduleMatches()}});await Promise.all(workers);
 state.scheduleScanCursor+=batch.length;state.scheduleScanning=false;
 if(status)status.textContent=`Scanned ${state.scheduleScanCursor}/${all.length} • ${published} published • ${observed} 30-day VOD inferred • ${none} no evidence`;
 if(btn)btn.disabled=false;if(more){more.disabled=false;more.hidden=state.scheduleScanCursor>=all.length}
 renderFollowerScheduleMatches();
}function networkFit(c){
 const match=state.creatorMatches.find(x=>String(x.stream.user_id)===String(c.user_id));
 if(match)return {score:match.match.score||0,reason:'Creator Match evidence'};
 const raid=state.raidMatches.find(x=>String(x.user_id)===String(c.user_id));
 if(raid)return {score:raid.raidScore||0,reason:'Raid Radar evidence'};
 let score=0,reasons=[];
 if(c.type==='live'||c.viewer_count!=null){score+=20;reasons.push('live now')}
 if((c.genres||[]).length){score+=15;reasons.push('genre data')}
 if((c.tags||[]).length){score+=Math.min(20,(c.tags||[]).length*4);reasons.push('tag data')}
 if(c.game_name){score+=15;reasons.push('category data')}
 return {score:Math.min(100,score),reason:reasons.join(' • ')||'limited current evidence'}
}
function renderCompactNetwork(){
 const host=$('#networkResults');if(!host)return;
 const q=($('#networkSearch')?.value||'').trim().toLowerCase(),rel=$('#networkRelation')?.value||'all',genre=$('#networkGenre')?.value||'',live=$('#networkLive')?.value||'all';
 const lists=getLists();const ids=new Set(rel==='saved'?lists.favorites:rel==='collabs'?lists.collabs:rel==='raidLater'?lists.raidLater:[]);
 let rows=discoveryPool().filter(c=>(!q||[c.user_name,c.user_login,c.game_name,...(c.tags||[])].join(' ').toLowerCase().includes(q))&&(!genre||creatorGenres(c).includes(genre)||(['Just Chatting','IRL'].includes(genre)&&String(c.game_name||'').toLowerCase()===genre.toLowerCase()))&&(live==='all'||(live==='live'?(c.type==='live'||c.viewer_count!=null):!(c.type==='live'||c.viewer_count!=null)))&&(rel==='all'||(rel==='following'&&isFollowingCreator(c))||(rel!=='following'&&rel!=='all'&&ids.has(String(c.user_id))))).map(c=>({c,fit:networkFit(c)}));
 const sort=$('#networkSort')?.value||'fit';rows.sort((a,b)=>sort==='name'?String(a.c.user_name||'').localeCompare(String(b.c.user_name||'')):sort==='viewers'?(b.c.viewer_count||0)-(a.c.viewer_count||0):b.fit.score-a.fit.score);
 $('#networkVisibleCount').textContent=rows.length;
 host.innerHTML=rows.slice(0,50).map(({c,fit})=>`<article class="network-rank-card"><div class="network-rank-score">${fit.score}%<small>FIT</small></div>${c.profile_image_url?`<img class="network-rank-avatar" src="${esc(proxiedImage(c.profile_image_url))}" alt="">`:''}<div class="network-rank-copy"><strong>${esc(c.user_name||c.user_login)}</strong><p>${esc(c.game_name||'Offline / no category')} ${c.viewer_count!=null?'• '+Number(c.viewer_count).toLocaleString()+' viewers':''}</p><small>${esc(fit.reason)}</small><div class="tag-row">${creatorGenres(c).slice(0,2).map(t=>`<span class="tag genre-tag">${esc(t)}</span>`).join('')}${(c.tags||[]).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div><div class="network-rank-actions"><button class="mini-btn" data-details="${esc(c.user_id)}">Details</button><a class="mini-btn" href="${twitchUrl(c.user_login)}" target="_blank" rel="noopener">Twitch</a></div></article>`).join('')||'<div class="empty">No creators match these network filters.</div>';bindCreatorDetails();bindImageFallbacks();
}

function cleanupCutoff(){const v=$('#cleanupDate')?.value;if(v)return new Date(v+'T23:59:59').getTime();const d=new Date();d.setMonth(d.getMonth()-6);return d.getTime()}
function renderCleanup(){
 const host=$('#cleanupResults');if(!host)return;
 const cutoff=cleanupCutoff(),q=($('#cleanupSearch')?.value||'').trim().toLowerCase(),status=$('#cleanupStatus')?.value||'all',type=$('#cleanupType')?.value||'all';
 let rows=state.cleanupRows.map(r=>({...r,inactive:r.lastStream?new Date(r.lastStream).getTime()<cutoff:null})).filter(r=>(!q||[r.name,r.login].join(' ').toLowerCase().includes(q))&&(status==='all'||(status==='inactive'&&r.inactive===true)||(status==='active'&&r.inactive===false)||(status==='unknown'&&r.inactive===null))&&(type==='all'||r.accountType===type));
 rows.sort((a,b)=>(a.lastStream?new Date(a.lastStream).getTime():0)-(b.lastStream?new Date(b.lastStream).getTime():0));
 $('#cleanupScanned').textContent=state.cleanupRows.length;$('#cleanupInactive').textContent=state.cleanupRows.filter(r=>r.lastStream&&new Date(r.lastStream).getTime()<cutoff).length;$('#cleanupUnknown').textContent=state.cleanupRows.filter(r=>!r.lastStream).length;
 host.innerHTML=rows.map(r=>`<article class="cleanup-row"><div>${r.profile_image_url?`<img src="${esc(proxiedImage(r.profile_image_url))}" alt="">`:''}<div><strong>${esc(r.name)}</strong><p>${r.lastStream?`Last VOD: ${new Date(r.lastStream).toLocaleDateString()}`:'No recent VOD evidence returned'}</p><small>${esc(r.accountType==='affiliate'?'Affiliate':r.accountType==='partner'?'Partner':'Broadcaster')} • Followed ${r.followed_at?new Date(r.followed_at).toLocaleDateString():'date unavailable'}</small></div></div><a class="mini-btn" href="${twitchUrl(r.login)}" target="_blank" rel="noopener">Review on Twitch</a></article>`).join('')||'<div class="empty">No scanned channels match this cleanup filter.</div>';
}
async function scanCleanupBatch(){
 if(state.cleanupScanning)return;state.cleanupScanning=true;
 const all=followedCreatorBase(),batch=all.slice(state.cleanupCursor,state.cleanupCursor+50),status=$('#cleanupScanStatus'),btn=$('#cleanupScanBtn'),more=$('#cleanupScanMoreBtn');if(btn)btn.disabled=true;if(more)more.disabled=true;
 if(!batch.length){if(status)status.textContent='ALL LOADED CHANNELS SCANNED';state.cleanupScanning=false;return}
 let profiles=[];try{profiles=await getUsers(batch.map(c=>c.user_id))}catch(e){state.errors.push({time:new Date().toISOString(),message:`Cleanup profiles: ${e.message}`})}
 const profileById=new Map(profiles.map(x=>[String(x.id),x]));
 let next=0,done=0;const workers=Array.from({length:4},async()=>{while(next<batch.length){const c=batch[next++],profile=profileById.get(String(c.user_id))||{},accountType=profile.broadcaster_type==='affiliate'?'affiliate':profile.broadcaster_type==='partner'?'partner':'broadcaster';let last=null;try{const vids=await getRecentVideos(c.user_id,1);last=vids[0]?.created_at||null}catch(e){state.errors.push({time:new Date().toISOString(),message:`Cleanup scan ${c.user_login}: ${e.message}`})}
 state.cleanupRows.push({id:c.user_id,login:c.user_login,name:c.user_name,profile_image_url:profile.profile_image_url||c.profile_image_url,followed_at:c.followed_at,lastStream:last,accountType});done++;if(status)status.textContent=`SCANNING ${done}/${batch.length} • ${state.cleanupRows.length} results loaded`;renderCleanup()}});await Promise.all(workers);state.cleanupCursor+=batch.length;state.cleanupScanning=false;if(status)status.textContent=`SCANNED ${state.cleanupCursor}/${all.length}`;if(btn)btn.disabled=false;if(more){more.disabled=false;more.hidden=state.cleanupCursor>=all.length}renderCleanup()
}
function initUnifiedFilters(){
  $$('.nerdspace-filter-panel').forEach(panel=>{
    const btn=panel.querySelector('.filter-toggle'),content=panel.querySelector('.filters-panel__content');
    if(!btn||!content)return;
    btn.onclick=()=>{content.hidden=!content.hidden;btn.textContent=content.hidden?'Show filters':'Hide filters';btn.setAttribute('aria-expanded',String(!content.hidden))};
  });
}
function renderUnifiedFilterChips(){
  $$('.nerdspace-filter-panel').forEach(panel=>{
    panel.querySelector('.filter-active-summary')?.remove();
    const vals=[...panel.querySelectorAll('input,select')].flatMap(el=>{
      if((el.type==='checkbox'||el.type==='radio')&&!el.checked)return[];
      const v=String(el.value||'').trim();if(!v||v==='all'||v==='0')return[];
      return [v];
    }).slice(0,8);
    if(!vals.length)return;
    const row=document.createElement('div');row.className='filter-active-summary';row.innerHTML=vals.map(v=>`<span class="filter-chip">${esc(v)}</span>`).join('');panel.appendChild(row);
  });
}
function renderFilteredGames(){const q=($('#gameFilterSearch')?.value||'').toLowerCase(),g=($('#gameFilterGenre')?.value||'').toLowerCase();['#gameHistory','#gameRadar'].forEach(sel=>{$$(sel+' > *').forEach(card=>{const t=card.textContent.toLowerCase();card.hidden=Boolean((q&&!t.includes(q))||(g&&!t.includes(g)))})})}

const launchFlow=createLaunchFlow({authGate:$('#authGate'),loading:$('#workspaceLoading'),app:$('#authenticatedApp'),error:$('#authGateError'),steps:name=>$(`[data-launch-step="${name}"]`)});
function launchStep(name,status,label){launchFlow.setStep(name,status,label);recordLaunchEvent('step',name,status||label||'');const statusEl=$('#loadingStatusText');if(statusEl&&status==='active')statusEl.textContent=`Loading ${name}…`}
function showLoggedOut(message=''){launchFlow.loggedOut(message)}
function showWorkspaceLoading(){launchFlow.loading();recordLaunchEvent('launch','workspace loading started');launchStep('identity','active','Loading')}
function showAuthenticatedWorkspace(){
  recordLaunchEvent('launch','workspace core ready');
  const bridge=$('#workspaceTransition');
  if(bridge)bridge.hidden=false;
  // Keep loading/transition messaging visible while the browser lays out populated cards.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    launchFlow.ready();
    if(bridge)bridge.hidden=true;
    recordLaunchEvent('launch','workspace rendered');
  }));
}

let igdbSuggestTimer=null,igdbSuggestSeq=0;
async function refreshIGDBSuggestions(value){
 const q=String(value||'').trim();if(q.length<2)return;
 const seq=++igdbSuggestSeq;
 try{const rows=await searchIGDBGames(q,12);if(seq!==igdbSuggestSeq)return;const dl=$('#igdbGameOptions');if(dl)dl.innerHTML=rows.map(g=>`<option value="${esc(g.name)}"></option>`).join('')}
 catch(e){recordLaunchEvent('igdb','game autocomplete unavailable',e?.message||String(e))}
}
function bindIGDBGameInputs(){
 $$('.igdb-game-input').forEach(input=>input.addEventListener('input',()=>{clearTimeout(igdbSuggestTimer);igdbSuggestTimer=setTimeout(()=>refreshIGDBSuggestions(input.value),220)}))
}
let showAllGameSignals=false;
function renderGameSignals(){
 const host=$('#gameRadar');if(!host)return;const rows=state.gameSignals.slice(0,showAllGameSignals?30:6);
 host.innerHTML=rows.map((g,i)=>`<article class="signal-row"><div class="signal-rank">${i+1}</div><div><strong>${esc(g.name)}</strong><p>${g.channels} followed creators live • ${g.viewers.toLocaleString()} combined viewers</p></div><div class="signal-score">${g.score}%<small>SIGNAL</small></div><button class="mini-btn" data-game-to-raid="${esc(g.name)}">Find creators</button></article>`).join('')||'<p class="empty">No adjacent game signals available right now.</p>';
 const b=$('#toggleGameSignals');if(b){b.hidden=state.gameSignals.length<=6;b.textContent=showAllGameSignals?'Show top 6':`Show all (${state.gameSignals.length})`}
 $$('[data-game-to-raid]').forEach(b=>b.onclick=()=>{showView('raid');$('#raidGame').value=b.dataset.gameToRaid;renderTools()});
}
function render(){
  if(state.user){
    launchStep('identity','done','Ready');
    if(state.followedStreams||state.following)launchStep('following','done','Ready');
    if(state.publishedSchedule||state.schedule)launchStep('schedule','done','Ready');
    if(state.videos?.length)launchStep('history','done','Ready');
    if(state.discoveryFeed||state.discovery||state.searchResults)launchStep('discovery','done','Ready');
    if((state.followedStreams||[]).some(x=>(x.genres||[]).length))launchStep('igdb','done','Ready');
    if($('#authenticatedApp')?.hidden && $('#workspaceTransition')?.hidden)showAuthenticatedWorkspace();
  }else{showLoggedOut()}
 $('#version').textContent=`ALPHA ${APP_CONFIG.version}`;$('#loginView').hidden=Boolean(state.user);$('#appShell').hidden=!state.user;if(!state.user)return;
 $('#avatar').src=proxiedImage(state.user.profile_image_url||'');$('#displayName').textContent=state.user.display_name;$('#loginName').textContent='@'+state.user.login;$('#livePill').textContent=state.stream?'LIVE':'OFFLINE';$('#livePill').className='status-pill '+(state.stream?'good':'');$('#channelGame').textContent=state.stream?.game_name||state.channel?.game_name||'No category';$('#viewerStat').textContent=state.stream?.viewer_count??'—';$('#vodStat').textContent=state.videos.length;$('#networkStat').textContent=state.followedStreams.length;$('#scheduleStat').textContent=state.publishedSchedule.length?'Published':(state.inferredSchedule.length?'Observed':'Limited');
 $('#signals').innerHTML=buildSignals({...state}).map(s=>`<article class="signal-card"><span>${esc(s.type)}</span><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></article>`).join('');
 $('#gameHistory').innerHTML=state.gameHistory.slice(0,12).map(g=>`<article class="data-row"><div><strong>${esc(g.name)}</strong><small>${g.current?'Current category • ':''}${g.clips} clips in 90-day evidence</small></div><button class="mini-btn" data-game-to-raid="${esc(g.name)}">Find creators</button></article>`).join('')||'<p class="empty">Not enough category evidence yet.</p>';
 renderGameSignals();
 const sched=state.publishedSchedule.length?state.publishedSchedule.slice(0,12).map(s=>({label:new Date(s.start_time).toLocaleString(),confidence:'PUBLISHED',detail:s.title||s.category?.name||'Scheduled stream'})):state.inferredSchedule.map(s=>({label:`${s.day} around ${s.hour}:00`,confidence:`${s.confidence}%`,detail:`Observed in ${s.count} recent broadcasts`}));$('#scheduleList').innerHTML=sched.map(x=>`<article class="data-row"><div><strong>${esc(x.label)}</strong><small>${esc(x.detail)}</small></div><div class="confidence">${esc(x.confidence)}</div></article>`).join('')||'<p class="empty">No schedule evidence available.</p>';
 $('#providerStatus').innerHTML=providerRows();const ps=Object.values(state.providerStatus),ok=ps.filter(x=>x.ok).length,fail=ps.length-ok;$('#providerSummary').innerHTML=`<article><span>DATASETS</span><strong>${ps.length}</strong></article><article><span>READY</span><strong>${ok}</strong></article><article><span>UNAVAILABLE</span><strong>${fail}</strong></article><article><span>FOLLOWING LOADED</span><strong>${state.followedChannels.length}</strong></article>`;$('#followingStat').textContent=state.followedChannels.length;renderCleanup();
 renderTools();renderFollowerScheduleMatches();renderCompactNetwork();renderUnifiedFilterChips();renderFilteredGames();if($('#resultCount'))$('#resultCount').textContent=state.raidMatches?.length||0;renderNetwork();renderScheduleMatrix();renderCommonWindows();renderSavedCreators();bindImageFallbacks();$$('[data-game-to-raid]').forEach(b=>b.onclick=()=>{showView('raid');$('#raidGame').value=b.dataset.gameToRaid;renderTools()});
}
async function creatorSearch(q){
 const box=$('#creatorSearchResults');box.innerHTML='<p class="empty">Searching Twitch…</p>';
 try{
  const exact=await getUserByLogin(q).catch(()=>null);let results=[];
  if(exact)results=[{user:exact,channel:await getChannel(exact.id).catch(()=>null),stream:await getStream(exact.id).catch(()=>null)}];
  else {const found=await searchChannels(q,40);results=found.map(x=>({user:{id:x.id||x.broadcaster_id,login:x.broadcaster_login,display_name:x.display_name||x.broadcaster_name,profile_image_url:x.thumbnail_url||''},channel:x,stream:x.is_live?{user_id:x.id||x.broadcaster_id,user_login:x.broadcaster_login,user_name:x.display_name||x.broadcaster_name,game_id:x.game_id,game_name:x.game_name,title:x.title,tags:x.tags||[],viewer_count:0,language:x.broadcaster_language}:null}))}
  box.innerHTML=results.map(({user,channel,stream})=>`<article class="creator-search-card"><div class="creator-search-identity"><img class="creator-search-avatar" src="${esc(proxiedImage(user.profile_image_url||''))}" alt="${esc(user.display_name||user.login)}"><div><h3>${esc(user.display_name||user.login)}</h3><p>@${esc(user.login)} • ${esc(user.broadcaster_type||'creator')}</p></div><span class="search-live-state ${stream?'good':''}">${stream?'LIVE':'OFFLINE'}</span></div><div class="creator-search-body"><p class="creator-search-description">${esc(user.description||channel?.title||'No channel description available.')}</p><div class="tag-row">${(channel?.tags||stream?.tags||[]).slice(0,8).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div><div class="creator-search-footer"><span>${esc(channel?.game_name||'No current category')}</span><div class="creator-actions"><a class="mini-btn" target="_blank" rel="noopener" href="${twitchUrl(user.login)}">View Twitch</a>${channel?.game_name?`<button class="mini-btn" data-send-game="${esc(channel.game_name)}">Send game to Raid Radar</button>`:''}</div></div></article>`).join('')||'<p class="empty">No Twitch creator found.</p>';bindCrossToolActions();bindImageFallbacks();
 }catch(e){box.innerHTML=`<p class="empty">Search failed: ${esc(e.message)}</p>`}
}
async function load(){setStatus('CONNECTING TO TWITCH…');recordLaunchEvent('auth','validating token');const valid=await validateToken();if(!valid){recordLaunchEvent('auth','no valid token');render();setStatus('READY');return}recordLaunchEvent('auth','token valid');launchStep('identity','active','Loading');const data=await loadCreatorData(valid.user_id);state.providerStatus=data.status;if(!data.user){setStatus('TWITCH IDENTITY FAILED','warn');render();return}Object.assign(state,data);state.inferredSchedule=inferSchedule(state.videos);state.gameHistory=summarizeGameHistory(state.clips,state.games,state.channel);state.gameSignals=buildGameSignals(state.gameHistory,state.followedStreams,state.trackerGames||new Map());const profiles=profileMap();const ref=referenceStream();state.raidMatches=rankRaidCandidates(ref,state.followedStreams,profiles);const mine=scheduleProfile(state.publishedSchedule,observedSegments(state.videos));state.creatorMatches=state.followedStreams.slice(0,80).map(stream=>{const theirs=scheduleProfile(state.schedules.get(stream.user_id)||[],[]);return {stream,match:creatorMatch(ref||{},stream,mine,theirs)}}).filter(x=>x.match.score>0).sort((a,b)=>b.match.score-a.match.score);storage.set('last-profile',{displayName:state.user.display_name,updatedAt:Date.now()});const failures=Object.values(state.providerStatus).filter(x=>!x.ok).length;setStatus(failures?'PARTIAL SIGNAL':'SIGNAL LOCKED',failures?'warn':'good');render()}
$('#connectBtn').addEventListener('click',()=>{try{recordLaunchEvent('auth','legacy connect button clicked');beginLogin()}catch(e){recordLaunchEvent('auth','beginLogin failed',e?.message||String(e));$('#loginError').textContent=e.message}});$('#logoutBtn').addEventListener('click',()=>{logout();location.reload()});$('#diagnosticsBtn').addEventListener('click',()=>downloadDiagnostics(state));$('#clearDataBtn').addEventListener('click',()=>{storage.clearLocalData();setStatus('LOCAL DATA CLEARED','good')});document.addEventListener('click',e=>{
  const b=e.target.closest('[data-view]');
  if(!b)return;
  e.preventDefault();
  showView(b.dataset.view);
});
['raidSearch','raidMin','raidMax','raidGame','raidGenre','raidLanguage','raidTags','matchSearch','matchMin','matchMax','matchGame','matchGenre','matchLanguage','matchTags','matchOverlap'].forEach(id=>$('#'+id)?.addEventListener('input',renderTools));
$('#raidReset').onclick=()=>{['raidSearch','raidMin','raidMax','raidTags'].forEach(id=>$('#'+id).value='');$('#raidGame').value='';$('#raidGenre').value='';$('#raidLanguage').value='';renderTools()};
$('#matchReset').onclick=()=>{['matchSearch','matchMin','matchMax','matchTags'].forEach(id=>$('#'+id).value='');$('#matchGame').value='';$('#matchGenre').value='';$('#matchLanguage').value='';$('#matchOverlap').value='0';renderTools()};
$('#findWindowBtn')?.addEventListener('click',renderCommonWindows);$('#windowMin')?.addEventListener('change',renderCommonWindows);$('#clearListsBtn')?.addEventListener('click',()=>{clearLists();renderSavedCreators()});
$('#launchLoginBtn')?.addEventListener('click',()=>{recordLaunchEvent('auth','login button clicked');try{showWorkspaceLoading();recordLaunchEvent('auth','beginLogin invoked');beginLogin()}catch(e){recordLaunchEvent('auth','beginLogin failed',e?.message||String(e));showLoggedOut(e?.message||'Could not start Twitch login.');}});
const diagnosticSummary=()=>({authenticated:Boolean(state.user),followedStreams:(state.followedStreams||[]).length,hasSchedule:Boolean(state.publishedSchedule||state.schedule),hasDiscovery:Boolean(state.discoveryFeed||state.discovery||state.searchResults),igdbEnriched:(state.followedStreams||[]).filter(x=>(x.genres||[]).length).length});
$('#loadingDownloadLog')?.addEventListener('click',()=>downloadLaunchDiagnostic(diagnosticSummary()));
$('#loadingCopyLog')?.addEventListener('click',async()=>{const b=$('#loadingCopyLog');try{await copyLaunchDiagnostic(diagnosticSummary());b.textContent='Copied';setTimeout(()=>b.textContent='Copy diagnostic log',1800)}catch{b.textContent='Copy failed'}});
$('#loadingRetry')?.addEventListener('click',()=>{recordLaunchEvent('recovery','manual retry');location.reload()});
$('#loadingBackToLogin')?.addEventListener('click',()=>{recordLaunchEvent('recovery','back to login');showLoggedOut('Loading was cancelled. You can try signing in again.')});
setInterval(()=>{if($('#workspaceLoading')?.hidden)return;const sec=launchElapsedSeconds(),el=$('#loadingElapsed');if(el)el.textContent=sec+'s';const st=$('#loadingStatusText');if(st&&sec>=15)st.textContent='Still working — you can download a diagnostic log below.';if(st&&sec>=30)st.textContent='This is taking longer than expected. Try Retry loading or send us the diagnostic log.'},1000);
bindIGDBGameInputs();
initUnifiedFilters();renderWorkspaceControls();
$$('[data-source]').forEach(b=>b.onclick=()=>{$$('[data-source]').forEach(x=>x.classList.remove('active'));b.classList.add('active');discoverySource=b.dataset.source;renderTools();renderCompactNetwork()});
['scheduleFollowerSearch','scheduleMinOverlap','scheduleDay','scheduleMatchGame','scheduleLiveOnly','scheduleSort'].forEach(id=>$('#'+id)?.addEventListener(id==='scheduleFollowerSearch'?'input':'change',renderFollowerScheduleMatches));
['networkSearch','networkRelation','networkGenre','networkLive','networkSort'].forEach(id=>$('#'+id)?.addEventListener(id==='networkSearch'?'input':'change',renderCompactNetwork));
$$('[data-goal]').forEach(b=>b.onclick=()=>{$$('[data-goal]').forEach(x=>x.classList.remove('active'));b.classList.add('active');workspace.goal=b.dataset.goal;saveWorkspace({goal:workspace.goal})});
$('#resultSort')?.addEventListener('change',e=>{workspace.sort=e.target.value;saveWorkspace({sort:workspace.sort});renderTools()});
$('#pageSize')?.addEventListener('change',e=>{workspace.pageSize=Number(e.target.value);saveWorkspace({pageSize:workspace.pageSize});renderTools()});
$('#savePreset')?.addEventListener('click',()=>{const name=prompt('Preset name');if(!name)return;const next=savePreset(name,filtersFor('raid'),workspace.weights);workspace.presets=next.presets;renderPresets()});
$$('.nerdspace-filter-panel').forEach(p=>{p.addEventListener('change',renderUnifiedFilterChips);p.addEventListener('input',renderUnifiedFilterChips)});$('#gameFilterSearch')?.addEventListener('input',renderFilteredGames);$('#gameFilterGenre')?.addEventListener('change',renderFilteredGames);
$('#toggleGameSignals')?.addEventListener('click',()=>{showAllGameSignals=!showAllGameSignals;renderGameSignals();renderFilteredGames()});
$('#scheduleScanBtn')?.addEventListener('click',scanScheduleBatch);$('#scheduleScanMoreBtn')?.addEventListener('click',scanScheduleBatch);
$('#cleanupScanBtn')?.addEventListener('click',scanCleanupBatch);$('#cleanupScanMoreBtn')?.addEventListener('click',scanCleanupBatch);
['cleanupDate','cleanupStatus','cleanupType'].forEach(id=>$('#'+id)?.addEventListener('change',renderCleanup));$('#cleanupSearch')?.addEventListener('input',renderCleanup);
$('#drawerClose')?.addEventListener('click',closeCreatorDrawer);$('#drawerBackdrop')?.addEventListener('click',closeCreatorDrawer);
$('#creatorSearchForm').addEventListener('submit',e=>{e.preventDefault();creatorSearch($('#creatorSearchInput').value)});
try{const consumed=consumeOAuthHash();recordLaunchEvent('auth','oauth callback checked',consumed?'callback consumed':'no callback payload')}catch(e){recordLaunchEvent('auth','oauth callback error',e?.message||String(e));state.errors.push({time:new Date().toISOString(),message:e.message});$('#loginError').textContent=e.message;showLoggedOut(e.message)}load();if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
