'use strict';
(() => {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');
  let data, revision = -1, request = 0, pending = 0, error = '';
  let project = 'all', filter = 'all', query = '';
  const expanded = new Set();
  const icons = {
    beacon: '<path d="M12 3v18m-4 0h8M8 8a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    folder: '<path d="M3 7V5h6l2 2h10v13H3z"/>',
    refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    language: '<path d="M3 5h12M9 3v2m-4 0c1 6 3 8 9 11m-2-11c0 5-3 9-8 11m11 5 4-11 4 11m-6-4h4"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
  };
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24'); node.setAttribute('aria-hidden', 'true');
    node.innerHTML = icons[name] || icons.grid; // Only the fixed icon catalogue above is HTML.
    return node;
  }
  function button(label, name, onClick, className = 'button') {
    const node = el('button', className);
    node.type = 'button'; if (name) node.append(icon(name));
    node.append(el('span', '', label)); node.title = label;
    node.setAttribute('aria-label', label);
    node.disabled = !!pending; node.addEventListener('click', onClick);
    return node;
  }
  function action(label, name, command, key, className) {
    const node = button(label, name, () => send(command, key), className);
    node.dataset.action = command;
    node.dataset.focus = 'action-' + command + '-' + (key || 'global');
    return node;
  }
  function send(command, key) {
    if (pending) return;
    pending = ++request; error = '';
    vscode.postMessage({type: 'action', id: pending, action: command, ...(key ? {key} : {})});
    render();
  }
  function count(value) {return new Intl.NumberFormat(data.language, {notation: 'compact', maximumFractionDigits: 2}).format(value);}
  function exact(value) {return new Intl.NumberFormat(data.language).format(value);}
  function dollars(value) {return value === null ? '—' : '≈$' + value.toFixed(4);}
  function time(value) {return new Date(value).toLocaleString(data.language, {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});}
  function metric(label, value, note, kind, click) {
    const node = el(click ? 'button' : 'div', 'metric ' + (kind || ''));
    if (click) {node.type = 'button'; node.addEventListener('click', click);}
    node.append(el('span', 'metric-label', label), el('strong', 'metric-value', value), el('span', 'metric-note', note));
    return node;
  }
  function matches(task, group) {
    const states = {running: ['running', 'waiting_async'], blocked: ['waiting_input', 'waiting_approval'],
      completed: ['completed'], failed: ['failed', 'cancelled']};
    if (filter === 'unread' && !task.unread) return false;
    if (states[filter] && !states[filter].includes(task.state)) return false;
    return !query.trim() || [group.title, group.cwd, group.source, task.title, task.model, task.session, task.stateLabel]
      .some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  }
  function taskCard(task) {
    const text = data.text;
    const card = el('article', 'task-card state-' + task.state + (task.unread ? ' is-unread' : ''));
    card.dataset.key = task.key;
    const heading = el('div', 'task-heading');
    const title = el('h3', '', task.title); title.title = task.title;
    heading.append(title, el('span', 'task-time', time(task.time)));
    const meta = el('div', 'task-meta');
    const model = el('span', 'task-model', task.model || text.unknown); model.title = text.model + ': ' + (task.model || text.unknown);
    const state = el('span', 'state-badge'); state.append(el('i', 'state-dot'), el('span', '', task.stateLabel));
    meta.append(model, state);
    if (task.turn) {const turn = el('span', 'task-turn', text.turn + ' ' + task.turn.slice(-8)); turn.title = task.turn; meta.append(turn);}
    const usage = el('div', 'task-usage');
    const tokens = el('div');
    tokens.append(el('span', 'field-label', 'Token'), el('strong', '', task.tokens === null ? '—' : count(task.tokens) + (task.complete ? '' : '*')));
    tokens.title = task.tokens === null ? text.noUsage : exact(task.tokens) + ' tokens';
    const cost = el('div'); cost.append(el('span', 'field-label', text.cost), el('strong', '', dollars(task.cost)));
    usage.append(tokens, cost);
    const actions = el('div', 'task-actions');
    actions.append(action(text.open, 'arrow', 'open', task.key, 'button open-button'),
      action(text.window, 'window', 'window', task.key, 'button icon-button'),
      action(text.read, 'check', 'read', task.key, 'button icon-button'),
      action(text.delete, 'trash', 'delete', task.key, 'button icon-button danger'));
    const details = el('details', 'task-details');
    details.open = expanded.has(task.key);
    details.append(el('summary', '', text.details), usage, el('pre', '', task.details), actions);
    details.addEventListener('toggle', () => {if (details.isConnected) details.open ? expanded.add(task.key) : expanded.delete(task.key);});
    if (task.unread) {
      const unread = el('span', 'unread-marker'); unread.title = text.unread;
      unread.setAttribute('aria-label', text.unread); heading.prepend(unread);
    }
    card.append(heading, meta, details);
    return card;
  }
  function render() {
    if (!data) return;
    const text = data.text;
    const focus = document.activeElement?.dataset.focus;
    const selection = focus === 'search' ? document.activeElement.selectionStart : null;
    const scroll = window.scrollY;
    if (project !== 'all' && !data.projects.some(item => item.id === project)) project = 'all';
    for (const key of expanded) if (!data.projects.some(item => item.tasks.some(task => task.key === key))) expanded.delete(key);
    document.documentElement.lang = data.language;
    app.replaceChildren(); app.setAttribute('aria-busy', 'false'); app.dataset.view = 'dashboard';
    const shell = el('div', 'shell');
    const header = el('header', 'header');
    const brand = el('div', 'brand'); brand.append(icon('beacon'), el('span', '', 'Codex Beacon'));
    const tools = el('div', 'header-tools');
    tools.append(action(text.refresh, 'refresh', 'refresh', undefined, 'button icon-button'),
      action(text.language, 'language', 'language', undefined, 'button icon-button'),
      action(text.settings, 'settings', 'settings', undefined, 'button icon-button'));
    header.append(brand, tools);
    const hero = el('section', 'hero');
    const intro = el('div'); intro.append(el('p', 'eyebrow', text.eyebrow), el('h1', '', text.title), el('p', 'subtitle', text.subtitle));
    const controls = el('div', 'hero-controls');
    const connection = data.privacyPaused ? text.privacyPaused : data.collectionState === 'error' ? text.error :
      data.connected ? (data.paused ? text.paused : text.connected) : text.disconnected;
    const signal = button(connection, '', () => send('status'), 'signal ' +
      (data.paused || !data.connected || data.collectionState === 'error' ? 'signal-warning' : ''));
    signal.prepend(el('i', 'signal-dot'));
    const sound = el('div', 'sound-controls');
    sound.append(action(text.sound, 'sound', 'sound'), action(text.preview, 'play', 'preview', undefined, 'button icon-button'));
    controls.append(signal, sound);
    hero.append(intro, controls);
    const summary = el('section', 'metrics');
    summary.setAttribute('aria-label', text.title);
    const total = data.totals;
    summary.append(metric(text.projects, String(total.projects), total.tasks + ' ' + text.tasks, '', () => {project = 'all'; filter = 'all'; render();}),
      metric(text.running, String(total.running), text.showAll, 'metric-running', () => {filter = 'running'; render();}),
      metric(text.blocked, String(total.blocked), total.unread + ' ' + text.unread, 'metric-blocked', () => {filter = 'blocked'; render();}));
    const workspace = el('div', 'workspace');
    const nav = el('aside', 'project-nav');
    nav.append(el('h2', 'section-label', text.projects));
    const projectButton = (id, title, note, amount, name) => {
      const node = button(title, name, () => {project = id; render();}, 'project-button' + (project === id ? ' selected' : ''));
      const content = node.querySelector('span'); content.append(el('small', '', note));
      node.append(el('b', 'project-count', String(amount)));
      node.setAttribute('aria-pressed', String(project === id));
      node.dataset.project = id;
      node.dataset.focus = 'project-' + id;
      return node;
    };
    nav.append(projectButton('all', text.allProjects, text.title, total.tasks, 'grid'));
    for (const group of data.projects) nav.append(projectButton(group.id, group.title,
      (group.current ? text.current + ' · ' : '') + group.source, group.tasks.length, 'folder'));
    const main = el('main', 'main');
    const toolbar = el('div', 'toolbar');
    const search = el('label', 'search'); search.append(icon('search'));
    const input = el('input'); input.type = 'search'; input.value = query; input.placeholder = text.search;
    input.setAttribute('aria-label', text.searchLabel); input.dataset.focus = 'search';
    input.addEventListener('input', () => {query = input.value; render();}); search.append(input);
    const pauseAction = data.privacyPaused ? 'privacy' : data.paused ? 'resume' : 'pause';
    toolbar.append(search, action(text[pauseAction], data.paused ? 'play' : 'pause', pauseAction),
      action(text.clearRead, 'check', 'clearRead', undefined, 'button icon-button'));
    const mobile = el('select', 'project-select'); mobile.setAttribute('aria-label', text.projects);
    for (const group of [{id: 'all', title: text.allProjects}, ...data.projects]) {
      const option = el('option', '', group.title + (group.source ? ' · ' + group.source : ''));
      option.value = group.id; option.selected = group.id === project; mobile.append(option);
    }
    mobile.addEventListener('change', () => {project = mobile.value; render();});
    const tabs = el('div', 'filters'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', text.tasks);
    for (const value of ['all', 'running', 'blocked', 'completed', 'failed', 'unread']) {
      const node = button(text[value], '', () => {filter = value; render();}, 'filter' + (filter === value ? ' active' : ''));
      node.setAttribute('aria-pressed', String(filter === value)); node.dataset.filter = value; tabs.append(node);
      node.dataset.focus = 'filter-' + value;
    }
    main.append(toolbar, mobile, tabs);
    if (error) {const notice = el('div', 'notice', error); notice.setAttribute('role', 'alert'); main.append(notice);}
    let shown = 0;
    const list = el('div', 'project-sections');
    for (const group of data.projects) {
      if (project !== 'all' && group.id !== project) continue;
      const tasks = group.tasks.filter(task => matches(task, group));
      if (!tasks.length) continue;
      shown += tasks.length;
      const section = el('section', 'project-section');
      const groupHeader = el('div', 'group-header');
      const identity = el('div', 'group-identity'); identity.append(icon('folder'), el('h2', '', group.title),
        el('span', 'group-source', group.source), el('span', 'count-badge', String(tasks.length)));
      identity.title = group.cwd;
      groupHeader.append(identity);
      const cards = el('div', 'task-grid'); tasks.forEach(task => cards.append(taskCard(task)));
      section.append(groupHeader, cards); list.append(section);
    }
    if (!shown) {
      const empty = el('section', 'empty'); empty.append(icon('beacon'),
        el('h2', '', total.tasks ? text.noMatches : text.emptyTitle), el('p', '', total.tasks ? text.search : text.emptyText));
      if (total.tasks) empty.append(button(text.reset, 'refresh', () => {project = 'all'; filter = 'all'; query = ''; render();}));
      list.append(empty);
    }
    main.append(list); workspace.append(nav, main);
    const footer = el('footer', 'footer', text.footer + ' * ' + text.partial + ' · — ' + text.unknown);
    const live = el('span', 'sr-only', String(shown) + ' ' + text.tasks); live.setAttribute('aria-live', 'polite');
    shell.append(header, hero, summary, workspace, footer, live); app.append(shell);
    if (focus) {
      const target = [...app.querySelectorAll('[data-focus]')].find(node => node.dataset.focus === focus);
      target?.focus({preventScroll: true});
      if (selection !== null && target) target.setSelectionRange(selection, selection);
    }
    window.scrollTo(0, scroll);
  }
  window.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'data' && message.revision >= revision) {
      revision = message.revision; data = message.data; render();
    }
    if (message?.type === 'result' && message.id === pending) {
      pending = 0; error = message.error || ''; render();
    }
  });
  vscode.postMessage({type: 'ready'});
})();
