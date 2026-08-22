export function creatorPassport({user={},stream=null,channel=null,schedule=[],observed=[],tracker=null,followed=false}={}) {
  return {
    id:user.id||stream?.user_id||'', login:user.login||stream?.user_login||'', displayName:user.display_name||stream?.user_name||'',
    avatar:user.profile_image_url||'', offlineImage:user.offline_image_url||'', description:user.description||'',
    broadcasterType:user.broadcaster_type||'', createdAt:user.created_at||'', followed:Boolean(followed),
    current:stream?{
      live:true,gameId:stream.game_id||'',game:stream.game_name||'',viewers:Number(stream.viewer_count||0),
      tags:stream.tags||channel?.tags||[],language:stream.language||channel?.broadcaster_language||'',
      contentLabels:stream.content_classification_labels||channel?.content_classification_labels||[],
      title:stream.title||channel?.title||'',startedAt:stream.started_at||'',thumbnail:stream.thumbnail_url||''
    }:{
      live:false,gameId:channel?.game_id||'',game:channel?.game_name||'',viewers:0,tags:channel?.tags||[],
      language:channel?.broadcaster_language||'',contentLabels:channel?.content_classification_labels||[],
      title:channel?.title||'',startedAt:'',thumbnail:''
    },
    schedule:{published:schedule,observed}, historical:tracker||null
  };
}
