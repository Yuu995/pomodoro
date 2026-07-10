const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tomato', {
  // 更新状态栏图标与待办数量。
  setTray: (mode, text) => ipcRenderer.send('set-tray-mode', { mode, text }),
  // 悬浮窗:点开时触发(主进程发来),按场景决定是否聚焦输入框
  onShown: (cb) => ipcRenderer.on('popover-shown', (_e, payload) => cb(payload || {})),
  // 悬浮窗:打开主窗口
  openMain: () => ipcRenderer.send('open-main'),
  // 悬浮窗:收起自己
  hide: () => ipcRenderer.send('hide-popover'),
  // 悬浮窗:鼠标进入/离开,用于 hover 自动收起判定
  hoverEnter: () => ipcRenderer.send('popover-hover-enter'),
  hoverLeave: () => ipcRenderer.send('popover-hover-leave'),
  // 同步原生外观:'system' | 'light' | 'dark'
  setTheme: (mode) => ipcRenderer.send('set-theme', mode),
  // 主窗口聚焦/失焦(用于选中条失焦变灰)
  onWinActive: (cb) => ipcRenderer.on('win-active', (_e, active) => cb(active))
});
