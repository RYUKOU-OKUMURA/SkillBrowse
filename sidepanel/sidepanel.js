// SkillBrowse - Sidepanel UI Logic

const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const skillBarEl = document.getElementById('skill-bar');
const contextToggle = document.getElementById('context-toggle');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const clearBtn = document.getElementById('clear-btn');
const apiKeyInput = document.getElementById('api-key-input');
const saveSettingsBtn = document.getElementById('save-settings');
const shortcutSelect = document.getElementById('shortcut-select');
const slashMenu = document.getElementById('slash-menu');

let messages = [];
let activeSkill = null;
let includePageContext = true;
let allSkills = [];
let slashMenuIndex = 0;

// 送信ショートカット: 'shift+enter' | 'cmd+enter'
let sendShortcut = 'shift+enter';

// ---- 初期化 ----
(async () => {
  await loadSettings();
  await loadSkills();
  await loadApiKey();
})();

async function loadSettings() {
  const result = await chrome.storage.local.get(['send_shortcut']);
  if (result.send_shortcut) {
    sendShortcut = result.send_shortcut;
  }
  shortcutSelect.value = sendShortcut;
  updateSendBtnTitle();
}

async function loadSkills() {
  allSkills = await sendToBackground({ type: 'GET_SKILLS' });
  allSkills.forEach((skill) => {
    const chip = document.createElement('button');
    chip.className = 'skill-chip';
    chip.textContent = skill.label;
    chip.dataset.name = skill.name;
    chip.addEventListener('click', () => selectSkill(skill, chip));
    skillBarEl.appendChild(chip);
  });
}

function selectSkill(skill, el) {
  document.querySelectorAll('.skill-chip').forEach((c) => c.classList.remove('active'));
  if (activeSkill?.name === skill.name) {
    activeSkill = null;
  } else {
    activeSkill = skill;
    el?.classList.add('active');
  }
}

function activateSkillByName(name) {
  const skill = allSkills.find((s) => s.name === name);
  if (!skill) return;
  const chip = skillBarEl.querySelector(`[data-name="${name}"]`);
  selectSkill(skill, chip);
}

async function loadApiKey() {
  const result = await chrome.storage.local.get('zai_api_key');
  if (result.zai_api_key) {
    apiKeyInput.value = result.zai_api_key;
  } else {
    settingsPanel.classList.add('open');
    addMessage('system', 'まず設定からZ.ai APIキーを入力してください。');
  }
}

// ---- 設定 ----
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

saveSettingsBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (key) await chrome.storage.local.set({ zai_api_key: key });

  sendShortcut = shortcutSelect.value;
  await chrome.storage.local.set({ send_shortcut: sendShortcut });
  updateSendBtnTitle();

  settingsPanel.classList.remove('open');
  addMessage('system', '設定を保存しました。');
});

function updateSendBtnTitle() {
  const label = sendShortcut === 'shift+enter' ? 'Shift+Enter' : '⌘/Ctrl+Enter';
  sendBtn.title = `送信 (${label})`;
}

// ---- コンテキストトグル ----
contextToggle.addEventListener('click', () => {
  includePageContext = !includePageContext;
  contextToggle.classList.toggle('on', includePageContext);
  contextToggle.textContent = includePageContext ? 'page ctx' : 'page off';
});

// ---- クリア ----
clearBtn.addEventListener('click', () => {
  messages = [];
  activeSkill = null;
  document.querySelectorAll('.skill-chip').forEach((c) => c.classList.remove('active'));
  chatEl.innerHTML = '<div class="message system">cleared</div>';
});

// ---- スラッシュコマンド ----
inputEl.addEventListener('input', () => {
  // テキストエリアの高さを自動調整
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';

  handleSlashInput();
});

function handleSlashInput() {
  const val = inputEl.value;

  // 先頭が / で始まる場合のみサジェスト表示
  if (!val.startsWith('/')) {
    hideSlashMenu();
    return;
  }

  const query = val.slice(1).toLowerCase();
  const filtered = allSkills.filter(
    (s) => s.name !== 'default' && (s.name.includes(query) || s.label.includes(query))
  );

  if (filtered.length === 0) {
    hideSlashMenu();
    return;
  }

  renderSlashMenu(filtered);
}

function renderSlashMenu(skills) {
  slashMenu.innerHTML = '';
  slashMenuIndex = 0;

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'slash-menu-header';
  header.textContent = 'skills';
  slashMenu.appendChild(header);

  skills.forEach((skill, i) => {
    const item = document.createElement('div');
    item.className = 'slash-item' + (i === 0 ? ' active' : '');
    item.innerHTML = `<span class="slash-name">/${skill.name}</span><span class="slash-label">${skill.label}</span>`;
    item.dataset.name = skill.name;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // blur防止
      applySlashSkill(skill.name);
    });
    slashMenu.appendChild(item);
  });

  slashMenu.classList.add('open');
}

function hideSlashMenu() {
  slashMenu.classList.remove('open');
  slashMenu.innerHTML = '';
}

function applySlashSkill(name) {
  activateSkillByName(name);
  inputEl.value = '';
  inputEl.style.height = 'auto';
  hideSlashMenu();
  inputEl.focus();
  addMessage('system', `スキル「${allSkills.find(s=>s.name===name)?.label || name}」を選択しました。`);
}

// ---- キーボード操作（スラッシュメニュー + 送信） ----
inputEl.addEventListener('keydown', (e) => {
  // スラッシュメニューが開いている場合はナビゲーション優先
  if (slashMenu.classList.contains('open')) {
    const items = slashMenu.querySelectorAll('.slash-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashMenuIndex = Math.min(slashMenuIndex + 1, items.length - 1);
      updateSlashMenuActive(items);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashMenuIndex = Math.max(slashMenuIndex - 1, 0);
      updateSlashMenuActive(items);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = items[slashMenuIndex];
      if (selected) applySlashSkill(selected.dataset.name);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSlashMenu();
      return;
    }
  }

  // 送信ショートカット判定
  const isSend = checkSendShortcut(e);
  if (isSend) {
    e.preventDefault();
    handleSend();
  }
});

function checkSendShortcut(e) {
  if (sendShortcut === 'shift+enter') {
    return e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey;
  }
  if (sendShortcut === 'cmd+enter') {
    return e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey;
  }
  return false;
}

function updateSlashMenuActive(items) {
  items.forEach((item, i) => {
    item.classList.toggle('active', i === slashMenuIndex);
  });
}

sendBtn.addEventListener('click', handleSend);

// ---- 送信処理（ストリーミング対応） ----
async function handleSend() {
  const text = inputEl.value.trim();
  if (!text) return;

  hideSlashMenu();
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  addMessage('user', text);
  messages.push({ role: 'user', content: text });

  const typing = addTypingIndicator();

  // ページコンテキスト取得
  let pageContext = null;
  if (includePageContext) {
    pageContext = await sendToBackground({ type: 'GET_PAGE_CONTENT' });
  }

  const payload = {
    messages,
    userInput: text,
    skillName: activeSkill?.name || null,
    pageContext: pageContext
      ? `タイトル: ${pageContext.title}\nURL: ${pageContext.url}\n\n${pageContext.text}`
      : null,
  };

  // Service Worker とストリーミングポートを開く
  const port = chrome.runtime.connect({ name: 'skillbrowse-stream' });
  let msgEl = null;
  let fullContent = '';

  port.onMessage.addListener((msg) => {
    if (msg.type === 'CHUNK') {
      // 最初のチャンクが届いたらタイピングインジケーターを消してメッセージ表示開始
      if (!msgEl) {
        typing.remove();
        msgEl = addMessage('assistant', '');
      }
      fullContent += msg.text;
      msgEl.textContent = fullContent;
      chatEl.scrollTop = chatEl.scrollHeight;

    } else if (msg.type === 'DONE') {
      if (!msgEl) {
        // チャンクが来なかった場合（tool callのみ等）
        typing.remove();
        addMessage('assistant', msg.content || '（応答なし）');
      }
      messages.push({ role: 'assistant', content: msg.content || fullContent });
      sendBtn.disabled = false;
      port.disconnect();

    } else if (msg.type === 'ERROR') {
      typing.remove();
      addMessage('system', `error: ${msg.error}`);
      sendBtn.disabled = false;
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    // 予期せず切断された場合の保険
    sendBtn.disabled = false;
  });

  port.postMessage({ type: 'STREAM_CHAT', payload });
}

// ---- UI ヘルパー ----
function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.textContent = text;
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function addTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'message assistant typing';
  el.innerHTML = '<span></span><span></span><span></span>';
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
