// SkillBrowse - Content Script
// ページのDOM操作を担当

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_CONTENT':
      sendResponse(getPageContent());
      break;

    case 'GET_SELECTION':
      sendResponse(window.getSelection()?.toString() || '');
      break;

    case 'CLICK':
      sendResponse(clickElement(message.selector));
      break;

    case 'FILL':
      sendResponse(fillInput(message.selector, message.value));
      break;

    case 'SCROLL':
      window.scrollBy(0, message.amount || 300);
      sendResponse({ ok: true });
      break;
  }
  return true;
});

function getPageContent() {
  return {
    title: document.title,
    url: location.href,
    text: document.body.innerText.slice(0, 8000), // 長すぎるページは先頭8000字
    metaDescription:
      document.querySelector('meta[name="description"]')?.content || '',
  };
}

function clickElement(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: `Element not found: ${selector}` };
  el.click();
  return { ok: true };
}

function fillInput(selector, value) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: `Element not found: ${selector}` };

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeInputValueSetter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}
