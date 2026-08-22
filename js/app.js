import { APP_CONFIG } from '../config.js';
import { beginLogin, consumeOAuthHash, validateToken, logout } from './auth.js';
import { storage } from './storage.js';
import { loadCreatorData } from './services/data-orchestrator.js';
import { getUserByLogin,getChannel,getStream,searchChannels } from './services/twitch.js';
import { summarizeGameHistory,buildGameSignals } from './engines/game-radar.js';
import { inferSchedule } from './engines/schedule.js';
import { buildSignals } from './engines/signals.js';
import { filterCreators,uniqueOptions } from './engines/filter-engine.js';
import { rankRaidCandidates } from './integrations/wormhole.js';
import { scheduleProfile,formatOverlap,weeklyWindows,findCommonWindows } from './integrations/solstice.js';
import { creatorMatch } from './integrations/nerdsync.js';
import { downloadDiagnostics } from './diagnostics.js';
import { getLists,toggleList,setNote,clearLists } from './engines/local-lists.js';
import { proxiedImage } from './services/images.js';
import { getWorkspace,saveWorkspace,savePreset } from './engines/workspace-settings.js';
import { paginate } from './engines/pagination.js';
import { normalizeGenre } from './engines/genre-taxonomy.js';
import { createLaunchFlow } from './services/launch-flow.js';

const state={user:null,channel:null,stream:null,videos:[],followedStreams:[],followedChannels:[],clips:[],followerTotal:null,publishedSchedule:[],inferredSchedule:[],gameHistory:[],gameSignals:[],tracker:null,igdbGames:[],raidMatches:[],creatorMatches:[],providerStatus:{},profiles:[],schedules:new Map(),errors:[]};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profileMap=()=>new Map(state.profiles.map(p=>[p.id,p]));
function setStatus(t,k=''){const e=$('#systemStatus');e.textContent=t;e.dataset.kind=k}
function showView(id){$$('.view').forEach(v=>v.hidden=v.id!==id);$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id))}
function observedSegments(videos=[]){return videos.slice(0,30).map(v=>{const start=new Date(v.created_at);const h=Number(String(v.duration).match(/(\d+)h/)?.[1]||0),m=Number(String(v.duration).match(/(\d+)m/)?.[1]||0);const end=new Date(start.getTime()+Math.max(60,h*60+m)*60000);return {startTime:start.toISOString(),endTime:end.toISOString()}})}
function referenceStream(){if(state.stream)return state.stream;const v=state.videos[0];if(!v)return null;return {user_id:state.user.id,viewer_count:state.tracker?.avg_viewers||state.tracker?.average_viewers||Math.max(1,v.view_count||1),started_at:v.created_at,game_id:state.channel?.game_id||'',game_name:state.channel?.game_name||'',tags:state.channel?.tags||[]}}
function providerRows(){return Object.entries(state.providerStatus).map(([k,v])=>`<article class="data-row"><div><strong>${esc(k)}</strong><small>${v.ok?`Loaded${Number.isFinite(v.count)?` • ${v.count} records`:''}`:esc(v.error||'Unavailable')}</small></div><div class="confidence ${v.ok?'good':''}">${v.ok?'OK':'!'}</div></article>`).join('')}
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
 const games=uniqueOptions(state.followedStreams,'game_name'),langs=uniqueOptions(state.followedStreams,'language'),genres=[...new Set(state.followedStreams.flatMap(x=>x.genres||[]))].sort((a,b)=>a.localeCompare(b));
 options($('#raidGame'),games);options($('#matchGame'),games);options($('#raidGenre'),genres);options($('#matchGenre'),genres);options($('#raidLanguage'),langs);options($('#matchLanguage'),langs);
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
  const mine=state.mySchedule||state.schedule||[];
  const theirs=c.schedule||c.inferred_schedule||c.schedule_segments||[];
  try{const e=solsticeEvidence(mine,theirs);return {minutes:e.overlapMinutes||e.overlap_minutes||0,score:e.schedule||e.score||0}}catch{return {minutes:c.overlapMinutes||0,score:0}}
}
function renderFollowerScheduleMatches(){
  const host=$('#scheduleFollowerMatches');if(!host)return;
  const q=($('#scheduleFollowerSearch')?.value||'').trim().toLowerCase(),min=Number($('#scheduleMinOverlap')?.value||0),day=$('#scheduleDay')?.value||'',genre=$('#scheduleMatchGenre')?.value||'',liveOnly=$('#scheduleLiveOnly')?.checked;
  let rows=(state.followedStreams||[]).map(c=>({c,e:scheduleEvidence(c)})).filter(({c,e})=>(!q||[c.user_name,c.game_name,...(c.tags||[])].join(' ').toLowerCase().includes(q))&&e.minutes>=min&&(!genre||creatorGenres(c).includes(genre))&&(!liveOnly||c.type==='live'||c.viewer_count!=null)&&(!day||(c.schedule_days||[]).includes(day)));
  const sort=$('#scheduleSort')?.value||'overlap';rows.sort((a,b)=>sort==='name'?String(a.c.user_name).localeCompare(String(b.c.user_name)):sort==='viewers'?(b.c.viewer_count||0)-(a.c.viewer_count||0):b.e.minutes-a.e.minutes);
  $('#scheduleMatchCount').textContent=rows.length;
  host.innerHTML=rows.map(({c,e})=>`<article class="schedule-match-card">${c.profile_image_url?`<img src="${esc(proxiedImage(c.profile_image_url))}" alt="">`:'<div></div>'}<div><strong>${esc(c.user_name||c.user_login)}</strong><div class="muted">${esc(c.game_name||'Offline / no current category')}</div><div class="muted">${creatorGenres(c).slice(0,3).map(esc).join(' · ')}</div></div><span class="overlap-pill">${Math.floor(e.minutes/60)}h ${e.minutes%60}m overlap</span></article>`).join('')||'<div class="empty">No followed creators match these schedule filters.</div>';
}
function renderCompactNetwork(){
  const host=$('#networkResults');if(!host)return;
  const q=($('#networkSearch')?.value||'').trim().toLowerCase(),rel=$('#networkRelation')?.value||'all',genre=$('#networkGenre')?.value||'',live=$('#networkLive')?.value||'all';
  const ids=new Set(rel==='saved'?(state.localLists?.favorites||[]):rel==='collabs'?(state.localLists?.collabs||[]):rel==='raidLater'?(state.localLists?.raidLater||[]):[]);
  let rows=discoveryPool().filter(c=>(!q||[c.user_name,c.game_name,...(c.tags||[])].join(' ').toLowerCase().includes(q))&&(!genre||creatorGenres(c).includes(genre))&&(live==='all'||(live==='live'?(c.type==='live'||c.viewer_count!=null):!(c.type==='live'||c.viewer_count!=null)))&&(rel==='all'||(rel==='following'&&isFollowingCreator(c))||(rel!=='following'&&rel!=='all'&&ids.has(String(c.user_id)))));
  $('#networkVisibleCount').textContent=rows.length;
  host.innerHTML=rows.slice(0,60).map(c=>creatorCard({stream:c,score:0,evidence:{}},'network')).join('')||'<div class="empty">No creators match these network filters.</div>';bindCrossToolActions();bindCreatorDetails();bindImageFallbacks();
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
function launchStep(name,status,label){launchFlow.setStep(name,status,label)}
function showLoggedOut(message=''){launchFlow.loggedOut(message)}
function showWorkspaceLoading(){launchFlow.loading();launchStep('identity','active','Loading')}
function showAuthenticatedWorkspace(){launchFlow.ready()}

function render(){
  if(state.user){launchStep('identity','done','Ready');if(state.followedStreams||state.following)launchStep('following','done','Ready');if(state.publishedSchedule||state.schedule)launchStep('schedule','done','Ready');if(state.videos?.length)launchStep('history','done','Ready');if(state.discoveryFeed||state.discovery||state.searchResults)launchStep('discovery','done','Ready');if((state.followedStreams||[]).some(x=>(x.genres||[]).length))launchStep('igdb','done','Ready');showAuthenticatedWorkspace()}else{showLoggedOut()}
 $('#version').textContent=`ALPHA ${APP_CONFIG.version}`;$('#loginView').hidden=Boolean(state.user);$('#appShell').hidden=!state.user;if(!state.user)return;
 $('#avatar').src=proxiedImage(state.user.profile_image_url||'');$('#displayName').textContent=state.user.display_name;$('#loginName').textContent='@'+state.user.login;$('#livePill').textContent=state.stream?'LIVE':'OFFLINE';$('#livePill').className='status-pill '+(state.stream?'good':'');$('#channelGame').textContent=state.stream?.game_name||state.channel?.game_name||'No category';$('#viewerStat').textContent=state.stream?.viewer_count??'—';$('#vodStat').textContent=state.videos.length;$('#networkStat').textContent=state.followedStreams.length;$('#scheduleStat').textContent=state.publishedSchedule.length?'Published':(state.inferredSchedule.length?'Observed':'Limited');
 $('#signals').innerHTML=buildSignals({...state}).map(s=>`<article class="signal-card"><span>${esc(s.type)}</span><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></article>`).join('');
 $('#gameHistory').innerHTML=state.gameHistory.slice(0,12).map(g=>`<article class="data-row"><div><strong>${esc(g.name)}</strong><small>${g.current?'Current category • ':''}${g.clips} clips in 90-day evidence</small></div><button class="mini-btn" data-game-to-raid="${esc(g.name)}">Find creators</button></article>`).join('')||'<p class="empty">Not enough category evidence yet.</p>';
 $('#gameRadar').innerHTML=state.gameSignals.slice(0,12).map(g=>`<article class="recommend-card"><span>EXPERIMENTAL • ${g.score}% SIGNAL</span><h3>${esc(g.name)}</h3><p>${g.channels} followed creators live • ${g.viewers.toLocaleString()} combined current viewers</p><button class="mini-btn" data-game-to-raid="${esc(g.name)}">Find creators</button></article>`).join('')||'<p class="empty">No adjacent game signals available right now.</p>';
 const sched=state.publishedSchedule.length?state.publishedSchedule.slice(0,12).map(s=>({label:new Date(s.start_time).toLocaleString(),confidence:'PUBLISHED',detail:s.title||s.category?.name||'Scheduled stream'})):state.inferredSchedule.map(s=>({label:`${s.day} around ${s.hour}:00`,confidence:`${s.confidence}%`,detail:`Observed in ${s.count} recent broadcasts`}));$('#scheduleList').innerHTML=sched.map(x=>`<article class="data-row"><div><strong>${esc(x.label)}</strong><small>${esc(x.detail)}</small></div><div class="confidence">${esc(x.confidence)}</div></article>`).join('')||'<p class="empty">No schedule evidence available.</p>';
 $('#trackerData').textContent=state.tracker?'TwitchTracker supplemental historical context loaded.':'TwitchTracker unavailable; Twitch features remain active.';$('#providerStatus').innerHTML=providerRows();$('#followerStat').textContent=state.followerTotal??'—';$('#clipStat').textContent=state.clips.length;$('#followingStat').textContent=state.followedChannels.length;
 renderTools();renderFollowerScheduleMatches();renderCompactNetwork();renderUnifiedFilterChips();renderFilteredGames();if($('#resultCount'))$('#resultCount').textContent=state.raidMatches?.length||0;renderNetwork();renderScheduleMatrix();renderCommonWindows();renderSavedCreators();bindImageFallbacks();$$('[data-game-to-raid]').forEach(b=>b.onclick=()=>{showView('raid');$('#raidGame').value=b.dataset.gameToRaid;renderTools()});
}
async function creatorSearch(q){
 const box=$('#creatorSearchResults');box.innerHTML='<p class="empty">Searching Twitch…</p>';
 try{
  const exact=await getUserByLogin(q).catch(()=>null);let results=[];
  if(exact)results=[{user:exact,channel:await getChannel(exact.id).catch(()=>null),stream:await getStream(exact.id).catch(()=>null)}];
  else {const found=await searchChannels(q,40);results=found.map(x=>({user:{id:x.id||x.broadcaster_id,login:x.broadcaster_login,display_name:x.display_name||x.broadcaster_name,profile_image_url:x.thumbnail_url||''},channel:x,stream:x.is_live?{user_id:x.id||x.broadcaster_id,user_login:x.broadcaster_login,user_name:x.display_name||x.broadcaster_name,game_id:x.game_id,game_name:x.game_name,title:x.title,tags:x.tags||[],viewer_count:0,language:x.broadcaster_language}:null}))}
  box.innerHTML=results.map(({user,channel,stream})=>`<article class="creator-tool-card profile-result"><img class="creator-photo" src="${esc(proxiedImage(user.profile_image_url||''))}" alt=""><div class="creator-main"><h3>${esc(user.display_name)}</h3><p>@${esc(user.login)} • ${esc(user.broadcaster_type||'creator')}</p><p>${esc(user.description||channel?.title||'')}</p><div class="tag-row">${(channel?.tags||stream?.tags||[]).slice(0,8).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="creator-actions"><a class="mini-btn" target="_blank" rel="noopener" href="${twitchUrl(user.login)}">View Twitch</a>${channel?.game_name?`<button class="mini-btn" data-send-game="${esc(channel.game_name)}">Send game to Raid Radar</button>`:''}</div></div><div class="scorebox">${stream?'LIVE':'OFFLINE'}<small>${esc(channel?.game_name||'')}</small></div></article>`).join('')||'<p class="empty">No Twitch creator found.</p>';bindCrossToolActions();
 }catch(e){box.innerHTML=`<p class="empty">Search failed: ${esc(e.message)}</p>`}
}
async function load(){setStatus('CONNECTING TO TWITCH…');const valid=await validateToken();if(!valid){render();setStatus('READY');return}const data=await loadCreatorData(valid.user_id);state.providerStatus=data.status;if(!data.user){setStatus('TWITCH IDENTITY FAILED','warn');render();return}Object.assign(state,data);state.inferredSchedule=inferSchedule(state.videos);state.gameHistory=summarizeGameHistory(state.clips,state.games,state.channel);state.gameSignals=buildGameSignals(state.gameHistory,state.followedStreams,state.trackerGames||new Map());const profiles=profileMap();const ref=referenceStream();state.raidMatches=rankRaidCandidates(ref,state.followedStreams,profiles);const mine=scheduleProfile(state.publishedSchedule,observedSegments(state.videos));state.creatorMatches=state.followedStreams.slice(0,80).map(stream=>{const theirs=scheduleProfile(state.schedules.get(stream.user_id)||[],[]);return {stream,match:creatorMatch(ref||{},stream,mine,theirs)}}).filter(x=>x.match.score>0).sort((a,b)=>b.match.score-a.match.score);storage.set('last-profile',{displayName:state.user.display_name,updatedAt:Date.now()});const failures=Object.values(state.providerStatus).filter(x=>!x.ok).length;setStatus(failures?'PARTIAL SIGNAL':'SIGNAL LOCKED',failures?'warn':'good');render()}
$('#connectBtn').addEventListener('click',()=>{try{beginLogin()}catch(e){$('#loginError').textContent=e.message}});$('#logoutBtn').addEventListener('click',()=>{logout();location.reload()});$('#diagnosticsBtn').addEventListener('click',()=>downloadDiagnostics(state));$('#clearDataBtn').addEventListener('click',()=>{storage.clearLocalData();setStatus('LOCAL DATA CLEARED','good')});$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
['raidSearch','raidMin','raidMax','raidGame','raidGenre','raidLanguage','raidTags','matchSearch','matchMin','matchMax','matchGame','matchGenre','matchLanguage','matchTags','matchOverlap'].forEach(id=>$('#'+id)?.addEventListener('input',renderTools));
$('#raidReset').onclick=()=>{['raidSearch','raidMin','raidMax','raidTags'].forEach(id=>$('#'+id).value='');$('#raidGame').value='';$('#raidGenre').value='';$('#raidLanguage').value='';renderTools()};
$('#matchReset').onclick=()=>{['matchSearch','matchMin','matchMax','matchTags'].forEach(id=>$('#'+id).value='');$('#matchGame').value='';$('#matchGenre').value='';$('#matchLanguage').value='';$('#matchOverlap').value='0';renderTools()};
$('#findWindowBtn')?.addEventListener('click',renderCommonWindows);$('#windowMin')?.addEventListener('change',renderCommonWindows);$('#clearListsBtn')?.addEventListener('click',()=>{clearLists();renderSavedCreators()});
$('#launchLoginBtn')?.addEventListener('click',()=>{showWorkspaceLoading();const existing=$('#loginBtn')||$('[data-login]');if(existing)existing.click()});
initUnifiedFilters();renderWorkspaceControls();
$$('[data-source]').forEach(b=>b.onclick=()=>{$$('[data-source]').forEach(x=>x.classList.remove('active'));b.classList.add('active');discoverySource=b.dataset.source;renderTools();renderCompactNetwork()});
['scheduleFollowerSearch','scheduleMinOverlap','scheduleDay','scheduleMatchGenre','scheduleLiveOnly','scheduleSort'].forEach(id=>$('#'+id)?.addEventListener(id==='scheduleFollowerSearch'?'input':'change',renderFollowerScheduleMatches));
['networkSearch','networkRelation','networkGenre','networkLive'].forEach(id=>$('#'+id)?.addEventListener(id==='networkSearch'?'input':'change',renderCompactNetwork));
$$('[data-goal]').forEach(b=>b.onclick=()=>{$$('[data-goal]').forEach(x=>x.classList.remove('active'));b.classList.add('active');workspace.goal=b.dataset.goal;saveWorkspace({goal:workspace.goal})});
$('#resultSort')?.addEventListener('change',e=>{workspace.sort=e.target.value;saveWorkspace({sort:workspace.sort});renderTools()});
$('#pageSize')?.addEventListener('change',e=>{workspace.pageSize=Number(e.target.value);saveWorkspace({pageSize:workspace.pageSize});renderTools()});
$('#savePreset')?.addEventListener('click',()=>{const name=prompt('Preset name');if(!name)return;const next=savePreset(name,filtersFor('raid'),workspace.weights);workspace.presets=next.presets;renderPresets()});
$$('.nerdspace-filter-panel').forEach(p=>{p.addEventListener('change',renderUnifiedFilterChips);p.addEventListener('input',renderUnifiedFilterChips)});$('#gameFilterSearch')?.addEventListener('input',renderFilteredGames);$('#gameFilterGenre')?.addEventListener('change',renderFilteredGames);
$('#drawerClose')?.addEventListener('click',closeCreatorDrawer);$('#drawerBackdrop')?.addEventListener('click',closeCreatorDrawer);
$('#creatorSearchForm').addEventListener('submit',e=>{e.preventDefault();creatorSearch($('#creatorSearchInput').value)});
try{consumeOAuthHash()}catch(e){state.errors.push({time:new Date().toISOString(),message:e.message});$('#loginError').textContent=e.message}load();if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
