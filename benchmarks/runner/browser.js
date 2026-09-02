/**
 * Execute a benchmark page and return the raw timings.
 */

import { chromium } from "playwright";

/**
 * Launch Chromium for benchmarks.
 *
 * @returns {Promise<import("playwright").Browser>}
 */
export async function launchBrowser() {
    return chromium.launch({
        headless: true,
        args: [
            "--js-flags=--expose-gc"
        ]
    });
}

/**
 * Execute a benchmark page.
 *
 * The benchmark page must expose:
 *
 * window.__benchmarkResults__
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 *
 * @returns {Promise<object>}
 */
export async function runBenchmark(browser, url) {

    const page = await browser.newPage();
    const client = await page.context().newCDPSession(page);

    await page.exposeFunction("getV8HeapUsage", async () => {
        const usage = await client.send("Runtime.getHeapUsage");
        return usage.usedSize;
    });

    await page.goto(url, {
        waitUntil: "networkidle"
    });

    // Wait until benchmark has completed.
    await page.waitForFunction(() => {
        if (window.__benchmarkError__) {
            throw new Error(window.__benchmarkError__);
        }

        return window.__benchmarkResults__ !== undefined;
    });

    const results = await page.evaluate(() => {
        return window.__benchmarkResults__;
    });

    await page.close();

    return results;

}

export function getBrowserMetadata(browser) {
    return {
        browser: "Chromium",
        browserVersion: browser.version(),
        os: process.platform === "win32" ? "Windows" : process.platform,
    };
}

/**
 * Close browser.
 *
 * @param {import('playwright').Browser} browser
 */
export async function closeBrowser(browser) {
    await browser.close();
}
