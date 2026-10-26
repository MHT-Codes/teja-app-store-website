const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
function cors(origin,env){return {'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN||'https://example.invalid','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Vary':'Origin'};}
function b64url(buf){let s='';for(const x of new Uint8Array(buf))s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function utf8(v){return new TextEncoder().encode(v)}
async function serviceToken(env){
 const now=Math.floor(Date.now()/1000), head=b64url(utf8(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const body=b64url(utf8(JSON.stringify({iss:env.FIREBASE_CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500})));
 const pem=env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n');const raw=Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',raw,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const sig=b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,utf8(head+'.'+body)));
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+body+'.'+sig})});
 const data=await res.json();if(!res.ok)throw Error('Google token exchange failed: '+JSON.stringify(data));return data.access_token;
}
async function admin(req,env){
 const bearer=req.headers.get('Authorization')||'';if(!bearer.startsWith('Bearer '))throw Error('Unauthorized');
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:bearer.slice(7)})});
 const result=await response.json();if(!response.ok||result.users?.[0]?.localId!==env.ADMIN_UID||result.users?.[0]?.disabled)throw Error('Unauthorized');
}
async function gh(env,path,options={}){const r=await fetch('https://api.github.com'+path,{...options,headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+env.GITHUB_TOKEN,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Teja-App-Store',...(options.headers||{})}});if(!r.ok)throw Error('GitHub '+r.status+': '+(await r.text()).slice(0,350));return r.json();}
async function firestore(env,path,method='GET',body){const token=await serviceToken(env);const r=await fetch('https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+'/databases/(default)/documents/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Firestore '+r.status+': '+(await r.text()).slice(0,350));return method==='DELETE'?{}:r.json();}
const str=v=>({stringValue:String(v??'')});
function doc(a){return {fields:{name:str(a.name),description:str(a.description),category:str(a.category),version:str(a.version),logo:str(a.logo),apk:str(a.apk),screenshots:{arrayValue:{values:(a.screenshots||[]).map(str)}},published:{booleanValue:true},createdAt:{timestampValue:new Date().toISOString()}}};}
function cleanName(s){return (s||'file').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120)}
export default {async fetch(req,env){
 const origin=req.headers.get('Origin');const headers=cors(origin,env);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(origin&&origin!==env.ALLOWED_ORIGIN)return json({error:'Origin not allowed'},403,headers);
 try{
 const url=new URL(req.url);if(url.pathname==='/health')return json({ok:true},200,headers);
 if(!url.pathname.startsWith('/admin/'))return json({error:'Not found'},404,headers);
 await admin(req,env);
 if(url.pathname==='/admin/release'&&req.method==='POST'){
   const input=await req.json();if(!input.name||input.name.length>100)throw Error('Invalid app name');
   const tag='release-'+crypto.randomUUID();const release=await gh(env,'/repos/'+encodeURIComponent(env.GITHUB_OWNER)+'/'+encodeURIComponent(env.GITHUB_REPO)+'/releases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,name:input.name,body:'Teja App Store release',draft:false,prerelease:false})});
   return json({releaseId:release.id},200,headers);
 }
 if(url.pathname==='/admin/upload'&&req.method==='POST'){
   const releaseId=url.searchParams.get('releaseId'),filename=cleanName(url.searchParams.get('name'));
   if(!/^\d+$/.test(releaseId||'')||!filename)throw Error('Invalid upload parameters');
   const len=Number(req.headers.get('Content-Length')||0);if(len>90*1024*1024) return json({error:'File exceeds 90 MiB'},413,headers);
   const kind=filename.toLowerCase().split('.').pop();if(!['apk','png','jpg','jpeg','webp'].includes(kind))throw Error('Only APK and images supported');
   const contentType=kind==='apk'?'application/vnd.android.package-archive':kind==='png'?'image/png':kind==='webp'?'image/webp':'image/jpeg';
   const endpoint='https://uploads.github.com/repos/'+encodeURIComponent(env.GITHUB_OWNER)+'/'+encodeURIComponent(env.GITHUB_REPO)+'/releases/'+releaseId+'/assets?name='+encodeURIComponent(crypto.randomUUID().slice(0,8)+'-'+filename);
   const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,'Accept':'application/vnd.github+json','Content-Type':contentType,'User-Agent':'Teja-App-Store','X-GitHub-Api-Version':'2022-11-28'},body:req.body});
   if(!r.ok)throw Error('GitHub upload '+r.status+': '+(await r.text()).slice(0,300));const data=await r.json();return json({url:data.browser_download_url},200,headers);
 }
 if(url.pathname==='/admin/apps'&&req.method==='POST'){
   const a=await req.json();if(!a.name?.trim()||!a.apk?.startsWith('https://github.com/')||!a.logo?.startsWith('https://github.com/'))throw Error('Missing name, APK or logo');
   if((a.description||'').length>5000||(a.screenshots||[]).length>8)throw Error('Too much content');
   const id=crypto.randomUUID();await firestore(env,'apps?documentId='+id,'POST',doc(a));return json({id},200,headers);
 }
 if(url.pathname.startsWith('/admin/apps/')&&req.method==='DELETE'){
   const id=url.pathname.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid id');await firestore(env,'apps/'+id,'DELETE');return json({ok:true},200,headers);
 }
 return json({error:'Not found'},404,headers);
 }catch(e){return json({error:e.message==='Unauthorized'?'Unauthorized':String(e.message||e)},e.message==='Unauthorized'?401:400,headers)}
 }};
