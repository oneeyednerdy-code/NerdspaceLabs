import {getUser,getChannel,getStream,getRecentVideos,getGames,getFollowedStreams,getFollowedChannels,getClips,getFollowerTotal,getSchedule,getSchedules,getUsers,getChannels} from './twitch.js';
import {getTwitchTrackerSummary,getTwitchTrackerGameSummaries} from './twitchtracker.js';
import {getIGDBGames} from './igdb.js';
export async function loadCreatorData(userId){
 const status={}; const safe=async(name,fn,fallback)=>{try{const value=await fn();status[name]={ok:true,count:Array.isArray(value)?value.length:(value instanceof Map?value.size:undefined)};return value}catch(e){status[name]={ok:false,error:e.message};return fallback}};
 const user=await safe('twitch.identity',()=>getUser(userId),null); if(!user)return {status,user:null};
 status['twitch.myProfileImage']={ok:Boolean(user.profile_image_url),count:user.profile_image_url?1:0,error:user.profile_image_url?'':'Twitch returned no profile_image_url'};
 const [channel,stream,videos,followedStreams,followedChannels,clips,followerTotal,publishedSchedule,tracker]=await Promise.all([
  safe('twitch.channel',()=>getChannel(userId),null),safe('twitch.live',()=>getStream(userId),null),safe('twitch.vods',()=>getRecentVideos(userId,100),[]),
  safe('twitch.followedLive',()=>getFollowedStreams(userId,500),[]),safe('twitch.followedChannels',()=>getFollowedChannels(userId,1000),[]),
  safe('twitch.clips',()=>getClips(userId,100),[]),safe('twitch.followers',()=>getFollowerTotal(userId),null),
  safe('twitch.schedule',()=>getSchedule(userId,50),[]),safe('twitchtracker.summary',()=>getTwitchTrackerSummary(user.login),null)
 ]);
 const followedIds=followedChannels.map(x=>x.broadcaster_id);
 const liveIds=followedStreams.map(s=>s.user_id);
 const profileIds=[...new Set([...followedIds,...liveIds,userId])];
 const [profiles,liveChannels,schedules]=await Promise.all([
   safe('twitch.networkProfiles',()=>getUsers(profileIds),[]),
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
 const pmap=new Map(profiles.map(p=>[String(p.id),p])); const gmap=new Map(games.map(g=>[String(g.id),g]));
 const enrichedWithGenre=enrichedStreams.map(st=>{const ig=igdbMap.get(twitchToIgdb.get(st.game_id)),prof=pmap.get(String(st.user_id)),game=gmap.get(String(st.game_id));return {...st,
   profile_image_url:prof?.profile_image_url||'',offline_image_url:prof?.offline_image_url||'',creator_description:prof?.description||'',
   game_box_art_url:(game?.box_art_url||'').replace('{width}','285').replace('{height}','380'),
   stream_thumbnail_url:(st.thumbnail_url||'').replace('{width}','640').replace('{height}','360'),
   genres:(ig?.genres||[]).map(x=>x.name),themes:(ig?.themes||[]).map(x=>x.name),game_modes:(ig?.game_modes||[]).map(x=>x.name)}});
 status['twitch.profileImages']={ok:true,count:enrichedWithGenre.filter(x=>x.profile_image_url).length};
 status['twitch.streamImages']={ok:true,count:enrichedWithGenre.filter(x=>x.stream_thumbnail_url).length};
 status['twitch.gameArt']={ok:true,count:enrichedWithGenre.filter(x=>x.game_box_art_url).length};
 return {status,user,channel,stream,videos,followedStreams:enrichedWithGenre,followedChannels,clips,followerTotal,publishedSchedule,tracker,games,trackerGames,igdbGames,profiles,schedules};
}
