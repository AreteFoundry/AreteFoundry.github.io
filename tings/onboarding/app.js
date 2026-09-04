/* ============================================================ *
   Tings Interactive Onboarding — simulator + guided coach
   Vanilla JS, no framework. Mirrors the real Tings app surfaces
   (home / add / detail / settings / overview / agenda) so a new
   user can actually *do* the core loop instead of just watch.

   Architecture:
   - `state` is the demo model (habits, busy times, places, mode).
   - render() reads state and paints the phone screen.
   - Sheets have stable skeletons in HTML; only content containers
     are repopulated, so form inputs keep focus.
   - The coach is reason-driven: app handlers call coach.bump(reason)
     after mutating state; the coach advances only when the reason
     matches the current step's `expect`.
 * ============================================================ */
const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => Array.from((p||document).querySelectorAll(s));
const on = (id, ev, fn) => { const el=$('#'+id); if(el) el.addEventListener(ev, fn); };

/* ---------------- constants ---------------- */
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const COLORS = ['teal','amber','red','purple','blue','green','pink'];
const COLOR_RGB = ['#0F6E56','#BA7517','#A32D2D','#534AB7','#176B91','#1B5E20','#C2185B'];
const weekStart = (() => { const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d; })();
const today = (() => { const d=new Date(); d.setHours(0,0,0,0); return d; })();
let sheetsBuilt = {settings:false, samples:false};

/* ---------------- time helpers ---------------- */
function daysSince(ts){ if(ts==null) return null; return Math.round((Date.now()-ts)/86400000); }
function pad(n){ return String(n).padStart(2,'0'); }
function fmtTime(min){ if(min==null) return '—'; const h=Math.floor(min/60)%24, m=min%60; const am=h<12; const h12=h%12||12; return `${h12}:${pad(m)} ${am?'am':'pm'}`; }
function fmtDate(ms){ const d=new Date(ms); d.setHours(0,0,0,0); return `${DAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleString('default',{month:'short'})}`; }
function tomorrowDate(){ const d=new Date(); d.setDate(d.getDate()+1); return d; }
function sameDay(a,b){ const da=new Date(a),db=new Date(b); return da.getFullYear()===db.getFullYear()&&da.getMonth()===db.getMonth()&&da.getDate()===db.getDate(); }
function lastNDays(n){ const a=[]; for(let i=n-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);d.setHours(0,0,0,0);a.push(d.getTime());} return a.reverse(); }

/* ---------------- data model ---------------- */
function makeTing(o){
  return Object.assign({
    id:Math.random().toString(36).slice(2,9), name:'Untitled', emoji:'🧡', color:'blue',
    type:'habit', kind:'build', targetTimes:1, targetDays:1, flexibilityDays:0,
    durationMinutes:30, priority:2, dueDate:null, eventTime:null, breakable:false,
    minChunkMinutes:30, logs:[], pinned:false, sample:false, snoozed:false,
    topics:[], place:null, plannedDate:null, agenda:null, done:false, timer:false
  }, o);
}
function statusFor(h){
  if(h.done) return 'done';
  const logs=h.logs||[]; const last=logs.length?logs[logs.length-1]:null;
  if(h.type==='habit'){
    if(!last) return 'new';
    const d=daysSince(last); const t=h.targetDays||7;
    if(d<=t) return 'done';
    if(d<=Math.ceil(t*1.35)) return 'almost';
    return 'behind';
  }
  if(h.type==='task'){
    if(h.dueDate){ const ed=new Date(h.dueDate); ed.setHours(0,0,0,0); if(h.eventTime!=null) ed.setTime(ed.getTime()+(h.eventTime||0)*60000);
      if(ed.getTime()<=Date.now()) return 'behind';
      const diff=daysSince(ed.getTime()); if(diff<=2) return 'almost'; return 'new';
    }
    return 'new';
  }
  return 'new';
}
function toneFor(h){
  const s=statusFor(h);
  if(h.type==='habit'){
    if(s==='behind') return 'red'; if(s==='almost') return 'amber'; return 'teal';
  }
  if(h.type==='task'){
    if(h.done) return 'teal'; if(s==='behind') return 'red'; if(s==='almost') return 'amber'; return 'quiet';
  }
  return 'teal';
}
function cueFor(h){
  if(h.snoozed) return '⏸️ snoozed for now';
  if(h.done) return 'completed';
  const s=statusFor(h);
  if(h.type==='habit'){
    if(s==='new') return 'ready to start';
    if(s==='done') return 'on track';
    if(s==='almost') return 'due soon';
    const d=daysSince(h.logs[h.logs.length-1]); return `${d}d overdue`;
  }
  if(h.type==='task'){
    if(s==='behind') return h.dueDate?'overdue':'due today';
    if(s==='almost') return 'due soon';
    return h.dueDate?'someday':'ready to start';
  }
  return 'ready to start';
}
function progressFor(h){
  if(h.type==='task') return h.done?100:(h.dueDate&&new Date(h.dueDate)<today?0:40);
  const logs=h.logs||[]; const last=logs.length?logs[logs.length-1]:null;
  if(!last){ const t=h.targetDays||7; return Math.round(100-(t/(t+2))*100); }
  const d=daysSince(last); const t=h.targetDays||7;
  return Math.max(0,Math.min(100,100-Math.round((Math.min(d,t)/t)*100)));
}
function suggestEmoji(name){
  const m={run:'🏃',read:'📚',walk:'🚶‍♂️',gym:'💪',water:'💧',coffee:'☕',medit:'🧘',report:'📝',sleep:'🌙',work:'💼',call:'☎️',stretch:'🧘'};
  const l=name.toLowerCase(); for(const k in m) if(l.includes(k)) return m[k]; return '🧡';
}
function emojiStyle(h){ const i=COLORS.indexOf(h.color); return i>=0?`background:${COLOR_RGB[i]};color:#fff`:''; }
function cardTone(h){
  if(h.done) return 'hit';
  const s=statusFor(h);
  if(s==='behind') return 'miss';
  if(s==='almost') return 'warn';
  if(h.placedToday && h.agenda) return 'plan';
  return 'hit';
}
const COLOR_TINT = ['#E1F5EE','#FAEEDA','#FCEBEB','#EEEDFE','#E6F2FA','#E8F5E9','#FCE7F0'];
function tintBg(h){ const i=COLORS.indexOf(h.color); return COLOR_TINT[i>=0?i:0]; }
function iconOf(h){
  if(h.type==='task') return 'ti-clipboarding-list';
  if(h.kind==='stop') return 'ti-bolt';
  if(h.kind==='limit') return 'ti-hash';
  return 'ti-leaf';
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function metaMinimal(h){
  if(h.type==='task') return h.dueDate?`📅 ${fmtDate(h.dueDate)}`:'someday task';
  return `${h.targetTimes}× in ${h.targetDays}d`;
}

/* ---------------- app STATE ---------------- */
const state = {
  mode:'minimal', screen:'home',
  settings:{ minimalMode:true, weekByDay:false, smarterPacking:false, theme:'light' },
  habits:[], busy:[], places:[], detailIdx:0,
  sheets:{}, toast:'', addType:'habit',
};
const BUSY_DEMO=[
  {label:'sleep',start:1380,end:300,days:[0,1,2,3,4,5,6]},
  {label:'work',start:540,end:1020,days:[1,2,3,4,5]},
  {label:'dinner',start:1080,end:1140,days:[0,1,2,3,4,5,6]},
  {label:'commute',start:510,end:540,days:[1,2,3,4,5]},
];

function freeSegments(busy){
  // collect all busy blocks + the full day, splitting any that wrap past midnight
  const raw=[{start:0,end:1440}];
  for(const b of busy) raw.push({start:b.start,end:b.end});
  const split=[];
  for(const b of raw){ if(b.end<b.start){ split.push({start:b.start,end:1440},{start:0,end:b.end}); } else split.push(b); }
  split.sort((a,b)=>a.start-b.start);
  // merge overlaps
  const merged=[];
  for(const b of split){ if(merged.length && b.start<=merged[merged.length-1].end){ merged[merged.length-1].end=Math.max(merged[merged.length-1].end,b.end); } else merged.push({start:b.start,end:b.end}); }
  let cur=0; const out=[];
  for(const b of merged){ if(b.start>cur) out.push({start:cur,end:b.start}); cur=Math.max(cur,b.end); }
  return out;
}
function recomputeAgenda(){
  for(const h of state.habits){ if(h.done||!h.placedToday) h.agenda=null; }
  const dow=weekStart.getDay(); const dayBusy=state.busy.filter(b=>(b.days||DAYS.map((_,i)=>i)).includes(dow));
  const items=state.habits.filter(h=>h.placedToday&&!h.done);
  const remaining=freeSegments(dayBusy).map(s=>({start:s.start,end:s.end}));
  for(const h of items){
    const need=h.durationMinutes||30; let best=-1;
    for(let i=0;i<remaining.length;i++){ if(remaining[i].end-remaining[i].start>=need){ best=i; break; } }
    if(best>=0){ const g=remaining[best]; const start=g.start; const end=start+need;
      h.agenda={start,end,label:fmtTime(start)}; remaining[best]={start:end,end:g.end};
      remaining.sort((a,b)=>a.start-b.start);
    } else { h.agenda=null; }
  }
}
function openMinutes(i){
  const d=new Date(weekStart); d.setDate(d.getDate()+i); const dow=d.getDay();
  const dayBusy=state.busy.filter(b=>(b.days||DAYS.map((_,x)=>x)).includes(dow)); const segs=freeSegments(dayBusy);
  const total=segs.reduce((a,s)=>a+(s.end-s.start),0); const biggest=Math.max(0,...segs.map(s=>s.end-s.start));
  return {total,biggest};
}

/* ---------------- RENDER PIPELINE ---------------- */
function render(){
  buildSheetsOnce();
  syncSheets();
  renderAppBar();
  renderList();
  renderAgenda();
  renderOverview();
  renderDetail();
  renderBusyList(); renderPlacesList();
  $('#list').classList.toggle('show', state.screen==='home');
  $('#agenda').classList.toggle('show', state.screen==='agenda');
  $('#overview-pane').classList.toggle('show', state.screen==='overview');
  $('#detail-pane').classList.toggle('show', state.screen==='detail');
  const empty=$('#empty');
  empty.classList.toggle('show', state.screen==='home' && state.habits.length===0 && !state.sheets.add);
  document.body.classList.toggle('minimal-mode', state.settings.minimalMode);
  if(!document.body.classList.contains('compact-mode')) document.body.classList.add('compact-mode');
  document.documentElement.setAttribute('data-theme', state.settings.theme||'light');
  positionHighlight(currentStepTarget());
  renderToast();
}

function currentStepTarget(){ return (coach.steps[coach.step]||{}).target||null; }

function renderAppBar(){
  const fr=$('#home-tag-filter');
  fr.innerHTML = state.settings.minimalMode?'':`<span class="context-pill">at home</span><span class="context-pill">health</span>`;
  const date=$('#home-date'); if(date){ const d=new Date(); date.textContent=d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}); }
  const search=$('#app-bar-search'); if(search) search.hidden = state.settings.minimalMode;
}

/* ---------------- HOME LIST ---------------- */
function renderList(){
  const list=$('#list');
  if(state.habits.length===0){ list.innerHTML=''; return; }
  const groups=groupHome();
  list.innerHTML=groups.map(g=>`<div class="section-header"${g.dayBase!=null?` data-daybase="${g.dayBase}"`:''}>${g.label}${(!state.settings.minimalMode && g.openTime)?`<span class="context-pill schedule" style="margin-left:auto"><i class="ti ti-clock" style="margin-right:2px" aria-hidden="true"></i>${g.openTime}</span>`:''}</div>${g.items.map(h=>renderCard(h,g.dayBase)).join('')}`).join('');
}
function renderCard(h, dayBase){
  const min=state.settings.minimalMode;
  const cls=['ting-card', cardTone(h)];
  if(min) cls.push('minimal-card');
  if(h.done&&h.type==='task') cls.push('is-done');
  if(h.timer) cls.push('timer-running');
  if(h.snoozed) cls.push('snoozed');
  if(h.sample) cls.push('sample');
  if(h.logs&&h.logs.length) cls.push('logged');
  const ci=COLOR_RGB[COLORS.indexOf(h.color)>=0?COLORS.indexOf(h.color):0];
  const bg=tintBg(h);
  const placed=h.placedToday && !!h.agenda;
  let html=`<div class="swipe-row" data-id="${h.id}">`;
  if(!min){
    html+=`<div class="swipe-actions swipe-actions-left">`+
      `<button class="swipe-action sa-pin" data-action="pin" title="${h.pinned?'unpin':'pin'}"><i class="ti ${h.pinned?'ti-pin':'ti-pin'}"></i></button>`+
      (h.sample?`<button class="swipe-action sa-keep" data-action="keep" title="keep sample"><i class="ti ti-check"></i></button>`:``) +
      `<button class="swipe-action sa-activity" data-action="activity" title="activity"><i class="ti ti-history"></i></button>`+
      `<button class="swipe-action sa-timer" data-action="timer" title="session"><i class="ti ti-player-play"></i></button>`+
      `</div>`;
  }
  html+=`<div class="${cls.join(' ')}" data-id="${h.id}" data-daybase="${dayBase||''}" style="--card-accent:${ci};--card-priority:${ci};--emoji-bg:${bg}">`;
  html+=renderDragHandle(h);
  const pulseCls = (h.emoji?'emoji-pulse ':'')+'has-emoji-bg';
  const pulseIcon = h.emoji?`<span class="emoji-mark">${escapeHtml(h.emoji)}</span>`:`<i class="ti ${iconOf(h)}"></i>`;
  html+=`<button class="pulse-btn ${pulseCls}" data-pulse="${h.id}" aria-label="${h.type==='task'?'complete':'log'} ${escapeHtml(h.name)}">${pulseIcon}</button>`;
  html+=`<div class="ting-info${placed?'':' no-trail'}">`;
  html+=`<div class="ting-main"><span class="ting-name" data-id="${h.id}">${escapeHtml(h.name)}</span>`;
  if(!min && h.agenda){ html+=`<span class="context-pill schedule" title="planned"><i class="ti ti-clock" style="margin-right:2px" aria-hidden="true"></i>${fmtTime(h.agenda.start)}</span>`; }
  html+=`</div>`;
  html+=`<div class="ting-cue">${escapeHtml(cueFor(h))}</div>`;
  html+=`<div class="ting-meta" aria-label="rhythm and plan">${min?`<span class="context-pill">${escapeHtml(metaMinimal(h))}</span>`:richMeta(h)}</div>`;
  html+=renderVisual(h);
  html+=renderCardActions(h);
  html+=`</div>`;
  if(!min){
    html+=`<div class="swipe-actions swipe-actions-right">`+
      `<button class="swipe-action sa-snooze" data-action="snooze" title="snooze"><i class="ti ti-moon"></i></button>`+
      `<button class="swipe-action sa-nuke" data-action="nuke" title="remove"><i class="ti ti-trash"></i></button>`+
    `</div>`;
  }
  html+=`</div>`; // ting-card
  html+=`</div>`; // swipe-row
  return html;
}
function richMeta(h){
  const pills=[]; const s=statusFor(h);
  pills.push(`<span class="context-pill status ${s}">${s==='new'?'new':s==='done'?progressFor(h)+'%':s}</span>`);
  if(h.sample) pills.push(`<span class="context-pill sample">sample</span>`);
  if(h.pinned) pills.push(`<span class="context-pill pinned">pinned</span>`);
  if(h.plannedDate&&h.agenda) pills.push(`<span class="context-pill">planned today</span>`);
  if(h.dueDate) pills.push(`<span class="context-pill due">${h.eventTime!=null?'scheduled':'due '+fmtDate(h.dueDate)}</span>`);
  if(h.type==='habit'){
    if(h.kind==='limit') pills.push(`<span class="context-pill">limit</span>`);
    if(h.kind==='stop') pills.push(`<span class="context-pill">stop</span>`);
    pills.push(`<span class="context-pill">${h.targetTimes}× in ${h.targetDays}d</span>`);
    if(h.durationMinutes) pills.push(`<span class="context-pill">${h.durationMinutes} min</span>`);
    if(h.flexibilityDays) pills.push(`<span class="context-pill early">early</span>`);
    if(h.place) pills.push(`<span class="context-pill">${h.place}</span>`);
  }
  if(h.topics&&h.topics.length) pills.push(`<span class="context-pill">${h.topics[0]}</span>`);
  if(h.snoozed) pills.push(`<span class="context-pill">snoozed</span>`);
  return pills.join('');
}
function renderVisual(h){
  const dots=[]; const logs=h.logs||[]; const last7=lastNDays(7);
  for(let i=0;i<7;i++){ const ts=logs.find(l=>sameDay(l,last7[i])); const cls=ts?statusFor(h):''; const extra=i===6?' today':'';
    dots.push(`<span class="trail-dot ${cls}${extra}"></span>`); }
  if(h.timer){ return `<div class="ting-visual"><span class="trail-dots">${dots.join('')}</span><div class="session-bar active"></div></div>`; }
  return `<div class="ting-visual"><span class="trail-dots">${dots.join('')}</span></div>`;
}
function renderCardActions(h){
  const canTimer=!h.done && (h.type!=='task'||!h.dueDate);
  return `<div class="card-actions" aria-label="habit actions">`+
    `<button class="card-action-btn" data-action="activity" title="activity"><i class="ti ti-history"></i></button>`+
    `<button class="card-action-btn" data-action="snooze" title="snooze"><i class="ti ti-moon"></i></button>`+
    (canTimer?`<button class="card-action-btn" data-action="timer" title="session"><i class="ti ti-player-play"></i></button>`:'')+`</div>`;
}
function renderSwipeShelves(h){
  const keep=h.sample?`<button class="swipe-action sa-keep" data-action="keep" title="keep"><i class="ti ti-check"></i></button>`:'';
  return `<div class="swipe-actions-left">`+
    `<button class="swipe-action sa-pin" data-action="pin" title="pin"><i class="ti ti-pin"></i></button>`+
    `${keep}<button class="swipe-action sa-activity" data-action="activity" title="activity"><i class="ti ti-history"></i></button>`+
    `<button class="swipe-action sa-timer" data-action="timer" title="session"><i class="ti ti-player-play"></i></button>`+
  `</div><div class="swipe-actions-right">`+
    `<button class="swipe-action sa-snooze" data-action="snooze" title="snooze"><i class="ti ti-moon"></i></button>`+
    `<button class="swipe-action sa-nuke" data-action="nuke" title="remove"><i class="ti ti-trash"></i></button>`+
  `</div>`;
}
function renderDragHandle(h){
  if(state.settings.minimalMode || !h.placedToday) return '';
  return `<button type="button" class="agenda-drag-handle" data-drag="${h.id}" aria-label="drag to reorder" title="drag to reorder"><i class="ti ti-grip-vertical"></i></button>`;
}

function groupHome(){
  const pinned=state.habits.filter(h=>h.pinned);
  const rest=state.habits.filter(h=>!h.pinned).slice();
  const dueToday=[], overdue=[], coming=[], other=[];
  for(const h of rest){
    const s=statusFor(h);
    if(h.plannedDate){ if(daysSince(h.plannedDate)<=0) overdue.push(h); else if(daysSince(h.plannedDate)<=7) coming.push(h); else other.push(h); }
    else if(h.dueDate){ const diff=daysSince(h.dueDate); if(diff<=0) overdue.push(h); else if(diff<=7) coming.push(h); else other.push(h); }
    else if(s==='behind') overdue.push(h);
    else if(h.placedToday) dueToday.push(h);
    else if(s==='almost') coming.push(h);
    else other.push(h);
  }
  const g=[];
  if(pinned.length) g.push({label:'Pinned',items:pinned,openTime:null});
  if(state.settings.minimalMode){
    const ready=rest.filter(h=>!h.dueDate&&!h.plannedDate&&!h.placedToday&&statusFor(h)!=='behind');
    dueToday.push(...ready);
    g.push({label:'Today',items:dueToday,dayBase:0,openTime:fmtOpen(0)});
    if(overdue.length) g.push({label:'Overdue',items:overdue,openTime:null});
    if(coming.length) g.push({label:'Coming up',items:coming,openTime:null});
    g.push({label:'The rest',items:other,openTime:null});
  } else {
    g.push({label:'Today',items:dueToday,dayBase:0,openTime:fmtOpen(0)});
    g.push({label:'Tomorrow',items:[]});
    for(let i=2;i<7;i++) g.push({label:dayLabel(i),items:[]});
    if(overdue.length) g.push({label:'Overdue',items:overdue});
    if(coming.length) g.push({label:'Coming up',items:coming});
    g.push({label:'The rest',items:other});
  }
  return g;
}
function dayLabel(i){ const d=new Date(weekStart); d.setDate(d.getDate()+i); return `${DAYS[d.getDay()]} ${d.getDate()}`; }
function fmtOpen(i){ const {total,biggest}=openMinutes(i); return total?`${Math.round(total/60)}h open · ${Math.round(biggest/60)}h stretch`:null; }

/* ---------------- AGENDA (day plan) ---------------- */
function renderAgenda(){
  recomputeAgenda();
  const dow=weekStart.getDay(); const dayBusy=state.busy.filter(b=>(b.days||DAYS.map((_,i)=>i)).includes(dow));
  const placed=state.habits.filter(h=>h.placedToday && !h.done);
  let out='';
  out+=`<div class="agenda-day-header"><span class="date">Today</span><span class="open-time-pill">${fmtOpen(0)||''}</span></div>`;
  const items=[];
  for(const b of dayBusy) items.push({type:'busy',...b});
  for(const h of placed) items.push({type:'item',h});
  items.sort((a,b)=>{ const ta=a.type==='busy'?a.start:(a.h.agenda?a.h.agenda.start:9999); const tb=b.type==='busy'?b.start:(b.h.agenda?b.h.agenda.start:9999); return ta-tb; });
  for(const it of items){ out+= it.type==='busy'?renderBusyCard(it):renderAgendaRow(it.h); }
  $('#agenda').innerHTML=out;
}
function renderBusyCard(b){
  return `<div class="busy-card"><span><b class="busy-label">${b.label}</b> <span class="busy-range">${fmtTime(b.start)}–${fmtTime(b.end)}</span></span><button class="icon-btn" data-busy-clear="${b.label}" style="width:26px;height:26px;font-size:12px"><i class="ti ti-x"></i></button></div>`;
}
function renderAgendaRow(h){
  const t=h.agenda; const time=t?fmtTime(t.start):'—';
  const ts = t?`<span class="agenda-time">${time}</span>`:`<span class="agenda-time" style="color:var(--text3)">pending</span>`;
  return `<div class="agenda-row"><span class="agenda-dot">${h.emoji}</span>${ts}<span class="agenda-name">${h.name}</span><span style="margin-left:auto">${h.durationMinutes} min</span></div>`;
}

/* ---------------- OVERVIEW ---------------- */
function renderOverview(){
  const m=new Date(); m.setDate(1); m.setHours(0,0,0,0);
  const firstDow=(m.getDay()-today.getDay()+7)%7;
  const daysInMonth=new Date(m.getFullYear(),m.getMonth()+1,0).getDate();
  let out='';
  out+=`<div class="overview-month"><div class="overview-month-label">${m.toLocaleString('default',{month:'long'})} ${m.getFullYear()}</div><div class="overview-grid">`;
  DAYS.forEach(d=>out+=`<div class="overview-gridday">${d.slice(0,1)}</div>`);
  const logsByDay={};
  for(const h of state.habits) for(const l of (h.logs||[])){ const d=new Date(l); d.setHours(0,0,0,0); const k=d.getTime(); logsByDay[k]=(logsByDay[k]||0)+1; }
  for(let i=0;i<(firstDow+daysInMonth);i++){
    if(i<firstDow){ out+=`<div class="overview-day empty"></div>`; continue; }
    const dayNum=i-firstDow+1; const d=new Date(m.getFullYear(),m.getMonth(),dayNum); d.setHours(0,0,0,0);
    const isToday=sameDay(d.getTime(),today.getTime()); const cnt=logsByDay[d.getTime()]||0;
    let dot=''; for(let k=0;k<cnt;k++) dot+=`<span class="o-dot"></span>`;
    out+=`<div class="overview-day ${isToday?'today':''}" data-day="${dayNum}"><b>${dayNum}</b><div class="overview-dots">${dot}</div></div>`;
  }
  out+=`</div></div>`;
  if(!state.settings.minimalMode){
    out+=`<div class="overview-panes">
      <div class="overview-pane"><h4>open hours</h4><p>${weekdayOpen()}</p></div>
      <div class="overview-pane"><h4>coming up</h4><p>${state.habits.filter(h=>h.dueDate).map(h=>h.name).join(', ')||'nothing yet'}</p></div>
      <div class="overview-pane"><h4>needs attention</h4><p>${state.habits.filter(h=>statusFor(h)==='behind').map(h=>h.name).join(', ')||'nothing behind'}</p></div>
    </div>`;
  }
  $('#overview-pane').innerHTML=out;
}
function weekdayOpen(){
  let s=''; for(let i=0;i<7;i++){ const o=openMinutes(i); if(o.total) s+=`${DAYS[i]} ${Math.round(o.total/60)}h· `; }
  return s || 'No busy times set.';
}

/* ---------------- DETAIL ---------------- */
function renderDetail(){
  const h=state.habits[state.detailIdx];
  if(!h){ $('#detail-pane').innerHTML=''; return; }
  const pages=[
    {id:'page-calendar',label:'calendar'},{id:'page-insight',label:'insight'},
    {id:'page-schedule',label:'schedule'},{id:'page-effort',label:'effort'},
    {id:'page-identity',label:'identity'},{id:'page-actions',label:'actions'},
  ];
  const shown = state.settings.minimalMode ? pages.filter(p=>!['insight','effort'].includes(p.label)) : pages;
  const status=statusFor(h);
  let out='';
  const dci=COLOR_RGB[COLORS.indexOf(h.color)>=0?COLORS.indexOf(h.color):0];
  out+=`<div class="detail-head ting-card ${cardTone(h)}" style="--card-accent:${dci};--emoji-bg:${tintBg(h)}"><button class="pulse-btn detail-mark emoji-pulse has-emoji-bg" data-pulse="${h.id}" aria-label="log ${h.name}"><span class="emoji-mark">${escapeHtml(h.emoji||'🧡')}</span></button>`;
  out+=`<div class="ting-info"><div class="ting-main"><span class="ting-name">${h.name}</span></div><div class="ting-cue detail-cue">${cueFor(h)}</div><div class="ting-meta">${!state.settings.minimalMode?`<span class="context-pill status ${status}">${progressFor(h)}%</span>`:`<span class="context-pill">${metaMinimal(h)}</span>`}</div></div>`;
  out+=`<div class="detail-head-actions"><button class="icon-btn" data-detail-action="done" title="${h.done?'uncomplete':'mark done'}"><i class="ti ${h.done?'ti-reload':'ti-check'}"></i></button></div></div>`;
  out+=`<div class="detail-pager-wrap"><div class="detail-pager" id="detail-pager">`;
  shown.forEach((p,i)=>{ out+=`<div class="detail-page" id="${p.id}" data-page="${i}"><div class="page-content"><h4>${p.label}</h4><p>${pageBlurb(h,p.label)}</p></div></div>`; });
  out+=`</div><div class="detail-dots" id="detail-dots">`;
  shown.forEach((p,i)=>{ out+=`<button type="button" class="detail-dot" data-dot="${i}"></button>`; });
  out+=`</div></div>`;
  $('#detail-pane').innerHTML=out;
  // reset pager scroll
  const pager=$('#detail-pager'); if(pager) pager.style.transform='translateX(0)';
  $$('.detail-dot').forEach((d,i)=>d.classList.toggle('active',i===0));
}
function pageBlurb(h,label){
  const map={
    calendar:`Month grid of ${h.name}'s history. Dots = days you logged.`,
    insight:`Score ring + trend: since last log, usual gap, last-30-day count, streak.`,
    schedule:`When ${h.name} is allowed (hard window) and preferred (soft nudge).`,
    effort:`Duration, flexibility, breakable chunks, auto-mark, and timer.`,
    identity:`Name, emoji, kind, priority, topics & places.`,
    actions:`Order links, pin, snooze, and remove.`,
  };
  return map[label];
}

/* ---------------- SHEETS (stable skeletons + dynamic content) ---------------- */
function buildSheetsOnce(){
  // settings-stack & samples-list are built once then kept; content containers refresh.
}
function syncSheets(){
  // add sheet: sync type seg + task row (inputs are static, keep focus)
  const isTask=(state.addType||'habit')==='task';
  if($('#task-due-row')){ $('#task-due-row').hidden=!isTask; }
  if($('#target-help')){ $('#target-help').textContent=isTask?'Due date & time':'How often — times in N days (e.g. 2× in 7d).'; }
  $$('#type-seg .seg-opt').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===(state.addType||'habit'))));
  $$('#type-seg .seg-opt').forEach(b=>b.classList.toggle('on', b.dataset.v===(state.addType||'habit')));
  // settings: build skeleton once, then always sync dynamic content
  const settingsWrap=$('#settings-sheet'); if(settingsWrap){
    settingsWrap.classList.toggle('open', !!state.sheets.settings);
    if(settingsWrap.classList.contains('open')){
      let stack=$('#settings-stack');
      if(!stack){
        stack=document.createElement('div'); stack.id='settings-stack'; stack.className='settings-stack';
        settingsWrap.querySelector('.sheet').insertBefore(stack, settingsWrap.querySelector('.sheet-footer')||null);
      }
      if(!sheetsBuilt.settings){ stack.innerHTML=renderSettingsSkeleton(); sheetsBuilt.settings=true; }
      syncSettingToggles();
    }
  }
  // samples
  const samplesWrap=$('#samples-sheet'); if(samplesWrap){
    samplesWrap.classList.toggle('open', !!state.sheets.samples);
    const list=samplesWrap.querySelector('#samples-list');
    if(samplesWrap.classList.contains('open') && list){ list.innerHTML=renderSamplesList(); }
  }
  // generic sheet visibility toggles
  $('#add-sheet').classList.toggle('open', !!state.sheets.add);
  $('#about-sheet').classList.toggle('open', !!state.sheets.about);
  // detail pane handled by screen === detail
}
function renderSettingsSkeleton(){
  return `<div class="settings-section"><h3 class="settings-section-title">Display</h3>
    ${settingRow('minimalMode','Minimal mode','Clean surface: emoji, name, status, how often.')}
    ${settingRow('weekByDay','Week by day','Day-by-day week instead of today / overdue / coming up.')}
    ${settingRow('smarterPacking','Smarter packing','Exact optimizer for tight days.')}
  </div>
  <div class="settings-section"><h3 class="settings-section-title">Busy times</h3>
    <p class="setting-hint small">Blocks the planner avoids — sleep, work, meals, commute.</p>
    <div class="busy-list" id="busy-list"></div>
    <div style="padding:8px 16px"><button class="btn btn-ghost" id="demo-busy"><i class="ti ti-bolt"></i> use demo busy times</button></div>
  </div>
  <div class="settings-section"><h3 class="settings-section-title">Locations</h3>
    <p class="setting-hint small">Places the planner plans around.</p>
    <div class="locations-list" id="locations-list"></div>
    <div style="padding:8px 16px">
      <input type="text" id="place-input" placeholder="place name…" style="width:calc(100% - 90px);border:1px solid var(--border);border-radius:8px;padding:6px 8px;font-size:13px;" />
      <button class="btn" id="place-add" style="width:50px"><i class="ti ti-plus"></i></button>
    </div>
  </div>`;
}
function syncSettingToggles(){
  $$('[data-setting]').forEach(row=>{
    const key=row.dataset.setting;
    row.setAttribute('aria-pressed', String(!!state.settings[key]));
  });
}
function renderBusyList(){
  const el=$('#busy-list'); if(!el) return;
  if(!state.busy.length){ el.innerHTML=`<div class="busy-item" style="font-size:12.5px;color:var(--text3)">No busy times set yet.</div>`; return; }
  el.innerHTML=state.busy.map(b=>`<div class="busy-item"><span><b class="busy-label">${b.label}</b> <span class="busy-range">${fmtTime(b.start)}–${fmtTime(b.end)}</span></span></div>`).join('');
}
function renderPlacesList(){
  const el=$('#locations-list'); if(!el) return;
  if(!state.places.length){ el.innerHTML=`<div class="location-item" style="font-size:12.5px;color:var(--text3)">No places yet.</div>`; return; }
  el.innerHTML=state.places.map(p=>`<div class="location-item"><span class="loc-dot"></span> ${p} <button class="icon-btn" style="width:24px;height:24px;font-size:12px;margin-left:auto" data-place-del="${p}"><i class="ti ti-x"></i></button></div>`).join('');
}
function renderSamplesList(){
  const samples=['Morning walk','Gym session','Write report','Water'];
  return samples.map(s=>`<div class="sample-item" data-sample="${s}"><span class="emoji-swatch">${s==='Morning walk'?'🏃':s==='Gym session'?'💪':s==='Write report'?'📝':'💧'}</span> ${s}</div>`).join('');
}
function settingRow(key,label,hint){
  const val=!!state.settings[key];
  return `<button type="button" class="setting-switch" data-setting="${key}" aria-pressed="${val}">`
    + `<span class="ss-label"><span class="setting-label">${label}</span><span class="setting-hint">${hint}</span></span>`
    + `<span class="switch-ui" aria-hidden="true"></span>`
    + `</button>`;
}

/* ---------------- toast (independent of full render) ---------------- */
function renderToast(){
  const t=$('#toast'); if(!t) return;
  if(!state.toast){ t.classList.remove('show'); t.innerHTML=''; return; }
  t.classList.add('show');
  t.innerHTML=`<i class="ti ti-check" aria-hidden="true"></i> <span>${state.toast}</span>`;
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ if(!state.toast) return; state.toast=''; if($('#toast')) $('#toast').classList.remove('show'); }, 1800);
}
let toastTimer=null;
function toast(msg){ state.toast=msg; renderToast(); }

/* ---------------- app INTERACTIONS ---------------- */
function logTing(id){ const h=state.habits.find(x=>x.id===id); if(!h||h.done) return; h.logs.push(Date.now()); recomputeAgenda(); render(); toast('Logged '+h.name); coach.bump('logged'); }
function openAdd(){ openSheet('add'); state.addType='habit'; $('#ting-message')?.focus(); render(); coach.bump('add-open'); }
function tryAdd(){
  const name=$('#ting-message').value.trim(); if(!name) return;
  const type=state.addType||'habit'; const times=parseInt($('#ting-times').value||3,10); const days=parseInt($('#ting-days').value||7,10);
  const emoji=suggestEmoji(name); const color=COLORS[(state.habits.length)%COLORS.length];
  const h=makeTing({name,type,kind:type==='habit'?'build':null,emoji,
    targetTimes:Math.max(1,times),targetDays:Math.max(1,days),priority:2,color,
    dueDate:type==='task'&&$('#ting-due-date').value?new Date($('#ting-due-date').value+'T12:00:00'):null,placedToday:type==='task'});
  if(type==='task') h.durationMinutes=60;
  state.habits.unshift(h); state.addType='habit'; $('#ting-message').value='';
  closeSheet('add'); toast('Added '+name); recomputeAgenda(); render(); coach.bump('ting-added');
}
function openSheet(n){ state.sheets=(state.sheets||{}); state.sheets[n]=true; render(); }
function closeSheet(n){ state.sheets=(state.sheets||{}); state.sheets[n]=false; render(); }
function switchScreen(to){
  state.screen=to; state.sheets=(state.sheets||{});
  if(to==='detail'){ if(state.habits.length) state.sheets.detail=true; } else state.sheets.detail=false;
  render(); coach.bump('screen-'+to);
}
function openDetail(idx){ state.detailIdx=idx; state.screen='detail'; state.sheets=(state.sheets||{}); state.sheets.detail=true; render(); coach.bump('detail-open'); }
function handleAction(action,id){
  const h=state.habits.find(x=>x.id===id); if(!h) return;
  if(action==='nuke'){ state.habits=state.habits.filter(x=>x.id!==id); recomputeAgenda(); render(); toast('Removed '+h.name); }
  else if(action==='pin'){ h.pinned=!h.pinned; render(); toast(h.pinned?h.name+' pinned':'Unpinned '+h.name); coach.bump('pin'); }
  else if(action==='snooze'){ h.snoozed=!h.snoozed; render(); toast(h.snoozed?h.name+' snoozed':'Snooze cleared'); coach.bump('snooze'); }
  else if(action==='activity'){ toast(h.name+' — activity sheet'); }
  else if(action==='timer'){ startSession(h); }
  else if(action==='keep'){ h.sample=!h.sample; render(); toast('Kept '+h.name); }
  else if(action==='done'){ h.done=!h.done; if(h.done&&h.type==='task') h.logs.push(Date.now()); recomputeAgenda(); render(); toast(h.done?'Completed '+h.name:'Uncompleted '+h.name); }
  else if(action==='detail-log'){ logTing(id); }
}
let sessionTimer=null;
function startSession(h){
  if(!h.timer){ h.timer=true; h.logs.push(Date.now()); }
  render(); toast('Session: '+h.name); if(sessionTimer) clearInterval(sessionTimer);
  sessionTimer=setInterval(()=>{},1000); coach.bump('timer-started');
}
function toggleSetting(key){ state.settings[key]=!state.settings[key]; if(key==='minimalMode') state.mode=state.settings.minimalMode?'minimal':'regular'; render(); coach.bump('toggle-'+key); }
function useDemoBusy(){ state.busy=[...BUSY_DEMO]; recomputeAgenda(); render(); coach.bump('busy-set'); }
function addPlace(name){ if(!name) return; state.places.push(name); render(); toast('Added place: '+name); coach.bump('place-added'); }

/* ---------- theme (mirrors docs site logic) ---------- */
function initTheme(){
  const saved=localStorage.getItem('theme');
  const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  state.settings.theme = saved || (prefersDark?'dark':'light');
  applyTheme();
}
function applyTheme(){ document.documentElement.setAttribute('data-theme', state.settings.theme); updateThemeIcon(); }
function toggleTheme(){ state.settings.theme=state.settings.theme==='dark'?'light':'dark'; localStorage.setItem('theme',state.settings.theme); applyTheme(); }
function updateThemeIcon(){ const i=$('#theme-toggle i'); if(i){ i.className='ti '+(state.settings.theme==='dark'?'ti-sun':'ti-moon'); } }

/* ---------- wiring ---------- */
function wire(){
  // static top-bar / sheet-close buttons (not rebuilt by syncSheets)
  on('open-about','click',()=>{ openSheet('about'); coach.bump('about-open'); });
  on('open-add','click',()=>openAdd());
  on('open-overview','click',()=>switchScreen('overview'));
  on('open-search','click',()=>toast('Search habits… type a name, topic, or place'));
  on('about-close','click',()=>closeSheet('about'));
  on('about-close2','click',()=>closeSheet('about'));
  on('about-samples','click',()=>{ closeSheet('about'); openSheet('samples'); });
  on('about-settings','click',()=>{ closeSheet('about'); openSheet('settings'); coach.bump('settings-opened'); });
  on('theme-toggle','click',()=>toggleTheme());
  on('restart-tour','click',()=>coach.restart());
  on('samples-close','click',()=>closeSheet('samples'));
  on('settings-close','click',()=>closeSheet('settings'));
  on('do-cancel','click',()=>closeSheet('add'));
  on('do-save','click',()=>tryAdd());
  // delegated app click (handles rebuilt content too)
  const app=$('#app');
  app.onclick=(e)=>{
    const segOpt=e.target.closest('#type-seg .seg-opt');
    if(segOpt){ if(!segOpt.disabled){ state.addType=segOpt.dataset.v; syncSheets(); } e.stopPropagation(); return; }
    const settingRow=e.target.closest('[data-setting]');
    if(settingRow){ toggleSetting(settingRow.dataset.setting); e.stopPropagation(); return; }
    const colHead=e.target.closest('.about-collapse-head');
    if(colHead){ const body=colHead.parentElement.querySelector('.about-collapse-body'); if(body){ body.hidden=!body.hidden; const i=colHead.querySelector('i'); if(i) i.style.transform=body.hidden?'':'rotate(180deg)'; } e.stopPropagation(); return; }
    if(e.target.closest('[data-busy-clear]')){ const lbl=e.target.closest('[data-busy-clear]').dataset.busyClear; state.busy=state.busy.filter(b=>b.label!==lbl); recomputeAgenda(); render(); toast('Cleared busy block'); return; }
    if(e.target.closest('.sample-item')){ addSample(e.target.closest('.sample-item').dataset.sample); e.stopPropagation(); return; }
    if(e.target.closest('[data-place-del]')){ const p=e.target.closest('[data-place-del]').dataset.placeDel; state.places=state.places.filter(x=>x!==p); render(); toast('Removed place'); return; }
    if(e.target.closest('#demo-busy')){ useDemoBusy(); return; }
    if(e.target.closest('#place-add')){ addPlace($('#place-input').value.trim()); $('#place-input').value=''; return; }
    if(state.screen==='detail' && e.target.closest('.detail-head') && !e.target.closest('.detail-mark') && !e.target.closest('[data-detail-action]')){ switchScreen('home'); e.stopPropagation(); return; }
    if(e.target.closest('.section-header[data-daybase="0"]')){ switchScreen('agenda'); return; }
    const pulse=e.target.closest('[data-pulse]');
    if(pulse){ logTing(pulse.dataset.pulse); e.stopPropagation(); return; }
    // detail open on name tap
    const nameLink=e.target.closest('.ting-name');
    if(nameLink){ const idx=state.habits.findIndex(h=>h.id===nameLink.dataset.id); if(idx>=0) openDetail(idx); e.stopPropagation(); return; }
    const act=e.target.closest('[data-action]');
    if(act){ handleAction(act.dataset.action, act.closest('.ting-card')?.dataset?.id); e.stopPropagation(); return; }
    const dash=e.target.closest('[data-drag]');
    if(dash){ startDrag(dash.dataset.drag); e.stopPropagation(); return; }
    const dot=e.target.closest('.detail-dot');
    if(dot){ setDetailPage(parseInt(dot.dataset.dot,10)); e.stopPropagation(); return; }
    const detailAct=e.target.closest('[data-detail-action]');
    if(detailAct){ handleAction(detailAct.dataset.detailAction,'done'==detailAct.dataset.detailAction?'done':'detail-log', state.detailIdx); e.stopPropagation(); return; }
    const card=e.target.closest('.ting-card');
    if(card && !e.target.closest('.pulse-btn') && !e.target.closest('.card-actions') && !e.target.closest('.ting-name') && !e.target.closest('[data-drag]')){
      if(state.settings.minimalMode){ const idx=state.habits.findIndex(h=>h.id===card.dataset.id); if(idx>=0) openDetail(idx); }
      else { toggleSwipe(card.parentElement); coach.bump('swipe-revealed'); }
      e.stopPropagation(); return;
    }
  };
  app.onkeydown=(e)=>{
    if(e.target.id==='place-input' && e.key==='Enter'){ addPlace(e.target.value.trim()); e.target.value=''; }
  };
}
function setDetailPage(i){
  const pager=$('#detail-pager'); if(pager) pager.style.transform=`translateX(-${i*100}%)`;
  $$('.detail-dot').forEach((d,j)=>d.classList.toggle('active',j===i));
}
function startDrag(id){
  const h=state.habits.find(x=>x.id===id); if(!h) return;
  // reveal a "Do this now" confirmation (reliable across pointer types)
  let confirm=$('#reorder-confirm');
  if(!confirm){
    confirm=document.createElement('div'); confirm.id='reorder-confirm'; confirm.className='sheet-wrap';
    confirm.innerHTML=`<div class="sheet" style="max-width:360px"><div class="sheet-header"><span class="sheet-eyebrow">Do this now?</span><button class="icon-btn sheet-close" id="rc-close" aria-label="close"><i class="ti ti-x"></i></button></div><div class="sheet-footer"><button class="btn" id="rc-cancel">cancel</button><button class="btn primary" id="rc-confirm">start · auto-log after duration</button></div></div>`;
    document.body.appendChild(confirm);
    on('rc-close','click',hideReorder); on('rc-cancel','click',hideReorder);
    on('rc-confirm','click',()=>{ h.pinned=true; h.timer=true; h.logs.push(Date.now()); hideReorder(); coach.bump('drag-top'); });
  }
  confirm.classList.add('show');
}
function hideReorder(){ const c=$('#reorder-confirm'); if(c) c.classList.remove('show'); }
function addSample(name){
  const defs={
    'Morning walk':{emoji:'🏃',color:'amber',kind:'build',targetTimes:1,targetDays:1,durationMinutes:20,priority:1,pinned:true,placedToday:true},
    'Gym session':{emoji:'💪',color:'purple',kind:'build',targetTimes:3,targetDays:7,durationMinutes:50,place:'Gym',priority:1,pinned:true,placedToday:true},
    'Write report':{emoji:'📝',color:'amber',type:'task',targetTimes:1,targetDays:1,durationMinutes:60,breakable:true,priority:0,dueDate:tomorrowDate(),done:false,placedToday:true},
    'Water':{emoji:'💧',color:'blue',kind:'build',targetTimes:8,targetDays:1,durationMinutes:1,priority:3},
  };
  const d=defs[name]; if(!d) return;
  if(!state.habits.some(x=>x.name===name)){ const h=makeTing(Object.assign({name},d)); state.habits.unshift(h); }
  if(d.place && !state.places.includes(d.place)) state.places.push(d.place);
  recomputeAgenda(); render(); toast('Added '+name); if(name==='Gym session'||name==='Morning walk') coach.bump('sample-added');
}
function toggleSwipe(cardWrap){ cardWrap.classList.toggle('swiped-right'); }

/* ---------------- seeders ---------------- */
function seedMinimal(){
  state.mode='minimal'; state.screen='home';
  state.settings={minimalMode:true,weekByDay:false,smarterPacking:false};
  state.habits=[]; state.busy=[]; state.places=[]; state.sheets={}; state.toast='';
  state.addType='habit'; state.detailIdx=0; sheetsBuilt.settings=false;
  document.body.classList.add('minimal-mode');
}
function seedRegular(){
  state.mode='regular'; state.screen='home';
  state.settings={minimalMode:false,weekByDay:true,smarterPacking:false};
  if(!state.habits.length){
    ensureTing({name:'Morning walk',emoji:'🏃',color:'amber',kind:'build',targetTimes:1,targetDays:1,durationMinutes:20,priority:1,pinned:true,placedToday:true});
    ensureTing({name:'Gym session',emoji:'💪',color:'purple',kind:'build',targetTimes:3,targetDays:7,durationMinutes:50,place:'Gym',priority:1,pinned:true,placedToday:true});
    ensureTing({name:'Write report',emoji:'📝',color:'amber',type:'task',dueDate:tomorrowDate(),durationMinutes:60,breakable:true,priority:0,placedToday:true});
    ensureTing({name:'Read',emoji:'📚',color:'teal',kind:'build',targetTimes:3,targetDays:7,durationMinutes:30,flexibilityDays:2,priority:2});
  }
  if(!state.busy.length) state.busy=[...BUSY_DEMO];
  if(!state.places.length) state.places=['Home','Gym'];
  state.sheets={}; sheetsBuilt.settings=false;
  document.body.classList.remove('minimal-mode');
  recomputeAgenda();
}
function ensureTing(o){ if(!state.habits.some(h=>h.name===o.name)){ const h=makeTing(Object.assign({type:'habit',kind:'build'},o)); state.habits.unshift(h);} }

/* ---------------- spot / highlight ---------------- */
function positionHighlight(target){
  const phone=$('#phone-screen'); if(!phone) return;
  const spot=$('#spotlight');
  phone.classList.remove('show-spotlight');
  let strips=spot.children;
  if(strips.length<4){ spot.innerHTML=''; for(let i=0;i<4;i++){const d=document.createElement('div');d.className='spotlight-strip';spot.appendChild(d);} strips=spot.children; }
  // clear geometry on all strips first
  strips.forEach(s=>{ s.style.cssText=''; s.style.display='none'; });
  if(!target || !target.sel){ return; }
  const el=phone.querySelector(target.sel); if(!el){ return; }
  el.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
  const pr=phone.getBoundingClientRect(); const r=el.getBoundingClientRect();
  const t=r.top-pr.top, l=r.left-pr.left, w=Math.max(24,r.width), h=Math.max(24,r.height);
  const pw=pr.width, ph=pr.height;
  const geom=[
    ['0','0','100%', t+'px'],            // top
    [0,(t+h)+'px','100%', (ph-Math.max(0,t+h))+'px'], // bottom
    [t+'px','0', l+'px', h+'px'],        // left
    [t+'px',(l+w)+'px', (pw-l-w)+'px', h+'px'], // right
  ];
  geom.forEach((g,k)=>{ const d=strips[k]; if(!d) return; d.style.display='block'; d.style.top=g[0]; d.style.left=g[1]; d.style.width=g[2]; d.style.height=g[3]; });
  phone.classList.add('show-spotlight');
}

/* ---------------- COACH ---------------- */
const coach = {
  step:0, steps:[], expect:'none', ctx:{},
  bump(reason){ if(reason && reason===this.expect){ this.advance(); } },
  init(steps){ this.steps=steps; this.step=0; this.update(); },
  update(){
    const s=this.steps[this.step]; if(!s) return;
    this.expect=s.expect||'none'; this.ctx=s.ctx||{};
    $('#step-num').textContent=this.step+1; $('#step-total').textContent=this.steps.length;
    $('#coach-title').textContent=s.title;
    $('#coach-body').innerHTML=s.body;
    $('#coach-hint').textContent = this.expect==='none'?'Read & tap next':(s.hint||'Do the highlighted action, or tap next');
    $('#coach-prev').disabled=this.step===0;
    const last=this.step>=this.steps.length-1;
    $('#coach-next').textContent = (s.expect==='open-app'||last) ? 'open the app' : (last?'finish':'next');
    const pb=$('#coach-progress'); if(pb){ const bar=pb.querySelector('div'); if(bar) bar.style.width=((this.step+1)/this.steps.length*100).toFixed(0)+'%'; }
    requestAnimationFrame(()=>positionHighlight(this.steps[this.step].target||{}));
  },
  advance(){
    const s=this.steps[this.step]; if(s.onComplete) try{s.onComplete(state);}catch(e){}
    if(s.expect==='open-app'){ window.open('https://lanbeee.github.io/tings/','_blank'); return; }
    this.step=Math.min(this.step+1, this.steps.length-1);
    const nxt=this.steps[this.step]; if(nxt.setup) nxt.setup(state);
    render(); this.update();
  },
  prev(){ this.step=Math.max(this.step-1,0); const c=this.steps[this.step]; if(c.setup) c.setup(state); render(); this.update(); },
  restart(){ seedMinimal(); this.step=0; const s=this.steps[0]; if(s.setup) s.setup(state); render(); this.update(); },
  bindUI(){
    on('coach-next','click',()=>this.advance());
    on('coach-prev','click',()=>this.prev());
    on('restart-tour','click',()=>this.restart());
  }
};

/* ---------------- COACH STEPS ---------------- */
function defineSteps(){
  coach.steps = [
    // ===== MINIMAL MODE (new-user default) =====
    { id:'m1', title:'Welcome to Tings', expect:'none',
      target:{sel:'#empty .empty-msg'},
      body:`<p>You're looking at a fresh Tings home. New users start in <strong>minimal mode</strong> — a clean surface that makes the core loop (add, plan, log) effortless.</p>`,
      setup:()=>{ seedMinimal(); } },
    { id:'m2', title:'The Tings logo', expect:'about-open', hint:'Tap the Tings logo',
      target:{sel:'.wordmark'},
      body:`<p>Tap the <strong>Tings logo</strong> (top-left) any time for help, samples, and settings. Go on — tap it.</p>`,
      setup:()=>{ seedMinimal(); } },
    { id:'m3', title:'Your compass: the About sheet', expect:'none',
      target:{sel:'#about-sheet .sheet-eyebrow'},
      body:`<p>This is your compass. <strong>Start</strong> for adding habits, <strong>Plan</strong> for busy times & places, <strong>Tune</strong> for detail settings. It also links to this guide and samples.</p><p><small>Expand a section by tapping its header.</small></p>`,
      setup:()=>{ seedMinimal(); openSheet('about'); } },
    { id:'m4', title:'Add your first Ting', expect:'add-open', hint:'Tap +',
      target:{sel:'.nav-add'},
      body:`<p>Let's add something to track. Tap <kbd>+</kbd> — it opens the add sheet.</p>`,
      setup:()=>{ seedMinimal(); closeSheet('about'); } },
    { id:'m5', title:'Name it, set how often, add', expect:'ting-added', hint:'Tap add',
      target:{sel:'#do-save'},
      body:`<p>Name it "<strong>Read</strong>", keep it a <strong>habit</strong>, and set <strong>3× in 7d</strong>. Then tap <strong>add</strong>.</p>`,
      setup:()=>{ seedMinimal(); openSheet('add'); $('#ting-message').value='Read'; $('#ting-times').value='3'; $('#ting-days').value='7'; } },
    { id:'m6', title:'Your first card', expect:'none',
      target:{sel:'.ting-card[data-id]'},
      body:`<p>This is your card: the emoji, name, a one-line status, and how often. That's the whole card in minimal mode — nothing else competes for attention.</p>`,
      setup:()=>{ seedMinimal(); ensureTing({name:'Read',emoji:'📚',color:'teal',kind:'build',targetTimes:3,targetDays:7,durationMinutes:30,priority:2}); } },
    { id:'m7', title:'Log it', expect:'logged', hint:'Tap the pulse',
      target:{sel:'.ting-card[data-id] .pulse-btn'},
      body:`<p>The whole core loop: <strong>tap the pulse</strong> to log a completion. Try it on Read.</p>`,
      setup:()=>{ seedMinimal(); ensureTing({name:'Read',emoji:'📚',color:'teal',kind:'build',targetTimes:3,targetDays:7,durationMinutes:30,priority:2}); } },
    { id:'m8', title:'Status at a glance', expect:'none',
      target:{sel:'.ting-card[data-id] .ting-cue'},
      body:`<p>The status line tells you what to do — no streak math to remember:</p><ul><li><span class="chip teal">on track</span> — ahead of your rhythm.</li><li><span class="chip amber">due soon</span> — time to do it.</li><li><span class="chip red">overdue</span> — slipped; do it soon.</li><li><span class="chip">ready to start</span> — never logged.</li></ul>`,
      setup:()=>{ seedMinimal(); ensureTing({name:'Read',emoji:'📚',color:'teal',kind:'build',targetTimes:3,targetDays:7,durationMinutes:30,priority:2,logs:[Date.now()-3*86400000]}); } },
    { id:'m9', title:'Today / overdue / coming up', expect:'none',
      target:{sel:'.section-header'},
      body:`<p>Home groups your list into <strong>today</strong>, <strong>overdue</strong>, and <strong>coming up</strong> — the right thing is always near the top. Pinned items float to their own group first.</p>`,
      setup:()=>{ seedMinimal();
        ensureTing({name:'Read',emoji:'📚',color:'teal',kind:'build',targetTimes:3,targetDays:7,durationMinutes:30,priority:2,logs:[Date.now()-3*86400000]});
        ensureTing({name:'Water',emoji:'💧',color:'blue',kind:'build',targetTimes:8,targetDays:1,durationMinutes:1,priority:3,pinned:true});
        ensureTing({name:'Stretch',emoji:'🧘',color:'amber',kind:'build',targetTimes:1,targetDays:1,durationMinutes:10,priority:2,logs:[Date.now()-4*86400000]});
        ensureTing({name:'Call mom',emoji:'☎️',color:'green',type:'task',dueDate:Date.now()+3*86400000,durationMinutes:30,priority:2});
      } },
    { id:'m10', title:'Tell Tings about your week', expect:'settings-opened', hint:'Tap settings',
      target:{sel:'#about-settings'},
      body:`<p>A planner can't pack your week without knowing your free time. Open <strong>settings</strong> and set busy times (sleep, work, meals) and places.</p>`,
      setup:()=>{ seedMinimal(); openSheet('about'); } },
    { id:'m11', title:'Set busy times', expect:'busy-set', hint:'Use demo busy times',
      target:{sel:'#demo-busy'},
      body:`<p>Busy blocks carve real free gaps in your week. Tap <strong>"use demo busy times"</strong> to install sleep, work, dinner, and commute.</p>`,
      setup:()=>{ openSheet('settings'); } },
    { id:'m12', title:'Tings packs the plan', expect:'screen-agenda', hint:'Tap Today',
      target:{sel:'.section-header[data-daybase="0"]'}, // Today header
      body:`<p>With busy times known, the planner slots your habits into the real gaps. <strong>Tap Today's header</strong> to see the day plan.</p>`,
      setup:()=>{ seedMinimal(); closeSheet('settings');
        if(!state.busy.length) state.busy=[...BUSY_DEMO];
        ensureTing({name:'Morning walk',emoji:'🏃',color:'amber',kind:'build',targetTimes:1,targetDays:1,durationMinutes:20,priority:1,pinned:true,placedToday:true});
        ensureTing({name:'Read',emoji:'📚',color:'teal',kind:'build',targetTimes:3,targetDays:7,durationMinutes:30,priority:2,placedToday:true});
        recomputeAgenda(); } },
    { id:'m13', title:'Add a place', expect:'place-added', hint:'Type Gym, then add',
      target:{sel:'#place-input'},
      body:`<p>Places let Tings account for travel. Tap into the <strong>locations</strong> field, type <strong>Gym</strong>, and tap +.</p>`,
      setup:()=>{ openSheet('settings'); } },
    { id:'m14', title:'Switch to regular mode', expect:'toggle-minimalMode', hint:'Turn minimal mode off',
      target:{sel:'[data-setting="minimalMode"]'},
      body:`<p>Ready for more? Switch to <strong>regular mode</strong> under settings → display: agenda times, trails, swipe actions, week-by-day, and the six-page detail — all on the <em>same planner</em>.</p>`,
      setup:()=>{ seedMinimal(); closeSheet('settings'); openSheet('settings'); } },
    // ===== REGULAR MODE =====
    { id:'r1', title:'Regular mode — full surface', expect:'none',
      target:{sel:'.section-header'},
      body:`<p>Regular mode reveals the full surface. Week-by-day sections with open-time pills, richer cards, swipe actions, and the calendar overview — your habits and plan carry over unchanged.</p>`,
      setup:()=>{ seedRegular(); closeSheet('settings'); } },
    { id:'r2', title:'Week by day', expect:'toggle-weekByDay', hint:'Toggle week by day',
      target:{sel:'[data-setting="weekByDay"]'},
      body:`<p>Home is now <strong>week-by-day</strong>: Today, Tomorrow, then each weekday+date, each with an open-time pill showing what's really free.</p>`,
      setup:()=>{ seedRegular(); openSheet('settings'); state.settings.weekByDay=false; } },
    { id:'r3', title:'Richer cards', expect:'none',
      target:{sel:'.ting-card[data-id]'},
      body:`<p>Cards now show more: an <strong>agenda pill</strong> with the placed time, a <strong>status %</strong>, a two-week <strong>trail</strong> of dots, <strong>early</strong> / <strong>place</strong> marks, and <strong>quick actions</strong> on the right.</p>`,
      setup:()=>{ seedRegular(); } },
    { id:'r4', title:'Swipe for actions', expect:'swipe-revealed', hint:'Tap a card to reveal shelves',
      target:{sel:'.ting-card[data-id]'},
      body:`<p><strong>Swipe right</strong> (or tap a card on a desktop) reveals shelves: <em>pin</em>, <em>keep</em>, <em>activity</em>, <em>session</em> / <em>snooze</em> / <em>remove</em>. Try it on a card.</p>`,
      setup:()=>{ seedRegular(); } },
    { id:'r5', title:'Drag to plan &amp; focus', expect:'drag-top', hint:'Use the drag handle',
      target:{sel:'.agenda-drag-handle'},
      body:`<p>Drag a placed card to the <strong>top of Today</strong> → <em>"Do this now"</em>. It pins to the top and starts a timer that auto-logs when done.</p>`,
      setup:()=>{ seedRegular(); } },
    { id:'r6', title:'The six-page detail', expect:'detail-open', hint:'Tap a card name',
      target:{sel:'.ting-card[data-id]'},
      body:`<p>Tap a card's <strong>name</strong> to open detail — a six-page pager: <strong>calendar</strong>, <strong>insight</strong>, <strong>schedule</strong>, <strong>effort</strong>, <strong>identity</strong>, <strong>actions</strong>. Tap the dots to move between pages.</p>`,
      setup:()=>{ seedRegular(); } },
    { id:'r7', title:'Calendar overview', expect:'screen-overview', hint:'Open calendar',
      target:{sel:'#open-overview'},
      body:`<p>Open the <strong>calendar</strong> to see a month grid alongside insight panes: open hours, lightest days, coming up, and needs attention.</p>`,
      setup:()=>{ seedRegular(); switchScreen('home'); } },
    { id:'r8', title:'Search &amp; filters', expect:'none',
      target:{sel:'.home-filter-bar'},
      body:`<p>Search by name, topic, or place. Filter chips (top of the list) narrow the view by place or topic — they never change what's due, only what shows.</p>`,
      setup:()=>{ seedRegular(); switchScreen('home'); } },
    { id:'r9', title:'You did it!', expect:'open-app', hint:'Open the real app',
      target:{sel:'#coach'},
      body:`<p>You've walked through the whole loop — from a clean minimal home to the full regular surface. Every habit, task, and plan you make here lives only on this device, just like the real app.</p><p><strong>Open Tings</strong> to start for real, or <strong>restart the tour</strong> (top-right) to go again.</p>`,
      setup:()=>{ seedRegular(); switchScreen('home'); } },
  ];
}

/* ---------------- bootstrap ---------------- */
function init(){ initTheme(); wire(); defineSteps(); render(); coach.init(coach.steps); coach.bindUI(); $('#step-total').textContent=coach.steps.length; }
document.addEventListener('DOMContentLoaded', init);
