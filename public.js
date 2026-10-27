import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getFirestore,collection,getDocs,doc,getDoc,query,where} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const fb=initializeApp(window.STORE_CONFIG.firebase);const db=getFirestore(fb);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='github.com'?x.href:''}catch{return ''}};
const appsEl=document.querySelector('#apps');
if(appsEl){const search=document.querySelector('#search'),cat=document.querySelector('#category');let apps=[];function render(){const q=search.value.toLowerCase().trim();const filtered=apps.filter(a=>(a.name+' '+a.description).toLowerCase().includes(q)&&(!cat.value||a.category===cat.value));appsEl.innerHTML=filtered.length?filtered.map(a=>`<article class="card"><img src="${esc(valid(a.logo))}" alt="${esc(a.name)} logo" loading="lazy"><h3>${esc(a.name)}</h3><div class="muted">${esc(a.category)} · v${esc(a.version)}</div><p>${esc(a.description).slice(0,115)}</p><a class="button" href="/app.html?id=${encodeURIComponent(a.id)}">View & Install</a></article>`).join(''):'<p>No apps found yet.</p>'}try{const snap=await getDocs(query(collection(db,'apps'),where('published','==',true)));apps=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));[...new Set(apps.map(a=>a.category).filter(Boolean))].sort().forEach(c=>cat.add(new Option(c,c)));search.addEventListener('input',render);cat.addEventListener('change',render);render()}catch(e){appsEl.textContent='Unable to load apps. Check Firebase configuration and Firestore rules.';console.error(e)}}
const detail=document.querySelector('#detail');
if(detail){
  try{
    const id=new URLSearchParams(location.search).get('id');if(!id)throw Error('Missing app');
    const snap=await getDoc(doc(db,'apps',id));if(!snap.exists()||!snap.data().published)throw Error('App not found');
    const a=snap.data(),apk=valid(a.apk);
    detail.innerHTML=`<div class="detailhead"><img src="${esc(valid(a.logo))}" alt="App logo"><div><span class="chip">${esc(a.category||'Android app')}</span><h1>${esc(a.name)}</h1><p class="muted">Version ${esc(a.version)}</p></div></div><h2>About this app</h2><p style="white-space:pre-wrap">${esc(a.description)}</p><h2>Screenshots</h2><div class="screens">${(a.screenshots||[]).map(s=>`<img loading="lazy" src="${esc(valid(s))}" alt="App screenshot">`).join('')||'<p class="muted">No screenshots yet</p>'}</div>${apk?`<div class="download-panel"><div class="download-actions"><button id="installBtn" type="button">↓ Download APK</button><span class="chip">Android APK</span></div><div id="downloadStatus" class="download-note" role="status" aria-live="polite" style="margin-top:12px">Ready to download</div><div id="progressWrap" hidden><div class="download-track"><div class="download-fill" id="downloadFill"></div></div><div class="download-actions"><strong id="downloadPct">0%</strong><button type="button" id="cancelDownload" class="secondary">Cancel</button></div></div><p class="download-note">After downloading, open the APK from your browser's Downloads and confirm installation on Android. Installation itself is managed by Android.</p></div>`:'<p>APK unavailable</p>'}`;
    if(apk){
      const btn=document.querySelector('#installBtn'),status=document.querySelector('#downloadStatus'),wrap=document.querySelector('#progressWrap'),fill=document.querySelector('#downloadFill'),pct=document.querySelector('#downloadPct'),cancel=document.querySelector('#cancelDownload');let controller=null;
      const fallback=()=>{status.textContent='Your browser is opening the APK download. Check Downloads to install it.';wrap.hidden=true;btn.disabled=false;const link=document.createElement('a');link.href=apk;link.rel='noopener noreferrer';link.target='_blank';document.body.append(link);link.click();link.remove()};
      btn.onclick=async()=>{
        if(controller)return;controller=new AbortController();btn.disabled=true;wrap.hidden=false;fill.style.width='0%';pct.textContent='0%';status.textContent='Connecting to download server…';
        try{
          const response=await fetch(apk,{signal:controller.signal});if(!response.ok||!response.body)throw Error('Direct download required');
          const type=response.headers.get('content-type')||'';if(type.includes('text/html'))throw Error('Direct download required');
          const total=Number(response.headers.get('content-length'))||0;const reader=response.body.getReader();const chunks=[];let loaded=0;
          while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;if(total){const percent=Math.min(100,Math.round(loaded/total*100));fill.style.width=percent+'%';pct.textContent=percent+'%';status.textContent='Downloading APK… '+(loaded/1048576).toFixed(1)+' MB / '+(total/1048576).toFixed(1)+' MB'}else{status.textContent='Downloading APK… '+(loaded/1048576).toFixed(1)+' MB';pct.textContent='Downloading…';fill.style.width='65%'}}
          const blob=new Blob(chunks,{type:'application/vnd.android.package-archive'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=(a.name||'app').replace(/[^a-z0-9_-]+/gi,'_')+'.apk';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);fill.style.width='100%';pct.textContent='100%';status.textContent='Download complete! Open the APK in your Downloads to install.';
        }catch(e){if(e.name==='AbortError'){status.textContent='Download cancelled.';wrap.hidden=true}else{fallback();status.textContent='Your browser is handling this download. Open Downloads when complete to install.'}}finally{controller=null;btn.disabled=false}
      };
      cancel.onclick=()=>controller?.abort();
    }
  }catch(e){detail.textContent=e.message}
}
