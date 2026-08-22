export function creatorPassport({user={},stream=null,channel=null,schedule=[],observed=[],tracker=null}={}) {
  return {
    id:user.id||'', login:user.login||'', displayName:user.display_name||'', avatar:user.profile_image_url||'',
    current:stream?{live:true,game:stream.game_name||'',viewers:Number(stream.viewer_count||0),tags:stream.tags||[],startedAt:stream.started_at}:{live:false,game:channel?.game_name||'',viewers:0,tags:channel?.tags||[]},
    schedule:{published:schedule,observed},
    historical:tracker||null
  };
}