// SkillManager - SKILL.md を読み込みスキルを管理する

export class SkillManager {
  constructor() {
    this.cache = {};
  }

  // スキル一覧を返す
  async listSkills() {
    const index = await this._fetchJSON('skills/index.json');
    return index.skills;
  }

  // スキル名を指定してロード
  async loadSkill(skillName) {
    if (this.cache[skillName]) return this.cache[skillName];

    const md = await this._fetchText(`skills/${skillName}/SKILL.md`);
    const skill = this._parseSKILL(md);
    this.cache[skillName] = skill;
    return skill;
  }

  // ユーザー入力からスキルを自動検出してロード
  async detectAndLoad(userInput) {
    const skills = await this.listSkills();
    const input = userInput.toLowerCase();

    for (const skill of skills) {
      const matched = skill.triggers.some((t) => input.includes(t));
      if (matched) {
        return this.loadSkill(skill.name);
      }
    }

    // マッチしなければデフォルトスキルを返す
    return this.loadSkill('default');
  }

  // SKILL.md をパースしてオブジェクトに変換
  _parseSKILL(md) {
    const sections = {};
    let currentSection = null;
    let buffer = [];

    for (const line of md.split('\n')) {
      const heading = line.match(/^##\s+(.+)/);
      if (heading) {
        if (currentSection) sections[currentSection] = buffer.join('\n').trim();
        currentSection = heading[1].trim();
        buffer = [];
      } else {
        buffer.push(line);
      }
    }
    if (currentSection) sections[currentSection] = buffer.join('\n').trim();

    // トリガーをリスト化
    const triggers = (sections['トリガー'] || '')
      .split(/[、,\n]/)
      .map((t) => t.replace(/^[「」"'*-\s]+|[「」"'*-\s]+$/g, '').toLowerCase())
      .filter(Boolean);

    // ツール定義をJSONとしてパース
    let tools = [];
    if (sections['ツール定義']) {
      try {
        tools = JSON.parse(sections['ツール定義']);
      } catch (err) {
        // SKILL.md の JSON フォーマット誤りを開発者が気づけるようにログ出力
        console.error(`[SkillBrowse] ツール定義のJSONパースに失敗しました (スキル: ${sections['スキル名'] || 'unknown'})`, err);
        tools = [];
      }
    }

    return {
      name: sections['スキル名'] || 'unknown',
      systemPrompt: sections['システムプロンプト'] || '',
      triggers,
      tools,
      outputFormat: sections['出力フォーマット'] || '',
    };
  }

  async _fetchJSON(path) {
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url);
    return res.json();
  }

  async _fetchText(path) {
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url);
    return res.text();
  }
}
