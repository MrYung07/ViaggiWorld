import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabaseConfigured = !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
const supabase = supabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (id) => document.getElementById(id);
let user = null, profile = null, offers = [], chatChannel = null, toastTimer;
$('year').textContent = new Date().getFullYear();

function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3600)}
function money(value){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(value))}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function placeholderImage(title){return 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1000&q=80'}
function renderOffers(){
  const q=$('searchOffers').value.trim().toLowerCase();const sort=$('sortOffers').value;
  let rows=offers.filter(o=>(o.title+' '+(o.description||'')).toLowerCase().includes(q));
  if(sort==='price-asc')rows.sort((a,b)=>a.price-b.price);if(sort==='price-desc')rows.sort((a,b)=>b.price-a.price);
  $('offerCount').textContent=rows.length+' '+(rows.length===1?'offerta':'offerte');
  $('offers').innerHTML=rows.length?rows.map(o=>'<article class="offer-card"><div class="offer-image" style="background-image:url(&quot;'+escapeHtml(o.image_url||placeholderImage(o.title))+'&quot;)"><span class="offer-price">'+money(o.price)+'</span></div><div class="offer-body"><h3>'+escapeHtml(o.title)+'</h3><p>'+escapeHtml(o.description)+'</p><div class="offer-footer"><small>Prezzo per persona / offerta</small><button class="buy-btn" data-buy="'+escapeHtml(o.id)+'">Prenota ↗</button></div></div></article>').join(''):'<div class="empty-state">Non ci sono offerte che corrispondono alla ricerca.</div>';
  document.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>checkout(b.dataset.buy,b)));
}
async function loadOffers(){
  if(!supabaseConfigured){offers=[{id:'demo-1',title:'Weekend a Parigi',price:249,description:'Due notti nella città della luce. Esempio dimostrativo: collega Supabase per pubblicare offerte reali.',image_url:'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1000&q=85'},{id:'demo-2',title:'Alla scoperta di Kyoto',price:389,description:'Templi, giardini e tradizioni giapponesi. Esempio dimostrativo, non acquistabile.',image_url:'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000&q=85'},{id:'demo-3',title:'Costiera Amalfitana',price:179,description:'Borghi colorati, mare e panorami indimenticabili. Esempio dimostrativo, non acquistabile.',image_url:'https://images.unsplash.com/photo-1533587851505-d119e13fa0d7?auto=format&fit=crop&w=1000&q=85'}];renderOffers();$('offerCount').textContent='Modalità demo';return}
  const {data,error}=await supabase.from('offers').select('id,title,description,image_url,price,currency,active,created_at').eq('active',true).order('created_at',{ascending:false});
  if(error){$('offers').innerHTML='<div class="empty-state">Impossibile caricare le offerte. Controlla la configurazione Supabase.</div>';return}
  offers=data||[];renderOffers();
}
async function checkout(id,button){
  if(String(id).startsWith('demo-')){toast('Modalità demo: configura Supabase e Stripe per attivare i pagamenti.');return}
  if(!user){$('authDialog').showModal();toast('Accedi o crea un account prima di prenotare.');return}
  button.disabled=true;button.textContent='Attendi…';
  try{const {data:{session}}=await supabase.auth.getSession();const response=await fetch('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({offerId:id})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Non è stato possibile avviare il pagamento.');window.location.href=result.url}
  catch(e){toast(e.message||'Errore durante il pagamento.');button.disabled=false;button.textContent='Prenota ↗'}
}
function setUserUI(){
  $('authOpen').textContent=user?'Account':'Accedi';$('logoutBtn').classList.toggle('hidden',!user);$('accountStatus').textContent=user?'Connesso come '+user.email:'Non hai effettuato l’accesso.';$('chatInput').disabled=!user;$('chatInput').placeholder=user?'Scrivi un messaggio…':'Accedi per scrivere un messaggio…';$('chatForm').querySelector('button').disabled=!user;$('chatStatus').textContent=user?'Rispetta gli altri viaggiatori e non condividere dati personali.':'La chat richiede un account.';$('admin').classList.toggle('hidden',!profile||profile.role!=='admin');
}
async function loadProfile(){profile=null;if(user){const {data}=await supabase.from('profiles').select('id,role,display_name').eq('id',user.id).maybeSingle();profile=data}setUserUI()}
async function loadMessages(){
  if(!supabaseConfigured)return;
  const {data,error}=await supabase.from('chat_messages').select('id,user_id,display_name,content,created_at').order('created_at',{ascending:true}).limit(100);
  if(error){$('chatMessages').innerHTML='<div class="chat-welcome">Configura le policy SQL della chat per mostrare i messaggi.</div>';return}
  $('chatMessages').innerHTML='';(data||[]).forEach(addMessage);if(!data?.length)$('chatMessages').innerHTML='<div class="chat-welcome">Nessun messaggio ancora. Dai il via alla conversazione!</div>';scrollChat();
}
function addMessage(m){const empty=$('chatMessages').querySelector('.chat-welcome');if(empty)empty.remove();const div=document.createElement('div');div.className='message'+(user&&m.user_id===user.id?' mine':'');const time=new Date(m.created_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});div.innerHTML='<span class="message-meta">'+escapeHtml(m.display_name||'Viaggiatore')+' · '+time+'</span>'+escapeHtml(m.content);$('chatMessages').appendChild(div);scrollChat()}
function scrollChat(){$('chatMessages').scrollTop=$('chatMessages').scrollHeight}
async function startChat(){
  if(!supabaseConfigured)return;
  if(chatChannel){await supabase.removeChannel(chatChannel);chatChannel=null}
  await loadMessages();
  chatChannel=supabase.channel('public-chat').on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},payload=>addMessage(payload.new)).subscribe();
}
async function auth(mode){
  if(!supabaseConfigured){$('authStatus').textContent='Prima configura URL e chiave pubblica di Supabase nel file app.js.';return}
  const email=$('authEmail').value.trim(),password=$('authPassword').value;$('authStatus').textContent='Attendi…';
  const result=mode==='signup'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});
  if(result.error){$('authStatus').textContent=result.error.message;return}
  if(mode==='signup'&&!result.data.session){$('authStatus').textContent='Account creato. Controlla la tua email per confermare la registrazione.';return}
  user=result.data.user;await loadProfile();await startChat();$('authDialog').close();$('authStatus').textContent='';toast(mode==='signup'?'Account creato!':'Accesso effettuato.');}
$('authOpen').addEventListener('click',()=>user?toast('Sei connesso come '+user.email):$('authDialog').showModal());
$('accountOpen').addEventListener('click',()=>$('authDialog').showModal());
$('authClose').addEventListener('click',()=>$('authDialog').close());
$('authForm').addEventListener('submit',e=>{e.preventDefault();auth('login')});
$('signupBtn').addEventListener('click',()=>auth('signup'));
$('logoutBtn').addEventListener('click',async()=>{if(supabase)await supabase.auth.signOut();user=null;profile=null;setUserUI();await startChat();toast('Hai effettuato la disconnessione.')});
$('searchOffers').addEventListener('input',renderOffers);$('sortOffers').addEventListener('change',renderOffers);
$('chatForm').addEventListener('submit',async e=>{e.preventDefault();const content=$('chatInput').value.trim();if(!user||!content||!supabase)return;const {error}=await supabase.from('chat_messages').insert({user_id:user.id,display_name:profile?.display_name||user.email.split('@')[0],content});if(error){toast('Messaggio non inviato: '+error.message);return}$('chatInput').value=''});
$('offerForm').addEventListener('submit',async e=>{e.preventDefault();if(!profile||profile.role!=='admin'||!supabase)return;const form=new FormData(e.currentTarget);const price=Number(form.get('price'));const payload={title:String(form.get('title')).trim(),price,description:String(form.get('description')).trim(),image_url:String(form.get('image_url')).trim()||null,currency:'eur',active:true,created_by:user.id};const {error}=await supabase.from('offers').insert(payload);$('adminStatus').textContent=error?'Errore: '+error.message:'Offerta pubblicata!';if(!error){e.currentTarget.reset();await loadOffers()}});
async function init(){
  const params=new URLSearchParams(location.search);if(params.get('payment')==='success')toast('Pagamento completato. La conferma arriverà via email se configurata.');if(params.get('payment')==='cancelled')toast('Pagamento annullato.');
  if(!supabaseConfigured){setUserUI();await loadOffers();return}
  const {data:{session}}=await supabase.auth.getSession();user=session?.user||null;await loadProfile();await loadOffers();await startChat();
  supabase.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;await loadProfile();await startChat()});
}
init();
