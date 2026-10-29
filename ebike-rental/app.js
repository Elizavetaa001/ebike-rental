/* ============================================================
   УЧЁТ АРЕНДЫ ЭЛЕКТРОВЕЛОСИПЕДОВ — ЛОГИКА
   ============================================================ */

/* ---------- КОНСТАНТЫ И УТИЛИТЫ ---------- */
const KEY='ebike_v2';
const $=s=>document.querySelector(s);
const today=()=>new Date().toISOString().slice(0,10);
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const fd=d=>d?d.split('-').reverse().join('.'):'';
const money=n=>Math.round(n||0).toLocaleString('ru-RU')+' ₽';

/* ---------- БАЗА ДАННЫХ ---------- */
const blankUser=(name,role,pin)=>({
  name,role,pin:pin||'0000',
  bikes:[1,2,3].map(n=>({id:n,n,vin:'',model:'',color:'',chestZnak:'',status:'Свободен',bikeValue:0,lat:null,lng:null,starlineId:''})),
  batts:[1,2].map(n=>({id:n,n,serial:'',status:'Свободен'})),
  clients:[],contracts:[],incomes:[],expenses:[],
  log:[],
  settings:{tax:4,partner:25,base:'income',p0:4200,p1add:1000,pen:1,penReturn:0.8,fine500:500}
});

function seed(){
  return {
    active:'me',
    uid:100,
    users:{
      admin:   Object.assign(blankUser('Администратор','admin','1234')),
      me:      Object.assign(blankUser('Я (Елизавета)','owner','0000')),
      partner: Object.assign(blankUser('Партнёр (ИП)','partner','1111'))
    },
    adminLog:[]
  };
}

let db;
try{db=JSON.parse(localStorage.getItem(KEY))}catch(e){}
if(!db||!db.users||!db.users.admin){
  db=seed();
  localStorage.setItem(KEY,JSON.stringify(db));
}

const save=()=>{
  try{localStorage.setItem(KEY,JSON.stringify(db))}
  catch(e){alert('Не удалось сохранить: '+e.message)}
};

const U=()=>db.users[db.active];
const role=()=>U().role;
const id=()=>++db.uid;
const S=()=>U().settings;

/* ---------- ЖУРНАЛ ---------- */
const log=t=>{
  const e={t:new Date().toLocaleString('ru-RU'),x:t,who:U().name,role:U().role};
  U().log.unshift(e);U().log=U().log.slice(0,300);
  db.adminLog.unshift(e);db.adminLog=db.adminLog.slice(0,600);
  save();
};

/* ---------- КОРОТКИЕ ССЫЛКИ НА СУЩНОСТИ ---------- */
const cl=i=>U().clients.find(c=>c.id==i);
const bk=i=>U().bikes.find(b=>b.id==i);
const bt=i=>U().batts.find(b=>b.id==i);
const ct=i=>U().contracts.find(c=>c.id==i);

const active=()=>U().contracts.filter(c=>c.status=='Активен');
const bikeSt=b=>active().some(c=>c.bike==b.id)?'В аренде':b.status;
const battSt=b=>active().some(c=>c.batt==b.id)?'Выдан':b.status;

/* ---------- ШТРАФЫ И ПРОСРОЧКИ ---------- */
const PEN=()=>S().pen??1;
const odays=c=>Math.max(0,Math.floor((new Date(today())-new Date(c.end))/864e5));
const owed=c=>c.status=='Активен'?Math.max(0,Math.round(c.price*PEN()/100*odays(c))-(c.penBilled||0)):0;
const owedReturn=c=>{
  if(c.status!='Активен')return 0;
  const b=bk(c.bike);
  if(!b||!b.bikeValue)return 0;
  return Math.max(0,Math.round(b.bikeValue*S().penReturn/100*odays(c))-(c.penReturnBilled||0));
};

const live=a=>a.filter(x=>x.status!='Отменено');
const mon=()=>{const d=today();return[d.slice(0,8)+'01',d.slice(0,8)+'31']};

/* ---------- ФИНАНСЫ ---------- */
function finFor(user,f,t){
  const r=a=>live(a)
    .filter(x=>(!f||x.date>=f)&&(!t||x.date<=t))
    .reduce((s,x)=>s+x.amount,0);
  const inc=r(user.incomes),exp=r(user.expenses);
  const base=user.settings.base=='income'?inc:Math.max(inc-exp,0);
  const tax=base*user.settings.tax/100;
  const pre=inc-exp-tax;
  const partner=Math.max(pre,0)*user.settings.partner/100;
  return {inc,exp,base,tax,pre,partner,owner:pre-partner};
}

function fin(f,t){
  const me=finFor(db.users.me,f,t);
  const my=finFor(U(),f,t);
  if(role()==='partner'){
    return {...my,partnerIncome:me.partner,totalOwner:my.owner+me.partner};
  }
  return my;
}

/* ---------- PIN И ПЕРЕКЛЮЧЕНИЕ ПРОФИЛЕЙ ---------- */
function askPin(targetKey,cb){
  const d=$('#d');const u=db.users[targetKey];
  d.innerHTML=`<h3 style="margin-top:0">Вход в профиль «${u.name}»</h3>
  <p style="color:var(--m);margin:4px 0 10px">Введите PIN из 4 цифр</p>
  <form method="dialog" id="pf"><div class="pinbox">
    <input name="p0" type="password" maxlength="1" inputmode="numeric" autofocus>
    <input name="p1" type="password" maxlength="1" inputmode="numeric">
    <input name="p2" type="password" maxlength="1" inputmode="numeric">
    <input name="p3" type="password" maxlength="1" inputmode="numeric">
  </div><div class="bar" style="justify-content:center;margin-top:6px">
    <button class="p">Войти</button>
    <button type="button" onclick="$('#d').close()">Отмена</button>
  </div></form>`;
  const ins=d.querySelectorAll('input');
  ins.forEach((el,i)=>el.addEventListener('input',()=>{if(el.value&&i<3)ins[i+1].focus()}));
  d.querySelector('form').onsubmit=e=>{
    e.preventDefault();
    const pin=[...ins].map(x=>x.value).join('');
    if(pin===u.pin){d.close();cb&&cb();}
    else{ins.forEach(x=>x.value='');ins[0].focus();alert('Неверный PIN');}
  };
  d.showModal();
}

function switchUser(key){
  if(key===db.active){go();return;}
  askPin(key,()=>{
    db.active=key;save();
    log('Вход в профиль «'+db.users[key].name+'»');
    go();
  });
}

function chooseUserModal(){
  const d=$('#d');
  d.innerHTML=`<h3 style="margin-top:0">Войти как…</h3>
  <div class="bar" style="flex-direction:column;align-items:stretch">
    ${Object.entries(db.users).map(([k,u])=>`
      <button style="text-align:left;padding:12px"
              onclick="$('#d').close();switchUser('${k}')">
        <b>${u.name}</b><br><small class="hint">${u.role}</small>
      </button>`).join('')}
    <button onclick="$('#d').close()">Отмена</button>
  </div>`;
  d.showModal();
}

/* ---------- УНИВЕРСАЛЬНАЯ МОДАЛКА ---------- */
function modal(title,fields,cb,ok='Сохранить'){
  const d=$('#d');
  d.innerHTML=`<h3 style="margin-top:0">${title}</h3><form method="dialog" id="f">`+
    fields.map(f=>`<label>${f.l}</label>`+
      (f.o
        ?`<select name="${f.k}">${f.o.map(o=>`<option value="${o[0]}"${o[0]==f.v?' selected':''}>${o[1]}</option>`).join('')}</select>`
        :f.t=='ta'
          ?`<textarea name="${f.k}">${f.v||''}</textarea>`
          :`<input name="${f.k}" type="${f.t||'text'}" value="${f.v??''}" ${f.r?'required':''}>`)
    ).join('')+
    `<div class="bar" style="margin:14px 0 0">
       <button class="p">${ok}</button>
       <button type="button" onclick="$('#d').close()">Отмена</button>
     </div></form>`;
  d.querySelector('form').onsubmit=e=>{
    e.preventDefault();
    const o=Object.fromEntries(new FormData(e.target));
    if(cb(o)!==false){d.close();save();go();}
  };
  d.showModal();
}

/* ---------- UI-ХЕЛПЕРЫ ---------- */
const T=(h,rows)=>`<div class="w"><table><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr>${
  rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')
  ||`<tr><td colspan=${h.length} style="color:var(--m)">Пока пусто</td></tr>`}</table></div>`;
const K=(l,v)=>`<div class="k"><small>${l}</small><b>${v}</b></div>`;
const cancelBtn=(a,i)=>`<button class="s" onclick="cancelRec('${a}',${i})">Отменить</button>`;

function cancelRec(a,i){
  if(!confirm('Отметить запись как «Отменено»?'))return;
  U()[a].find(x=>x.id==i).status='Отменено';
  log('Отменена запись '+a+' #'+i);
  save();go();
}

/* ============================================================
   СТРАНИЦЫ
   ============================================================ */
const pages={

home(){
  const f=fin(...mon()),a=active();
  const soon=a.filter(c=>c.end<=addD(today(),3));
  return `<h2>Добро пожаловать, ${U().name}!</h2>
  <p style="color:var(--m)">${new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
  <div class="bar">
    <button class="p" onclick="newContract()">+ Новая аренда</button>
    <button onclick="newClient()">+ Клиент</button>
    <button onclick="newIncome()">+ Доход</button>
    <button onclick="newExpense()">+ Расход</button>
  </div>
  <div class="g">
    ${K('Велосипедов',U().bikes.length)}
    ${K('В аренде',U().bikes.filter(b=>bikeSt(b)=='В аренде').length)}
    ${K('Свободно',U().bikes.filter(b=>bikeSt(b)=='Свободен').length)}
    ${K('Аккумуляторов свободно',U().batts.filter(b=>battSt(b)=='Свободен').length)}
    ${K('Активных договоров',a.length)}
  </div>
  <h3>Финансы за текущий месяц</h3>
  <div class="g">
    ${K('Доход',money(f.inc))}
    ${K('Расходы',money(f.exp))}
    ${K('Налог '+S().tax+'%',money(f.tax))}
    ${K('Партнёру '+S().partner+'%',money(f.partner))}
    ${K('Прибыль',money(f.owner))}
    ${role()==='partner'?K('Поступления от владельца (25%)',money(f.partnerIncome||0)):''}
  </div>
  <h3>Уведомления</h3>
  ${soon.map(c=>`<div class="warn">⚠ Договор ${c.num} (${cl(c.client)?.name}) — окончание ${fd(c.end)}${c.end<today()?` · <b class="bad">просрочен на ${odays(c)} дн., штраф ${money(owed(c)+owedReturn(c))}</b>`:''}</div>`).join('')
    ||'<p style="color:var(--m)">Нет предупреждений</p>'}
  <h3>Ближайшие окончания</h3>
  ${T(['Договор','Клиент','Велосипед','Окончание'],
    a.sort((x,y)=>x.end<y.end?-1:1).map(c=>[c.num,cl(c.client)?.name,'№'+bk(c.bike).n,fd(c.end)]))}`;
},

contracts(){
  const q=($('#q')?.value||'').toLowerCase(),st=$('#st')?.value||'';
  const rows=U().contracts.filter(c=>
    (!st||c.status==st) &&
    (!q||(c.num+(cl(c.client)?.name||'')+(cl(c.client)?.phone||'')+(bk(c.bike)?.vin||'')).toLowerCase().includes(q))
  ).slice().reverse();
  return `<h2>Договоры</h2>
  <div class="bar">
    <button class="p" onclick="newContract()">+ Добавить договор</button>
    <input id="q" placeholder="Поиск: номер, ФИО, телефон, VIN" value="${q}" oninput="go(1)">
    <select id="st" onchange="go(1)">
      ${['','Активен','Завершён','Отменён'].map(s=>`<option ${s==st?'selected':''} value="${s}">${s||'Все статусы'}</option>`)}
    </select>
  </div>
  ${T(['Договор','Клиент','Велосипед','Аккум.','Начало','Конец','Сумма/нед.','Просрочка / штраф','Статус',''],
    rows.map(c=>[
      `<b>${c.num}</b>`,
      cl(c.client)?.name||'—',
      '№'+(bk(c.bike)?.n||'?'),
      c.batt?'№'+bt(c.batt).n:'Нет',
      fd(c.start),fd(c.end),money(c.price),
      (odays(c)&&c.status=='Активен')?`<span class="bad">${odays(c)} дн. · ${money(owed(c)+owedReturn(c))}</span>`:'—',
      `<span class="tag">${c.status}</span>`,
      (c.status=='Активен'
        ?`${(owed(c)+owedReturn(c))?`<button class="s" onclick="chargePen(${c.id})">Штраф</button> `:''}
           <button class="s" onclick="extend(${c.id})">Продлить</button>
           <button class="s" onclick="closeC(${c.id},'Завершён')">Завершить</button>
           <button class="s" onclick="closeC(${c.id},'Отменён')">Отмена</button>
           <button class="s" onclick="printContract(${c.id})">Печать</button>`
        :`<button class="s" onclick="printContract(${c.id})">Печать</button>`)
    ]))}`;
},

clients(){
  return `<h2>Клиенты</h2>
  <div class="bar"><button class="p" onclick="newClient()">+ Клиент</button></div>`+
  T(['ФИО','Телефон','Паспорт/данные','Договоры','Комментарий'],
    U().clients.map(c=>[
      c.name,c.phone,c.passport,
      U().contracts.filter(x=>x.client==c.id).map(x=>x.num).join(', ')||'—',
      c.comment||''
    ]));
},

bikes(){
  return `<h2>Электровелосипеды</h2>`+
  T(['№','VIN','Модель','Статус','Клиент','Договор','Аренд','Доход','Расходы','Прибыль',''],
    U().bikes.map(b=>{
      const cs=U().contracts.filter(c=>c.bike==b.id);
      const cur=active().find(c=>c.bike==b.id);
      const i=live(U().incomes).filter(x=>cs.some(c=>c.id==x.contract)).reduce((s,x)=>s+x.amount,0);
      const e=live(U().expenses).filter(x=>x.bike==b.id).reduce((s,x)=>s+x.amount,0);
      return [
        b.n,b.vin||'—',b.model||'—',
        `<span class="tag">${bikeSt(b)}</span>`,
        cur?cl(cur.client)?.name||'':'',
        cur?cur.num+' до '+fd(cur.end):'',
        cs.length,money(i),money(e),money(i-e),
        `<button class="s" onclick="editBike(${b.id})">Изм.</button>`
      ];
    }))+
  `<div class="bar" style="margin-top:12px"><button onclick="addBike()">+ Велосипед</button></div>
  <h2 style="margin-top:24px">Аккумуляторы</h2>`+
  T(['№','Серийный №','Статус','Арендатор','Договор',''],
    U().batts.map(b=>{
      const cur=active().find(c=>c.batt==b.id);
      return [b.n,b.serial||'—',
        `<span class="tag">${battSt(b)}</span>`,
        cur?cl(cur.client)?.name||'':'',
        cur?.num||'',
        `<button class="s" onclick="editBatt(${b.id})">Изм.</button>`];
    }))+
  `<div class="bar" style="margin-top:12px"><button onclick="addBatt()">+ Аккумулятор</button></div>`;
},

finance(){
  const f=$('#pf')?.value??mon()[0];
  const t=$('#pt')?.value??mon()[1];
  const r=fin(f,t);
  const inr=x=>(!f||x.date>=f)&&(!t||x.date<=t);
  const partnerRow = role()==='partner'
    ? `<div class="row"><span>Поступления от владельца (25% с его прибыли)</span><b>${money(r.partnerIncome||0)}</b></div>
       <div class="row"><span><b>Итого доход профиля</b></span><b>${money(r.totalOwner||r.owner)}</b></div>`
    : '';
  return `<h2>Финансы</h2>
  <div class="bar">
    С <input id="pf" type="date" value="${f}" onchange="go(1)">
    по <input id="pt" type="date" value="${t}" onchange="go(1)">
    <button onclick="newIncome()">+ Доход</button>
    <button onclick="newExpense()">+ Расход</button>
  </div>
  <div class="w" style="padding:8px 14px;margin-bottom:12px">
    ${[
      ['Доход',r.inc],
      ['− Расходы',r.exp],
      ['База налога ('+(S().base=='income'?'доход':'доход − расходы')+')',r.base],
      ['− Налог '+S().tax+'%',r.tax],
      ['Прибыль до партнёра',r.pre],
      ['− Партнёру '+S().partner+'%',r.partner],
      ['<b>Прибыль владельца</b>',r.owner]
    ].map(x=>`<div class="row"><span>${x[0]}</span><b>${money(x[1])}</b></div>`).join('')}
    ${partnerRow}
  </div>
  <h3>Доходы</h3>
  ${T(['Дата','Договор','Тип','Сумма','Оплата','Статус',''],
    U().incomes.filter(inr).sort((a,b)=>a.date<b.date?1:-1).map(x=>[
      fd(x.date),ct(x.contract)?.num||'—',x.type,money(x.amount),x.method,
      x.status=='Отменено'?'<span class="bad">Отменено</span>':'ОК',
      x.status=='Отменено'?'':cancelBtn('incomes',x.id)
    ]))}
  <h3>Расходы</h3>
  ${T(['Дата','Категория','Описание','Велосипед','Сумма','Статус',''],
    U().expenses.filter(inr).sort((a,b)=>a.date<b.date?1:-1).map(x=>[
      fd(x.date),x.cat,x.desc||'',
      x.bike?'№'+(bk(x.bike)?.n||'?'):'—',
      money(x.amount),
      x.status=='Отменено'?'<span class="bad">Отменено</span>':'ОК',
      x.status=='Отменено'?'':cancelBtn('expenses',x.id)
    ]))}`;
},

calc(){
  const v=n=>+($('#'+n)?.value||0);
  const a=v('c0'),b=v('c1'),w=v('cw')||1,e=v('ce'),extra=v('cx');
  const inc=(a*S().p0+b*S().p1add+extra)*w;
  const base=S().base=='income'?inc:Math.max(inc-e,0);
  const tax=base*S().tax/100;
  const pre=inc-e-tax;
  const p=Math.max(pre,0)*S().partner/100;
  const i=(n,l,d)=>`<label>${l}</label>
    <input id="${n}" type="number" min="0" value="${$('#'+n)?.value??d}" oninput="go(1);$('#${n}').focus()">`;
  return `<h2>Калькулятор</h2>
  <div style="max-width:420px">
    ${i('c0','Аренд без аккумулятора',5)}
    ${i('c1','С доп. аккумулятором',3)}
    ${i('cx','Прочее (штрафы и т.п.)',0)}
    ${i('cw','Недель',1)}
    ${i('ce','Расходы, ₽',0)}
  </div><br>
  <div class="w" style="padding:8px 14px;max-width:420px">
    ${[
      ['Общий доход',inc],
      ['− Расходы',e],
      ['− Налог',tax],
      ['= Прибыль после налога',pre],
      ['− Партнёру',p],
      ['<b>Прибыль владельца</b>',pre-p]
    ].map(x=>`<div class="row"><span>${x[0]}</span><b>${money(x[1])}</b></div>`).join('')}
  </div>`;
},

log(){
  const list = role()==='admin' ? db.adminLog : U().log;
  return `<h2>История операций${role()==='admin'?' (все профили)':''}</h2>`+
  T(['Когда','Кто','Действие'],list.map(l=>[l.t,l.who||'',l.x]));
},

settings(){
  const s=S();
  const pinRow = `
    <h3>PIN моего профиля</h3>
    <div class="bar"><button onclick="changePin()">Сменить PIN (${U().pin})</button></div>`;
  const adminBlock = role()==='admin' ? `
    <h3>Профили</h3>
    ${T(['Профиль','Роль','PIN'],
      Object.entries(db.users).map(([k,u])=>[u.name,u.role,u.pin]))}
    <div class="bar" style="margin-top:8px">
      <button onclick="resetPins()">Сбросить все PIN на 0000</button>
    </div>` : '';
  const backupBlock = role()==='admin' ? `
    <h3>Резервная копия (полная, все профили)</h3>
    <div class="bar">
      <button onclick="backupAll()">Скачать всё (JSON)</button>
      <label class="s" style="cursor:pointer;border:1px solid var(--b);border-radius:8px;padding:7px 10px">
        Восстановить<input type="file" accept=".json" hidden onchange="restoreAll(this)">
      </label>
      <button onclick="if(confirm('Стереть ВСЕ данные?')){localStorage.removeItem(KEY);location.reload()}">
        Сбросить всё
      </button>
    </div>
    <p style="color:var(--m)">Полный бэкап содержит данные всех профилей, журнал админа и настройки.</p>`
  : `
    <h3>Резервная копия моего профиля</h3>
    <div class="bar"><button onclick="backupMine()">Скачать мой профиль (JSON)</button></div>
    <p style="color:var(--m)">Данные хранятся в браузере этого устройства. Полный бэкап может сделать только Администратор.</p>`;
  return `<h2>Настройки — ${U().name}</h2>
  <div class="bar"><button class="p" onclick="editSettings()">Изменить тарифы и проценты</button></div>
  <div class="w" style="padding:8px 14px;max-width:520px;margin-bottom:16px">
    ${[
      ['Аренда без аккумулятора',money(s.p0)],
      ['Доп. аккумулятор',money(s.p1add)+'/нед'],
      ['Налог',s.tax+'%'],
      ['Штраф за просрочку оплаты',PEN()+'% от ставки в день'],
      ['Штраф за просрочку возврата',S().penReturn+'% от стоимости СИМ в день'],
      ['Штраф за неуведомление о закрытии',money(S().fine500)],
      ['База налога',s.base=='income'?'Доход':'Доход − расходы'],
      ['Партнёр (от прибыли после налога)',s.partner+'%']
    ].map(x=>`<div class="row"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}
  </div>
  ${pinRow}${adminBlock}${backupBlock}`;
},

map(){
  return `<h2>Карта велосипедов</h2>
  <p style="color:var(--m)">Координаты можно ввести вручную в карточке велосипеда (Транспорт → Изм.). Для онлайн-отслеживания откройте StarLine.</p>
  <div class="bar">
    <a href="https://starline-online.ru/" target="_blank" rel="noopener">
      <button class="p">🌐 Открыть StarLine (онлайн-карта)</button>
    </a>
  </div>
  <div id="map"></div>
  <h3 style="margin-top:16px">Велосипеды</h3>
  ${T(['№','VIN','StarLine ID','Координаты',''],
    U().bikes.map(b=>[
      b.n,b.vin||'—',b.starlineId||'—',
      b.lat&&b.lng?`${b.lat}, ${b.lng}`:'—',
      `<button class="s" onclick="editBike(${b.id})">Изм.</button>`
    ]))}
  <div id="mapdata" style="display:none">${JSON.stringify(
    U().bikes.map(b=>({n:b.n,lat:b.lat,lng:b.lng,vin:b.vin,starlineId:b.starlineId,status:bikeSt(b)}))
  )}</div>`;
}
};

/* ============================================================
   НАВИГАЦИЯ
   ============================================================ */
const menu=[
  ['home','Главная'],
  ['contracts','Договоры'],
  ['clients','Клиенты'],
  ['bikes','Транспорт'],
  ['finance','Финансы'],
  ['map','Карта'],
  ['calc','Калькулятор'],
  ['log','История'],
  ['settings','Настройки']
];

let mapObj=null;

function go(keep){
  const p=(location.hash||'#home').slice(1);
  const pg=pages[p]?p:'home';

  let whoHTML;
  if(role()==='admin'){
    whoHTML=`<div class="who">Профиль:
      <select onchange="switchUser(this.value)">
        ${Object.entries(db.users).map(([k,u])=>
          `<option value="${k}" ${k==db.active?'selected':''}>${u.name} (${u.role})</option>`
        ).join('')}
      </select></div>`;
  }else{
    whoHTML=`<div class="who">👤 ${U().name} · <a onclick="chooseUserModal()">сменить</a></div>`;
  }

  $('#nav').innerHTML='<b>🚲 Аренда</b>'+
    menu.map(m=>`<a class="${m[0]==pg?'on':''}" href="#${m[0]}">${m[1]}</a>`).join('')+
    whoHTML;

  const fid=document.activeElement?.id;
  const pos=document.activeElement?.selectionStart;
  $('#m').innerHTML=pages[pg]();
  if(keep&&fid&&$('#'+fid)){
    const e=$('#'+fid);
    e.focus();
    try{e.setSelectionRange(pos,pos)}catch(x){}
  }

  if(pg==='map')initMap();
}

function initMap(){
  if(mapObj){mapObj.remove();mapObj=null;}
  if(typeof L==='undefined'){
    $('#map').innerHTML='<p style="padding:12px;color:var(--m)">Leaflet не загрузился (нет интернета?). Карта недоступна офлайн.</p>';
    return;
  }
  const raw=JSON.parse($('#mapdata')?.textContent||'[]');
  const pts=raw.filter(b=>b.lat&&b.lng);
  mapObj=L.map('map').setView(
    pts[0]?[pts[0].lat,pts[0].lng]:[61.1,72.6],
    pts.length?12:10
  );
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© OpenStreetMap'
  }).addTo(mapObj);
  pts.forEach(b=>{
    L.marker([b.lat,b.lng]).addTo(mapObj)
      .bindPopup(`<b>№${b.n}</b><br>${b.vin||''}<br>${b.status}`);
  });
}

addEventListener('hashchange',()=>go());

/* ============================================================
   КЛИЕНТЫ И ДОГОВОРЫ
   ============================================================ */
function newClient(){
  modal('Новый клиент',[
    {k:'name',l:'ФИО',r:1},
    {k:'phone',l:'Телефон'},
    {k:'passport',l:'Паспорт / данные'},
    {k:'comment',l:'Комментарий',t:'ta'}
  ],o=>{
    U().clients.push({id:id(),...o});
    log('Добавлен клиент '+o.name);
  });
}

const nextNum=b=>'U'+bk(b).n+(U().contracts.filter(c=>c.bike==b).length+1);

function newContract(){
  const fb=U().bikes.filter(b=>bikeSt(b)=='Свободен');
  const fbat=U().batts.filter(b=>battSt(b)=='Свободен');
  if(!fb.length)return alert('Нет свободных велосипедов');

  modal('Новый договор',[
    {k:'client',l:'Клиент',o:[['new','— Новый клиент —'],...U().clients.map(c=>[c.id,c.name])]},
    {k:'name',l:'Если новый: ФИО'},
    {k:'phone',l:'Если новый: телефон'},
    {k:'bike',l:'Велосипед (свободные)',o:fb.map(b=>[b.id,'№'+b.n+' → будет '+nextNum(b.id)])},
    {k:'batt',l:'Доп. аккумулятор',o:[['','Без аккумулятора'],...fbat.map(b=>[b.id,'С аккумулятором №'+b.n])]},
    {k:'start',l:'Начало',t:'date',v:today(),r:1},
    {k:'weeks',l:'Недель',t:'number',v:1,r:1},
    {k:'method',l:'Способ оплаты',o:[['Наличные','Наличные'],['Перевод','Перевод']]},
    {k:'comment',l:'Комментарий',t:'ta'}
  ],o=>{
    let cid=+o.client;
    if(o.client=='new'){
      if(!o.name)return alert('Укажите ФИО'),false;
      cid=id();
      U().clients.push({id:cid,name:o.name,phone:o.phone,passport:'',comment:''});
    }
    const w=Math.max(1,+o.weeks);
    const price=S().p0+(o.batt?S().p1add:0);
    const c={
      id:id(),num:nextNum(+o.bike),bike:+o.bike,client:cid,
      batt:o.batt?+o.batt:null,
      start:o.start,end:addD(o.start,7*w),
      price,status:'Активен',comment:o.comment||'',payer:'me'
    };
    U().contracts.push(c);
    U().incomes.push({
      id:id(),date:o.start,contract:c.id,
      type:o.batt?'Аренда + аккумулятор':'Аренда',
      amount:price*w,method:o.method,status:'ОК'
    });
    log(`Создан договор ${c.num}, доход ${money(price*w)}`);
  },'Создать');
}

function extend(i){
  const c=ct(i);
  modal('Продление '+c.num,[{k:'w',l:'Недель',t:'number',v:1,r:1}],o=>{
    const w=Math.max(1,+o.w);
    c.end=addD(c.end,7*w);
    U().incomes.push({
      id:id(),date:today(),contract:c.id,
      type:'Продление',amount:c.price*w,method:'Наличные',status:'ОК'
    });
    log(`Продлён ${c.num} на ${w} нед.`);
  },'Продлить');
}

function chargePen(i,q){
  const c=ct(i),o=owed(c),r=owedReturn(c);
  if(o<=0&&r<=0)return;
  const total=o+r;
  if(!q&&!confirm(`Начислить штраф ${money(total)} (просрочка ${odays(c)} дн.)?`))return;
  if(o>0){
    U().incomes.push({id:id(),date:today(),contract:c.id,
      type:'Штраф (пени 1%)',amount:o,method:'Наличные',status:'ОК'});
    c.penBilled=(c.penBilled||0)+o;
  }
  if(r>0){
    U().incomes.push({id:id(),date:today(),contract:c.id,
      type:'Штраф (просрочка возврата 0.8%)',amount:r,method:'Наличные',status:'ОК'});
    c.penReturnBilled=(c.penReturnBilled||0)+r;
  }
  log(`Штраф по ${c.num}: ${money(total)}`);
  save();go();
}

function closeC(i,s){
  if(s=='Завершён'&&(owed(ct(i))+owedReturn(ct(i)))>0
     &&confirm('Есть неначисленный штраф. Начислить перед завершением?'))chargePen(i,1);
  if(confirm('Статус договора → '+s+'?')){
    ct(i).status=s;
    log('Договор '+ct(i).num+': '+s);
    save();go();
  }
}

function newIncome(){
  modal('Новый доход',[
    {k:'date',l:'Дата',t:'date',v:today(),r:1},
    {k:'contract',l:'Договор',o:[['','—'],...U().contracts.map(c=>[c.id,c.num])]},
    {k:'type',l:'Тип',o:['Аренда','Дополнительный аккумулятор','Продление','Штраф','Компенсация','Другое'].map(x=>[x,x])},
    {k:'amount',l:'Сумма',t:'number',r:1},
    {k:'method',l:'Оплата',o:[['Наличные','Наличные'],['Перевод','Перевод']]}
  ],o=>{
    U().incomes.push({id:id(),...o,contract:+o.contract||null,amount:+o.amount,status:'ОК'});
    log('Доход '+money(+o.amount));
  });
}

function newExpense(){
  modal('Новый расход',[
    {k:'date',l:'Дата',t:'date',v:today(),r:1},
    {k:'cat',l:'Категория',o:['Ремонт','Обслуживание','Запчасти','Аккумуляторы','Транспорт','Хранение','Реклама','Связь','Банковские расходы','Прочее'].map(x=>[x,x])},
    {k:'bike',l:'Велосипед',o:[['','—'],...U().bikes.map(b=>[b.id,'№'+b.n])]},
    {k:'amount',l:'Сумма',t:'number',r:1},
    {k:'desc',l:'Описание'}
  ],o=>{
    U().expenses.push({id:id(),...o,bike:+o.bike||null,amount:+o.amount,status:'ОК'});
    log('Расход '+money(+o.amount));
  });
}

/* ============================================================
   ТРАНСПОРТ
   ============================================================ */
const BS=['Свободен','На обслуживании','В ремонте','Продан/выведен'].map(x=>[x,x]);
const AS=['Свободен','На обслуживании','Неисправен'].map(x=>[x,x]);

function addBike(){
  const n=Math.max(0,...U().bikes.map(b=>b.n))+1;
  U().bikes.push({id:id(),n,vin:'',model:'',color:'',chestZnak:'',
    status:'Свободен',bikeValue:0,lat:null,lng:null,starlineId:''});
  save();go();
  editBike(U().bikes.at(-1).id);
}

function editBike(i){
  const b=bk(i);
  modal('Велосипед №'+b.n,[
    {k:'vin',l:'VIN / серийный номер рамы',v:b.vin},
    {k:'model',l:'Марка/модель',v:b.model},
    {k:'color',l:'Цвет',v:b.color||''},
    {k:'chestZnak',l:'Честный знак',v:b.chestZnak||''},
    {k:'status',l:'Статус (если не в аренде)',o:BS,v:b.status},
    {k:'bikeValue',l:'Стоимость СИМ, ₽ (для штрафа 0,8%)',t:'number',v:b.bikeValue||0},
    {k:'starlineId',l:'StarLine ID устройства',v:b.starlineId||''},
    {k:'lat',l:'Широта',t:'number',v:b.lat??''},
    {k:'lng',l:'Долгота',t:'number',v:b.lng??''}
  ],o=>{
    Object.assign(b,{
      vin:o.vin,model:o.model,color:o.color,chestZnak:o.chestZnak,
      status:o.status,bikeValue:+o.bikeValue||0,starlineId:o.starlineId,
      lat:o.lat!==''?+o.lat:null,lng:o.lng!==''?+o.lng:null
    });
  });
}

function addBatt(){
  const n=Math.max(0,...U().batts.map(b=>b.n))+1;
  U().batts.push({id:id(),n,serial:'',status:'Свободен'});
  save();go();
}

function editBatt(i){
  const b=bt(i);
  modal('Аккумулятор №'+b.n,[
    {k:'serial',l:'Серийный номер',v:b.serial},
    {k:'status',l:'Статус',o:AS,v:b.status}
  ],o=>Object.assign(b,o));
}

/* ============================================================
   НАСТРОЙКИ, PIN, БЭКАП
   ============================================================ */
function editSettings(){
  const s=S();
  modal('Настройки',[
    {k:'p0',l:'Без аккумулятора, ₽/нед.',t:'number',v:s.p0},
    {k:'p1add',l:'Доп. аккумулятор, ₽/нед.',t:'number',v:s.p1add},
    {k:'tax',l:'Налог, %',t:'number',v:s.tax},
    {k:'base',l:'База налога',o:[['income','Доход'],['net','Доход − расходы']],v:s.base},
    {k:'partner',l:'Партнёр, % от прибыли после налога',t:'number',v:s.partner},
    {k:'pen',l:'Пени за просрочку оплаты, % в день',t:'number',v:s.pen},
    {k:'penReturn',l:'Пени за просрочку возврата, % от стоимости СИМ/день',t:'number',v:s.penReturn},
    {k:'fine500',l:'Штраф за неуведомление о закрытии, ₽',t:'number',v:s.fine500}
  ],o=>{
    U().settings={
      p0:+o.p0,p1add:+o.p1add,tax:+o.tax,base:o.base,
      partner:+o.partner,pen:+o.pen,penReturn:+o.penReturn,fine500:+o.fine500
    };
    log('Изменены настройки');
  });
}

function changePin(){
  const d=$('#d');
  d.innerHTML=`<h3 style="margin-top:0">Смена PIN профиля «${U().name}»</h3>
  <form method="dialog" id="pf">
    <label>Текущий PIN</label>
    <input name="old" type="password" maxlength="4" inputmode="numeric">
    <label>Новый PIN (4 цифры)</label>
    <input name="new1" type="password" maxlength="4" inputmode="numeric">
    <label>Повторите</label>
    <input name="new2" type="password" maxlength="4" inputmode="numeric">
    <div class="bar" style="margin-top:10px">
      <button class="p">Сохранить</button>
      <button type="button" onclick="$('#d').close()">Отмена</button>
    </div>
  </form>`;
  d.querySelector('form').onsubmit=e=>{
    e.preventDefault();
    const o=Object.fromEntries(new FormData(e.target));
    if(o.old!==U().pin)return alert('Неверный текущий PIN');
    if(!/^\d{4}$/.test(o.new1))return alert('PIN — ровно 4 цифры');
    if(o.new1!==o.new2)return alert('PIN не совпадают');
    U().pin=o.new1;
    log('Сменён PIN');
    save();d.close();go();
  };
  d.showModal();
}

function resetPins(){
  if(!confirm('Сбросить PIN всех профилей на 0000?'))return;
  Object.values(db.users).forEach(u=>u.pin='0000');
  save();go();alert('Все PIN = 0000');
}

function backupAll(){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(db)],{type:'application/json'}));
  a.download='ebike-full-'+today()+'.json';
  a.click();
}

function backupMine(){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify({profile:db.active,user:U()})],{type:'application/json'}));
  a.download='ebike-'+db.active+'-'+today()+'.json';
  a.click();
}

function restoreAll(el){
  if(role()!=='admin')return alert('Только администратор');
  const r=new FileReader();
  r.onload=()=>{
    try{
      const n=JSON.parse(r.result);
      if(!n.users)return alert('Неверный файл');
      db=n;save();go();alert('Восстановлено');
    }catch(e){alert('Неверный файл')}
  };
  r.readAsText(el.files[0]);
}

/* ============================================================
   ПЕЧАТЬ ДОГОВОРА (полный шаблон)
   ============================================================ */
function num2words(n){
  const a=['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
  const b=['','десять','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
  const c=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
  const n2=Math.round(n);
  if(n2<10)return a[n2]||'ноль';
  if(n2<20)return ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать',
    'пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'][n2-10];
  const h=Math.floor(n2/100),t=Math.floor((n2%100)/10),e=n2%10;
  return [c[h],b[t],a[e]].filter(Boolean).join(' ');
}

function printContract(i){
  const c=ct(i),cl_=cl(c.client),b=bk(c.bike),bat=c.batt?bt(c.batt):null;
  const w=Math.round((new Date(c.end)-new Date(c.start))/864e5/7);
  const p0=S().p0,p1=S().p1add;
  const html=`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Договор ${c.num}</title>
  <style>
  body{font:13px/1.45 "Times New Roman",serif;max-width:780px;margin:20px auto;padding:0 22px;color:#000}
  h1{font-size:15px;text-align:center;margin:0 0 4px;text-transform:uppercase}
  h2{font-size:13px;margin:14px 0 6px;font-weight:bold}
  p{margin:3px 0;text-align:justify;text-indent:0}
  table{width:100%;border-collapse:collapse;margin:4px 0}
  td,th{border:1px solid #000;padding:3px 6px;font-size:12px;vertical-align:top}
  .sign{display:flex;justify-content:space-between;margin-top:26px;gap:20px}
  .sign div{width:48%;font-size:12px;line-height:1.5}
  .center{text-align:center}.muted{color:#333}
  .no-print{text-align:center;margin:16px 0}
  .no-print button{padding:10px 18px;font-size:15px;cursor:pointer;border-radius:6px;border:1px solid #888;background:#0f766e;color:#fff}
  ol,ul{margin:3px 0 3px 20px;padding:0}
  li{margin:1px 0}
  @media print{body{margin:0}.no-print{display:none}}
  </style></head><body>
  <div class="no-print"><button onclick="window.print()">🖨 Печать / Сохранить в PDF</button></div>

  <p class="center"><b>ДОГОВОР АРЕНДЫ ЭЛЕКТРОВЕЛОСИПЕДА (СИМ) № ${c.num}</b></p>
  <p class="center muted">г. Нефтеюганск · Дата: ${fd(c.start)}</p>

  <p>Индивидуальный предприниматель <b>Жиров Сергей Константинович</b>, именуемый в дальнейшем «Арендодатель», с одной стороны, и <b>${cl_?.name||'_______________________'}</b>, именуемый(-ая) в дальнейшем «Арендатор», с другой стороны, заключили настоящий договор о нижеследующем:</p>

  <h2>1. Предмет договора</h2>
  <p>1.1. Арендодатель передаёт во временное владение и пользование Арендатору электровелосипед (далее – «СИМ») со следующими характеристиками:</p>
  <table>
    <tr><td style="width:45%">Модель</td><td>${b?.model||'Minako U2 PRO'}</td></tr>
    <tr><td>Серийный номер рамы</td><td>${b?.vin||'—'}</td></tr>
    <tr><td>Честный знак</td><td>${b?.chestZnak||'—'}</td></tr>
    <tr><td>Цвет</td><td>${b?.color||'—'}</td></tr>
  </table>
  <p>1.2. СИМ передаётся Арендатору для личного пользования в пределах города Нефтеюганска и пригорода не дальше посёлка Сингапая.</p>
  <p>1.3. Срок аренды: <b>${fd(c.end)}</b>.</p>
  <p>1.4. В случае желания Арендатора продления настоящего договора Арендатор обязан уведомить Арендодателя за 7 календарных дней до даты возврата СИМ.</p>
  <p>1.5. В случае неуведомления Арендодателя о желании Арендатора продлить договор, Арендатор обязан вернуть СИМ и дополнительно выданное оборудование в установленный договором срок согласно пункту 1.3 настоящего договора.</p>
  <p>1.6. Арендодатель оставляет за собой право на принятие решения по продлению договора в случае, если на СИМ отсутствует бронь другим клиентом.</p>
  <p>1.7. Аренда предоставляется лицам, достигшим 16-летнего возраста. Лицам, младше 18 лет выдаётся бланк для подписания согласия на заключение договора аренды родителями/законными представителями.</p>

  <h2>2. Арендная плата и порядок расчётов</h2>
  <p>2.1. Размер арендной платы составляет <b>${money(p0)}</b> (${num2words(p0)}) в неделю${bat?`; доп. аккумулятор — <b>${money(p1)}</b> (${num2words(p1)}) в неделю. Итого: <b>${money(c.price)}</b> в неделю`:''}.</p>
  <p>2.2. Аренда предоставляется исключительно от 1 недели (7 календарных дней). Количество недель по настоящему договору: <b>${w}</b>.</p>
  <p>2.3. В случае досрочного закрытия договора, оплаченная за период сумма аренды не возвращается.</p>
  <p>2.4. Оплата за аренду, компоненты и ремонт производится: переводом по СБП на номер телефона: <b>+7 (902) 692-60-74 (Елизавета Б.)</b> (СТРОГО ВТБ), с отправкой чека любым удобным для Арендатора способом.</p>
  <p>2.5. Порядок оплаты:</p>
  <p><b>1 вариант</b> (Доп. АКБ ${money(p1)}/неделя):</p>
  <ul>
    <li>Оплата в размере ${money(p0)} производится в течение суток после подписания договора аренды;</li>
    <li>Далее — расчёт производится каждые 7 календарных дней авансом за следующую расчётную неделю в размере ${money(p0)}.</li>
  </ul>
  <p><b>2 вариант</b> (Доп. АКБ ${money(p1)}/неделя):</p>
  <ul>
    <li>После подписания договора аренды первая неделя без предоплаты;</li>
    <li>Спустя 7 календарных дней после подписания настоящего договора: оплата в размере ${money(p0*2)} за прошлую и следующую неделю авансом;</li>
    <li>Далее — расчёт производится каждые 7 календарных дней авансом за следующую расчётную неделю в размере ${money(p0)}.</li>
  </ul>
  <p>2.6. В случае просрочки оплаты Арендатор уплачивает пени в размере 1% от неоплаченной суммы за каждый день просрочки.</p>
  <p>2.7. В случае просрочки оплаты аренды более 7 дней – СИМ и выданное дополнительное оборудование подлежит конфискации до полного погашения задолженности. Арендодатель оставляет за собой право на досрочное расторжение договора в одностороннем порядке без возврата оплаченной суммы за период, путём направления Арендатору акта приёма-передачи СИМ способом, указанным в пункте 2.4 настоящего договора.</p>
  <p>2.8. В случае просрочки возврата СИМ, или препятствованию конфискации СИМ и дополнительного оборудования, Арендатор уплачивает пени в размере 0,8% от стоимости СИМ за каждый день просрочки.</p>

  <h2>3. Права и обязанности сторон</h2>
  <p><b>3.1. Обязанности Арендодателя:</b></p>
  <p>3.1.1. Передать СИМ в состоянии, соответствующем условиям договора, с документами:</p>
  <ol>
    <li>Копия паспорта СИМ;</li>
    <li>Экземпляр договора аренды электровелосипеда;</li>
    <li>Приложение №1 Акт приёма-передачи электровелосипеда;</li>
    <li>Приложение №2 Правила и инструкция по эксплуатации;</li>
    <li>Приложение №4 Перечень комплектации и оборудования с указанием стоимости.</li>
  </ol>
  <p>3.1.2. Ознакомить с инструкцией по эксплуатации СИМ.</p>
  <p>3.1.3. Ознакомить с кратким курсом по ПДД для управления СИМ.</p>
  <p>3.1.4. Обеспечить техническую поддержку и консультации по вопросам эксплуатации. Ремонт неисправностей вследствие нормального износа, замена расходников и устранение заводских дефектов производится за счёт Арендодателя.</p>
  <p>3.1.5. Обеспечить технический осмотр и обслуживание.</p>
  <p>3.1.6. Обеспечить высокий уровень сервиса для комфортного пользования СИМ Арендатором в период действия настоящего договора.</p>

  <p><b>3.2. Права Арендодателя:</b></p>
  <p>3.2.1. Проверять состояние СИМ в период аренды, с предварительным уведомлением Арендатора за 2 часа.</p>
  <p>3.2.2. Требовать оплату сломанных компонентов и ремонт по вине Арендатора в ближайшую дату внесения платежа за аренду.</p>
  <p>3.2.3. Конфисковать СИМ и дополнительно выданное оборудование за нарушение инструкции и правил по эксплуатации (Приложение №2) с предварительным уведомлением Арендатора за 1 сутки, без возврата оплаченных за аренду средств за остаточный период.</p>
  <p>3.2.4. Досрочно расторгнуть договор в одностороннем порядке, уведомив Арендатора, в случаях, когда Арендатор нарушил правила и инструкцию по эксплуатации и иные негативные последствия для Арендодателя, прописанные в настоящем договоре.</p>

  <p><b>3.3. Обязанности Арендатора:</b></p>
  <p>3.3.1. Использовать СИМ бережно и строго в соответствии с его назначением, правилами и инструкцией (Приложение №2).</p>
  <p>3.3.2. Производить своевременную оплату аренды, сломанных компонентов и ремонта согласно установленным срокам.</p>
  <p>3.3.3. Беспрепятственно предоставлять СИМ Арендодателю для технического осмотра и обслуживания.</p>
  <p>3.3.4. Взять ответственность за передачу СИМ третьим лицам, не указанным в договоре и за все действия, вследствие чего Арендатор несёт материальные потери.</p>
  <p>3.3.5. Оплатить стоимость сломанных компонентов и ремонта по своей вине или вследствие передачи СИМ третьему лицу в течение 7 календарных дней.</p>
  <p>3.3.6. В случае просрочки оплаты сломанных компонентов и ремонта в установленный срок Арендатор уплачивает пени в размере 1% от неоплаченной суммы за каждый день просрочки.</p>
  <p>3.3.7. Беспрепятственно передать электровелосипед и дополнительно выданное оборудование в случае инициирования конфискации СИМ Арендодателем по причинам, указанным в настоящем договоре.</p>
  <p>3.3.8. Соблюдать правила дорожного движения и техники безопасности.</p>
  <p>3.3.9. Не передавать СИМ третьим лицам без письменного согласия Арендодателя.</p>
  <p>3.3.10. Арендатор не имеет права сдавать СИМ в субаренду или передавать в залог.</p>
  <p>3.3.11. Использовать СИМ исключительно в пределах города Нефтеюганска и Сингапая. Выезд за пределы согласованной зоны допускается с письменного согласия Арендодателя.</p>
  <p>3.3.12. Поддерживать СИМ в чистоте и исправном состоянии.</p>
  <p>3.3.13. Своевременно заряжать аккумулятор в соответствии с инструкцией.</p>
  <p>3.3.14. Незамедлительно уведомлять Арендодателя о любых неисправностях, повреждениях или происшествиях с участием СИМ.</p>
  <p>3.3.15. Вернуть СИМ в том же состоянии (с учётом нормального износа) в установленный срок.</p>
  <p>3.3.16. Запрещается без согласования с Арендодателем вносить какие-либо изменения в конструкцию и внешний вид СИМ.</p>
  <p>3.3.17. Запрещается срывать пломбы и вскрывать аккумуляторный отсек.</p>
  <p>3.3.18. Арендатор обязан возместить Арендодателю суммы административных штрафов, наложенных в связи с нарушением ПДД лицом, управляющим СИМ.</p>

  <p><b>3.4. Права Арендатора:</b></p>
  <p>3.4.1. Требовать от Арендодателя устранения заводских дефектов.</p>
  <p>3.4.2. Получать консультации по вопросам эксплуатации и правилам СИМ.</p>
  <p>3.4.3. Требовать составления и подписания акта приёма-передачи СИМ при выдаче и возврате, в котором фиксируется техническое состояние, пробег и наличие/отсутствие внешних повреждений.</p>
  <p>3.4.4. Осмотреть СИМ перед подписанием договора и отказом от его заключения, если обнаружены неисправности или дефекты, не оговоренные сторонами.</p>
  <p>3.4.5. Отказаться от досрочного расторжения договора и конфискации по инициативе Арендодателя без наличия нарушений и негативных последствий со стороны Арендатора.</p>

  <h2>4. Ответственность сторон</h2>
  <p>4.1. Арендатор несёт полную материальную ответственность за:</p>
  <ul>
    <li>Утрату, хищение или полное уничтожение СИМ (возмещение денежных средств в размере стоимости, указанной в приложении №4);</li>
    <li>Повреждения, возникшие по вине Арендатора (возмещение стоимости компонентов и ремонта, указанной в приложении №4);</li>
    <li>Нарушение инструкции и правил по эксплуатации СИМ, приведшее к поломке (возмещение расходов на ремонт и вышедшие из строя компоненты).</li>
  </ul>
  <p>4.2. За все инциденты, связанные со снятием Арендатором ограничения скорости мотор-колеса и снятием ограничения скорости на приборной панели, если такая возможность предусмотрена заводом-изготовителем или компанией, выпускающей данную модель СИМ, Арендатор несёт полную материальную, административную и уголовную ответственность.</p>
  <p>4.3. Арендодатель не несёт ответственность за скрытые дефекты, которые не могли быть выявлены при стандартном техническом осмотре и обслуживании перед выдачей СИМ, при условии, что СИМ было передано Арендатору в технически исправном состоянии.</p>
  <p>4.4. Стороны освобождаются от ответственности за частичное или полное неисполнение обязательств, если это явилось следствием обстоятельств непреодолимой силы.</p>
  <p>4.5. В случаях, когда поломка и ремонт стали следствием непройденного ТО по причине переноса срока или препятствованию предоставлению Арендатором СИМ Арендодателю для ТО в установленный срок, материальную ответственность за поломку и ремонт берёт на себя Арендатор.</p>

  <h2>5. Порядок передачи и возврата СИМ</h2>
  <p>5.1. Передача СИМ оформляется актом приёма-передачи, являющимся неотъемлемой частью договора.</p>
  <p>5.2. Возврат СИМ оформляется актом приёма-передачи.</p>
  <p>5.3. При обнаружении повреждений или недостачи комплектующих при возврате стороны вносят выявленные замечания в акт приёма-передачи с подробным описанием дефектов и недостачи комплектующих.</p>
  <p>5.4. При обнаружении повреждений или недостающих, сломанных компонентов Арендатор обязан оплатить стоимость компонентов и ремонта в течение 7 календарных дней.</p>
  <p>5.5. В случае просрочки оплаты повреждений или недостающих компонентов Арендатор уплачивает пени в размере 1% от неоплаченной суммы за каждый день просрочки.</p>
  <p>5.6. Арендатор обязан уведомить Арендодателя в случае досрочного закрытия настоящего договора аренды за 3 календарных дня.</p>
  <p>5.7. В случае, если Арендатор не уведомил Арендодателя о досрочном закрытии настоящего договора в установленный срок, Арендатор оплачивает штраф в размере 500 рублей в течение 7 календарных дней.</p>
  <p>5.8. В случае просрочки оплаты штрафа Арендатор уплачивает пени в размере 1% от неоплаченной суммы за каждый день просрочки.</p>

  <h2>6. Страхование</h2>
  <p>6.1. СИМ не застраховано от ущерба и хищения.</p>
  <p>6.2. Ответственность за вред, причинённый третьим лицам при использовании СИМ, несёт Арендатор в соответствии с действующим законодательством.</p>
  <p>6.3. При необходимости Арендатор вправе организовать страхование СИМ от хищения и механических повреждений с обязательным уведомлением Арендодателя.</p>

  <h2>7. Форс-мажор</h2>
  <p>7.1. Стороны освобождаются от ответственности за неисполнение обязательств, если оно вызвано обстоятельствами непреодолимой силы, подтверждёнными документально. К обстоятельствам непреодолимой силы относятся: стихийные бедствия, военные действия, террористические акты, действия органов власти, препятствующие исполнению обязательств.</p>
  <p>7.2. Сторона, для которой создалась невозможность исполнения обязательств, кроме обстоятельств, с прописанными сроками, обязана в течение 24 часов уведомить об этом другую сторону в письменной форме.</p>

  <h2>8. Разрешение споров</h2>
  <p>8.1. Споры и разногласия решаются путём переговоров. Для этого сторона направляет другой стороне письменную досудебную претензию по электронной почте или почтовым отправлением. Сторона, получившая претензию, обязана рассмотреть её и направить ответ в течение 10 календарных дней с момента получения.</p>
  <p>8.2. При недостижении согласия спор передаётся в районный суд по месту нахождения Арендодателя.</p>

  <h2>9. Заключительные положения</h2>
  <p>9.1. Договор составлен в двух экземплярах, по одному для каждой стороны, имеющих равную юридическую силу.</p>
  <p>9.2. Изменения и дополнения к договору действительны как в письменной форме, так и в виде нового договора, подписанные обеими сторонами.</p>
  <p>9.3. Приложения к договору, являющиеся его неотъемлемой частью:</p>
  <ul>
    <li>Акт приёма-передачи СИМ (Приложение № 1);</li>
    <li>Правила и инструкция по эксплуатации (Приложение № 2);</li>
    <li>Перечень комплектации и оборудования с указанием стоимости (Приложение № 4);</li>
    <li>График платежей (Приложение №5);</li>
    <li>График технического осмотра (Приложение №6).</li>
  </ul>

  <h2>10. Реквизиты и подписи сторон</h2>
  <div class="sign">
    <div><b>Арендодатель</b><br>
      ФИО: Жиров Сергей Константинович<br>
      Паспорт: 40 22 166316, 780-034<br>
      Выдан: ГУ МВД по СПб и ЛО, 27.06.2022<br>
      Адрес регистрации: г. Нефтеюганск, мкр. 2-й, д. 11, кв. 110<br>
      Контактный телефон: +7 (950) 500-09-77<br>
      E-mail: endurance@enseal.ru<br><br>
      Подпись: ______________ / Жиров С.К. /
    </div>
    <div><b>Арендатор</b><br>
      ФИО: ${cl_?.name||'_______________________'}<br>
      Паспорт: ${cl_?.passport||'____________'}<br>
      Адрес регистрации: _______________________<br>
      Контактный телефон: ${cl_?.phone||'____________'}<br>
      E-mail: _______________________<br><br>
      Подпись: ______________ / ${cl_?.name?cl_.name.split(' ')[0]:'ФИО'} /
    </div>
  </div>
  <script>setTimeout(()=>{try{window.print()}catch(e){}},300)<\/script>
  </body></html>`;
  const w_=window.open('','_blank');
  w_.document.write(html);
  w_.document.close();
}

/* ============================================================
   СТАРТ
   ============================================================ */
go();