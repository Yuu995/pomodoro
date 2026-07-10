const { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu, screen, nativeTheme } = require('electron');
const { execFile } = require('child_process');
const path = require('path');

// 锁定数据目录到原路径,改名(productName/name)后历史任务数据不丢
app.setPath('userData', path.join(app.getPath('appData'), 'tomato-clock'));

let mainWindow = null;
let popover = null;
let tray = null;
let hideTimer = null;
let tomatoIcon = null;
let todoIcon = null;
let showRequest = 0;

// —— 主窗口 ——
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    center: true,
    resizable: true,
    title: 'TODO',
    titleBarStyle: 'hiddenInset',   // 隐藏标题栏,红绿灯悬浮,内容延伸到顶部
    trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f2023' : '#fbfbfc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // 最小化/不可见时仍每秒计时
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
  // 窗口聚焦/失焦 → 通知渲染层(失焦时选中条变灰,macOS 行为)
  mainWindow.on('focus', () => mainWindow && mainWindow.webContents.send('win-active', true));
  mainWindow.on('blur', () => mainWindow && mainWindow.webContents.send('win-active', false));
}

function showMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// —— 状态栏快捷面板 ——
function createPopover() {
  popover = new BrowserWindow({
    width: 436,
    height: 580,
    type: process.platform === 'darwin' ? 'panel' : undefined,
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
      backgroundThrottling: false // 隐藏时仍同步任务数量与数据
    }
  });
  if (process.platform === 'darwin') {
    // panel 使用非激活式原生浮层，并允许出现在其他应用的全屏 Space 上。
    popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    popover.setAlwaysOnTop(true, 'pop-up-menu');
    popover.setHiddenInMissionControl(true);
  }
  popover.loadFile('popup.html');
  // 不再「失焦即收起」,以便与主窗口并存;收起改由光标离开判定(scheduleHide)
}

// 把悬浮窗定位到状态栏图标正下方
function positionPopover() {
  if (!popover || !tray) return;
  const tb = tray.getBounds();
  const wb = popover.getBounds();
  const display = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y });
  const minX = display.workArea.x + 6;
  const maxX = display.workArea.x + display.workArea.width - wb.width - 6;
  const x = Math.max(minX, Math.min(maxX, Math.round(tb.x + tb.width / 2 - wb.width / 2)));
  const y = Math.round(tb.y + tb.height + 1); // 紧贴状态栏下沿
  popover.setPosition(x, y, false);
}

function pointIn(p, b) {
  return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}

function getSpaceHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'front-window-state')
    : path.join(__dirname, 'helpers', 'front-window-state');
}

function getFrontWindowState() {
  if (process.platform !== 'darwin') return Promise.resolve('normal');
  return new Promise((resolve) => {
    execFile(getSpaceHelperPath(), [], { timeout: 500 }, (error, stdout) => {
      if (error) return resolve('unknown');
      const state = String(stdout || '').trim();
      resolve(state === 'fullscreen' || state === 'normal' ? state : 'unknown');
    });
  });
}

// 普通桌面激活输入框；独立全屏 Space 只显示面板，不抢焦点也不切换桌面。
async function showPopover(requireTrayHover = true) {
  if (!popover) return;
  clearTimeout(hideTimer);
  if (popover.isVisible()) return;

  const request = ++showRequest;
  positionPopover();
  const frontWindowState = await getFrontWindowState();
  if (request !== showRequest || !popover || popover.isVisible()) return;
  if (requireTrayHover && (!tray || !pointIn(screen.getCursorScreenPoint(), tray.getBounds()))) return;

  const focusInput = frontWindowState === 'normal';
  if (focusInput) popover.show();
  else popover.showInactive();
  popover.webContents.send('popover-shown', { focusInput });
}

// 延迟隐藏:仅当光标既不在图标上、也不在悬浮窗上时才收起(留出移动到悬浮窗的路径)
function scheduleHide() {
  clearTimeout(hideTimer);
  showRequest++;
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
  else showPopover(false);
}

// —— 状态栏图标 ——
// 根据当前模块更新状态栏图标与未完成数量。
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
  tray.setToolTip('TODO · 悬停展开');

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
ipcMain.on('set-theme', (_e, mode) => {                           // 同步原生外观 + 窗口底色
  if (['system', 'light', 'dark'].includes(mode)) {
    nativeTheme.themeSource = mode;
    if (mainWindow) mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1f2023' : '#fbfbfc');
  }
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
