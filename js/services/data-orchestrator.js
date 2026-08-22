import {getUser,getChannel,getStream,getRecentVideos,getGames,getFollowedStreams,getFollowedChannels,getClips,getFollowerTotal,getSchedule,getSchedules,getUsers} from './twitch.js';
import {getTwitchTrackerSummary} from './twitchtracker.js';
export async function loadCreatorData(userId){
 const status={}; const safe=async(name,fn,fallback)=>{try{const value=await fn();status[name]={ok:true,count:Array.isArray(value)?value.length:undefined};return value}catch(e){status[name]={ok:false,error:e.message};return fallback}};
 const user=await safe('twitch.identity',()=>getUser(userId),null); if(!user)return {status,user:null};
 const [channel,stream,videos,followedStreams,followedChannels,clips,followerTotal,publishedSchedule,tracker]=await Promise.all([
  safe('twitch.channel',()=>getChannel(userId),null),safe('twitch.live',()=>getStream(userId),null),safe('twitch.vods',()=>getRecentVideos(userId,100),[]),safe('twitch.followedLive',()=>getFollowedStreams(userId,500),[]),safe('twitch.followedChannels',()=>getFollowedChannels(userId,1000),[]),safe('twitch.clips',()=>getClips(userId,100),[]),safe('twitch.followers',()=>getFollowerTotal(userId),null),safe('twitch.schedule',()=>getSchedule(userId,50),[]),safe('twitchtracker.summary',()=>getTwitchTrackerSummary(user.login),null)
 ]);
 const games=await safe('twitch.games',()=>getGames(videos.map(v=>v.game_id)),[]);
 const profiles=await safe('twitch.networkProfiles',()=>getUsers(followedStreams.map(s=>s.user_id)),[]);
 const schedules=await safe('twitch.networkSchedules',()=>getSchedules(followedStreams.map(s=>s.user_id),24),new Map());
 return {status,user,channel,stream,videos,followedStreams,followedChannels,clips,followerTotal,publishedSchedule,tracker,games,profiles,schedules};
}
