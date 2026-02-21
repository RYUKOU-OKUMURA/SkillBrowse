// SkillBrowse - Background Service Worker
// Z.ai GLM-5 API + Skill System

import { SkillManager } from './skill-manager.js';
import { ZAIClient } from './zai-client.js';

const skillManager = new SkillManager();
const zaiClient = new ZAIClient();

// サイドパネルをアクションクリックで開く
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// サイドパネル・コンテンツスクリプトからのメッセージを処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHAT') {
    handleChat(message.payload).then(sendResponse);
    return true; // 非同期レスポンスのため
  }

  if (message.type === 'GET_SKILLS') {
    skillManager.listSkills().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      // chrome:// や about: など content_scripts が動かないページはスキップ
      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
        sendResponse({ title: '', url: tab?.url || '', text: 'このページではコンテンツを取得できません。' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          // content.js が未注入の場合のフォールバック
          sendResponse({ title: '', url: tab.url, text: 'ページコンテンツを取得できませんでした。ページを再読み込みしてみてください。' });
        } else {
          sendResponse(response);
        }
      });
    });
    return true;
  }
});

async function handleChat({ messages, userInput, skillName, pageContext }) {
  // スキル検出（未指定なら自動判定）
  const skill = skillName
    ? await skillManager.loadSkill(skillName)
    : await skillManager.detectAndLoad(userInput);

  // システムプロンプトにスキル内容 + ページコンテキストを注入
  let systemPrompt = skill.systemPrompt;
  if (pageContext) {
    systemPrompt += `\n\n---\n## 現在のページ情報\n${pageContext}`;
  }

  // ツール定義をスキルから取得
  const tools = skill.tools || [];

  // GLM-5 API呼び出し
  const result = await zaiClient.chat({
    messages,
    systemPrompt,
    tools,
    onToolCall: (toolName, args) => handleToolCall(toolName, args),
  });

  return result;
}

async function handleToolCall(toolName, args) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  switch (toolName) {
    case 'get_page_content':
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' }, resolve);
      });

    case 'click_element':
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'CLICK', selector: args.selector }, resolve);
      });

    case 'fill_input':
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'FILL', selector: args.selector, value: args.value }, resolve);
      });

    case 'get_selected_text':
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' }, resolve);
      });

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
