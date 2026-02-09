const UNSUPPORTED_COLOR_FN = /\b(?:lab|lch|oklab|oklch|color)\(/i;

const COLOR_STYLE_PROPERTIES = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "caret-color",
  "fill",
  "stroke",
] as const;

type DetachedExportTarget = {
  target: HTMLElement;
  cleanup: () => void;
};

function resolveColorToRgb(value: string, resolver: HTMLElement) {
  if (!value) return null;
  resolver.style.color = "";
  resolver.style.color = value;
  const resolved = getComputedStyle(resolver).color;
  return resolved || null;
}

function sanitizeColorValue(
  value: string,
  resolver: HTMLElement,
  fallback: string,
) {
  if (!value) return value;
  if (!UNSUPPORTED_COLOR_FN.test(value)) return value;
  return resolveColorToRgb(value, resolver) ?? fallback;
}

function sanitizeCloneStyles(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
  const resolver = document.createElement("span");
  resolver.style.position = "fixed";
  resolver.style.left = "-99999px";
  resolver.style.top = "0";
  resolver.style.opacity = "0";
  resolver.style.pointerEvents = "none";
  document.body.appendChild(resolver);

  try {
    const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
    const cloneElements = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>("*"))];
    const length = Math.min(sourceElements.length, cloneElements.length);

    for (let index = 0; index < length; index += 1) {
      const sourceElement = sourceElements[index];
      const cloneElement = cloneElements[index];
      const computed = getComputedStyle(sourceElement);
      const fallbackColor = computed.color || "#111111";

      for (const property of COLOR_STYLE_PROPERTIES) {
        const value = computed.getPropertyValue(property);
        if (!value) continue;
        cloneElement.style.setProperty(
          property,
          sanitizeColorValue(value, resolver, fallbackColor),
        );
      }

      const backgroundImage = computed.getPropertyValue("background-image");
      if (backgroundImage && UNSUPPORTED_COLOR_FN.test(backgroundImage)) {
        cloneElement.style.setProperty("background-image", "none");
        cloneElement.style.setProperty(
          "background-color",
          sanitizeColorValue(
            computed.getPropertyValue("background-color"),
            resolver,
            "#ffffff",
          ),
        );
      }

      const boxShadow = computed.getPropertyValue("box-shadow");
      if (boxShadow && UNSUPPORTED_COLOR_FN.test(boxShadow)) {
        cloneElement.style.setProperty("box-shadow", "none");
      }

      const textShadow = computed.getPropertyValue("text-shadow");
      if (textShadow && UNSUPPORTED_COLOR_FN.test(textShadow)) {
        cloneElement.style.setProperty("text-shadow", "none");
      }
    }
  } finally {
    resolver.remove();
  }
}

function createDetachedExportTarget(element: HTMLElement): DetachedExportTarget {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  host.style.background = "#ffffff";

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = `${Math.max(element.clientWidth, element.scrollWidth)}px`;
  host.appendChild(clone);
  document.body.appendChild(host);

  sanitizeCloneStyles(element, clone);

  return {
    target: clone,
    cleanup: () => host.remove(),
  };
}

export async function exportElementToPdf(element: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const detached = createDetachedExportTarget(element);

  try {
    const canvas = await html2canvas(detached.target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: Math.max(detached.target.scrollWidth, detached.target.clientWidth),
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = pageWidth;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown export error";
    throw new Error(
      `PDF export failed. Try again or use CSV export. Details: ${message}`,
    );
  } finally {
    detached.cleanup();
  }
}
