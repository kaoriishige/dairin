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

function kanjiNumberToInt(kanji: string): number | null {
  const digits: Record<string, number> = {
    '〇': 0,
    '零': 0,
    '一': 1,
    '二': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
  };
  const smallUnits: Record<string, number> = { '十': 10, '百': 100, '千': 1000 };
  const largeUnits: Record<string, number> = { '万': 10000, '億': 100000000 };

  if (!/[十百千万億]/.test(kanji)) {
    // 桁並び（例: 二〇一七）
    let numStr = '';
    for (const ch of kanji) {
      if (!(ch in digits)) return null;
      numStr += String(digits[ch]);
    }
    const parsed = parseInt(numStr, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  let total = 0;
  let chunk = 0;
  let current = 0;

  for (const ch of kanji) {
    if (ch in digits) {
      current = current * 10 + digits[ch];
    } else if (ch in smallUnits) {
      chunk += (current || 1) * smallUnits[ch];
      current = 0;
    } else if (ch in largeUnits) {
      chunk += current;
      total += (chunk || 1) * largeUnits[ch];
      chunk = 0;
      current = 0;
    } else {
      return null;
    }
  }

  return total + chunk + current;
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
  [/AI営業/gi, 'エーアイ営業'],
  [/AI/g, 'エーアイ'],

  // 誤読されやすい自動車専門用語・難読漢字・助数詞のみ変換（一般的な漢字熟語は自然なアクセント維持のためそのまま残す）
  [/鈑金/g, 'ばんきん'],
  [/板金/g, 'ばんきん'],
  [/修復歴/g, 'しゅうふくれき'],
  [/お支払い総額/g, 'おしはらいそうがく'],
  [/支払総額/g, 'おしはらいそうがく'],
  [/自賠責保険料/g, 'じばいせきほけんりょう'],
  [/自賠責保険/g, 'じばいせきほけん'],
  [/自賠責/g, 'じばいせき'],
  [/初年度登録/g, 'しょねんどとうろく'],
  [/水・木曜/g, 'すいようびと、もくようび'],
  [/那須/g, 'なす'],
  [/大田原/g, 'おおたわら'],
  [/矢板/g, 'やいた'],
  [/宇都宮/g, 'うつのみや'],
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
];

export function normalizeTextForSpeech(rawText: string): string {
  let text = rawText;

  // 全角英数字・記号の正規化
  text = text.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  text = text.replace(/(\d)．(\d)/g, '$1.$2');
  text = text.replace(/(\d)，(\d)/g, '$1,$2');

  // LLMが生成した漢数字の年式・距離・金額を半角数字へ変換（例: 二千十七年 -> 2017年, 二万九千キロ -> 29000キロ, 八十二万五千円 -> 825000円）
  text = text.replace(/([〇零一二三四五六七八九十百千万億]+)\s*(ねんしき|ねん|年式|年|まんえん|万円|えん|円|キロ|km|だい|台|にん|人|かげつ|ヶ月|か月)/gi, (full, kanjiPart, unitPart) => {
    // 「十分」「万が一」などの一般語誤爆を防止
    if (kanjiPart === '万' || kanjiPart === '十') return full;
    const val = kanjiNumberToInt(kanjiPart);
    if (val === null) return full;
    return `${val}${unitPart}`;
  });
  // 2文字以上の複合漢数字（例: 二千十七、二万九千、八十二万五千）で十・百・千・万を含むもの
  text = text.replace(/[〇零一二三四五六七八九十百千万億]{2,}/g, (kanjiPart) => {
    if (!/[十百千万億]/.test(kanjiPart)) return kanjiPart;
    if (/^(十分|万一|万全|百円|千万|一切|一十)/.test(kanjiPart)) return kanjiPart;
    const val = kanjiNumberToInt(kanjiPart);
    return val !== null ? String(val) : kanjiPart;
  });

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
  text = text.replace(/(\d+(?:\.\d+)?)\s*[〜～~]\s*(\d+(?:\.\d+)?)/g, '$1から$2');

  // 桁区切りカンマ付き数字を統合（例: 49,360 -> 49360, 1,000,000 -> 1000000）
  text = text.replace(/\d{1,3}(?:,\d{3})+/g, (match) => match.replace(/,/g, ''));

  // 小数付き万円（例: 82.5万円 -> 、はちじゅうにまんごせんえん、、1.1万円 -> 、いちまんいっせんえん、）
  text = text.replace(/(\d+)\.(\d+)\s*万円/g, (_, intPart, decPart) => {
    const yen = Math.round(parseFloat(`${intPart}.${decPart}`) * 10000);
    return `、${numberToJapaneseReading(yen)}えん、`;
  });

  // 「〜万〜千円」などの混在表記（例: 82万5千円 / 82万5000円）
  text = text.replace(/(\d+)\s*万\s*(\d+)\s*千円/g, (_, manStr, senStr) => {
    const yen = parseInt(manStr, 10) * 10000 + parseInt(senStr, 10) * 1000;
    return `、${numberToJapaneseReading(yen)}えん、`;
  });

  // 整数万円（例: 121万円 -> 、ひゃくにじゅういちまんえん、）
  text = text.replace(/(\d+)\s*万円/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `、${numberToJapaneseReading(n)}まんえん、`;
  });

  // 「〜万」のみ（例: 100万くらい -> 、ひゃくまん、くらい）
  text = text.replace(/(\d+)\s*万/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `、${numberToJapaneseReading(n)}まん`;
  });

  // 円（例: 49360円 -> 、よんまんきゅうせんさんびゃくろくじゅうえん、）
  text = text.replace(/[¥￥]?\s*(\d+)\s*円/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `、${numberToJapaneseReading(n)}えん、`;
  });
  text = text.replace(/[¥￥](\d+)/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `、${numberToJapaneseReading(n)}えん、`;
  });

  // 走行距離 km / キロ（例: 44000km / 29000キロ -> 、よんまんよんせんキロ、）
  text = text.replace(/(\d+)\s*(?:km|キロ)/gi, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `、${numberToJapaneseReading(n)}キロ、`;
  });

  // 年式（2017年式 / 2017ねんしき -> 、にせんじゅうななねんしき、）
  text = text.replace(/(\d{4})\s*(?:ねんしき|年式)/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `、${numberToJapaneseReading(n)}ねんしき、`;
  });
  text = text.replace(/(\d{4})\s*(?:ねん|年)/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `、${numberToJapaneseReading(n)}ねん、`;
  });

  // ひらがな「えん」が付いた数値（例: 825000えん -> 、はちじゅうにまんごせんえん、）
  text = text.replace(/(\d+)\s*えん/g, (_, numStr) => {
    const n = parseInt(numStr, 10);
    return `、${numberToJapaneseReading(n)}えん、`;
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

  // 残った半角数字（電話番号・番号・単体数字）をすべてひらがな読みに変換してCartesiaの英語読み・スキップを防止
  text = text.replace(/(\d+)\.(\d+)/g, (_, a, b) => {
    const bDigits = String(b)
      .split('')
      .map((d) => ['ぜろ', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'][Number(d)] ?? d)
      .join('');
    return `${numberToJapaneseReading(parseInt(a, 10))}てん${bDigits}`;
  });
  text = text.replace(/\d+/g, (numStr) => numberToJapaneseReading(parseInt(numStr, 10)));

  // 連続空白・改行を整理
  text = text
    .replace(/\r?\n+/g, '。')
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、')
    .replace(/、。/g, '。')
    .replace(/^、+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

/**
 * Google Cloud Text-to-Speech (ja-JP-Neural2-B) 専用の自然な読み上げ整形。
 * Google TTS は漢字かな交じり文のままの方がアクセント辞書が正確に効くため、
 * 一般漢字のひらがな化は行わず、URL・記号・地名・英略語・小数金額のみを自然に整える。
 */
export function normalizeTextForGoogleCloudTts(rawText: string): string {
  let text = rawText;

  text = text.replace(/https?:\/\/[^\s]+/g, '');
  text = text.replace(/[*_`#>|]/g, '');
  text = text.replace(/^[\s・\-•]+/gm, '');
  text = text.replace(/(\d+)\s*[〜～~]\s*(\d+)/g, '$1から$2');
  text = text.replace(/\d{1,3}(?:,\d{3})+/g, (match) => match.replace(/,/g, ''));
  text = text.replace(/(\d+)\.(\d+)\s*万円/g, (_, intPart, decPart) => {
    const sub = parseInt(decPart, 10);
    return sub > 0 ? `${intPart}万${sub}千円` : `${intPart}万円`;
  });

  const googleRules: Array<[RegExp, string]> = [
    [/那須塩原市新南/g, 'なすしおばらし 新南'],
    [/那須塩原市/g, 'なすしおばらし'],
    [/西那須野店/g, 'にしなすのてん'],
    [/西那須野/g, 'にしなすの'],
    [/相田\s*日出男/g, 'あいだ ひでお'],
    [/ワゴンR/gi, 'ワゴンアール'],
    [/ムーヴ\s*キャンバス/g, 'ムーブキャンバス'],
    [/ストライブス\s*G/gi, 'ストライプス ジー'],
    [/ストライプス\s*G/gi, 'ストライプス ジー'],
    [/XF\s*2WD/gi, 'エックスエフ 2ダブリューディー'],
    [/HV\s*Z\s*[2２]WD/gi, 'ハイブリッド ゼット 2ダブリューディー'],
    [/HV\s*X/gi, 'ハイブリッド エックス'],
    [/\b2WD\b/gi, '2ダブリューディー'],
    [/２WD/gi, '2ダブリューディー'],
    [/\b4WD\b/gi, '4ダブリューディー'],
    [/\bHV\b/g, 'ハイブリッド'],
    [/鈑金/g, '板金'],
  ];

  for (const [pattern, replacement] of googleRules) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\r?\n+/g, '。')
    .replace(/。{2,}/g, '。')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 長文を自然な日本語の文単位に分割し、ストリーミング順次再生しやすくする。
 */
export function splitIntoSpeechChunks(speechText: string, maxChunkLength = 95): string[] {
  const normalized = speechText.trim();
  if (!normalized) return [];

  // iOS Safari 旧バージョンでも構文エラーにならないよう後読み正規表現 (?<=...) を使わずに文分割
  const rawSentences = normalized.match(/[^。！？!?]+[。！？!?]*/g) || [normalized];
  const sentences = rawSentences.map((s) => s.trim()).filter(Boolean);

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
