(() => {
  const C = window.CONFIG || {};
  const keys = { words:"vocab_words_cache_v1", progress:"vocab_progress_v1", sessions:"vocab_sessions_v1", outbox:"vocab_outbox_v1", wins:"vocab_lesson_stars_v1" };
  const colors = ["#d9534f","#e3b13e","#5cb85c","#4a9bc9","#9b7fc7","#e0894f","#6a4f96"];
  const app = document.getElementById("app");
  let words = [], progress = {}, view = "home", queue = [], current = null, round = 0, run = [], mistakes = [], phase = "", chosen = "", letterPool = [], usedLetters = [], feedback = null, startedAt = 0, lessonStars = {};
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const hasUrl = s => s && !s.startsWith("PASTE_");
  const norm = s => String(s||"").trim().toLowerCase();
  const getP = w => progress[w.id] || {box:0,seen:0,wrong:0,lastSeen:null};
  const dateValue = s => s ? Date.parse(s) || 0 : 0;
  const activeWords = () => words.filter(w=>w.active);
  const today = () => new Date().toISOString();
  function parseCSV(text) {
    const rows=[]; let row=[], cell="", quoted=false;
    for(let i=0;i<text.length;i++) { const ch=text[i]; if(quoted) { if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;} else if(ch==='"') quoted=false; else cell+=ch; } else if(ch==='"') quoted=true; else if(ch===","){row.push(cell);cell="";} else if(ch==="\n"){row.push(cell.replace(/\r$/,""));rows.push(row);row=[];cell="";} else cell+=ch; }
    if(cell.length||row.length){row.push(cell.replace(/\r$/,""));rows.push(row);} if(!rows.length)return [];
    const headers=rows.shift().map(x=>x.trim().toLowerCase()); const seen=new Set();
    return rows.map(cols=>Object.fromEntries(headers.map((h,i)=>[h,(cols[i]||"").trim()]))).filter(r=>r.id&&r.en&&r.ru&&!seen.has(r.id)&&(seen.add(r.id),true)).map(r=>({...r,chunk:r["чанк"]||r.chunk||"",active:String(r.active).toLowerCase()==="true",lesson:r.lesson||"1"}));
  }
  async function getText(url) { const res=await fetch(url,{cache:"no-store"}); if(!res.ok) throw Error("load failed"); return res.text(); }
  async function syncData() {
    let loaded=false;
    if(hasUrl(C.WORDS_CSV_URL)) { try { const fresh=parseCSV(await getText(C.WORDS_CSV_URL)); if(fresh.length){words=fresh;save(keys.words,words);loaded=true;} } catch {} }
    if(!loaded) { const cached=load(keys.words,null); words=Array.isArray(cached)?cached:[]; }
    if(hasUrl(C.GOAL_CSV_URL)) { try { const goal=(await getText(C.GOAL_CSV_URL)).trim().replace(/^"|"$/g,""); window.goalText=goal; } catch { window.goalText=""; } }
    flushOutbox().catch(()=>{});
  }
  function weekStart(d=new Date()) { const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; }
  function weekCount() { const start=weekStart(); return load(keys.sessions,[]).filter(s=>s.week===start).length; }
  function dots() { return `<div class="week-dots" aria-label="Недельная цель">${Array.from({length:C.WEEKLY_GOAL||3},(_,i)=>`<span class="dot ${i<weekCount()?"done":""}"></span>`).join("")}</div>`; }
  function wall() {
    const groups={}; activeWords().forEach(w=>(groups[w.lesson]??=[]).push(w));
    return Object.keys(groups).sort((a,b)=>Number(a)-Number(b)||a.localeCompare(b)).map((lesson,i)=>{ const all=groups[lesson], complete=all.every(w=>getP(w).box===3); return `<div class="lesson-row"><div class="lesson-label">Урок ${esc(lesson)} ${complete?"⭐":""}</div><div class="bricks">${all.map(w=>`<span class="brick b${getP(w).box}" style="--brick:${colors[i%colors.length]}" title="${esc(w.en)}"></span>`).join("")}</div></div>`; }).join("") || `<p class="subtle">Слова появятся здесь</p>`;
  }
  function renderHome() {
    view="home";
    if (!words.length) {
      app.innerHTML=`<div class="empty"><div class="result-emoji">📚</div><h1>Слова пока не загрузились</h1><p class="subtle">Проверь подключение к таблице и попробуй ещё раз.</p><button class="primary" id="retry">Повторить</button></div>`;
      document.getElementById("retry").onclick=async()=>{await syncData();renderHome();};
      return;
    }
    const total=activeWords().length; const mastered=activeWords().filter(w=>getP(w).box===3).length;
    app.innerHTML=`<section class="home app"><div class="topline"><span class="brand">АНГЛИЙСКИЕ СЛОВА</span><button class="icon-button small" id="reset" title="Очистить демо-прогресс">Сбросить</button></div><div class="hello"><h1>Привет, ${esc(C.STUDENT_NAME||"Матвей")}!</h1><p class="subtle">Словарь для подсказок и отдельные упражнения для тренировки.</p></div>${window.goalText?`<div class="goal-card">🎯 ${esc(window.goalText)}</div>`:""}<div class="wall-panel"><div class="wall-head"><h2>Твоя стена</h2><span class="subtle">${mastered} из ${total} знаю слов</span></div><div class="wall">${wall()}</div></div><div class="panel week"><div><strong>Цель на неделю</strong><div class="subtle">${weekCount()} из ${C.WEEKLY_GOAL||3} занятий</div></div>${dots()}</div><div class="home-actions"><button class="secondary" id="dictionary"><span class="section-label">Раздел 1</span>Словарь-карточки · ${words.length} слов</button><button class="primary" id="start"><span class="section-label">Раздел 2</span>Упражнения</button></div><p class="status">Слова и прогресс хранятся на этом устройстве</p></section>`;
    document.getElementById("start").onclick=startSession;
    document.getElementById("dictionary").onclick=()=>renderDictionary();
    document.getElementById("reset").onclick=()=>{ if(confirm("Сбросить прогресс демо на этом устройстве?")){ localStorage.removeItem(keys.progress);localStorage.removeItem(keys.sessions);localStorage.removeItem(keys.wins);progress={};lessonStars={};renderHome(); } };
  }
  function planSession() {
    const active=activeWords(); const now=Date.now(); const age=w=>now-dateValue(getP(w).lastSeen);
    const ranked=(arr)=>arr.sort((a,b)=>age(b)-age(a));
    const due=ranked(active.filter(w=>[1,2].includes(getP(w).box)&&getP(w).wrong>0));
    const learning=ranked(active.filter(w=>[1,2].includes(getP(w).box)&&!getP(w).wrong));
    const fresh=ranked(active.filter(w=>getP(w).box===0));
    const days=(C.MASTERED_REVIEW_DAYS||7)*86400000;
    const mastered=ranked(active.filter(w=>getP(w).box===3&&age(w)>days));
    const rest=ranked(active);
    const limit=C.SESSION_SIZE||5, maxNew=C.MAX_NEW_PER_SESSION||2, selected=[], add=(arr,n=limit)=>{ for(const w of arr){if(selected.length>=limit||n<=0)break;if(!selected.some(x=>x.id===w.id)){selected.push(w);n--;}} };
    add(due); add(learning); add(fresh,maxNew); add(mastered); add(rest); return selected;
  }
  function startSession() {
    queue=planSession(); round=0; run=[]; mistakes=[]; startedAt=Date.now();
    if(!queue.length){ app.innerHTML=`<div class="empty"><div class="result-emoji">📚</div><h1>Слова пока не загрузились</h1><p class="subtle">Попробуй ещё раз чуть позже.</p><button class="primary" id="retry">Повторить</button></div>`; document.getElementById("retry").onclick=async()=>{await syncData();renderHome();}; return; }
    nextWord();
  }
  function renderDictionary(query="") {
    view="dictionary";
    const entries=words.map(w=>`<details class="word-entry" data-search="${esc([w.en,w.ru,w.lesson,w.category,w.example,w.chunk].join(" ").toLowerCase())}"><summary><span><strong>${esc(w.en)}</strong><span class="entry-translation">${esc(w.ru)}</span></span><span class="entry-meta">Урок ${esc(w.lesson||"—")}</span></summary><div class="entry-details">${w.example?`<p><strong>Пример:</strong> ${esc(w.example)}</p>`:""}${w.chunk?`<p><strong>Чанк:</strong> ${esc(w.chunk)}</p>`:""}${w.category?`<span class="entry-category">${esc(w.category)}</span>`:""}${w.active?"":`<span class="entry-category">Сейчас не в тренировке</span>`}</div></details>`).join("");
    app.innerHTML=`<section class="dictionary-page app"><div class="topline"><button class="icon-button small" id="dictionary-back">← На главную</button><span class="brand">РАЗДЕЛ 1 · СЛОВАРЬ-КАРТОЧКИ</span></div><h1>Словарь</h1><p class="subtle">Подсматривай перевод, пример и чанк. Просмотр не влияет на прогресс.</p><input class="dictionary-search" id="dictionary-search" type="search" placeholder="Найти слово или перевод" aria-label="Поиск по словарю"><div class="dictionary-count" id="dictionary-count"></div><div class="dictionary-list" id="dictionary-list">${entries||`<p class="subtle">Пока нет слов.</p>`}</div></section>`;
    const input=document.getElementById("dictionary-search"), list=document.getElementById("dictionary-list"), count=document.getElementById("dictionary-count");
    const filter=()=>{const q=norm(input.value);let visible=0;list.querySelectorAll(".word-entry").forEach(entry=>{const show=entry.dataset.search.includes(q);entry.hidden=!show;if(show)visible++;});count.textContent=`Найдено слов: ${visible}`;};
    input.value=query; input.addEventListener("input",filter); filter();
    document.getElementById("dictionary-back").onclick=renderHome;
  }
  function exampleGap(w) {
    if(!w.example||!w.en)return null;
    const phrase=String(w.en).trim().split(/\s+/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\s+");
    const match=new RegExp(`(^|[^A-Za-z])(${phrase})(?=$|[^A-Za-z])`,"i").exec(w.example);
    if(!match)return null;
    const start=match.index+match[1].length, end=start+match[2].length;
    return {before:w.example.slice(0,start),after:w.example.slice(end)};
  }
  function nextWord() {
    if(!queue.length) return finishSession();
    current=queue.shift(); round++; phase="answer"; chosen=""; feedback=null; letterPool=[]; usedLetters=[];
    const box=getP(current).box; currentMode=current._mode||(box===0?"card":box===1?(current.en.includes(" ")||current.en.length>10?"reverse":"letters"):exampleGap(current)&&getP(current).seen%2===0?"gap":"write"); current._mode=currentMode;
    if(currentMode==="letters") letterPool=[...current.en].map((char,id)=>({char,id})).sort(()=>Math.random()-.5);
    renderSession();
  }
  let currentMode="";
  function distractors(w,field) {
    const same=activeWords().filter(x=>x.id!==w.id&&x[field]!==w[field]&&x.category===w.category), other=activeWords().filter(x=>x.id!==w.id&&x[field]!==w[field]&&!same.includes(x));
    const out=[]; [...same,...other].forEach(x=>{if(out.length<2&&!out.includes(x[field]))out.push(x[field]);}); return [w[field],...out].sort(()=>Math.random()-.5);
  }
  function promptContent() {
    if(currentMode==="card") return `<div class="prompt">${esc(current.en)}</div><div class="hint">Выбери перевод</div>`;
    if(currentMode==="gap") { const gap=exampleGap(current); return `<div class="gap-example">${esc(gap.before)}<span class="blank">пропуск</span>${esc(gap.after)}</div><div class="translation gap-translation">${esc(current.ru)}</div><div class="hint">Впиши слово, которое подходит по смыслу</div>`; }
    return `<div class="translation">${esc(currentMode==="reverse"?current.ru:current.ru)}</div><div class="hint">${currentMode==="letters"?"Собери слово из букв":currentMode==="reverse"?"Выбери английское слово":"Напиши слово по-английски"}</div>`;
  }
  function renderSession() {
    view="session"; const total=Math.max(round+queue.length,1); const p=getP(current); let controls="";
    if(feedback) controls=`<div class="feedback-card ${feedback.correct?"good":"bad"}"><strong>${feedback.correct?"Верно!":`Почти. Правильно: ${esc(currentMode==="card"?current.ru:current.en)}`}</strong>${current.example?`<span class="example"><strong>Пример:</strong> ${esc(current.example)}</span>`:""}</div><button class="primary" id="next">Дальше</button>`;
    else if(currentMode==="card"||currentMode==="reverse") controls=`<div class="options">${distractors(current,currentMode==="reverse"?"en":"ru").map(v=>`<button class="option" data-choice="${esc(v)}">${esc(v)}</button>`).join("")}</div>`;
    else if(currentMode==="letters") { controls=`<div class="answer-slots">${esc(chosen||" ")}</div><div class="letters">${letterPool.map((item,i)=>`<button class="letter ${usedLetters.includes(i)?"used":""}" data-letter="${i}" ${usedLetters.includes(i)?"disabled":""}>${esc(item.char)}</button>`).join("")}</div><button class="secondary small" id="undo">⌫ Убрать букву</button><button class="primary" id="check-letters" ${chosen.length!==current.en.length?"disabled":""}>Проверить</button>`; }
    else controls=`<form class="write-form" id="write-form"><input class="write-input" id="answer" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${currentMode==="gap"?"Впиши слово":"Напиши слово"}" aria-label="Ответ"><button class="primary small">Проверить</button></form>`;
    app.innerHTML=`<section class="session app"><div class="topline"><button class="icon-button small" id="home">← Выйти</button><span class="brand">РАЗДЕЛ 2 · УПРАЖНЕНИЯ</span></div><div><div class="progress-line"><span>Слово ${round} из ${Math.max(round+queue.length,run.length+queue.length)}</span><span>${Math.round(100*run.length/Math.max(run.length+queue.length+1,1))}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(95,100*run.length/Math.max(run.length+queue.length+1,1))}%"></div></div></div><div class="prompt-card">${promptContent()}</div><div class="session-actions">${controls}</div></section>`;
    document.getElementById("home").onclick=renderHome;
    app.querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>answer(b.dataset.choice,b.dataset.choice===current.ru&&currentMode!=="reverse"||b.dataset.choice===current.en&&currentMode==="reverse"));
    app.querySelectorAll("[data-letter]").forEach(b=>b.onclick=()=>{if(feedback)return;const i=Number(b.dataset.letter);usedLetters.push(i);chosen+=letterPool[i].char;renderSession();});
    const undo=document.getElementById("undo"); if(undo)undo.onclick=()=>{const i=usedLetters.pop();if(i!==undefined){chosen=chosen.slice(0,-1);renderSession();}};
    const check=document.getElementById("check-letters"); if(check)check.onclick=()=>answer(chosen,norm(chosen)===norm(current.en));
    const form=document.getElementById("write-form"); if(form)form.onsubmit=e=>{e.preventDefault();answer(document.getElementById("answer").value,norm(document.getElementById("answer").value)===norm(current.en));};
    const next=document.getElementById("next");if(next)next.onclick=nextWord;
  }
  function answer(value,correct) {
    if(feedback)return; const before=getP(current).box; const isRepeat=current._repeat===true;
    const p=getP(current); p.seen++; p.lastSeen=today(); if(!isRepeat){p.box=Math.max(0,Math.min(3,p.box+(correct?1:-1)));if(!correct)p.wrong++;} progress[current.id]=p; save(keys.progress,progress);
    run.push({id:current.id,en:current.en,mode:currentMode==="card"?"choice":currentMode,correct,boxBefore:before,boxAfter:p.box});
    if(!correct&&!isRepeat&&!mistakes.includes(current.id)){mistakes.push(current.id);queue.push({...current,_repeat:true,_mode:currentMode});}
    feedback={correct}; renderSession();
  }
  async function finishSession() {
    view="result"; const durationSec=Math.max(1,Math.round((Date.now()-startedAt)/1000)); const correct=run.filter(x=>x.correct).length;
    const beforeStars=load(keys.wins,{}); const newly=[]; const groups={}; activeWords().forEach(w=>(groups[w.lesson]??=[]).push(w));
    for(const [lesson,items] of Object.entries(groups)){if(items.every(w=>getP(w).box===3)&&!beforeStars[lesson]){beforeStars[lesson]=true;newly.push(lesson);}}
    save(keys.wins,beforeStars); lessonStars=beforeStars;
    const sessions=load(keys.sessions,[]); const session={week:weekStart(),finishedAt:today()}; sessions.push(session);save(keys.sessions,sessions);
    const payload={sessionId:makeSessionId(),student:C.STUDENT_NAME||"Матвей",finishedAt:session.finishedAt,durationSec,correct,total:run.length,weekSessions:weekCount(),words:run};

    app.innerHTML=`<section class="result app"><div class="topline"><span class="brand">СЕССИЯ ЗАВЕРШЕНА</span></div><div class="result-emoji">🎉</div><h1>Готово, на сегодня всё!</h1><p class="subtle">Отличная работа. Теперь кирпичики стали крепче.</p><div class="panel"><div class="statline"><strong>Кирпичики выросли</strong><strong>🧱 ${run.filter(x=>x.boxAfter>x.boxBefore).length}</strong></div><div class="statline" style="margin-top:12px"><span>Верных ответов</span><strong>${correct} из ${run.length}</strong></div><div class="statline" style="margin-top:12px"><span>Время</span><strong>${Math.floor(durationSec/60)} мин</strong></div></div><div class="panel week"><div><strong>Цель на неделю</strong><div class="subtle">${weekCount()} из ${C.WEEKLY_GOAL||3} занятий</div></div>${dots()}</div><div class="wall-panel"><div class="wall-head"><h2>Твоя стена</h2>${newly.length?`<span>⭐ Новый ряд!</span>`:""}</div><div class="wall">${wall()}</div></div><button class="primary" id="done">На сегодня всё</button></section>`;
    document.getElementById("done").onclick=renderHome;
    if(hasUrl(C.RESULTS_ENDPOINT)){postSession(payload).catch(()=>{const box=load(keys.outbox,[]);box.push(payload);save(keys.outbox,box);});}
  }
  function makeSessionId(){return window.crypto?.randomUUID?window.crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  async function postSession(payload){const response=await fetch(C.RESULTS_ENDPOINT,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload),keepalive:true});if(!response.ok)throw Error("result endpoint failed");const body=(await response.text()).trim();if(!body)throw Error("empty result endpoint response");try{const result=JSON.parse(body);if(result?.ok===false)throw Error("result was not accepted");}catch(error){if(error.message==="result was not accepted")throw error;/* Existing Apps Script may return plain-text OK. */}}
  async function flushOutbox(){const box=load(keys.outbox,[]);if(!box.length||!hasUrl(C.RESULTS_ENDPOINT))return;const keep=[];for(const p of box){try{await postSession(p);}catch{keep.push(p);}}save(keys.outbox,keep);}
  progress=load(keys.progress,{}); lessonStars=load(keys.wins,{});
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
  syncData().then(renderHome);
})();

