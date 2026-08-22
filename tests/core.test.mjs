import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGameHistory, buildGameSignals } from '../js/engines/game-radar.js';
import { inferSchedule } from '../js/engines/schedule.js';

test('game history groups clip category evidence',()=>{
  const videos=[{game_id:'1',view_count:10},{game_id:'1',view_count:20},{game_id:'2',view_count:5}];
  const games=[{id:'1',name:'Game A'},{id:'2',name:'Game B'}];
  const out=summarizeGameHistory(videos,games);
  assert.equal(out[0].name,'Game A'); assert.equal(out[0].clips,2); assert.equal(out[0].avgClipViews,15);
});

test('game radar excludes recent games',()=>{
  const out=buildGameSignals([{name:'Game A'}],[{game_name:'Game A',viewer_count:20},{game_name:'Game B',viewer_count:30}]);
  assert.equal(out.length,1); assert.equal(out[0].name,'Game B');
});

test('schedule inference requires repeated evidence',()=>{
  const videos=[
    {created_at:'2026-08-03T17:00:00Z'},
    {created_at:'2026-08-10T17:10:00Z'},
    {created_at:'2026-08-17T17:05:00Z'}
  ];
  const out=inferSchedule(videos);
  assert.equal(out.length,1); assert.ok(out[0].confidence>=35);
});
import { rankRaidCandidates } from '../js/integrations/wormhole.js';
import { scheduleCompatibility, scheduleProfile, findCommonWindows } from '../js/integrations/solstice.js';
import { creatorMatch } from '../js/integrations/nerdsync.js';

test('Wormhole raid integration favors similar audience and same game',()=>{
 const me={user_id:'1',viewer_count:20,started_at:new Date(Date.now()-3600000).toISOString(),game_id:'g',tags:['English','MMO']};
 const ranked=rankRaidCandidates(me,[
  {user_id:'2',user_name:'Near',viewer_count:24,started_at:new Date(Date.now()-3700000).toISOString(),game_id:'g',tags:['English','MMO']},
  {user_id:'3',user_name:'Far',viewer_count:200,started_at:new Date(Date.now()-100000).toISOString(),game_id:'x',tags:['Speedrun']}
 ]);
 assert.equal(ranked[0].user_name,'Near');
 assert.ok(ranked[0].raidScore>ranked[1].raidScore);
});

test('Solstice integration detects direct schedule overlap',()=>{
 const a={segments:[{startTime:'2026-08-24T17:00:00Z',endTime:'2026-08-24T20:00:00Z'}]};
 const b={segments:[{startTime:'2026-08-24T18:00:00Z',endTime:'2026-08-24T21:00:00Z'}]};
 const r=scheduleCompatibility(a,b); assert.equal(r.overlapMinutes,120); assert.ok(r.score>0);
});

test('NerdSync integration returns explainable component scores',()=>{
 const me={viewer_count:20,game_id:'g',tags:['English','MMO']}, other={viewer_count:25,game_id:'g',tags:['English','MMO']};
 const sched={segments:[{startTime:'2026-08-24T17:00:00Z',endTime:'2026-08-24T20:00:00Z'}]};
 const r=creatorMatch(me,other,sched,sched); assert.ok(r.score>=80); assert.equal(r.games,100); assert.ok(r.schedule>=60);
});

import { filterCreators } from '../js/engines/filter-engine.js';
test('filter engine combines game tags language and viewers',()=>{
 const rows=[{user_name:'A',game_name:'SWTOR',viewer_count:20,language:'en',tags:['LGBTQIA+','MMO']},{user_name:'B',game_name:'Other',viewer_count:90,language:'en',tags:['FPS']}];
 assert.equal(filterCreators(rows,{games:['SWTOR'],tags:['LGBTQIA+'],language:'en',minViewers:10,maxViewers:50}).length,1);
});

test('filter engine supports IGDB genres',()=>{
 const rows=[{user_name:'A',game_name:'Game A',viewer_count:20,language:'en',tags:[],genres:['Role-playing (RPG)','Adventure']},{user_name:'B',game_name:'Game B',viewer_count:20,language:'en',tags:[],genres:['Shooter']}];
 assert.equal(filterCreators(rows,{genres:['Role-playing (RPG)']}).length,1);
});

test('Solstice weekly overlap matches same weekday across different weeks',()=>{
 const a=scheduleProfile([{start_time:'2026-08-05T17:00:00Z',end_time:'2026-08-05T21:00:00Z',is_recurring:true}],[]);
 const b=scheduleProfile([{start_time:'2026-08-12T18:00:00Z',end_time:'2026-08-12T20:00:00Z',is_recurring:true}],[]);
 const r=scheduleCompatibility(a,b);
 assert.equal(r.overlapMinutes,120);
 assert.ok(r.sharedDays.includes('Wed'));
 assert.ok(r.score>=45);
});

test('common window finder returns shared weekly availability',()=>{const a=scheduleProfile([{start_time:'2026-08-05T17:00:00Z',end_time:'2026-08-05T21:00:00Z'}],[]),b=scheduleProfile([{start_time:'2026-08-12T18:00:00Z',end_time:'2026-08-12T20:30:00Z'}],[]),w=findCommonWindows([a,b],120);assert.ok(w.length>=1);assert.equal(w[0].day,3);assert.ok(w[0].minutes>=120)});

test('image proxy helper keeps Twitch images same-origin', async()=>{
 const {proxiedImage}=await import('../js/services/images.js');
 const x=proxiedImage('https://static-cdn.jtvnw.net/jtv_user_pictures/example.png');
 assert.ok(x.startsWith('/api/image?url='));
 assert.ok(decodeURIComponent(x).includes('static-cdn.jtvnw.net'));
});

test('pagination bounds result pages',async()=>{const {paginate}=await import('../js/engines/pagination.js');const p=paginate(Array.from({length:25},(_,i)=>i),2,12);assert.equal(p.items.length,12);assert.equal(p.pages,3)});

test('genre taxonomy includes MMO and normalizes IGDB massively multiplayer',async()=>{const {CREATOR_GENRES,normalizeGenre}=await import('../js/engines/genre-taxonomy.js');assert.ok(CREATOR_GENRES.includes('MMO'));assert.equal(normalizeGenre('Massively Multiplayer'),'MMO')});

test('all primary filter surfaces use unified Wormhole filter panels',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');for(const id of ['raid','match','schedule','network','games'])assert.ok(html.includes(`data-unified-filter="${id}"`),id+' missing unified filter')});

test('logged-out launch shell exists and authenticated app starts hidden',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok(html.includes('id="authGate"'));assert.ok(html.includes('id="workspaceLoading"'));assert.match(html,/id="authenticatedApp"[^>]*hidden|hidden[^>]*id="authenticatedApp"/);assert.ok(html.includes('id="launchLoginBtn"'))});
test('launch flow exposes logged out loading and ready states',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/services/launch-flow.js',import.meta.url),'utf8');for(const x of ['loggedOut','loading','ready','setStep'])assert.ok(src.includes(x))});

test('loading screen exposes activity and diagnostic recovery controls',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');for(const id of ['loadingElapsed','loadingStatusText','loadingDownloadLog','loadingCopyLog','loadingRetry','loadingBackToLogin'])assert.ok(html.includes(`id="${id}"`),id)});
test('launch diagnostics redact secret-like values',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/services/launch-diagnostics.js',import.meta.url),'utf8');for(const x of ['access_token','refresh_token','client_secret','authorization','REDACTED'])assert.ok(src.includes(x))});

test('launch login invokes Twitch beginLogin directly',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.match(src,/launchLoginBtn[\s\S]{0,500}beginLogin\(\)/);assert.ok(!src.includes("$('#loginBtn')||$('[data-login]')"))});

test('version is visible on login loading and transition states',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok((html.match(/1\.22\.1/g)||[]).length>=3);for(const id of ['authGate','workspaceLoading','workspaceTransition'])assert.ok(html.includes(`id="${id}"`))});
test('workspace transition bridges initial populated render',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(src.includes('workspace core ready'));assert.ok(src.includes('workspace rendered'));assert.ok(src.includes('requestAnimationFrame'))});

test('raid and match result grids remain inside their hidden views',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');for(const [view,result] of [['raid','raidList'],['match','creatorMatchList']]){const start=html.indexOf(`<section id="${view}"`),next=html.indexOf('<section id="',start+20),pos=html.indexOf(`id="${result}"`,start);assert.ok(start>=0&&pos>start&&(next<0||pos<next),`${result} escaped ${view}`)}})
test('unified raid and match filter content is nested before panel close',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');for(const id of ['raid','match']){const p=html.indexOf(`data-unified-filter="${id}"`),content=html.indexOf('filters-panel__content',p),close=html.indexOf('</section>',p);assert.ok(content>p&&content<close,`${id} filter content outside panel`)}})

test('network filter content is nested inside its unified panel',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');const p=html.indexOf('data-unified-filter="network"'),content=html.indexOf('filters-panel__content',p),close=html.indexOf('</section>',p),planner=html.indexOf('<section id="planner"',p);assert.ok(content>p&&content<close);assert.ok(close<planner)})
test('navigation uses delegated click handling and validates views',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(src.includes("e.target.closest('[data-view]')"));assert.ok(src.includes("classList.contains('view')"));assert.ok(src.includes("'navigation','view opened'"))})

test('creator search has dedicated non-overlap layout',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(src.includes('creator-search-card'));assert.ok(src.includes('creator-search-avatar'));assert.ok(src.includes('creator-search-description'))})
test('creator match canonical genres always include MMO',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(src.includes('...CREATOR_GENRES'));const tax=await fs.readFile(new URL('../js/engines/genre-taxonomy.js',import.meta.url),'utf8');assert.ok(tax.includes("'MMO'"))})
test('schedule scan uses Twitch schedule then 30 day VOD fallback',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(src.includes('getSchedule(c.user_id,25)'));assert.ok(src.includes('getRecentVideos(c.user_id,20)'));assert.ok(src.includes('30-day VOD timing'));assert.ok(src.includes('scheduleCompatibility(mine,theirs)'))})
test('network explorer has ranked result host and fit sorting',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(html.includes('id="networkResults"'));assert.ok(html.includes('id="networkSort"'));assert.ok(src.includes('networkFit(c)'))})
test('network cleanup is manual review not automatic unfollow',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(html.includes('id="cleanupDate"'));assert.ok(src.includes('Review on Twitch'));assert.ok(src.includes('scanCleanupBatch'));assert.ok(!src.includes('deleteFollow('))})
test('data inspector groups and explains providers',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(html.includes('id="providerSummary"'));assert.ok(src.includes('PROVIDER_INFO'));assert.ok(src.includes("'Core Twitch'"));assert.ok(src.includes("'Supplemental'"))})

test('cleanup defaults visible and filters Twitch account type',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.match(html,/id="cleanupStatus"><option value="all">/);assert.ok(html.includes('id="cleanupType"'));assert.ok(src.includes('getUsers(batch.map(c=>c.user_id))'));assert.ok(src.includes("profile.broadcaster_type==='affiliate'"))})
test('network special Twitch categories do not require IGDB genre enrichment',async()=>{const fs=await import('node:fs/promises');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(src.includes("['Just Chatting','IRL'].includes(genre)"));assert.ok(src.includes("c.game_name||''"))})
test('schedule match filters by typed game instead of genre',async()=>{const fs=await import('node:fs/promises');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');const src=await fs.readFile(new URL('../js/app.js',import.meta.url),'utf8');assert.ok(html.includes('id="scheduleMatchGame"'));assert.ok(!html.includes('id="scheduleMatchGenre"'));assert.ok(src.includes("$('#scheduleMatchGame')"))})
test('IGDB game autocomplete has worker route and service',async()=>{const fs=await import('node:fs/promises');const worker=await fs.readFile(new URL('../worker.js',import.meta.url),'utf8');const service=await fs.readFile(new URL('../js/services/igdb.js',import.meta.url),'utf8');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok(worker.includes('/api/igdb/search'));assert.ok(service.includes('searchIGDBGames'));assert.ok(html.includes('id="igdbGameOptions"'));assert.ok((html.match(/igdb-game-input/g)||[]).length>=4)})
