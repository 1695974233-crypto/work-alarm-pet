'use strict';

// Pure scheduling model. All timestamps are minutes from the demo's local midnight.
const DAY = 1440;
const BASE_DATE = '2026-09-10';
const clone = value => JSON.parse(JSON.stringify(value));
const dayOf = n => Math.floor(n / DAY);
const remaining = task => Math.max(0, task.estimate - task.spent);
const done = task => task.status === 'done';
function createState() {
  return {
    version: 1, now: 570, running: true, lastPoll: 570, nextId: 10, planVersion: 1,
    settings: {sound: true, voice: true}, meetings: [{id:'m1', title:'产品评审', start:900, end:960}],
    tasks: [
      {id:'t1', title:'完成用户痛点调研与需求分析', source:'市场 · 飞书群', deadline:1080, must:true, estimate:180, spent:0, status:'todo', notes:'交付：用户痛点归纳、核心需求和初步产品方向。', revision:0},
      {id:'t2', title:'分析产品转化下降的原因', source:'老板 · 飞书私聊', deadline:900, must:true, estimate:60, spent:0, status:'todo', notes:'交付：定位转化漏斗问题，给出下一步验证方案。', revision:0},
      {id:'t3', title:'整理下一轮产品优化方案', source:'客户 · 模拟邮箱', deadline:DAY+1080, must:false, estimate:90, spent:0, status:'waiting', notes:'等待客户补充使用录屏，资料到达后再开始。', revision:0},
    ],
    messages: [], alerts: [], fired: {}, scenarioCounts: {}, manualOrder: [],
  };
}
function slots(state, from, to) {
  if (to <= from) return [];
  const out = [];
  for (let day=dayOf(from); day<=dayOf(to); day++) {
    const weekday = ((day+4)%7+7)%7; // 2026-09-10 is Thursday
    if (weekday === 0 || weekday === 6) continue;
    for (const [a,b] of [[540,720],[780,1080]]) {
      let pieces = [[Math.max(from,day*DAY+a), Math.min(to,day*DAY+b)]];
      for (const meeting of state.meetings) {
        pieces = pieces.flatMap(([s,e]) => {
          if (meeting.end <= s || meeting.start >= e) return [[s,e]];
          return [[s,Math.min(e,meeting.start)], [Math.max(s,meeting.end),e]].filter(([x,y])=>y>x);
        });
      }
      out.push(...pieces.filter(([s,e])=>e>s));
    }
  }
  return out.sort((a,b)=>a[0]-b[0]);
}
function available(state, from, to) { return slots(state,from,to).reduce((sum,[a,b])=>sum+b-a,0); }
function isWorkTime(state, at) { return available(state,at,at+0.01)>0; }
function ordered(state) {
  const today = dayOf(state.now);
  const priority = t => t.must && t.deadline != null && dayOf(t.deadline)<=today ? 0 : 1;
  return state.tasks.filter(t=>!done(t)).sort((a,b)=> {
    const p = priority(a)-priority(b); if(p) return p;
    const ai=state.manualOrder.indexOf(a.id),bi=state.manualOrder.indexOf(b.id);
    if(ai>=0 && bi>=0) return ai-bi;
    return (a.deadline ?? Infinity)-(b.deadline ?? Infinity) || a.id.localeCompare(b.id);
  });
}
function allocate(state, from, amount, endLimit=from+DAY*30) {
  const parts=[]; let left=amount;
  if(left<=0) return {start:from,end:from,parts,left:0};
  for(const [s,e] of slots(state,from,endLimit)) {
    const used=Math.min(left,e-s); parts.push([s,s+used]); left-=used;
    if(left<0.001) return {start:parts[0][0],end:s+used,parts,left:0};
  }
  return {start:parts[0]?.[0]??null,end:null,parts,left};
}
function subtractWork(state, end, amount) {
  if(amount<=0) return end;
  let left=amount;
  for(const [s,e] of slots(state,end-DAY*30,end).reverse()) {
    if(left<=e-s) return e-left;
    left-=e-s;
  }
  return end-DAY*30;
}
function plan(state) {
  const tasks=ordered(state), eligible=tasks.filter(t=>t.deadline != null);
  // A deliberate switch to another task changes predicted execution, even if it
  // isn't first in the priority list. Preserve priorities but reflect actual work.
  const current=eligible.find(t=>t.status==='active');
  const scheduled=current?[current,...eligible.filter(t=>t.id!==current.id)]:eligible;
  let cursor=state.now, nextLatest=Infinity;
  const rows=scheduled.map(t=> {
    const allocation=allocate(state,cursor,remaining(t)); cursor=allocation.end??cursor+DAY*30;
    return {...t,remaining:remaining(t),...allocation,late:allocation.end==null || allocation.end>t.deadline+0.01,conditional:t.status==='waiting'};
  });
  for(let i=rows.length-1;i>=0;i--) {
    rows[i].latestStart=subtractWork(state,Math.min(rows[i].deadline,nextLatest),rows[i].remaining);
    rows[i].remindAt=rows[i].latestStart-30; nextLatest=rows[i].latestStart;
  }
  const todayEnd=dayOf(state.now)*DAY+1080;
  const todayTasks=scheduled.filter(t=>t.deadline<=todayEnd);
  const required=todayTasks.reduce((sum,t)=>sum+remaining(t),0);
  const capacity=available(state,state.now,todayEnd);
  const active=tasks.find(t=>t.status==='active');
  const recommendation=active || tasks.find(t=>t.status==='todo'&&t.deadline!=null&&remaining(t)>0);
  return {rows,required,capacity,gap:Math.max(0,required-capacity),late:rows.filter(t=>t.late),
    recommendation:recommendation?.id??null,unknown:tasks.filter(t=>t.deadline==null).length,
    waiting:tasks.filter(t=>t.status==='waiting').length,
    needsEstimate:tasks.filter(t=>t.status!=='waiting' && remaining(t)<=0).length,
    workTime:isWorkTime(state,state.now)};
}
function alertOnce(state,key,type,title,body,taskId=null) {
  if(state.fired[key]) return null;
  state.fired[key]=true;
  const alert={id:`a${state.nextId++}`,key,type,title,body,taskId,at:state.now,read:false};
  state.alerts.unshift(alert); state.alerts=state.alerts.slice(0,100);
  return alert;
}
function evaluate(state) {
  const p=plan(state), created=[];
  const add = a => {if(a)created.push(a);};
  for(const row of p.rows) {
    if(row.status!=='waiting' && remaining(row)<=0) {
      add(alertOnce(state,`estimate:${row.id}:${row.revision}`,'estimate','需要更新剩余工时',`「${row.title}」已达到预估工时，尚未完成。请补填还需要多久。`,row.id));
    } else if(row.status==='todo' && state.now>=row.remindAt) {
      add(alertOnce(state,`start:${row.id}:${row.revision}`,'start','该开始这项工作了',`「${row.title}」还需 ${Math.ceil(row.remaining)} 分钟，已进入最晚开始前的 30 分钟提醒区间。`,row.id));
    }
  }
  if(p.gap>0.01) add(alertOnce(state,`gap:${dayOf(state.now)}:${state.planVersion}`,'capacity','今天的时间不够了',`今天剩余可用 ${Math.floor(p.capacity)} 分钟，需要 ${Math.ceil(p.required)} 分钟，缺口 ${Math.ceil(p.gap)} 分钟。请调整安排。`));
  else if(p.late.length) add(alertOnce(state,`deadline:${dayOf(state.now)}:${state.planVersion}`,'capacity','有任务可能错过截止时间',`按当前顺序，「${p.late[0].title}」预计不能按时完成。请查看排期。`,p.late[0].id));
  return created;
}
function queueMessage(state,kind) {
  const id=`msg${state.nextId++}`, at=state.now, day=dayOf(at)*DAY;
  let message;
  if(kind==='new') message={kind:'new',source:'市场 · 需求协作群',sender:'林晓 / 市场',title:'新增：补充竞品功能对比',body:'今天下班前补充一份竞品核心功能对比，用于明天讨论。预估需要 1 小时。',proposal:{title:'补充竞品核心功能对比',deadline:day+1080,must:true,estimate:60,notes:'交付一页对比表：核心场景、功能差异和机会点。'}};
  else if(kind==='deadline') {
    const task=state.tasks.find(t=>t.id==='t1'&&!done(t));
    if(!task) throw Error('调研任务已完成，重置演示后可体验截止时间变更。');
    message={kind:'change',taskId:task.id,source:'老板 · 飞书私聊',sender:'陈总 / 老板',title:'截止时间提前至今天 16:00',body:'客户会议提前了，请把用户需求分析在今天 16:00 前交付。',proposal:{deadline:day+960}};
  } else if(kind==='scope') {
    const task=state.tasks.find(t=>t.id==='t1'&&!done(t));
    if(!task) throw Error('调研任务已完成，重置演示后可体验范围变更。');
    message={kind:'change',taskId:task.id,source:'市场 · 需求协作群',sender:'林晓 / 市场',title:'需求补充：增加用户分层',body:'请在调研结论里增加新老用户的差异分析，预计增加 30 分钟工作量。',proposal:{extra:30,notes:'补充新老用户分层分析。'}};
  } else if(kind==='material') message={kind:'material',taskId:'t3',source:'客户 · 模拟邮箱',sender:'张女士 / 客户',title:'等待的用户录屏已补充',body:'已补充用户操作录屏和复现步骤，可以继续产品优化分析。'};
  else if(kind==='review') message={kind:'new',source:'研发 · 产品协作群',sender:'周明 / 研发',title:'研发完成，等待你验收',body:'登录异常修复已完成，请明天 11:00 前验收，预估 30 分钟。',proposal:{title:'验收登录异常修复',deadline:day+DAY+660,must:false,estimate:30,notes:'检查研发修复与用户反馈是否一致。'}};
  else if(kind==='unknown') message={kind:'new',source:'客户 · 模拟邮箱',sender:'张女士 / 客户',title:'新想法：优化首次使用体验',body:'新用户不知道如何上手，能否研究一下优化方案？（消息未给出截止时间）',proposal:{title:'分析新用户首次使用体验',deadline:null,must:false,estimate:90,notes:'先向对方确认交付范围和截止时间。'}};
  else throw Error('未知模拟消息类型');
  const previous=state.messages.find(m=>m.scenario===kind&&m.status==='queued');
  if(previous) return previous;
  message={id,at,...message,scenario:kind,status:'queued'};
  state.messages.unshift(message); return message;
}
function poll(state) {
  state.lastPoll=state.now;
  const messages=state.messages.filter(m=>m.status==='queued');
  for(const message of messages) {
    message.status=['material'].includes(message.kind)?'info':'pending';
    if(message.kind==='material') {
      const task=state.tasks.find(t=>t.id===message.taskId);
      if(task?.status==='waiting') {task.status='todo';task.notes+='\n客户资料已到达。';}
    }
  }
  if(!messages.length) return [];
  return [alertOnce(state,`messages:${messages.map(m=>m.id).join(',')}`,'messages',`收到 ${messages.length} 条工作更新`,messages.map(m=>m.title).join('；'))].filter(Boolean);
}
function advance(state,minutes,{track=true}={}) {
  if(!Number.isFinite(minutes)||minutes<0||minutes>DAY*7) throw Error('时间快进应在 0～7 天之间');
  const emitted=[], target=state.now+minutes;
  // Small steps preserve poll and alert boundaries when fast-forwarding.
  while(state.now<target-0.000001) {
    const next=Math.min(target,state.now+1);
    const active=state.tasks.find(t=>t.status==='active');
    if(active&&track) active.spent+=available(state,state.now,next);
    state.now=next;
    if(state.now-state.lastPoll>=30-0.001) emitted.push(...poll(state));
    emitted.push(...evaluate(state));
  }
  return emitted;
}
function validateTask(values) {
  if(!values.title?.trim()||values.title.length>160) throw Error('请填写 1～160 字的任务标题');
  if(!Number.isFinite(values.estimate)||values.estimate<1||values.estimate>4800) throw Error('预估工时应为 1～4800 分钟');
  if(values.deadline!=null&&(!Number.isFinite(values.deadline)||values.deadline<0||values.deadline>DAY*365)) throw Error('截止时间不正确');
}
function confirm(state,messageId,values={}) {
  const m=state.messages.find(m=>m.id===messageId&&m.status==='pending');
  if(!m) throw Error('这条消息已处理，或尚未检查');
  if(m.kind==='new') {
    const fields={...m.proposal,...values}; validateTask(fields);
    const task={id:`t${state.nextId++}`,...fields,title:fields.title.trim(),source:m.source,spent:0,status:'todo',revision:0};
    state.tasks.push(task); m.createdTaskId=task.id;
  } else if(m.kind==='change') {
    const task=state.tasks.find(t=>t.id===m.taskId&&!done(t));
    if(!task) throw Error('关联任务已完成或不存在，请忽略此更新');
    const fields={...task,...m.proposal,...values};
    if(m.proposal.extra) fields.estimate=task.estimate+m.proposal.extra;
    validateTask(fields);
    task.deadline=fields.deadline; task.estimate=fields.estimate; task.revision++;
    if(m.proposal.notes) task.notes+='\n'+m.proposal.notes;
  }
  m.status='confirmed';state.planVersion++;state.manualOrder=[];
}
function apply(state,action) {
  let emitted=[];
  const task=state.tasks.find(t=>t.id===action.id);
  if(action.type==='advance') return advance(state,Number(action.minutes));
  if(action.type==='running') {state.running=!!action.value;return [];}
  if(action.type==='queue') {queueMessage(state,action.kind);return [];}
  if(action.type==='poll') emitted.push(...poll(state));
  else if(action.type==='confirm') confirm(state,action.id,action.values);
  else if(action.type==='dismiss-message') {const m=state.messages.find(m=>m.id===action.id&&['pending','info'].includes(m.status));if(m)m.status='dismissed';}
  else if(action.type==='read') {for(const a of state.alerts) if(!action.id||a.id===action.id)a.read=true;return [];}
  else if(action.type==='settings') {state.settings={sound:!!action.sound,voice:!!action.voice};return [];}
  else if(action.type==='meeting') {
    const start=Number(action.start),end=Number(action.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||start<state.now||end-start>480)throw Error('会议应从现在或之后开始，时长不超过 8 小时');
    state.meetings.push({id:`m${state.nextId++}`,title:String(action.title||'临时会议').slice(0,80),start,end});state.planVersion++;
  } else if(action.type==='remove-meeting') {state.meetings=state.meetings.filter(m=>m.id!==action.id);state.planVersion++;}
  else if(action.type==='reorder') {
    const list=ordered(state).map(t=>t.id),index=list.indexOf(action.id),target=index+Number(action.direction);
    if(index>=0&&target>=0&&target<list.length){[list[index],list[target]]=[list[target],list[index]];state.manualOrder=list;state.planVersion++;}
  } else if(['start','pause','wait','complete','edit','remaining'].includes(action.type)) {
    if(!task||done(task))throw Error('任务已完成或不存在');
    if(action.type==='start') {
      if(task.deadline==null)throw Error('请先与对方确认并填写截止时间');
      if(remaining(task)<=0)throw Error('请先补填剩余工时');
      for(const t of state.tasks)if(t.status==='active')t.status='todo';
      task.status='active';
    } else if(action.type==='pause') task.status='todo';
    else if(action.type==='wait') task.status='waiting';
    else if(action.type==='complete'){task.status='done';task.completedAt=state.now;state.planVersion++;}
    else if(action.type==='edit') {
      const fields={...task,...action.values};validateTask(fields);
      Object.assign(task,{title:fields.title.trim(),deadline:fields.deadline,estimate:fields.estimate,must:!!fields.must});
      task.revision++;state.planVersion++;state.manualOrder=[];
    } else if(action.type==='remaining') {
      const value=Number(action.minutes);
      if(!Number.isFinite(value)||value<1||value>4800)throw Error('剩余工时应为 1～4800 分钟');
      task.estimate=task.spent+value;task.revision++;state.planVersion++;
    }
  }
  emitted.push(...evaluate(state));return emitted;
}
function preview(state,messageId,values={}) {
  const copy=clone(state);confirm(copy,messageId,values);return plan(copy);
}
module.exports={DAY,BASE_DATE,createState,slots,available,remaining,ordered,allocate,subtractWork,plan,evaluate,advance,queueMessage,poll,confirm,apply,preview,clone};
