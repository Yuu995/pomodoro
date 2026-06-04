const { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu, screen, nativeTheme } = require('electron');
const path = require('path');

// 锁定数据目录到原路径,改名(productName/name)后历史任务数据不丢
app.setPath('userData', path.join(app.getPath('appData'), 'tomato-clock'));

let mainWindow = null;
let popover = null;
let tray = null;
let hideTimer = null;
let tomatoIcon = null;
let todoIcon = null;

// —— 主窗口 ——
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    center: true,
    resizable: true,
    title: 'ToDo',
    vibrancy: 'under-window',       // macOS 原生毛玻璃,透出桌面并模糊
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // 最小化/不可见时仍每秒计时
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// —— 悬浮窗(状态栏快捷计时)——
function createPopover() {
  popover = new BrowserWindow({
    width: 364,
    height: 476,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false, // 关掉窗口级矩形阴影,改用卡片自身的柔和阴影
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // 失焦隐藏时仍每秒计时,状态栏不停更新
    }
  });
  popover.loadFile('popup.html');
  // 不再「失焦即收起」,以便与主窗口并存;收起改由光标离开判定(scheduleHide)
}

// 把悬浮窗定位到状态栏图标正下方
function positionPopover() {
  if (!popover || !tray) return;
  const tb = tray.getBounds();
  const wb = popover.getBounds();
  const x = Math.round(tb.x + tb.width / 2 - wb.width / 2);
  const y = Math.round(tb.y + tb.height + 1); // 紧贴状态栏下沿
  popover.setPosition(x, y, false);
}

function pointIn(p, b) {
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}

// 显示悬浮窗(不抢当前应用焦点)
function showPopover() {
  if (!popover) return;
  clearTimeout(hideTimer);
  if (!popover.isVisible()) {
    positionPopover();
    popover.showInactive(); // 不抢焦点,可与主窗口同时显示
    popover.webContents.send('popover-shown');
  }
}

// 延迟隐藏:仅当光标既不在图标上、也不在悬浮窗上时才收起(留出移动到悬浮窗的路径)
function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!popover || !popover.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const onTray = tray && pointIn(p, tray.getBounds());
    const onPop = pointIn(p, popover.getBounds());
    if (!onTray && !onPop) popover.hide();
  }, 280);
}

function togglePopover() {
  if (!popover) return;
  if (popover.isVisible()) popover.hide();
  else showPopover();
}

// —— 状态栏图标 ——
// 根据当前 Tab 切换图标:'todo' 显示待办图标+未完成数,'pomodoro' 显示番茄图标+倒计时
function setTrayMode(mode, text) {
  if (!tray) return;
  tray.setImage(mode === 'pomodoro' ? tomatoIcon : todoIcon);
  tray.setTitle(text ? ` ${text}` : '');
}

function createTray() {
  tomatoIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  tomatoIcon.setTemplateImage(true);
  todoIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'todoTemplate.png'));
  todoIcon.setTemplateImage(true);

  tray = new Tray(todoIcon);
  tray.setToolTip('ToDo · 悬停展开');

  const menu = Menu.buildFromTemplate([
    { label: '打开主窗口', click: showMainWindow },
    { label: '快捷待办面板', click: togglePopover },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);

  tray.on('mouse-enter', showPopover);        // 悬停图标:自动弹出
  tray.on('mouse-leave', scheduleHide);       // 移开图标:延迟收起
  tray.on('click', togglePopover);            // 左键:显示/收起
  tray.on('right-click', () => tray.popUpContextMenu(menu)); // 右键:菜单
}

// —— IPC ——
ipcMain.on('set-tray-mode', (_e, payload) => setTrayMode(payload && payload.mode, payload && payload.text));
ipcMain.on('open-main', () => { showMainWindow(); if (popover) popover.hide(); });
ipcMain.on('hide-popover', () => { if (popover) popover.hide(); });
ipcMain.on('popover-hover-enter', () => clearTimeout(hideTimer)); // 鼠标进入悬浮窗:取消收起
ipcMain.on('popover-hover-leave', scheduleHide);                  // 鼠标离开悬浮窗:延迟收起
ipcMain.on('set-theme', (_e, mode) => {                           // 同步原生外观(含毛玻璃明暗)
  if (['system', 'light', 'dark'].includes(mode)) nativeTheme.themeSource = mode;
});

app.whenReady().then(() => {
  createWindow();
  createPopover();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  // 保留状态栏常驻,不退出(从状态栏菜单退出)
  if (process.platform !== 'darwin') app.quit();
});
