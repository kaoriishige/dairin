/**
 * 全角数字・記号の半角化および桁区切りカンマ除去を行う共通正規化関数。
 * 予算パース（vehicleSearch）と音声読み上げ正規化（speechTextNormalizer）で共通利用する。
 */
export function normalizeNumericStrings(text: string): string {
  return text
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/(\d)．(\d)/g, '$1.$2')
    .replace(/(\d)，(\d)/g, '$1,$2')
    .replace(/\d{1,3}(?:,\d{3})+/g, (match) => match.replace(/,/g, ''));
}
