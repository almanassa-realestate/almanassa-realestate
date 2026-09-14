'use strict';
const $=id=>document.getElementById(id);
let db,currentUser,currentProfile,editing=null,items=[],gallery=[],originalImages=[],busy=false,dirty=false;
const bucket=()=>db.storage.from('property-media');
function message(id,text,ok=false){const e=$(id);e.textContent=text;e.className='msg '+(ok?'ok':'err');e.style.display='block'}
function hideMessage(id){$(id).style.display='none'}
function errorText(e){
  if(String(e?.message).includes('EDIT_CONFLICT'))return 'عُدّل هذا الإعلان من نافذة أخرى. أعد فتحه قبل حفظ تغييرات جديدة.';
  return 'تعذر إكمال العملية. تحقق من الاتصال والصلاحيات. تغييرات النموذج محفوظة هنا لإعادة المحاولة.';
}
function setBusy(value){busy=value;document.querySelectorAll('#formBox input,#formBox select,#formBox textarea,#formBox button,#list button,#logoutBtn,#refreshBtn,#newPropertyBtn').forEach(e=>e.disabled=value);$('saveSpin').style.display=value?'inline':'none';if(!value)renderGallery()}
async function result(query){const r=await query;if(r.error)throw r.error;return r.data}
function signedOut(){currentUser=null;currentProfile=null;resetForm();items=[];$('list').replaceChildren();$('adminBox').classList.add('hidden');$('loginBox').classList.remove('hidden')}
async function verifySession(user){
  const profile=await result(db.from('profiles').select('id,full_name,role,is_active').eq('id',user.id).single());
  if(!profile?.is_active||!['admin','editor'].includes(profile.role)){await db.auth.signOut();throw new Error('الحساب غير مفعل لإدارة العقارات. تواصل مع المدير.')}
  currentUser=user;currentProfile=profile;
  $('who').textContent='مسجل الدخول: '+(profile.full_name||user.email)+' — '+(profile.role==='admin'?'مدير':'محرر');
  $('loginBox').classList.add('hidden');$('adminBox').classList.remove('hidden');
  await Promise.all([loadAreas(),loadProperties()]);
}
async function login(){
  hideMessage('loginMsg');const email=$('email').value.trim(),password=$('password').value;
  if(!email||!password){message('loginMsg','أدخل البريد الإلكتروني وكلمة المرور.');return}
  $('loginBtn').disabled=true;$('loginSpin').style.display='inline';
  try{const data=await result(db.auth.signInWithPassword({email,password}));$('password').value='';await verifySession(data.user)}
  catch(e){message('loginMsg',e.message?.includes('الحساب')?e.message:'تعذر الدخول. تحقق من البريد وكلمة المرور والاتصال.');}
  finally{$('loginBtn').disabled=false;$('loginSpin').style.display='none'}
}
async function loadAreas(){
  const areas=await result(db.from('areas').select('id,name').eq('is_active',true).order('name'));
  $('area').replaceChildren(...areas.map(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=a.name;return o}));
}
function statusLabel(s){return {draft:'مسودة',published:'منشور',hidden:'مخفي',archived:'في المحذوفات'}[s]||s}
function button(text,fn,cls='secondary'){
  const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;
  b.addEventListener('click',async()=>{if(busy)return;try{await fn()}catch(e){$('listMsg').textContent=errorText(e)}});return b;
}
async function loadProperties(){
  items=await result(db.from('properties').select('id,property_number,title,status,availability,updated_at,areas(name),property_images(storage_path,is_cover,sort_order)').order('created_at',{ascending:false}));renderList();
}
function renderList(){
  const q=$('adminSearch').value.trim().toLowerCase();const list=items.filter(p=>($('showArchived').checked||p.status!=='archived')&&(!q||String(p.property_number)===q||p.title.toLowerCase().includes(q)));
  $('list').replaceChildren();if(!list.length){$('list').textContent='لا توجد عقارات مطابقة.';return}
  for(const p of list){
    const wrap=document.createElement('article');wrap.className='item';
    wrap.innerHTML=`<div class="row"><div class="item-main">${coverUrl(p)?`<img class="thumb" src="${esc(coverUrl(p))}" alt="">`:''}<div><strong>${esc(p.title)}</strong><div class="muted">#${esc(p.property_number)} · ${esc(p.areas?.name||'')}</div><span class="status">${esc(statusLabel(p.status))} · ${esc(availabilityLabel(p.availability))}</span></div></div><div class="actions"></div></div>`;
    const actions=wrap.querySelector('.actions');actions.append(button('تعديل',()=>editProperty(p.id),''));
    if(p.status==='archived')actions.append(button('استعادة كمسودة',()=>setStatus(p,'draft')));
    else{
      actions.append(button(p.status==='published'?'إخفاء':'نشر',()=>setStatus(p,p.status==='published'?'hidden':'published')));
      if(p.status==='published')actions.append(button('نسخ الرابط',()=>copyPropertyLink(p)));
      if(currentProfile.role==='admin')actions.append(button('حذف إلى الأرشيف',async()=>{if(confirm('نقل «'+p.title+'» إلى المحذوفات؟ يمكنك استرجاعه لاحقًا.'))await setStatus(p,'archived')},'danger'));
    }
    $('list').append(wrap);
  }
}
async function copyPropertyLink(p){
  try{await navigator.clipboard.writeText(propertyLink(p));$('listMsg').textContent='تم نسخ رابط الإعلان.'}catch{prompt('انسخ رابط العقار:',propertyLink(p))}
}
async function setStatus(p,status){
  if(editing?.id===p.id&&dirty&&!confirm('لديك تعديلات غير محفوظة. تغيير الحالة سيعيد فتح الإعلان دونها. هل تريد المتابعة؟'))return;
  setBusy(true);try{
    await result(db.from('properties').update({status,updated_by:currentUser.id}).eq('id',p.id).eq('updated_at',p.updated_at).select('id').single());
    if(editing?.id===p.id){dirty=false;await editProperty(p.id,true)}
    await loadProperties();$('listMsg').textContent='تم تحديث حالة الإعلان.';
  }finally{setBusy(false)}
}
function releaseGallery(){for(const i of gallery)if(i.preview?.startsWith('blob:'))URL.revokeObjectURL(i.preview)}
function resetForm(){
  releaseGallery();gallery=[];originalImages=[];editing=null;dirty=false;
  $('formBox').reset();$('gallery').replaceChildren();$('formTitle').textContent='إضافة عقار';$('saveBtn').textContent='حفظ العقار';
  $('cancelEditBtn').classList.add('hidden');$('editNote').classList.add('hidden');
}
async function editProperty(id,force=false){
  if(!force&&dirty&&!confirm('تجاهل التغييرات غير المحفوظة وفتح هذا العقار؟'))return;
  const p=await result(db.from('properties').select('*,property_images(id,storage_path,is_cover,sort_order),property_videos(id,video_url)').eq('id',id).single());
  releaseGallery();editing=p;dirty=false;hideMessage('saveMsg');
  const fields={title:'title',type:'type',area:'area_id',size:'size_m2',price:'price',priceType:'price_type',priceBasis:'price_basis',availability:'availability',frontage:'frontage_m',depth:'depth_m',documents:'documents_status',status:'status',description:'description'};
  for(const [field,key] of Object.entries(fields))$(field).value=p[key]??'';
  $('featured').checked=!!p.featured;$('video').value=p.property_videos?.[0]?.video_url||'';$('cover').value='';
  originalImages=sortedImages(p);gallery=originalImages.map(i=>({...i,preview:storageUrl(i.storage_path)}));renderGallery();
  $('formTitle').textContent='تعديل العقار #'+p.property_number;$('saveBtn').textContent='حفظ التعديلات';$('cancelEditBtn').classList.remove('hidden');$('editNote').classList.remove('hidden');
  $('formBox').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderGallery(){
  $('gallery').replaceChildren();
  gallery.forEach((item,index)=>{
    const card=document.createElement('div');card.className='gallery-item';
    card.innerHTML=`<img src="${esc(item.preview)}" alt="صورة ${index+1}"><div>${index===0?'صورة الغلاف':'الصورة '+(index+1)}</div>`;
    if(index)card.append(button('جعلها الغلاف',()=>{gallery.unshift(gallery.splice(index,1)[0]);dirty=true;renderGallery()}));
    const prev=button('تقديم',()=>{[gallery[index-1],gallery[index]]=[gallery[index],gallery[index-1]];dirty=true;renderGallery()});prev.disabled=index===0;
    const next=button('تأخير',()=>{[gallery[index+1],gallery[index]]=[gallery[index],gallery[index+1]];dirty=true;renderGallery()});next.disabled=index===gallery.length-1;
    card.append(prev,next,button('إزالة الصورة',()=>{if(item.preview?.startsWith('blob:'))URL.revokeObjectURL(item.preview);gallery.splice(index,1);dirty=true;renderGallery()},'danger'));
    $('gallery').append(card);
  });
}
async function compress(file){
  const bitmap=await createImageBitmap(file);const ratio=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.85));if(!blob)throw new Error('IMAGE_DECODE_FAILED');return blob;
}
async function addImages(){
  const files=Array.from($('cover').files);$('cover').value='';
  if(gallery.length+files.length>20){message('saveMsg','الحد الأقصى 20 صورة لكل عقار.');return}
  if(files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10*1024*1024)){message('saveMsg','اختر صور JPG/PNG/WebP لا تتجاوز 10MB للصورة.');return}
  setBusy(true);try{for(const file of files){const blob=await compress(file);gallery.push({file:blob,preview:URL.createObjectURL(blob)});dirty=true}renderGallery();hideMessage('saveMsg')}
  catch{message('saveMsg','تعذر قراءة إحدى الصور. جرّب صورة أخرى.');renderGallery()}
  finally{setBusy(false);renderGallery()}
}
function numeric(id){const v=$(id).value.trim();if(!v)return null;const n=Number(v);if(!Number.isFinite(n)||n<0)throw new Error('أدخل أرقامًا موجبة للمساحة والسعر والأبعاد.');return n}
function payload(){
  const p={title:$('title').value.trim(),type:$('type').value,area_id:$('area').value,size_m2:numeric('size'),price:numeric('price'),price_type:$('priceType').value,price_basis:$('priceBasis').value,availability:$('availability').value,frontage_m:numeric('frontage'),depth_m:numeric('depth'),documents_status:$('documents').value.trim()||null,description:$('description').value.trim()||null,status:$('status').value,featured:$('featured').checked};
  if(!p.title||!p.area_id)throw new Error('أدخل اسم العقار والمنطقة.');
  if(p.price_type==='on_request')p.price=null;
  else if(p.price===null||p.price_basis==='unspecified')throw new Error('أدخل السعر وحدد هل هو إجمالي أم للمتر المربع.');
  return p;
}
async function saveProperty(event){
  event.preventDefault();if(busy||!currentUser)return;hideMessage('saveMsg');let p,video;
  try{p=payload();const raw=$('video').value.trim();video=safeUrl(raw)||null;if(raw&&!video)throw new Error('أدخل رابط فيديو صحيحًا يبدأ بـ https://');}
  catch(e){message('saveMsg',e.message);return}
  setBusy(true);let saved=false;
  try{
    if(!editing){
      // A private draft reserves the ID needed by the storage policy. Retain it on failure for safe retry.
      editing=await result(db.from('properties').insert({...p,status:'draft',created_by:currentUser.id,updated_by:currentUser.id}).select('*').single());
      $('formTitle').textContent='تعديل العقار #'+editing.property_number;$('cancelEditBtn').classList.remove('hidden');
    }
    for(const image of gallery){
      if(image.storage_path)continue;
      const path=editing.id+'/'+crypto.randomUUID()+'.jpg';
      await result(bucket().upload(path,image.file,{contentType:'image/jpeg',cacheControl:'3600',upsert:false}));
      image.storage_path=path;
    }
    const savedProperty=await result(db.rpc('save_property_editor',{property_id_input:editing.id,expected_updated_at:editing.updated_at,details:p,images:gallery.map(i=>({storage_path:i.storage_path})),video_url_input:video}));
    editing=Array.isArray(savedProperty)?savedProperty[0]:savedProperty;saved=true;dirty=false;
    const removed=originalImages.filter(old=>!gallery.some(i=>i.storage_path===old.storage_path)).map(i=>i.storage_path);
    originalImages=gallery.map((i,index)=>({storage_path:i.storage_path,sort_order:index,is_cover:index===0}));
    let cleanupFailed=false;
    if(removed.length){try{const cleanup=await bucket().remove(removed);cleanupFailed=!!cleanup.error}catch{cleanupFailed=true}}
    await loadProperties();
    message('saveMsg',cleanupFailed?'تم حفظ الإعلان. أُزيلت الصور من العرض، وتعذر تنظيف بعض الملفات القديمة.':'تم حفظ الإعلان بنجاح'+(p.status==='published'?' ونشره في الموقع.':' — '+statusLabel(p.status)+'.'),true);
    $('saveBtn').textContent='حفظ التعديلات';$('editNote').classList.remove('hidden');
  }catch(e){message('saveMsg',saved?'تم حفظ الإعلان، لكن تعذر تحديث القائمة. اضغط تحديث.':errorText(e)+(editing?' الإعلان محفوظ كعنصر واحد؛ يمكنك إعادة المحاولة.':''));}
  finally{setBusy(false);renderGallery()}
}
async function init(){
  $('loginBtn').addEventListener('click',login);$('password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
  $('formBox').addEventListener('submit',saveProperty);$('formBox').addEventListener('input',()=>dirty=true);
  $('cover').addEventListener('change',addImages);$('adminSearch').addEventListener('input',renderList);$('showArchived').addEventListener('change',renderList);
  $('cancelEditBtn').addEventListener('click',()=>{if(!dirty||confirm('تجاهل التغييرات غير المحفوظة؟')){resetForm();hideMessage('saveMsg')}});
  $('newPropertyBtn')?.addEventListener('click',()=>{if(!dirty||confirm('تجاهل التغييرات غير المحفوظة وإضافة عقار جديد؟')){resetForm();hideMessage('saveMsg');$('formBox').scrollIntoView({behavior:'smooth',block:'start'});$('title').focus()}});
  $('refreshBtn').addEventListener('click',()=>loadProperties().catch(e=>$('listMsg').textContent=errorText(e)));
  $('logoutBtn').addEventListener('click',async()=>{if(dirty&&!confirm('تسجيل الخروج وتجاهل التغييرات غير المحفوظة؟'))return;try{await result(db.auth.signOut());signedOut()}catch(e){$('listMsg').textContent=errorText(e)}});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  try{
    db=supabase.createClient(SITE.api,SITE.key);
    db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')signedOut()});
    const data=await result(db.auth.getSession());if(data.session)await verifySession(data.session.user);
  }catch(e){message('loginMsg','تعذر تجهيز الإدارة. حدّث الصفحة وتحقق من الاتصال.');}
}
init();
