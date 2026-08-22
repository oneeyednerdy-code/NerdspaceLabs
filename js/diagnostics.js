import { APP_CONFIG } from '../config.js';

export function downloadDiagnostics(state) {
  const safe = {
    app: APP_CONFIG.name,
    version: APP_CONFIG.version,
    generatedAt: new Date().toISOString(),
    authenticated: Boolean(state.user),
    live: Boolean(state.stream),
    recentVideoCount: state.videos?.length || 0,
    followedLiveCount: state.followedStreams?.length || 0,
    scheduleEvidenceCount: state.inferredSchedule?.length || 0,
    gameHistoryCount: state.gameHistory?.length || 0,
    errors: state.errors || [],
    userAgent: navigator.userAgent
  };
  const blob = new Blob([JSON.stringify(safe,null,2)], {type:'text/plain'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`nerdspace-diagnostics-${Date.now()}.txt`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}