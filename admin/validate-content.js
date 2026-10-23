/* ═══════════════════════════════════════════════════════════
   CONTENT_REGISTRY 校验工具
   逐条检查 server.js 注册表中的 CSS 选择器是否命中对应页面元素。
   用法: node admin/validate-content.js
   ═══════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { CONTENT_REGISTRY } = require('./server');

const ROOT = path.resolve(__dirname, '..');

let ok = 0, fail = 0;
const failures = [];

for (const [mod, { pages }] of Object.entries(CONTENT_REGISTRY)) {
    for (const [pageKey, page] of Object.entries(pages)) {
        for (const item of page.items) {
            const fp = path.join(ROOT, item.file);
            if (!fs.existsSync(fp)) {
                failures.push(`[${mod}/${pageKey}] ${item.key} — FILE MISSING: ${item.file}`);
                fail++;
                continue;
            }
            const $ = cheerio.load(fs.readFileSync(fp, 'utf-8'));
            const matches = $(item.selector).length;
            if (matches === 0) {
                failures.push(`[${mod}/${pageKey}] ${item.key} — NO MATCH: ${item.selector} (${item.file})`);
                fail++;
            } else {
                ok++;
            }
        }
    }
}

console.log(`\n✅ Matched: ${ok}  ❌ Failed: ${fail}\n`);
failures.forEach(f => console.log('  ✗ ' + f));
if (fail === 0) console.log('  All registry selectors are valid.\n');
process.exit(fail === 0 ? 0 : 1);
