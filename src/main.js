'use strict';
// Window/drag foundation adapted from TonyNa-code/desktop-pet (MIT).
const {app,BrowserWindow,ipcMain,screen,Menu,Tray,nativeImage,powerMonitor,shell}=require('electron');
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const E=require('./engine');
app.setName('工作闹钟');
if(process.env.WORK_ALARM_DATA) app.setPath('userData',process.env.WORK_ALARM_DATA);
const windows={};let state,tray,dragSnapshot,storeError='',voiceProcess,alertBatch=[],ticker;
let lastWall=Date.now(),lastBroadcastMinute=-1,lastSaved=0,isQuitting=false;
const dataFile=()=>path.join(app.getPath('userData'),'work-alarm.json');
const clone=E.clone;
function save(){
  try{
    fs.mkdirSync(path.dirname(dataFile()),{recursive:true});
    fs.writeFileSync(dataFile()+'.tmp',JSON.stringify(state,null,2));
    fs.renameSync(dataFile()+'.tmp',dataFile());storeError='';
  }catch(error){storeError='本地保存失败：'+error.message;console.error(storeError);}
}
function load(){
  try{
    const data=JSON.parse(fs.readFileSync(dataFile(),'utf8'));
    if(data.version!==1||!Array.isArray(data.tasks)||!Array.isArray(data.meetings)||!Number.isFinite(data.now))throw Error('无效存档');
    state={...E.createState(),...data};
    // Reopening a demo doesn't silently charge time while the process was closed.
    for(const t of state.tasks)if(t.status==='active')t.status='todo';
  }catch(error){
    if(fs.existsSync(dataFile())){fs.copyFileSync(dataFile(),dataFile()+'.recovery-'+Date.now());storeError='存档无法读取，已保留恢复副本。';}
    state=E.createState();
  }
}
function snapshot(){return {...clone(state),plan:E.plan(state),baseDate:E.BASE_DATE,storeError,platform:process.platform,alertBatch:clone(alertBatch)};}
function broadcast(){for(const w of Object.values(windows))if(w&&!w.isDestroyed())w.webContents.send('state',snapshot());}
function options(extra={}){return {show:false,backgroundColor:'#f6f5f0',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true},...extra};}
function attach(win,name){
  windows[name]=win;
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  win.loadFile(path.join(__dirname,'index.html'),{query:{view:name}});
  win.webContents.on('did-finish-load',()=>{win.webContents.send('state',snapshot());});
  win.on('close',event=>{if(!isQuitting){event.preventDefault();win.hide();}});
  return win;
}
function makePet(){
  const area=screen.getPrimaryDisplay().workArea;
  const saved=state.petPosition;
  const display=saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)?screen.getDisplayMatching({x:saved.x,y:saved.y,width:252,height:246}).workArea:area;
  const petX=saved?Math.max(display.x,Math.min(display.x+display.width-252,saved.x)):area.x+area.width-270;
  const petY=saved?Math.max(display.y,Math.min(display.y+display.height-246,saved.y)):area.y+area.height-265;
  // Reused transparent, frameless, non-activating window behavior from upstream.
  const win=attach(new BrowserWindow(options({width:252,height:246,x:Math.round(petX),y:Math.round(petY),frame:false,transparent:true,resizable:false,hasShadow:false,skipTaskbar:true,backgroundColor:'#00000000',alwaysOnTop:true})),'pet');
  win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  win.setAlwaysOnTop(true,'floating');
  win.once('ready-to-show',()=>win.showInactive());
  // Begin interactive so the first click/AX interaction can reach the pet;
  // renderer hover tracking enables click-through over empty areas afterwards.
  win.setIgnoreMouseEvents(false,{forward:true});
  return win;
}
function panel(show=true){
  if(!windows.panel){
    const area=screen.getPrimaryDisplay().workArea;
    const w=attach(new BrowserWindow(options({width:Math.min(1100,area.width-50),height:Math.min(810,area.height-40),minWidth:800,minHeight:600,title:'工作闹钟 · 今日工作台',titleBarStyle:'hiddenInset',trafficLightPosition:{x:18,y:18}})),'panel');
    if(show)w.once('ready-to-show',()=>w.show());
  }else if(show)windows.panel.show();
  return windows.panel;
}
function alertWindow(){
  if(!windows.alert){
    const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const w=attach(new BrowserWindow(options({width:430,height:340,x:area.x+area.width-458,y:area.y+55,frame:false,resizable:false,alwaysOnTop:true,skipTaskbar:true,title:'工作闹钟 · 提醒'})),'alert');
    w.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});w.setAlwaysOnTop(true,'floating');
    w.once('ready-to-show',()=>w.showInactive());
  }else windows.alert.showInactive();
  return windows.alert;
}
function say(text){
  if(process.env.WORK_ALARM_TEST==='1')return;
  if(state.settings.sound){
    if(process.platform==='darwin')spawn('/usr/bin/afplay',['/System/Library/Sounds/Glass.aiff']).on('error',console.error);
    else shell.beep();
  }
  if(state.settings.voice){
    if(process.platform==='darwin'){
      if(voiceProcess)voiceProcess.kill();
      voiceProcess=spawn('/usr/bin/say',['-v','Tingting','-r','190',text.slice(0,350)]);
      voiceProcess.on('error',error=>{storeError='语音不可用：'+error.message;broadcast();});
    }else windows.pet?.webContents.send('speak',text);
  }
}
function notify(alerts){
  if(!alerts.length)return;
  windows.pet?.webContents.send('bubble',alerts.length>1?`${alerts.length} 件事需要你留意`:alerts[0].title);
  const strong=alerts.filter(a=>a.type!=='messages');
  if(strong.length){alertBatch=alerts;alertWindow();say(strong.length>1?`${strong[0].title}。${strong[0].body}。另外还有 ${strong.length-1} 项提醒。`:`${strong[0].title}。${strong[0].body}`);}
  else if(state.settings.sound&&process.env.WORK_ALARM_TEST!=='1')shell.beep();
}
function setTray(){
  const image=nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
  tray=new Tray(image);tray.setTitle('◉');tray.setToolTip('工作闹钟 · 桌面时间伙伴');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'打开今日工作台',click:()=>panel()},
    {label:'找回机器人',click:()=>{const a=screen.getPrimaryDisplay().workArea;windows.pet.setPosition(a.x+a.width-270,a.y+a.height-265);windows.pet.showInactive();}},
    {label:'暂停 / 继续演示时钟',click:()=>{state.running=!state.running;save();broadcast();}},
    {type:'separator'},{label:'退出工作闹钟',click:()=>app.quit()},
  ]));tray.on('click',()=>panel());
}
function cursorPoint(point){return point&&Number.isFinite(point.x)&&Number.isFinite(point.y)?{x:point.x,y:point.y}:screen.getCursorScreenPoint();}
function beginDrag(point){dragSnapshot={pointer:cursorPoint(point),bounds:windows.pet.getBounds()};}
function moveDrag(point){
  if(!dragSnapshot)return {dx:0,dy:0};
  const pointer=cursorPoint(point),dx=pointer.x-dragSnapshot.pointer.x,dy=pointer.y-dragSnapshot.pointer.y;
  const area=screen.getDisplayNearestPoint(pointer).workArea;
  windows.pet.setPosition(Math.round(Math.max(area.x-30,Math.min(area.x+area.width-210,dragSnapshot.bounds.x+dx))),Math.round(Math.max(area.y,Math.min(area.y+area.height-200,dragSnapshot.bounds.y+dy))),false);
  return {dx,dy};
}
function trusted(event){return Object.values(windows).some(w=>w&&!w.isDestroyed()&&w.webContents.id===event.sender.id)&&event.senderFrame===event.sender.mainFrame;}
ipcMain.handle('get-state',event=>trusted(event)?snapshot():null);
ipcMain.handle('action',async(event,action)=>{
  if(!trusted(event))return {ok:false,error:'未知窗口'};
  try{
    if(action.type==='open-panel'){panel();return {ok:true};}
    if(action.type==='hide'){BrowserWindow.fromWebContents(event.sender)?.hide();return {ok:true};}
    if(action.type==='preview')return {ok:true,plan:E.preview(state,action.id,action.values)};
    if(action.type==='test-alert'){
      const a={id:'test',type:'test',title:'你的工作伙伴已就位',body:'这是一次提醒演示。窗口已显示，你可以继续在原来的软件里打字。',at:state.now};
      notify([a]);broadcast();return {ok:true};
    }
    if(action.type==='reset'){
      state=E.createState();alertBatch=[];windows.alert?.hide();if(voiceProcess)voiceProcess.kill();save();broadcast();return {ok:true};
    }
    const draft=clone(state),alerts=E.apply(draft,action);state=draft;notify(alerts);save();broadcast();return {ok:true};
  }catch(error){return {ok:false,error:error.message};}
});
ipcMain.on('drag-start',(event,point)=>{if(trusted(event))beginDrag(point);});
ipcMain.handle('drag-move',(event,point)=>trusted(event)?moveDrag(point):{dx:0,dy:0});
ipcMain.on('drag-end',event=>{if(trusted(event)){dragSnapshot=null;const b=windows.pet.getBounds();state.petPosition={x:b.x,y:b.y};save();}});
ipcMain.on('pointer', (event,interactive)=>{if(trusted(event)&&event.sender===windows.pet?.webContents)windows.pet.setIgnoreMouseEvents(!interactive,{forward:true});});
const locked=app.requestSingleInstanceLock();
if(!locked)app.quit();
else{
  app.on('second-instance',()=>panel());
  app.whenReady().then(()=>{
    load();makePet();panel(false);setTray();
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'工作闹钟',submenu:[{label:'今日工作台',click:()=>panel()},{type:'separator'},{role:'quit'}]},{label:'文件',submenu:[{role:'close'}]},{role:'editMenu'},{role:'windowMenu'}]));
    app.on('activate',()=>panel());
    powerMonitor.on('suspend',()=>{for(const t of state.tasks)if(t.status==='active')t.status='todo';save();});
    ticker=setInterval(()=>{
      const wall=Date.now(),elapsed=(wall-lastWall)/60000;lastWall=wall;
      if(state.running){
        if(elapsed>0.1)for(const t of state.tasks)if(t.status==='active')t.status='todo';
        const alerts=E.advance(state,Math.min(elapsed,1440*7),{track:elapsed<=0.1});notify(alerts);
        if(Math.floor(state.now)!==lastBroadcastMinute||alerts.length){broadcast();lastBroadcastMinute=Math.floor(state.now);}
      }
      if(wall-lastSaved>15000){save();lastSaved=wall;}
    },1000);
    if(process.argv.includes('--dashboard'))panel();
  });
  app.on('before-quit',()=>{isQuitting=true;clearInterval(ticker);if(voiceProcess)voiceProcess.kill();if(state)save();});
  app.on('window-all-closed',()=>{});
}
