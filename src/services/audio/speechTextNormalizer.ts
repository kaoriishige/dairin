/**
 * 画面表示用テキストから、ElevenLabs 日本語音声合成で読み間違いが起きない
 * 読み上げ専用テキストを生成する。
 * 特に誤読されやすい漢字・自動車専門用語・地名・数字・助数詞・英略語を
 * 正確な「ひらがな・カタカナ」表記へ変換する。
 */

function numberToJapaneseReading(num: number): string {
  if (num === 0) return 'ゼロ';
  if (!Number.isFinite(num) || num < 0) return String(num);

  const units = ['', 'まん', 'おく'];
  const smallUnits = ['', 'じゅう', 'ひゃく', 'せん'];
  const digits = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];

  function convertChunk(n: number): string {
    let res = '';
    const d3 = Math.floor(n / 1000) % 10;
    const d2 = Math.floor(n / 100) % 10;
    const d1 = Math.floor(n / 10) % 10;
    const d0 = n % 10;

    if (d3 > 0) {
      if (d3 === 1) res += 'せん';
      else if (d3 === 3) res += 'さんぜん';
      else if (d3 === 8) res += 'はっせん';
      else res += digits[d3] + smallUnits[3];
    }
    if (d2 > 0) {
      if (d2 === 1) res += 'ひゃく';
      else if (d2 === 3) res += 'さんびゃく';
      else if (d2 === 6) res += 'ろっぴゃく';
      else if (d2 === 8) res += 'はっぴゃく';
      else res += digits[d2] + smallUnits[2];
    }
    if (d1 > 0) {
      if (d1 === 1) res += 'じゅう';
      else res += digits[d1] + smallUnits[1];
    }
    if (d0 > 0) {
      res += digits[d0];
    }
    return res;
  }

  let remaining = Math.floor(num);
  let unitIdx = 0;
  let result = '';

  while (remaining > 0 && unitIdx < units.length) {
    const chunk = remaining % 10000;
    if (chunk > 0) {
      const chunkStr = convertChunk(chunk);
      result = chunkStr + units[unitIdx] + result;
    }
    remaining = Math.floor(remaining / 10000);
    unitIdx++;
  }

  return result || String(num);
}

const PRONUNCIATION_MAP: Array<[RegExp, string]> = [
  // 社名・店舗名・地名
  [/オートギャラリー・?ダイリン/g, 'オートギャラリー・ダイリン'],
  [/株式会社ジェイ・?ピー/g, 'かぶしきがいしゃジェイピー'],
  [/ジェイ・?ピー/g, 'ジェイピー'],
  [/那須塩原市新南/g, 'なすしおばらし、しんみなみ'],
  [/那須塩原市/g, 'なすしおばらし'],
  [/西那須野店/g, 'にしなすのてん'],
  [/西那須野/g, 'にしなすの'],
  [/栃木県/g, 'とちぎけん'],
  [/相田\s*日出男/g, 'あいだ ひでお'],
  [/163-115/g, 'ひゃくろくじゅうさんのひゃくじゅうご'],
  [/0287-36-6011/g, 'ぜろにはちなな、さんろくの、ろくぜろいちいち'],
  [/329-2704/g, 'さんにきゅうの、にななぜろよん'],

  // 車種名・メーカー名・グレード記号
  [/ワゴンR/gi, 'ワゴンアール'],
  [/ムーヴ\s*キャンバス/g, 'ムーブキャンバス'],
  [/ストライブス\s*G/gi, 'ストライプスジー'],
  [/ストライプス\s*G/gi, 'ストライプスジー'],
  [/ヤリス\s*クロス/g, 'ヤリスクロス'],
  [/アルト\s*ラパン/g, 'アルトラパン'],
  [/スペーシア\s*カスタム/g, 'スペーシアカスタム'],
  [/スペーシア\s*ベース/g, 'スペーシアベース'],
  [/全方位モニター/g, 'ぜんほういモニター'],
  [/XF\s*2WD/gi, 'エックスエフ、にダブリューディー'],
  [/HV\s*Z\s*2WD/gi, 'ハイブリッドゼット、にダブリューディー'],
  [/HV\s*Z\s*２WD/gi, 'ハイブリッドゼット、にダブリューディー'],
  [/HV\s*X/gi, 'ハイブリッドエックス'],
  [/\b2WD\b/gi, 'にダブリューディー'],
  [/２WD/gi, 'にダブリューディー'],
  [/\b4WD\b/gi, 'よんダブリューディー'],
  [/\bHV\b/g, 'ハイブリッド'],
  [/\bSUV\b/gi, 'エスユーブイ'],
  [/\bETC\b/gi, 'イーティーシー'],
  [/\bLINE\b/gi, 'ライン'],
  [/\bWEB\b/gi, 'ウェブ'],
  [/AI営業/gi, 'エーアイえいぎょう'],
  [/AI/g, 'エーアイ'],

  // よく誤読される自動車・営業漢字用語
  [/営業時間/g, 'えいぎょうじかん'],
  [/営業/g, 'えいぎょう'],
  [/今日/g, 'きょう'],
  [/お探し/g, 'おさがし'],
  [/軽自動車/g, 'けいじどうしゃ'],
  [/普通乗用車/g, 'ふつうじょうようしゃ'],
  [/小型乗用車/g, 'こがたじょうようしゃ'],
  [/普通車/g, 'ふつうしゃ'],
  [/未使用車/g, 'みしようしゃ'],
  [/中古車/g, 'ちゅうこしゃ'],
  [/新車/g, 'しんしゃ'],
  [/実車/g, 'じっしゃ'],
  [/代車/g, 'だいしゃ'],
  [/お車/g, 'おくるま'],
  [/車内/g, 'しゃない'],
  [/車体/g, 'しゃたい'],
  [/車両/g, 'しゃりょう'],
  [/車種/g, 'しゃしゅ'],
  [/車検/g, 'しゃけん'],
  [/法定点検/g, 'ほうていてんけん'],
  [/定期点検/g, 'ていきてんけん'],
  [/点検/g, 'てんけん'],
  [/整備士/g, 'せいびし'],
  [/整備/g, 'せいび'],
  [/鈑金/g, 'ばんきん'],
  [/板金/g, 'ばんきん'],
  [/塗装/g, 'とそう'],
  [/修復歴/g, 'しゅうふくれき'],
  [/支払総額/g, 'おしはらいそうがく'],
  [/お支払い総額/g, 'おしはらいそうがく'],
  [/本体価格/g, 'ほんたいかかく'],
  [/諸費用/g, 'しょひよう'],
  [/自賠責保険料/g, 'じばいせきほけんりょう'],
  [/自賠責保険/g, 'じばいせきほけん'],
  [/自賠責/g, 'じばいせき'],
  [/重量税/g, 'じゅうりょうぜい'],
  [/印紙代/g, 'いんしだい'],
  [/高価買取/g, 'こうかかいとり'],
  [/買取/g, 'かいとり'],
  [/買い取り/g, 'かいとり'],
  [/下取り/g, 'したどり'],
  [/無料査定/g, 'むりょうさてい'],
  [/査定額/g, 'さていがく'],
  [/査定/g, 'さてい'],
  [/お見積り/g, 'おみつもり'],
  [/お見積もり/g, 'おみつもり'],
  [/見積り/g, 'みつもり'],
  [/見積もり/g, 'みつもり'],
  [/走行距離/g, 'そうこうきょり'],
  [/走行/g, 'そうこう'],
  [/はこうりょう/g, 'そうこうきょり'],
  [/年式/g, 'ねんしき'],
  [/初年度登録/g, 'しょねんどとうろく'],
  [/乗車人数/g, 'じょうしゃにんずう'],
  [/営業時間/g, 'えいぎょうじかん'],
  [/定休日/g, 'ていきゅうび'],
  [/水・木曜/g, 'すいようびと、もくようび'],
  [/最終週/g, 'さいしゅうしゅう'],
  [/現在庫/g, 'げんざいこ'],
  [/在庫状況/g, 'ざいこじょうきょう'],
  [/在庫/g, 'ざいこ'],
  [/店舗/g, 'てんぽ'],
  [/店頭/g, 'てんとう'],
  [/ご来店/g, 'ごらいてん'],
  [/来店/g, 'らいてん'],
  [/試乗/g, 'しじょう'],
  [/承ります/g, 'うけたまわります'],
  [/承っております/g, 'うけたまわっております'],
  [/行っております/g, 'おこなっております'],
  [/行っています/g, 'おこなっています'],
  [/行います/g, 'おこないます'],
  [/1日/g, 'いちにち'],
  [/一日/g, 'いちにち'],
  [/1台/g, 'いちだい'],
  [/一台/g, 'いちだい'],
  [/2人/g, 'ふたり'],
  [/二人/g, 'ふたり'],
  [/1人/g, 'ひとり'],
  [/一人/g, 'ひとり'],
  [/6ヶ月/g, 'ろっかげつ'],
  [/6か月/g, 'ろっかげつ'],
  [/24ヶ月/g, 'にじゅうよんかげつ'],
  [/12ヶ月/g, 'じゅうにかげつ'],
  [/月々/g, 'つきづき'],
  [/毎月/g, 'まいつき'],
  [/定額/g, 'ていがく'],
];

export function normalizeTextForSpeech(rawText: string): string {
  let text = rawText;

  // URLを削除
  text = text.replace(/https?:\/\/[^\s]+/g, '');
  // Markdownの装飾記号を削除
  text = text.replace(/[*_`#>|]/g, '');
  // 箇条書き記号を除去
  text = text.replace(/^[\s・\-•]+/gm, '');
  // 郵便番号記号
  text = text.replace(/〒/g, 'ゆうびんばんごう、');
  // 括弧内の補足は読点で自然に区切る
  text = text.replace(/[（(]([^）)]+)[）)]/g, '、$1、');
  // 波線（〜 / ～）を「から」に変換
  text = text.replace(/(\d+)\s*[〜～~]\s*(\d+)/g, '$1から$2');

  // 桁区切りカンマ付き数字を統合（例: 49,360 -> 49360）
  text = text.replace(/(\d{1,3}),(\d{3})/g, '$1$2');

  // 小数付き万円（例: 82.5万円 -> はちじゅうにまんごせんえん、1.1万円 -> いちまんいっせんえん）
  text = text.replace(/(\d+)\.(\d+)\s*万円/g, (_, intPart, decPart) => {
    const yen = Math.round(parseFloat(`${intPart}.${decPart}`) * 10000);
    return `${numberToJapaneseReading(yen)}えん`;
  });

  // 整数万円（例: 121万円 -> ひゃくにじゅういちまんえん）
  text = text.replace(/(\d+)\s*万円/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `${numberToJapaneseReading(n)}まんえん`;
  });

  // 円（例: 49360円 -> よんまんきゅうせんさんびゃくろくじゅうえん）
  text = text.replace(/[¥￥]?\s*(\d+)\s*円/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `${numberToJapaneseReading(n)}えん`;
  });
  text = text.replace(/[¥￥](\d+)/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `${numberToJapaneseReading(n)}えん`;
  });

  // 年式（例: 2018年 -> にせんじゅうはちねん）
  text = text.replace(/(\d{4})\s*年/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `${numberToJapaneseReading(n)}ねん`;
  });

  // 走行距離 km（例: 44000km -> よんまんよんせんキロ）
  text = text.replace(/(\d+)\s*km/gi, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `${numberToJapaneseReading(n)}キロ`;
  });

  // 排気量 cc
  text = text.replace(/(\d+)\s*cc/gi, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `${numberToJapaneseReading(n)}シーシー`;
  });

  // 時刻（例: 9:00 -> くじ、10:00 -> じゅうじ、18:00 -> じゅうはちじ）
  text = text.replace(/(\d{1,2}):00/g, (_, hStr) => {
    const h = parseInt(hStr, 10);
    if (h === 4) return 'よじ';
    if (h === 7) return 'しちじ';
    if (h === 9) return 'くじ';
    return `${numberToJapaneseReading(h)}じ`;
  });

  // 項目数・分・本・台・店舗
  text = text.replace(/(\d+)\s*項目/g, (_, n) => `${numberToJapaneseReading(parseInt(n, 10))}こうもく`);
  text = text.replace(/(\d+)\s*分/g, (_, n) => `${numberToJapaneseReading(parseInt(n, 10))}ぷん`);
  text = text.replace(/(\d+)\s*本/g, (_, n) => `${numberToJapaneseReading(parseInt(n, 10))}ほん`);
  text = text.replace(/(\d+)\s*台/g, (_, n) => `${numberToJapaneseReading(parseInt(n, 10))}だい`);
  text = text.replace(/(\d+)\s*店舗/g, (_, n) => `${numberToJapaneseReading(parseInt(n, 10))}てんぽ`);

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
export function splitIntoSpeechChunks(speechText: string, maxChunkLength = 95): string[] {
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
