export function buildSignals({stream, history, schedule, gameSignals, followedStreams}) {
  const out = [];
  if (stream) out.push({type:'LIVE SIGNAL',title:`${stream.viewer_count} viewers right now`,body:`${stream.game_name || 'No category'} • live since ${new Date(stream.started_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`});
  if (gameSignals?.[0]) out.push({type:'GAME SIGNAL',title:`Explore ${gameSignals[0].name}`,body:`${gameSignals[0].channels} creators you follow are live in this category. Treat this as an experiment, not a growth promise.`});
  if (schedule?.[0]) out.push({type:'SCHEDULE SIGNAL',title:`${schedule[0].day} appears frequently`,body:`Detected in ${schedule[0].count} recent broadcasts • ${schedule[0].confidence}% confidence.`});
  if (followedStreams?.length) out.push({type:'NETWORK SIGNAL',title:`${followedStreams.length} followed creators are live`,body:'Open Raid Radar to compare live channels by audience, game and tags.'});
  if (!out.length) out.push({type:'STATUS',title:'Waiting for enough evidence',body:'Nerdspace will surface signals as Twitch data becomes available.'});
  return out.slice(0,4);
}