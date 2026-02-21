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

  // ストリーミング版chat。onChunk(text)でトークンを随時返し、onDone(fullText)で完了通知
  async chatStream({ messages, systemPrompt, tools = [], onToolCall, onChunk, onDone, onError, _iteration = 0 }) {
    await this._ready;

    if (!this.apiKey) {
      onError(new Error('API key not set. Please configure in settings.'));
      return;
    }

    const body = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      stream: true,
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({ type: 'function', function: t }));
      body.tool_choice = 'auto';
    }

    let response;
    try {
      response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      onError(err);
      return;
    }

    if (!response.ok) {
      const errText = await response.text();
      onError(new Error(`Z.ai API error: ${response.status} ${errText}`));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let toolCallsMap = {};  // index -> accumulated tool call

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 未完了行はバッファに残す

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          let json;
          try { json = JSON.parse(data); } catch { continue; }

          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // テキストチャンクを通知
          if (delta.content) {
            fullContent += delta.content;
            onChunk(delta.content);
          }

          // tool_callsチャンクを蓄積
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!toolCallsMap[tc.index]) {
                toolCallsMap[tc.index] = { id: '', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCallsMap[tc.index].id = tc.id;
              if (tc.function?.name) toolCallsMap[tc.index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCallsMap[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }
      }
    } catch (err) {
      onError(err);
      return;
    }

    // ツール呼び出しがあれば実行して再帰
    const toolCallsList = Object.values(toolCallsMap);
    if (toolCallsList.length > 0 && onToolCall) {
      if (_iteration >= MAX_TOOL_ITERATIONS) {
        onDone(fullContent || '（ツール呼び出しの上限に達しました）');
        return;
      }

      let toolResults;
      try {
        toolResults = await Promise.all(
          toolCallsList.map(async (tc) => {
            const args = JSON.parse(tc.function.arguments || '{}');
            const result = await onToolCall(tc.function.name, args);
            return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
          })
        );
      } catch (err) {
        onError(err);
        return;
      }

      return this.chatStream({
        messages: [
          ...messages,
          { role: 'assistant', content: fullContent || null, tool_calls: toolCallsList },
          ...toolResults,
        ],
        systemPrompt, tools, onToolCall, onChunk, onDone, onError,
        _iteration: _iteration + 1,
      });
    }

    onDone(fullContent);
  }

  async setApiKey(key) {
    this.apiKey = key;
    await chrome.storage.local.set({ zai_api_key: key });
    // _ready を更新して次回 chat() で再チェックされるようにする
    this._ready = Promise.resolve();
  }
}
