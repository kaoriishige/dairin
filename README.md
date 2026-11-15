# オートギャラリーダイリン AIキャラクター・オンライン営業システム（デモ）

株式会社ジェイ・ピー「オートギャラリーダイリン」様向けの、AI女性営業キャラクターによるオンライン接客デモWebアプリケーションです。

## 主な機能

- **AI営業会話（OpenAI API）**：公式ホームページ（https://www.jp-dairin.jp/）から取得した会社情報・サービス情報・掲載車両データをもとに自然な日本語で営業接客を行います。
- **専用女性ボイス音声合成（ElevenLabs TTS Streaming API）**：確定 Voice ID `dp4HJlekKt0HZFHL2jQg` を使用し、サーバー側（Netlify Functions）経由でストリーミング音声を生成・再生します。
- **音声認識（Web Speech API）＆文字チャット**：日本語音声入力と文字入力の両方に対応し、発話中の割り込み停止もサポートします。
- **車両検索＆カード表示**：予算や用途に応じた掲載車両を写真・価格・注意事項付きで表示します。
- **管理画面（`/admin`）**：管理者パスワード認証付きで、会社・車両・サービス情報、公式サイト再取得・差分チェック、要確認情報、営業ノウハウ管理、ElevenLabs接続・無料枠状況を確認できます。

## 必須環境変数（Netlify / `.env`）

APIキーはブラウザへ一切送信せず、Netlify Functions 側のみで使用します。

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=dp4HJlekKt0HZFHL2jQg
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ENABLE_ELEVENLABS_TTS=true
DEMO_ACCESS_PASSCODE=
ADMIN_PASSWORD=...
```

> **商用利用許諾に関する注意**：ElevenLabs 無料プランの商用利用条件を確認し、外部向け公開で許諾条件を満たさない場合は `ENABLE_ELEVENLABS_TTS=false` に設定して音声出力を無効化し、文字チャットモードで運用してください。

## ローカル開発・テスト

```bash
npm install
npm run typecheck
npm test
npm run build
netlify dev
```
