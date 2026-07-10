// 任务数据层 · 主窗口与悬浮窗共享(localStorage 'tomato_tasks')
// 普通 script,顶层声明在全局作用域,renderer.js / popup.js 可直接调用。

const TASKS_KEY = 'tomato_tasks';

// 三档状态(按紧迫从高到低),用于循环切换
const PRIORITIES = [
  { key: 'high', label: '今天做完', color: '#4D8B66' }, // 清晰绿
  { key: 'mid',  label: '这周做完', color: '#6287B0' }, // 中明度蓝
  { key: 'low',  label: '要做的',   color: '#9A9EA5' }  // 浅中性灰
];
const PRIORITY_ORDER = { high: 0, mid: 1, low: 2 };
const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map(p => [p.key, p]));
const PRIORITY_KEYS = PRIORITIES.map(p => p.key);
function nextPriority(key) {
  const i = PRIORITY_KEYS.indexOf(key);
  return PRIORITY_KEYS[(i + 1) % PRIORITY_KEYS.length];
}
function prevPriority(key) {
  const i = PRIORITY_KEYS.indexOf(key);
  return PRIORITY_KEYS[(i - 1 + PRIORITY_KEYS.length) % PRIORITY_KEYS.length];
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
function purgeOldTrash() { // 清除回收站中超过 14 天的(任务 + 想法)
  const cutoff = Date.now() - TRASH_TTL;
  const list = loadTasks();
  const kept = list.filter(t => !(t.deleted && t.deletedAt && t.deletedAt < cutoff));
  if (kept.length !== list.length) saveTasks(kept);
  const ideas = loadIdeas();
  const keptIdeas = ideas.filter(i => !(i.deleted && i.deletedAt && i.deletedAt < cutoff));
  if (keptIdeas.length !== ideas.length) saveIdeas(keptIdeas);
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
function updateTaskText(id, text) {
  const list = loadTasks();
  const t = list.find(i => i.id === id);
  if (t) t.text = (text || '').trim();
  saveTasks(list);
  return list;
}
// 计划日期(due):'YYYY-MM-DD' 字符串,或 '' / null 清除
function setTaskDate(id, dateStr) {
  const list = loadTasks();
  const t = list.find(i => i.id === id);
  if (t) t.due = dateStr || null;
  saveTasks(list);
  return list;
}
// 把 'YYYY-MM-DD' 转成本地 Date(避免时区偏移)
function parseDue(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dueKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// 把 draggedId 移到 targetId 的前 / 后,并跟随目标的优先级(支持跨组拖拽排序)
function moveTask(draggedId, targetId, before) {
  const list = loadTasks();
  const from = list.findIndex(t => t.id === draggedId);
  if (from < 0 || draggedId === targetId) return list;
  const [item] = list.splice(from, 1);
  let to = list.findIndex(t => t.id === targetId);
  if (to < 0) { list.push(item); saveTasks(list); return list; }
  item.priority = list[to].priority;
  if (!before) to += 1;
  list.splice(to, 0, item);
  saveTasks(list);
  return list;
}
function clearDoneTasks() {
  const list = loadTasks().filter(i => !i.done);
  saveTasks(list);
  return list;
}

// 排序:完成的沉底;其余保持数组(手动拖拽)顺序(Array.sort 稳定)
function sortTasks(list) {
  return list.slice().sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
}

// ===== IDEA(随手记的想法)数据层 =====
// 与任务独立存储;无优先级、无完成态,只有文本 + 记录时间
const IDEAS_KEY = 'tomato_ideas';
function loadIdeas() {
  try { return JSON.parse(localStorage.getItem(IDEAS_KEY)) || []; }
  catch { return []; }
}
function saveIdeas(list) { localStorage.setItem(IDEAS_KEY, JSON.stringify(list)); }
function addIdea(text) {
  text = (text || '').trim();
  if (!text) return loadIdeas();
  const list = loadIdeas();
  list.push({ id: _genId(), text, createdAt: Date.now() });
  saveIdeas(list);
  return list;
}
function deleteIdea(id) { // 移入回收站(软删除)
  const list = loadIdeas();
  const i = list.find(x => x.id === id);
  if (i) { i.deleted = true; i.deletedAt = Date.now(); }
  saveIdeas(list);
  return list;
}
function restoreIdea(id) {
  const list = loadIdeas();
  const i = list.find(x => x.id === id);
  if (i) { i.deleted = false; i.deletedAt = null; }
  saveIdeas(list);
  return list;
}
function purgeIdea(id) {
  const list = loadIdeas().filter(x => x.id !== id);
  saveIdeas(list);
  return list;
}
function updateIdeaText(id, text) {
  const list = loadIdeas();
  const i = list.find(x => x.id === id);
  if (i) i.text = (text || '').trim();
  saveIdeas(list);
  return list;
}
// 想法转待办:默认进「要做的」,原想法移除
function ideaToTask(id, priority = 'low') {
  const ideas = loadIdeas();
  const idea = ideas.find(x => x.id === id);
  if (!idea) return loadTasks();
  addTask(idea.text, priority);
  saveIdeas(ideas.filter(x => x.id !== id));
  return loadTasks();
}
