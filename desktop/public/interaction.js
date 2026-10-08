'use strict';
// Typography, toolbar distribution and functional terminal pages.
const terminalUI={active:null,logFilter:'',alerts:[],alertId:1};
$('#toolbar [data-action="connection"] svg').setAttribute('viewBox','0 0 45 21');
$('#toolbar [data-action="messages"] svg').setAttribute('viewBox','0 0 23 21');
$('#toolbar [data-action="integration:community"]').title='MQL5.community · LVL';
const extraPane=document.createElement('div');extraPane.id='extraTerminal';extraPane.hidden=true;$('#terminalTable').append(extraPane);
const footerIcon=(name)=>'<svg viewBox="0 0 21 21" aria-hidden="true">'+nativeIcons[name]+'</svg>';
for(const [cmd,icon,label]of [['market','store','Маркет'],['signals','signals','Сигналы'],['vps','vps','VPS'],['tester','tester','Тестер']]){const b=$('.footer-services [data-action="integration:'+cmd+'"]');b.innerHTML=footerIcon(icon)+'<span>'+label+'</span>';b.title=label}
function openTerminalPage(name){terminalUI.active=name;$('#tableScroll').hidden=true;extraPane.hidden=false;renderTerminalPage();syncTerminalTabs()}
function syncTerminalTabs(){$$('footer>button').forEach(b=>b.classList.toggle('active',terminalUI.active?b.dataset.action==='terminal-section:'+terminalUI.active:b.dataset.tab===state.tab))}
function logRows(){return sim.log.filter(x=>(x.message+' '+date(x.time)).toLowerCase().includes(terminalUI.logFilter.toLowerCase()))}
function renderTerminalPage(){const name=terminalUI.active;if(!name)return;if(name==='Журнал'||name==='Эксперты'){extraPane.innerHTML='<div class="terminal-page-tools"><label>Фильтр <input id="journalFilter" placeholder="Поиск по сообщениям"></label><button id="journalExport">Сохранить журнал</button><span>'+sim.log.length+' событий</span></div><div class="terminal-grid log-grid"><div class="terminal-grid-head"><span>Время</span><span>Источник</span><span>Сообщение</span></div><div id="logRows"></div></div>';$('#journalFilter').value=terminalUI.logFilter;const fill=()=>{$('#logRows').innerHTML=logRows().map(x=>'<div class="terminal-grid-row"><span>'+date(x.time)+'</span><span>Terminal</span><span>'+esc(x.message)+'</span></div>').join('')||'<div class="terminal-empty">Нет событий по выбранному фильтру</div>'};$('#journalFilter').oninput=()=>{terminalUI.logFilter=$('#journalFilter').value;fill()};$('#journalExport').onclick=()=>downloadText('terminal.log',logRows().map(x=>date(x.time)+'\t'+x.message).join('\r\n'),'text/plain');fill();return}
if(name==='Активы'){const floating=positions.reduce((a,p)=>a+profit(p),0);extraPane.innerHTML='<div class="terminal-grid assets-grid"><div class="terminal-grid-head"><span>Актив</span><span>Объем</span><span>Курс</span><span>Стоимость</span></div><div class="terminal-grid-row"><span>EUR</span><span>'+fmt(sim.balance)+'</span><span>1.00000</span><span>'+fmt(sim.balance)+'</span></div></div><div class="assets-summary">Баланс: '+fmt(sim.balance)+' EUR　 Плавающий результат: '+fmt(floating)+'　 Средства: '+fmt(sim.balance+floating)+'</div>';return}
if(name==='Алерты'){extraPane.innerHTML='<div class="terminal-page-tools"><button id="newAlert">Создать</button><span>Локальные уведомления по демонстрационным котировкам</span></div><div class="terminal-grid alerts-grid"><div class="terminal-grid-head"><span>Состояние</span><span>Символ</span><span>Условие</span><span>Значение</span><span>Действие</span></div>'+terminalUI.alerts.map(a=>'<div class="terminal-grid-row"><span>'+(a.fired?'Сработал':'Ожидание')+'</span><span>'+a.symbol+'</span><span>Bid '+esc(a.operator)+'</span><span>'+px(a.price,a.symbol)+'</span><span><button data-remove-alert="'+a.id+'">Удалить</button></span></div>').join('')+'</div>';$('#newAlert').onclick=createAlert;return}
const headers={Новости:['Время','Категория','Тема'],Почта:['Время','От','Тема'],Календарь:['Время','Валюта','Событие','Факт','Прогноз'],Компания:['Время','Тема'],Статьи:['Название','Автор','Дата'],Библиотека:['Название','Тип','Автор']};const h=headers[name]||['Время','Источник','Сообщение'];extraPane.innerHTML='<div class="terminal-grid"><div class="terminal-grid-head" style="grid-template-columns:repeat('+h.length+',1fr)">'+h.map(x=>'<span>'+x+'</span>').join('')+'</div></div><div class="terminal-empty">'+esc(name)+': источник данных не подключен</div>'}
function downloadText(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:type+';charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function createAlert(){modal('Алерт','<label>Символ <select id="alertSymbol">'+marketRows.map(r=>'<option '+(r.symbol===state.symbol?'selected':'')+'>'+r.symbol+'</option>').join('')+'</select></label><label>Условие <select id="alertOperator"><option value=">">Bid &gt;</option><option value="<">Bid &lt;</option></select></label><label>Значение <input id="alertPrice" type="number" min="0" step="0.00001" value="'+px(state.bid)+'"></label><div id="alertError"></div><button type="button" id="saveAlert">Создать</button>');$('#saveAlert').onclick=()=>{const price=+$('#alertPrice').value;if(!Number.isFinite(price)||price<=0){$('#alertError').textContent='Введите положительную цену';return}terminalUI.alerts.push({id:terminalUI.alertId++,symbol:$('#alertSymbol').value,operator:$('#alertOperator').value,price,fired:false});$('#dialog').close();audit('Создан алерт');renderTerminalPage()}}
const beforeUITables=table;table=function(){beforeUITables();if(terminalUI.active){$('#tableScroll').hidden=true;syncTerminalTabs();if(terminalUI.active==='Активы')renderTerminalPage()}};
const beforeUIAudit=audit;audit=function(message){beforeUIAudit(message);if(terminalUI.active==='Журнал'||terminalUI.active==='Эксперты'){const input=$('#journalFilter'),focused=document.activeElement===input,start=input?.selectionStart;renderTerminalPage();if(focused){$('#journalFilter').focus();$('#journalFilter').setSelectionRange(start,start)}}};
const beforeUIQuote=quote;quote=function(bid,ask){beforeUIQuote(bid,ask);if(!Number.isFinite(bid)||!Number.isFinite(ask)||ask<bid)return;for(const a of terminalUI.alerts)if(!a.fired&&a.symbol===state.symbol&&(a.operator==='>'?bid>a.price:bid<a.price)){a.fired=true;audit('Алерт: '+a.symbol+' Bid '+a.operator+' '+px(a.price,a.symbol));if(terminalUI.active==='Алерты')renderTerminalPage()}};terminalAPI.setQuote=quote;
function objectManager(){modal('Объекты — '+state.symbol+','+state.tf,'<div class="object-list">'+(state.lines.length?state.lines.map((l,i)=>'<div class="object-row"><span>'+esc(({horizontal:'Горизонтальная линия',vertical:'Вертикальная линия',trend:'Трендовая линия',channel:'Равноудаленный канал',fibonacci:'Линии Фибоначчи',text:'Текст'})[l.type]||l.type)+' '+(i+1)+'</span><button type="button" data-edit-object="'+i+'">Свойства</button><button type="button" data-delete-object="'+i+'">Удалить</button></div>').join(''):'На графике нет объектов.')+'</div>');$$('[data-edit-object]').forEach(b=>b.onclick=()=>editObject(+b.dataset.editObject));$$('[data-delete-object]').forEach(b=>b.onclick=()=>{state.lines.splice(+b.dataset.deleteObject,1);state.selectedLine=-1;$('#dialog').close();objectManager();draw();audit('Графический объект удален')})}
function editObject(i){const l=state.lines[i];$('#dialog').close();const rayField=l.type==='trend'?'<label><input id="objectRay" type="checkbox"'+(l.ray?' checked':'')+'> Луч (продлить на весь график)</label>':'';modal('Свойства объекта','<label>Цвет <input id="objectColor" type="color" value="'+l.color+'"></label><label>Цена 1 <input id="objectP1" type="number" step="0.00001" value="'+l.p1+'"></label><label>Цена 2 <input id="objectP2" type="number" step="0.00001" value="'+l.p2+'"></label><label>Текст <input id="objectText"></label>'+rayField+'<button type="button" id="saveObject">OK</button>');$('#objectText').value=l.text||'';$('#saveObject').onclick=()=>{const p1=+$('#objectP1').value,p2=+$('#objectP2').value;if(!Number.isFinite(p1)||!Number.isFinite(p2))return;const ray=$('#objectRay')?$('#objectRay').checked:l.ray;Object.assign(l,{p1,p2,color:$('#objectColor').value,text:$('#objectText').value,ray});$('#dialog').close();draw();audit('Свойства графического объекта изменены')}}
const beforeUIAction=action;action=function(cmd,e){if(cmd.startsWith('terminal-section:')){openTerminalPage(cmd.slice(17));return}if(cmd==='objects'){objectManager();return}beforeUIAction(cmd,e);if(['bars','candles','line','horizontal','vertical','trend','channel','fibonacci','text'].includes(cmd)||cmd.startsWith('tf:'))audit('График '+state.symbol+': '+cmd)};
document.addEventListener('click',e=>{if(e.target.closest('[data-tab]')){terminalUI.active=null;$('#tableScroll').hidden=false;extraPane.hidden=true;syncTerminalTabs()}const remove=e.target.closest('[data-remove-alert]');if(remove){terminalUI.alerts=terminalUI.alerts.filter(a=>a.id!==+remove.dataset.removeAlert);renderTerminalPage()}},true);
const beforeDrawFinish=canvas.onpointerup;canvas.onpointerup=e=>{const created=drag?.kind==='new',type=drag?.l?.type;beforeDrawFinish(e);if(created)audit('Добавлен графический объект: '+type)};
// Preserve active terminal page when an order is placed or closed by the simulator.
window.addEventListener('terminal:order',()=>{terminalUI.active=null;extraPane.hidden=true;$('#tableScroll').hidden=false;syncTerminalTabs()});
const beforeDrawKeyboard=document.onkeydown;document.onkeydown=e=>{const had=state.selectedLine>=0&&e.key==='Delete';beforeDrawKeyboard(e);if(had)audit('Выбранный графический объект удален')};
audit('Интерфейс: журнал и рабочие панели инициализированы');
// Native-like chart axes and enabled background grid.
state.grid=true;state.priceScale=1;
let axisDrag=null;
const axisDown=canvas.onpointerdown,axisMove=canvas.onpointermove,axisUp=canvas.onpointerup,axisDouble=canvas.ondblclick,axisWheel=canvas.onwheel;
canvas.onpointerdown=e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(x>=view.pw||y>=view.ph){axisDrag={type:x>=view.pw?'price':'time',x:e.clientX,y:e.clientY,scale:state.priceScale,zoom:state.zoom};canvas.setPointerCapture(e.pointerId);e.preventDefault();return}axisDown(e)};
canvas.onpointermove=e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;canvas.style.cursor=x>=view.pw?'ns-resize':y>=view.ph?'ew-resize':state.tool==='cursor'?'default':'crosshair';if(axisDrag){if(axisDrag.type==='price')state.priceScale=Math.max(.15,Math.min(8,axisDrag.scale*Math.exp((e.clientY-axisDrag.y)/150)));else state.zoom=Math.max(.25,Math.min(8,axisDrag.zoom*Math.exp((e.clientX-axisDrag.x)/200)));draw();paintMiniCharts();return}axisMove(e)};
canvas.onpointerup=e=>{if(axisDrag){axisDrag=null;return}axisUp(e)};canvas.onpointercancel=()=>{axisDrag=null;drag=null};
canvas.ondblclick=e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(x>=view.pw){state.priceScale=1;draw();return}if(y>=view.ph){state.zoom=1;state.offset=0;draw();return}axisDouble(e)};
canvas.onwheel=e=>{const r=canvas.getBoundingClientRect();if(e.clientX-r.left>=view.pw){e.preventDefault();state.priceScale=Math.max(.15,Math.min(8,state.priceScale*(e.deltaY>0?1.15:1/1.15)));draw();return}axisWheel(e)};
const axisDraw=draw;draw=function(){axisDraw();if(!view||!mouse||!state.cross||mouse.x>view.pw||mouse.y>view.ph)return;const p=coord(mouse.x,mouse.y),label=px(p.p),time=new Date(p.t).toISOString().replace('T',' ').slice(0,16);ctx.font='11px Arial';ctx.fillStyle=state.dark?'#e0e0e0':'#444';ctx.fillRect(view.pw,Math.max(0,Math.min(view.ph-15,mouse.y-7)),view.w-view.pw,15);ctx.fillStyle=state.dark?'#111':'white';ctx.fillText(label,view.pw+2,Math.max(11,Math.min(view.ph-3,mouse.y+4)));const width=ctx.measureText(time).width+8,x=Math.max(0,Math.min(view.pw-width,mouse.x-width/2));ctx.fillStyle=state.dark?'#e0e0e0':'#444';ctx.fillRect(x,view.ph+1,width,20);ctx.fillStyle=state.dark?'#111':'white';ctx.fillText(time,x+4,view.ph+15)};
canvas.title='Перетащите график для прокрутки. Шкала цены справа: вертикальный масштаб. Шкала времени снизу: горизонтальный масштаб. Двойной щелчок по шкале — сброс.';
sync();draw();
// Window controls are geometric icons, not font-dependent characters.
for(const [selector,path]of [['.window-controls [data-action="collapse"],.chart-controls [data-action="chart-collapse"]','M1 5h8'],['.window-controls [data-action="fullscreen"],.chart-controls [data-action="chart-max"]','M1.5 1.5h7v7h-7z'],['.window-controls [data-action="window-close"],.chart-controls [data-action="chart-close"]','M1 1l8 8M9 1L1 9']]){$$(selector).forEach(b=>b.innerHTML='<svg viewBox="0 0 10 10" aria-hidden="true"><path d="'+path+'"/></svg>')}

// The desktop terminal puts the symbol caption inside the chart, not in a
// separate title strip. Keep its tiny chart/trading icons geometric so they
// do not vary with the installed font.
const symbolDescriptions={
  EURUSDrfd:'Euro vs US Dollar',
  GBPUSDrfd:'Great Britain Pound vs US Dollar',
  USDCHFrfd:'US Dollar vs Swiss Franc',
  USDJPYrfd:'US Dollar vs Yen',
  USDCNHrfd:'US Dollar vs Chinese Yuan',
  AUDUSDrfd:'Australian Dollar vs US Dollar',
  NZDUSDrfd:'New Zealand Dollar vs US Dollar',
  USDRUBrfd:'US Dollar vs Russian Ruble'
};
const chartHud=document.createElement('div');
chartHud.id='chartHud';
chartHud.innerHTML='<svg class="hud-market" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="2" width="14" height="12" fill="#f7fbff" stroke="#2b759f"/><path d="M3 5h9M3 8h9M3 11h6" stroke="#2b759f"/><path d="M1 2h14v3H1z" fill="#df4d49" stroke="none"/></svg><svg class="hud-trade" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h5v5H2zM9 8h5v5H9z" fill="#e8f7ef" stroke="#297aa1"/><path d="M5 12L12 4M9 4h3v3" fill="none" stroke="#d33b35"/></svg><span id="chartHudText"></span>';
$('#chart').append(chartHud);

// Rebuild the one-click panel to match MT5's five-cell geometry.
$('#quick').innerHTML='<div class="quick-head"><button type="button" id="quickSellLabel">SELL</button><div class="volume-control"><button type="button" data-volume-step="down" aria-label="Уменьшить объем">▼</button><input id="volume" aria-label="Объем сделки" type="number" min="0.01" max="100" step="0.01" value="0.01"><button type="button" data-volume-step="up" aria-label="Увеличить объем">▲</button></div><button type="button" id="quickBuyLabel">BUY</button></div><div class="quotes"><button id="sell" title="Продать по рынку (демо)"></button><button id="buy" title="Купить по рынку (демо)"></button></div>';

function updateChartHud(){
  $('#chart').dataset.dark=String(!!state.dark);
  const description=symbolDescriptions[state.symbol]||state.symbol;
  $('#chartHudText').textContent=state.symbol+','+state.tf+': '+description;
}
function stepQuickVolume(direction){
  const input=$('#volume'),step=Number(input.step)||0.01;
  const next=Math.max(Number(input.min)||step,Math.min(Number(input.max)||100,(Number(input.value)||step)+direction*step));
  input.value=next.toFixed(2);
  input.dispatchEvent(new Event('change',{bubbles:true}));
}
document.addEventListener('click',event=>{
  const step=event.target.closest('[data-volume-step]');
  if(step)stepQuickVolume(step.dataset.volumeStep==='up'?1:-1);
  if(event.target.closest('#quickSellLabel'))$('#sell').click();
  if(event.target.closest('#quickBuyLabel'))$('#buy').click();
});

// Rebind handlers because the original buttons were replaced above.
$('#sell').onclick=()=>trade('sell');
$('#buy').onclick=()=>trade('buy');

const hudSync=sync;
sync=function(){hudSync();updateChartHud()};
const hudQuoteLabels=quoteLabels;
quoteLabels=function(){
  const render=n=>{
    const raw=px(n),cut=raw.length-3;
    const prefix=raw.slice(0,cut).replace(/\.$/,'');
    return '<span class="price-prefix">'+prefix+'</span><strong>'+raw.slice(cut,-1)+'</strong><sup>'+raw.slice(-1)+'</sup>';
  };
  $('#sell').innerHTML=render(state.bid);
  $('#buy').innerHTML=render(state.ask);
};

state.dark=false;
sync();
draw();
updateChartHud();
quoteLabels();
