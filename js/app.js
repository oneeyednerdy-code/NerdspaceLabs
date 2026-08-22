import { APP_CONFIG } from '../config.js';
import { beginLogin, consumeOAuthHash, validateToken, logout } from './auth.js';
import { storage } from './storage.js';
import { getUser,getChannel,getStream,getRecentVideos,getGames,getFollowedStreams,getSchedule } from './services/twitch.js';
import { getTwitchTrackerSummary } from './services/twitchtracker.js';
import { summarizeGameHistory,buildGameSignals } from './engines/game-radar.js';
import { inferSchedule } from './engines/schedule.js';
import { buildSignals } from './engines/signals.js';
import { downloadDiagnostics } from './diagnostics.js';

const state={user:null,channel:null,stream:null,videos:[],followedStreams:[],publishedSchedule:[],inferredSchedule:[],gameHistory:[],gameSignals:[],tracker:null,errors:[]};
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setStatus(text,kind=''){ const e=$('#systemStatus'); e.textContent=text; e.dataset.kind=kind; }
function fmtHour(h){const d=new Date();d.setHours(h,0,0,0);return d.toLocaleTimeString([],{hour:'numeric'});}
function showView(id){$$('.view').forEach(v=>v.hidden=v.id!==id);$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));}

function render(){
  $('#version').textContent=`ALPHA ${APP_CONFIG.version}`;
  $('#loginView').hidden=Boolean(state.user);
  $('#appShell').hidden=!state.user;
  if(!state.user)return;
  $('#avatar').src=state.user.profile_image_url||'';
  $('#displayName').textContent=state.user.display_name;
  $('#loginName').textContent='@'+state.user.login;
  $('#livePill').textContent=state.stream?'LIVE':'OFFLINE';
  $('#livePill').className='status-pill '+(state.stream?'good':'');
  $('#channelGame').textContent=state.stream?.game_name||state.channel?.game_name||'No category';
  $('#viewerStat').textContent=state.stream?.viewer_count ?? '—';
  $('#vodStat').textContent=state.videos.length;
  $('#networkStat').textContent=state.followedStreams.length;
  $('#scheduleStat').textContent=state.publishedSchedule.length ? 'Published' : (state.inferredSchedule.length?'Observed':'Limited');

  $('#signals').innerHTML=buildSignals({...state}).map(s=>`<article class="signal-card"><span>${esc(s.type)}</span><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></article>`).join('');

  $('#raidList').innerHTML=state.followedStreams.slice().sort((a,b)=>a.viewer_count-b.viewer_count).slice(0,12).map(s=>`<article class="creator-card"><div><strong>${esc(s.user_name)}</strong><small>${esc(s.game_name||'No category')}</small></div><div class="metric">${s.viewer_count}<small>viewers</small></div></article>`).join('') || '<p class="empty">No followed live channels returned by Twitch.</p>';

  $('#gameHistory').innerHTML=state.gameHistory.slice(0,8).map(g=>`<article class="data-row"><div><strong>${esc(g.name)}</strong><small>${g.streams} recent broadcasts</small></div><div class="metric">${g.avgVodViews}<small>avg VOD views</small></div></article>`).join('')||'<p class="empty">Not enough recent VOD game history yet.</p>';
  $('#gameRadar').innerHTML=state.gameSignals.map(g=>`<article class="recommend-card"><span>EXPERIMENTAL • ${g.score}% SIGNAL</span><h3>${esc(g.name)}</h3><p>${g.channels} followed creators live • ${g.viewers.toLocaleString()} combined current viewers</p><small>Suggested because it appears in your live creator network but not your recent game history.</small></article>`).join('')||'<p class="empty">No adjacent game signals available right now.</p>';

  $('#scheduleList').innerHTML=(state.publishedSchedule.length?state.publishedSchedule.slice(0,8).map(s=>({label:new Date(s.start_time).toLocaleString(),confidence:'CONFIRMED',detail:s.title||s.category?.name||'Scheduled stream'})):state.inferredSchedule.map(s=>({label:`${s.day} around ${fmtHour(s.hour)}`,confidence:`${s.confidence}%`,detail:`Observed in ${s.count} recent broadcasts`}))).map(x=>`<article class="data-row"><div><strong>${esc(x.label)}</strong><small>${esc(x.detail)}</small></div><div class="confidence">${esc(x.confidence)}</div></article>`).join('')||'<p class="empty">No schedule evidence available.</p>';

  $('#trackerData').textContent=state.tracker ? 'Historical context available' : 'Supplemental history unavailable';
}

async function load(){
  setStatus('CONNECTING TO TWITCH…');
  const valid=await validateToken();
  if(!valid){render();setStatus('READY');return;}
  try{
    state.user=await getUser(valid.user_id);
    const [channel,stream,videos,followed,published,tracker]=await Promise.all([
      getChannel(valid.user_id),getStream(valid.user_id),getRecentVideos(valid.user_id,20),
      getFollowedStreams(valid.user_id,100),getSchedule(valid.user_id),
      getTwitchTrackerSummary(state.user?.login)
    ]);
    Object.assign(state,{channel,stream,videos,followedStreams:followed,publishedSchedule:published,tracker});
    const games=await getGames(videos.map(v=>v.game_id));
    state.gameHistory=summarizeGameHistory(videos,games);
    state.gameSignals=buildGameSignals(state.gameHistory,followed);
    state.inferredSchedule=inferSchedule(videos);
    storage.set('last-profile',{displayName:state.user.display_name,updatedAt:Date.now()});
    setStatus('SIGNAL LOCKED','good');
  }catch(e){state.errors.push({time:new Date().toISOString(),message:e.message});setStatus('PARTIAL SIGNAL','warn');}
  render();
}

$('#connectBtn').addEventListener('click',()=>{try{beginLogin()}catch(e){$('#loginError').textContent=e.message;}});
$('#logoutBtn').addEventListener('click',()=>{logout();location.reload();});
$('#diagnosticsBtn').addEventListener('click',()=>downloadDiagnostics(state));
$('#clearDataBtn').addEventListener('click',()=>{storage.clearLocalData();setStatus('LOCAL DATA CLEARED','good');});
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

try{consumeOAuthHash();}catch(e){state.errors.push({time:new Date().toISOString(),message:e.message});$('#loginError').textContent=e.message;}
load();