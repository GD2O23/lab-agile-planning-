import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSource from 'pdfjs-dist/build/pdf.worker.mjs?raw';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import './style.css';

const workerBlobUrl = URL.createObjectURL(
  new Blob([pdfWorkerSource], { type: 'application/javascript' }),
);
pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;

interface BasePlacement {
  page: number; // 0-based
  xRatio: number; // left, as ratio of canvas width
  yRatio: number; // top, as ratio of canvas height
  wRatio: number; // width, as ratio of canvas width
  hRatio: number; // height, as ratio of canvas height
}

interface SignaturePlacement extends BasePlacement {
  type: 'signature';
}

interface DatePlacement extends BasePlacement {
  type: 'date';
  text: string;
}

type Placement = SignaturePlacement | DatePlacement;

let pdfBytes: ArrayBuffer | null = null;
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
let signaturePngBytes: ArrayBuffer | null = null;
let signatureImgEl: HTMLImageElement | null = null;
let signatureAspect = 1;
let currentPage = 0;
let placements: Placement[] = [];
let dragState: { el: HTMLElement; placement: Placement; offsetX: number; offsetY: number } | null = null;
let resizeState: { el: HTMLElement; placement: Placement; startX: number; startY: number; startW: number; startH: number } | null = null;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="container">
    <h1>PDF Signature Editor</h1>
    <p class="note">Everything happens locally in your browser. No file ever leaves your machine.</p>
    <div class="toolbar">
      <label class="file-btn">Open PDF<input id="pdf-input" type="file" accept="application/pdf" hidden /></label>
      <label class="file-btn">Load Signature (PNG)<input id="png-input" type="file" accept="image/png" hidden /></label>
      <button id="add-signature" disabled>Add Signature to Page</button>
      <button id="add-date" disabled>Add Date to Page</button>
      <span class="spacer"></span>
      <button id="prev-page" disabled>&larr; Prev</button>
      <span id="page-indicator">No PDF loaded</span>
      <button id="next-page" disabled>Next &rarr;</button>
      <span class="spacer"></span>
      <button id="export-pdf" disabled>Download Signed PDF</button>
    </div>
    <div id="viewer-wrap">
      <div id="viewer">
        <canvas id="pdf-canvas"></canvas>
        <div id="overlay"></div>
      </div>
    </div>
  </div>
`;

const pdfInput = document.querySelector<HTMLInputElement>('#pdf-input')!;
const pngInput = document.querySelector<HTMLInputElement>('#png-input')!;
const addSignatureBtn = document.querySelector<HTMLButtonElement>('#add-signature')!;
const addDateBtn = document.querySelector<HTMLButtonElement>('#add-date')!;
const prevPageBtn = document.querySelector<HTMLButtonElement>('#prev-page')!;
const nextPageBtn = document.querySelector<HTMLButtonElement>('#next-page')!;
const pageIndicator = document.querySelector<HTMLSpanElement>('#page-indicator')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export-pdf')!;
const canvas = document.querySelector<HTMLCanvasElement>('#pdf-canvas')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;

pdfInput.addEventListener('change', onPdfSelected);
pngInput.addEventListener('change', onPngSelected);
addSignatureBtn.addEventListener('click', addSignaturePlacement);
addDateBtn.addEventListener('click', addDatePlacement);
prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
exportBtn.addEventListener('click', exportSignedPdf);

async function onPdfSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  pdfBytes = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
  placements = [];
  currentPage = 0;
  prevPageBtn.disabled = false;
  nextPageBtn.disabled = false;
  exportBtn.disabled = false;
  addDateBtn.disabled = false;
  addSignatureBtn.disabled = !signatureImgEl;
  await renderPage(currentPage);
}

async function onPngSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  signaturePngBytes = await file.arrayBuffer();
  const blob = new Blob([signaturePngBytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.src = url;
  });
  signatureImgEl = img;
  signatureAspect = img.naturalWidth / img.naturalHeight;
  addSignatureBtn.disabled = !pdfDoc;
}

async function renderPage(pageNum: number) {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(pageNum + 1);
  const viewport = page.getViewport({ scale: 1.5 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  overlay.style.width = `${viewport.width}px`;
  overlay.style.height = `${viewport.height}px`;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  pageIndicator.textContent = `Page ${pageNum + 1} / ${pdfDoc.numPages}`;
  redrawOverlay();
}

function goToPage(pageNum: number) {
  if (!pdfDoc) return;
  if (pageNum < 0 || pageNum >= pdfDoc.numPages) return;
  currentPage = pageNum;
  renderPage(currentPage);
}

function addSignaturePlacement() {
  if (!signatureImgEl) return;
  const wRatio = 0.25;
  const hRatio = (wRatio * canvas.width) / signatureAspect / canvas.height;
  const placement: SignaturePlacement = {
    type: 'signature',
    page: currentPage,
    xRatio: 0.35,
    yRatio: 0.45,
    wRatio,
    hRatio,
  };
  placements.push(placement);
  redrawOverlay();
}

function todayString(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function addDatePlacement() {
  const placement: DatePlacement = {
    type: 'date',
    page: currentPage,
    xRatio: 0.35,
    yRatio: 0.55,
    wRatio: 0.18,
    hRatio: 0.035,
    text: todayString(),
  };
  placements.push(placement);
  redrawOverlay();
}

function redrawOverlay() {
  overlay.innerHTML = '';
  placements
    .filter((p) => p.page === currentPage)
    .forEach((placement) => {
      const el = document.createElement('div');
      el.className = placement.type === 'signature' ? 'sig-placement' : 'date-placement';
      applyPlacementStyle(el, placement);

      let textInput: HTMLInputElement | null = null;
      if (placement.type === 'signature') {
        if (!signatureImgEl) return;
        el.style.backgroundImage = `url(${signatureImgEl.src})`;
      } else {
        textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'date-input';
        textInput.value = placement.text;
        textInput.style.fontSize = `${placement.hRatio * overlay.clientHeight * 0.7}px`;
        textInput.addEventListener('input', () => {
          placement.text = textInput!.value;
        });
        textInput.addEventListener('mousedown', (ev) => ev.stopPropagation());
        el.appendChild(textInput);
      }

      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      el.appendChild(handle);

      const removeBtn = document.createElement('div');
      removeBtn.className = 'remove-handle';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('mousedown', (ev) => ev.stopPropagation());
      removeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        placements = placements.filter((p) => p !== placement);
        redrawOverlay();
      });
      el.appendChild(removeBtn);

      el.addEventListener('mousedown', (ev) => {
        if (ev.target === handle || ev.target === textInput) return;
        ev.preventDefault();
        const rect = overlay.getBoundingClientRect();
        dragState = {
          el,
          placement,
          offsetX: ev.clientX - rect.left - placement.xRatio * overlay.clientWidth,
          offsetY: ev.clientY - rect.top - placement.yRatio * overlay.clientHeight,
        };
      });

      handle.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        resizeState = {
          el,
          placement,
          startX: ev.clientX,
          startY: ev.clientY,
          startW: placement.wRatio * overlay.clientWidth,
          startH: placement.hRatio * overlay.clientHeight,
        };
      });

      overlay.appendChild(el);
    });
}

function applyPlacementStyle(el: HTMLElement, placement: Placement) {
  el.style.left = `${placement.xRatio * overlay.clientWidth}px`;
  el.style.top = `${placement.yRatio * overlay.clientHeight}px`;
  el.style.width = `${placement.wRatio * overlay.clientWidth}px`;
  el.style.height = `${placement.hRatio * overlay.clientHeight}px`;
  if (placement.type === 'date') {
    const input = el.querySelector<HTMLInputElement>('.date-input');
    if (input) input.style.fontSize = `${placement.hRatio * overlay.clientHeight * 0.7}px`;
  }
}

window.addEventListener('mousemove', (ev) => {
  if (dragState) {
    const rect = overlay.getBoundingClientRect();
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    let x = (ev.clientX - rect.left - dragState.offsetX) / w;
    let y = (ev.clientY - rect.top - dragState.offsetY) / h;
    x = Math.min(Math.max(x, 0), 1 - dragState.placement.wRatio);
    y = Math.min(Math.max(y, 0), 1 - dragState.placement.hRatio);
    dragState.placement.xRatio = x;
    dragState.placement.yRatio = y;
    applyPlacementStyle(dragState.el, dragState.placement);
  } else if (resizeState) {
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    const dx = ev.clientX - resizeState.startX;
    const newW = Math.max(20, resizeState.startW + dx);
    let newH: number;
    if (resizeState.placement.type === 'signature') {
      newH = newW / signatureAspect;
    } else {
      const dy = ev.clientY - resizeState.startY;
      newH = Math.max(12, resizeState.startH + dy);
    }
    resizeState.placement.wRatio = Math.min(newW / w, 1 - resizeState.placement.xRatio);
    resizeState.placement.hRatio = Math.min(newH / h, 1 - resizeState.placement.yRatio);
    applyPlacementStyle(resizeState.el, resizeState.placement);
  }
});

window.addEventListener('mouseup', () => {
  dragState = null;
  resizeState = null;
});

async function exportSignedPdf() {
  if (!pdfBytes) return;
  if (placements.length === 0) {
    alert('Add at least one signature or date placement before exporting.');
    return;
  }

  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pngImage = signaturePngBytes ? await doc.embedPng(signaturePngBytes) : null;

  for (const placement of placements) {
    const page = pages[placement.page];
    const { width, height } = page.getSize();
    const boxWidth = placement.wRatio * width;
    const boxHeight = placement.hRatio * height;
    const x = placement.xRatio * width;
    const y = height - placement.yRatio * height - boxHeight; // flip y-axis

    if (placement.type === 'signature') {
      if (!pngImage) continue;
      page.drawImage(pngImage, { x, y, width: boxWidth, height: boxHeight });
    } else {
      const fontSize = boxHeight * 0.7;
      page.drawText(placement.text, {
        x,
        y: y + boxHeight * 0.15,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  const signedBytes = await doc.save();
  const blob = new Blob([signedBytes.slice()], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'signed.pdf';
  a.click();
  URL.revokeObjectURL(url);
}
