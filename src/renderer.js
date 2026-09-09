'use strict';
const api=window.workAlarm,root=document.querySelector('#app'),modal=document.querySelector('#modal');
const view=new URLSearchParams(location.search).get('view')||'panel';
document.body.className=view;
let state,tab='today',filter='all',bubbleTimer,dragTimer,dragOrigin,moved=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration=minutes=>{const n=Math.max(0,Math.ceil(minutes));return n>=60?`${Math.floor(n/60)} 小时${n%60?` ${n%60} 分`:''}`:`${n} 分钟`;};
const clock=minutes=>{const n=((Math.floor(minutes)%1440)+1440)%1440;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
const dateFor=minutes=>{const d=new Date(`${state.baseDate}T00:00:00`);d.setMinutes(minutes);return d;};
const dateLabel=()=>dateFor(state.now).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
function deadline(n){if(n==null)return '待确认截止时间';const diff=Math.floor(n/1440)-Math.floor(state.now/1440);return `${diff===0?'今天':diff===1?'明天':dateFor(n).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})} ${clock(n)}`;}
function inputDate(n){if(n==null)return '';const d=dateFor(n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${clock(n)}`;}
function parseDate(text){return text?(new Date(text)-new Date(`${state.baseDate}T00:00:00`))/60000:null;}
const icons={home:'⌂',tasks:'☷',messages:'▱',calendar:'▦',settings:'⚙'};
function robot(size=140){return `<svg class="robot-svg" width="${size}" height="${size}" viewBox="0 0 180 180" role="img" aria-label="小时机器人"><ellipse class="robot-shadow" cx="90" cy="166" rx="43" ry="7" fill="#142f38" opacity=".10"/><g class="robot-float"><path d="M90 26V15" stroke="#234650" stroke-width="5" stroke-linecap="round"/><circle class="antenna" cx="90" cy="12" r="7" fill="#f08054"/><g class="arm left"><rect x="20" y="75" width="18" height="40" rx="9" fill="#bad5d1"/><path d="M26 81v20" stroke="#eff8ee" stroke-width="3" stroke-linecap="round"/></g><g class="arm right"><rect x="142" y="75" width="18" height="40" rx="9" fill="#bad5d1"/></g><rect x="49" y="143" width="27" height="16" rx="7" fill="#234650"/><rect x="105" y="143" width="27" height="16" rx="7" fill="#234650"/><rect x="36" y="30" width="108" height="119" rx="34" fill="#e7eee2" stroke="#b7d0c6" stroke-width="2"/><path d="M47 59c0-13 10-21 24-21h38" stroke="#fffdf4" stroke-width="7" stroke-linecap="round" fill="none"/><rect x="45" y="58" width="90" height="62" rx="22" fill="#153c46"/><path d="M55 68h31" stroke="#2d5860" stroke-width="4" stroke-linecap="round"/><g class="eyes"><rect x="61" y="78" width="12" height="20" rx="6" fill="#a7ead8"/><rect x="107" y="78" width="12" height="20" rx="6" fill="#a7ead8"/></g><path class="mouth" d="M83 104q7 7 14 0" fill="none" stroke="#a7ead8" stroke-width="3" stroke-linecap="round"/><circle cx="90" cy="134" r="7" fill="#f08054"/><path d="M87 134h6" stroke="#fff8ed" stroke-width="2" stroke-linecap="round"/></g></svg>`;}
function toast(text){const t=document.querySelector('#toast');t.textContent=text;t.classList.add('visible');setTimeout(()=>t.classList.remove('visible'),3500);}
async function act(action){const result=await api.action(action);if(!result.ok)toast(result.error||'操作未完成');return result;}
function showBubble(text){const el=document.querySelector('#bubble');if(!el)return;el.textContent=text;el.classList.add('visible');clearTimeout(bubbleTimer);bubbleTimer=setTimeout(()=>el.classList.remove('visible'),12000);}
function renderPet(){
  if(!document.querySelector('#pet-button')){
    root.innerHTML=`<div class="pet-wrap"><button id="bubble" class="bubble" aria-label="查看工作更新"></button><button id="pet-button" class="pet-zone" aria-label="小时机器人，点击打开工作台，拖动改变位置">${robot(164)}<span class="pet-name"><i></i> 小时 · 待命中</span></button></div>`;
    const pet=document.querySelector('#pet-button');
    pet.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();pet.setPointerCapture(event.pointerId);dragOrigin={x:event.screenX,y:event.screenY};moved=false;api.dragStart(dragOrigin);});
    pet.addEventListener('pointermove',event=>{if(!dragOrigin)return;if(Math.abs(event.screenX-dragOrigin.x)+Math.abs(event.screenY-dragOrigin.y)>5)moved=true;if(moved)api.dragMove({x:event.screenX,y:event.screenY});});
    pet.addEventListener('pointerup',event=>{if(dragOrigin&&Math.abs(event.screenX-dragOrigin.x)+Math.abs(event.screenY-dragOrigin.y)>5){moved=true;api.dragMove({x:event.screenX,y:event.screenY});}api.dragEnd();dragOrigin=null;});
    pet.addEventListener('click',()=>{if(!moved)act({type:'open-panel'});moved=false;});
    pet.addEventListener('pointercancel',()=>{clearInterval(dragTimer);api.dragEnd();dragOrigin=null;});
    document.querySelector('#bubble').addEventListener('click',()=>act({type:'open-panel'}));
    document.addEventListener('mousemove',event=>api.pointer(!!event.target.closest('.pet-zone,.bubble.visible')));
    document.addEventListener('mouseleave',()=>{if(!dragOrigin)api.pointer(false);});
  }
  const active=state.tasks.find(t=>t.status==='active'),unread=state.alerts.filter(a=>!a.read);
  const mode=unread.some(a=>a.type!=='messages')?'alert':active?'focus':state.tasks.every(t=>t.status==='done')?'happy':'idle';
  document.querySelector('.pet-wrap').dataset.mode=mode;
  document.querySelector('.pet-name').innerHTML=`<i></i> 小时 · ${mode==='alert'?'有事提醒你':active?'陪你专注中':mode==='happy'?'今天辛苦啦':'待命中'}`;
}
function taskRow(task){
  const row=state.plan.rows.find(r=>r.id===task.id),left=Math.max(0,task.estimate-task.spent),active=task.status==='active',finished=task.status==='done';
  const status={active:'正在进行',todo:'待开始',waiting:'等待资料',done:'已完成'}[task.status];
  return `<article class="task-row ${active?'active':''} ${finished?'finished':''}" data-task="${esc(task.id)}">
    <button class="check ${finished?'checked':''}" data-action="complete" data-id="${esc(task.id)}" aria-label="完成 ${esc(task.title)}" ${finished?'disabled':''}>${finished?'✓':''}</button>
    <div class="task-content"><div class="task-heading"><button class="task-title" data-action="edit" data-id="${esc(task.id)}" ${finished?'disabled':''}>${esc(task.title)}</button>${task.must?'<span class="tag must">今日必做</span>':''}</div>
    <div class="task-meta"><span>${esc(task.source)}</span><b class="${row?.late?'danger-text':''}">${deadline(task.deadline)}</b><span>${finished?'已投入':'还需'} ${duration(finished?task.spent:left)}</span></div>
    ${active?`<div class="task-progress"><span style="width:${Math.min(100,task.spent/task.estimate*100)}%"></span></div><div class="active-caption">● 已投入 ${duration(task.spent)}${!state.plan.workTime?' · 休息 / 会议时段，计时暂不累计':''}</div>`:''}
    ${row?.late&&!finished?`<div class="risk-caption">${task.status==='waiting'?'即使资料现在到达，':''}预计 ${deadline(row.end)} 完成，可能延误</div>`:''}
    ${task.status==='waiting'?'<div class="waiting-caption">资料未到，完成时间暂不能保证</div>':''}
    </div><div class="task-controls"><span class="status ${task.status}">${status}</span>${!finished?`<button class="${active?'pause-btn':'start-btn'}" data-action="${left<=0?'remaining':active?'pause':'start'}" data-id="${esc(task.id)}">${left<=0?'补工时':active?'Ⅱ 暂停':'▶ 开始'}</button><button class="more-btn" data-action="edit" data-id="${esc(task.id)}" aria-label="编辑任务">···</button>`:''}</div></article>`;
}
function taskList(){
  let tasks=state.tasks.filter(t=>filter==='done'?t.status==='done':filter==='waiting'?t.status==='waiting':t.status!=='done');
  const order=state.plan.rows.map(t=>t.id);tasks.sort((a,b)=>(order.indexOf(a.id)<0?999:order.indexOf(a.id))-(order.indexOf(b.id)<0?999:order.indexOf(b.id)));
  return `<div class="section-heading"><h2>我的任务 <span>${tasks.length}</span></h2><div class="segmented">${[['all','待完成'],['waiting','等待中'],['done','已完成']].map(([id,label])=>`<button data-filter="${id}" class="${filter===id?'selected':''}">${label}</button>`).join('')}</div></div><div class="task-list">${tasks.length?tasks.map(taskRow).join(''):'<div class="empty">这里暂时没有任务。<br><small>让小时帮你守住下一段专注时间。</small></div>'}</div>`;
}
function messageCard(message){return `<button class="message-card" data-action="message" data-id="${esc(message.id)}"><div class="message-top"><span class="source-dot ${message.source.includes('邮箱')?'mail':''}">${message.source.includes('邮箱')?'✉':'▰'}</span><span>${esc(message.sender)}</span><time>${clock(message.at)}</time></div><strong>${esc(message.title)}</strong><p>${esc(message.body)}</p><span class="message-status ${message.status}">${{pending:'待你确认 →',info:'资料已到 · 查看 →',confirmed:'已确认',dismissed:'已处理',queued:'将在下次检查时接收'}[message.status]}</span></button>`;}
function inbox(compact=false){
  const messages=state.messages.filter(m=>m.status!=='queued'),pending=messages.filter(m=>['pending','info'].includes(m.status));
  return `<div class="section-heading"><h2>${compact?'工作消息':'消息收件箱'} <span>${pending.length}</span></h2>${compact?'<button class="text-button" data-tab="messages">全部 →</button>':''}</div>
    <div class="inbox-list">${(compact?pending.slice(0,3):messages).map(messageCard).join('')||`<div class="empty inbox-empty"><span>▱</span><strong>暂时没有新消息</strong><small>指定的邮箱、联系人与群<br>每半小时合并检查一次</small></div>`}</div>
    <div class="poll-info"><i></i> 下次检查 ${clock(state.lastPoll+30)}<button class="text-button" data-action="poll">立即检查</button></div>`;
}
function timeline(){
  const day=Math.floor(state.now/1440)*1440,start=day+540,end=day+1080;
  const blocks=[{title:'午休',start:day+720,end:day+780,type:'break'},...state.meetings.filter(m=>m.end>start&&m.start<end).map(m=>({...m,type:'meeting'}))];
  return `<div class="timeline-card"><div class="timeline-heading"><h3>今天的时间地图</h3><span><i class="legend work"></i> 工作时段 <i class="legend meeting"></i> 会议 <i class="legend break"></i> 午休</span></div><div class="time-labels">${[9,10,11,12,13,14,15,16,17,18].map(h=>`<span>${h}:00</span>`).join('')}</div><div class="timeline-track">${blocks.map(b=>`<span class="time-block ${b.type}" style="left:${Math.max(0,(b.start-start)/540*100)}%;width:${Math.min(end-b.start,b.end-b.start)/540*100}%" title="${esc(b.title)} ${clock(b.start)}–${clock(b.end)}">${esc(b.title)}</span>`).join('')}${state.now>=start&&state.now<=end?`<div class="now-marker" style="left:${(state.now-start)/540*100}%"><i></i></div>`:''}</div></div>`;
}
function today(){
  const p=state.plan,recommended=state.tasks.find(t=>t.id===p.recommendation),row=p.rows.find(t=>t.id===recommended?.id);
  const atRisk=p.gap>0||p.late.length>0,conditional=p.waiting>0||p.unknown>0||p.needsEstimate>0;
  return `<div class="greeting"><div><p class="eyebrow">MAKE ROOM FOR WHAT MATTERS</p><h1>把时间，留给重要的事。</h1><p class="subtitle">${dateLabel()} <span>／</span> 小时陪你，有序完成今天。</p></div><div class="greeting-robot">${robot(112)}</div></div>
  <div class="stats"><div class="stat"><span>今天剩余可用</span><strong>${duration(p.capacity)}</strong><small>已扣除午休和会议</small></div><div class="stat"><span>今天需完成的工作</span><strong>${duration(p.required)}</strong><small>含等待中的到期任务 · 按剩余估时</small></div><div class="stat ${atRisk?'risk':'safe'}"><span>按时完成的可能性</span><strong>${p.gap>0?`缺口 ${duration(p.gap)}`:p.late.length?'有任务可能延误':conditional?'需要确认条件':'按当前估时可完成'}</strong><small>${atRisk?'请查看受影响任务，调整安排':conditional?`${p.waiting} 项等待资料 · ${p.unknown} 项待定截止 · ${p.needsEstimate} 项待补工时`:'时间够用，按计划慢慢来'}</small></div></div>
  <div class="next-card"><div class="next-icon">${recommended?.status==='active'?'◉':'↗'}</div><div class="next-copy"><div class="eyebrow">${recommended?.status==='active'?'FOCUS IN PROGRESS · 正在专注':'NEXT UP · 现在建议做'}</div><h2>${recommended?esc(recommended.title):'暂时没有可开始的任务'}</h2><p>${recommended?`${deadline(recommended.deadline)} 前交付 <span>·</span> 还需 ${duration(Math.max(0,recommended.estimate-recommended.spent))}${row?` <span>·</span> 最晚 ${deadline(row.latestStart)} 开始`:''}`:'检查待确认消息，或等待对方提供资料。'}</p></div>${recommended?`<button class="primary" data-action="${recommended.status==='active'?'pause':'start'}" data-id="${esc(recommended.id)}">${recommended.status==='active'?'Ⅱ 暂停一下':'▶ 开始专注'}</button>`:''}</div>
  ${!p.workTime?'<div class="inline-note">当前是休息、会议或非工作时段。开始任务后，工作计时会在可用时段累计。</div>':''}
  ${timeline()}<div class="dashboard-columns"><section>${taskList()}</section><aside>${inbox(true)}</aside></div>`;
}
function schedule(){
  return `<div class="page-title"><p class="eyebrow">YOUR TIME, ACCOUNTED FOR</p><h1>时间安排</h1><p>按任务顺序模拟执行，并逐项检查截止时间。</p></div>${timeline()}<div class="schedule-columns"><section><div class="section-heading"><h2>预计执行顺序</h2><small>可在任务详情中调整先后</small></div>${state.plan.rows.map((r,i)=>`<div class="schedule-row"><span class="number">${i+1}</span><div><strong>${esc(r.title)}</strong><p>${deadline(r.start)} → ${deadline(r.end)}</p><small>${r.conditional?'等待资料 · 以下是假设资料立即到达的安排':`最晚开始：${deadline(r.latestStart)}`}</small></div><span class="tag ${r.late?'late':'ok'}">${r.late?'可能延误':'估时内可完成'}</span></div>`).join('')}</section><aside><div class="section-heading"><h2>会议与休息</h2><button class="text-button" data-action="meeting">＋ 添加</button></div><div class="meeting-row"><strong>☕ 午休</strong><span>每天 12:00–13:00</span></div>${state.meetings.map(m=>`<div class="meeting-row"><strong>${esc(m.title)}</strong><span>${deadline(m.start)}–${clock(m.end)}</span><button class="text-button" data-action="remove-meeting" data-id="${esc(m.id)}">移除</button></div>`).join('')}<p class="helper">09:00–18:00 工作，周末不排期。会议重叠时只扣除一次。等待中的任务仍占用所需工作量。</p></aside></div>`;
}
function settings(){return `<div class="page-title"><p class="eyebrow">A LITTLE COMPANION, YOUR WAY</p><h1>提醒与演示</h1><p>把提醒调成适合你的方式。</p></div><div class="settings-card"><h2>关键时刻，叫你一声</h2><label class="switch-row"><div><strong>提示音</strong><p>重要提醒时播放一声提示音</p></div><input type="checkbox" id="sound" ${state.settings.sound?'checked':''}></label><label class="switch-row"><div><strong>中文语音</strong><p>使用系统语音播报提醒，无需模型账号</p></div><input type="checkbox" id="voice" ${state.settings.voice?'checked':''}></label><div class="switch-row"><div><strong>置顶提醒窗口</strong><p>显示在其他应用前面，不主动抢走键盘焦点</p></div><span class="tag ok">已启用</span></div><button class="primary" data-action="test-alert">试听并测试弹窗</button></div><div class="settings-card"><h2>这是一个本地 Demo</h2><p class="helper">邮箱、飞书消息、会议和初始工时均为预设模拟数据。没有连接真实账号。应用关闭期间不计工作时间，重启后任务保持暂停。</p><p class="helper">工作时间 09:00–18:00，午休 12:00–13:00。最晚开始前 30 分钟提醒，同一提醒只触发一次。电脑睡眠时不保证弹窗，唤醒后补算风险。</p><button class="secondary" data-action="reset-confirm">重置演示数据</button></div>`;}
function renderPanel(){
  const main=document.querySelector('main'),scroll=main?.scrollTop||0;
  const pending=state.messages.filter(m=>['pending','info'].includes(m.status)).length,queued=state.messages.filter(m=>m.status==='queued').length;
  const unread=state.alerts.filter(a=>!a.read).length;
  root.innerHTML=`<div class="app-shell"><nav class="sidebar"><div class="brand"><span class="brand-icon">◉</span><div><strong>工作闹钟</strong><small>YOUR DESKTOP BUDDY</small></div></div><div class="nav-items">${[['today','home','今日工作台'],['tasks','tasks','我的任务'],['messages','messages','工作消息'],['schedule','calendar','时间安排']].map(([id,icon,title])=>`<button class="nav-item ${tab===id?'selected':''}" data-tab="${id}"><span>${icons[icon]}</span>${title}${id==='messages'&&pending?`<b>${pending}</b>`:''}</button>`).join('')}</div><div class="sidebar-bottom"><div class="companion-card">${robot(80)}<strong>一步一步，也很好。</strong><small>我来记时间，你来做重要的事。</small></div><button class="nav-item ${tab==='settings'?'selected':''}" data-tab="settings"><span>⚙</span>提醒与设置</button><div class="local-label"><i></i> 本地运行 · 模拟数据</div></div></nav>
  <div class="workspace"><header class="topbar"><span>${{today:'今日工作台',tasks:'我的任务',messages:'工作消息',schedule:'时间安排',settings:'提醒与设置'}[tab]}</span><div class="topbar-right"><span class="demo-pill">DEMO</span><time>${clock(state.now)}</time><button class="icon-button" data-action="alerts" aria-label="提醒记录">♧${unread?`<i>${unread}</i>`:''}</button></div></header><main>${state.storeError?`<div class="error-banner">${esc(state.storeError)}</div>`:''}${tab==='today'?today():tab==='tasks'?`<div class="page-title"><p class="eyebrow">ONE THING AT A TIME</p><h1>我的任务</h1><p>今天必须完成的优先，同组按截止时间排列。${state.manualOrder.length?'当前已启用手动顺序。':''}</p></div>${taskList()}`:tab==='messages'?`<div class="page-title"><p class="eyebrow">NOTHING IMPORTANT GETS LOST</p><h1>让消息变成行动</h1><p>先确认，再加入计划。对方提出的变更不会自动覆盖你的安排。</p></div>${inbox()}`:tab==='schedule'?schedule():settings()}</main>
  <footer class="demo-bar"><span class="demo-caption"><i></i> 演示控制</span><button data-action="running" title="暂停或继续模拟时钟">${state.running?'Ⅱ 暂停时钟':'▶ 继续时钟'}</button><button data-action="advance" data-minutes="30">＋30 分钟</button><button data-action="jump">跳到 13:00</button><div class="demo-spacer"></div><button class="demo-message" data-action="scenario">＋ 模拟消息${queued?` (${queued} 待检查)`:''}</button><button data-action="meeting">＋ 会议</button></footer></div></div>`;
  document.querySelector('main').scrollTop=scroll;
  for(const id of ['sound','voice'])document.querySelector('#'+id)?.addEventListener('change',()=>act({type:'settings',sound:document.querySelector('#sound').checked,voice:document.querySelector('#voice').checked}));
}
function renderAlert(){
  const alerts=state.alertBatch||[],a=alerts[0];
  root.innerHTML=`<div class="alert-card"><div class="alert-top"><span>◉ 工作闹钟 <b>· 小时提醒</b></span><button data-action="hide" aria-label="关闭提醒">×</button></div><div class="alert-body"><div class="alert-avatar">${robot(86)}</div><span class="eyebrow">TIME TO CHECK IN</span><h1>${esc(a?.title||'有件事想提醒你')}</h1><p>${esc(a?.body||'打开工作台，查看今天的安排。')}</p>${alerts.length>1?`<small>另有 ${alerts.length-1} 项提醒，可在工作台查看</small>`:''}</div><div class="alert-actions"><button class="secondary" data-action="hide">知道了</button><button class="primary" data-action="open-panel">查看工作台 →</button></div></div>`;
}
function render(){if(!state)return;if(view==='pet')renderPet();else if(view==='alert')renderAlert();else renderPanel();}
function dialog(title,body,footer=''){modal.innerHTML=`<div class="modal-heading"><h2>${title}</h2><button type="button" data-close aria-label="关闭">×</button></div>${body}${footer}`;modal.querySelector('[data-close]').onclick=()=>modal.close();if(!modal.open)modal.showModal();}
function taskFields(task){return `<label>任务名称<input name="title" value="${esc(task.title)}" maxlength="160" required></label><div class="form-grid"><label>截止时间<input type="datetime-local" name="deadline" value="${inputDate(task.deadline)}"><small>未明确时留空，向对方确认后填写</small></label><label>预估总工时 / 分钟<input type="number" name="estimate" min="1" max="4800" value="${Math.ceil(task.estimate)}" required><small>演示预设估算，可自行修改</small></label></div><label class="checkbox-label"><input type="checkbox" name="must" ${task.must?'checked':''}>今天必须完成</label>`;}
function formValues(form){return {title:form.elements.title.value,deadline:parseDate(form.elements.deadline.value),estimate:Number(form.elements.estimate.value),must:form.elements.must.checked};}
function editTask(id){
  const task=state.tasks.find(t=>t.id===id);if(!task||task.status==='done')return;
  dialog('任务详情',`<p class="modal-source">${esc(task.source)}</p><p class="task-note">${esc(task.notes)}</p><form id="task-form">${taskFields(task)}<div class="spent-note">已投入 ${duration(task.spent)} · 剩余 ${duration(Math.max(0,task.estimate-task.spent))}<button type="button" class="text-button" id="remaining-button">更新剩余工时</button></div><div class="modal-tools"><button type="button" class="secondary" id="wait-button">${task.status==='waiting'?'恢复为待开始':'标记等待资料'}</button><button type="button" class="secondary" id="up-button">↑ 上移</button><button type="button" class="secondary" id="down-button">↓ 下移</button></div><div class="modal-footer"><button type="button" class="secondary" data-close-form>取消</button><button class="primary" type="submit">保存调整</button></div></form>`);
  const form=document.querySelector('#task-form');
  form.onsubmit=async event=>{event.preventDefault();const r=await act({type:'edit',id,values:formValues(form)});if(r.ok)modal.close();};
  form.querySelector('[data-close-form]').onclick=()=>modal.close();
  document.querySelector('#wait-button').onclick=async()=>{const r=await act({type:task.status==='waiting'?'pause':'wait',id});if(r.ok)modal.close();};
  document.querySelector('#remaining-button').onclick=()=>remainingForm(id);
  document.querySelector('#up-button').onclick=async()=>{await act({type:'reorder',id,direction:-1});toast('已调整同优先级内的顺序');};
  document.querySelector('#down-button').onclick=async()=>{await act({type:'reorder',id,direction:1});toast('已调整同优先级内的顺序');};
}
function remainingForm(id){
  const t=state.tasks.find(t=>t.id===id);if(!t)return;
  dialog('还需要多久？',`<p class="task-note">${esc(t.title)}<br>已投入 ${duration(t.spent)}，请按实际进度更新。</p><form id="remaining-form"><label>剩余工作时间 / 分钟<input name="minutes" type="number" min="1" max="4800" value="30" required autofocus></label><div class="modal-footer"><button class="primary" type="submit">更新剩余工时</button></div></form>`);
  document.querySelector('#remaining-form').onsubmit=async e=>{e.preventDefault();const r=await act({type:'remaining',id,minutes:Number(e.target.elements.minutes.value)});if(r.ok)modal.close();};
}
async function messageDialog(id){
  const m=state.messages.find(m=>m.id===id);if(!m)return;
  const task=state.tasks.find(t=>t.id===m.taskId);
  if(m.status!=='pending'){
    dialog('工作消息',`<p class="modal-source">${esc(m.source)} · ${esc(m.sender)}</p><h3>${esc(m.title)}</h3><p class="task-note">${esc(m.body)}</p><div class="modal-footer"><button class="primary" id="message-done">${m.status==='info'?'已查看':'关闭'}</button></div>`);
    document.querySelector('#message-done').onclick=async()=>{if(m.status==='info')await act({type:'dismiss-message',id});modal.close();};return;
  }
  dialog(m.kind==='new'?'确认新任务':'确认任务变更',`<p class="modal-source">${esc(m.source)} · ${esc(m.sender)}</p><p class="task-note">${esc(m.body)}</p><form id="message-form">${m.kind==='new'?taskFields(m.proposal):`<div class="change-box"><strong>${esc(task?.title)}</strong><p>${m.proposal.deadline!=null?`截止时间：${deadline(task?.deadline)} → <b>${deadline(m.proposal.deadline)}</b>`:`工作量：增加 ${m.proposal.extra} 分钟`}</p></div>`}<div class="impact-box" id="impact">正在计算确认后的影响…</div><div class="modal-footer"><button type="button" class="secondary" id="ignore-message">忽略这次更新</button><button class="primary" type="submit">${m.kind==='new'?'确认并加入任务':'确认变更并重新排期'}</button></div></form>`);
  const form=document.querySelector('#message-form');
  const values=()=>m.kind==='new'?formValues(form):{};
  const update=async()=>{const r=await api.action({type:'preview',id,values:values()});const el=document.querySelector('#impact');if(!el)return;el.innerHTML=r.ok?`<strong>确认后的安排</strong><p>今日需要 ${duration(r.plan.required)} · 可用 ${duration(r.plan.capacity)}</p><p class="${r.plan.gap||r.plan.late.length?'danger-text':''}">${r.plan.gap?`时间缺口 ${duration(r.plan.gap)}`:r.plan.late.length?`${r.plan.late.length} 项任务可能延误`:'按当前估时，已有截止时间的任务可排入计划'}${r.plan.unknown?' · 有任务待确认截止时间':''}</p>`:esc(r.error);};
  form.oninput=update;await update();
  form.onsubmit=async event=>{event.preventDefault();const r=await act({type:'confirm',id,values:values()});if(r.ok)modal.close();};
  document.querySelector('#ignore-message').onclick=async()=>{await act({type:'dismiss-message',id});modal.close();};
}
function scenarioDialog(){
  const choices=[['new','新增任务','市场希望今天补充竞品分析'],['deadline','截止时间提前','老板要求调研结论 16:00 交付'],['scope','补充工作范围','需求分析增加用户分层'],['material','等待的资料到达','客户补充用户使用录屏'],['review','研发完成待验收','修复已完成，安排产品验收'],['unknown','没有明确截止时间','客户提出新的优化想法']];
  dialog('模拟收到一条消息',`<p class="helper">只会加入模拟消息队列。快进 30 分钟，或点击“立即检查”，即可合并接收。</p><div class="scenario-list">${choices.map(([id,title,body])=>`<button data-scenario="${id}"><span>＋</span><div><strong>${title}</strong><small>${body}</small></div><b>→</b></button>`).join('')}</div>`);
  modal.querySelectorAll('[data-scenario]').forEach(button=>button.onclick=async()=>{const r=await act({type:'queue',kind:button.dataset.scenario});if(r.ok){modal.close();toast('已加入模拟队列，等待下次检查');}});
}
function meetingForm(){
  const start=Math.ceil(state.now/15)*15;
  dialog('添加临时会议',`<p class="helper">会议会占用可用工作时间，并立即重新计算任务风险。</p><form id="meeting-form"><label>会议名称<input name="title" value="临时需求沟通" required maxlength="80"></label><div class="form-grid"><label>开始时间<input name="start" type="datetime-local" value="${inputDate(start)}" required></label><label>结束时间<input name="end" type="datetime-local" value="${inputDate(start+60)}" required></label></div><div class="modal-footer"><button class="primary" type="submit">加入日程</button></div></form>`);
  document.querySelector('#meeting-form').onsubmit=async e=>{e.preventDefault();const f=e.target.elements;const r=await act({type:'meeting',title:f.title.value,start:parseDate(f.start.value),end:parseDate(f.end.value)});if(r.ok)modal.close();};
}
function alertsDialog(){
  dialog('提醒记录',`<div class="alert-history">${state.alerts.length?state.alerts.map(a=>`<article><span class="eyebrow">${deadline(a.at)}</span><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p>${a.type==='estimate'?`<button class="text-button" data-remaining="${esc(a.taskId)}">更新剩余工时 →</button>`:''}</article>`).join(''):'<div class="empty">还没有提醒记录</div>'}</div><div class="modal-footer"><button class="primary" id="read-alerts">全部标为已读</button></div>`);
  modal.querySelectorAll('[data-remaining]').forEach(b=>b.onclick=()=>remainingForm(b.dataset.remaining));
  document.querySelector('#read-alerts').onclick=async()=>{await act({type:'read'});modal.close();};
}
root.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.tab){tab=button.dataset.tab;render();document.querySelector('main').scrollTop=0;return;}
  if(button.dataset.filter){filter=button.dataset.filter;render();return;}
  const type=button.dataset.action,id=button.dataset.id;if(!type)return;
  if(type==='edit')return editTask(id);
  if(type==='remaining')return remainingForm(id);
  if(type==='message')return messageDialog(id);
  if(type==='scenario')return scenarioDialog();
  if(type==='meeting')return meetingForm();
  if(type==='alerts')return alertsDialog();
  if(type==='reset-confirm'){dialog('重新开始演示？','<p class="task-note">将清空本 Demo 的任务调整、模拟消息与计时记录，恢复到 9 月 10 日 09:30。</p><div class="modal-footer"><button class="primary" id="reset-button">确认重置</button></div>');document.querySelector('#reset-button').onclick=async()=>{await act({type:'reset'});modal.close();tab='today';render();};return;}
  if(type==='running')return act({type,value:!state.running});
  if(type==='jump'){const day=Math.floor(state.now/1440)*1440;const target=state.now<day+780?day+780:day+1440+780;return act({type:'advance',minutes:target-state.now});}
  if(type==='advance')return act({type,minutes:Number(button.dataset.minutes)});
  if(type==='hide'&&view==='alert'){for(const a of state.alertBatch)if(a.id!=='test')await act({type:'read',id:a.id});}
  await act({type,id});
});
api.onState(value=>{state=value;render();});
api.onBubble(showBubble);
api.onSpeak(text=>{if('speechSynthesis'in window){const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);}});
api.getState().then(value=>{state=value;render();});
