const HTML = /*__HTML__*/ "";
const LOGIN = /*__LOGIN__*/ "";
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const id=()=>crypto.randomUUID().replaceAll('-','');
const callCode=()=>id().slice(0,6).toUpperCase();
const text=(s,n)=>String(s??'').trim().slice(0,n);
const read=async(b,k)=>{const o=await b.get(k);return o?o.json():null;};
const previewEnabled=env=>!!(env.LOCAL_PREVIEW||env.RENDER);
async function account(request,env){
 const userId=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
 if(userId&&email){let name=request.headers.get('oai-authenticated-user-full-name')||email;try{if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')name=decodeURIComponent(name)}catch{}return {id:userId,email,name,preview:false};}
 if(previewEnabled(env)&&env.BUCKET){const token=request.headers.get('Cookie')?.match(/(?:^|;\s*)couch_preview=([a-f0-9]{32})/)?.[1];if(token){const a=await read(env.BUCKET,'preview-accounts/'+await hash(token));if(a&&a.expires>Date.now())return {id:a.id,name:a.name,email:'Local preview account',preview:true};}}
 return null;
}
async function api(request,env,url){
 if(!env.BUCKET)return json({error:'Room storage is unavailable. Please try again later.'},503);
 const b=env.BUCKET;
 if(request.method==='POST'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Origin is not allowed.'},403);
 const parts=url.pathname.split('/').filter(Boolean);
 let input={};if(request.method==='POST'){const raw=await request.text();if(raw.length>25000)return json({error:'Request too large.'},413);try{input=JSON.parse(raw);}catch{return json({error:'Invalid request.'},400);}}
 const user=await account(request,env);
 if(url.pathname==='/api/me'&&request.method==='GET')return json({user,localPreview:previewEnabled(env)});
 if(url.pathname==='/api/auth/preview'&&request.method==='POST'&&previewEnabled(env)){
  const name=text(input.name,40);if(!name)return json({error:'Enter a display name.'},400);
  const token=id();await b.put('preview-accounts/'+await hash(token),JSON.stringify({id:id(),name,expires:Date.now()+86400000}));
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':'couch_preview='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400'}});
 }
 if(url.pathname==='/api/auth/logout-preview'&&request.method==='POST'&&previewEnabled(env))return new Response('{}',{headers:{'Set-Cookie':'couch_preview=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'}});
 if(!user)return json({error:'Sign in before creating or joining a room.',loginRequired:true},401);
 if(url.pathname==='/api/rtc-config'&&request.method==='GET'){
  const iceServers=[{urls:'stun:stun.l.google.com:19302'}];
  if(env.TURN_URL&&env.TURN_USERNAME&&env.TURN_CREDENTIAL&&/^turns?:/.test(env.TURN_URL))iceServers.push({urls:env.TURN_URL,username:env.TURN_USERNAME,credential:env.TURN_CREDENTIAL});
  return json({iceServers,relayConfigured:iceServers.length>1});
 }
 if(url.pathname==='/api/rooms/resolve'&&request.method==='POST'){
  const code=text(input.code,12).toUpperCase();
  if(!/^[A-F0-9]{6}$/.test(code))return json({error:'Enter the 6-character room code.'},400);
  const entries=await b.list({prefix:'rooms/'});
  for(const item of entries.objects.filter(o=>o.key.endsWith('/meta')).slice(-500)){
   const roomMeta=await read(b,item.key);
   if(roomMeta&&roomMeta.expires>Date.now()&&roomMeta.callCodeHash===await hash(code))return json({room:item.key.split('/')[1],title:roomMeta.title,callCode:code});
  }
  return json({error:'That room code is invalid or expired.'},404);
 }
 if(url.pathname==='/api/rooms'&&request.method==='POST'){
  const room=id().slice(0,12),key=id(),token=id(),member=id(),code=callCode();
  const meta={title:text(input.title,60)||'Friday night crew',roomKey:key,keyHash:await hash(key),callCodeHash:await hash(code),host:member,accountId:user.id,created:Date.now(),expires:Date.now()+86400000};
  await b.put('rooms/'+room+'/meta',JSON.stringify(meta));
  await b.put('rooms/'+room+'/state',JSON.stringify({mode:'idle',version:id(),updated:Date.now()}));
  await b.put('rooms/'+room+'/members/'+member,JSON.stringify({id:member,accountId:user.id,name:text(input.name,24)||user.name.slice(0,24),tokenHash:await hash(token),seen:Date.now()}));
  return json({room,key,token,member,title:meta.title,callCode:code},201);
 }
 const room=parts[2];if(!/^[a-f0-9]{12}$/.test(room||''))return json({error:'Room not found.'},404);
 const prefix='rooms/'+room+'/',meta=await read(b,prefix+'meta');
 if(!meta||meta.expires<Date.now())return json({error:'This room has expired. Create a new room for tonight.'},404);
 const keyValid=await hash(request.headers.get('X-Room-Key')||'')===meta.keyHash;
 const codeValid=parts[3]==='join'&&await hash(text(input.callCode,12).toUpperCase())===meta.callCodeHash;
 if(!keyValid&&!codeValid)return json({error:'Use the complete invitation link or the 6-character room code.'},403);
 if(parts[3]==='join'&&request.method==='POST'){
  const entries=await b.list({prefix:prefix+'members/'});
  const members=await Promise.all(entries.objects.map(o=>read(b,o.key)));
  if(members.filter(m=>m.seen>Date.now()-45000).length>=8)return json({error:'This room is full (8 people).'},409);
  const member=id(),token=id();await b.put(prefix+'members/'+member,JSON.stringify({id:member,accountId:user.id,name:text(input.name,24)||user.name.slice(0,24),tokenHash:await hash(token),seen:Date.now()}));
  return json({member,token,key:meta.roomKey,title:meta.title,callCode:text(input.callCode,12).toUpperCase()||undefined});
 }
 const member=request.headers.get('X-Member-Id')||'',me=/^[a-f0-9]{32}$/.test(member)?await read(b,prefix+'members/'+member):null;
 if(!me||me.accountId!==user.id||await hash(request.headers.get('X-Member-Token')||'')!==me.tokenHash)return json({error:'Please rejoin this room.'},401);
 if(request.method==='GET'&&parts[3]==='poll'){
  const entries=await b.list({prefix:prefix+'members/'});
  const members=(await Promise.all(entries.objects.map(o=>read(b,o.key)))).filter(m=>m&&m.seen>Date.now()-45000).map(m=>({id:m.id,name:m.name,host:m.id===meta.host,call:!!m.call,mic:!!m.mic,camera:!!m.camera,epoch:m.epoch||''}));
  const since=text(url.searchParams.get('since'),80);if(since&&!/^[0-9]{13}-[a-f0-9]{32}$/.test(since))return json({error:'Invalid cursor.'},400);
  const logs=await b.list({prefix:prefix+'events/',...(since?{startAfter:prefix+'events/'+since}:{}),limit:100});
  const events=(await Promise.all(logs.objects.map(o=>read(b,o.key)))).filter(e=>e&&(!e.to||e.to===member||e.from===member));
  return json({title:meta.title,host:meta.host,members,state:await read(b,prefix+'state'),events,cursor:logs.objects.at(-1)?.key.split('/').at(-1)||since,serverTime:Date.now()});
 }
 if(request.method==='POST'&&parts[3]==='heartbeat'){const media=input.media?{call:!!input.media.call,mic:!!input.media.mic,camera:!!input.media.camera,epoch:text(input.media.epoch,40)}:{};await b.put(prefix+'members/'+member,JSON.stringify({...me,...media,seen:Date.now()}));return json({ok:true});}
 if(request.method==='POST'&&parts[3]==='leave'){await b.delete(prefix+'members/'+member);return json({ok:true});}
 if(request.method==='POST'&&parts[3]==='state'){
  if(member!==meta.host)return json({error:'Only the host can change playback.'},403);
  const mode=['video','screen','ott','idle'].includes(input.mode)?input.mode:'idle';
  let mediaUrl='';if(input.url){try{const u=new URL(input.url);if(u.protocol!=='https:')throw 0;mediaUrl=u.href.slice(0,2000);}catch{return json({error:'Enter a valid HTTPS video or service link.'},400);}}
  const state={mode,url:mediaUrl,label:text(input.label,100),playing:!!input.playing,position:Math.max(0,Math.min(Number(input.position)||0,86400)),updated:Date.now(),countdown:input.countdown?Date.now()+10000:0,version:id()};
  await b.put(prefix+'state',JSON.stringify(state));return json(state);
 }
 if(request.method==='POST'&&parts[3]==='events'){
  const type=input.type;if(!['chat','reaction','signal'].includes(type))return json({error:'Unknown event.'},400);
  if(type!=='signal'&&me.lastEvent&&Date.now()-me.lastEvent<450)return json({error:'Give it a moment before sending again.'},429);
  const event={id:Date.now()+'-'+id(),type,from:member,name:me.name,time:Date.now()};
  if(type==='signal'){
   if(!/^[a-f0-9]{32}$/.test(input.to||''))return json({error:'Invalid recipient.'},400);
   const signal=input.signal;if(!signal||!['offer','answer','candidate'].includes(signal.type))return json({error:'Invalid signal.'},400);
   const channel=signal.channel||'screen';if(!['screen','call'].includes(channel))return json({error:'Invalid signal channel.'},400);
   const target=await read(b,prefix+'members/'+input.to);if(!target||target.seen<Date.now()-45000)return json({error:'This participant has left the room.'},404);
   if(channel==='screen'&&((signal.type==='offer'&&member!==meta.host)||(signal.type==='answer'&&input.to!==meta.host)))return json({error:'Invalid screen-sharing role.'},403);
   if(channel==='call'&&(!me.call||!target.call||signal.epoch!==me.epoch||signal.targetEpoch!==target.epoch))return json({error:'This call session is no longer active.'},409);
   event.to=input.to;event.signal=signal;
  }else{event.body=text(input.body,type==='chat'?500:10);if(!event.body)return json({error:'Message is empty.'},400);}
  await b.put(prefix+'events/'+event.id,JSON.stringify(event));
  if(type!=='signal')await b.put(prefix+'members/'+member,JSON.stringify({...me,lastEvent:Date.now(),seen:Date.now()}));
  return json({ok:true});
 }
 return json({error:'Not found.'},404);
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 try{
  if(url.pathname.startsWith('/api/'))return await api(request,env,url);
  if(!['/','/index.html','/login'].includes(url.pathname))return new Response('Not found',{status:404});
  return new Response(url.pathname==='/login'?LOGIN:HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(self), microphone=(self), display-capture=(self)'}});
 }catch(error){console.error('Room operation failed',error.name);return json({error:'Unable to connect to the room. Please try again.'},500);}
}};
