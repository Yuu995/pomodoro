// 任务数据层 · 主窗口与悬浮窗共享(localStorage 'tomato_tasks')
// 普通 script,顶层声明在全局作用域,renderer.js / popup.js 可直接调用。

const TASKS_KEY = 'tomato_tasks';

// 三档状态(按紧迫从高到低),用于循环切换
const PRIORITIES = [
  { key: 'high', label: '今天做完', color: '#4a9d6e' }, // 低饱和绿
  { key: 'mid',  label: '这周做完', color: '#5b7791' }, // 低饱和钢蓝
  { key: 'low',  label: '要做的',   color: '#949aa3' }  // 中性灰
];
const PRIORITY_ORDER = { high: 0, mid: 1, low: 2 };
const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map(p => [p.key, p]));
const PRIORITY_KEYS = PRIORITIES.map(p => p.key);
function nextPriority(key) {
  const i = PRIORITY_KEYS.indexOf(key);
  return PRIORITY_KEYS[(i + 1) % PRIORITY_KEYS.length];
}
function formatMonthDay(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function _genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(TASKS_KEY)) || []; }
  catch { return []; }
}
function saveTasks(list) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(list));
}

function addTask(text, priority = 'high') {
  text = (text || '').trim();
  if (!text) return loadTasks();
  const list = loadTasks();
  list.push({ id: _genId(), text, priority, done: false, createdAt: Date.now() });
  saveTasks(list);
  return list;
}
function toggleTask(id) {
  const list = loadTasks();
  const t = list.find(i => i.id === id);
  if (t) {
    t.done = !t.done;
    t.completedAt = t.done ? Date.now() : null; // 记录完成时间
  }
  saveTasks(list);
  return list;
}
function deleteTask(id) { // 移入回收站(软删除)
  const list = loadTasks();
  const t = list.find(i => i.id === id);
  if (t) { t.deleted = true; t.deletedAt = Date.now(); }
  saveTasks(list);
  return list;
}
function restoreTask(id) { // 从回收站恢复
  const list = loadTasks();
  const t = list.find(i => i.id === id);
  if (t) { t.deleted = false; t.deletedAt = null; }
  saveTasks(list);
  return list;
}
function purgeTask(id) { // 彻底删除
  const list = loadTasks().filter(i => i.id !== id);
  saveTasks(list);
  return list;
}
const TRASH_TTL = 14 * 24 * 60 * 60 * 1000; // 回收站保留 14 天
function purgeOldTrash() { // 清除回收站中超过 14 天的
  const cutoff = Date.now() - TRASH_TTL;
  const list = loadTasks();
  const kept = list.filter(t => !(t.deleted && t.deletedAt && t.deletedAt < cutoff));
  if (kept.length !== list.length) saveTasks(kept);
  return kept;
}
function trashDaysLeft(t) { // 回收站剩余天数
  if (!t.deletedAt) return 14;
  const ms = (t.deletedAt + TRASH_TTL) - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
function setTaskPriority(id, key) {
  const list = loadTasks();
  const t = list.find(i => i.id === id);
  if (t) t.priority = key;
  saveTasks(list);
  return list;
}
function clearDoneTasks() {
  const list = loadTasks().filter(i => !i.done);
  saveTasks(list);
  return list;
}

// 排序:未完成在前,再按优先级,再按创建时间
function sortTasks(list) {
  return list.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority])
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return a.createdAt - b.createdAt;
  });
}
