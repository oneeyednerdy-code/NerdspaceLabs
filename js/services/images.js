export function proxiedImage(url){
  const value=String(url||'').trim();
  if(!value)return '';
  if(value.startsWith('/api/image?url='))return value;
  try{
    const u=new URL(value);
    if(u.protocol!=='https:')return '';
    return `/api/image?url=${encodeURIComponent(u.toString())}`;
  }catch{return ''}
}
