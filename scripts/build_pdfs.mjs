import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const reportsDir = path.join(root, 'docs', 'reports');
fs.mkdirSync(reportsDir, { recursive: true });

function findBrowser() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('No Chromium/Edge executable found for PDF generation.');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMd(s) {
  let out = escapeHtml(s);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\\_/g, '_');
  out = out.replace(/—/g, '&mdash;');
  return out;
}

function mdToHtmlBody(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let tableRows = [];

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  const flushTable = () => {
    if (!tableRows.length) return;
    html.push('<table>');
    tableRows.forEach((row, idx) => {
      const cells = row
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      if (idx === 1 && cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        return;
      }
      const tag = idx === 0 ? 'th' : 'td';
      if (idx === 0) html.push('<thead>');
      if (idx === 2 || (idx === 1 && !/^:?-{2,}:?$/.test(cells[0]))) html.push('<tbody>');
      html.push('<tr>' + cells.map((c) => `<${tag}>${inlineMd(c)}</${tag}>`).join('') + '</tr>');
      if (idx === 0) html.push('</thead>');
    });
    html.push('</tbody></table>');
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('```')) {
      closeLists();
      flushTable();
      if (!inCode) {
        html.push('<pre><code>');
        inCode = true;
      } else {
        html.push('</code></pre>');
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(rawLine) + '\n');
      continue;
    }

    if (line.startsWith('|') && line.includes('|', 1)) {
      closeLists();
      tableRows.push(line);
      continue;
    } else {
      flushTable();
    }

    if (!line.trim()) {
      closeLists();
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeLists();
      html.push('<hr />');
      continue;
    }

    const hMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (hMatch) {
      closeLists();
      const lvl = hMatch[1].length;
      html.push(`<h${lvl}>${inlineMd(hMatch[2])}</h${lvl}>`);
      continue;
    }

    if (line.startsWith('>')) {
      closeLists();
      html.push(`<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }

    const ulMatch = /^\s*[-*]\s+(.+)$/.exec(line);
    if (ulMatch) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${inlineMd(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (olMatch) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${inlineMd(olMatch[1])}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p>${inlineMd(line)}</p>`);
  }

  closeLists();
  flushTable();
  if (inCode) html.push('</code></pre>');
  return html.join('\n');
}

function wrapPrintHtml(title, bodyHtml) {
  return `<!doctype html>
<html lang="bg">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.48;
      color: #0f172a;
      margin: 0;
    }
    .doc-hdr {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #b91c1c;
      padding-bottom: 6px;
      margin-bottom: 12px;
      font-size: 8.5pt;
      color: #475569;
      font-family: Consolas, monospace;
    }
    h1 { font-size: 15pt; color: #b91c1c; margin: 10px 0 8px; page-break-after: avoid; }
    h2 { font-size: 12.2pt; color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin: 16px 0 6px; page-break-after: avoid; }
    h3 { font-size: 10.6pt; color: #0f172a; margin: 12px 0 4px; page-break-after: avoid; }
    p, li { margin: 4px 0; }
    ul, ol { padding-left: 18px; margin: 5px 0 8px; }
    blockquote {
      margin: 8px 0;
      padding: 8px 12px;
      border-left: 3px solid #b91c1c;
      background: #fffafa;
      font-size: 9.2pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 12px;
      font-size: 8.4pt;
      page-break-inside: auto;
    }
    tr { page-break-inside: avoid; }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f1f5f9; font-weight: 700; }
    code {
      font-family: Consolas, monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      padding: 1px 3px;
      border-radius: 3px;
      word-break: break-all;
    }
    pre {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 8px;
      font-size: 8.2pt;
      white-space: pre-wrap;
      page-break-inside: avoid;
    }
    a { color: #1e3a8a; text-decoration: none; }
    hr { border: none; border-top: 1px solid #cbd5e1; margin: 12px 0; }
    .doc-ftr {
      margin-top: 18px;
      border-top: 1px solid #cbd5e1;
      padding-top: 6px;
      font-size: 8pt;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="doc-hdr">
    <span>NASVETLO.WEBSITE · OPEN DATA AUDIT</span>
    <span>CERN ZENODO DOI: 10.5281/zenodo.24580253</span>
  </div>
  ${bodyHtml}
  <div class="doc-ftr">
    <span>https://nasvetlo.website/ · ORCID: 0009-0004-8070-1348</span>
    <span>CC-BY 4.0 · 0 ЕГН (GDPR)</span>
  </div>
</body>
</html>`;
}

function printHtmlToPdf(browser, htmlFile, pdfPath, profDir) {
  const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${profDir}`,
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      fileUrl,
    ],
    { stdio: 'pipe', timeout: 60000 }
  );
}

const browser = findBrowser();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nasvetlo-pdf-'));
const profDir = path.join(tmpDir, 'browser-prof');
fs.mkdirSync(profDir, { recursive: true });

try {
  const mdDocs = [
    {
      src: path.join(root, 'docs', 'DOKLAD_MS_MINISTAR_PREDSEDATEL_EISS_ZOP_2026.md'),
      out: path.join(reportsDir, 'DOKLAD_MS_MINISTAR_PREDSEDATEL_EISS_ZOP_2026.pdf'),
      title: 'Доклад до МС, ВСС и ИВСС — ЕИСС 2023–2026 и ЗОП',
    },
    {
      src: path.join(root, 'docs', 'DOKLAD_09_POLITICI_OLIGARSI_EISS_ZOP_EPPO_2026.md'),
      out: path.join(reportsDir, 'DOKLAD_09_POLITICI_OLIGARSI_EISS_ZOP_EPPO_2026.pdf'),
      title: 'Допълващ сигнал NASVETLO-GOV-2026-10 — ЕИСС × ЗОП × КПК × EPPO',
    },
  ];

  for (const item of mdDocs) {
    const md = fs.readFileSync(item.src, 'utf8');
    const html = wrapPrintHtml(item.title, mdToHtmlBody(md));
    const tmpHtml = path.join(tmpDir, path.basename(item.src, '.md') + '.html');
    fs.writeFileSync(tmpHtml, html, 'utf8');
    printHtmlToPdf(browser, tmpHtml, item.out, profDir);
    console.log('PDF_WRITTEN', path.basename(item.out), fs.statSync(item.out).size);
  }

  // English Executive Brief PDF compiled from freshly built docs/en/index.html
  const enPath = path.join(root, 'docs', 'en', 'index.html');
  if (fs.existsSync(enPath)) {
    const enHtml = fs.readFileSync(enPath, 'utf8');
    const cssPath = path.join(root, 'docs', 'sigma3', 'styles.css');
    const cssRaw = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
    const printInject = `<style>
      @page { size: A4; margin: 12mm; }
      body { background: #fff !important; color: #0f172a !important; }
      .en-topbar, #enThemeToggle, .svet-wasm-calc, #svetRunWasmVerifyBtn { display: none !important; }
      .svetlina-compact-scroll { max-height: none !important; overflow: visible !important; }
      ${cssRaw}
    </style>`;
    const inlineEn = enHtml
      .replace(/<link[^>]+href="\/sigma3\/styles\.css[^"]*"[^>]*>/i, printInject)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const tmpEn = path.join(tmpDir, 'en_print.html');
    fs.writeFileSync(tmpEn, inlineEn, 'utf8');
    const enPdf = path.join(reportsDir, 'NASVETLO_EPPO_DG_JUST_EXECUTIVE_BRIEF_2026_EN.pdf');
    printHtmlToPdf(browser, tmpEn, enPdf, profDir);
    console.log('PDF_WRITTEN', path.basename(enPdf), fs.statSync(enPdf).size);
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
