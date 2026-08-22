function hour(iso) { return new Date(iso).getHours(); }
export function inferSchedule(videos=[]) {
  const groups = new Map();
  for (const v of videos) {
    if (!v.created_at) continue;
    const d = new Date(v.created_at);
    const day = d.toLocaleDateString(undefined,{weekday:'long'});
    const x = groups.get(day) || {day,count:0,hours:[]};
    x.count++; x.hours.push(hour(v.created_at)); groups.set(day,x);
  }
  return [...groups.values()].filter(x=>x.count>=2).map(x=>{
    const avg = Math.round(x.hours.reduce((a,b)=>a+b,0)/x.hours.length);
    const spread = Math.max(...x.hours)-Math.min(...x.hours);
    return {day:x.day,count:x.count,hour:avg,confidence:Math.max(35,Math.min(95,35+x.count*10-spread*5))};
  }).sort((a,b)=>b.count-a.count);
}