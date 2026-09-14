'use strict';
const $=id=>document.getElementById(id);
let properties=[],previousFocus=null,openedNumber=null;
async function api(path){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{const r=await fetch(SITE.api+'/rest/v1/'+path,{headers:{apikey:SITE.key},signal:ctrl.signal,cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}
}
async function load(){
  $('loading').hidden=false;$('error').style.display='none';
  try{
    const select='id,property_number,title,type,size_m2,price,price_type,price_basis,availability,description,frontage_m,depth_m,documents_status,featured,created_at,areas(name),property_images(storage_path,alt_text,sort_order,is_cover),property_videos(video_url)';
    const [pr,areas]=await Promise.all([api('properties?select='+select+'&status=eq.published&order=created_at.desc'),api('areas?select=name&is_active=eq.true&order=name')]);
    properties=pr;
    for(const a of areas){const o=document.createElement('option');o.value=a.name;o.textContent=a.name;$('area').append(o)}
    render();syncRoute();
  }catch(e){$('error').textContent='تعذر تحميل العقارات الآن. تحقق من الاتصال وأعد المحاولة.';const retry=document.createElement('button');retry.type='button';retry.textContent='إعادة المحاولة';retry.className='btn';retry.addEventListener('click',load);$('error').append(retry);$('error').style.display='block'}
  finally{$('loading').hidden=true}
}
function render(){
  const q=$('search').value.trim().toLowerCase(),type=$('type').value,area=$('area').value,sort=$('sort').value;
  let list=properties.filter(p=>(!q||[p.title,p.areas?.name,p.description,String(p.property_number)].some(x=>String(x||'').toLowerCase().includes(q)))&&(!type||type===p.type)&&(!area||area===p.areas?.name));
  // Compare known totals only; a per-metre price must not sort as if it were the full price.
  const total=p=>p.price_type==='on_request'?null:p.price_basis==='total'?p.price:p.price_basis==='per_m2'&&p.size_m2?p.price*p.size_m2:null;
  if(sort!=='new')list.sort((a,b)=>{const x=total(a),y=total(b);if(x==null)return y==null?0:1;if(y==null)return -1;return sort==='low'?x-y:y-x});
  else list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  $('grid').replaceChildren();$('empty').hidden=list.length!==0;
  for(const p of list){
    const card=document.createElement('article');card.className='card';const img=coverUrl(p);
    card.innerHTML=`<div class="media">${img?`<img src="${esc(img)}" alt="${esc(p.title)}" loading="lazy">`:'<span>الصور قيد الإضافة</span>'}${p.featured?'<span class="badge">مميز</span>':''}</div><div class="card-body"><h3>${esc(p.title)}</h3><div class="location">📍 ${esc(p.areas?.name||'مصراتة')} · رقم ${esc(p.property_number)}</div><div class="meta"><span class="chip">${esc(p.type)}</span>${p.size_m2?`<span class="chip">${esc(formatNum(p.size_m2))} م²</span>`:''}<span class="availability ${p.availability==='sold'?'sold':''}">${esc(availabilityLabel(p.availability))}</span></div><div class="price">${esc(priceText(p))}</div><div class="card-actions"><a class="btn btn-gold detail-link" href="${esc(propertyLink(p))}">التفاصيل</a><a class="btn" href="tel:${SITE.phone}">اتصال</a><a class="btn btn-whatsapp" href="${esc(whatsAppLink(p))}" target="_blank" rel="noopener noreferrer">واتساب</a></div></div>`;
    card.querySelector('.detail-link').addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();openDetails(p,true)});
    const picture=card.querySelector('img');if(picture)picture.addEventListener('error',()=>{picture.replaceWith(document.createTextNode('تعذر عرض الصورة'))});
    $('grid').append(card);
  }
}
function openDetails(p,push=false){
  previousFocus=document.activeElement;openedNumber=p.property_number;
  if(push){const url=new URL(location.href);url.searchParams.set('property',p.property_number);url.hash='';history.pushState({propertyModal:true},'',url)}
  const images=sortedImages(p),video=safeUrl(p.property_videos?.[0]?.video_url);
  const fields=[['رقم العقار',p.property_number],['المنطقة',p.areas?.name||'—'],['النوع',p.type],['المساحة',p.size_m2?formatNum(p.size_m2)+' م²':'—'],['السعر',priceText(p)],['حالة العقار',availabilityLabel(p.availability)],['الواجهة',p.frontage_m?formatNum(p.frontage_m)+' م':'—'],['العمق',p.depth_m?formatNum(p.depth_m)+' م':'—'],['المستندات',p.documents_status||'تواصل للاستفسار']];
  $('modalContent').innerHTML=`<h2 id="detailTitle">${esc(p.title)}</h2>${images.length?`<img id="galleryMain" class="detail-img" src="${esc(storageUrl(images[0].storage_path))}" alt="${esc(p.title)}"><div class="gallery-strip" aria-label="صور العقار">${images.map((img,i)=>`<button type="button" aria-label="عرض الصورة ${i+1}" aria-pressed="${i===0}"><img src="${esc(storageUrl(img.storage_path))}" alt="" loading="lazy"></button>`).join('')}</div>`:'<p class="muted">الصور قيد الإضافة. تواصل معنا للحصول على المزيد من المعلومات.</p>'}<div class="detail-grid">${fields.map(([label,value])=>`<div class="detail-item"><strong>${esc(label)}</strong><br>${esc(value)}</div>`).join('')}</div><div class="description">${esc(p.description||'تواصل معنا للحصول على تفاصيل إضافية.')}</div>${video?`<div class="video-link"><a class="btn btn-gold" href="${esc(video)}" target="_blank" rel="noopener noreferrer">مشاهدة الفيديو</a></div>`:''}<div class="detail-actions"><a class="btn btn-whatsapp" href="${esc(whatsAppLink(p))}" target="_blank" rel="noopener noreferrer">استفسر عبر واتساب</a><a class="btn btn-gold" href="tel:${SITE.phone}">اتصل للمعاينة</a><button id="shareProperty" class="btn" type="button">مشاركة الإعلان</button><button id="copyProperty" class="btn" type="button">نسخ الرابط</button></div><p id="shareStatus" class="detail-status" role="status" aria-live="polite"></p>`;
  document.querySelectorAll('.gallery-strip button').forEach((b,i)=>b.addEventListener('click',()=>{$('galleryMain').src=storageUrl(images[i].storage_path);document.querySelectorAll('.gallery-strip button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))}));
  $('copyProperty').addEventListener('click',()=>copyLink(p));
  $('shareProperty').addEventListener('click',async()=>{if(navigator.share){try{await navigator.share({title:p.title,text:p.title,url:propertyLink(p)})}catch(e){if(e.name!=='AbortError')await copyLink(p)}}else await copyLink(p)});
  $('modal').classList.add('show');$('modal').setAttribute('aria-labelledby','detailTitle');document.body.style.overflow='hidden';
  document.querySelector('main').inert=true;document.querySelector('header').inert=true;document.querySelector('footer').inert=true;document.querySelector('.float').inert=true;
  $('closeModal').focus();document.title=p.title+' | المنصة العقارية';
}
async function copyLink(p){try{await navigator.clipboard.writeText(propertyLink(p));$('shareStatus').textContent='تم نسخ رابط الإعلان.'}catch{$('shareStatus').textContent='رابط الإعلان: '+propertyLink(p)}}
function hideDetails(){
  $('modal').classList.remove('show');document.body.style.overflow='';
  document.querySelector('main').inert=false;document.querySelector('header').inert=false;document.querySelector('footer').inert=false;document.querySelector('.float').inert=false;
  openedNumber=null;document.title='المنصة العقارية لمدينة مصراتة | عقارات للبيع';if(previousFocus?.isConnected)previousFocus.focus();
}
function closeDetails(){
  if(history.state?.propertyModal){history.back();return}
  const url=new URL(location.href);url.searchParams.delete('property');history.replaceState(null,'',url);hideDetails();
}
function syncRoute(){
  const number=new URL(location.href).searchParams.get('property');
  if(!number){hideDetails();return}
  const p=properties.find(x=>String(x.property_number)===number);
  if(p)openDetails(p);
  else{hideDetails();$('error').textContent='هذا الإعلان غير متاح حاليًا. يمكنك تصفح العقارات الأخرى أو التواصل معنا.';$('error').style.display='block'}
}
['search','type','area','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
$('closeModal').addEventListener('click',closeDetails);$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeDetails()});
window.addEventListener('popstate',syncRoute);
document.addEventListener('keydown',e=>{
  if(openedNumber==null)return;
  if(e.key==='Escape')closeDetails();
  if(e.key==='Tab'){const nodes=[...$('modal').querySelectorAll('a[href],button:not(:disabled)')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
});
load();
