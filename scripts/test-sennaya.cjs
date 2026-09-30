const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const { chromium } = require("playwright");
const port = 19500 + process.pid % 400;
const origin = process.env.SENNAYA_TEST_URL || `http://127.0.0.1:${port}`;
const screenshotDir = process.env.SENNAYA_SCREENSHOTS;

async function run() {
  const started = Date.now();
  const server = process.env.SENNAYA_TEST_URL ? null : spawn(process.execPath, ["scripts/serve-dist.cjs", "--port", String(port)], { cwd: root, stdio: "ignore" });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { ready = (await fetch(`${origin}/sennaya`)).ok; } catch {} if (ready) break; await new Promise(r => setTimeout(r, 100)); }
    assert.ok(ready, "built staging page responds");
    const alias = await fetch(`${origin}/investor/franchise-platform/sennaya?review=1`, { redirect: "manual" });
    assert.equal(alias.status, 308); assert.equal(alias.headers.get("location"), "/sennaya?review=1");
    assert.doesNotMatch(fs.readFileSync(path.join(root, "dist/sitemap.xml"), "utf8"), /sennaya/);
    assert.match(fs.readFileSync(path.join(root, "dist/sennaya/index.html"), "utf8"), /<link rel="canonical" href="https:\/\/colob\.spi\.ski\/sennaya"/);
    browser = await chromium.launch({ headless: true });
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: "reduce" });
      const errors = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(`${origin}/sennaya`, { waitUntil: "networkidle" });
      await page.getByTestId("sennaya-page").waitFor(); await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator("h1").innerText(), "Московский, 4 — помещение с готовым сценарием использования");
      assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
      // Existing usePageMeta adopts the current origin after hydration; the
      // deployable prerender above must retain the production canonical.
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `${origin}/sennaya`);
      const text = (await page.getByTestId("sennaya-page").innerText()).replace(/[\u00a0\u202f]/g, " ");
      for (const term of ["73,5 м²", "Около 26 мест", "500 000 ₽", "4 042 500 ₽", "8 260 876 ₽", "5,24 млн ₽", "6,99 млн ₽", "8,74 млн ₽"]) assert.ok(text.includes(term), term);
      // Detect cosmetic controls, reserve leakage and inaccessible keyboard state.
      // Canonical arithmetic is independently covered by the exhaustive unit test.
      const canonical = JSON.parse(fs.readFileSync(path.join(root, 'src/content/sennaya-data.json'), 'utf8')).openingBudgetVariants;
      const groups = ['preparation','equipment','launch','inventory','contingency'];
      const controls = groups.map(id => page.locator(`[data-budget-group="${id}"]`).getByRole('switch'));
      const total = page.getByTestId('budget-total');
      assert.equal(await page.getByRole('switch').count(), 5);
      for (let mask = 0; mask < 32; mask++) {
        const key = groups.map((_, i) => mask & (1 << i) ? '1' : '0').join('');
        for (let i = 0; i < groups.length; i++) await controls[i].setChecked(key[i] === '1');
        assert.ok(Math.abs(Number(await total.getAttribute('data-amount')) - canonical[key].knownRub) < .001, key);
        assert.equal((await total.innerText()).replace(/[\u00a0\u202f]/g,' '), Math.round(canonical[key].knownRub).toLocaleString('ru-RU').replace(/[\u00a0\u202f]/g,' ')+' ₽');
        for (const row of canonical[key].rows) {
          const cell = page.locator(`[data-budget-group="${row.id}"] .sennaya-budget-amount`);
          assert.equal(Number(await cell.getAttribute('data-amount')), row.knownRub);
          if (!row.included) assert.equal(await cell.innerText(), 'Не включено');
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px ${key} overflow`);
      }
      // Keyboard-only progression and toggling must reach all five controls.
      await controls[0].focus();
      for (let i = 0; i < controls.length; i++) {
        assert.equal(await controls[i].evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Space'); assert.equal(await controls[i].isChecked(), false);
        const offKey = groups.map((_, j) => i === j ? '0' : '1').join('');
        assert.equal(Number(await total.getAttribute('data-amount')), canonical[offKey].knownRub);
        await page.keyboard.press('Space'); assert.equal(await controls[i].isChecked(), true);
        if (i < controls.length - 1) await page.keyboard.press('Tab');
      }
      assert.equal(await page.locator('.sennaya-page details, .sennaya-page select').count(), 0);
      const minimumFont = await page.locator('.sennaya-note, .sennaya-budget-description p, .sennaya-metrics span, .sennaya-metrics small, .sennaya-scope-switch, .sennaya-property-text p').evaluateAll(nodes => Math.min(...nodes.map(node => parseFloat(getComputedStyle(node).fontSize))));
      assert.ok(minimumFont >= 16, `readable captions at ${width}: ${minimumFont}px`);
      assert.doesNotMatch(text, /7 816 571|16 077 447|16,08|EBITDA|ФОТ|Кто оплачивает|подготовка команды|гарантированный арендный доход/);
      assert.ok(text.includes('Участие собственника в капитальных улучшениях объекта может обсуждаться отдельно и не является обязательным условием.'));
      assert.ok(text.includes('Это расчёт выручки, а не прибыли.'));
      assert.doesNotMatch(text, /CFG-|CAPEX-|BASE|HeadCo|UFO|N\/A/);
      assert.doesNotMatch(text, /\d+[.,]\d{4,}/, "no decimal tails");
      const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, heroBackground: getComputedStyle(document.querySelector(".sennaya-page .franchise-hero")).backgroundImage, overflow: [...document.querySelectorAll(".sennaya-page *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).map(e => e.className) }));
      assert.ok(layout.scroll <= layout.width + 1, `${width}px page overflow`); assert.deepEqual(layout.overflow, [], `${width}px element overflow`); assert.equal(layout.heroBackground, "none");
      assert.equal(await page.locator(".sennaya-scenarios tbody tr").count(), 3);
      assert.match(await page.getByRole("link", {name: /^Обсудить объект$/}).getAttribute("class"), /button-primary/);
      for (const href of await page.getByTestId("sennaya-page").locator('a[href^="/"]').evaluateAll(nodes => [...new Set(nodes.map(n => n.getAttribute("href")))])) assert.equal((await fetch(`${origin}${href}`)).status, 200, href);
      if (screenshotDir && [1440, 390].includes(width)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        if (width === 1440) fs.writeFileSync(path.join(screenshotDir, "sennaya-page-text.txt"), text + "\n");
        // Interactions scroll controls into view. Restore the page origin so
        // the fixed site header is captured at the top of the full-page image.
        await page.evaluate(async () => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          window.scrollTo({ top: 0, behavior: "instant" });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        await page.screenshot({ path: path.join(screenshotDir, width === 1440 ? "sennaya-desktop-full.png" : "sennaya-mobile-full.png"), fullPage: true, animations: "disabled" });
      }
      await page.getByRole("link", { name: /Производственная база на Петроградке/ }).click();
      await page.getByTestId("petrogradka-scenario-page").waitFor();
      await page.getByRole("link", { name: /Сенная — флагманская точка/ }).click();
      await page.getByTestId("sennaya-page").waitFor();
      await page.getByRole("link", { name: /^Обсудить объект$/ }).click();
      await page.waitForURL("**/investor-questions");
      assert.deepEqual(errors, [], `${width}px runtime errors`);
      await page.close();
    }
    console.log(`Sennaya built-page browser: PASS · 4 widths, all 32 work scopes, keyboard/mouse, no public operating reserve, captions >=16px, source values, alias, noindex, reciprocal links, CTA, no overflow · ${((Date.now()-started)/1000).toFixed(1)}s`);
  } finally { await browser?.close(); server?.kill(); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
