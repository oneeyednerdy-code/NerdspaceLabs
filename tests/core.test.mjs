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
import { scheduleCompatibility } from '../js/integrations/solstice.js';
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
