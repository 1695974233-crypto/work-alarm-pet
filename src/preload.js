const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workAlarm',{
  getState:()=>ipcRenderer.invoke('get-state'),
  action:action=>ipcRenderer.invoke('action',action),
  onState:fn=>ipcRenderer.on('state',(_event,value)=>fn(value)),
  onBubble:fn=>ipcRenderer.on('bubble',(_event,value)=>fn(value)),
  onSpeak:fn=>ipcRenderer.on('speak',(_event,value)=>fn(value)),
  dragStart:point=>ipcRenderer.send('drag-start',point),
  dragMove:point=>ipcRenderer.invoke('drag-move',point),
  dragEnd:()=>ipcRenderer.send('drag-end'),
  pointer:interactive=>ipcRenderer.send('pointer',interactive),
});
