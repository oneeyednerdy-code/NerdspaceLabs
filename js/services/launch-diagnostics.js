
const started=Date.now();
const events=[];
const safe=(v)=>String(v??'').replace(/(access_token|refresh_token|client_secret|authorization|bearer)\s*[:=]\s*[^\s,;]+/ig,'$1=[REDACTED]');
export function recordLaunchEvent(type,message='',detail=''){
  events.push({time:new Date().toISOString(),type:safe(type),message:safe(message),detail:safe(detail)});
  if(events.length>120)events.shift();
}
export function launchDiagnosticText(extra={}){
  const lines=[
    'NERDSPACE LABS DIAGNOSTIC LOG',
    `Generated: ${new Date().toISOString()}`,
    `Launch elapsed: ${Math.round((Date.now()-started)/1000)}s`,
    `URL path: ${location.pathname}`,
    `Online: ${navigator.onLine}`,
    `User agent: ${navigator.userAgent}`,
    '',
    'LAUNCH EVENTS',
    ...events.map(e=>`${e.time} | ${e.type} | ${e.message}${e.detail?' | '+e.detail:''}`),
    '',
    'STATE SUMMARY',
    ...Object.entries(extra).map(([k,v])=>`${safe(k)}: ${safe(v)}`)
  ];
  return lines.join('\n');
}
export function downloadLaunchDiagnostic(extra={}){
  const blob=new Blob([launchDiagnosticText(extra)],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`nerdspace-diagnostic-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function copyLaunchDiagnostic(extra={}){
  await navigator.clipboard.writeText(launchDiagnosticText(extra));
}
export function launchElapsedSeconds(){return Math.round((Date.now()-started)/1000)}
