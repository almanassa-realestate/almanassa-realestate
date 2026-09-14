'use strict';
const SITE = Object.freeze({
  url:'https://almanassa-realestate.github.io/almanassa-realestate/',
  api:'https://ajrvttqqlgsbbxsxfxzl.supabase.co',
  key:'sb_publishable_AEWw1MQfNtD89ACJTPjmug_ZXAu6rWz',
  phone:'+218911737046',
});
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const safeUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:''}catch{return ''}};
const formatNum=v=>v==null||v===''?'—':new Intl.NumberFormat('ar-LY',{maximumFractionDigits:2}).format(Number(v));
const storageUrl=path=>path?SITE.api+'/storage/v1/object/public/property-media/'+String(path).split('/').map(encodeURIComponent).join('/'):'';
const sortedImages=p=>(p.property_images||[]).slice().sort((a,b)=>Number(b.is_cover)-Number(a.is_cover)||a.sort_order-b.sort_order);
const coverUrl=p=>storageUrl(sortedImages(p)[0]?.storage_path);
const propertyLink=p=>SITE.url+'?property='+encodeURIComponent(p.property_number);
const whatsAppLink=p=>'https://wa.me/'+SITE.phone.slice(1)+'?text='+encodeURIComponent(`السلام عليكم، أستفسر عن العقار رقم ${p.property_number}: ${p.title}\n${propertyLink(p)}`);
const availabilityLabel=s=>({available:'متاح',reserved:'محجوز',sold:'تم البيع'})[s]||'متاح';
function priceText(p){
  if(p.price_type==='on_request'||p.price==null)return 'السعر عند الطلب';
  const unit=p.price_basis==='per_m2'?' د.ل / م²':p.price_basis==='total'?' د.ل إجمالي':' د.ل — وحدة السعر بحاجة للتأكيد';
  return formatNum(p.price)+unit+(p.price_type==='negotiable'?' — قابل للتفاوض':'');
}
