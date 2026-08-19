import type { LabelPrintJob } from "../../shared/types";

type Html2CanvasRenderer = typeof import("html2canvas").default;
type Label = LabelPrintJob["labels"][number];

export type LabelPreviewPage = {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  pageNumber: number;
};

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MM_TO_PX = 96 / 25.4;
const A4_WIDTH_PX = A4_WIDTH_MM * MM_TO_PX;
const A4_HEIGHT_PX = A4_HEIGHT_MM * MM_TO_PX;
const PAGE_PADDING_MM = 8;
const LABEL_GAP_MM = 4;
const RENDER_SCALE = 2;
const GEOMETRY_TOLERANCE_PX = 2;

const setStyles = (element: HTMLElement, styles: Record<string, string>) => {
  Object.assign(element.style, styles);
};

const splitIntoPages = <T,>(items: T[], pageSize: number) => {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
};

export const expandLabels = (labels: LabelPrintJob["labels"]) => (
  labels.flatMap((label) => Array.from({ length: label.quantity }, () => label))
);

function createLabel(label: Label, job: Pick<LabelPrintJob, "templateId" | "geometry">) {
  const element = document.createElement("article");
  element.dataset.labelDocumentCard = "true";
  setStyles(element, {
    display: "flex",
    flexDirection: "column",
    width: `${job.geometry.widthMm}mm`,
    height: `${job.geometry.heightMm}mm`,
    padding: "2.5mm",
    gap: "1.4mm",
    overflow: "hidden",
    border: "0.45mm solid #111111",
    background: "#ffffff",
    color: "#111111",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif"
  });

  const title = document.createElement("strong");
  title.textContent = label.title;
  setStyles(title, {
    display: "-webkit-box",
    overflow: "hidden",
    color: "#111111",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1.12",
    textAlign: "center",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: "2"
  });

  const manufacturer = document.createElement("div");
  manufacturer.textContent = `Производитель: ${label.manufacturer || "Не указан"}`;
  setStyles(manufacturer, {
    overflow: "hidden",
    color: "#111111",
    fontSize: "9px",
    fontWeight: "600",
    lineHeight: "1.15",
    textAlign: "center"
  });

  const details = document.createElement("div");
  setStyles(details, {
    display: "grid",
    gap: "1mm",
    marginTop: "auto",
    color: "#111111",
    fontSize: "9px",
    fontWeight: "600",
    lineHeight: "1.15"
  });

  const openedAt = document.createElement("div");
  openedAt.textContent = `Дата вскрытия: ${label.printedAt}`;
  const shelfLife = document.createElement("div");
  shelfLife.textContent = "Срок годности: 12 месяцев";
  details.append(openedAt, shelfLife);

  element.append(title, manufacturer, details);
  return element;
}

function createDocumentRoot(job: Pick<LabelPrintJob, "templateId" | "geometry" | "labels">) {
  const root = document.createElement("div");
  setStyles(root, {
    position: "absolute",
    left: "-10000px",
    top: "0",
    width: `${A4_WIDTH_MM}mm`,
    background: "#ffffff",
    color: "#111827",
    zIndex: "-1"
  });

  const pages = splitIntoPages(expandLabels(job.labels), Math.max(1, job.geometry.labelsPerPage));
  for (const pageLabels of pages) {
    const page = document.createElement("article");
    page.dataset.labelDocumentPage = "true";
    setStyles(page, {
      width: `${A4_WIDTH_MM}mm`,
      height: `${A4_HEIGHT_MM}mm`,
      margin: "0",
      padding: "0",
      overflow: "hidden",
      background: "#ffffff",
      boxSizing: "border-box"
    });

    const grid = document.createElement("div");
    setStyles(grid, {
      display: "grid",
      gridTemplateColumns: `repeat(${job.geometry.perRow}, ${job.geometry.widthMm}mm)`,
      gridAutoRows: `${job.geometry.heightMm}mm`,
      alignContent: "start",
      gap: `${LABEL_GAP_MM}mm`,
      padding: `${PAGE_PADDING_MM}mm`,
      boxSizing: "border-box"
    });

    for (const label of pageLabels) grid.appendChild(createLabel(label, job));
    page.appendChild(grid);
    root.appendChild(page);
  }
  return root;
}

function captureOptions(): NonNullable<Parameters<Html2CanvasRenderer>[1]> {
  return {
    backgroundColor: "#ffffff",
    scale: RENDER_SCALE,
    useCORS: true,
    logging: false,
    width: Math.ceil(A4_WIDTH_PX),
    height: Math.ceil(A4_HEIGHT_PX),
    windowWidth: Math.ceil(A4_WIDTH_PX),
    windowHeight: Math.ceil(A4_HEIGHT_PX),
    scrollX: 0,
    scrollY: 0
  };
}

function validateGeometry(root: HTMLElement, job: Pick<LabelPrintJob, "geometry" | "labels">) {
  const errors: string[] = [];
  const expectedLabels = expandLabels(job.labels).length;
  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-label-document-card='true']"));
  if (cards.length !== expectedLabels) errors.push(`Ожидалось этикеток: ${expectedLabels}, получено: ${cards.length}.`);

  const check = (name: string, actualPx: number, expectedMm: number) => {
    const expectedPx = expectedMm * MM_TO_PX;
    if (Math.abs(actualPx - expectedPx) > GEOMETRY_TOLERANCE_PX) {
      errors.push(`${name}: ожидалось ${expectedMm} мм, получено ${(actualPx / MM_TO_PX).toFixed(1)} мм.`);
    }
  };

  for (const [index, page] of Array.from(root.querySelectorAll<HTMLElement>("[data-label-document-page='true']")).entries()) {
    const rect = page.getBoundingClientRect();
    check(`Страница ${index + 1}, ширина`, rect.width, A4_WIDTH_MM);
    check(`Страница ${index + 1}, высота`, rect.height, A4_HEIGHT_MM);
  }
  for (const [index, card] of cards.entries()) {
    const rect = card.getBoundingClientRect();
    check(`Этикетка ${index + 1}, ширина`, rect.width, job.geometry.widthMm);
    check(`Этикетка ${index + 1}, высота`, rect.height, job.geometry.heightMm);
  }
  return errors;
}

async function withDocumentRoot<T>(
  job: Pick<LabelPrintJob, "templateId" | "geometry" | "labels">,
  run: (root: HTMLElement, html2canvas: Html2CanvasRenderer) => Promise<T>
) {
  const { default: html2canvas } = await import("html2canvas");
  const root = createDocumentRoot(job);
  try {
    document.body.appendChild(root);
    await document.fonts?.ready;
    const errors = validateGeometry(root, job);
    if (errors.length) throw new Error(`Документ отличается от заданных параметров.\n\n${errors.join("\n")}`);
    return await run(root, html2canvas);
  } finally {
    root.remove();
  }
}

export function renderLabelPreviewPages(job: Pick<LabelPrintJob, "templateId" | "geometry" | "labels">) {
  return withDocumentRoot(job, async (root, html2canvas) => {
    const result: LabelPreviewPage[] = [];
    const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-label-document-page='true']"));
    for (const [index, page] of pages.entries()) {
      const canvas = await html2canvas(page, captureOptions());
      result.push({
        id: `label-preview-${index + 1}-${canvas.width}x${canvas.height}`,
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
        pageNumber: index + 1
      });
    }
    return result;
  });
}

export function saveLabelPdf(
  job: Pick<LabelPrintJob, "templateId" | "geometry" | "labels">,
  fileName: string
) {
  return withDocumentRoot(job, async (root, html2canvas) => {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-label-document-page='true']"));
    for (const [index, page] of pages.entries()) {
      if (index > 0) pdf.addPage();
      const canvas = await html2canvas(page, captureOptions());
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
    }
    pdf.save(fileName);
  });
}
