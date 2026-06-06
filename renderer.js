// ===== ToDo 主窗口 =====
const $ = (id) => document.getElementById(id);
const taskInput = $('taskInput');
const taskList = $('taskList');
const taskBadge = $('cntAll'); // 未完成数显示在侧栏「全部」
const statusTag = $('statusTag');

let addPriority = 'high';   // 新任务默认「今天做完」
let currentFilter = 'all';  // all | done | trash
let currentView = 'list';   // list | calendar
let calCursor = null;       // 日历当前月 {y, m}

// 内容区大标题随侧栏过滤切换
const FILTER_TITLE = { all: '全部', done: '已完成', trash: '回收站' };
function setContentTitle(text) { const el = $('contentTitle'); if (el) el.textContent = text; }

// —— 添加区:状态标签循环切换 ——
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
taskInput.addEventListener('keydown', (e) => {
  // 上下键快速切换优先级(↑ 提高紧急度,↓ 降低)
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    addPriority = e.key === 'ArrowUp' ? prevPriority(addPriority) : nextPriority(addPriority);
    paintStatusTag();
    return;
  }
  // 跳过输入法组合态的回车(否则中文确认词时会误触发 / 不清空)
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) doAddTask();
});

// —— 左侧任务栏:全部 / 已完成 / 回收站 ——
document.querySelectorAll('.side-item').forEach(item => {
  item.addEventListener('click', () => {
    currentFilter = item.dataset.filter;
    document.querySelectorAll('.side-item').forEach(s => s.classList.toggle('active', s === item));
    $('taskAdd').style.display = currentFilter === 'all' ? '' : 'none';
    renderTasks();
  });
});

// —— 任务栏展开 / 收起(顶部统一按钮,位置固定) ——
const SIDEBAR_KEY = 'tomato_sidebar_collapsed';
function applySidebar() {
  const collapsed = localStorage.getItem(SIDEBAR_KEY) === '1';
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  const btn = $('sideToggle');
  if (btn) { btn.textContent = collapsed ? '»' : '«'; btn.title = collapsed ? '展开任务栏' : '收起任务栏'; }
}
$('sideToggle').addEventListener('click', () => {
  const collapsed = localStorage.getItem(SIDEBAR_KEY) === '1';
  localStorage.setItem(SIDEBAR_KEY, collapsed ? '0' : '1');
  applySidebar();
});
applySidebar();

// 窗口失焦时选中条变灰(macOS 原生行为)
window.addEventListener('focus', () => document.body.classList.remove('win-inactive'));
window.addEventListener('blur', () => document.body.classList.add('win-inactive'));
if (!document.hasFocus()) document.body.classList.add('win-inactive');

// —— 主题:跟随系统 → 浅色 → 深色 ——
const THEMES = ['system', 'light', 'dark'];
const THEME_ICON = { system: '◐', light: '☀', dark: '☾' };
let themeMode = localStorage.getItem('tomato_theme') || 'system';
function applyTheme() {
  if (themeMode === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', themeMode);
  const b = $('themeBtn'); if (b) b.textContent = THEME_ICON[themeMode];
}
$('themeBtn').addEventListener('click', () => {
  themeMode = THEMES[(THEMES.indexOf(themeMode) + 1) % THEMES.length];
  localStorage.setItem('tomato_theme', themeMode);
  applyTheme();
});
applyTheme();

// —— 列表 / 日历 视图切换 ——
document.querySelectorAll('.vt-btn').forEach(b => {
  b.addEventListener('click', () => {
    currentView = b.dataset.mode;
    document.querySelectorAll('.vt-btn').forEach(x => x.classList.toggle('active', x === b));
    const isCal = currentView === 'calendar';
    $('calendar').hidden = !isCal;
    $('taskList').hidden = isCal;
    document.querySelector('.sidebar').style.display = isCal ? 'none' : '';
    $('taskAdd').style.display = (isCal || currentFilter !== 'all') ? 'none' : '';
    isCal ? renderCalendar() : renderTasks();
  });
});

function refresh() { currentView === 'calendar' ? renderCalendar() : renderTasks(); }

// ===== 列表视图 =====
function renderTasks() {
  setContentTitle(FILTER_TITLE[currentFilter] || '全部');
  purgeOldTrash();
  const all = loadTasks();
  $('cntAll').textContent = all.filter(t => !t.deleted && !t.done).length || '';
  $('cntDone').textContent = all.filter(t => !t.deleted && t.done).length || '';
  $('cntTrash').textContent = all.filter(t => t.deleted).length || '';

  taskList.innerHTML = '';
  if (currentFilter === 'trash') return renderTrash(all.filter(t => t.deleted));
  if (currentFilter === 'done') return renderDone(all.filter(t => !t.deleted && t.done));
  renderAll(all.filter(t => !t.deleted));
}

function emptyHint(text) {
  const e = document.createElement('div'); e.className = 'task-empty'; e.textContent = text;
  taskList.appendChild(e);
}

function renderAll(list) {
  if (!list.length) return emptyHint('还没有待办，在上方添加一条吧');
  PRIORITIES.forEach(p => {
    const items = sortTasks(list.filter(t => t.priority === p.key));
    if (!items.length) return;            // 空优先级组不展示
    const group = document.createElement('div');
    group.className = 'task-group';
    const head = document.createElement('div');
    head.className = 'task-group-head';
    head.innerHTML = `<span class="ghead" style="color:${p.color}">${p.label}</span>` +
      `<span class="gcnt">${items.filter(i => !i.done).length || ''}</span>`;
    group.appendChild(head);
    const body = document.createElement('div');
    body.className = 'group-body';
    items.forEach(t => body.appendChild(taskRow(t)));
    group.appendChild(body);
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

function doneDateLabel(key) {
  const p = key.split('-').map(Number);
  return `${p[1]}月${p[2]}日`;
}
// 已完成:按完成日期聚合,去掉优先级颜色区分
function renderDone(list) {
  if (!list.length) return emptyHint('还没有已完成的任务');
  const groups = {};
  list.forEach(t => {
    const key = t.completedAt ? dueKey(new Date(t.completedAt)) : '__early';
    (groups[key] = groups[key] || []).push(t);
  });
  const keys = Object.keys(groups).sort((a, b) =>
    a === '__early' ? 1 : b === '__early' ? -1 : b.localeCompare(a));
  const todayKey = dueKey(new Date());
  keys.forEach(k => {
    const items = groups[k].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const group = document.createElement('div'); group.className = 'task-group';
    const head = document.createElement('div'); head.className = 'task-group-head';
    const label = k === '__early' ? '更早' : (k === todayKey ? '今天' : doneDateLabel(k));
    head.innerHTML = `<span class="ghead ghead-plain">${label}</span>` +
      `<span class="gcnt">${items.length}</span>`;
    group.appendChild(head);
    const body = document.createElement('div'); body.className = 'group-body';
    items.forEach(t => body.appendChild(doneRow(t)));
    group.appendChild(body);
    taskList.appendChild(group);
  });
}
function doneRow(t) {
  const row = document.createElement('div');
  row.className = 'task-row done';
  const box = document.createElement('button');
  box.className = 'check done-check'; box.textContent = '✓'; box.title = '点按标记未完成';
  box.addEventListener('click', () => { toggleTask(t.id); renderTasks(); });
  const span = document.createElement('span');
  span.className = 'task-text'; span.innerHTML = renderMarkdown(t.text); span.title = '双击编辑';
  span.addEventListener('dblclick', () => beginTaskEdit(row, span, t, renderTasks));
  row.append(box, span);
  const del = document.createElement('button');
  del.className = 'task-del'; del.textContent = '×'; del.title = '移入回收站';
  del.addEventListener('click', () => { deleteTask(t.id); renderTasks(); });
  row.appendChild(del);
  return row;
}

function renderTrash(list) {
  const tip = document.createElement('div');
  tip.className = 'trash-tip';
  tip.textContent = '回收站里的任务超过 14 天会自动清除';
  taskList.appendChild(tip);
  if (!list.length) return emptyHint('回收站是空的');
  list.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const body = document.createElement('div'); body.className = 'group-body';
  list.forEach(t => body.appendChild(trashRow(t)));
  taskList.appendChild(body);
}

function taskRow(t) {
  const p = PRIORITY_MAP[t.priority] || PRIORITIES[0];
  const row = document.createElement('div');
  row.className = 'task-row' + (t.done ? ' done' : '');
  row.draggable = currentFilter === 'all';
  if (row.draggable) {
    row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault(); e.stopPropagation();
      const rect = row.getBoundingClientRect();
      row.classList.toggle('drag-over-top', (e.clientY - rect.top) < rect.height / 2);
      row.classList.toggle('drag-over-bottom', (e.clientY - rect.top) >= rect.height / 2);
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
  box.className = 'check'; box.style.borderColor = p.color;
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
  const dot = document.createElement('span'); dot.className = 'trash-dot'; dot.style.background = p.color;
  const span = document.createElement('span'); span.className = 'task-text'; span.innerHTML = renderMarkdown(t.text);
  const days = document.createElement('span'); days.className = 'task-time'; days.textContent = `剩 ${trashDaysLeft(t)} 天`;
  const restore = document.createElement('button'); restore.className = 'row-act'; restore.textContent = '恢复';
  restore.addEventListener('click', () => { restoreTask(t.id); renderTasks(); });
  const purge = document.createElement('button'); purge.className = 'row-act danger'; purge.textContent = '彻底删除';
  purge.addEventListener('click', () => { purgeTask(t.id); renderTasks(); });
  row.append(dot, span, days, restore, purge);
  return row;
}

// ===== 日历视图 =====
function formatDueShort(s) { const d = parseDue(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ''; }

function pickDate(id) {
  const t = loadTasks().find(x => x.id === id);
  const inp = document.createElement('input');
  inp.type = 'date';
  if (t && t.due) inp.value = t.due;
  inp.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => { setTaskDate(id, inp.value); inp.remove(); refresh(); });
  inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 200));
  if (inp.showPicker) { try { inp.showPicker(); } catch { inp.click(); } } else inp.click();
}

function plainText(s) { return String(s).replace(/[*_~`#>\-]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim(); }

function renderCalendar() {
  setContentTitle('日历');
  const cal = $('calendar');
  const all = loadTasks().filter(t => !t.deleted);
  const now = new Date();
  if (!calCursor) calCursor = { y: now.getFullYear(), m: now.getMonth() };
  cal.innerHTML = '';

  const head = document.createElement('div'); head.className = 'cal-head';
  const prev = document.createElement('button'); prev.className = 'cal-nav'; prev.textContent = '‹';
  prev.onclick = () => { if (--calCursor.m < 0) { calCursor.m = 11; calCursor.y--; } renderCalendar(); };
  const next = document.createElement('button'); next.className = 'cal-nav'; next.textContent = '›';
  next.onclick = () => { if (++calCursor.m > 11) { calCursor.m = 0; calCursor.y++; } renderCalendar(); };
  const title = document.createElement('div'); title.className = 'cal-title'; title.textContent = `${calCursor.y} 年 ${calCursor.m + 1} 月`;
  const todayBtn = document.createElement('button'); todayBtn.className = 'cal-today'; todayBtn.textContent = '今天';
  todayBtn.onclick = () => { calCursor = { y: now.getFullYear(), m: now.getMonth() }; renderCalendar(); };
  head.append(prev, title, next, todayBtn);
  cal.appendChild(head);

  const wk = document.createElement('div'); wk.className = 'cal-week';
  ['日', '一', '二', '三', '四', '五', '六'].forEach(d => { const e = document.createElement('div'); e.className = 'cal-wd'; e.textContent = d; wk.appendChild(e); });
  cal.appendChild(wk);

  const grid = document.createElement('div'); grid.className = 'cal-grid';
  const startDow = new Date(calCursor.y, calCursor.m, 1).getDay();
  const daysInMonth = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
  const todayStr = dueKey(now);
  const byDue = {};
  all.forEach(t => {
    // 已完成按完成日期落格,未完成按计划日期落格
    const key = t.done ? (t.completedAt ? dueKey(new Date(t.completedAt)) : t.due) : t.due;
    if (key) (byDue[key] = byDue[key] || []).push(t);
  });

  for (let i = 0; i < startDow; i++) { const c = document.createElement('div'); c.className = 'cal-cell empty'; grid.appendChild(c); }
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div'); cell.className = 'cal-cell';
    const key = dueKey(new Date(calCursor.y, calCursor.m, d));
    if (key === todayStr) cell.classList.add('today');
    const num = document.createElement('div'); num.className = 'cal-num'; num.textContent = d;
    cell.appendChild(num);
    (byDue[key] || []).forEach(t => {
      const chip = document.createElement('div');
      chip.className = 'cal-chip' + (t.done ? ' done' : '');
      chip.style.setProperty('--tagc', (PRIORITY_MAP[t.priority] || PRIORITIES[0]).color);
      chip.textContent = plainText(t.text).slice(0, 14) || '任务';
      chip.title = t.text;
      chip.draggable = true;
      chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; });
      chip.addEventListener('click', () => {
        const wasDone = t.done; toggleTask(t.id);
        if (!wasDone) { const r = chip.getBoundingClientRect(); burstConfetti(r.left + r.width / 2, r.top + r.height / 2, { count: 16 }); }
        renderCalendar();
      });
      cell.appendChild(chip);
    });
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('cal-drop'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('cal-drop'));
    cell.addEventListener('drop', (e) => { e.preventDefault(); cell.classList.remove('cal-drop'); const id = e.dataTransfer.getData('text/plain'); if (id) { setTaskDate(id, key); renderCalendar(); } });
    grid.appendChild(cell);
  }
  cal.appendChild(grid);

  // 未排期(无 due 的未完成任务)
  const un = all.filter(t => !t.due && !t.done);
  const box = document.createElement('div'); box.className = 'cal-unscheduled';
  const h = document.createElement('div'); h.className = 'cal-un-title'; h.textContent = un.length ? '未排期 · 拖到日期排期' : '没有未排期的任务';
  box.appendChild(h);
  if (un.length) {
    const list = document.createElement('div'); list.className = 'cal-un-list';
    un.forEach(t => {
      const chip = document.createElement('div'); chip.className = 'cal-unchip'; chip.draggable = true;
      chip.style.setProperty('--tagc', (PRIORITY_MAP[t.priority] || PRIORITIES[0]).color);
      chip.textContent = plainText(t.text).slice(0, 18) || '任务';
      chip.title = t.text;
      chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; });
      list.appendChild(chip);
    });
    box.appendChild(list);
  }
  cal.appendChild(box);
}

// ===== 初始化 =====
renderTasks();
