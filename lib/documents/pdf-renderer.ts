import type { DocumentTemplateSchema } from "@/lib/documents/template-schema";

export async function renderPdfFromHtml(input: {
  html: string;
  template: DocumentTemplateSchema;
}): Promise<Buffer> {
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--font-render-hinting=none"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(input.html, { waitUntil: "networkidle" });

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
