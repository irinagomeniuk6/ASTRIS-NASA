(()=>{'use strict';
const form=document.querySelector('#login-form'),message=document.querySelector('#auth-error'),submit=document.querySelector('#login-submit');
async function req(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Astris-Action':'1'},body:JSON.stringify(body),credentials:'same-origin'});const j=await r.json();if(!r.ok)throw Error(j.error||'Помилка сервера.');return j;}
form.addEventListener('submit',async e=>{e.preventDefault();message.textContent='';submit.disabled=true;try{const r=await req('/api/auth/login',{username:form.elements.username.value.trim(),password:form.elements.password.value});location.replace(r.user.role==='operator'?'/index.html':'/crew.html');}catch(e){message.textContent=e.message;}finally{submit.disabled=false;}});
})();
