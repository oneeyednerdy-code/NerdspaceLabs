import {getUser,getChannel,getStream,getRecentVideos,getGames,getFollowedStreams,getFollowedChannels,getClips,getFollowerTotal,getSchedule,getSchedules,getUsers,getChannels} from './twitch.js';
import {getTwitchTrackerSummary,getTwitchTrackerGameSummaries} from './twitchtracker.js';
import {getIGDBGames} from './igdb.js';
export async function loadCreatorData(userId){
 const status={}; const safe=async(name,fn,fallback)=>{try{const value=await fn();status[name]={ok:true,count:Array.isArray(value)?value.length:(value instanceof Map?value.size:undefined)};return value}catch(e){status[name]={ok:false,error:e.message};return fallback}};
 const user=await safe('twitch.identity',()=>getUser(userId),null); if(!user)return {status,user:null};
 const [channel,stream,videos,followedStreams,followedChannels,clips,followerTotal,publishedSchedule,tracker]=await Promise.all([
  safe('twitch.channel',()=>getChannel(userId),null),safe('twitch.live',()=>getStream(userId),null),safe('twitch.vods',()=>getRecentVideos(userId,100),[]),
  safe('twitch.followedLive',()=>getFollowedStreams(userId,500),[]),safe('twitch.followedChannels',()=>getFollowedChannels(userId,1000),[]),
  safe('twitch.clips',()=>getClips(userId,100),[]),safe('twitch.followers',()=>getFollowerTotal(userId),null),
  safe('twitch.schedule',()=>getSchedule(userId,50),[]),safe('twitchtracker.summary',()=>getTwitchTrackerSummary(user.login),null)
 ]);
 const followedIds=followedChannels.map(x=>x.broadcaster_id);
 const liveIds=followedStreams.map(s=>s.user_id);
 const [profiles,liveChannels,schedules]=await Promise.all([
   safe('twitch.networkProfiles',()=>getUsers(followedIds),[]),
   safe('twitch.networkChannels',()=>getChannels(liveIds),[]),
   safe('twitch.networkSchedules',()=>getSchedules(liveIds,24),new Map())
 ]);
 const channelMap=new Map(liveChannels.map(c=>[c.broadcaster_id,c]));
 const enrichedStreams=followedStreams.map(s=>({...channelMap.get(s.user_id),...s,tags:s.tags?.length?s.tags:(channelMap.get(s.user_id)?.tags||[]),content_classification_labels:s.content_classification_labels?.length?s.content_classification_labels:(channelMap.get(s.user_id)?.content_classification_labels||[])}));
 const gameIds=[...clips.map(c=>c.game_id),channel?.game_id,...enrichedStreams.map(s=>s.game_id)].filter(Boolean);
 const games=await safe('twitch.games',()=>getGames(gameIds),[]);
 const trackerGames=await safe('twitchtracker.games',()=>getTwitchTrackerGameSummaries([...new Set(enrichedStreams.map(s=>s.game_id).filter(Boolean))],12),new Map());
 const igdbIds=games.map(g=>g.igdb_id).filter(Boolean);
 const igdbGames=await safe('igdb.games',()=>getIGDBGames(igdbIds),[]);
 const twitchToIgdb=new Map(games.filter(g=>g.igdb_id).map(g=>[g.id,String(g.igdb_id)]));
 const igdbMap=new Map(igdbGames.map(g=>[String(g.id),g]));
 const enrichedWithGenre=enrichedStreams.map(st=>{const ig=igdbMap.get(twitchToIgdb.get(st.game_id));return {...st,genres:(ig?.genres||[]).map(x=>x.name),themes:(ig?.themes||[]).map(x=>x.name),game_modes:(ig?.game_modes||[]).map(x=>x.name)}});
 return {status,user,channel,stream,videos,followedStreams:enrichedWithGenre,followedChannels,clips,followerTotal,publishedSchedule,tracker,games,trackerGames,igdbGames,profiles,schedules};
}
