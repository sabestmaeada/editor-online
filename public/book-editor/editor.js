/* ==============================================
   Book Editor — JavaScript (Complete Build + Base64 Fix)
   ============================================== */

// ===== STATE =====
let originalHeadHtml = '';
let savedSelection = null;
let fileName = '';
let editingImage = null;
let isDirty = false;
let cleanTitle = '';

// ===== TRACK CHANGES STATE =====
let currentUser = null;          // { name, color }
let trackingEnabled = false;
const trackUndoStack = [];
const trackRedoStack = [];
const TRACK_UNDO_LIMIT = 50;
const USER_STORAGE_KEY = 'bookEditor.user';
const TRACK_COLORS = [
  '#E55353', '#F5A623', '#F5C842', '#7CB342',
  '#1A6B52', '#26C6DA', '#5B7FFF', '#7E57C2',
  '#EC407A', '#FF7043', '#8D6E63', '#546E7A',
  '#9C27B0', '#3F51B5', '#009688', '#827717'
];
const TRACK_BLOCK_TAGS = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|UL|OL|FIGURE|FIGCAPTION|SECTION|ARTICLE|HEADER|FOOTER|NAV|ASIDE|MAIN|TABLE|TR|TD|TH|BODY|HTML|HR|PRE)$/;

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeLinkUrl(url) {
  const trimmed = String(url || '').trim();
  if (/^(javascript|vbscript|data|file):/i.test(trimmed)) return '#';
  return trimmed;
}

function safeImageUrl(url) {
  const trimmed = String(url || '').trim();
  if (/^(javascript|vbscript):/i.test(trimmed)) return '';
  return trimmed;
}

function setDirty(dirty) {
  isDirty = dirty;
  const titleEl = document.getElementById('docTitle');
  if (titleEl) titleEl.textContent = dirty ? '● ' + cleanTitle : cleanTitle;
  const dot = document.querySelector('.statusbar-dot');
  if (dot) dot.style.background = dirty ? '#E67E50' : '';
}

// ==============================================
// TRACK CHANGES — USER IDENTITY
// ==============================================

function generateUid() {
  return 'u-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

function loadCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    const u = raw ? JSON.parse(raw) : null;
    if (u && !u.uid) {
      u.uid = generateUid();
      persistCurrentUser(u);
    }
    return u;
  } catch (e) { return null; }
}

function persistCurrentUser(user) {
  try { localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user)); }
  catch (e) { /* localStorage blocked */ }
}

// hash uid → สี (stable: เปลี่ยนชื่อแล้วสีไม่กระโดด)
// พร้อมต่อ Firebase Auth: ใช้ firebase.auth().currentUser.uid โดยตรง
function pickColorForUid(uid) {
  let h = 0;
  for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TRACK_COLORS[Math.abs(h) % TRACK_COLORS.length];
}

// ===== TRACK COLOR REGISTRY =====
// uid → color (single source of truth ของสีต่อ user ใน session)
// CSS rule ถูก inject ตามแผน C: ไม่มี inline color บน <ins>/<del>
// → เปลี่ยนสี = อัพเดต rule ครั้งเดียว ทุก ins/del ของ user คนนั้นเปลี่ยนพร้อม
const trackColorMap = new Map();

function getColorStyleEl(doc) {
  if (!doc || !doc.head) return null;
  let el = doc.getElementById('__trackColorRules');
  if (!el) {
    el = doc.createElement('style');
    el.id = '__trackColorRules';
    el.setAttribute('data-editor-runtime', '');
    doc.head.appendChild(el);
  }
  return el;
}

function rebuildColorStyleSheet() {
  const doc = getDoc();
  const styleEl = getColorStyleEl(doc);
  if (!styleEl) return;
  let css = '';
  for (const [uid, color] of trackColorMap) {
    const safe = String(uid).replace(/["\\]/g, '\\$&');
    css += `ins[data-uid="${safe}"], del[data-uid="${safe}"] { color: ${color}; }\n`;
  }
  // Visual lock: cursor hint on tracked changes that don't belong to current user.
  // Actual edit-blocking happens in handleBeforeInput; this is just a UX cue.
  if (currentUser && currentUser.uid) {
    const myUid = String(currentUser.uid).replace(/["\\]/g, '\\$&');
    css += `ins[data-uid]:not([data-uid="${myUid}"]),\n`;
    css += `del[data-uid]:not([data-uid="${myUid}"]) { cursor: not-allowed; }\n`;
  }
  styleEl.textContent = css;
}

function applyUserColor(uid, color) {
  if (!uid || !color) return;
  trackColorMap.set(uid, color);
  rebuildColorStyleSheet();
}

function injectUserColorsForDoc(doc) {
  // strip inline color/CSS variable ที่อาจตกค้างจากไฟล์เก่า (ของ Beta-03 และก่อนหน้า)
  // → ให้ CSS rule per-uid จาก trackColorMap ทำงานเต็มที่
  doc.querySelectorAll('ins[data-uid], del[data-uid]').forEach(el => {
    if (el.style.color) el.style.color = '';
    if (el.style.getPropertyValue('--author-color')) el.style.removeProperty('--author-color');
    if (!el.getAttribute('style')) el.removeAttribute('style');

    const uid = el.getAttribute('data-uid');
    if (uid && !trackColorMap.has(uid)) {
      trackColorMap.set(uid, pickColorForUid(uid)); // default hash
    }
  });
  // override ของ user ปัจจุบัน (อาจเลือกสีเองผ่าน palette)
  if (currentUser && currentUser.uid) {
    trackColorMap.set(currentUser.uid, currentUser.color);
  }
  rebuildColorStyleSheet();
}

// (Firebase phase) preload user colors จาก Firestore:
// async function loadUserColorsFromFirestore(uids) {
//   const snap = await firestore.collection('users').where(FieldPath.documentId(), 'in', [...uids]).get();
//   snap.forEach(doc => trackColorMap.set(doc.id, doc.data().trackColor || pickColorForUid(doc.id)));
//   rebuildColorStyleSheet();
// }

function updateUserBadge() {
  const badge = document.getElementById('userBadge');
  if (!badge) return;
  const dot = document.getElementById('userBadgeDot');
  const nameEl = document.getElementById('userBadgeName');
  if (currentUser) {
    nameEl.textContent = currentUser.name;
    dot.style.background = currentUser.color;
    badge.style.borderColor = currentUser.color;
    // P2-S75: was hardcoded '#fff' — broke in light theme (white-on-white)
    // after editor reskin (P2-S73). Use --shell-text so the name follows
    // the active theme: zinc-900 on light surface, zinc-50 on dark.
    // The badge identity is still carried by the colored border + dot.
    badge.style.color = 'var(--shell-text)';
  } else {
    nameEl.textContent = 'ตั้งชื่อ';
    dot.style.background = 'var(--shell-text-dim)';
    badge.style.borderColor = '';
    badge.style.color = '';
  }
}

function renderColorPalette(selectedColor) {
  const wrap = document.getElementById('userColorPalette');
  if (!wrap) return;
  wrap.innerHTML = '';
  TRACK_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
    sw.style.background = c;
    sw.dataset.color = c;
    sw.addEventListener('click', () => {
      wrap.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      sw.dataset.picked = '1';
    });
    wrap.appendChild(sw);
  });
}

function showUserSetupModal() {
  // ต้องมี currentUser อยู่แล้ว (จาก auth หรือ default mock) — modal แค่ให้เปลี่ยนสี
  if (!currentUser) {
    showToast('ยังไม่มีข้อมูลผู้ใช้');
    return;
  }
  const nameDisplay = document.getElementById('userSetupName');
  nameDisplay.textContent = currentUser.name;
  renderColorPalette(currentUser.color);
  document.getElementById('userSetupModal').classList.add('show');
}

function closeUserSetup() {
  document.getElementById('userSetupModal').classList.remove('show');
}

function saveUserSetup() {
  if (!currentUser) return;
  const picked = document.querySelector('#userColorPalette .color-swatch.selected');
  const color = picked ? picked.dataset.color : currentUser.color;
  const prevColor = currentUser.color;
  currentUser = { ...currentUser, color };
  persistCurrentUser(currentUser);
  // อัพเดต CSS rule → ทุก ins/del ของ user คนนี้เปลี่ยนสีพร้อมกันทันที
  applyUserColor(currentUser.uid, currentUser.color);
  updateUserBadge();
  syncTrackingUI();
  closeUserSetup();

  // 2-way sync: แจ้ง Next.js parent → save ไป Firestore
  if (prevColor !== color) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'book-editor:color-change',
          uid: currentUser.uid,
          color: currentUser.color,
        }, window.location.origin);
      }
    } catch (e) { /* parent cross-origin or unavailable — standalone mode */ }
  }

  showToast(`เปลี่ยนสีเรียบร้อย`);
}

// โหลด user จาก auth — รับผ่าน URL hash จาก Next.js parent (Firebase Auth + Firestore)
// fallback: localStorage / mock เมื่อเปิดเป็น standalone โดยไม่มี hash
async function loadUserFromAuth() {
  try {
    const params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const uid = params.get('uid');
    const name = params.get('name');
    const colorFromHash = params.get('color');
    if (uid && name) {
      let color;
      if (colorFromHash && /^#[0-9a-fA-F]{6}$/.test(colorFromHash)) {
        color = colorFromHash;
      } else {
        const saved = loadCurrentUser();
        color = (saved && saved.uid === uid && saved.color)
          ? saved.color
          : pickColorForUid(uid);
      }
      return { uid, name, color };
    }
  } catch (e) { /* fall through to localStorage */ }

  const saved = loadCurrentUser();
  if (saved && saved.uid && saved.name) return saved;

  const uid = generateUid();
  return {
    uid,
    name: 'ผู้เขียน',
    color: pickColorForUid(uid)
  };
}

function toggleTracking() {
  if (!currentUser) {
    showToast('กำลังโหลดข้อมูลผู้ใช้...');
    return;
  }
  trackingEnabled = !trackingEnabled;
  syncTrackingUI();
  showToast(trackingEnabled
    ? `Track Changes เปิด — แก้ในนามของ ${currentUser.name}`
    : 'Track Changes ปิด');
}

function syncTrackingUI() {
  const btn = document.getElementById('trackToggle');
  if (btn) btn.classList.toggle('active', trackingEnabled);

  const area = document.getElementById('editorArea');
  if (area) area.classList.toggle('review-active', trackingEnabled);

  const nameEl = document.getElementById('reviewBannerName');
  if (nameEl && currentUser) nameEl.textContent = currentUser.name;

  if (currentUser) {
    document.documentElement.style.setProperty('--user-color', currentUser.color);
  }
}

// ==============================================
// TRACK CHANGES — INPUT INTERCEPTION
// ==============================================

function attachTrackingListeners(doc) {
  if (!doc.body || doc.body._trackBound) return;
  doc.body._trackBound = true;
  doc.body.addEventListener('beforeinput', handleBeforeInput);
}

// Walk up from `node` looking for an ins/del element owned by another user.
// Returns the element (so caller can read its data-name), or null.
function findOtherUserTC(node, currentUid) {
  if (!node) return null;
  let el = node.nodeType === 1 ? node : node.parentNode;
  while (el && el.nodeType === 1) {
    const tag = el.tagName;
    if (tag === 'BODY' || tag === 'HTML') return null;
    if ((tag === 'INS' || tag === 'DEL') && el.hasAttribute('data-uid')) {
      const uid = el.getAttribute('data-uid');
      if (uid && uid !== currentUid) return el;
    }
    el = el.parentNode;
  }
  return null;
}

// Check both endpoints of a range — if either lives inside another user's
// tracked change, return that element. Returns null when edit is safe.
function rangeTouchesOtherUserTC(range, currentUid) {
  if (!range) return null;
  return (
    findOtherUserTC(range.startContainer, currentUid)
    || findOtherUserTC(range.endContainer, currentUid)
  );
}

function handleBeforeInput(e) {
  if (!currentUser) return;

  // ──────────────────────────────────────────────────────────
  // Lock: block edits inside another user's tracked change.
  // Applies regardless of trackingEnabled — protects existing
  // TC from accidental edits even when current user has TC off.
  // ──────────────────────────────────────────────────────────
  const range = getLiveRangeFromEvent(e, getDoc());
  const otherTC = rangeTouchesOtherUserTC(range, currentUser.uid);
  if (otherTC) {
    e.preventDefault();
    const otherName = otherTC.getAttribute('data-name') || 'ผู้ใช้อื่น';
    const kind = otherTC.tagName === 'DEL' ? 'การลบ' : 'การแก้ไข';
    showToast(`🔒 ${kind}ของ ${otherName} — ใช้ ✓/✕ บน popover เพื่อยอมรับหรือปฏิเสธ`);
    return;
  }

  if (!trackingEnabled) return;

  if (e.inputType === 'insertText') {
    handleTrackedInsert(e);
    return;
  }
  if (e.inputType === 'deleteContentBackward'
      || e.inputType === 'deleteContentForward'
      || e.inputType === 'deleteByCut'
      || e.inputType.startsWith('delete')) {
    handleTrackedDelete(e);
    return;
  }
  // ปล่อย: insertParagraph (Enter), insertCompositionText (IME),
  // insertFromPaste, formatBold ฯลฯ
}

function getLiveRangeFromEvent(e, doc) {
  if (typeof e.getTargetRanges === 'function') {
    const ranges = e.getTargetRanges();
    if (ranges && ranges.length > 0) {
      const sr = ranges[0];
      try {
        const live = doc.createRange();
        live.setStart(sr.startContainer, sr.startOffset);
        live.setEnd(sr.endContainer, sr.endOffset);
        return live;
      } catch (err) { /* fall through */ }
    }
  }
  const sel = getWin().getSelection();
  if (sel.rangeCount > 0) return sel.getRangeAt(0).cloneRange();
  return null;
}

function handleTrackedInsert(e) {
  const data = e.data;
  if (data == null || data === '') return;

  const doc = getDoc();
  const live = getLiveRangeFromEvent(e, doc);
  if (!live) return;

  e.preventDefault();
  pushUndoSnapshot();

  if (!live.collapsed) {
    if (rangeCrossesBlocks(live)) {
      // selection คร่อม block — แค่ลบเฉย ๆ ไม่ wrap del
      live.deleteContents();
    } else {
      performTrackedDeleteInto(live, doc, false);
    }
  }

  // \u0E16\u0E49\u0E32 caret \u0E2D\u0E22\u0E39\u0E48\u0E20\u0E32\u0E22\u0E43\u0E19 ins \u0E02\u0E2D\u0E07\u0E40\u0E23\u0E32 \u2192 \u0E43\u0E2A\u0E48 text \u0E17\u0E35\u0E48\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07 caret (extend ins \u0E40\u0E14\u0E34\u0E21)
  // \u2192 \u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23\u0E16\u0E31\u0E14\u0E44\u0E1B\u0E01\u0E47\u0E08\u0E30\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19 ins \u0E40\u0E14\u0E34\u0E21 \u2192 \u0E01\u0E25\u0E32\u0E22\u0E40\u0E1B\u0E47\u0E19 "\u0E1A\u0E25\u0E47\u0E2D\u0E01\u0E40\u0E14\u0E35\u0E22\u0E27"
  const enclosingIns = findEnclosingInsForUser(live.startContainer, currentUser);
  if (enclosingIns) {
    const tn = doc.createTextNode(data);
    live.insertNode(tn); // insertNode \u0E08\u0E30 split text node \u0E16\u0E49\u0E32\u0E08\u0E33\u0E40\u0E1B\u0E47\u0E19
    live.setStart(tn, tn.length);
  } else {
    // \u0E44\u0E21\u0E48\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19 ins \u2192 \u0E2A\u0E23\u0E49\u0E32\u0E07 ins \u0E43\u0E2B\u0E21\u0E48 \u0E1E\u0E23\u0E49\u0E2D\u0E21 text \u2192 caret \u0E22\u0E49\u0E32\u0E22\u0E44\u0E1B "\u0E20\u0E32\u0E22\u0E43\u0E19" ins
    // \u2192 \u0E15\u0E31\u0E27\u0E2D\u0E31\u0E01\u0E29\u0E23\u0E16\u0E31\u0E14\u0E44\u0E1B\u0E08\u0E30\u0E15\u0E01\u0E40\u0E02\u0E49\u0E32 branch \u0E14\u0E49\u0E32\u0E19\u0E1A\u0E19 (extend ins \u0E40\u0E14\u0E34\u0E21 \u0E44\u0E21\u0E48\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E17\u0E38\u0E01\u0E15\u0E31\u0E27)
    const ins = makeInsEl(doc, currentUser, data);
    live.insertNode(ins);
    const insertedText = ins.firstChild; // text node \u0E17\u0E35\u0E48\u0E40\u0E1E\u0E34\u0E48\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E19 ins
    const merged = mergeAdjacentIns(ins);
    if (insertedText && insertedText.parentNode) {
      // text node \u0E22\u0E31\u0E07\u0E04\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19 DOM (\u0E2D\u0E32\u0E08\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19 merged) \u2014 caret \u0E44\u0E1B end \u0E02\u0E2D\u0E07 text \u0E19\u0E31\u0E49\u0E19
      live.setStart(insertedText, insertedText.length);
    } else {
      live.setStart(merged, merged.childNodes.length);
    }
  }
  live.collapse(true);
  setLiveSelection(live);

  setDirty(true);
  updateStatus();
}

function handleTrackedDelete(e) {
  const doc = getDoc();
  const live = getLiveRangeFromEvent(e, doc);
  if (!live || live.collapsed) return;

  // Cross-block delete (เช่น Backspace ที่ต้น p, Delete ที่ท้าย p — merge paragraph)
  // ปล่อย browser ทำเอง ไม่ต้อง track เพราะเป็น structural change
  if (rangeCrossesBlocks(live)) return;

  e.preventDefault();
  pushUndoSnapshot();
  const isBackward = e.inputType === 'deleteContentBackward';
  performTrackedDeleteInto(live, doc, isBackward);
  setLiveSelection(live);

  setDirty(true);
  updateStatus();
}

// "ว่างจริง" = textContent ว่าง + ไม่มี media/break ภายใน (กันลบ ins ที่มีแต่รูป/hr)
function isEmptyContent(el) {
  return el.textContent === '' && !el.querySelector('img,br,hr,svg,video,audio,iframe');
}

// ลบ wrapper ที่ว่างเปล่าทิ้ง + set range ที่ตำแหน่งที่ wrapper เคยอยู่ + normalize เพื่อ merge text nodes
function removeEmptyWrapper(wrapper, range) {
  const parent = wrapper.parentNode;
  if (!parent) return;
  const next = wrapper.nextSibling;
  wrapper.remove();
  if (next) range.setStartBefore(next);
  else range.setStart(parent, parent.childNodes.length);
  range.collapse(true);
  parent.normalize(); // merge text nodes ติดกันที่เคยถูกคั่นด้วย wrapper
}

function performTrackedDeleteInto(range, doc, isBackward) {
  if (range.collapsed) return;

  // (1) อยู่ใน <del> เดียวกัน (ของใครก็ได้) → shrink/ลบ del นั้น (un-delete)
  const startDel = findEnclosingDel(range.startContainer);
  const endDel = findEnclosingDel(range.endContainer);
  if (startDel && startDel === endDel) {
    range.deleteContents();
    if (isEmptyContent(startDel)) removeEmptyWrapper(startDel, range);
    return;
  }

  // (2) อยู่ใน <ins> ของเราเอง → ลบจริง (เพิ่งพิมพ์เอง)
  const startIns = findEnclosingInsForUser(range.startContainer, currentUser);
  const endIns = findEnclosingInsForUser(range.endContainer, currentUser);
  if (startIns && startIns === endIns) {
    range.deleteContents();
    if (isEmptyContent(startIns)) removeEmptyWrapper(startIns, range);
    return;
  }

  // (3) กรณีอื่น — extract + wrap เป็น <del> + merge
  const fragment = range.extractContents();
  if (!fragment || !fragment.firstChild) {
    range.collapse(true);
    return;
  }
  // Safety: ถ้า fragment ไม่มี text จริง ๆ (โครงสร้างเปล่า) → ไม่ wrap
  if (fragment.textContent.trim() === '' && !fragment.querySelector('img')) {
    range.collapse(true);
    return;
  }
  const del = makeDelEl(doc, currentUser);
  del.appendChild(fragment);
  range.insertNode(del);
  const merged = mergeAdjacentDel(del);

  if (isBackward) range.setStartBefore(merged);
  else range.setStartAfter(merged);
  range.collapse(true);
}

function setLiveSelection(range) {
  const sel = getWin().getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ไม่ใส่ inline color — ใช้ CSS rule per-uid (injected ผ่าน trackColorMap)
// → user เปลี่ยนสี = rule update = ทุก ins/del ของ user เปลี่ยนพร้อมกัน
function makeInsEl(doc, user, text) {
  const el = doc.createElement('ins');
  el.setAttribute('data-user', user.name);
  el.setAttribute('data-uid', user.uid);
  el.setAttribute('data-time', new Date().toISOString());
  if (text) el.appendChild(doc.createTextNode(text));
  return el;
}

function makeDelEl(doc, user) {
  const el = doc.createElement('del');
  el.setAttribute('data-user', user.name);
  el.setAttribute('data-uid', user.uid);
  el.setAttribute('data-time', new Date().toISOString());
  el.setAttribute('contenteditable', 'false'); // ล็อก: ห้ามคลิก/พิมพ์ภายใน
  return el;
}

function isOurIns(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE || el.tagName !== 'INS') return false;
  const uid = el.getAttribute('data-uid');
  if (uid) return uid === currentUser.uid;
  // legacy fallback: ของเก่าที่ไม่มี uid ใช้ชื่อเทียบ
  return el.getAttribute('data-user') === currentUser.name;
}

function isOurDel(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE || el.tagName !== 'DEL') return false;
  const uid = el.getAttribute('data-uid');
  if (uid) return uid === currentUser.uid;
  return el.getAttribute('data-user') === currentUser.name;
}

function isOnlyZwsp(n) {
  return n && n.nodeType === Node.TEXT_NODE && /^[​]+$/.test(n.nodeValue);
}

// ลบ ZWSP text node ที่ติดกับ el ในทิศที่ระบุ (prev/next) แล้วคืน sibling ที่อยู่ถัดจากนั้น
function stripZwspSibling(el, dir) {
  while (true) {
    const s = dir === 'prev' ? el.previousSibling : el.nextSibling;
    if (!isOnlyZwsp(s)) return s;
    s.remove();
  }
}

function mergeAdjacentIns(el) {
  let final = el;
  const prev = stripZwspSibling(final, 'prev');
  if (isOurIns(prev)) {
    while (final.firstChild) prev.appendChild(final.firstChild);
    final.remove();
    final = prev;
  }
  const next = stripZwspSibling(final, 'next');
  if (isOurIns(next)) {
    while (next.firstChild) final.appendChild(next.firstChild);
    next.remove();
  }
  return final;
}

function mergeAdjacentDel(el) {
  let final = el;
  const prev = stripZwspSibling(final, 'prev');
  if (isOurDel(prev)) {
    while (final.firstChild) prev.appendChild(final.firstChild);
    final.remove();
    final = prev;
  }
  const next = stripZwspSibling(final, 'next');
  if (isOurDel(next)) {
    while (next.firstChild) final.appendChild(next.firstChild);
    next.remove();
  }
  return final;
}

function findEnclosingInsForUser(node, user) {
  let n = node;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'INS') {
      const uid = n.getAttribute('data-uid');
      if (uid ? uid === user.uid : n.getAttribute('data-user') === user.name) return n;
    }
    n = n.parentNode;
  }
  return null;
}

function findEnclosingDel(node) {
  let n = node;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'DEL') return n;
    n = n.parentNode;
  }
  return null;
}

function findBlockAncestor(node) {
  let n = node;
  if (n && n.nodeType === Node.TEXT_NODE) n = n.parentNode;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE && TRACK_BLOCK_TAGS.test(n.tagName)) return n;
    n = n.parentNode;
  }
  return null;
}

function rangeCrossesBlocks(range) {
  const startBlock = findBlockAncestor(range.startContainer);
  const endBlock = findBlockAncestor(range.endContainer);
  return startBlock && endBlock && startBlock !== endBlock;
}

// ==============================================
// TRACK CHANGES — UNDO STACK
// preventDefault ทำให้ browser undo ไม่รู้จัก op ของเรา — เก็บ snapshot เอง
// ==============================================

// ==============================================
// TRACK CHANGES — ACCEPT / REJECT
// ==============================================

let currentTrackChangeNode = null;

function acceptAllChanges() {
  const doc = getDoc();
  if (!doc) return;
  const insertions = doc.querySelectorAll('ins[data-user]');
  const deletions = doc.querySelectorAll('del[data-user]');
  const total = insertions.length + deletions.length;
  if (total === 0) {
    showToast('ไม่มีการแก้ไขให้ยอมรับ');
    return;
  }
  if (!confirm(`ยอมรับการแก้ไขทั้งหมด ${total} รายการ?\n(เพิ่ม ${insertions.length} · ลบ ${deletions.length})`)) return;

  pushUndoSnapshot();
  insertions.forEach(ins => {
    while (ins.firstChild) ins.parentNode.insertBefore(ins.firstChild, ins);
    ins.remove();
  });
  deletions.forEach(del => del.remove());

  setDirty(true);
  updateStatus();
  showToast(`ยอมรับการแก้ไข ${total} รายการแล้ว`);
}

function acceptMyChanges() {
  if (!currentUser) {
    showToast('กรุณาตั้งชื่อผู้ใช้ก่อน');
    return;
  }
  const doc = getDoc();
  if (!doc) return;
  const myIns = Array.from(doc.querySelectorAll('ins[data-user]')).filter(isOurIns);
  const myDel = Array.from(doc.querySelectorAll('del[data-user]')).filter(isOurDel);
  const total = myIns.length + myDel.length;
  if (total === 0) {
    showToast('ไม่มีการแก้ไขของคุณให้ยอมรับ');
    return;
  }
  if (!confirm(`ยอมรับการแก้ไขของคุณ (${currentUser.name}) ทั้งหมด ${total} รายการ?\n(เพิ่ม ${myIns.length} · ลบ ${myDel.length})`)) return;

  pushUndoSnapshot();
  myIns.forEach(ins => {
    while (ins.firstChild) ins.parentNode.insertBefore(ins.firstChild, ins);
    ins.remove();
  });
  myDel.forEach(del => del.remove());

  setDirty(true);
  updateStatus();
  showToast(`ยอมรับการแก้ไขของคุณ ${total} รายการแล้ว`);
}

function rejectMyChanges() {
  if (!currentUser) {
    showToast('กรุณาตั้งชื่อผู้ใช้ก่อน');
    return;
  }
  const doc = getDoc();
  if (!doc) return;
  const myIns = Array.from(doc.querySelectorAll('ins[data-user]')).filter(isOurIns);
  const myDel = Array.from(doc.querySelectorAll('del[data-user]')).filter(isOurDel);
  const total = myIns.length + myDel.length;
  if (total === 0) {
    showToast('ไม่มีการแก้ไขของคุณให้ปฏิเสธ');
    return;
  }
  if (!confirm(`ปฏิเสธการแก้ไขของคุณ (${currentUser.name}) ทั้งหมด ${total} รายการ? (คืนค่ากลับเป็นต้นฉบับ)\n(เพิ่ม ${myIns.length} · ลบ ${myDel.length})`)) return;

  pushUndoSnapshot();
  myIns.forEach(ins => ins.remove());
  myDel.forEach(del => {
    while (del.firstChild) del.parentNode.insertBefore(del.firstChild, del);
    del.remove();
  });

  setDirty(true);
  updateStatus();
  showToast(`ปฏิเสธการแก้ไขของคุณ ${total} รายการแล้ว`);
}

function rejectAllChanges() {
  const doc = getDoc();
  if (!doc) return;
  const insertions = doc.querySelectorAll('ins[data-user]');
  const deletions = doc.querySelectorAll('del[data-user]');
  const total = insertions.length + deletions.length;
  if (total === 0) {
    showToast('ไม่มีการแก้ไขให้ปฏิเสธ');
    return;
  }
  if (!confirm(`ปฏิเสธการแก้ไขทั้งหมด ${total} รายการ? (คืนค่ากลับเป็นต้นฉบับ)\n(เพิ่ม ${insertions.length} · ลบ ${deletions.length})`)) return;

  pushUndoSnapshot();
  insertions.forEach(ins => ins.remove());
  deletions.forEach(del => {
    while (del.firstChild) del.parentNode.insertBefore(del.firstChild, del);
    del.remove();
  });

  setDirty(true);
  updateStatus();
  showToast(`ปฏิเสธการแก้ไข ${total} รายการแล้ว`);
}

// Tooltip ลอย แสดงชื่อผู้ใช้ตอน hover ที่ ins/del
// เหตุที่ใช้ JS แทน CSS ::after: เมื่อ ins/del wrap หลายบรรทัด ::after จะ anchor ที่ "บรรทัดสุดท้าย"
// ทำให้ดูชิดขวา — JS คำนวณกึ่งกลางจริงของ element ผ่าน getBoundingClientRect
function getOrCreateTrackTooltip() {
  let tip = document.getElementById('trackHoverTooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'trackHoverTooltip';
    tip.className = 'track-hover-tooltip';
    document.body.appendChild(tip);
  }
  return tip;
}

function bindTrackHoverTooltip(doc) {
  if (!doc.body || doc.body._tcHoverBound) return;
  doc.body._tcHoverBound = true;

  const tip = getOrCreateTrackTooltip();
  const frameEl = document.getElementById('editFrame');

  function showTip(target) {
    const name = target.getAttribute('data-user') || '';
    const uid = target.getAttribute('data-uid');
    const color = (uid && trackColorMap.get(uid)) || pickColorForUid(uid || name) || '#2c2c2e';
    tip.textContent = name;
    tip.style.background = color;
    tip.style.setProperty('--tooltip-bg', color);
    tip.classList.add('show');
    tip.classList.remove('bottom');

    // position: กึ่งกลาง element เหนือ element 8px (flip ลงล่างถ้าที่ไม่พอ)
    const frameRect = frameEl.getBoundingClientRect();
    const elRect = target.getBoundingClientRect();
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;
    let left = frameRect.left + elRect.left + elRect.width / 2 - tipW / 2;
    let top = frameRect.top + elRect.top - tipH - 8;
    if (top < 4) {
      top = frameRect.top + elRect.top + elRect.height + 8;
      tip.classList.add('bottom');
    }
    const pad = 4;
    if (left < pad) left = pad;
    if (left + tipW > window.innerWidth - pad) left = window.innerWidth - tipW - pad;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideTip() { tip.classList.remove('show'); }

  doc.body.addEventListener('mouseover', (e) => {
    const target = e.target.closest && e.target.closest('ins[data-user], del[data-user]');
    if (target) showTip(target);
  });
  doc.body.addEventListener('mouseout', (e) => {
    const target = e.target.closest && e.target.closest('ins[data-user], del[data-user]');
    if (target && (!e.relatedTarget || !target.contains(e.relatedTarget))) hideTip();
  });
  doc.addEventListener('scroll', hideTip, { passive: true });
  window.addEventListener('resize', hideTip);
}

function bindTrackChangesClicks(doc) {
  if (!doc.body || doc.body._tcClickBound) return;
  doc.body._tcClickBound = true;

  doc.addEventListener('contextmenu', (e) => {
    const target = e.target.closest && e.target.closest('ins[data-user], del[data-user]');
    if (target) {
      e.preventDefault();
      showTrackChangeMenu(target);
    }
  });
  doc.addEventListener('click', (e) => {
    const target = e.target.closest && e.target.closest('ins[data-user], del[data-user]');
    if (target) {
      e.stopPropagation();
      showTrackChangeMenu(target);
    } else {
      hideTrackChangeMenu();
    }
  });
  doc.addEventListener('scroll', hideTrackChangeMenu, { passive: true });
  window.addEventListener('resize', hideTrackChangeMenu);
}

function showTrackChangeMenu(node) {
  currentTrackChangeNode = node;
  const menu = document.getElementById('trackChangeMenu');
  if (!menu) return;

  const label = document.getElementById('trackPopoverLabel');
  if (label) label.textContent = node.tagName === 'INS' ? 'เพิ่ม' : 'ลบ';

  // เซ็ตสีตาม user ของ node เพื่อให้ปุ่ม match สี
  const userColor = node.style.color || '';
  menu.style.setProperty('--popover-accent', userColor || 'var(--shell-accent)');

  // แสดงก่อนเพื่อให้ offsetWidth/Height คำนวณได้
  menu.classList.add('show');
  menu.classList.remove('bottom');

  const frameEl = document.getElementById('editFrame');
  const frameRect = frameEl.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();

  // คำนวณตำแหน่ง (popover เป็น position:fixed → ใช้ viewport coord)
  const popW = menu.offsetWidth;
  const popH = menu.offsetHeight;
  let left = frameRect.left + nodeRect.left + nodeRect.width / 2 - popW / 2;
  let top = frameRect.top + nodeRect.top - popH - 10;

  // ถ้าไม่มีที่ด้านบน → flip ลงล่าง
  if (top < 8) {
    top = frameRect.top + nodeRect.top + nodeRect.height + 10;
    menu.classList.add('bottom');
  }

  // Clamp ซ้าย-ขวา ไม่ให้หลุดจอ
  const pad = 8;
  if (left < pad) left = pad;
  if (left + popW > window.innerWidth - pad) left = window.innerWidth - popW - pad;

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function hideTrackChangeMenu() {
  const menu = document.getElementById('trackChangeMenu');
  if (menu) menu.classList.remove('show');
  currentTrackChangeNode = null;
}

function acceptCurrentChange() {
  if (!currentTrackChangeNode) return;
  pushUndoSnapshot();
  
  const node = currentTrackChangeNode;
  if (node.tagName === 'INS') {
    while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
    node.remove();
  } else if (node.tagName === 'DEL') {
    node.remove();
  }
  
  hideTrackChangeMenu();
  setDirty(true);
  updateStatus();
}

function rejectCurrentChange() {
  if (!currentTrackChangeNode) return;
  pushUndoSnapshot();
  
  const node = currentTrackChangeNode;
  if (node.tagName === 'INS') {
    node.remove();
  } else if (node.tagName === 'DEL') {
    while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
    node.remove();
  }
  
  hideTrackChangeMenu();
  setDirty(true);
  updateStatus();
}

function clearTrackUndo() {
  trackUndoStack.length = 0;
  trackRedoStack.length = 0;
}

function getNodePath(node, root) {
  const path = [];
  while (node && node !== root) {
    const parent = node.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
    node = parent;
  }
  return node === root ? path : null;
}

function getNodeByPath(path, root) {
  let node = root;
  for (const idx of path) {
    if (!node || !node.childNodes[idx]) return null;
    node = node.childNodes[idx];
  }
  return node;
}

function captureUndoSnapshot() {
  const doc = getDoc();
  if (!doc || !doc.body) return null;
  let cursor = null;
  try {
    const sel = doc.defaultView.getSelection();
    if (sel.rangeCount) {
      const r = sel.getRangeAt(0);
      cursor = {
        startPath: getNodePath(r.startContainer, doc.body),
        startOffset: r.startOffset,
        endPath: getNodePath(r.endContainer, doc.body),
        endOffset: r.endOffset,
      };
    }
  } catch (e) { /* cursor optional */ }
  return { html: doc.body.innerHTML, cursor };
}

function restoreSnapshot(snap) {
  if (!snap) return;
  const doc = getDoc();
  doc.body.innerHTML = snap.html;
  if (snap.cursor && snap.cursor.startPath && snap.cursor.endPath) {
    try {
      const startNode = getNodeByPath(snap.cursor.startPath, doc.body);
      const endNode = getNodeByPath(snap.cursor.endPath, doc.body);
      if (startNode && endNode) {
        const range = doc.createRange();
        const maxStart = startNode.nodeType === Node.TEXT_NODE ? startNode.length : startNode.childNodes.length;
        const maxEnd = endNode.nodeType === Node.TEXT_NODE ? endNode.length : endNode.childNodes.length;
        range.setStart(startNode, Math.min(snap.cursor.startOffset, maxStart));
        range.setEnd(endNode, Math.min(snap.cursor.endOffset, maxEnd));
        const sel = doc.defaultView.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (e) { /* cursor restore is best-effort */ }
  }
}

function pushUndoSnapshot() {
  const snap = captureUndoSnapshot();
  if (!snap) return;
  trackUndoStack.push(snap);
  trackRedoStack.length = 0;
  if (trackUndoStack.length > TRACK_UNDO_LIMIT) trackUndoStack.shift();
}

function trackUndo() {
  if (trackUndoStack.length === 0) return false;
  const cur = captureUndoSnapshot();
  if (cur) trackRedoStack.push(cur);
  restoreSnapshot(trackUndoStack.pop());
  setDirty(true);
  updateStatus();
  return true;
}

function trackRedo() {
  if (trackRedoStack.length === 0) return false;
  const cur = captureUndoSnapshot();
  if (cur) trackUndoStack.push(cur);
  restoreSnapshot(trackRedoStack.pop());
  setDirty(true);
  updateStatus();
  return true;
}

// ===== FILE SYSTEM API & IMAGE STATE =====
let projectDirHandle = null;
let htmlFileHandle = null;
let activeObjectUrls = [];
window.tempInsertObjUrl = null;
let currentSelectedFile = null;
const projectImageCache = new Map(); // './images/foo.png' -> Blob/File (กัน OS disk sync ช้า)

// ตัวแปรสำคัญ: เก็บโค้ด Base64 ไว้ใน RAM เพื่อเลี่ยงปัญหา Input ถูกตัดโค้ดทิ้ง (Truncate)
let currentBase64Data = null; 

// ===== QUICK INSERT STATE =====
let hoveredBlock = null;
let isQuickMenuOpen = false;
let quickMenuHideTimeout = null;

// ==============================================
// IFRAME HELPERS
// ==============================================

function getDoc() {
  const fr = document.getElementById('editFrame');
  return fr.contentDocument || fr.contentWindow.document;
}

function getWin() {
  return document.getElementById('editFrame').contentWindow;
}


async function resolveProjectFile(rootHandle, relativePath) {
  if (!rootHandle || !relativePath) return null;
  const path = String(relativePath).replace(/^\.\//, '').replace(/^\//, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  let handle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    try { handle = await handle.getDirectoryHandle(parts[i]); }
    catch (e) { return null; }
  }
  try {
    const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
    return await fileHandle.getFile();
  } catch (e) { return null; }
}

async function resolveLinkedStylesheets(parsedDoc) {
  const result = { resolvedCss: '', resolvedHrefs: [] };
  if (!projectDirHandle || !parsedDoc.head) return result;

  const links = parsedDoc.head.querySelectorAll('link');
  for (const link of links) {
    const rel = (link.getAttribute('rel') || '').toLowerCase().trim();
    if (rel !== 'stylesheet') continue;
    const href = link.getAttribute('href');
    if (!href) continue;
    if (/^(https?:)?\/\//i.test(href)) continue;
    if (href.startsWith('data:')) continue;

    try {
      const file = await resolveProjectFile(projectDirHandle, href);
      if (file) {
        const text = await file.text();
        result.resolvedCss += `\n/* @ ${href} */\n${text}\n`;
        result.resolvedHrefs.push(href);
      } else {
        console.warn('ไม่พบไฟล์ CSS:', href);
      }
    } catch (e) {
      console.warn('โหลด CSS ผิดพลาด:', href, e);
    }
  }
  return result;
}

function mimeToExt(mime) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/x-icon': 'ico'
  };
  return map[(mime || '').toLowerCase()] || 'png';
}

function generateEmbedFilename(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+)/);
  const mime = match ? match[1] : 'image/png';
  return `embed-${Date.now()}.${mimeToExt(mime)}`;
}

async function safeBlobToUrl(blobOrFile) {
  try {
    return URL.createObjectURL(blobOrFile);
  } catch (e) {
    console.warn('[safeBlobToUrl] createObjectURL ถูกบล็อก (extension?):', e?.message);
    return await readFileAsDataUrl(blobOrFile);
  }
}

function safeRevokeObjectURL(url) {
  if (!url || !url.startsWith || !url.startsWith('blob:')) return;
  try { URL.revokeObjectURL(url); } catch (e) { /* extension may block */ }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function blobFromDataUrl(dataUrl) {
  const str = String(dataUrl || '');
  const commaIdx = str.indexOf(',');
  if (commaIdx === -1) throw new Error('Invalid data URL: ไม่พบเครื่องหมาย ","');
  const meta = str.slice(0, commaIdx);
  const data = str.slice(commaIdx + 1);
  const mime = (meta.match(/^data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const isBase64 = /;base64/i.test(meta);
  let bytes;
  if (isBase64) {
    const cleaned = data.replace(/\s/g, '');
    if (!cleaned) throw new Error('Base64 payload ว่างเปล่า');
    let bin;
    try { bin = atob(cleaned); }
    catch (e) { throw new Error('Base64 decode ล้มเหลว: ' + (e.message || e)); }
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    try { bytes = new TextEncoder().encode(decodeURIComponent(data)); }
    catch (e) { bytes = new TextEncoder().encode(data); }
  }
  return new Blob([bytes], { type: mime });
}

async function createObjectUrlForProjectImage(src) {
  if (!src || !src.startsWith('./images/')) return null;

  // 1) cache ก่อน — กันกรณีไฟล์เพิ่งเขียน OS ยัง flush ไม่เสร็จ
  if (projectImageCache.has(src)) {
    const objUrl = await safeBlobToUrl(projectImageCache.get(src));
    if (objUrl.startsWith('blob:')) activeObjectUrls.push(objUrl);
    return objUrl;
  }

  if (!projectDirHandle) return null;

  try {
    const filename = decodeURIComponent(src.replace('./images/', ''));
    const imgDirHandle = await projectDirHandle.getDirectoryHandle('images');
    const fileHandle = await imgDirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    projectImageCache.set(src, file);
    const objUrl = await safeBlobToUrl(file);
    if (objUrl.startsWith('blob:')) activeObjectUrls.push(objUrl);
    return objUrl;
  } catch (err) {
    console.warn('ไม่สามารถสร้าง preview รูปภาพจากโฟลเดอร์ images:', src, err);
    return null;
  }
}

async function resolveImagePreviewSrc(src) {
  if (!src) return '';
  if (src.startsWith('./images/')) {
    return (await createObjectUrlForProjectImage(src)) || src;
  }
  return src;
}

async function updateImagePreviewFromUrl(url) {
  const preview = document.getElementById('imgPreview');
  const previewImg = document.getElementById('imgPreviewSrc');
  if (!url) {
    preview.classList.remove('show');
    previewImg.removeAttribute('src');
    return;
  }

  previewImg.src = await resolveImagePreviewSrc(url);
  preview.classList.add('show');
}

function focusEditor() {
  getWin().focus();
}

// ==============================================
// FILE SYSTEM - เปิดโปรเจกต์
// ==============================================

async function ensureWritePermission(handle) {
  if (!handle) {
    console.warn('[ensureWritePermission] no handle');
    return false;
  }
  if (!handle.queryPermission || !handle.requestPermission) {
    console.warn('[ensureWritePermission] API not supported, assuming granted');
    return true;
  }
  try {
    const opts = { mode: 'readwrite' };
    const q = await handle.queryPermission(opts);
    console.log('[ensureWritePermission] query =', q);
    if (q === 'granted') return true;
    const r = await handle.requestPermission(opts);
    console.log('[ensureWritePermission] request =', r);
    if (r === 'granted') return true;
  } catch (e) {
    console.warn('[ensureWritePermission] failed:', e?.name, e?.message);
  }
  return false;
}

async function openProjectFolder() {
  try {
    projectDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    projectImageCache.clear();
    setDirty(false);

    let foundHtml = false;
    for await (const entry of projectDirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.html')) {
        htmlFileHandle = entry;
        fileName = entry.name;
        const file = await entry.getFile();
        const htmlText = await file.text();
        
        await processAndLoadHtml(htmlText, fileName);
        foundHtml = true;
        break;
      }
    }
    
    if (!foundHtml) {
      alert("ไม่พบไฟล์ .html ในโฟลเดอร์ที่เลือกครับ\nกรุณาเลือกโฟลเดอร์ที่มีไฟล์หนังสืออยู่");
    }
    
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      showToast("ไม่สามารถเปิดโฟลเดอร์ได้");
    }
  }
}

const DEFAULT_DOC_TITLE = 'เปิดโฟลเดอร์โปรเจกต์เพื่อเริ่มทำงาน';
const EDITOR_FALLBACK_CSS = new URL('css/style.css', document.baseURI).href;

function closeProject() {
  if (!projectDirHandle && !htmlFileHandle) {
    showToast('ยังไม่มีโปรเจกต์ที่เปิดอยู่');
    return;
  }
  if (isDirty) {
    document.getElementById('closeConfirmModal').classList.add('show');
    return;
  }
  doCloseProject();
}

function cancelCloseProject() {
  document.getElementById('closeConfirmModal').classList.remove('show');
}

function discardAndClose() {
  document.getElementById('closeConfirmModal').classList.remove('show');
  doCloseProject();
}

async function saveAndClose() {
  document.getElementById('closeConfirmModal').classList.remove('show');
  await saveProject();
  if (!isDirty) doCloseProject();
}

function doCloseProject() {
  activeObjectUrls.forEach(safeRevokeObjectURL);
  activeObjectUrls = [];
  clearTrackUndo();
  if (window.tempInsertObjUrl) {
    safeRevokeObjectURL(window.tempInsertObjUrl);
    window.tempInsertObjUrl = null;
  }

  try {
    const frame = document.getElementById('editFrame');
    const doc = frame.contentDocument || frame.contentWindow.document;
    if (doc) {
      if (doc.body) doc.body.innerHTML = '';
      doc.open();
      doc.write('<!DOCTYPE html><html><head><style>html,body{margin:0;background:#FDFBF7;}</style></head><body></body></html>');
      doc.close();
    }
  } catch (e) { /* iframe might be in transitional state */ }

  projectDirHandle = null;
  htmlFileHandle = null;
  fileName = '';
  originalHeadHtml = '';
  projectImageCache.clear();
  editingImage = null;
  savedSelection = null;
  currentSelectedFile = null;
  currentBase64Data = null;
  hoveredBlock = null;
  cleanTitle = DEFAULT_DOC_TITLE;
  setDirty(false);

  document.getElementById('sidebarList').innerHTML =
    '<div style="padding:20px;text-align:center;color:var(--shell-text-dim);font-size:12px;">ยังไม่ได้เปิดไฟล์</div>';
  document.getElementById('statusInfo').textContent = 'พร้อมใช้งาน';
  document.getElementById('quickInsertBtn').classList.remove('show', 'active');
  document.getElementById('quickInsertMenu').classList.remove('show');
  isQuickMenuOpen = false;

  document.getElementById('uploadOverlay').classList.remove('hidden');
  showToast('ปิดโฟลเดอร์แล้ว');
}

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  alert("กรุณาเปิดไฟล์ผ่านปุ่ม 'เปิดโฟลเดอร์' ครับ เพื่อให้เอดิเตอร์เห็นโครงสร้างไฟล์ภาพ");
});

// ==============================================
// แปลง HTML และ LOAD เข้าระบบ
// ==============================================

async function processAndLoadHtml(htmlString, name) {
  activeObjectUrls.forEach(safeRevokeObjectURL);
  activeObjectUrls = [];

  const parser = new DOMParser();
  const docObj = parser.parseFromString(htmlString, 'text/html');
  const images = docObj.querySelectorAll('img');

  let imgDirHandle = null;
  try {
    imgDirHandle = await projectDirHandle.getDirectoryHandle('images');
  } catch (e) {
    console.log("ยังไม่มีโฟลเดอร์ images ในโปรเจกต์");
  }

  const imgTasks = Array.from(images).filter(img => {
    const src = img.getAttribute('src');
    return src && src.startsWith('./images/');
  });

  // ตรวจครั้งแรกว่า URL.createObjectURL ใช้ได้ไหม — ถ้าโดน extension บล็อก
  // และไฟล์ใหญ่ จะปล่อยให้ src เป็น ./images/... แทนการ inline data URL
  // (ดีกว่า browser crash จาก OOM)
  let blobUrlsBlocked = false;
  try { URL.revokeObjectURL(URL.createObjectURL(new Blob(['test']))); }
  catch (e) { blobUrlsBlocked = true; }

  const SKIP_THRESHOLD = 30; // ถ้ารูปเกิน threshold + blob ถูกบล็อก = ข้ามการ inline
  const skipInline = blobUrlsBlocked && imgTasks.length > SKIP_THRESHOLD;
  if (skipInline) {
    console.warn(`[performance] ${imgTasks.length} รูป + extension บล็อก blob URL — ข้าม preview เพื่อไม่ให้ browser crash. ปิด extension แล้วลองใหม่จะได้ preview ครบ`);
    showToast(`รูปจะไม่แสดงใน editor (extension บล็อก blob URL) — ปิด extension เพื่อแก้`);
  }

  async function resolveOneImage(img) {
    const src = img.getAttribute('src');
    if (projectImageCache.has(src)) {
      const objUrl = await safeBlobToUrl(projectImageCache.get(src));
      img.setAttribute('data-original-src', src);
      img.setAttribute('src', objUrl);
      if (objUrl.startsWith('blob:')) activeObjectUrls.push(objUrl);
      return;
    }
    if (!imgDirHandle) return;
    const filename = src.replace('./images/', '');
    try {
      const fileHandle = await imgDirHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      // ถ้า skipInline: เก็บ cache แต่ไม่ resolve src → iframe จะ render broken
      // แต่หลัง save จะได้ ./images/... กลับมาเหมือนเดิม
      if (skipInline) {
        projectImageCache.set(src, file);
        img.setAttribute('data-original-src', src);
        return;
      }
      const objUrl = await safeBlobToUrl(file);
      projectImageCache.set(src, file);
      img.setAttribute('data-original-src', src);
      img.setAttribute('src', objUrl);
      if (objUrl.startsWith('blob:')) activeObjectUrls.push(objUrl);
    } catch (e) {
      console.warn("หาไฟล์รูปไม่เจอ:", filename);
    }
  }

  const CONCURRENCY = 8;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, imgTasks.length) }, async () => {
    while (cursor < imgTasks.length) {
      const i = cursor++;
      await resolveOneImage(imgTasks[i]);
    }
  });
  await Promise.all(workers);

  const linkResults = await resolveLinkedStylesheets(docObj);
  loadHtml(docObj, name, linkResults);
}

function loadHtml(parsedDoc, name, linkResults) {
  originalHeadHtml = parsedDoc.head ? parsedDoc.head.innerHTML : '';
  clearTrackUndo();

  const titleEl = parsedDoc.querySelector('title');
  const title = titleEl ? titleEl.textContent : name;
  cleanTitle = title;
  setDirty(isDirty);

  const bodyContent = parsedDoc.body ? parsedDoc.body.innerHTML : '';
  const lang = (parsedDoc.documentElement && parsedDoc.documentElement.getAttribute('lang')) || 'th';

  let previewHeadHtml = originalHeadHtml;
  if (linkResults && linkResults.resolvedHrefs.length > 0) {
    const tmp = document.createElement('div');
    tmp.innerHTML = originalHeadHtml;
    tmp.querySelectorAll('link').forEach(link => {
      const rel = (link.getAttribute('rel') || '').toLowerCase().trim();
      if (rel !== 'stylesheet') return;
      if (linkResults.resolvedHrefs.includes(link.getAttribute('href'))) link.remove();
    });
    previewHeadHtml = tmp.innerHTML + `\n<style data-resolved-link-css>\n${linkResults.resolvedCss}\n</style>`;
  }

  // ถ้า user HTML ไม่มี styling เลย — fallback ไปใช้ css/style.css ของ editor (preview-only ไม่บันทึก)
  const hasUserStyling = !!(parsedDoc.head && parsedDoc.head.querySelector('style, link[rel="stylesheet" i]'));
  if (!hasUserStyling) {
    previewHeadHtml += `\n<link rel="stylesheet" href="${EDITOR_FALLBACK_CSS}" data-editor-fallback>`;
    console.log('[fallback CSS] ไม่พบ styling ใน HTML ของผู้ใช้ — โหลด editor css/style.css เป็น preview');
  }

  const doc = getDoc();
  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
${previewHeadHtml}
<style data-editor-runtime>
.cover { min-height: auto !important; height: auto !important; }
.cover.cover-has-image { height: auto !important; margin: 0 !important; }
.cover-image { height: 400px !important; }
body { padding-bottom: 200px; }

.chapter:hover, .preface:hover, .toc:hover, .cover:hover {
  outline: 2px dashed rgba(26,107,82,.3);
  outline-offset: 4px;
}

[contenteditable]:focus { outline: none; }

@media screen {
  .content::after { display: none !important; }
}

::selection { background: rgba(26,107,82,.25); }

.content b, .content strong { font-weight: 600; color: var(--accent-dk); }
.content i, .content em { font-style: italic; }
.preface-content b, .preface-content strong { font-weight: 600; color: var(--accent-dk); }
.preface-content i, .preface-content em { font-style: italic; }

.book-img img, .cover-image, img {
  cursor: pointer;
  transition: outline .15s, box-shadow .15s;
}
.book-img img:hover, .cover-image:hover, .content img:hover {
  outline: 3px solid rgba(26,107,82,.5);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px rgba(26,107,82,.1);
}
.img-editing {
  outline: 3px solid #1A6B52 !important;
  outline-offset: 3px;
  box-shadow: 0 0 0 6px rgba(26,107,82,.18) !important;
}
.img-selected {
  outline: 2px solid rgba(26,107,82,.6) !important;
  outline-offset: 2px;
  cursor: pointer;
}
.book-img img:hover::after, img.img-selected::after {
  content: '';
}
.book-img:hover::before {
  content: 'ดับเบิลคลิกเพื่อแก้ไขรูป';
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0,0,0,.7);
  color: #fff;
  font-family: var(--hd);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 10;
}
.book-img { position: relative; }

/* Track Changes — ins / del rendering */
ins[data-user], del[data-user] { position: relative; }
ins[data-user] {
  text-decoration: none;
  background: rgba(0,0,0,.04);
  border-bottom: 2px solid currentColor;
  padding: 0 1px;
  border-radius: 2px;
}
del[data-user] {
  text-decoration: line-through;
  text-decoration-thickness: 2px;     /* เส้นขีดฆ่าหนาขึ้น = visual cue ที่ชัด */
  text-decoration-color: currentColor; /* ขีดสีเดียวกับ user */
  background-color: rgba(128,128,128,0.08); /* tint จาง ๆ บอก "ลบไปแล้ว" */
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  /* ไม่ใช้ opacity เพราะ inherit ลง ::after → tooltip โปร่งใส อ่านยาก */
}
ins[data-user]:hover, del[data-user]:hover {
  outline: 1px dashed currentColor;
  outline-offset: 1px;
}
/* tooltip แสดงชื่อผู้ใช้ — render ด้วย JS ใน parent document (ดู bindTrackHoverTooltip) */

/* Table cell currently targeted by the context menu.
   JS adds this class on showTableContextMenu, removes it on hide. The
   !important wins against tr:hover td so the highlight stays visible
   even when the user happens to be hovering elsewhere in the row. */
td.table-cell-targeted, th.table-cell-targeted {
  outline: 2px solid rgba(26,107,82,0.7) !important;
  outline-offset: -2px;
  background-color: rgba(26,107,82,0.08) !important;
}

/* ── Image number markers (P2-S81) ──────────────────────────────
   markers are % anchored inside .img-frame which wraps ONLY the
   image (not figcaption) so coords track the rendered image box.
   px units here are for screen editing; the book PDF (book-dev
   repo, styles/style_{bw,cmyk}.css) carries pt-unit equivalents. */
.book-img .img-frame {
  position: relative;
  display: inline-block;
  line-height: 0;
  max-width: 100%;
}
.img-markers {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;   /* don't block image clicks outside annotate mode */
}
.img-marker {
  position: absolute;
  box-sizing: border-box;
  width: 30px; height: 30px;               /* base = level 3 (default) */
  margin-left: -15px; margin-top: -15px;   /* center on the anchor point */
  border-radius: 50%;
  border: 2px solid #fff;                  /* white ring → readable on dark bg */
  background: #1A6B52; color: #fff;
  font-family: var(--hd, sans-serif);
  font-size: 15px; font-weight: 700;
  line-height: 26px; text-align: center;   /* 30 - 2*2px border; center digit */
  box-shadow: 0 1px 4px rgba(0,0,0,.5);    /* drop shadow → readable on light bg */
  user-select: none; cursor: default;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
/* marker size presets (per-image, class on .img-frame). base = level 3. */
.img-frame.msize-1 .img-marker {
  width: 18px; height: 18px; margin-left: -9px; margin-top: -9px;
  border-width: 1.5px; line-height: 15px; font-size: 10px;
}
.img-frame.msize-2 .img-marker {
  width: 24px; height: 24px; margin-left: -12px; margin-top: -12px;
  line-height: 20px; font-size: 12px;
}
.img-frame.msize-4 .img-marker {
  width: 38px; height: 38px; margin-left: -19px; margin-top: -19px;
  border-width: 2.5px; line-height: 33px; font-size: 18px;
}
/* annotate mode — frame interactive, markers grabbable */
.img-frame.annotating { cursor: crosshair; outline: 2px solid #1A6B52; outline-offset: 2px; }
.img-frame.annotating .img-markers { pointer-events: auto; }
.img-frame.annotating .img-marker { cursor: grab; }
.img-frame.annotating .img-marker.dragging { cursor: grabbing; }
.img-frame.annotating .img-marker.selected { box-shadow: 0 0 0 3px rgba(229,83,83,.6); }
/* suppress the "double-click to edit" hover hint while annotating */
.book-img:has(.img-frame.annotating):hover::before { display: none; }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    doc.body.setAttribute('contenteditable', 'true');
    doc.body.addEventListener('input', () => { setDirty(true); updateStatus(); });
    doc.addEventListener('keydown', handleEditorKeys);
    repairMarkerState(doc);  // P2-S81 — fix files saved while annotating
    bindMarkerEvents(doc);   // P2-S81 — must bind BEFORE bindImageClicks
    bindImageClicks(doc);
    bindAnchorClicks(doc);
    bindToolbarMenuDismiss(doc);  // P2-S83 — close align menu on iframe click/Esc
    buildSidebar(doc);
    bindHoverInsert(doc);
    bindTableContextMenu(doc);
    bindTableResize(doc);
    bindTableKeyboard(doc);
    attachTrackingListeners(doc);
    bindTrackChangesClicks(doc);
    bindTrackHoverTooltip(doc);
    injectUserColorsForDoc(doc);
    document.getElementById('uploadOverlay').classList.add('hidden');
    updateStatus();
    showToast('โหลดไฟล์สำเร็จ ✓');
  }, 200);
}

// ==============================================
// SIDEBAR
// ==============================================

function buildSidebar(doc) {
  const list = document.getElementById('sidebarList');
  list.innerHTML = '';

  const cover = doc.querySelector('.cover');
  if (cover) list.appendChild(createSidebarItem('📕', 'หน้าปก', '', () => scrollToEl(cover)));

  const preface = doc.querySelector('.preface');
  if (preface) list.appendChild(createSidebarItem('📝', 'คำนำ', '', () => scrollToEl(preface)));

  const toc = doc.querySelector('.toc');
  if (toc) list.appendChild(createSidebarItem('📋', 'สารบัญ', '', () => scrollToEl(toc)));

  const chapters = doc.querySelectorAll('.chapter');
  chapters.forEach((ch) => {
    const numEl = ch.querySelector('.ch-num');
    const titleEl = ch.querySelector('.ch-title');
    const metaEl = ch.querySelector('.ch-meta');
    const num = numEl ? numEl.textContent.trim() : '';
    const title = titleEl ? titleEl.textContent.trim() : 'ไม่มีชื่อ';
    const meta = metaEl ? metaEl.textContent.trim() : '';
    list.appendChild(createSidebarItem(num, title, meta, () => scrollToEl(ch)));
  });
}

function createSidebarItem(num, title, meta, onclick) {
  const div = document.createElement('div');
  div.className = 'sidebar-item';

  const numEl = document.createElement('div');
  numEl.className = 'sidebar-item-num';
  numEl.textContent = num;
  div.appendChild(numEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'sidebar-item-title';
  titleEl.textContent = title;
  div.appendChild(titleEl);

  if (meta) {
    const metaEl = document.createElement('div');
    metaEl.className = 'sidebar-item-meta';
    metaEl.textContent = meta;
    div.appendChild(metaEl);
  }

  div.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach((s) => s.classList.remove('active'));
    div.classList.add('active');
    onclick();
  });
  return div;
}

function scrollToEl(el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

// ==============================================
// EDITOR COMMANDS
// ==============================================

function execCmd(cmd, value) {
  // Track Changes มี undo stack ของตัวเอง — ใช้ก่อนถ้ามี snapshot
  if (cmd === 'undo' && trackUndoStack.length > 0) { trackUndo(); return; }
  if (cmd === 'redo' && trackRedoStack.length > 0) { trackRedo(); return; }
  focusEditor();
  getDoc().execCommand(cmd, false, value || null);
}

function execBlockFormat(tag) {
  focusEditor();
  if (tag === 'blockquote') {
    const sel = getWin().getSelection();
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const bq = getDoc().createElement('blockquote');
      try {
        range.surroundContents(bq);
      } catch (e) {
        // Selection ข้าม block — fallback ไปใช้ execCommand
        getDoc().execCommand('formatBlock', false, '<blockquote>');
      }
    }
  } else {
    getDoc().execCommand('formatBlock', false, `<${tag}>`);
  }
  document.getElementById('blockFormat').value = 'p';
}

function wrapInlineCode() {
  focusEditor();
  const sel = getWin().getSelection();
  if (!sel.rangeCount || sel.isCollapsed) {
    getDoc().execCommand('insertHTML', false, '<code class="inline-code">code</code>');
    return;
  }
  const range = sel.getRangeAt(0);
  const code = getDoc().createElement('code');
  code.className = 'inline-code';
  try {
    range.surroundContents(code);
  } catch (e) {
    // Selection ข้าม node — extract แล้ว wrap แทน (split boundary nodes ให้)
    try {
      code.appendChild(range.extractContents());
      range.insertNode(code);
    } catch (e2) {
      // กรณีสุดท้าย: ฉีดด้วย insertHTML (อาจ strip HTML ภายในออก)
      const text = sel.toString();
      getDoc().execCommand('insertHTML', false, `<code class="inline-code">${escapeHtml(text)}</code>`);
    }
  }
}

function insertCodeBlock() {
  focusEditor();
  const html = `
<div class="code-block">
  <div class="code-header">
    <span class="code-lang-badge">code</span>
    <span class="code-linecount">1 บรรทัด</span>
  </div>
  <pre><code><span class="line">// เขียนโค้ดที่นี่</span></code></pre>
</div>
<p><br></p>`;
  getDoc().execCommand('insertHTML', false, html);
}

function insertHR() {
  focusEditor();
  getDoc().execCommand('insertHTML', false, '<hr><p><br></p>');
}

function insertNoteBox() {
  focusEditor();
  // Plain "Note" label — the emoji 📌 was previously inserted here, but it
  // ends up in the saved HTML and causes color-profile / glyph fallback
  // issues when the book is converted to PDF for offset/grayscale printing.
  // Visual styling for the label should live in the book's own CSS.
  const html = `
<div class="note">
  <div class="note-label">Note</div>
  <p>เขียนหมายเหตุที่นี่</p>
</div>
<p><br></p>`;
  getDoc().execCommand('insertHTML', false, html);
}

// ==============================================
// TABLE — INSERT + EDIT (Phase 1)
// ==============================================
//
// Architecture overview
// ─────────────────────
// • Insert: a Google-Docs-style grid picker drops a <div.table-wrap><table>
//   <colgroup><col×N><thead><tr><th×N><tbody><tr><td×N>×(R-1) </…>
//   into the iframe. The wrapper matches existing book CSS so newly
//   inserted tables look identical to ones authored by hand.
// • Edit: right-click anywhere inside a table opens a context menu with
//   add/del row/col + delete-table. Structural ops bypass the existing
//   Track Changes engine (which tracks character-level <ins>/<del> only);
//   when tracking is ON we confirm() the user before letting them through.
// • Cell content edits go through the existing tracking pipeline because
//   TR / TD / TH are already in TRACK_BLOCK_TAGS.

const TABLE_GRID_ROWS = 8;
const TABLE_GRID_COLS = 10;
let tableContextTarget = null; // <td>/<th> the context menu is acting on

// Build the picker cells once; reuse forever.
function buildTableGridCells() {
  const grid = document.getElementById('tableGridCells');
  if (!grid || grid.childElementCount > 0) return;
  grid.style.gridTemplateColumns = `repeat(${TABLE_GRID_COLS}, 18px)`;
  for (let r = 1; r <= TABLE_GRID_ROWS; r++) {
    for (let c = 1; c <= TABLE_GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'table-grid-picker-cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${r} แถว × ${c} คอลัมน์`);
      cell.addEventListener('mouseenter', () => highlightTableGrid(r, c));
      cell.addEventListener('click', () => {
        hideTableGridPicker();
        insertTable(r, c);
      });
      grid.appendChild(cell);
    }
  }
}

function highlightTableGrid(rows, cols) {
  const grid = document.getElementById('tableGridCells');
  if (!grid) return;
  grid.querySelectorAll('.table-grid-picker-cell').forEach(el => {
    const r = Number(el.dataset.row);
    const c = Number(el.dataset.col);
    el.classList.toggle('hot', r <= rows && c <= cols);
  });
  const label = document.getElementById('tableGridLabel');
  if (label) label.textContent = `${rows} แถว × ${cols} คอลัมน์`;
}

function showTableGridPicker(evt) {
  buildTableGridCells();
  const picker = document.getElementById('tableGridPicker');
  if (!picker) return;

  // Position below the trigger button. Uses fixed positioning so we don't
  // care about scroll containers (toolbar can be inside a scrollable shell).
  const btn = evt && evt.currentTarget
    ? evt.currentTarget
    : document.getElementById('tableBtn');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    picker.style.top = `${rect.bottom + 6}px`;
    picker.style.left = `${rect.left}px`;
  } else {
    picker.style.top = `${(evt && evt.clientY) || 100}px`;
    picker.style.left = `${(evt && evt.clientX) || 100}px`;
  }

  picker.classList.add('show');
  // Reset highlight + label
  document.getElementById('tableGridCells')
    .querySelectorAll('.hot').forEach(el => el.classList.remove('hot'));
  document.getElementById('tableGridLabel').textContent = 'ลากเมาส์เพื่อเลือกขนาด';

  // Stop the document-level click handler below from immediately closing us
  if (evt && evt.stopPropagation) evt.stopPropagation();
}

function hideTableGridPicker() {
  const picker = document.getElementById('tableGridPicker');
  if (picker) picker.classList.remove('show');
}

// Build the HTML payload for a `rows × cols` table.
// Empty cells get a <br> so contenteditable can place a caret inside.
function buildTableHtml(rows, cols) {
  const colTags = Array(cols).fill('<col>').join('');
  const headerCells = Array.from({ length: cols }, (_, i) =>
    `<th>หัวข้อ ${i + 1}</th>`).join('');
  const bodyRows = Array.from({ length: Math.max(rows - 1, 1) }, () =>
    `      <tr>${Array(cols).fill('<td><br></td>').join('')}</tr>`).join('\n');
  // Trailing <p><br></p> mirrors insertHR/insertNoteBox so the caret has
  // somewhere to land after the table (otherwise contenteditable strands
  // the user inside the last cell).
  return `
<div class="table-wrap">
  <table>
    <colgroup>${colTags}</colgroup>
    <thead>
      <tr>${headerCells}</tr>
    </thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
</div>
<p><br></p>`;
}

function insertTable(rows, cols) {
  focusEditor();
  // Insert via execCommand for free undo support (the existing Track
  // Changes snapshot stack also auto-captures because of this path).
  getDoc().execCommand('insertHTML', false, buildTableHtml(rows, cols));
  setDirty(true);
}

// ── Context menu ────────────────────────────────────────────
//
// We bind once per iframe document load. The handler fires for any
// right-click but we only intercept (preventDefault + show menu) when
// the target is inside a <table> — outside, browser native menu still works.

function bindTableContextMenu(doc) {
  if (!doc || !doc.body || doc.body._tableCtxBound) return;
  doc.body._tableCtxBound = true;

  // Right-click → show menu (or close if click is outside a table)
  doc.body.addEventListener('contextmenu', (e) => {
    const cell = (e.target && e.target.closest)
      ? e.target.closest('td, th')
      : null;
    if (!cell || !cell.closest('table')) {
      // Right-click outside a table → close our menu (if open) and let
      // the browser show its native menu. Without this, the menu stays
      // hanging when the user moves to elsewhere on the page.
      if (isTableContextMenuOpen()) hideTableContextMenu();
      return;
    }

    e.preventDefault();
    // Switching target: clear highlight on the previously-targeted cell
    // (relevant when user right-clicks a 2nd cell while the menu is
    // already open on a 1st cell — we want only one highlight at a time)
    if (tableContextTarget && tableContextTarget !== cell) {
      tableContextTarget.classList.remove('table-cell-targeted');
    }
    tableContextTarget = cell;
    cell.classList.add('table-cell-targeted');

    // Position relative to the iframe — the menu lives in the parent
    // document but events come from the iframe, so add iframe offset.
    const frame = document.getElementById('editFrame');
    const frameRect = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
    showTableContextMenu(
      e.clientX + frameRect.left,
      e.clientY + frameRect.top,
    );
  });

  // ── Dismiss handlers (iframe-scoped) ──────────────────────
  // Iframe events DON'T bubble to the parent document, so the
  // parent-level dismiss handlers (click-outside, Esc) never hear about
  // iframe interactions. We mirror them here. Use named handlers
  // (instead of arrow functions) to make the intent explicit at the
  // event-listener call sites.

  // Left-click anywhere inside the iframe → close menu. Safe because
  // the menu itself lives in the parent doc, so an iframe click can
  // never be "inside the menu".
  doc.addEventListener('click', () => {
    if (isTableContextMenuOpen()) hideTableContextMenu();
  });

  // Esc inside the iframe → close menu. `stopPropagation` keeps the key
  // from also triggering the parent's modal-close handler if both are
  // somehow open (shouldn't happen in practice but defensive).
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isTableContextMenuOpen()) {
      hideTableContextMenu();
      e.stopPropagation();
    }
  });

  // Scroll the book content → close menu (otherwise the menu floats
  // detached from the cell it was opened on). Capture phase because
  // scroll events don't bubble.
  doc.addEventListener('scroll', () => {
    if (isTableContextMenuOpen()) hideTableContextMenu();
  }, true);
}

function isTableContextMenuOpen() {
  const menu = document.getElementById('tableContextMenu');
  return !!(menu && menu.classList.contains('show'));
}

function showTableContextMenu(x, y) {
  const menu = document.getElementById('tableContextMenu');
  if (!menu) return;
  // Soft-clamp so the menu doesn't render past the viewport edge
  const PAD = 8;
  const maxX = window.innerWidth - menu.offsetWidth - PAD;
  const maxY = window.innerHeight - menu.offsetHeight - PAD;
  menu.style.left = `${Math.min(x, Math.max(PAD, maxX))}px`;
  menu.style.top = `${Math.min(y, Math.max(PAD, maxY))}px`;
  menu.classList.add('show');
}

function hideTableContextMenu() {
  const menu = document.getElementById('tableContextMenu');
  if (menu) menu.classList.remove('show');
  // Clear highlight class — `classList.remove` on a detached element
  // (e.g. after delete-row removed the cell) is a safe no-op.
  if (tableContextTarget) {
    tableContextTarget.classList.remove('table-cell-targeted');
  }
  tableContextTarget = null;
}

// Dispatch table actions. Guarded by a confirm() when Track Changes is ON
// because structural ops (add/del row/col) bypass the tracking engine in
// Phase 1 — see TABLE module header for the rationale.
function tableAction(kind) {
  if (!tableContextTarget) { hideTableContextMenu(); return; }
  const cell = tableContextTarget;

  if (trackingEnabled && !confirmStructuralTableChange(kind)) {
    hideTableContextMenu();
    return;
  }

  switch (kind) {
    case 'rowAbove':  addTableRow(cell, 'above');  break;
    case 'rowBelow':  addTableRow(cell, 'below');  break;
    case 'colLeft':   addTableCol(cell, 'left');   break;
    case 'colRight':  addTableCol(cell, 'right');  break;
    case 'delRow':    deleteTableRow(cell);        break;
    case 'delCol':    deleteTableCol(cell);        break;
    case 'delTable':  deleteWholeTable(cell);      break;
  }
  hideTableContextMenu();
  setDirty(true);
}

function confirmStructuralTableChange(kind) {
  // Called only for add / delete row|col|table — resize is exempt
  // (see bindTableResize for rationale).
  const verb = (kind === 'delRow' || kind === 'delCol' || kind === 'delTable')
    ? 'ลบ' : 'เพิ่ม';
  const what = (kind === 'rowAbove' || kind === 'rowBelow' || kind === 'delRow')
    ? 'แถว'
    : (kind === 'colLeft' || kind === 'colRight' || kind === 'delCol')
      ? 'คอลัมน์'
      : 'ตาราง';
  return window.confirm(
    `Track Changes เปิดอยู่ — การ${verb}${what}จะไม่ถูกบันทึกเป็น tracked change\n` +
    `(จะทำทันที ผู้รีวิวจะไม่เห็น diff ของส่วนนี้)\n\nทำต่อ?`
  );
}

// ── Structural ops ──────────────────────────────────────────
// Each works from the cell the user right-clicked on. We resolve cell →
// row → table from there; no need to track a separate "current table"
// selection state.

function getCellTable(cell) {
  return cell ? cell.closest('table') : null;
}
function getCellRow(cell) {
  return cell ? cell.closest('tr') : null;
}
function getCellColIndex(cell) {
  const row = getCellRow(cell);
  if (!row) return -1;
  return Array.prototype.indexOf.call(row.children, cell);
}

function addTableRow(cell, where) {
  const row = getCellRow(cell);
  const table = getCellTable(cell);
  if (!row || !table) return;
  const cols = row.children.length;
  const doc = getDoc();
  const newRow = doc.createElement('tr');
  // New rows always live in <tbody> visually, but we mirror the row's tag
  // kind so adding above a header row keeps the new row a header too.
  const isHeader = row.parentElement && row.parentElement.tagName === 'THEAD';
  for (let i = 0; i < cols; i++) {
    const cellEl = doc.createElement(isHeader ? 'th' : 'td');
    cellEl.innerHTML = '<br>';
    newRow.appendChild(cellEl);
  }
  if (where === 'above') row.parentElement.insertBefore(newRow, row);
  else row.parentElement.insertBefore(newRow, row.nextSibling);
}

function addTableCol(cell, where) {
  const table = getCellTable(cell);
  const colIdx = getCellColIndex(cell);
  if (!table || colIdx < 0) return;
  const doc = getDoc();

  // Add a <col> placeholder in colgroup (if present) so widths stay aligned
  const colgroup = table.querySelector('colgroup');
  if (colgroup) {
    const newCol = doc.createElement('col');
    const refCol = colgroup.children[colIdx];
    if (where === 'left') colgroup.insertBefore(newCol, refCol);
    else colgroup.insertBefore(newCol, refCol ? refCol.nextSibling : null);
  }

  // Add a cell at the right index of every row (both thead + tbody).
  table.querySelectorAll('tr').forEach(tr => {
    const refCell = tr.children[colIdx];
    if (!refCell) return;
    const tag = refCell.tagName === 'TH' ? 'th' : 'td';
    const newCell = doc.createElement(tag);
    newCell.innerHTML = tag === 'th' ? 'หัวข้อใหม่' : '<br>';
    if (where === 'left') tr.insertBefore(newCell, refCell);
    else tr.insertBefore(newCell, refCell.nextSibling);
  });
}

function deleteTableRow(cell) {
  const row = getCellRow(cell);
  const table = getCellTable(cell);
  if (!row || !table) return;
  // Last data row → don't leave an empty <tbody>; remove the whole table
  // instead. Avoids "ghost table" with just a header that confuses authors.
  const allRows = table.querySelectorAll('tr');
  if (allRows.length <= 1) {
    deleteWholeTable(cell);
    return;
  }
  row.remove();
}

function deleteTableCol(cell) {
  const table = getCellTable(cell);
  const colIdx = getCellColIndex(cell);
  if (!table || colIdx < 0) return;
  const colCount = (table.rows[0] || { children: [] }).children.length;
  if (colCount <= 1) {
    // Last column → remove the whole table (see deleteTableRow rationale).
    deleteWholeTable(cell);
    return;
  }
  const colgroup = table.querySelector('colgroup');
  if (colgroup && colgroup.children[colIdx]) {
    colgroup.children[colIdx].remove();
  }
  table.querySelectorAll('tr').forEach(tr => {
    if (tr.children[colIdx]) tr.children[colIdx].remove();
  });
}

function deleteWholeTable(cell) {
  const table = getCellTable(cell);
  if (!table) return;
  const wrap = table.closest('.table-wrap') || table;
  wrap.remove();
}

// ── Keyboard nav (Tab between cells, auto-add row on last) ──
//
// Tab from any cell → move caret to the next cell in document order.
// Tab from the last cell of the last row → append a new row to <tbody>
// and place caret in its first cell.
// Shift+Tab is the reverse.
//
// "Document order" walks: sibling td/th → next row → next section
// (thead → tbody → tfoot). New rows always go into <tbody> so we
// never accidentally extend the header.

function bindTableKeyboard(doc) {
  if (!doc || !doc.body || doc.body._tableKbBound) return;
  doc.body._tableKbBound = true;

  doc.body.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const cell = getCellFromSelection(doc);
    if (!cell) return; // not in a table — let default Tab behavior happen
    const table = cell.closest('table');
    if (!table) return;

    e.preventDefault();
    if (e.shiftKey) moveCaretToPrevCell(cell, doc);
    else            moveCaretToNextCell(cell, table, doc);
  });
}

// Resolve the <td>/<th> that contains the current caret/selection.
function getCellFromSelection(doc) {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).startContainer;
  const el = node.nodeType === 1 ? node : node.parentElement;
  return el ? el.closest('td, th') : null;
}

// Walk forward through document order: next sibling → first cell of
// next row → first cell of first row in next section. Returns the
// found cell, or null if `cell` is the very last in the table.
function findNextCellInTable(cell) {
  if (cell.nextElementSibling) return cell.nextElementSibling;
  const row = cell.parentElement;
  if (row.nextElementSibling) return row.nextElementSibling.children[0] || null;
  // Cross into next section (thead → tbody → tfoot)
  let section = row.parentElement.nextElementSibling;
  while (section) {
    if (section.children.length > 0) {
      return section.children[0].children[0] || null;
    }
    section = section.nextElementSibling;
  }
  return null;
}

// Reverse of findNextCellInTable.
function findPrevCellInTable(cell) {
  if (cell.previousElementSibling) return cell.previousElementSibling;
  const row = cell.parentElement;
  if (row.previousElementSibling) {
    const r = row.previousElementSibling;
    return r.children[r.children.length - 1] || null;
  }
  let section = row.parentElement.previousElementSibling;
  while (section) {
    if (section.children.length > 0) {
      const lastRow = section.children[section.children.length - 1];
      return lastRow.children[lastRow.children.length - 1] || null;
    }
    section = section.previousElementSibling;
  }
  return null;
}

function moveCaretToNextCell(cell, table, doc) {
  const next = findNextCellInTable(cell);
  if (next) { placeCaretInCell(next, doc); return; }

  // Last cell of last row — append a new <tr> to <tbody> (or to <table>
  // if there's no tbody section). Honors Track Changes confirm guard
  // because adding a row is a structural change.
  if (trackingEnabled && !confirmStructuralTableChange('rowBelow')) return;

  const colCount = (table.rows[0] || { children: [] }).children.length;
  const tbody = table.querySelector('tbody') || table;
  const newRow = doc.createElement('tr');
  for (let i = 0; i < colCount; i++) {
    const td = doc.createElement('td');
    td.innerHTML = '<br>';
    newRow.appendChild(td);
  }
  tbody.appendChild(newRow);
  placeCaretInCell(newRow.children[0], doc);
  setDirty(true);
}

function moveCaretToPrevCell(cell, doc) {
  const prev = findPrevCellInTable(cell);
  if (prev) placeCaretInCell(prev, doc);
  // If no previous cell, do nothing — Shift+Tab at the first cell of
  // the table is a no-op (rather than escaping focus to a previous
  // form element, which would be jarring inside a contenteditable).
}

// Place the caret inside `cell`. For empty cells (only <br>) we collapse
// to the start so typing inserts text. For non-empty cells we select the
// entire content (Google-Docs / Word convention) so typing replaces it.
function placeCaretInCell(cell, doc) {
  if (!cell) return;
  const sel = doc.getSelection();
  const range = doc.createRange();
  range.selectNodeContents(cell);

  const onlyBr = cell.childNodes.length === 1
    && cell.firstChild
    && cell.firstChild.nodeName === 'BR';
  if (onlyBr) range.collapse(true);

  sel.removeAllRanges();
  sel.addRange(range);
}

// ── Column resize (drag border) ─────────────────────────────
//
// Hover near a column border → cursor becomes col-resize.
// Mousedown + drag → resize the left/right columns adjacent to that
// border (zero-sum: width transferred from one to the other).
//
// We use Pointer Events with setPointerCapture so the drag survives
// pointer leaving the iframe area — and Pointer Events give us touch
// resize on iPads / tablets as a bonus.
//
// Widths are written to <col style="width: N%"> in the colgroup;
// the table also gets `table-layout: fixed` so <col> widths become
// authoritative (without it, browsers treat them as hints only).

const TABLE_RESIZE_HOT_ZONE_PX = 6;
const TABLE_RESIZE_MIN_COL_PCT = 5;
let tableResizeState = null; // null or { table, colIdx, leftCol, rightCol, leftStartPct, rightStartPct, startX, totalWidth, captureEl, pointerId }

// Detect whether the mouse is in the resize hot-zone of any column border.
// We check both edges of the cell under the cursor: the right edge maps to
// "border between this column and the next", the left edge maps to
// "border between this column and the previous".
function getTableResizeHit(e) {
  if (!e.target || !e.target.closest) return null;
  const cell = e.target.closest('th, td');
  if (!cell) return null;
  const table = cell.closest('table');
  if (!table) return null;
  const row = cell.parentElement;
  const colIdx = Array.prototype.indexOf.call(row.children, cell);
  const colCount = row.children.length;
  const rect = cell.getBoundingClientRect();

  const distFromRight = rect.right - e.clientX;
  if (distFromRight >= 0 && distFromRight <= TABLE_RESIZE_HOT_ZONE_PX
      && colIdx < colCount - 1) {
    return { table, colIdx };
  }
  const distFromLeft = e.clientX - rect.left;
  if (distFromLeft >= 0 && distFromLeft <= TABLE_RESIZE_HOT_ZONE_PX
      && colIdx > 0) {
    return { table, colIdx: colIdx - 1 };
  }
  return null;
}

// Make sure colgroup has one <col> per visible column. Tables inserted
// by this editor always do, but tables authored by hand might be missing
// some — we top up the colgroup so we have a target for the width style.
function ensureColgroupComplete(table) {
  const doc = table.ownerDocument;
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = doc.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }
  const colCount = (table.rows[0] || { children: [] }).children.length;
  while (colgroup.children.length < colCount) {
    colgroup.appendChild(doc.createElement('col'));
  }
}

function bindTableResize(doc) {
  if (!doc || !doc.body || doc.body._tableResizeBound) return;
  doc.body._tableResizeBound = true;

  // Hover-cursor on the iframe body. Suppressed during active drag so
  // we don't overwrite the col-resize cursor mid-drag.
  doc.body.addEventListener('mousemove', (e) => {
    if (tableResizeState) return;
    doc.body.style.cursor = getTableResizeHit(e) ? 'col-resize' : '';
  });

  doc.body.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // left button only
    const hit = getTableResizeHit(e);
    if (!hit) return;

    // Intentionally NO Track Changes confirm here.
    //
    // Two reasons:
    // 1. UX:  window.confirm() inside pointerdown blocks the event loop
    //    and breaks pointer capture — even if the user clicks OK, the
    //    drag fails to register movements because the browser has ended
    //    the pointer session during the modal.
    // 2. Semantics:  resize is a layout-only change. The book's actual
    //    content is unchanged, so a reviewer sees the same words either
    //    way. Add / delete row / col still confirm because those destroy
    //    or insert real content.
    //
    // See SECURITY-TODO / chat 2026-05-23 for the discussion.

    e.preventDefault();

    const { table, colIdx } = hit;
    ensureColgroupComplete(table);

    const cols = table.querySelectorAll('colgroup > col');
    const leftCol = cols[colIdx];
    const rightCol = cols[colIdx + 1];
    if (!leftCol || !rightCol) return;

    // Read current rendered widths in px → convert to %.
    // We always seed both adjacent cols (even if they didn't have a
    // width attribute before) so the math is symmetric.
    const totalWidth = table.offsetWidth || 1;
    const headerRow = table.rows[0];
    const leftRect = headerRow.children[colIdx].getBoundingClientRect();
    const rightRect = headerRow.children[colIdx + 1].getBoundingClientRect();
    const leftStartPct = (leftRect.width / totalWidth) * 100;
    const rightStartPct = (rightRect.width / totalWidth) * 100;

    leftCol.style.width = leftStartPct.toFixed(2) + '%';
    rightCol.style.width = rightStartPct.toFixed(2) + '%';
    // Flip to fixed layout so col widths become authoritative.
    if (!table.style.tableLayout) table.style.tableLayout = 'fixed';

    // Capture so move/up events keep flowing even if pointer leaves iframe
    e.target.setPointerCapture(e.pointerId);

    tableResizeState = {
      table, colIdx, leftCol, rightCol,
      leftStartPct, rightStartPct,
      startX: e.clientX,
      totalWidth,
      captureEl: e.target,
      pointerId: e.pointerId,
    };

    e.target.addEventListener('pointermove', handleTableResizeMove);
    e.target.addEventListener('pointerup', handleTableResizeEnd);
    e.target.addEventListener('pointercancel', handleTableResizeEnd);
  });
}

function handleTableResizeMove(e) {
  const s = tableResizeState;
  if (!s) return;
  const dx = e.clientX - s.startX;
  const dxPct = (dx / s.totalWidth) * 100;
  let newLeft = s.leftStartPct + dxPct;
  let newRight = s.rightStartPct - dxPct;

  // Clamp: neither column may shrink below MIN_COL_PCT.
  // We preserve the total (leftStartPct + rightStartPct) when clamping
  // to keep the resize zero-sum.
  const totalPair = s.leftStartPct + s.rightStartPct;
  if (newLeft < TABLE_RESIZE_MIN_COL_PCT) {
    newLeft = TABLE_RESIZE_MIN_COL_PCT;
    newRight = totalPair - newLeft;
  } else if (newRight < TABLE_RESIZE_MIN_COL_PCT) {
    newRight = TABLE_RESIZE_MIN_COL_PCT;
    newLeft = totalPair - newRight;
  }
  s.leftCol.style.width = newLeft.toFixed(2) + '%';
  s.rightCol.style.width = newRight.toFixed(2) + '%';
}

function handleTableResizeEnd() {
  const s = tableResizeState;
  if (!s) return;
  tableResizeState = null;
  try { s.captureEl.releasePointerCapture(s.pointerId); } catch { /* already released */ }
  s.captureEl.removeEventListener('pointermove', handleTableResizeMove);
  s.captureEl.removeEventListener('pointerup', handleTableResizeEnd);
  s.captureEl.removeEventListener('pointercancel', handleTableResizeEnd);
  // Reset hover cursor
  const body = s.table.ownerDocument && s.table.ownerDocument.body;
  if (body) body.style.cursor = '';
  setDirty(true);
}

// ==============================================
// END MARK
// ==============================================

// Default end-of-chapter ornament. Inline SVG instead of the Unicode
// dingbat (✤) so the print pipeline gets a clean vector glyph that is
// independent of font availability, color emoji rendering, or color
// profile embedding. `currentColor` lets the book's CSS theme the mark.
//
// `vertical-align: middle` matters: without it the SVG defaults to
// vertical-align:baseline, which puts the SVG box bottom on the text
// baseline. The star path is centered in its 24×24 viewBox (so the
// visible center sits at y=12 = 0.45em above baseline), while em-dash
// glyphs in most fonts render at ~0.25em above baseline (x-height/2).
// That's a ~0.2em vertical mismatch visible as "— ⭐ —" with the star
// floating high. `middle` aligns the SVG's vertical center with the
// parent's (baseline + x-height/2), which is exactly where em-dashes
// sit — closing the gap.
const DEFAULT_ENDMARK_SVG =
  '<svg viewBox="0 0 24 24" width="0.9em" height="0.9em" fill="currentColor" style="vertical-align: middle;" role="presentation" aria-hidden="true"><path d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"/></svg>';

function showEndMarkModal() {
  const sel = getWin().getSelection();
  if (sel.rangeCount) {
    savedSelection = sel.getRangeAt(0).cloneRange();
  }
  // Empty input = "use default SVG ornament". User can type custom text
  // (e.g. "— THE END —") and it will be inserted as text instead.
  document.getElementById('endMarkText').value = '';
  document.getElementById('endMarkTop').value = '80';
  document.getElementById('endMarkBottom').value = '20';
  updateEndMarkPreview();
  document.getElementById('endMarkModal').classList.add('show');
}

function closeEndMarkModal() {
  document.getElementById('endMarkModal').classList.remove('show');
}

function updateEndMarkPreview() {
  const text = document.getElementById('endMarkText').value;
  const preview = document.getElementById('endMarkPreview');
  // Wrap the symbol (default SVG or user text) with em-dashes ("—") on
  // both sides to mirror the "line — symbol — line" pattern that the
  // book HTML already uses across existing chapter ends. The em-dash
  // is plain U+2014; it passes through the print pipeline untouched.
  if (text.trim() === '') {
    // Use innerHTML — we trust DEFAULT_ENDMARK_SVG as we control it.
    preview.innerHTML = `— ${DEFAULT_ENDMARK_SVG} —`;
  } else {
    // textContent is XSS-safe + ensures non-text-rendering chars don't
    // sneak in via the preview.
    preview.textContent = `— ${text} —`;
  }
}

function insertEndMark() {
  const text = document.getElementById('endMarkText').value;
  const top = document.getElementById('endMarkTop').value || '80';
  const bottom = document.getElementById('endMarkBottom').value || '20';

  focusEditor();
  if (savedSelection) {
    const sel = getWin().getSelection();
    sel.removeAllRanges();
    sel.addRange(savedSelection);
  }

  const topNum = parseInt(top, 10) || 0;
  const bottomNum = parseInt(bottom, 10) || 0;
  // Empty text → use the default SVG ornament (print-safe).
  // Non-empty text → render the user's text (will still be sanitized by
  // stripEmojis() at save time).
  // Wrap with em-dashes on both sides — this is the "line — symbol — line"
  // pattern already in use across existing chapter ends in the book.
  // Em-dash (U+2014) is a regular typographic character; no sanitizer
  // in the save pipeline strips it.
  const content = text.trim() === '' ? DEFAULT_ENDMARK_SVG : escapeHtml(text);
  const inner = `— ${content} —`;
  const html = `<div class="end-mark" style="text-align:center;font-size:20px;color:#C8C5BB;margin-top:${topNum}px;margin-bottom:${bottomNum}px;" contenteditable="false">${inner}</div><p><br></p>`;
  getDoc().execCommand('insertHTML', false, html);

  closeEndMarkModal();
  showToast('แทรกสัญลักษณ์จบบทแล้ว');
}

// ==============================================
// LINK
// ==============================================

function showLinkModal() {
  const sel = getWin().getSelection();
  if (sel.rangeCount) {
    savedSelection = sel.getRangeAt(0).cloneRange();
    document.getElementById('linkText').value = sel.toString();
  }
  document.getElementById('linkUrl').value = '';
  document.getElementById('linkModal').classList.add('show');
  document.getElementById('linkUrl').focus();
}

function closeLinkModal() {
  document.getElementById('linkModal').classList.remove('show');
}

function insertLink() {
  const url = document.getElementById('linkUrl').value.trim();
  const text = document.getElementById('linkText').value.trim();
  if (!url) return;

  focusEditor();
  if (savedSelection) {
    const sel = getWin().getSelection();
    sel.removeAllRanges();
    sel.addRange(savedSelection);
  }

  const safeUrl = safeLinkUrl(url);
  if (text && getWin().getSelection().isCollapsed) {
    getDoc().execCommand('insertHTML', false, `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`);
  } else {
    getDoc().execCommand('createLink', false, safeUrl);
  }

  closeLinkModal();
  showToast('แทรกลิงก์แล้ว');
}

// ==============================================
// IMAGE (FIXED BASE64 TRUNCATION)
// ==============================================

function bindImageClicks(doc) {
  if (!doc.body || doc.body._imgClickBound) return;
  doc.body._imgClickBound = true;

  doc.body.addEventListener('dblclick', (e) => {
    if (annotatingFrame) return;   // P2-S81 — no edit-modal while annotating
    const img = e.target.closest('img');
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    showImageModalForEdit(img);
  }, true);

  doc.body.addEventListener('mousedown', (e) => {
    if (annotatingFrame) return;   // P2-S81 — marker handlers own the pointer
    const img = e.target.closest('img');
    doc.querySelectorAll('.img-selected').forEach((el) => el.classList.remove('img-selected'));
    if (img) img.classList.add('img-selected');
  }, true);
}

// ============================================================
// IMAGE NUMBER MARKERS (annotations) — P2-S81
// ------------------------------------------------------------
// Numbered circles anchored to an image by percentage so they
// stay locked when the image scales (screen / print). Markers
// live inside <span class="img-frame"> which wraps only the
// <img> (figcaption stays outside, editable). The frame is
// contenteditable=false so rich-text editing can't break it.
// Saved as plain HTML (saveProject -> innerHTML) → round-trips
// automatically; handlers are delegated so reload needs no
// re-binding.
// ============================================================

let annotatingFrame = null;   // the .img-frame currently in annotate mode

// P2-S81 — numbering mode. false = per-image (each figure starts at 1);
// true = continuous across all images (figure A: 1,2 → figure B: 3,4...).
// Persisted as a UI preference so it sticks across sessions.
let markerContinuous = false;
try {
  markerContinuous = localStorage.getItem('bookEditor_markerContinuous') === '1';
} catch (e) { /* localStorage may be blocked */ }

function clampPct(v) { return Math.max(0, Math.min(100, v)); }

/** Reading-order comparator for markers: top→bottom, then left→right
 *  within ~4% rows. Shared by per-image and continuous renumber. */
function markerReadingOrder(a, b) {
  const ay = parseFloat(a.style.top) || 0;
  const by = parseFloat(b.style.top) || 0;
  if (Math.abs(ay - by) > 4) return ay - by;
  const ax = parseFloat(a.style.left) || 0;
  const bx = parseFloat(b.style.left) || 0;
  return ax - bx;
}

/** P2-S81 — strip stray annotate-mode state when a document loads.
 *  Repairs files saved (pre-fix) while annotate mode was active: the
 *  persisted `.annotating` class left the marker overlay intercepting
 *  clicks, locking image editing. Also resets the runtime pointer so a
 *  new session never thinks an old frame is still active. */
function repairMarkerState(doc) {
  annotatingFrame = null;
  markerNextOverride = null; // fresh running counter each load
  if (doc && doc.querySelectorAll) {
    // drop any stale per-frame counters from the earlier per-frame design
    doc.querySelectorAll('.img-frame[data-next-n]')
      .forEach((f) => f.removeAttribute('data-next-n'));
    doc.querySelectorAll('.img-frame.annotating')
      .forEach((f) => f.classList.remove('annotating'));
    doc.querySelectorAll('.img-marker.selected, .img-marker.dragging')
      .forEach((m) => m.classList.remove('selected', 'dragging'));
  }
  updateMarkerMenuState();
}

/** Wrap an <img> (inside figure.book-img) in .img-frame + .img-markers
 *  if not already wrapped. Returns the .img-frame element. */
function ensureImageFrame(img) {
  const existing = img.closest('.img-frame');
  if (existing) return existing;
  const doc = getDoc();
  const frame = doc.createElement('span');
  // Base (no msize class) = level 3 (default). All frames without an
  // explicit size — new or older saved ones — render at level 3.
  frame.className = 'img-frame';
  frame.setAttribute('contenteditable', 'false');
  img.parentNode.insertBefore(frame, img);
  frame.appendChild(img);
  const markers = doc.createElement('span');
  markers.className = 'img-markers';
  frame.appendChild(markers);
  return frame;
}

/** Toolbar: toggle annotate mode for the currently selected image. */
function toggleImageAnnotate() {
  if (annotatingFrame) { exitAnnotateMode(); return; }
  const doc = getDoc();
  const img =
    doc.querySelector('img.img-selected') ||
    doc.querySelector('img.img-editing');
  if (!img) {
    showToast('เลือกรูปก่อน แล้วกดปุ่มใส่ตัวชี้');
    return;
  }
  const frame = ensureImageFrame(img);
  frame.classList.add('annotating');
  annotatingFrame = frame;
  updateMarkerMenuState();
  setDirty(true); // wrapping the img mutates the HTML
  showToast('โหมดใส่ตัวชี้: คลิกบนรูปเพื่อวางเลข · ลากเพื่อย้าย · เลือกแล้วกด Delete เพื่อลบ');
}

function exitAnnotateMode() {
  if (annotatingFrame) {
    annotatingFrame.classList.remove('annotating');
    annotatingFrame
      .querySelectorAll('.img-marker.selected')
      .forEach((m) => m.classList.remove('selected'));
  }
  annotatingFrame = null;
  updateMarkerMenuState();
  // Drop the marker button's keyboard focus ring — exiting via Esc counts
  // as a keyboard interaction, which would otherwise leave a blue ring on
  // the main toggle button (same reasoning as hideAlignMenu's blur).
  const btn = document.getElementById('markerMenuBtn');
  if (btn) btn.blur();
}

/** P2-S81 (option A) — switch annotate mode straight to another image
 *  without leaving the mode. Called when the user clicks a different
 *  book image while already annotating. */
function switchAnnotateTo(img) {
  if (annotatingFrame) {
    annotatingFrame.classList.remove('annotating');
    annotatingFrame
      .querySelectorAll('.img-marker.selected, .img-marker.dragging')
      .forEach((m) => m.classList.remove('selected', 'dragging'));
  }
  const frame = ensureImageFrame(img);
  frame.classList.add('annotating');
  annotatingFrame = frame;
  updateMarkerMenuState();
  setDirty(true); // ensureImageFrame may have wrapped a fresh image
  showToast('สลับมาที่รูปนี้ — วาง marker ต่อได้เลย');
}

/* ── Text-align split-button (P2-S83) — group the four paragraph
 *    alignment commands into one split button. The main button applies
 *    the currently-selected alignment; the caret opens a dropdown to
 *    pick another, which then becomes the main button's default. */
const ALIGN_DEFS = {
  justifyLeft: {
    tip: 'ชิดซ้าย',
    svg: '<line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/>',
  },
  justifyCenter: {
    tip: 'จัดกึ่งกลาง',
    svg: '<line x1="21" y1="6" x2="3" y2="6"/><line x1="19" y1="12" x2="5" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/>',
  },
  justifyRight: {
    tip: 'ชิดขวา',
    svg: '<line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="7" y2="18"/>',
  },
  justifyFull: {
    tip: 'กระจายเต็มบรรทัด',
    svg: '<line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="3" y2="18"/>',
  },
};
// Which alignment the main split button currently represents/repeats.
let currentAlign = 'justifyLeft';

/** Main-button click: apply whatever alignment is currently shown. */
function applyCurrentAlign() {
  execCmd(currentAlign);
}

/** Pick an alignment from the dropdown — apply it AND make it the
 *  main button's new default (icon + tooltip), so the next main-button
 *  click repeats it. */
function setAlign(cmd) {
  const def = ALIGN_DEFS[cmd];
  if (!def) return;
  currentAlign = cmd;
  const icon = document.getElementById('alignMainIcon');
  if (icon) icon.innerHTML = def.svg;
  const main = document.getElementById('alignMainBtn');
  if (main) main.setAttribute('data-tip', def.tip);
  updateAlignMenuState();
  hideAlignMenu();
  execCmd(cmd);
}

/** Highlight the active row in the align dropdown. */
function updateAlignMenuState() {
  const menu = document.getElementById('alignMenu');
  if (!menu) return;
  menu.querySelectorAll('.qi-item').forEach((item) => {
    item.classList.toggle(
      'is-active',
      item.getAttribute('data-align') === currentAlign,
    );
  });
}

function toggleAlignMenu(evt) {
  const menu = document.getElementById('alignMenu');
  if (!menu) return;
  if (menu.classList.contains('show')) { hideAlignMenu(); return; }
  // Align the dropdown under the whole split (main button's left edge).
  const anchor = document.getElementById('alignMainBtn');
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${rect.left}px`;
  }
  updateAlignMenuState();
  menu.classList.add('show');
  if (evt && evt.stopPropagation) evt.stopPropagation();
}

function hideAlignMenu() {
  const menu = document.getElementById('alignMenu');
  if (menu) menu.classList.remove('show');
  // Drop the caret's keyboard focus ring — closing via Esc counts as a
  // keyboard interaction, which would otherwise leave a blue focus ring.
  const caret = document.getElementById('alignCaretBtn');
  if (caret) caret.blur();
}

/* ── Marker split-button (P2-S81) — main button toggles annotate mode;
 *    the caret opens a submenu with renumber + size actions. */
function updateMarkerMenuState() {
  const active = !!annotatingFrame;
  // Highlight BOTH halves of the split button so it reads as one active
  // unit while annotate mode is on.
  const btn = document.getElementById('markerMenuBtn');
  if (btn) btn.classList.toggle('active', active);
  const caret = document.getElementById('markerCaretBtn');
  if (caret) caret.classList.toggle('active', active);
}

function toggleMarkerMenu(evt) {
  const menu = document.getElementById('markerMenu');
  if (!menu) return;
  if (menu.classList.contains('show')) { hideMarkerMenu(); return; }
  // Align the menu under the whole split (use the main button's left edge).
  const anchor = document.getElementById('markerMenuBtn');
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${rect.left}px`;
  }
  updateContinuousMenuLabel(); // reflect current numbering mode
  menu.classList.add('show');
  if (evt && evt.stopPropagation) evt.stopPropagation();
}

function hideMarkerMenu() {
  const menu = document.getElementById('markerMenu');
  if (menu) menu.classList.remove('show');
  // Drop the caret's keyboard focus ring (same reason as hideAlignMenu).
  const caret = document.getElementById('markerCaretBtn');
  if (caret) caret.blur();
}

function updateContinuousMenuLabel() {
  const item = document.getElementById('markerContinuousItem');
  if (item) {
    item.textContent =
      (markerContinuous ? '✓ ' : '☐ ') + 'นับต่อเนื่องข้ามรูป';
    item.classList.toggle('is-active', markerContinuous);
  }
}

function toggleContinuousMode() {
  markerContinuous = !markerContinuous;
  try {
    localStorage.setItem(
      'bookEditor_markerContinuous',
      markerContinuous ? '1' : '0',
    );
  } catch (e) { /* ignore */ }
  updateContinuousMenuLabel();
  showToast(
    markerContinuous
      ? 'โหมดนับต่อเนื่องข้ามรูป: เปิด'
      : 'โหมดนับแยกต่อรูป: เปิด',
  );
}

function markerMenuAction(action) {
  if (action === 'renumber') { renumberMarkers(); hideMarkerMenu(); }
  // size + mode toggle keep the menu open so the user can keep tweaking
  else if (action === 'bigger') { changeMarkerSize(1); }
  else if (action === 'smaller') { changeMarkerSize(-1); }
  else if (action === 'continuous') { toggleContinuousMode(); }
}

/** Next number for a new marker = max existing data-n + 1.
 *  Per-image mode scopes to the current frame; continuous mode scopes
 *  to the whole document so numbers carry across images. */
function nextMarkerNumber(markers) {
  const scope = markerContinuous ? getDoc().body : markers;
  let max = 0;
  if (scope) {
    scope.querySelectorAll('.img-marker').forEach((m) => {
      const n = parseInt(m.getAttribute('data-n') || '0', 10);
      if (n > max) max = n;
    });
  }
  return max + 1;
}

/* ── "Next number" override (P2-S81). Double-clicking a marker opens a
 *    dialog that relabels THAT marker to N and arms a shared running
 *    counter (markerNextOverride = N+1). Every new marker after that —
 *    on ANY image — consumes + advances the counter, so numbering
 *    continues across images. Other existing markers are NOT relabeled.
 *    The counter is session-only (resets on load). */
let markerStartTargetFrame = null;
let markerStartTargetMarker = null;
// Global running override (P2-S81). Set via the double-click dialog; once
// set, each new marker uses it then advances — a single counter that
// carries across ALL images, regardless of per-image/continuous mode.
// null = no override → fall back to normal logic. Session-only (the
// markers themselves persist in HTML; this running pointer resets on load).
let markerNextOverride = null;

/** What the next marker number would be, without consuming the counter. */
function peekNextMarkerNumber(frame) {
  if (markerNextOverride != null) return markerNextOverride;
  return nextMarkerNumber(frame ? frame.querySelector('.img-markers') : null);
}

/** Number for a NEW marker — uses + advances the shared override if set. */
function computeNextMarkerNumber(frame) {
  if (markerNextOverride != null) {
    const n = markerNextOverride;
    markerNextOverride = n + 1; // advance the shared counter
    return n;
  }
  return nextMarkerNumber(frame.querySelector('.img-markers'));
}

function openMarkerStartDialog(frame, marker) {
  if (!frame) return;
  markerStartTargetFrame = frame;
  markerStartTargetMarker = marker || null;
  const input = document.getElementById('markerStartInput');
  if (input) {
    // Prefill with the clicked marker's current number (the value being
    // reassigned); fall back to the frame's next number.
    const cur = marker
      ? parseInt(marker.getAttribute('data-n') || '', 10)
      : NaN;
    input.value = String(
      Number.isFinite(cur) ? cur : peekNextMarkerNumber(frame),
    );
  }
  document.getElementById('markerStartModal').classList.add('show');
  if (input) { input.focus(); input.select(); }
}

function setMarkerStartValue(n) {
  const input = document.getElementById('markerStartInput');
  if (input) input.value = String(n);
}

function applyMarkerStart() {
  const input = document.getElementById('markerStartInput');
  let n = parseInt(input && input.value, 10);
  if (!Number.isFinite(n) || n < 1) n = 1;
  // Relabel the double-clicked marker itself to N…
  if (markerStartTargetMarker) {
    markerStartTargetMarker.setAttribute('data-n', String(n));
    markerStartTargetMarker.textContent = String(n);
  }
  // …and set the shared running counter so the NEXT marker (on ANY
  // image) continues from N+1. Other existing markers are untouched.
  markerNextOverride = n + 1;
  setDirty(true);
  showToast('ตั้งตัวชี้นี้เป็นเลข ' + n + ' (ตัวถัดไปนับต่อ ' + (n + 1) + ' ข้ามรูปได้)');
  closeMarkerStartModal();
}

function closeMarkerStartModal() {
  const modal = document.getElementById('markerStartModal');
  if (modal) modal.classList.remove('show');
  markerStartTargetFrame = null;
  markerStartTargetMarker = null;
}

/** Toolbar: renumber markers in reading order. Per-image mode renumbers
 *  just the active frame (1..N); continuous mode renumbers every image
 *  across the document with one running counter. */
function renumberMarkers() {
  if (markerContinuous) { renumberAllContinuous(); return; }
  if (!annotatingFrame) { showToast('เข้าโหมดใส่ตัวชี้ที่รูปก่อน'); return; }
  const markers = annotatingFrame.querySelector('.img-markers');
  if (!markers) return;
  const list = Array.from(markers.querySelectorAll('.img-marker'));
  list.sort(markerReadingOrder);
  list.forEach((m, i) => {
    const n = String(i + 1);
    m.setAttribute('data-n', n);
    m.textContent = n;
  });
  setDirty(true);
  showToast('เรียงเลขใหม่แล้ว');
}

/** Continuous renumber: walk every image's markers in document order
 *  (figure order, then reading order within each) with one counter. */
function renumberAllContinuous() {
  const doc = getDoc();
  const frames = Array.from(doc.querySelectorAll('figure.book-img .img-frame'));
  let counter = 1;
  let touched = 0;
  frames.forEach((frame) => {
    const markers = frame.querySelector('.img-markers');
    if (!markers) return;
    Array.from(markers.querySelectorAll('.img-marker'))
      .sort(markerReadingOrder)
      .forEach((m) => {
        const n = String(counter++);
        m.setAttribute('data-n', n);
        m.textContent = n;
        touched++;
      });
  });
  if (touched > 0) setDirty(true);
  showToast('เรียงเลขต่อเนื่องข้ามรูปแล้ว');
}

/* Marker size presets are per-image, stored as class msize-1..4 on the
 * .img-frame. Size 2 (M) is the base style → no class. Size travels in
 * the saved HTML so it persists + can be mirrored in the book PDF CSS. */
function getFrameSize(frame) {
  for (const s of [1, 2, 4]) {
    if (frame.classList.contains('msize-' + s)) return s;
  }
  return 3; // base style (no class) = level 3 (default)
}
function setFrameSize(frame, size) {
  size = Math.max(1, Math.min(4, size));
  [1, 2, 3, 4].forEach((s) => frame.classList.remove('msize-' + s));
  if (size !== 3) frame.classList.add('msize-' + size); // 3 = base, no class
  setDirty(true);
  return size;
}
/** Toolbar: bump the active frame's marker size by delta (+1 / -1). */
function changeMarkerSize(delta) {
  if (!annotatingFrame) { showToast('เข้าโหมดใส่ตัวชี้ที่รูปก่อน'); return; }
  const next = setFrameSize(annotatingFrame, getFrameSize(annotatingFrame) + delta);
  const labels = { 1: 'เล็ก', 2: 'กลาง', 3: 'ใหญ่', 4: 'ใหญ่พิเศษ' };
  showToast('ขนาดตัวชี้: ' + labels[next] + ' (' + next + '/4)');
}

/** Bind place / drag / delete handlers once (event delegation). */
function bindMarkerEvents(doc) {
  if (!doc.body || doc.body._markerBound) return;
  doc.body._markerBound = true;

  let dragMarker = null;
  let dragRect = null;

  // Place a marker: click on the annotating frame (not on a marker)
  doc.body.addEventListener('click', (e) => {
    if (!annotatingFrame) return;
    const frame = e.target.closest && e.target.closest('.img-frame');

    // Clicked outside the current frame. If it landed on ANOTHER book
    // image → switch annotate mode straight to it (P2-S81 option A), so
    // the user doesn't have to exit + reselect. We require the click to
    // be on the <img> itself (not caption/empty) to avoid accidental
    // switches.
    if (frame !== annotatingFrame) {
      const otherImg =
        e.target.closest && e.target.closest('figure.book-img img');
      if (otherImg && !annotatingFrame.contains(otherImg)) {
        e.preventDefault();
        e.stopPropagation();
        switchAnnotateTo(otherImg);
      }
      return; // switched, or clicked text/empty → never place here
    }

    if (e.target.closest('.img-marker')) return; // clicked a marker → not place
    e.preventDefault();
    e.stopPropagation();
    const rect = frame.getBoundingClientRect();
    const x = clampPct(((e.clientX - rect.left) / rect.width) * 100);
    const y = clampPct(((e.clientY - rect.top) / rect.height) * 100);
    const markers = frame.querySelector('.img-markers');
    const n = String(computeNextMarkerNumber(frame));
    const m = doc.createElement('span');
    m.className = 'img-marker';
    m.setAttribute('data-n', n);
    m.textContent = n;
    m.style.left = x.toFixed(1) + '%';
    m.style.top = y.toFixed(1) + '%';
    markers.appendChild(m);
    setDirty(true);
  }, true);

  // Select + start dragging a marker
  doc.body.addEventListener('mousedown', (e) => {
    if (!annotatingFrame) return;
    const marker = e.target.closest && e.target.closest('.img-marker');
    if (!marker || marker.closest('.img-frame') !== annotatingFrame) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // beat bindImageClicks' mousedown
    annotatingFrame
      .querySelectorAll('.img-marker.selected')
      .forEach((x) => x.classList.remove('selected'));
    marker.classList.add('selected', 'dragging');
    dragMarker = marker;
    dragRect = annotatingFrame.getBoundingClientRect();
  }, true);

  // Double-click a marker → open the start-number dialog for this image.
  doc.body.addEventListener('dblclick', (e) => {
    if (!annotatingFrame) return;
    const marker = e.target.closest && e.target.closest('.img-marker');
    if (!marker || marker.closest('.img-frame') !== annotatingFrame) return;
    e.preventDefault();
    e.stopPropagation();
    openMarkerStartDialog(annotatingFrame, marker);
  }, true);

  doc.body.addEventListener('mousemove', (e) => {
    if (!dragMarker || !dragRect) return;
    const x = clampPct(((e.clientX - dragRect.left) / dragRect.width) * 100);
    const y = clampPct(((e.clientY - dragRect.top) / dragRect.height) * 100);
    dragMarker.style.left = x.toFixed(1) + '%';
    dragMarker.style.top = y.toFixed(1) + '%';
  }, true);

  doc.body.addEventListener('mouseup', () => {
    if (dragMarker) {
      dragMarker.classList.remove('dragging');
      setDirty(true);
    }
    dragMarker = null;
    dragRect = null;
  }, true);

  // Delete selected marker / Esc to close submenu or exit mode
  doc.body.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const menu = document.getElementById('markerMenu');
      if (menu && menu.classList.contains('show')) { hideMarkerMenu(); return; }
      if (annotatingFrame) exitAnnotateMode();
      return;
    }
    if (!annotatingFrame) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const sel = annotatingFrame.querySelector('.img-marker.selected');
    if (!sel) return;
    e.preventDefault();
    e.stopPropagation();
    sel.remove();
    setDirty(true);
  }, true);
}

/* Close the text-align submenu when the user clicks or presses Esc INSIDE
 * the editor iframe (P2-S83). Parent-document handlers can't see events
 * that happen inside the iframe, so the menu would otherwise stay open
 * after clicking into the document or pressing Esc there. */
function bindToolbarMenuDismiss(doc) {
  if (!doc.body || doc.body._tbMenuDismissBound) return;
  doc.body._tbMenuDismissBound = true;

  doc.addEventListener('mousedown', () => {
    const am = document.getElementById('alignMenu');
    if (am && am.classList.contains('show')) hideAlignMenu();
  }, true);

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const am = document.getElementById('alignMenu');
    if (am && am.classList.contains('show')) {
      hideAlignMenu();
      e.stopPropagation();
    }
  }, true);
}

// ลิงก์ใน contenteditable: browser ไม่ navigate เอง — ดักจับ click แล้ว scroll/open ให้
function bindAnchorClicks(doc) {
  if (!doc.body || doc.body._anchorBound) return;
  doc.body._anchorBound = true;

  doc.body.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';

    // Internal anchor (#id) — smooth scroll ใน iframe
    // ใช้ explicit scrollTo (ไม่ใช้ scrollIntoView) เพราะใน contenteditable=true Chrome จะ
    // วาง caret ตอน click → race กับ scrollIntoView → scroll ไม่ทำงาน
    // raF ทำให้ click event settle ก่อน แล้วค่อย scroll
    if (href.startsWith('#')) {
      const id = decodeURIComponent(href.slice(1));
      if (!id) return;
      const target = doc.getElementById(id) || doc.querySelector(`[name="${CSS.escape(id)}"]`);
      if (target) {
        e.preventDefault();
        const win = doc.defaultView;
        requestAnimationFrame(() => {
          const rect = target.getBoundingClientRect();
          const currentTop = win.scrollY || doc.documentElement.scrollTop || 0;
          win.scrollTo({
            top: Math.max(0, currentTop + rect.top - 20),
            behavior: 'smooth'
          });
        });
      }
      return;
    }

    // External (http/https/mailto/tel) — block default; Ctrl/Cmd+click เปิดแท็บใหม่
    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    }
  });
}

function showImageModalForEdit(img) {
  editingImage = img;
  const doc = getDoc();
  doc.querySelectorAll('.img-editing').forEach((el) => el.classList.remove('img-editing'));
  img.classList.add('img-editing');

  document.getElementById('imageModalTitle').textContent = '🖼️ แก้ไขรูปภาพ';
  document.getElementById('imgSubmitBtn').textContent = 'บันทึก';
  document.getElementById('imgDeleteBtn').style.display = 'flex';

  resetImageFilePicker(); // ล้างค่าก่อนเปิด

  const currentSrc = img.getAttribute('data-original-src') || img.getAttribute('src') || '';
  
  // เช็คว่าเป็น Base64 เดิมหรือไม่ ถ้าใช่ให้โหลดเข้า RAM เพื่อป้องกันการตัดโค้ด
  const cb = document.getElementById('imgEmbedFile');
  if (currentSrc.startsWith('data:image/')) {
    currentBase64Data = currentSrc;
    document.getElementById('imgUrl').value = "ภาพ Base64 ฝังในเอกสาร (อ่านอย่างเดียว)";
    document.getElementById('imgUrl').setAttribute('readonly', 'true');
    if (cb) cb.checked = true;
  } else {
    currentBase64Data = null;
    document.getElementById('imgUrl').value = currentSrc;
    document.getElementById('imgUrl').removeAttribute('readonly');
    if (cb) cb.checked = false;
  }

  document.getElementById('imgAlt').value = img.getAttribute('alt') || '';
  document.getElementById('imgWidth').value = img.style.width || '';
  document.getElementById('imgHeight').value = img.style.height || '';
  document.getElementById('imgObjectFit').value = img.style.objectFit || '';

  updateImagePreviewFromUrl(img.getAttribute('src') || currentSrc);

  document.getElementById('imageModal').classList.add('show');
}

async function handleImageFile(e) {
  const file = e.target.files[0];
  if (file) {
    currentSelectedFile = file;
    await processSelectedImage(file);
  }
  e.target.value = ''; 
}

async function handleEmbedCheckboxChange() {
  const checkbox = document.getElementById('imgEmbedFile');
  const embedFile = checkbox.checked;

  if (currentSelectedFile) {
    await processSelectedImage(currentSelectedFile);
    return;
  }

  if (!editingImage) return;

  const isCurrentlyEmbedded = !!currentBase64Data;
  if (embedFile === isCurrentlyEmbedded) return;

  checkbox.disabled = true;
  try {
    if (embedFile) {
      const currentPath = document.getElementById('imgUrl').value.trim();
      if (!currentPath.startsWith('./images/')) {
        showToast('แปลงเป็น Base64 ได้เฉพาะรูปในโฟลเดอร์โปรเจกต์');
        checkbox.checked = false;
        return;
      }
      if (!projectDirHandle) {
        showToast('ยังไม่ได้เปิดโฟลเดอร์โปรเจกต์');
        checkbox.checked = false;
        return;
      }
      const file = await resolveProjectFile(projectDirHandle, currentPath);
      if (!file) {
        showToast('ไม่พบไฟล์รูปในโปรเจกต์');
        checkbox.checked = false;
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      currentBase64Data = dataUrl;
      safeRevokeObjectURL(window.tempInsertObjUrl);
      window.tempInsertObjUrl = null;
      document.getElementById('imgUrl').value = 'ภาพ Base64 ฝังในเอกสาร (อ่านอย่างเดียว)';
      document.getElementById('imgUrl').setAttribute('readonly', 'true');
      await updateImagePreviewFromUrl(dataUrl);
      showToast('แปลงเป็น Base64 พร้อมฝังในเอกสารแล้ว');
    } else {
      if (!currentBase64Data) return;
      if (!projectDirHandle) {
        alert('กรุณาเปิดโฟลเดอร์โปรเจกต์ก่อนแปลงเป็นลิงก์ไฟล์');
        checkbox.checked = true;
        return;
      }
      if (!(await ensureWritePermission(projectDirHandle))) {
        showToast('ไม่ได้รับสิทธิ์เขียนไฟล์ในโฟลเดอร์โปรเจกต์ — กดอนุญาตในแถบเบราว์เซอร์');
        checkbox.checked = true;
        return;
      }
      const filename = generateEmbedFilename(currentBase64Data);
      const blob = blobFromDataUrl(currentBase64Data);
      if (blob.size === 0) throw new Error('Decoded blob is empty');

      const imgDirHandle = await projectDirHandle.getDirectoryHandle('images', { create: true });
      const fileHandle = await imgDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      const writtenFile = await fileHandle.getFile();
      if (!writtenFile || writtenFile.size === 0) {
        throw new Error('ไฟล์ที่บันทึกว่างเปล่า — การเขียนอาจล้มเหลว');
      }

      currentBase64Data = null;
      const relativePath = `./images/${filename}`;
      projectImageCache.set(relativePath, blob);
      document.getElementById('imgUrl').value = relativePath;
      document.getElementById('imgUrl').removeAttribute('readonly');

      const objUrl = await safeBlobToUrl(blob);
      if (objUrl.startsWith('blob:')) activeObjectUrls.push(objUrl);
      window.tempInsertObjUrl = objUrl;

      const previewImg = document.getElementById('imgPreviewSrc');
      previewImg.removeAttribute('src');
      previewImg.src = objUrl;
      document.getElementById('imgPreview').classList.add('show');
      showToast(`บันทึกรูปลง ${relativePath} (${(writtenFile.size/1024).toFixed(1)} KB)`);
    }
  } catch (e) {
    console.error('[handleEmbedCheckboxChange] failed:', e?.name, e?.message, e);
    let msg;
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
      msg = 'ไม่ได้รับสิทธิ์เขียนไฟล์ — กดอนุญาตในเบราว์เซอร์แล้วลองใหม่';
    } else if (e?.name === 'InvalidStateError') {
      msg = 'ไฟล์ถูกใช้งานอยู่ ลองปิด preview/โปรแกรมอื่นที่เปิดไฟล์อยู่';
    } else if (e?.name === 'NotFoundError') {
      msg = 'หาโฟลเดอร์/ไฟล์ไม่เจอ — โปรเจกต์อาจถูกย้ายหรือลบ';
    } else {
      msg = `แปลงรูปไม่สำเร็จ: ${e?.name || ''} ${e?.message || e}`.trim();
    }
    showToast(msg);
    checkbox.checked = !embedFile;
  } finally {
    checkbox.disabled = false;
  }
}

let isProcessingImage = false;

function setImageProcessing(processing) {
  isProcessingImage = processing;
  const submit = document.getElementById('imgSubmitBtn');
  const embedCb = document.getElementById('imgEmbedFile');
  if (submit) {
    submit.disabled = processing;
    submit.textContent = processing
      ? 'กำลังประมวลผล...'
      : (editingImage ? 'บันทึก' : 'แทรก');
  }
  if (embedCb) embedCb.disabled = processing;
}

async function processSelectedImage(file) {
  const embedFile = document.getElementById('imgEmbedFile').checked;
  const altInput = document.getElementById('imgAlt');

  document.getElementById('imgFileName').textContent = file.name;
  document.querySelector('.img-file-picker').classList.add('has-file');
  if (!altInput.value.trim()) {
    altInput.value = file.name.replace(/\.[^.]+$/, '');
  }

  setImageProcessing(true);
  try {
  if (embedFile) {
    const dataUrl = await readFileAsDataUrl(file);
    currentBase64Data = dataUrl;
    document.getElementById('imgUrl').value = "ภาพ Base64 ฝังในเอกสาร (อ่านอย่างเดียว)";
    document.getElementById('imgUrl').setAttribute('readonly', 'true');
    document.getElementById('imgPreviewSrc').src = dataUrl;
    document.getElementById('imgPreview').classList.add('show');
    safeRevokeObjectURL(window.tempInsertObjUrl);
    window.tempInsertObjUrl = null;
  } else {
    if (!projectDirHandle) {
      alert("กรุณาเปิดโฟลเดอร์โปรเจกต์ก่อนแทรกรูปแบบอ้างอิงไฟล์ครับ");
      return;
    }
    if (!(await ensureWritePermission(projectDirHandle))) {
      alert("ไม่ได้รับสิทธิ์เขียนไฟล์ในโฟลเดอร์โปรเจกต์ — กรุณากดอนุญาตเมื่อเบราว์เซอร์ถาม แล้วลองใหม่");
      return;
    }
    try {
      showToast("กำลังเตรียมรูปภาพลงโปรเจกต์...");
      const imgDirHandle = await projectDirHandle.getDirectoryHandle('images', { create: true });
      const fileHandle = await imgDirHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();

      // อ่านไฟล์กลับมาจากดิสก์ — ได้ File reference สด ๆ ที่อ่านได้แน่นอน
      // (file เดิมจาก <input> อาจถูก invalidate หลัง writable.write)
      const freshFile = await fileHandle.getFile();

      currentBase64Data = null;
      document.getElementById('imgUrl').removeAttribute('readonly');

      const relativePath = `./images/${file.name}`;
      projectImageCache.set(relativePath, freshFile);
      document.getElementById('imgUrl').value = relativePath;

      const objUrl = await safeBlobToUrl(freshFile);
      document.getElementById('imgPreviewSrc').src = objUrl;
      document.getElementById('imgPreview').classList.add('show');

      safeRevokeObjectURL(window.tempInsertObjUrl);
      if (objUrl.startsWith('blob:')) activeObjectUrls.push(objUrl);
      window.tempInsertObjUrl = objUrl;
    } catch (err) {
      console.error('[processSelectedImage embed=false] failed:', err?.name, err?.message, err);
      const msg = err?.name === 'NotReadableError'
        ? 'อ่านไฟล์ไม่ได้ — อาจเป็นปัญหาสิทธิ์หรือไฟล์ถูกย้าย ลองเลือกไฟล์ใหม่อีกครั้ง'
        : err?.name === 'NotAllowedError'
        ? 'ไม่ได้รับสิทธิ์เขียนไฟล์ — กดอนุญาตในเบราว์เซอร์'
        : `บันทึกรูปไม่สำเร็จ: ${err?.message || err}`;
      alert(msg);
    }
  }
  } finally {
    setImageProcessing(false);
  }
}

function resetImageFilePicker() {
  setImageProcessing(false);
  currentSelectedFile = null;
  safeRevokeObjectURL(window.tempInsertObjUrl);
  window.tempInsertObjUrl = null;
  currentBase64Data = null;
  
  const fileInput = document.getElementById('imgFileInput');
  if (fileInput) fileInput.value = '';
  const picker = document.querySelector('.img-file-picker');
  if (picker) picker.classList.remove('has-file');
  const nameEl = document.getElementById('imgFileName');
  if (nameEl) nameEl.textContent = 'คลิกเพื่อเลือกรูปภาพ...';
  
  const imgUrlEl = document.getElementById('imgUrl');
  if (imgUrlEl) imgUrlEl.removeAttribute('readonly');
  
  const embedCheckbox = document.getElementById('imgEmbedFile');
  if (embedCheckbox) embedCheckbox.checked = true;
}

function showImageModal() {
  editingImage = null;
  document.getElementById('imageModalTitle').textContent = '🖼️ แทรกรูปภาพ';
  document.getElementById('imgSubmitBtn').textContent = 'แทรก';
  document.getElementById('imgDeleteBtn').style.display = 'none';

  document.getElementById('imgUrl').value = '';
  document.getElementById('imgAlt').value = '';
  document.getElementById('imgWidth').value = '';
  document.getElementById('imgHeight').value = '';
  document.getElementById('imgObjectFit').value = '';

  document.getElementById('imgPreview').classList.remove('show');
  resetImageFilePicker();

  const sel = getWin().getSelection();
  if (sel.rangeCount) {
    savedSelection = sel.getRangeAt(0).cloneRange();
  }

  document.getElementById('imageModal').classList.add('show');
  document.getElementById('imgUrl').focus();
}

function closeImageModal() {
  document.getElementById('imageModal').classList.remove('show');
  if (editingImage) {
    editingImage.classList.remove('img-editing');
    editingImage = null;
  }
}

async function insertImage() {
  if (isProcessingImage) {
    showToast('กำลังประมวลผลรูปอยู่ กรุณารอสักครู่');
    return;
  }
  // ดึงค่า URL ปกติ หรือดึงจาก RAM ถ้าเป็น Base64
  let url = document.getElementById('imgUrl').value.trim();
  if (currentBase64Data) {
    url = currentBase64Data;
  }

  const alt = document.getElementById('imgAlt').value.trim() || 'รูปภาพ';
  const width = document.getElementById('imgWidth').value.trim();
  const height = document.getElementById('imgHeight').value.trim();
  const objectFit = document.getElementById('imgObjectFit').value;

  if (!url) return;

  if (editingImage) {
    const previousOriginalSrc = editingImage.getAttribute('data-original-src') || '';
    const previousPreviewSrc = editingImage.getAttribute('src') || '';

    if (window.tempInsertObjUrl && url.startsWith('./images/')) {
      editingImage.removeAttribute('src');
      editingImage.setAttribute('src', window.tempInsertObjUrl);
      editingImage.setAttribute('data-original-src', url);
      window.tempInsertObjUrl = null;
    } else if (url.startsWith('./images/')) {
      // รักษา preview ใน editor ไว้เป็น blob URL แต่บันทึก path จริงไว้ที่ data-original-src
      // เพื่อให้ saveProject() เขียน HTML ออกมาเป็น ./images/... เหมือนเดิม
      let previewSrc = previousOriginalSrc === url ? previousPreviewSrc : '';
      if (!previewSrc || previewSrc === url || previewSrc.startsWith('./images/')) {
        previewSrc = await createObjectUrlForProjectImage(url) || url;
      }
      editingImage.removeAttribute('src');
      editingImage.setAttribute('src', previewSrc);
      editingImage.setAttribute('data-original-src', url);
    } else {
      editingImage.removeAttribute('src');
      editingImage.setAttribute('src', url);
      editingImage.removeAttribute('data-original-src');
    }

    editingImage.setAttribute('alt', alt);
    editingImage.style.width = width || '';
    editingImage.style.height = height || '';
    editingImage.style.objectFit = objectFit || '';

    const figure = editingImage.closest('figure');
    if (figure) {
      const caption = figure.querySelector('figcaption');
      if (caption) caption.textContent = alt;
    }

    setDirty(true);
    closeImageModal();
    showToast('อัปเดตรูปภาพแล้ว ✓');
  } else {
    focusEditor();
    if (savedSelection) {
      const sel = getWin().getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection);
    }
    
    const safeUrl = safeImageUrl(url);
    const cssLenRe = /^(\d+(\.\d+)?(px|%|em|rem|vh|vw|pt|cm|mm|in|pc)?|auto|inherit)$/;
    const safeWidth = cssLenRe.test(width) ? width : '';
    const safeHeight = cssLenRe.test(height) ? height : '';
    const safeFit = ['cover', 'contain'].includes(objectFit) ? objectFit : '';

    let styleStr = '';
    if (safeWidth) styleStr += `width: ${safeWidth}; `;
    if (safeHeight) styleStr += `height: ${safeHeight}; `;
    if (safeFit) styleStr += `object-fit: ${safeFit}; `;
    const styleAttr = styleStr ? ` style="${styleStr.trim()}"` : '';

    let finalSrc = safeUrl;
    let dataOriginalSrcAttr = '';

    if (window.tempInsertObjUrl && safeUrl.startsWith('./images/')) {
      finalSrc = window.tempInsertObjUrl;
      dataOriginalSrcAttr = ` data-original-src="${escapeHtml(safeUrl)}"`;
      window.tempInsertObjUrl = null;
    } else if (safeUrl.startsWith('./images/')) {
      const previewSrc = await createObjectUrlForProjectImage(safeUrl);
      if (previewSrc) {
        finalSrc = previewSrc;
        dataOriginalSrcAttr = ` data-original-src="${escapeHtml(safeUrl)}"`;
      }
    }

    const escAlt = escapeHtml(alt);
    const html = `
<figure class="book-img">
  <img src="${escapeHtml(finalSrc)}" alt="${escAlt}" loading="lazy"${styleAttr}${dataOriginalSrcAttr}>
  <figcaption>${escAlt}</figcaption>
</figure>
<p><br></p>`;
    getDoc().execCommand('insertHTML', false, html);

    closeImageModal();
    showToast('แทรกรูปภาพแล้ว');
  }
}

function deleteImage() {
  if (!editingImage) return;
  const figure = editingImage.closest('figure');
  if (figure) {
    figure.remove();
  } else {
    editingImage.remove();
  }
  setDirty(true);
  closeImageModal();
  showToast('ลบรูปภาพแล้ว');
}

// ==============================================
// LIST SETTINGS (ตั้งค่าตัวเลข)
// ==============================================

function showListSettingModal() {
  const sel = getWin().getSelection();
  if (!sel.rangeCount) return showToast('กรุณาคลิกที่รายการ (OL) ก่อนครับ');
  
  let node = sel.anchorNode;
  if (node && node.nodeType === 3) node = node.parentNode;
  if (!node) return;

  const ol = node.closest('ol');
  if (!ol) {
    showToast('กรุณาคลิกเคอร์เซอร์ไว้ในรายการที่มีตัวเลขก่อนตั้งค่าครับ');
    return;
  }

  savedSelection = sel.getRangeAt(0).cloneRange();
  document.getElementById('listStartInput').value = ol.getAttribute('start') || 1;
  document.getElementById('listSettingModal').classList.add('show');
}

function closeListSettingModal() {
  document.getElementById('listSettingModal').classList.remove('show');
}

function getEditingOl() {
  focusEditor();
  if (savedSelection) {
    const sel = getWin().getSelection();
    sel.removeAllRanges();
    sel.addRange(savedSelection);
    let node = sel.anchorNode;
    if (node && node.nodeType === 3) node = node.parentNode;
    return node ? node.closest('ol') : null;
  }
  return null;
}

function applyListStart() {
  const ol = getEditingOl();
  const val = document.getElementById('listStartInput').value;
  if (ol) {
    ol.setAttribute('start', val);
    setDirty(true);
    showToast(`เริ่มรันเลขใหม่ที่ ${val} แล้ว`);
  }
  closeListSettingModal();
}

function autoContinueList() {
  const ol = getEditingOl();
  if (ol) {
    const allOls = Array.from(getDoc().querySelectorAll('ol'));
    const currentIndex = allOls.indexOf(ol);
    
    if (currentIndex > 0) {
      const prevOl = allOls[currentIndex - 1];
      const prevStart = parseInt(prevOl.getAttribute('start') || 1);
      const prevCount = prevOl.querySelectorAll('li').length;
      
      const nextStart = prevStart + prevCount;
      ol.setAttribute('start', nextStart);
      setDirty(true);
      showToast(`รันตัวเลขต่อเป็นเลข ${nextStart} แล้ว`);
    } else {
      showToast('ไม่พบรายการด้านบนให้เชื่อมต่อ');
    }
  }
  closeListSettingModal();
}

// ==============================================
// HOVER QUICK INSERT (เมนูแทรกด่วนเมื่อเลื่อนเมาส์)
// ==============================================

function bindHoverInsert(doc) {
  const btn = document.getElementById('quickInsertBtn');
  const menu = document.getElementById('quickInsertMenu');
  
  doc.body.addEventListener('mousemove', (e) => {
    if (isQuickMenuOpen) return;

    let block = e.target.closest(
      'p, h1, h2, h3, h4, blockquote, figure, .code-block, .note, ul, ol, .table-wrap, table'
    );

    // Tables: closest() usually matches <table> before <.table-wrap>
    // because it's closer to the cursor. We prefer the wrap for the
    // "+" anchor so the visual position lines up with the wrap's
    // border-radius / overflow box (the visible "table" boundary).
    // The quickAction container-escape logic also handles this, but
    // mirroring it here keeps the "+" position consistent with where
    // the new block will actually land.
    if (block && block.tagName === 'TABLE') {
      block = block.closest('.table-wrap') || block;
    }

    if (block) {
      clearTimeout(quickMenuHideTimeout);
      hoveredBlock = block;
      const rect = block.getBoundingClientRect();
      btn.classList.add('show');
      btn.style.top = (rect.top + 2) + 'px';
    } else {
      scheduleHide();
    }
  });

  doc.addEventListener('scroll', () => {
    if (!isQuickMenuOpen) {
      btn.classList.remove('show');
      menu.classList.remove('show');
    }
  });
  
  doc.body.addEventListener('mouseleave', () => {
    if (!isQuickMenuOpen) scheduleHide();
  });

  btn.addEventListener('mouseenter', () => clearTimeout(quickMenuHideTimeout));
  menu.addEventListener('mouseenter', () => clearTimeout(quickMenuHideTimeout));

  // Esc inside the iframe → close quick menu. Iframe keydowns don't
  // bubble to the parent document, so a parent-level Esc handler can't
  // see them. Mirror the same close logic here. The parent-level Esc
  // handler (further down in this file) covers the case when focus is
  // on a parent-document button (menu items, toolbar, etc.).
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isQuickMenuOpen) {
      closeQuickMenu();
      e.stopPropagation();
    }
  });

  function scheduleHide() {
    clearTimeout(quickMenuHideTimeout);
    quickMenuHideTimeout = setTimeout(() => {
      if (!isQuickMenuOpen) {
        btn.classList.remove('show');
        hoveredBlock = null;
      }
    }, 300);
  }
}

function toggleQuickMenu() {
  const menu = document.getElementById('quickInsertMenu');
  const btn = document.getElementById('quickInsertBtn');
  
  if (isQuickMenuOpen) {
    menu.classList.remove('show');
    btn.classList.remove('active');
    isQuickMenuOpen = false;
  } else {
    if (hoveredBlock) {
      const sel = getWin().getSelection();
      const range = getDoc().createRange();
      range.setStart(hoveredBlock, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      focusEditor();
      savedSelection = range;
    }
    
    btn.classList.add('active');
    menu.style.top = btn.style.top;
    menu.classList.add('show');
    isQuickMenuOpen = true;
  }
}

// HTML payloads for quick-insert actions. Kept here (rather than reusing
// insertNoteBox / insertCodeBlock) because the container-escape branch
// below needs to parse them as DOM nodes and insert via parentNode.insertBefore,
// not via execCommand.
const QUICK_INSERT_HTML = {
  p:    '<p><br></p>',
  h2:   '<h2><br></h2>',
  h3:   '<h3><br></h3>',
  h4:   '<h4><br></h4>',
  note: '<div class="note">\n  <div class="note-label">Note</div>\n  <p>เขียนหมายเหตุที่นี่</p>\n</div>',
  code: '<div class="code-block">\n  <div class="code-header">\n    <span class="code-lang-badge">code</span>\n    <span class="code-linecount">1 บรรทัด</span>\n  </div>\n  <pre><code><span class="line">// เขียนโค้ดที่นี่</span></code></pre>\n</div>',
};

// Selectors for "container" elements that the quick-insert "+" should
// escape from. When the user hovers a paragraph INSIDE a note box and
// clicks +, they want the new block before the WHOLE note — not nested
// inside the note (which is what setStart(p, 0) + insertHTML produces
// because the browser keeps the caret inside the contenteditable's
// nearest enclosing block).
const QUICK_INSERT_CONTAINER_SELECTOR =
  '.note, .code-block, blockquote, figure, ul, ol, .table-wrap, table';

function quickAction(action) {
  // Container escape path.
  //
  // If the hovered block lives inside a container (or IS a container),
  // we bypass execCommand entirely and use DOM insertBefore against the
  // outermost container. execCommand's insertHTML, even with the caret
  // anchored "before" the container via setStartBefore, sometimes ends
  // up nesting content inside the container — Chrome normalizes the
  // caret to the nearest valid contenteditable position, which often
  // means "inside the container at offset 0". DOM insertBefore has no
  // such ambiguity: it places the new node as a sibling of the anchor,
  // before it, full stop.
  let container = null;
  if (hoveredBlock) {
    container =
      hoveredBlock.closest(QUICK_INSERT_CONTAINER_SELECTOR)
      || (hoveredBlock.matches && hoveredBlock.matches(QUICK_INSERT_CONTAINER_SELECTOR)
            ? hoveredBlock
            : null);
    // Tables: hover usually hits the inner table (closest finds it
    // first), but we want to anchor on the outer .table-wrap so the
    // wrap's overflow/break-inside layout stays intact.
    if (container && container.tagName === 'TABLE') {
      container = container.closest('.table-wrap') || container;
    }
  }

  if (container && action !== 'image' && QUICK_INSERT_HTML[action]) {
    insertHtmlBeforeNode(container, QUICK_INSERT_HTML[action]);
  } else {
    // No container → original beta-0.50 behavior. setStart(hoveredBlock, 0)
    // was already set in toggleQuickMenu; here we just let execCommand
    // take it from there. For plain <p>/<h*> at top level the browser
    // auto-splits and the new block ends up BEFORE the hovered block,
    // which matches user expectations.
    if (action === 'image') showImageModal();
    else if (action === 'p') {
      focusEditor();
      getDoc().execCommand('insertHTML', false, '<p><br></p>'); // แทรกย่อหน้าใหม่
    }
    else if (action === 'h2') {
      focusEditor();
      getDoc().execCommand('insertHTML', false, '<h2><br></h2>');
    }
    else if (action === 'h3') {
      focusEditor();
      getDoc().execCommand('insertHTML', false, '<h3><br></h3>');
    }
    else if (action === 'h4') {
      focusEditor();
      getDoc().execCommand('insertHTML', false, '<h4><br></h4>');
    }
    else if (action === 'note') insertNoteBox();
    else if (action === 'code') insertCodeBlock();
  }

  document.getElementById('quickInsertMenu').classList.remove('show');
  document.getElementById('quickInsertBtn').classList.remove('active');
  isQuickMenuOpen = false;
}

// DOM-based insert: builds nodes from `html` and places them as siblings
// of `anchor`, immediately before it. After insertion the caret lands
// inside the first new element so the user can type right away.
//
// Used only by the quick-insert "+" container-escape path. The book's
// regular editing flow uses execCommand for change-history reasons
// (built-in undo stack), but the escape path needs surgical placement
// that execCommand can't reliably give.
function insertHtmlBeforeNode(anchor, html) {
  if (!anchor || !anchor.parentNode) return;
  const doc = getDoc();
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  const firstNew = tmp.firstElementChild;
  if (!firstNew) return;

  // Move all parsed top-level nodes (preserves whitespace text nodes
  // between siblings if the HTML had any — though our payloads are
  // single-element).
  while (tmp.firstChild) {
    anchor.parentNode.insertBefore(tmp.firstChild, anchor);
  }

  // Place caret at the start of the first inserted element so typing
  // appends content into it immediately.
  const sel = getWin().getSelection();
  const range = doc.createRange();
  range.selectNodeContents(firstNew);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  focusEditor();
  setDirty(true);
}

// Helper — close the quick insert menu + reset its trigger state.
// Single source of truth for the close sequence so the parent-doc Esc
// handler, the iframe-doc Esc handler, and any future call sites stay
// in sync without duplicating the 3-line block.
function closeQuickMenu() {
  document.getElementById('quickInsertMenu').classList.remove('show');
  document.getElementById('quickInsertBtn').classList.remove('active');
  isQuickMenuOpen = false;
}

// P2-S81 — parent-document keydown for marker delete / Esc. The iframe
// already has its own handler (doc.body), but it only fires when the
// iframe is focused. After entering annotate mode via the toolbar (a
// parent button) — or after a marker mousedown calls preventDefault,
// which suppresses iframe focus — keyboard events land on the PARENT
// instead. Handling them here makes Delete work regardless of focus.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Esc closes the marker submenu first (if open), regardless of mode.
    const menu = document.getElementById('markerMenu');
    if (menu && menu.classList.contains('show')) { hideMarkerMenu(); return; }
    // Otherwise exit annotate mode — but let an open modal own its Esc.
    if (annotatingFrame && !document.querySelector('.modal-overlay.show')) {
      exitAnnotateMode();
    }
    return;
  }
  if (!annotatingFrame) return;
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  // Don't hijack delete while typing in a real parent-UI field.
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
    return;
  }
  const sel = annotatingFrame.querySelector('.img-marker.selected');
  if (!sel) return;
  e.preventDefault();
  sel.remove();
  setDirty(true);
});

document.addEventListener('click', (e) => {
  const btn = document.getElementById('quickInsertBtn');
  const menu = document.getElementById('quickInsertMenu');
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('show');
    btn.classList.remove('active');
    isQuickMenuOpen = false;
  }

  // Close table grid picker on outside click. The picker's own trigger
  // calls stopPropagation() so opening it doesn't immediately close it.
  const picker = document.getElementById('tableGridPicker');
  const tableBtn = document.getElementById('tableBtn');
  if (picker && picker.classList.contains('show')
      && !picker.contains(e.target)
      && (!tableBtn || !tableBtn.contains(e.target))) {
    hideTableGridPicker();
  }

  // Close image-marker submenu on outside click (P2-S81). The caret
  // trigger calls stopPropagation() so opening doesn't immediately
  // close it; clicking the main toggle button also closes it (it's not
  // the caret) which is the desired behaviour.
  const markerMenu = document.getElementById('markerMenu');
  const markerCaret = document.getElementById('markerCaretBtn');
  if (markerMenu && markerMenu.classList.contains('show')
      && !markerMenu.contains(e.target)
      && (!markerCaret || !markerCaret.contains(e.target))) {
    hideMarkerMenu();
  }

  // Close text-align submenu on outside click (P2-S83). Same pattern as
  // the marker submenu: the caret trigger stops propagation on open.
  const alignMenu = document.getElementById('alignMenu');
  const alignCaret = document.getElementById('alignCaretBtn');
  if (alignMenu && alignMenu.classList.contains('show')
      && !alignMenu.contains(e.target)
      && (!alignCaret || !alignCaret.contains(e.target))) {
    hideAlignMenu();
  }

  // Close table context menu on outside click (any click that's not
  // inside the menu itself closes it — including a click that triggered
  // a different right-click somewhere else).
  const ctxMenu = document.getElementById('tableContextMenu');
  if (ctxMenu && ctxMenu.classList.contains('show')
      && !ctxMenu.contains(e.target)) {
    hideTableContextMenu();
  }
});

// Esc closes hover-anchored popovers — quick insert menu first, then
// table grid picker, then table context menu. Order matters: we close
// the topmost / most-recently-opened thing on a single press, so the
// user can chain Esc presses to back out through layers (matches the
// modal-Esc UX pattern).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  if (isQuickMenuOpen) {
    closeQuickMenu();
    e.stopPropagation();
    return;
  }
  const picker = document.getElementById('tableGridPicker');
  if (picker && picker.classList.contains('show')) {
    hideTableGridPicker();
    e.stopPropagation();
    return;
  }
  const alignMenu = document.getElementById('alignMenu');
  if (alignMenu && alignMenu.classList.contains('show')) {
    hideAlignMenu();
    e.stopPropagation();
    return;
  }
  const ctxMenu = document.getElementById('tableContextMenu');
  if (ctxMenu && ctxMenu.classList.contains('show')) {
    hideTableContextMenu();
    e.stopPropagation();
  }
});

// ==============================================
// KEYBOARD SHORTCUTS
// ==============================================

function handleEditorKeys(e) {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'b': e.preventDefault(); execCmd('bold'); break;
      case 'i': e.preventDefault(); execCmd('italic'); break;
      case 'u': e.preventDefault(); execCmd('underline'); break;
      case 'z':
        e.preventDefault();
        if (e.shiftKey) execCmd('redo');
        else execCmd('undo');
        break;
      case 'y': e.preventDefault(); execCmd('redo'); break;
      case 's': e.preventDefault(); saveProject(); break;
    }
  }
}

// ==============================================
// SAVE PROJECT
// ==============================================

// ── Print-safe text sanitization ────────────────────────────
//
// Books authored here often end up as PDFs sent to commercial printers.
// Color-emoji glyphs cause real problems in that pipeline:
//   - Emoji fonts use bitmap / SVG-in-OpenType tables that don't always
//     embed cleanly in PDFs (Prince/WeasyPrint may fall back to tofu).
//   - Color glyphs carry hard-coded sRGB color which conflicts with the
//     ICC profile being embedded for offset (CMYK) or B/W workflows.
//
// `EMOJI_RE` matches codepoints that render as color by default. The
// "Misc Symbols" (U+2600-26FF) and "Dingbats" (U+2700-27BF) blocks are
// NOT in here — they contain typographic characters like ✓ ✗ ✤ ★ that
// the user may legitimately want. We force those to render text-style
// via the U+FE0E variation selector below instead of removing them.
//
// U+FE0F (EMOJI VARIATION SELECTOR) is stripped — it forces emoji-style
// rendering of borderline characters, which is the opposite of what we
// want for print. U+FE0E (TEXT VARIATION SELECTOR) is kept.
//
// Notably absent: U+200D (ZWJ). It's used as both an emoji joiner and a
// legitimate Thai/Indic shaping control. Stripping it could break Thai
// text rendering; we accept the trade-off that any orphan ZWJ left over
// after stripping surrounding emojis is harmless.
const VS_TEXT = String.fromCharCode(0xfe0e);  // U+FE0E TEXT VARIATION SELECTOR
const VS_EMOJI = String.fromCharCode(0xfe0f); // U+FE0F EMOJI VARIATION SELECTOR

// High-plane emoji codepoints — these are unambiguously color emoji and
// always get stripped. U+FE0F is included so we strip any lingering
// "force-emoji" variation selectors too.
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{1F000}-\u{1F0FF}\u{FE0F}]/gu;

// Per-codepoint replacements for codepoints that DO have legitimate
// typography use but render as color emoji by default in modern fonts.
// We replace with a B/W-safe equivalent (preferring classical Unicode
// chars that have no color emoji variant), or with inline SVG for
// ornaments, or with empty string for purely decorative emojis.
//
// Map entries should be UPDATED, not stripped — these chars are real
// content the user wrote; we just normalize them to a print-safe form.
const SAFE_REPLACEMENTS = {
  // Stars — ⭐ has emoji presentation; ★ U+2605 is the classical B/W star
  // that all text fonts ship and has no color emoji variant.
  '⭐': '★',                // ⭐ → ★
  '⭑': '☆',                // White Medium Small Star → ☆
  // Check marks — ✓ U+2713 is the classical text-style check.
  '✅': '✓' + VS_TEXT,      // ✅ → ✓ (forced text-style)
  '❌': '✗' + VS_TEXT,      // ❌ → ✗
  '❎': '✗' + VS_TEXT,      // ❎ → ✗
  // Warning — keep the codepoint but force text-style. Most book fonts
  // have a B/W glyph for U+26A0; if the user's font doesn't, they'll see
  // a tofu and can swap the char manually.
  '⚠': '⚠' + VS_TEXT,      // ⚠ → ⚠︎
  // Lightning bolt — same approach.
  '⚡': '⚡' + VS_TEXT,      // ⚡ → ⚡︎
  // Endmark — replace with the inline SVG ornament. Old files that
  // contain literal ✤ from before the SVG endmark feature get auto-
  // migrated this way without any visual change in the printed book.
  // DEFAULT_ENDMARK_SVG is defined earlier in this file.
  // Purely decorative — strip outright. User can re-add as text/SVG if
  // they actually need the visual.
  '⌨': '',  // ⌨
  '⏰': '',  // ⏰
  '⏱': '',  // ⏱
  '⏲': '',  // ⏲
  '⏳': '',  // ⏳
  '✨': '',  // ✨
};

// Misc Technical (U+2300-23FF) — contains keyboard/clock/etc. emoji
// Misc Symbols (U+2600-26FF) — has ✤'s neighbors ⚠ ⚡ etc.
// Dingbats (U+2700-27BF) — has ✓ ✗ ✤
// Misc Symbols & Arrows (U+2B00-2BFF) — has ⭐ ★ ☆
//
// Anything in these ranges that *isn't* in SAFE_REPLACEMENTS gets a
// U+FE0E variation selector appended — best effort to force text-style
// rendering on systems whose default font has a color glyph.
const TYPOGRAPHIC_SYMBOLS_RE =
  /([\u{2300}-\u{23FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}])(?![\u{FE0E}\u{FE0F}])/gu;

// What we surface in the pre-save warning. Includes the high-plane
// emojis AND the borderline codepoints — so the user knows what's about
// to be transformed even when the transform is "replace" not "strip".
const FIND_EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{1F000}-\u{1F0FF}\u{2300}-\u{23FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

function applySafeReplacements(html) {
  // Inject the endmark SVG mapping at call time — DEFAULT_ENDMARK_SVG is
  // defined earlier in this file but referencing it in the static map
  // literal at the top would order-of-eval risk. Cheap to spread here.
  const replacements = {
    ...SAFE_REPLACEMENTS,
    '✤': DEFAULT_ENDMARK_SVG, // ✤ → SVG ornament (matches new endmarks)
  };
  let out = html;
  for (const [ch, rep] of Object.entries(replacements)) {
    // `String.split(ch).join(rep)` is the no-regex idiomatic way to do
    // a global literal replace — faster than building a per-char regex
    // and cleaner than escaping special chars in ch (none of ours are
    // regex metachars but future entries might be).
    if (out.indexOf(ch) !== -1) out = out.split(ch).join(rep);
  }
  return out;
}

function stripEmojis(html) {
  // Order: replacements → strip remaining high-plane emoji
  return applySafeReplacements(html).replace(EMOJI_RE, '');
}

function forceTextStyle(html) {
  return html.replace(TYPOGRAPHIC_SYMBOLS_RE, '$1' + VS_TEXT);
}

function findEmojisIn(html) {
  const matches = html.match(FIND_EMOJI_RE);
  if (!matches) return [];
  // Variation selectors alone aren't meaningful — don't show them.
  return matches.filter((c) => c !== VS_EMOJI && c !== VS_TEXT);
}

function buildFullHtml(content) {
  let lang = 'th';
  try {
    const iframeRoot = getDoc() && getDoc().documentElement;
    if (iframeRoot && iframeRoot.getAttribute('lang')) lang = iframeRoot.getAttribute('lang');
  } catch (e) { /* iframe not ready */ }

  // Sanitize <head> too — emoji in <title>, <meta name="description">,
  // etc. would otherwise survive in the saved file and cause the same
  // Apple-Color-Emoji font fallback during PDF conversion. We use the
  // same passes as for body content for consistency.
  const safeHead = forceTextStyle(stripEmojis(originalHeadHtml));

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
${safeHead}</head>
<body>
${content}
</body>
</html>`;
}

function buildSaveContent() {
  const doc = getDoc();
  const cloneBody = doc.body.cloneNode(true);
  const images = cloneBody.querySelectorAll('img[data-original-src]');
  images.forEach(img => {
    img.setAttribute('src', img.getAttribute('data-original-src'));
    img.removeAttribute('data-original-src');
  });
  // strip contenteditable=false ที่ใส่บน <del> ตอน track changes — เป็น attribute สำหรับ editor เท่านั้น
  cloneBody.querySelectorAll('del[contenteditable]').forEach(d => d.removeAttribute('contenteditable'));

  // P2-S81: strip transient UI-only classes so annotate mode / selection
  // never leak into the saved file. Without this, saving while annotate
  // mode is on persisted `.annotating`, whose `pointer-events:auto`
  // overlay then blocked image editing on the next open.
  cloneBody.querySelectorAll('.img-frame.annotating')
    .forEach(f => f.classList.remove('annotating'));
  cloneBody.querySelectorAll('.img-marker.selected, .img-marker.dragging')
    .forEach(m => m.classList.remove('selected', 'dragging'));
  cloneBody.querySelectorAll('.img-selected, .img-editing')
    .forEach(el => el.classList.remove('img-selected', 'img-editing'));
  // drop the stale per-frame counter attr (now a global session counter)
  cloneBody.querySelectorAll('.img-frame[data-next-n]')
    .forEach(f => f.removeAttribute('data-next-n'));
  // (keep contenteditable="false" on .img-frame — it's part of the
  //  marker structure, not a transient state.)

  let content = cloneBody.innerHTML;
  content = content.replace(/<b\b[^>]*>/gi, '<strong>').replace(/<\/b>/gi, '</strong>');
  content = content.replace(/​/g, ''); // strip zero-width space ที่อาจตกค้างจากการพิมพ์ใน track mode

  // Print-safety pass — order matters:
  //   1. strip emoji codepoints (catches anything the user pasted in)
  //   2. force text-style on remaining typographic symbols
  // Pre-save warning (saveProject/saveProjectAs) gives the user a heads-up
  // before this destructive transform runs.
  content = stripEmojis(content);
  content = forceTextStyle(content);

  return buildFullHtml(content);
}

// Pre-save check — if the user has emojis in the document, warn them
// once so they understand the saved HTML won't match the editor view.
// Returns true if the user confirms (or there's nothing to warn about).
function confirmPrintSafeSave() {
  const docBody = getDoc().body;
  if (!docBody) return true;
  const emojis = findEmojisIn(docBody.innerHTML);
  if (emojis.length === 0) return true;
  const sample = [...new Set(emojis)].slice(0, 12).join(' ');
  const more = emojis.length > 12 ? ` (+ ${emojis.length - 12} อื่น)` : '';
  return window.confirm(
    `พบ emoji ${emojis.length} จุดในเอกสาร: ${sample}${more}\n\n` +
      'จะถูกลบในไฟล์ที่บันทึก เพื่อให้ output เหมาะกับงาน print\n' +
      '(หน้าจอแก้ไขจะไม่กระทบ)\n\n' +
      'ดำเนินการต่อ?',
  );
}

async function saveProject() {
  if (!htmlFileHandle) {
    showToast('ยังไม่มีการเปิดโปรเจกต์');
    return;
  }

  if (!(await ensureWritePermission(htmlFileHandle))) {
    showToast('ไม่ได้รับสิทธิ์เขียนไฟล์ HTML — กดอนุญาตเมื่อเบราว์เซอร์ถาม');
    return;
  }

  if (!confirmPrintSafeSave()) return;

  const fullHtml = buildSaveContent();

  try {
    const writable = await htmlFileHandle.createWritable();
    await writable.write(fullHtml);
    await writable.close();

    setDirty(false);
    showToast('บันทึกทับไฟล์เดิมสำเร็จ ✓');
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ (ตรวจสอบสิทธิ์การเขียนไฟล์)');
  }
}

async function saveProjectAs() {
  if (!htmlFileHandle && !getDoc().body) {
    showToast('ยังไม่มีเนื้อหาให้บันทึก');
    return;
  }

  if (!confirmPrintSafeSave()) return;

  let newHandle;
  try {
    newHandle = await window.showSaveFilePicker({
      suggestedName: fileName || 'book.html',
      types: [{
        description: 'HTML file',
        accept: { 'text/html': ['.html', '.htm'] }
      }]
    });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      showToast('เปิดหน้าต่างบันทึกไม่สำเร็จ');
    }
    return;
  }

  const fullHtml = buildSaveContent();

  try {
    const writable = await newHandle.createWritable();
    await writable.write(fullHtml);
    await writable.close();

    htmlFileHandle = newHandle;
    fileName = newHandle.name;
    cleanTitle = fileName;
    setDirty(false);

    if (fullHtml.includes('./images/')) {
      showToast('บันทึกเป็นไฟล์ใหม่แล้ว ✓ — อย่าลืมคัดลอกโฟลเดอร์ images ไปด้วยถ้าย้ายที่');
    } else {
      showToast('บันทึกเป็นไฟล์ใหม่แล้ว ✓');
    }
  } catch (err) {
    console.error(err);
    showToast('บันทึกไม่สำเร็จ (ตรวจสอบสิทธิ์การเขียนไฟล์)');
  }
}

// ==============================================
// UTILITIES
// ==============================================

function updateStatus() {
  const doc = getDoc();
  if (!doc.body) return;
  const text = doc.body.innerText || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  document.getElementById('statusInfo').textContent =
    `${words.toLocaleString()} คำ · ${chars.toLocaleString()} ตัวอักษร`;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ==============================================
// EVENT LISTENERS
// ==============================================

const MODAL_CLOSERS = {
  linkModal: closeLinkModal,
  imageModal: closeImageModal,
  endMarkModal: closeEndMarkModal,
  listSettingModal: closeListSettingModal,
  closeConfirmModal: cancelCloseProject,
  userSetupModal: closeUserSetup,
};

function closeTopMostModal() {
  const ids = Object.keys(MODAL_CLOSERS);
  for (let i = ids.length - 1; i >= 0; i--) {
    const el = document.getElementById(ids[i]);
    if (el && el.classList.contains('show')) {
      MODAL_CLOSERS[ids[i]]();
      return true;
    }
  }
  return false;
}

function getOpenModalOverlay() {
  for (const id of Object.keys(MODAL_CLOSERS)) {
    const el = document.getElementById(id);
    if (el && el.classList.contains('show')) return el;
  }
  return null;
}

function getFocusableEls(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null || el === document.activeElement);
}

let lastFocusedBeforeModal = null;

function setupModalFocusManagement() {
  Object.keys(MODAL_CLOSERS).forEach(id => {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    let wasOpen = overlay.classList.contains('show');

    new MutationObserver(() => {
      const isOpen = overlay.classList.contains('show');
      if (isOpen === wasOpen) return;
      wasOpen = isOpen;
      if (isOpen) {
        const active = document.activeElement;
        if (active && active !== document.body && !overlay.contains(active)) {
          lastFocusedBeforeModal = active;
        }
        const focusable = getFocusableEls(overlay.querySelector('.modal'));
        const focusTarget = overlay.querySelector('input:not([readonly]):not([type="hidden"]), textarea:not([readonly])')
          || focusable[0];
        if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
      } else {
        if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
          try { lastFocusedBeforeModal.focus(); } catch (e) { /* element gone */ }
        }
        lastFocusedBeforeModal = null;
      }
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  });
}

function syncAriaLabels() {
  document.querySelectorAll('.tb-btn[data-tip]').forEach(btn => {
    const tip = btn.getAttribute('data-tip');
    if (tip && !btn.getAttribute('aria-label')) btn.setAttribute('aria-label', tip);
  });
  document.querySelectorAll('button svg, .quick-insert-btn svg, .tb-btn svg').forEach(svg => {
    if (!svg.hasAttribute('aria-hidden')) svg.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('.toolbar').forEach(tb => {
    if (!tb.hasAttribute('role')) tb.setAttribute('role', 'toolbar');
    if (!tb.hasAttribute('aria-label')) tb.setAttribute('aria-label', 'แถบเครื่องมือจัดรูปแบบ');
  });
  document.querySelectorAll('.modal').forEach((modal, i) => {
    if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
    if (!modal.hasAttribute('aria-modal')) modal.setAttribute('aria-modal', 'true');
    const heading = modal.querySelector('h3');
    if (heading && !modal.hasAttribute('aria-labelledby')) {
      if (!heading.id) heading.id = `modal-heading-${i}`;
      modal.setAttribute('aria-labelledby', heading.id);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  syncAriaLabels();
  setupModalFocusManagement();

  // Track Changes — load user จาก auth (Firebase) หรือ fallback mock
  loadUserFromAuth().then(u => {
    currentUser = u;
    persistCurrentUser(currentUser); // เก็บ localStorage เผื่อ session ต่อไป
    updateUserBadge();
    syncTrackingUI();
  });

  document.getElementById('userSetupModal').addEventListener('click', function (e) {
    if (e.target === this) closeUserSetup();
  });

  document.getElementById('linkUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') insertLink();
    if (e.key === 'Escape') closeLinkModal();
  });
  document.getElementById('imgUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') insertImage();
    if (e.key === 'Escape') closeImageModal();
  });

  document.getElementById('linkModal').addEventListener('click', function (e) {
    if (e.target === this) closeLinkModal();
  });
  document.getElementById('imageModal').addEventListener('click', function (e) {
    if (e.target === this) closeImageModal();
  });
  document.getElementById('endMarkModal').addEventListener('click', function (e) {
    if (e.target === this) closeEndMarkModal();
  });
  document.getElementById('listSettingModal').addEventListener('click', function (e) {
    if (e.target === this) closeListSettingModal();
  });
  document.getElementById('closeConfirmModal').addEventListener('click', function (e) {
    if (e.target === this) cancelCloseProject();
  });

  document.getElementById('imgUrl').addEventListener('input', async function () {
    await updateImagePreviewFromUrl(this.value.trim());
  });

  window.addEventListener('beforeunload', (e) => {
    if (isDirty) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeTopMostModal()) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Tab') {
      const overlay = getOpenModalOverlay();
      if (!overlay) return;
      const focusable = getFocusableEls(overlay.querySelector('.modal'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !overlay.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.getElementById('uploadOverlay').classList.remove('hidden');
});