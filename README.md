# ⚡ SkillBrowse

Z.ai GLM-5 API を使ったスキル対応Chrome拡張機能。ページの要約・分析・フォーム入力などをAIが自動化します。

## ディレクトリ構成

```
SkillBrowse/
├── manifest.json
├── background/
│   ├── service-worker.js   # メインのバックグラウンド処理
│   ├── zai-client.js       # Z.ai GLM API クライアント
│   └── skill-manager.js    # スキルの読み込み・管理
├── sidepanel/
│   ├── index.html          # サイドパネルUI
│   └── sidepanel.js        # UIロジック
├── content/
│   └── content.js          # ページDOM操作
└── skills/
    ├── index.json           # スキル一覧
    ├── default/SKILL.md
    ├── summarizer/SKILL.md
    ├── form-filler/SKILL.md
    └── page-analyst/SKILL.md
```

## スキルの追加方法

`skills/` フォルダに新しいディレクトリを作り、`SKILL.md` を配置するだけです。

```
skills/
└── my-skill/
    └── SKILL.md
```

SKILL.md のフォーマット：

```markdown
## スキル名
my-skill

## トリガー
キーワード1、キーワード2

## システムプロンプト
このスキルで使うシステムプロンプトの内容

## ツール定義
[
  {
    "name": "tool_name",
    "description": "ツールの説明",
    "parameters": { ... }
  }
]

## 出力フォーマット
出力の形式・ルール
```

その後 `skills/index.json` にエントリを追加してください。

## Chromeへのインストール手順

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このフォルダ（SkillBrowse）を選択する

## 初回設定

1. 拡張機能のアイコンをクリック → サイドパネルが開く
2. ⚙️ 設定アイコンをクリック
3. Z.ai API キーを入力して「保存」

## 使い方

- サイドパネル上部のスキルチップで使いたいスキルを選択（任意）
- 「📄 ページ」ボタンで現在のページ情報をコンテキストに含めるか切り替え
- テキストを入力して Enter または ➤ ボタンで送信
