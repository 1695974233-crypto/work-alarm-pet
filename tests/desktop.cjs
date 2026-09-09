const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'artifacts'),profile=path.join(artifacts,'test-profile');
fs.mkdirSync(artifacts,{recursive:true});fs.rmSync(profile,{recursive:true,force:true});
const errors=[];let app;
async function launch(){
  const instance=await electron.launch({args:[root,'--dashboard'],env:{...process.env,WORK_ALARM_DATA:profile,WORK_ALARM_TEST:'1'},timeout:30000});
  instance.on('window',page=>page.on('pageerror',error=>errors.push(error.message)));
  return instance;
}
async function getPage(name){
  for(let i=0;i<50;i++){
    const p=app.windows().find(w=>w.url().includes('view='+name));if(p)return p;
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Missing window: '+name);
}
async function action(page,value){const r=await page.evaluate(a=>window.workAlarm.action(a),value);assert.equal(r.ok,true,r.error);return r;}
async function state(page){return page.evaluate(()=>window.workAlarm.getState());}
(async()=>{
  try{
    app=await launch();const panel=await getPage('panel'),pet=await getPage('pet');
    await panel.locator('h1').waitFor();await action(panel,{type:'running',value:false});
    assert.match(await panel.locator('h1').innerText(),/把时间/);
    await panel.screenshot({path:path.join(artifacts,'01-dashboard.png')});
    await pet.screenshot({path:path.join(artifacts,'02-robot.png'),omitBackground:true});
    // UI-driven queue -> poll -> impact preview -> confirmation.
    await panel.locator('[data-action="scenario"]').click();
    await panel.locator('[data-scenario="new"]').click();
    assert.equal((await state(panel)).tasks.length,3);
    await panel.locator('[data-action="poll"]').click();
    await panel.locator('.message-card').first().click();
    await panel.locator('#impact strong').waitFor();
    await panel.screenshot({path:path.join(artifacts,'03-confirmation.png')});
    await panel.locator('#message-form button[type=submit]').click();
    assert.equal((await state(panel)).tasks.length,4);
    // UI-driven focus switch and state preservation.
    await panel.locator('[data-task="t2"] [data-action="start"]').click();
    await panel.locator('[data-action="advance"]').click();
    let s=await state(panel);assert.equal(s.tasks.find(t=>t.id==='t2').spent,30);
    await panel.locator('[data-task="t1"] [data-action="start"]').click();
    s=await state(panel);assert.equal(s.tasks.find(t=>t.id==='t2').status,'todo');assert.equal(s.tasks.find(t=>t.id==='t1').status,'active');
    await panel.locator('[data-task="t1"] [data-action="pause"]').click();
    await panel.locator('[data-action="jump"]').click();
    s=await state(panel);assert.ok(s.plan.gap>0);
    await panel.screenshot({path:path.join(artifacts,'04-capacity-risk.png')});
    // Deadline must remain unchanged before confirmation.
    await action(panel,{type:'queue',kind:'deadline'});await action(panel,{type:'poll'});
    s=await state(panel);assert.equal(s.tasks.find(t=>t.id==='t1').deadline,1080);
    const msg=s.messages.find(m=>m.scenario==='deadline');await action(panel,{type:'confirm',id:msg.id});
    assert.equal((await state(panel)).tasks.find(t=>t.id==='t1').deadline,960);
    await panel.locator('[data-tab="schedule"]').click();
    await panel.screenshot({path:path.join(artifacts,'05-schedule.png')});
    // Pet coordinate dragging moves the transparent native window.
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet'));w.setIgnoreMouseEvents(false);});
    const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getBounds());
    await pet.mouse.move(120,140);await pet.mouse.down();await pet.mouse.move(60,105,{steps:15});await new Promise(r=>setTimeout(r,120));await pet.mouse.up();
    const after=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet')).getBounds());
    assert.ok(Math.abs(after.x-before.x)+Math.abs(after.y-before.y)>10,'Pointer drag must move native window');
    const syntheticDrag={before,after,passed:true};
    // On macOS test a real external foreground app, not just two Electron windows.
    let focusResult={tested:false};
    if(process.platform==='darwin'){
      execFileSync('/usr/bin/osascript',['-e','tell application "Finder" to activate']);
      await new Promise(r=>setTimeout(r,500));
      const foreground=()=>execFileSync('/usr/bin/osascript',['-l','JavaScript','-e','ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.frontmostApplication.localizedName.js'],{encoding:'utf8'}).trim();
      const first=foreground();await action(panel,{type:'test-alert'});
      const alert=await getPage('alert');await alert.locator('.alert-card').waitFor();
      await new Promise(r=>setTimeout(r,400));const last=foreground();
      const info=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=alert'));return {visible:w.isVisible(),focused:w.isFocused(),alwaysOnTop:w.isAlwaysOnTop()};});
      assert.equal(first,last,'Reminder must not steal app focus');assert.equal(info.focused,false);assert.equal(info.visible,true);assert.equal(info.alwaysOnTop,true);
      focusResult={tested:true,before:first,after:last,...info};
      await alert.screenshot({path:path.join(artifacts,'06-reminder.png')});
    }
    const saved=await state(panel);await app.close();app=await launch();const reopened=await getPage('panel');await reopened.locator('h1').waitFor();
    const restored=await state(reopened);assert.equal(restored.tasks.length,saved.tasks.length);assert.equal(restored.tasks.find(t=>t.id==='t1').deadline,960);assert.equal(restored.tasks.find(t=>t.id==='t2').spent,30);
    assert.deepEqual(errors,[],'Renderer should not throw');
    fs.writeFileSync(path.join(artifacts,'desktop-test.json'),JSON.stringify({passed:true,tests:['dashboard','confirmation preview','task switching','time tracking','capacity risk','deadline confirmation','no-focus-steal','persistence'],syntheticDrag,focus:focusResult,rendererErrors:errors,checkedAt:new Date().toISOString()},null,2));
    console.log('Desktop checks passed',JSON.stringify(focusResult));
  }finally{if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
