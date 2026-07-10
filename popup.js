// ===== 状态栏快捷待办悬浮窗 =====
const $ = (id) => document.getElementById(id);
const ppTaskInput = $('ppTaskInput');
const ppTaskList = $('ppTaskList');
const ppStatusTag = $('ppStatusTag');
const ppIdeaInput = $('ppIdeaInput');
let ppPriority = 'high';
let allowAutoFocus = false;

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

// —— TODO / IDEA 模式切换:hover 即切,默认 TODO ——
let ppMode = localStorage.getItem('tomato_popup_mode') || 'todo';
function applyPpMode() {
  const isIdea = ppMode === 'idea';
  document.querySelectorAll('.pm-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === ppMode));
  ppStatusTag.hidden = isIdea;
  ppTaskInput.hidden = isIdea;
  ppIdeaInput.hidden = !isIdea;
  renderPp();
}
function switchPpMode(mode, shouldFocus = false) {
  const focusEl = () => (mode === 'idea' ? ppIdeaInput : ppTaskInput).focus();
  if (mode === ppMode) { if (shouldFocus) focusEl(); return; }
  ppMode = mode;
  localStorage.setItem('tomato_popup_mode', ppMode);
  applyPpMode();
  if (shouldFocus) focusEl();
}
document.querySelectorAll('.pm-btn').forEach(b => {
  b.addEventListener('click', () => switchPpMode(b.dataset.mode, true));
  b.addEventListener('mouseenter', () => switchPpMode(b.dataset.mode, allowAutoFocus)); // hover 即切换
});
function renderPp() { ppMode === 'idea' ? renderPpIdeas() : renderPpTasks(); }

// 想法输入:多行 textarea,回车保存 / Shift+Enter 换行,内容支持 markdown
function ppIdeaAutosize() { ppIdeaInput.style.height = 'auto'; ppIdeaInput.style.height = Math.min(ppIdeaInput.scrollHeight, 120) + 'px'; }
ppIdeaInput.addEventListener('input', ppIdeaAutosize);
ppIdeaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    const v = ppIdeaInput.value.trim();
    if (!v) return;
    addIdea(v); ppIdeaInput.value = ''; ppIdeaAutosize(); renderPp();
  }
});

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
  renderPp();
});

$('openMain').addEventListener('click', () => { if (window.tomato) window.tomato.openMain(); });

// hover 弹出时按主进程判断决定是否聚焦:其他应用内打开时不抢当前输入焦点
if (window.tomato && window.tomato.onShown) {
  window.tomato.onShown(({ focusInput }) => {
    allowAutoFocus = Boolean(focusInput);
    if (!focusInput) return;
    setTimeout(() => (ppMode === 'idea' ? ppIdeaInput : ppTaskInput).focus(), 0);
  });
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
  if (e.key === TASKS_KEY || e.key === IDEAS_KEY) renderPp();
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

// ===== 想法模式:平铺流水,新的在上 =====
const PP_BULB_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.7.55-1.1 1.3-1.1 2.2H9.5c0-.9-.4-1.65-1.1-2.2A6 6 0 0 1 12 3z"/></svg>';
function ppIdeaTime(ts) {
  const d = new Date(ts || 0);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return dueKey(d) === dueKey(new Date()) ? hm : `${d.getMonth() + 1}月${d.getDate()}日`;
}
function renderPpIdeas() {
  purgeOldTrash();
  const list = loadIdeas().filter(i => !i.deleted).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  ppTaskList.innerHTML = '';
  if (!list.length) {
    const e = document.createElement('div'); e.className = 'pp-empty'; e.textContent = '还没有想法,随手记一条吧 💡';
    ppTaskList.appendChild(e); syncTray(); return;
  }
  list.forEach(i => ppTaskList.appendChild(ppIdeaRow(i)));
  syncTray();
}
function ppIdeaRow(idea) {
  const row = document.createElement('div');
  row.className = 'pp-row idea';
  const bulb = document.createElement('span');
  bulb.className = 'pp-bulb'; bulb.innerHTML = PP_BULB_SVG;
  const span = document.createElement('span');
  span.className = 'pp-text'; span.innerHTML = renderMarkdown(idea.text); span.title = '双击编辑';
  span.addEventListener('dblclick', () => beginTaskEdit(row, span, idea, renderPp, updateIdeaText));
  const time = document.createElement('span'); time.className = 'pp-time'; time.textContent = ppIdeaTime(idea.createdAt);
  const conv = document.createElement('button');
  conv.className = 'pp-act pp-icon-act'; conv.title = '转成「要做的」待办';
  conv.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="4.5" width="11" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 10.5l3.1 3.1L15 6.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  conv.setAttribute('aria-label', '转成待办');
  conv.addEventListener('click', () => { ideaToTask(idea.id, 'low'); renderPp(); });
  const del = document.createElement('button');
  del.className = 'pp-del'; del.textContent = '×'; del.title = '移入回收站';
  del.addEventListener('click', () => { deleteIdea(idea.id); renderPp(); });
  row.append(bulb, span, time, conv, del);
  return row;
}

applyPpMode();
