'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  let client,ready=false;
  const incoming=new URLSearchParams(location.hash.slice(1));
  const hasLinkError=incoming.has('error')||incoming.has('error_code');
  function message(text,ok=false){$('message').textContent=text;$('message').className=ok?'success':'error'}
  function showPasswordForm(){ready=true;$('requestForm').hidden=true;$('passwordForm').hidden=false;$('intro').textContent='تم التحقق من الدخول. اختر كلمة المرور الجديدة بنفسك.';history.replaceState(null,'',location.pathname);}
  $('showPassword').addEventListener('change',()=>{const type=$('showPassword').checked?'text':'password';$('newPassword').type=type;$('confirmPassword').type=type});
  $('requestForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!client)return;$('sendRecovery').disabled=true;$('sendRecovery').textContent='جارٍ الإرسال...';
    try{
      const {error}=await client.auth.resetPasswordForEmail($('recoveryEmail').value.trim(),{redirectTo:SITE.url+'recover.html'});
      if(error){if(error.status===429)throw new Error('طلبات كثيرة خلال وقت قصير. انتظر قليلًا قبل المحاولة مرة أخرى.');throw new Error('تعذر إرسال الرسالة. تحقق من الاتصال، أو تواصل مع مدير الموقع لفحص إعداد البريد.');}
      message('تم قبول طلب الاستعادة. إذا كان البريد مسجّلًا، ستصلك رسالة برابط لتعيين كلمة مرور جديدة. افحص البريد الوارد والرسائل غير المرغوب فيها.',true);
    }catch(e){message(e.message||'تعذر الاتصال. أعد المحاولة.');}
    finally{$('sendRecovery').disabled=false;$('sendRecovery').textContent='إرسال رابط الاستعادة'}
  });
  $('passwordForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!ready)return;
    if($('newPassword').value!==$('confirmPassword').value){message('كلمتا المرور غير متطابقتين.');return}
    if($('newPassword').value.length<12){message('استخدم كلمة مرور من 12 حرفًا على الأقل.');return}
    $('savePassword').disabled=true;
    try{
      const {error}=await client.auth.updateUser({password:$('newPassword').value});
      if(error){message(error.code==='same_password'?'اختر كلمة مرور تختلف عن السابقة.':error.code==='weak_password'?'اختر كلمة مرور أقوى تحتوي حروفًا وأرقامًا ورموزًا.':'تعذر تحديث كلمة المرور. قد يكون الرابط منتهيًا؛ اطلب رسالة استعادة جديدة.');return}
      $('newPassword').value='';$('confirmPassword').value='';$('passwordForm').hidden=true;ready=false;
      message('تم تغيير كلمة المرور بنجاح. يمكنك الآن الدخول إلى لوحة الإدارة.',true);$('finished').hidden=false;
      await client.auth.signOut({scope:'local'});
    }catch{message('تعذر تأكيد اكتمال العملية. حاول تسجيل الدخول بكلمة المرور الجديدة، أو اطلب رابطًا جديدًا.');}
    finally{$('savePassword').disabled=false}
  });
  async function init(){
    try{
      client=supabase.createClient(SITE.api,SITE.key,{auth:{flowType:'implicit',detectSessionInUrl:true}});
      const {data,error}=await client.auth.getSession();
      if(error||hasLinkError){history.replaceState(null,'',location.pathname);message('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رسالة جديدة.');}
      else if(data.session){const response=await client.auth.getUser();if(!response.error&&response.data.user)showPasswordForm();else message('تعذر التحقق من الرابط. اطلب رسالة جديدة.');}
      $('sendRecovery').disabled=false;
    }catch{message('تعذر تجهيز صفحة الاستعادة. حدّث الصفحة وتحقق من الاتصال.');}
  }
  init();
})();
