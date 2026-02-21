// Z.ai GLM-5 API Client
// OpenAI互換エンドポイントを使用

const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
const MODEL = 'glm-5';

const MAX_TOOL_ITERATIONS = 5; // Function Callingの最大再帰回数

export class ZAIClient {
  constructor() {
    // 非同期初期化をPromiseとして保持し、chat()呼び出し前に完了を保証する
    this._ready = this._loadApiKey();
  }

  async _loadApiKey() {
    const result = await chrome.storage.local.get('zai_api_key');
    this.apiKey = result.zai_api_key || null;
  }

  async chat({ messages, systemPrompt, tools = [], onToolCall, _iteration = 0 }) {
    // 初期化完了を待ってからAPIキーをチェック
    await this._ready;

    if (!this.apiKey) {
      throw new Error('API key not set. Please configure in settings.');
    }

    const body = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      stream: false,
    };

    // ツールが定義されていればFunction Callingを有効化
    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: t,
      }));
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Z.ai API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    // Tool Callが返ってきた場合は処理して再帰呼び出し
    if (choice.finish_reason === 'tool_calls' && onToolCall) {
      // 無限ループ防止: 上限回数を超えたら強制終了
      if (_iteration >= MAX_TOOL_ITERATIONS) {
        console.warn(`[SkillBrowse] Tool call limit (${MAX_TOOL_ITERATIONS}) reached. Stopping.`);
        return { content: '（ツール呼び出しの上限に達したため処理を中断しました）', usage: data.usage };
      }

      const toolResults = await Promise.all(
        choice.message.tool_calls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments);
          const result = await onToolCall(tc.function.name, args);
          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      // ツール結果を追加して再度呼び出し（イテレーションカウントをインクリメント）
      return this.chat({
        messages: [
          ...messages,
          choice.message,
          ...toolResults,
        ],
        systemPrompt,
        tools,
        onToolCall,
        _iteration: _iteration + 1,
      });
    }

    return {
      content: choice.message.content,
      usage: data.usage,
    };
  }

  async setApiKey(key) {
    this.apiKey = key;
    await chrome.storage.local.set({ zai_api_key: key });
    // _ready を更新して次回 chat() で再チェックされるようにする
    this._ready = Promise.resolve();
  }
}
