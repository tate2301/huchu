import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";
import type { DocumentTemplateSchema } from "@/lib/documents/template-schema";

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
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

async function launchBrowser(): Promise<Browser> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");

  const launch = async (executablePath: string) =>
    puppeteer.launch({
      executablePath,
      headless: "shell",
      defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      args: [...chromium.args, "--font-render-hinting=none"],
    });

  const explicitExecutable = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicitExecutable) {
    return launch(explicitExecutable);
  }

  try {
    const serverlessExecutable = await chromium.executablePath();
    if (serverlessExecutable) {
      return launch(serverlessExecutable);
    }
  } catch {
    // Fall through to local executable detection.
  }

  const localExecutable = findLocalChromiumExecutable();
  if (localExecutable) {
    return launch(localExecutable);
  }

  throw new Error(
    "No Chromium executable found. Configure CHROME_EXECUTABLE_PATH for local runtime, or deploy with @sparticuz/chromium support.",
  );
}

export async function renderPdfFromHtml(input: {
  html: string;
  template: DocumentTemplateSchema;
}): Promise<Buffer> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(input.html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: input.template.page.size,
      landscape: input.template.page.orientation === "landscape",
      printBackground: true,
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
    await browser.close();
  }
}
