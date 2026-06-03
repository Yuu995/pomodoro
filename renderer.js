// ===== 番茄钟逻辑 =====

const DEFAULT_SETTINGS = {
  work: 25,
  short: 5,
  long: 15,
  interval: 4,   // 每几个番茄后长休息
  sound: true,
  auto: false
};

const MODE_LABEL = { work: '专注', short: '短休息', long: '长休息' };
const RING_LEN = 2 * Math.PI * 108; // 678.58

// ----- 状态 -----
let settings = loadSettings();
let mode = 'work';
let remaining = settings.work * 60;   // 秒
let total = settings.work * 60;
let running = false;
let ticker = null;
let completedInCycle = 0;              // 当前循环已完成的番茄数（用于长休息判断）
let pomodoroIndex = 1;                 // 当前是第几个番茄

// ----- DOM -----
const $ = (id) => document.getElementById(id);
const timeDisplay = $('timeDisplay');
const roundLabel = $('roundLabel');
const ringFg = $('ringFg');
const startBtn = $('startBtn');
const resetBtn = $('resetBtn');
const skipBtn = $('skipBtn');
const modeBtns = document.querySelectorAll('.mode-btn');

ringFg.style.strokeDasharray = RING_LEN;

// ===== 设置持久化 =====
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('tomato_settings'));
    return { ...DEFAULT_SETTINGS, ...(raw || {}) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() {
  localStorage.setItem('tomato_settings', JSON.stringify(settings));
}

// ===== 统计持久化 =====
// 结构: { "2026-05-30": {count: n, focusMin: m}, ... , total: n }
function loadStats() {
  try { return JSON.parse(localStorage.getItem('tomato_stats')) || {}; }
  catch { return {}; }
}
function saveStats(s) { localStorage.setItem('tomato_stats', JSON.stringify(s)); }

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function recordPomodoro(focusMin) {
  const stats = loadStats();
  const key = todayKey();
  if (!stats[key]) stats[key] = { count: 0, focusMin: 0 };
  stats[key].count += 1;
  stats[key].focusMin += focusMin;
  stats.total = (stats.total || 0) + 1;
  saveStats(stats);
  renderStats();
}

function renderStats() {
  const stats = loadStats();
  const today = stats[todayKey()] || { count: 0, focusMin: 0 };
  $('todayCount').textContent = today.count;
  $('todayFocus').textContent = today.focusMin;
  $('totalCount').textContent = stats.total || 0;
  renderWeek(stats);
}

function renderWeek(stats) {
  const wrap = $('weekBars');
  wrap.innerHTML = '';
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const counts = days.map(d => (stats[todayKey(d)] || {}).count || 0);
  const max = Math.max(1, ...counts);
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  days.forEach((d, i) => {
    const bar = document.createElement('div');
    bar.className = 'week-bar';
    const fill = document.createElement('div');
    fill.className = 'bar-fill' + (i === 6 ? ' today' : '');
    fill.style.height = `${Math.round((counts[i] / max) * 100)}%`;
    fill.title = `${counts[i]} 个番茄`;
    const label = document.createElement('div');
    label.className = 'bar-day';
    label.textContent = names[d.getDay()];
    bar.appendChild(fill);
    bar.appendChild(label);
    wrap.appendChild(bar);
  });
}

// ===== 计时显示 =====
function fmt(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function durationFor(m) {
  return (m === 'work' ? settings.work : m === 'short' ? settings.short : settings.long) * 60;
}

function render() {
  timeDisplay.textContent = fmt(remaining);
  const ratio = total > 0 ? remaining / total : 0;
  ringFg.style.strokeDashoffset = RING_LEN * (1 - ratio);
  roundLabel.textContent = mode === 'work'
    ? `第 ${pomodoroIndex} 个番茄`
    : MODE_LABEL[mode] + '中…';
  // 报头编号与标语
  const pomoNo = document.getElementById('pomoNo');
  const tagline = document.getElementById('tagline');
  if (pomoNo) pomoNo.textContent = String(pomodoroIndex).padStart(2, '0');
  if (tagline) {
    const mins = Math.round(total / 60);
    tagline.textContent = mode === 'work' ? `专 注 ${mins} 分` : `休 息 ${mins} 分`;
  }
  document.title = `${fmt(remaining)} · ${MODE_LABEL[mode]}`;
}

// ===== 模式切换 =====
function setMode(newMode, keepRunning = false) {
  mode = newMode;
  document.body.classList.remove('mode-work', 'mode-short', 'mode-long');
  document.body.classList.add('mode-' + mode);
  modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  total = durationFor(mode);
  remaining = total;
  render();
  if (!keepRunning) stop();
}

// ===== 计时控制 =====
function start() {
  if (running) return;
  running = true;
  startBtn.textContent = '暂停';
  startBtn.classList.add('running');
  ticker = setInterval(tick, 1000);
}

function pause() {
  running = false;
  startBtn.textContent = '继续';
  startBtn.classList.remove('running');
  clearInterval(ticker);
  ticker = null;
  render();
}

function stop() {
  running = false;
  startBtn.textContent = '开始';
  startBtn.classList.remove('running');
  clearInterval(ticker);
  ticker = null;
}

function reset() {
  stop();
  remaining = total = durationFor(mode);
  render();
}

function tick() {
  remaining -= 1;
  if (remaining <= 0) {
    remaining = 0;
    render();
    complete();
    return;
  }
  render();
}

// ===== 阶段完成 =====
function complete() {
  stop();
  playChime();
  notify();

  if (mode === 'work') {
    recordPomodoro(settings.work);
    completedInCycle += 1;
    pomodoroIndex += 1;
    const nextMode = (completedInCycle % settings.interval === 0) ? 'long' : 'short';
    setMode(nextMode, true);
  } else {
    setMode('work', true);
  }

  if (settings.auto) {
    start();
  } else {
    render();
  }
}

// ===== 声音提醒（Web Audio，无需音频文件）=====
let audioCtx = null;
function playChime() {
  if (!settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    // 三声上行提示音
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.42);
    });
  } catch (e) { /* 忽略音频错误 */ }
}

function notify() {
  const title = mode === 'work' ? '番茄完成！' : '休息结束！';
  const body = mode === 'work' ? '该休息一下了 🍅' : '开始下一个番茄吧 💪';
  try {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => {
        if (p === 'granted') new Notification(title, { body });
      });
    }
  } catch (e) { /* 忽略 */ }
}

// ===== 事件绑定 =====
startBtn.addEventListener('click', () => {
  if (running) pause(); else start();
});
resetBtn.addEventListener('click', reset);
skipBtn.addEventListener('click', () => { complete(); });

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (running && !confirm('切换模式会停止当前计时，确定？')) return;
    setMode(btn.dataset.mode);
  });
});

// 设置面板
const overlay = $('settingsOverlay');
$('settingsBtn').addEventListener('click', openSettings);
overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });

function openSettings() {
  $('workInput').value = settings.work;
  $('shortInput').value = settings.short;
  $('longInput').value = settings.long;
  $('intervalInput').value = settings.interval;
  $('soundInput').checked = settings.sound;
  $('autoInput').checked = settings.auto;
  overlay.classList.remove('hidden');
}

$('saveSettingsBtn').addEventListener('click', () => {
  const clamp = (v, min, max, def) => {
    const n = parseInt(v, 10);
    return isNaN(n) ? def : Math.min(max, Math.max(min, n));
  };
  settings.work = clamp($('workInput').value, 1, 180, 25);
  settings.short = clamp($('shortInput').value, 1, 60, 5);
  settings.long = clamp($('longInput').value, 1, 120, 15);
  settings.interval = clamp($('intervalInput').value, 2, 12, 4);
  settings.sound = $('soundInput').checked;
  settings.auto = $('autoInput').checked;
  saveSettings();
  overlay.classList.add('hidden');
  // 未运行时按新时长刷新
  if (!running) { total = durationFor(mode); remaining = total; render(); }
});

$('resetStatsBtn').addEventListener('click', () => {
  if (confirm('确定清空所有番茄统计？此操作不可撤销。')) {
    localStorage.removeItem('tomato_stats');
    renderStats();
  }
});

// 键盘：空格 开始/暂停(输入框内、设置打开、非计时视图时不触发)
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  if (typing || !overlay.classList.contains('hidden')) return;
  if ($('viewTimer').classList.contains('hidden')) return;
  e.preventDefault();
  running ? pause() : start();
});

// ===== ToDo 模块 =====
let addPriority = 'high'; // 默认今天做完
const taskInput = $('taskInput');
const taskList = $('taskList');
const taskBadge = $('taskBadge');
const statusTag = $('statusTag');

// 主 Tab:ToDo / 计时
document.querySelectorAll('.main-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    document.querySelectorAll('.main-tab').forEach(t => t.classList.toggle('active', t === tab));
    $('viewTimer').classList.toggle('hidden', view !== 'timer');
    $('viewTasks').classList.toggle('hidden', view !== 'tasks');
    document.body.classList.toggle('on-tasks', view === 'tasks');
    const tg = document.getElementById('tagline');
    if (view === 'tasks') { if (tg) tg.textContent = '待办清单'; setTimeout(() => taskInput.focus(), 0); }
    else if (tg) tg.textContent = `专注 ${Math.round(total / 60)} 分`;
  });
});

// 状态标签:点击循环切换(今天做完 → 这周做完 → 要做的)
function paintStatusTag() {
  const p = PRIORITY_MAP[addPriority];
  statusTag.textContent = p.label;
  statusTag.dataset.prio = addPriority;
  statusTag.style.setProperty('--tagc', p.color);
}
statusTag.addEventListener('click', () => { addPriority = nextPriority(addPriority); paintStatusTag(); });
paintStatusTag();

function doAddTask() {
  const v = taskInput.value.trim();
  if (!v) return;
  addTask(v, addPriority);
  taskInput.value = '';
  taskInput.focus();
  renderTasks();
}
taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAddTask(); });

// 左侧任务栏:全部 / 已完成 / 回收站
let currentFilter = 'all';
document.querySelectorAll('.side-item').forEach(item => {
  item.addEventListener('click', () => {
    currentFilter = item.dataset.filter;
    document.querySelectorAll('.side-item').forEach(s => s.classList.toggle('active', s === item));
    $('taskAdd').style.display = currentFilter === 'all' ? '' : 'none';
    renderTasks();
  });
});

// 任务栏展开 / 收起(记忆状态)
const SIDEBAR_KEY = 'tomato_sidebar_collapsed';
function applySidebar() {
  document.body.classList.toggle('sidebar-collapsed', localStorage.getItem(SIDEBAR_KEY) === '1');
}
$('sideCollapse').addEventListener('click', () => { localStorage.setItem(SIDEBAR_KEY, '1'); applySidebar(); });
$('sideExpand').addEventListener('click', () => { localStorage.setItem(SIDEBAR_KEY, '0'); applySidebar(); });
applySidebar();

// 主题切换:跟随系统 → 浅色 → 深色 循环
const THEMES = ['system', 'light', 'dark'];
const THEME_ICON = { system: '◐', light: '☀', dark: '☾' };
let themeMode = localStorage.getItem('tomato_theme') || 'system';
function applyTheme() {
  if (themeMode === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', themeMode);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = THEME_ICON[themeMode];
  if (window.tomato && window.tomato.setTheme) window.tomato.setTheme(themeMode);
}
const themeBtn = document.getElementById('themeBtn');
if (themeBtn) themeBtn.addEventListener('click', () => {
  themeMode = THEMES[(THEMES.indexOf(themeMode) + 1) % THEMES.length];
  localStorage.setItem('tomato_theme', themeMode);
  applyTheme();
});
applyTheme();

function renderTasks() {
  purgeOldTrash(); // 清理回收站中超 14 天的
  const all = loadTasks();
  // 侧栏与角标计数
  $('cntAll').textContent = all.filter(t => !t.deleted && !t.done).length || '';
  $('cntDone').textContent = all.filter(t => !t.deleted && t.done).length || '';
  $('cntTrash').textContent = all.filter(t => t.deleted).length || '';
  const active = all.filter(t => !t.deleted && !t.done).length;
  taskBadge.textContent = active || '';
  taskBadge.style.display = active ? '' : 'none';

  taskList.innerHTML = '';
  if (currentFilter === 'trash') return renderTrash(all.filter(t => t.deleted));
  if (currentFilter === 'done') return renderDone(all.filter(t => !t.deleted && t.done));
  renderAll(all.filter(t => !t.deleted));
}

function emptyHint(text) {
  const e = document.createElement('div'); e.className = 'task-empty'; e.textContent = text;
  taskList.appendChild(e);
}

// 「全部」:按优先级聚合,支持拖拽改优先级
function renderAll(list) {
  if (!list.length) return emptyHint('还没有待办，在上方添加一条吧');
  PRIORITIES.forEach(p => {
    const items = sortTasks(list.filter(t => t.priority === p.key));
    const group = document.createElement('div');
    group.className = 'task-group';
    const head = document.createElement('div');
    head.className = 'task-group-head';
    head.innerHTML = `<span class="ghead" style="color:${p.color}">${p.label}</span>` +
      `<span class="gcnt">${items.filter(i => !i.done).length || ''}</span>`;
    group.appendChild(head);
    if (!items.length) {
      const ph = document.createElement('div'); ph.className = 'group-empty'; ph.textContent = '拖到这里';
      group.appendChild(ph);
    } else items.forEach(t => group.appendChild(taskRow(t)));
    group.addEventListener('dragover', (e) => { e.preventDefault(); group.classList.add('drop-hover'); });
    group.addEventListener('dragleave', (e) => { if (!group.contains(e.relatedTarget)) group.classList.remove('drop-hover'); });
    group.addEventListener('drop', (e) => {
      e.preventDefault(); group.classList.remove('drop-hover');
      const id = e.dataTransfer.getData('text/plain');
      if (id) { setTaskPriority(id, p.key); renderTasks(); }
    });
    taskList.appendChild(group);
  });
}

// 「已完成」:平铺,可取消完成
function renderDone(list) {
  if (!list.length) return emptyHint('还没有已完成的任务');
  sortTasks(list).forEach(t => taskList.appendChild(taskRow(t)));
}

// 「回收站」:平铺,显示剩余天数,可恢复 / 彻底删除
function renderTrash(list) {
  if (!list.length) return emptyHint('回收站是空的');
  list.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  list.forEach(t => taskList.appendChild(trashRow(t)));
}

function taskRow(t) {
  const p = PRIORITY_MAP[t.priority] || PRIORITIES[0];
  const row = document.createElement('div');
  row.className = 'task-row' + (t.done ? ' done' : '');
  row.draggable = currentFilter === 'all'; // 仅「全部」可拖拽排序
  if (row.draggable) {
    row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault(); e.stopPropagation();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.classList.toggle('drag-over-top', before);
      row.classList.toggle('drag-over-bottom', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over-top', 'drag-over-bottom'));
    row.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      const id = e.dataTransfer.getData('text/plain');
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      if (id && id !== t.id) { moveTask(id, t.id, before); renderTasks(); }
    });
  }
  const box = document.createElement('button');
  box.className = 'check';
  box.style.borderColor = p.color;
  if (t.done) { box.style.background = p.color; box.textContent = '✓'; }
  box.addEventListener('click', () => {
    const wasDone = t.done;
    toggleTask(t.id);
    if (!wasDone) { const r = box.getBoundingClientRect(); burstConfetti(r.left + r.width / 2, r.top + r.height / 2); }
    renderTasks();
  });
  const span = document.createElement('span');
  span.className = 'task-text'; span.innerHTML = renderMarkdown(t.text);
  span.title = '双击编辑';
  span.addEventListener('dblclick', () => beginTaskEdit(row, span, t, renderTasks));
  row.append(box, span);
  if (t.done && t.completedAt) {
    const time = document.createElement('span'); time.className = 'task-time'; time.textContent = formatMonthDay(t.completedAt);
    row.appendChild(time);
  }
  const del = document.createElement('button');
  del.className = 'task-del'; del.textContent = '×'; del.title = '移入回收站';
  del.addEventListener('click', () => { deleteTask(t.id); renderTasks(); });
  row.appendChild(del);
  return row;
}

function trashRow(t) {
  const p = PRIORITY_MAP[t.priority] || PRIORITIES[0];
  const row = document.createElement('div');
  row.className = 'task-row trash';
  const dot = document.createElement('span');
  dot.className = 'trash-dot'; dot.style.background = p.color;
  const span = document.createElement('span');
  span.className = 'task-text'; span.textContent = t.text;
  const days = document.createElement('span');
  days.className = 'task-time'; days.textContent = `剩 ${trashDaysLeft(t)} 天`;
  const restore = document.createElement('button');
  restore.className = 'row-act'; restore.textContent = '恢复';
  restore.addEventListener('click', () => { restoreTask(t.id); renderTasks(); });
  const purge = document.createElement('button');
  purge.className = 'row-act danger'; purge.textContent = '彻底删除';
  purge.addEventListener('click', () => { purgeTask(t.id); renderTasks(); });
  row.append(dot, span, days, restore, purge);
  return row;
}

// 跨窗口同步:悬浮窗增删任务时实时刷新
window.addEventListener('storage', (e) => { if (e.key === TASKS_KEY) renderTasks(); });

// ===== 初始化 =====
setMode('work');
renderStats();
render();
renderTasks();
// 默认在 ToDo 页,报头显示「待办清单」
{ const tg = document.getElementById('tagline'); if (tg && document.body.classList.contains('on-tasks')) tg.textContent = '待办清单'; }
try { if (Notification.permission === 'default') Notification.requestPermission(); } catch {}
