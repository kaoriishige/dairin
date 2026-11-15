/**
 * 画面表示用テキストから、ElevenLabs 日本語音声合成に適した読み上げ用テキストを生成する。
 * URL・記号・過剰なカッコ書きを除去し、車種名や専門用語の読みを安定させる。
 */

const PRONUNCIATION_MAP: Array<[RegExp, string]> = [
  [/オートギャラリーダイリン/g, 'オートギャラリー・ダイリン'],
  [/株式会社ジェイ・ピー/g, '株式会社ジェイピー'],
  [/ジェイ・ピー/g, 'ジェイピー'],
  [/ワゴンR/gi, 'ワゴンアール'],
  [/ムーヴ\s*キャンバス/g, 'ムーブキャンバス'],
  [/ヤリス\s*クロス/g, 'ヤリスクロス'],
  [/アルト\s*ラパン/g, 'アルトラパン'],
  [/鈑金/g, '板金'],
  [/支払総額/g, 'お支払い総額'],
  [/(\d+)万円/g, '$1まんえん'],
  [/(\d{1,3}),(\d{3})円/g, '$1$2円'],
  [/軽自動車/g, 'けいじどうしゃ'],
];

export function normalizeTextForSpeech(rawText: string): string {
  let text = rawText;

  // URLを削除
  text = text.replace(/https?:\/\/[^\s]+/g, '');
  // Markdownの装飾記号を削除
  text = text.replace(/[*_`#>|]/g, '');
  // 箇条書き記号を句点や読点に置換
  text = text.replace(/^[\s・\-•]+/gm, '');
  // 括弧内の補足は読みやすくする
  text = text.replace(/[（(]([^）)]+)[）)]/g, '、$1、');

  for (const [pattern, replacement] of PRONUNCIATION_MAP) {
    text = text.replace(pattern, replacement);
  }

  // 連続空白・改行を整理
  text = text
    .replace(/\r?\n+/g, '。')
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

/**
 * 長文を自然な日本語の文単位に分割し、ストリーミング順次再生しやすくする。
 */
export function splitIntoSpeechChunks(speechText: string, maxChunkLength = 85): string[] {
  const normalized = speechText.trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[。！？!?])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    if (!buffer) {
      buffer = sentence;
      continue;
    }
    if (buffer.length + sentence.length <= maxChunkLength) {
      buffer += sentence;
    } else {
      chunks.push(buffer);
      buffer = sentence;
    }
  }
  if (buffer) chunks.push(buffer);

  return chunks;
}
