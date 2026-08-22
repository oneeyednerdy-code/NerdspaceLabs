import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGameHistory, buildGameSignals } from '../js/engines/game-radar.js';
import { inferSchedule } from '../js/engines/schedule.js';

test('game history groups VODs by game',()=>{
  const videos=[{game_id:'1',view_count:10},{game_id:'1',view_count:20},{game_id:'2',view_count:5}];
  const games=[{id:'1',name:'Game A'},{id:'2',name:'Game B'}];
  const out=summarizeGameHistory(videos,games);
  assert.equal(out[0].name,'Game A'); assert.equal(out[0].streams,2); assert.equal(out[0].avgVodViews,15);
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