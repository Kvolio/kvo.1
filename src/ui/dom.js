/** Tiny DOM helpers — enough structure to keep the panel code readable. */

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return n;
}

/**
 * Collapsed state lives outside the DOM so panels survive the periodic
 * rebuilds that keep the readouts live during a run.
 */
export const panelState = new Map();

export function panel(title, opts = {}) {
  const body = el('div', { class: 'body' });
  const tag = el('span', { class: 'tag' }, opts.tag || '');
  const head = el('h3', {}, title, tag);
  const collapsed = panelState.has(title) ? panelState.get(title) : !!opts.collapsed;
  const root = el('div', { class: `panel${collapsed ? ' collapsed' : ''}` }, head, body);
  head.addEventListener('click', () => {
    root.classList.toggle('collapsed');
    panelState.set(title, root.classList.contains('collapsed'));
  });
  root.body = body; root.tagEl = tag;
  return root;
}

export function row(label, control, valueEl) {
  return el('div', { class: 'row' }, el('label', {}, label), control || valueEl || '');
}

export function readout(label, id) {
  const v = el('span', { class: 'val', id });
  return { node: el('div', { class: 'row' }, el('label', {}, label), v), v };
}

export function num(value, opts = {}) {
  const i = el('input', {
    type: 'number', value: fmt(value, opts.dp), step: opts.step ?? 'any',
    min: opts.min, max: opts.max,
  });
  if (opts.onchange) {
    const fire = () => { const v = parseFloat(i.value); if (!Number.isNaN(v)) opts.onchange(v); };
    i.addEventListener('change', fire);
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { fire(); i.blur(); } });
  }
  return i;
}

const fmt = (v, dp) => (dp === undefined ? String(+(+v).toPrecision(6)) : (+v).toFixed(dp));

export function select(options, value, onchange) {
  const s = el('select', { onchange: (e) => onchange(e.target.value) });
  for (const o of options) {
    const opt = el('option', { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    s.appendChild(opt);
  }
  return s;
}

export function slider(min, max, value, step, oninput, format) {
  const out = el('span', { class: 'val' }, format ? format(value) : String(value));
  const r = el('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => { const v = +e.target.value; out.textContent = format ? format(v) : String(v); oninput(v); },
  });
  return { range: r, out };
}

export function toggle(label, value, onchange) {
  const b = el('button', {
    class: `mini${value ? ' on' : ''}`,
    onclick: () => { const nv = !b.classList.contains('on'); b.classList.toggle('on', nv); onchange(nv); },
  }, label);
  return b;
}

export function kv(rows) {
  const t = el('table', { class: 'kv' });
  for (const r of rows) {
    if (!r) continue;
    t.appendChild(el('tr', { class: r[2] || '' }, el('td', {}, r[0]), el('td', {}, r[1])));
  }
  return t;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
