// 状态栏快捷计时 · 独立迷你计时器
// 与主应用共享 localStorage(设置 tomato_settings、统计 tomato_stats),点开即自动开始。

const DEFAULT_SETTINGS = { work: 25, short: 5, long: 15, interval: 4, sound: true, auto: false };
const MODE_LABEL = { work: '专注', short: '短休息', long: '长休息' };

let settings = loadSettings();
let mode = 'work';
let total = settings.work * 60;
let remaining = total;
let running = false;
let ticker = null;
let endAt = 0; // 计时结束的绝对时间戳(ms),用于抗节流/抗休眠
let completedInCycle = 0;
let pomodoroIndex = 1;
let currentPp = 'tasks'; // 当前悬浮窗 Tab(默认 ToDo)

const $ = (id) => document.getElementById(id);
const timeDisplay = $('timeDisplay');
const roundLabel = $('roundLabel');
const barFill = $('barFill');
const startBtn = $('startBtn');
const modeBtns = document.querySelectorAll('.mode-btn');

// ===== 持久化(与主应用同源共享)=====
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem('tomato_settings')) || {}) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function loadStats() {
  try { return JSON.parse(localStorage.getItem('tomato_stats')) || {}; } catch { return {}; }
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
}

// ===== 显示 =====
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
  barFill.style.width = (total > 0 ? (1 - remaining / total) * 100 : 0) + '%';
  roundLabel.textContent = mode === 'work' ? `第 ${pomodoroIndex} 个番茄` : MODE_LABEL[mode] + '中…';
  syncTray();
}

// ===== 模式 =====
function setMode(newMode) {
  mode = newMode;
  document.body.classList.remove('mode-work', 'mode-short', 'mode-long');
  document.body.classList.add('mode-' + mode);
  modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  total = remaining = durationFor(mode);
  render();
}

// ===== 计时控制 =====
function start() {
  if (running) return;
  settings = loadSettings(); // 拿最新时长
  running = true;
  endAt = Date.now() + remaining * 1000; // 以真实时间为基准
  startBtn.textContent = '暂停';
  startBtn.classList.add('running');
  ticker = setInterval(tick, 500);
  render();
}
function pause() {
  running = false;
  startBtn.textContent = '继续';
  startBtn.classList.remove('running');
  clearInterval(ticker); ticker = null;
  render();
}
function stop() {
  running = false;
  startBtn.textContent = '开始';
  startBtn.classList.remove('running');
  clearInterval(ticker); ticker = null;
}
function reset() {
  stop();
  total = remaining = durationFor(mode);
  render();
}
function tick() {
  // 用结束时间戳推算剩余,不靠累减,节流或休眠后依然准确
  remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
  if (remaining <= 0) { remaining = 0; render(); complete(); return; }
  render();
}
function complete() {
  stop();
  playChime();
  notify();
  if (mode === 'work') {
    recordPomodoro(settings.work);
    completedInCycle += 1;
    pomodoroIndex += 1;
    setMode((completedInCycle % settings.interval === 0) ? 'long' : 'short');
  } else {
    setMode('work');
  }
  if (settings.auto) start(); else render();
}

// ===== 声音(Web Audio,无需音频文件)=====
let audioCtx = null;
function playChime() {
  if (!settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
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
      osc.start(t); osc.stop(t + 0.42);
    });
  } catch (e) { /* 忽略 */ }
}
function notify() {
  const title = mode === 'work' ? '番茄完成!' : '休息结束!';
  const body = mode === 'work' ? '该休息一下了 🍅' : '开始下一个番茄吧 💪';
  try {
    if (Notification.permission === 'granted') new Notification(title, { body });
    else if (Notification.permission !== 'denied') Notification.requestPermission();
  } catch (e) { /* 忽略 */ }
}

// ===== 事件 =====
startBtn.addEventListener('click', () => { running ? pause() : start(); });
$('resetBtn').addEventListener('click', reset);
$('skipBtn').addEventListener('click', complete);
modeBtns.forEach(btn => btn.addEventListener('click', () => { stop(); setMode(btn.dataset.mode); }));
$('openMain').addEventListener('click', () => { if (window.tomato) window.tomato.openMain(); });

// hover 模式:鼠标在悬浮窗上时保持显示,离开则交给主进程延迟收起
if (window.tomato && window.tomato.hoverEnter) {
  document.addEventListener('mouseenter', () => window.tomato.hoverEnter());
  document.addEventListener('mouseleave', () => window.tomato.hoverLeave());
}

// ===== 待办(ToDo)=====
let ppPriority = 'high'; // 默认今天做完
const ppTaskInput = $('ppTaskInput');
const ppTaskList = $('ppTaskList');
const ppBadge = $('ppBadge');
const ppStatusTag = $('ppStatusTag');

// 同步状态栏:当前 Tab 决定显示待办数 or 倒计时
function syncTray() {
  if (!window.tomato || !window.tomato.setTray) return;
  if (currentPp === 'timer') window.tomato.setTray('pomodoro', running ? fmt(remaining) : '');
  else window.tomato.setTray('todo', loadTasks().filter(t => !t.done).length || '');
}

// 顶部 Tab:ToDo / 番茄
document.querySelectorAll('.top-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    currentPp = tab.dataset.pp;
    document.querySelectorAll('.top-tab').forEach(t => t.classList.toggle('active', t === tab));
    $('ppTimer').classList.toggle('hidden', currentPp !== 'timer');
    $('ppTasks').classList.toggle('hidden', currentPp !== 'tasks');
    document.body.classList.toggle('on-tasks', currentPp === 'tasks');
    if (currentPp === 'tasks') setTimeout(() => ppTaskInput.focus(), 0);
    syncTray();
  });
});

// 状态标签:点击循环切换(今天做完 → 这周做完 → 要做的)
function paintPpStatus() {
  const p = PRIORITY_MAP[ppPriority];
  ppStatusTag.textContent = p.label;
  ppStatusTag.dataset.prio = ppPriority;
  ppStatusTag.style.setProperty('--tagc', p.color);
}
ppStatusTag.addEventListener('click', () => { ppPriority = nextPriority(ppPriority); paintPpStatus(); });
paintPpStatus();

ppTaskInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const v = ppTaskInput.value.trim();
  if (!v) return;
  addTask(v, ppPriority);
  ppTaskInput.value = '';
  renderPpTasks();
});

function renderPpTasks() {
  const list = loadTasks();
  const active = list.filter(t => !t.done).length;
  ppBadge.textContent = active || '';
  ppBadge.style.display = active ? '' : 'none';

  ppTaskList.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'pp-empty';
    empty.textContent = '暂无待办';
    ppTaskList.appendChild(empty);
    syncTray();
    return;
  }
  PRIORITIES.forEach(p => {
    const items = sortTasks(list.filter(t => t.priority === p.key));
    const group = document.createElement('div');
    group.className = 'pp-group';
    const head = document.createElement('div');
    head.className = 'pp-group-head';
    head.innerHTML = `<span class="ghead" style="color:${p.color}">${p.label}</span>` +
      `<span class="gcnt">${items.filter(i => !i.done).length || ''}</span>`;
    group.appendChild(head);
    if (!items.length) {
      const ph = document.createElement('div');
      ph.className = 'group-empty'; ph.textContent = '拖到这里';
      group.appendChild(ph);
    } else {
      items.forEach(t => group.appendChild(ppRow(t, p)));
    }
    group.addEventListener('dragover', (e) => { e.preventDefault(); group.classList.add('drop-hover'); });
    group.addEventListener('dragleave', (e) => { if (!group.contains(e.relatedTarget)) group.classList.remove('drop-hover'); });
    group.addEventListener('drop', (e) => {
      e.preventDefault();
      group.classList.remove('drop-hover');
      const id = e.dataTransfer.getData('text/plain');
      if (id) { setTaskPriority(id, p.key); renderPpTasks(); }
    });
    ppTaskList.appendChild(group);
  });
  syncTray();
}

function ppRow(t, p) {
  const row = document.createElement('div');
  row.className = 'pp-row' + (t.done ? ' done' : '');
  row.draggable = true;
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
  const box = document.createElement('button');
  box.className = 'check';
  box.style.borderColor = p.color;
  if (t.done) { box.style.background = p.color; box.textContent = '✓'; }
  box.addEventListener('click', () => {
    const wasDone = t.done;
    toggleTask(t.id);
    if (!wasDone) { // 完成放烟花
      const r = box.getBoundingClientRect();
      burstConfetti(r.left + r.width / 2, r.top + r.height / 2, { count: 24 });
    }
    renderPpTasks();
  });
  const span = document.createElement('span');
  span.className = 'pp-text'; span.textContent = t.text;
  row.append(box, span);
  if (t.done && t.completedAt) {
    const time = document.createElement('span');
    time.className = 'pp-time'; time.textContent = formatMonthDay(t.completedAt);
    row.appendChild(time);
  }
  const del = document.createElement('button');
  del.className = 'pp-del'; del.textContent = '×'; del.title = '删除';
  del.addEventListener('click', () => { deleteTask(t.id); renderPpTasks(); });
  row.appendChild(del);
  return row;
}

// hover 弹出时:若在 ToDo 页,自动聚焦输入框,可直接打字
if (window.tomato && window.tomato.onShown) {
  window.tomato.onShown(() => { if (currentPp === 'tasks') setTimeout(() => ppTaskInput.focus(), 0); });
}

// 跨窗口同步:主窗口增删任务时实时刷新
window.addEventListener('storage', (e) => { if (e.key === TASKS_KEY) renderPpTasks(); });
renderPpTasks();

// 主题:跟随主窗口的设置('tomato_theme'),storage 事件实时同步
function applyPopupTheme() {
  const mode = localStorage.getItem('tomato_theme') || 'system';
  if (mode === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
}
window.addEventListener('storage', (e) => { if (e.key === 'tomato_theme') applyPopupTheme(); });
applyPopupTheme();

// 初始化
setMode('work');
render();
try { if (Notification.permission === 'default') Notification.requestPermission(); } catch {}
