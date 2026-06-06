// ===== 状态栏快捷待办悬浮窗 =====
const $ = (id) => document.getElementById(id);
const ppTaskInput = $('ppTaskInput');
const ppTaskList = $('ppTaskList');
const ppStatusTag = $('ppStatusTag');
let ppPriority = 'high';

// 状态栏图标旁显示未完成数量
function syncTray() {
  if (window.tomato && window.tomato.setTray) {
    window.tomato.setTray('todo', loadTasks().filter(t => !t.deleted && !t.done).length || '');
  }
}

// 状态标签:点击循环
function paintPpStatus() {
  const p = PRIORITY_MAP[ppPriority];
  ppStatusTag.textContent = p.label;
  ppStatusTag.dataset.prio = ppPriority;
  ppStatusTag.style.setProperty('--tagc', p.color);
}
ppStatusTag.addEventListener('click', () => { ppPriority = nextPriority(ppPriority); paintPpStatus(); });
paintPpStatus();

ppTaskInput.addEventListener('keydown', (e) => {
  // 上下键快速切换优先级
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    ppPriority = e.key === 'ArrowUp' ? prevPriority(ppPriority) : nextPriority(ppPriority);
    paintPpStatus();
    return;
  }
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
  const v = ppTaskInput.value.trim();
  if (!v) return;
  addTask(v, ppPriority);
  ppTaskInput.value = '';
  renderPpTasks();
});

$('openMain').addEventListener('click', () => { if (window.tomato) window.tomato.openMain(); });

// hover 弹出时自动聚焦输入框
if (window.tomato && window.tomato.onShown) {
  window.tomato.onShown(() => setTimeout(() => ppTaskInput.focus(), 0));
}
if (window.tomato && window.tomato.hoverEnter) {
  document.addEventListener('mouseenter', () => window.tomato.hoverEnter());
  document.addEventListener('mouseleave', () => window.tomato.hoverLeave());
}

// 主题:跟随主窗口设置
function applyPopupTheme() {
  const m = localStorage.getItem('tomato_theme') || 'system';
  if (m === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', m);
}
window.addEventListener('storage', (e) => {
  if (e.key === TASKS_KEY) renderPpTasks();
  if (e.key === 'tomato_theme') applyPopupTheme();
});
applyPopupTheme();

// 渲染:未删除;已完成只显示当天;空优先级标签不显示
function renderPpTasks() {
  purgeOldTrash();
  const today = dueKey(new Date());
  const list = loadTasks().filter(t =>
    !t.deleted && (!t.done || (t.completedAt && dueKey(new Date(t.completedAt)) === today))
  );
  ppTaskList.innerHTML = '';
  if (!list.length) {
    const e = document.createElement('div'); e.className = 'pp-empty'; e.textContent = '暂无待办';
    ppTaskList.appendChild(e); syncTray(); return;
  }
  PRIORITIES.forEach(p => {
    const items = sortTasks(list.filter(t => t.priority === p.key));
    if (!items.length) return;
    const group = document.createElement('div'); group.className = 'pp-group';
    const head = document.createElement('div'); head.className = 'pp-group-head';
    head.innerHTML = `<span class="ghead" style="color:${p.color}">${p.label}</span>` +
      `<span class="gcnt">${items.filter(i => !i.done).length || ''}</span>`;
    group.appendChild(head);
    const body = document.createElement('div'); body.className = 'pp-group-body';
    items.forEach(t => body.appendChild(ppRow(t, p)));
    group.appendChild(body);
    group.addEventListener('dragover', (e) => { e.preventDefault(); group.classList.add('drop-hover'); });
    group.addEventListener('dragleave', (e) => { if (!group.contains(e.relatedTarget)) group.classList.remove('drop-hover'); });
    group.addEventListener('drop', (e) => {
      e.preventDefault(); group.classList.remove('drop-hover');
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
  row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
  row.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = row.getBoundingClientRect();
    const before = (e.clientY - r.top) < r.height / 2;
    row.classList.toggle('drag-over-top', before);
    row.classList.toggle('drag-over-bottom', !before);
  });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over-top', 'drag-over-bottom'));
  row.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    row.classList.remove('drag-over-top', 'drag-over-bottom');
    const id = e.dataTransfer.getData('text/plain');
    const r = row.getBoundingClientRect();
    const before = (e.clientY - r.top) < r.height / 2;
    if (id && id !== t.id) { moveTask(id, t.id, before); renderPpTasks(); }
  });
  const box = document.createElement('button');
  box.className = 'check'; box.style.borderColor = p.color;
  if (t.done) { box.style.background = p.color; box.textContent = '✓'; }
  box.addEventListener('click', () => {
    const wasDone = t.done; toggleTask(t.id);
    if (!wasDone) { const r = box.getBoundingClientRect(); burstConfetti(r.left + r.width / 2, r.top + r.height / 2, { count: 24 }); }
    renderPpTasks();
  });
  const span = document.createElement('span');
  span.className = 'pp-text'; span.innerHTML = renderMarkdown(t.text); span.title = '双击编辑';
  span.addEventListener('dblclick', () => beginTaskEdit(row, span, t, renderPpTasks));
  row.append(box, span);
  if (t.done && t.completedAt) {
    const time = document.createElement('span'); time.className = 'pp-time'; time.textContent = formatMonthDay(t.completedAt);
    row.appendChild(time);
  }
  const del = document.createElement('button');
  del.className = 'pp-del'; del.textContent = '×'; del.title = '移入回收站';
  del.addEventListener('click', () => { deleteTask(t.id); renderPpTasks(); });
  row.appendChild(del);
  return row;
}

renderPpTasks();
