import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.jp-dairin.jp';
const SEED_PATHS = [
  '/',
  '/service/car-sales-lease',
  '/service/inspection',
  '/service/body-paint',
  '/service/insurance-others',
  '/company',
];

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'DairinAISalesDemoCrawler/1.0 (https://www.jp-dairin.jp/)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

function cleanText(str) {
  return str.replace(/\s+/g, ' ').trim();
}

async function main() {
  const visited = new Set();
  const queue = SEED_PATHS.map((p) => `${BASE_URL}${p}`);
  const pages = [];

  while (queue.length > 0 && visited.size < 30) {
    const url = queue.shift();
    const normalized = url.replace(/\/$/, '') || BASE_URL;
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      console.log(`Fetching: ${url}`);
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      const title = cleanText($('title').text());
      const links = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const text = cleanText($(el).text());
        if (!href) return;
        let abs = href;
        if (href.startsWith('/')) abs = `${BASE_URL}${href}`;
        if (abs.startsWith(BASE_URL) && !abs.includes('#') && !abs.match(/\.(pdf|jpg|png|jpeg|webp)$/i)) {
          if (!visited.has(abs.replace(/\/$/, ''))) {
            queue.push(abs);
          }
        }
        links.push({ href: abs, text });
      });

      const images = [];
      $('img[src]').each((_, el) => {
        const src = $(el).attr('src');
        const alt = cleanText($(el).attr('alt') || '');
        if (!src) return;
        const abs = src.startsWith('http') ? src : src.startsWith('/') ? `${BASE_URL}${src}` : `${BASE_URL}/${src}`;
        images.push({ src: abs, alt });
      });

      const tables = [];
      $('table').each((_, table) => {
        const rows = [];
        $(table).find('tr').each((_, tr) => {
          const cells = [];
          $(tr).find('th, td').each((_, cell) => {
            cells.push(cleanText($(cell).text()));
          });
          if (cells.length > 0) rows.push(cells);
        });
        if (rows.length > 0) tables.push(rows);
      });

      // Remove nav/footer/script/style for main text
      const $main = $('main').length ? $('main').clone() : $('body').clone();
      $main.find('script, style, noscript').remove();
      const headings = [];
      $main.find('h1, h2, h3, h4').each((_, h) => {
        headings.push({ tag: h.tagName.toLowerCase(), text: cleanText($(h).text()) });
      });

      const bodyText = cleanText($main.text());

      pages.push({
        url,
        title,
        headings,
        bodyText,
        tables,
        images,
        externalLinks: links.filter((l) => !l.href.startsWith(BASE_URL)),
        internalLinks: [...new Set(links.filter((l) => l.href.startsWith(BASE_URL)).map((l) => l.href))],
      });
    } catch (err) {
      console.error(`Error fetching ${url}:`, err.message);
      pages.push({ url, error: err.message });
    }
  }

  const outDir = path.resolve('data/knowledge');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'raw_site_snapshot.json');
  await fs.writeFile(outPath, JSON.stringify({ fetchedAt: new Date().toISOString(), pages }, null, 2), 'utf-8');
  console.log(`Saved ${pages.length} pages to ${outPath}`);
}

main();
