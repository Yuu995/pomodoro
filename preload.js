const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tomato', {
  // 切换状态栏图标与文字('todo'=待办图标+数量,'pomodoro'=番茄图标+倒计时)
  setTray: (mode, text) => ipcRenderer.send('set-tray-mode', { mode, text }),
  // 悬浮窗:点开时触发(主进程发来),用于自动开始计时
  onShown: (cb) => ipcRenderer.on('popover-shown', () => cb()),
  // 悬浮窗:打开主窗口
  openMain: () => ipcRenderer.send('open-main'),
  // 悬浮窗:收起自己
  hide: () => ipcRenderer.send('hide-popover'),
  // 悬浮窗:鼠标进入/离开,用于 hover 自动收起判定
  hoverEnter: () => ipcRenderer.send('popover-hover-enter'),
  hoverLeave: () => ipcRenderer.send('popover-hover-leave'),
  // 同步原生外观:'system' | 'light' | 'dark'
  setTheme: (mode) => ipcRenderer.send('set-theme', mode)
});
