// Smoke test: build with test fixture, open from file:// and check offline behaviour and search.
const { execFileSync } = require("child_process");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const out = path.join(__dirname, "out", "cps230-test.html");
execFileSync("python3", [path.join(root, "build.py"), "--data", path.join(__dirname, "fixture"), "--out", out], { stdio: "inherit" });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const external = [];
  const errors = [];
  page.on("request", (r) => { if (!r.url().startsWith("file:")) external.push(r.url()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + out);

  const check = (cond, msg) => { if (!cond) { console.error("FAIL: " + msg); process.exitCode = 1; } else console.log("ok: " + msg); };

  await page.fill("#q", "vendor");
  await page.waitForTimeout(200);
  check((await page.textContent("#results")).includes("material service provider"), "synonym vendor finds material service provider");
  check((await page.textContent("#expanded")).includes("service provider"), "expanded terms shown");

  await page.fill("#q", "tolerance");
  await page.waitForTimeout(200);
  check((await page.$$("#results li")).length === 1, "tolerance finds one paragraph");

  await page.selectOption("#sfi", "non-SFI");
  await page.waitForTimeout(200);
  check((await page.textContent("#results")).includes("No matches"), "non-SFI hides SFI-only paragraph");
  await page.selectOption("#sfi", "");

  await page.fill("#q", "script");
  await page.waitForTimeout(200);
  check((await page.$$("#results script")).length === 0, "content text is escaped");

  await page.click('button[data-tab="sources"]');
  check((await page.textContent("#sources")).includes("CPS 230"), "sources page lists CPS 230");

  check(external.length === 0, "no network requests (" + external.join(", ") + ")");
  check(errors.length === 0, "no page errors " + errors.join("; "));
  await browser.close();
})();
