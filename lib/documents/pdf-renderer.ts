import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, LaunchOptions } from "puppeteer-core";
import type { DocumentTemplateSchema } from "@/lib/documents/template-schema";

/**
 * How long a page is given to settle before it is printed anyway.
 *
 * A branded document pulls a logo, a signature and a stamp off blob storage.
 * When one of those URLs hangs — a deleted blob, a tenant that pasted a URL
 * from somewhere with no CORS, a slow cold cache — waiting for the network to
 * go quiet used to throw a navigation timeout and the whole render failed with
 * nothing to show for it. A document missing its logo still beats no document,
 * so the wait is bounded and a timeout falls through to printing.
 */
const CONTENT_SETTLE_MS = 8_000;
/** Ceiling for the whole render, so a wedged browser cannot hold the request. */
const PDF_TIMEOUT_MS = 45_000;

function findLocalChromiumExecutable(): string | null {
  const platform = process.platform;
  const candidates: string[] = [];

  if (platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    );
  } else if (platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/opt/google/chrome/chrome",
      // Playwright's browsers, which the containers this runs in already carry.
      "/opt/pw-browsers/chromium",
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function findSparticuzBinDirectories(): string[] {
  const candidates: string[] = [];
  const direct = join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin");
  if (existsSync(direct)) {
    candidates.push(direct);
  }

  const pnpmRoot = join(process.cwd(), "node_modules", ".pnpm");
  if (existsSync(pnpmRoot)) {
    for (const entry of readdirSync(pnpmRoot)) {
      if (!entry.startsWith("@sparticuz+chromium@")) continue;
      const candidate = join(
        pnpmRoot,
        entry,
        "node_modules",
        "@sparticuz",
        "chromium",
        "bin",
      );
      if (existsSync(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return Array.from(new Set(candidates));
}

/**
 * Flags for a browser that is not `chrome-headless-shell`.
 *
 * `@sparticuz/chromium` ships the headless shell and its `args` are tuned for
 * it. Handing those same args — and `headless: "shell"` — to an ordinary
 * Chrome is how a developer's local render died: current Chrome has no shell
 * mode to switch into, so it refused to start and the only symptom was a 500
 * on the PDF route. A full browser gets the sandbox flags it needs and nothing
 * that assumes the shell.
 */
const FULL_BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--font-render-hinting=none",
];

async function launchBrowser(): Promise<Browser> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const errors: string[] = [];

  const launch = async (executablePath: string, options: Partial<LaunchOptions>) =>
    puppeteer.launch({
      executablePath,
      defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      timeout: 30_000,
      ...options,
    });

  const launchShell = (executablePath: string) =>
    launch(executablePath, {
      headless: "shell",
      args: [...chromium.args, "--font-render-hinting=none"],
    });

  const launchFullBrowser = (executablePath: string) =>
    launch(executablePath, { headless: true, args: FULL_BROWSER_ARGS });

  // An explicitly configured binary is whatever the operator installed, so it
  // is launched as a full browser rather than as the shell.
  const explicitExecutable = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicitExecutable) {
    try {
      return await launchFullBrowser(explicitExecutable);
    } catch (error) {
      errors.push(
        `CHROME_EXECUTABLE_PATH launch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  try {
    const serverlessExecutable = await chromium.executablePath();
    if (serverlessExecutable) {
      return await launchShell(serverlessExecutable);
    }
  } catch (error) {
    errors.push(
      `@sparticuz/chromium default executablePath failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const binDir of findSparticuzBinDirectories()) {
    try {
      const serverlessExecutable = await chromium.executablePath(binDir);
      if (serverlessExecutable) {
        return await launchShell(serverlessExecutable);
      }
    } catch (error) {
      errors.push(
        `@sparticuz/chromium executablePath('${binDir}') failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const localExecutable = findLocalChromiumExecutable();
  if (localExecutable) {
    try {
      return await launchFullBrowser(localExecutable);
    } catch (error) {
      errors.push(
        `Local Chromium launch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `No Chromium executable found. ${errors.join(" | ") || "Neither @sparticuz/chromium nor a local browser was reachable."}`,
  );
}

export async function renderPdfFromHtml(input: {
  html: string;
  template: DocumentTemplateSchema;
}): Promise<Buffer> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(CONTENT_SETTLE_MS);

    try {
      await page.setContent(input.html, {
        waitUntil: "networkidle0",
        timeout: CONTENT_SETTLE_MS,
      });
    } catch {
      // The markup is already in the page — only the wait for quiet gave up.
      // Print what is there rather than losing the document to a slow logo.
      console.warn(
        "[documents] assets did not settle within the render budget; printing anyway",
      );
    }

    // `networkidle0` can settle before the webfont's own request is made, and
    // a page printed mid-swap sets the whole document in the fallback face —
    // the tenant's chosen font silently absent from their paper. Bounded like
    // everything else here: a font that never arrives costs the wait, not the
    // document.
    await page
      .evaluate(() => document.fonts.ready.then(() => undefined))
      .catch(() => {
        console.warn("[documents] webfonts did not finish loading; printing with fallbacks");
      });

    const pdf = await page.pdf({
      format: input.template.page.size,
      landscape: input.template.page.orientation === "landscape",
      printBackground: true,
      timeout: PDF_TIMEOUT_MS,
      margin: {
        top: `${input.template.page.marginMm}mm`,
        right: `${input.template.page.marginMm}mm`,
        bottom: `${input.template.page.marginMm}mm`,
        left: `${input.template.page.marginMm}mm`,
      },
      preferCSSPageSize: true,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
