import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSource from 'pdfjs-dist/build/pdf.worker.mjs?raw';
import { PDFDocument, PDFCheckBox, PDFDropdown, PDFTextField, StandardFonts, rgb } from 'pdf-lib';
import './style.css';

const workerBlobUrl = URL.createObjectURL(
  new Blob([pdfWorkerSource], { type: 'application/javascript' }),
);
pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;

// ── Types ────────────────────────────────────────────────────────────────────

interface BasePlacement {
  page: number;
  xRatio: number; // left / canvas width
  yRatio: number; // top / canvas height
  wRatio: number;
  hRatio: number;
}
interface SignaturePlacement  extends BasePlacement { type: 'signature' }
interface TextPlacement      extends BasePlacement { type: 'date' | 'textbox'; text: string }
interface RedactPlacement    extends BasePlacement { type: 'redact' }
type Placement = SignaturePlacement | TextPlacement | RedactPlacement;

interface AcroField {
  name: string;
  fieldType: 'text' | 'checkbox' | 'dropdown';
  page: number;
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
  value: string;
  options: string[]; // for dropdown
}

// ── State ────────────────────────────────────────────────────────────────────

let pdfBytes: ArrayBuffer | null = null;
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
let signaturePngBytes: ArrayBuffer | null = null;
let signatureImgEl: HTMLImageElement | null = null;
let signatureAspect = 1;
let currentPage = 0;
let placements: Placement[] = [];
let acroFields: AcroField[] = [];
let dragState: { el: HTMLElement; placement: Placement; offsetX: number; offsetY: number } | null = null;
let resizeState: { el: HTMLElement; placement: Placement; startX: number; startY: number; startW: number; startH: number } | null = null;
let redactMode = false;
let redactDraw: { startX: number; startY: number; el: HTMLElement; placement: RedactPlacement } | null = null;

// ── Shell ────────────────────────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="container">
    <h1>PDF Editor</h1>
    <p class="note">Everything happens locally in your browser. No file ever leaves your machine.</p>
    <div class="toolbar">
      <label class="file-btn">Open PDF<input id="pdf-input" type="file" accept="application/pdf" hidden /></label>
      <label class="file-btn">Load Signature (PNG)<input id="png-input" type="file" accept="image/png" hidden /></label>
      <span class="toolbar-sep"></span>
      <button id="add-signature" disabled>Add Signature</button>
      <button id="add-date"      disabled>Add Date</button>
      <button id="add-textbox"   disabled>Add Text Box</button>
      <button id="toggle-redact" disabled>Redact</button>
      <span class="spacer"></span>
      <button id="prev-page" disabled>&larr; Prev</button>
      <span id="page-indicator">No PDF loaded</span>
      <button id="next-page" disabled>Next &rarr;</button>
      <span class="spacer"></span>
      <button id="export-pdf" disabled>Download PDF</button>
    </div>
    <div id="form-banner" class="form-banner hidden"></div>
    <div id="viewer-wrap">
      <div id="viewer">
        <canvas id="pdf-canvas"></canvas>
        <div id="overlay"></div>
      </div>
    </div>
  </div>
`;

const pdfInput      = document.querySelector<HTMLInputElement>('#pdf-input')!;
const pngInput      = document.querySelector<HTMLInputElement>('#png-input')!;
const addSigBtn      = document.querySelector<HTMLButtonElement>('#add-signature')!;
const addDateBtn     = document.querySelector<HTMLButtonElement>('#add-date')!;
const addTextboxBtn  = document.querySelector<HTMLButtonElement>('#add-textbox')!;
const toggleRedactBtn = document.querySelector<HTMLButtonElement>('#toggle-redact')!;
const prevPageBtn   = document.querySelector<HTMLButtonElement>('#prev-page')!;
const nextPageBtn   = document.querySelector<HTMLButtonElement>('#next-page')!;
const pageIndicator = document.querySelector<HTMLSpanElement>('#page-indicator')!;
const exportBtn     = document.querySelector<HTMLButtonElement>('#export-pdf')!;
const canvas        = document.querySelector<HTMLCanvasElement>('#pdf-canvas')!;
const overlay       = document.querySelector<HTMLDivElement>('#overlay')!;
const formBanner    = document.querySelector<HTMLDivElement>('#form-banner')!;

pdfInput.addEventListener('change', onPdfSelected);
pngInput.addEventListener('change', onPngSelected);
addSigBtn.addEventListener('click', addSignaturePlacement);
addDateBtn.addEventListener('click', addDatePlacement);
addTextboxBtn.addEventListener('click', addTextboxPlacement);
toggleRedactBtn.addEventListener('click', toggleRedactMode);
prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
exportBtn.addEventListener('click', exportSignedPdf);

// ── PDF loading ──────────────────────────────────────────────────────────────

async function onPdfSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  pdfBytes    = await file.arrayBuffer();
  pdfDoc      = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
  placements  = [];
  acroFields  = await detectAcroFields(pdfBytes);
  currentPage = 0;
  prevPageBtn.disabled   = false;
  nextPageBtn.disabled   = false;
  exportBtn.disabled     = false;
  addDateBtn.disabled     = false;
  addTextboxBtn.disabled  = false;
  toggleRedactBtn.disabled = false;
  addSigBtn.disabled      = !signatureImgEl;
  updateFormBanner();
  await renderPage(currentPage);
}

async function onPngSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  signaturePngBytes = await file.arrayBuffer();
  const blob = new Blob([signaturePngBytes], { type: 'image/png' });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = url; });
  signatureImgEl  = img;
  signatureAspect = img.naturalWidth / img.naturalHeight;
  addSigBtn.disabled = !pdfDoc;
}

// ── AcroForm detection ───────────────────────────────────────────────────────

async function detectAcroFields(bytes: ArrayBuffer): Promise<AcroField[]> {
  const fields: AcroField[] = [];
  try {
    const doc   = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form  = doc.getForm();
    const pages = doc.getPages();

    for (const field of form.getFields()) {
      const widgets = field.acroField.getWidgets();
      for (const widget of widgets) {
        const pageRef = widget.P();
        if (!pageRef) continue;
        const pageIdx = pages.findIndex(
          (p) => p.ref.objectNumber === (pageRef as { objectNumber: number }).objectNumber,
        );
        if (pageIdx < 0) continue;
        const rect             = widget.getRectangle();
        const { width, height } = pages[pageIdx].getSize();

        let fieldType: AcroField['fieldType'] = 'text';
        let options: string[] = [];
        if (field instanceof PDFCheckBox) {
          fieldType = 'checkbox';
        } else if (field instanceof PDFDropdown) {
          fieldType = 'dropdown';
          options   = field.getOptions();
        }

        fields.push({
          name: field.getName(),
          fieldType,
          page:    pageIdx,
          xRatio:  rect.x / width,
          yRatio:  (height - rect.y - rect.height) / height,
          wRatio:  rect.width  / width,
          hRatio:  rect.height / height,
          value:   '',
          options,
        });
      }
    }
  } catch (_) {
    // PDF has no form or is encrypted — silently skip
  }
  return fields;
}

function updateFormBanner() {
  if (acroFields.length === 0) {
    formBanner.classList.add('hidden');
    return;
  }
  formBanner.classList.remove('hidden');
  formBanner.textContent =
    `This PDF has ${acroFields.length} form field${acroFields.length === 1 ? '' : 's'} — click them on the page to fill them in.`;
}

// ── Rendering ────────────────────────────────────────────────────────────────

async function renderPage(pageNum: number) {
  if (!pdfDoc) return;
  const page     = await pdfDoc.getPage(pageNum + 1);
  const viewport = page.getViewport({ scale: 1.5 });
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  overlay.style.width  = `${viewport.width}px`;
  overlay.style.height = `${viewport.height}px`;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  pageIndicator.textContent = `Page ${pageNum + 1} / ${pdfDoc.numPages}`;
  redrawOverlay();
}

function goToPage(pageNum: number) {
  if (!pdfDoc || pageNum < 0 || pageNum >= pdfDoc.numPages) return;
  currentPage = pageNum;
  renderPage(currentPage);
}

// ── Overlay rendering ────────────────────────────────────────────────────────

function redrawOverlay() {
  overlay.innerHTML = '';
  renderAcroFields();
  renderPlacements();
}

function renderAcroFields() {
  acroFields
    .filter((f) => f.page === currentPage)
    .forEach((field) => {
      const el = document.createElement('div');
      el.className = 'acro-field';
      el.style.left   = `${field.xRatio * overlay.clientWidth}px`;
      el.style.top    = `${field.yRatio * overlay.clientHeight}px`;
      el.style.width  = `${field.wRatio * overlay.clientWidth}px`;
      el.style.height = `${field.hRatio * overlay.clientHeight}px`;

      const fontSize = `${Math.min(field.hRatio * overlay.clientHeight * 0.65, 13)}px`;

      if (field.fieldType === 'checkbox') {
        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = field.value === 'true';
        cb.className = 'acro-checkbox';
        cb.addEventListener('change', () => { field.value = cb.checked ? 'true' : 'false'; });
        el.appendChild(cb);
      } else if (field.fieldType === 'dropdown') {
        const sel = document.createElement('select');
        sel.className = 'acro-select';
        sel.style.fontSize = fontSize;
        field.options.forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt;
          if (opt === field.value) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => { field.value = sel.value; });
        el.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type      = 'text';
        inp.className = 'acro-text';
        inp.value     = field.value;
        inp.placeholder = field.name;
        inp.style.fontSize = fontSize;
        inp.addEventListener('input', () => { field.value = inp.value; });
        el.appendChild(inp);
      }

      overlay.appendChild(el);
    });
}

function renderPlacements() {
  placements
    .filter((p) => p.page === currentPage)
    .forEach((placement) => {
      if (placement.type === 'redact') {
        const el = document.createElement('div');
        el.className = 'redact-placement';
        applyPlacementStyle(el, placement);
        const removeBtn = document.createElement('div');
        removeBtn.className   = 'remove-handle';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('mousedown', (ev) => ev.stopPropagation());
        removeBtn.addEventListener('click', () => {
          placements = placements.filter((p) => p !== placement);
          redrawOverlay();
        });
        el.appendChild(removeBtn);
        overlay.appendChild(el);
        return;
      }

      const isSig = placement.type === 'signature';

      const el = document.createElement('div');
      el.className = isSig ? 'sig-placement' : 'text-placement';
      if (placement.type === 'date')    el.classList.add('placement-date');
      if (placement.type === 'textbox') el.classList.add('placement-textbox');
      applyPlacementStyle(el, placement);

      let textInput: HTMLInputElement | null = null;

      if (isSig) {
        if (!signatureImgEl) return;
        el.style.backgroundImage = `url(${signatureImgEl.src})`;
      } else {
        const p = placement as TextPlacement;
        textInput = document.createElement('input');
        textInput.type        = 'text';
        textInput.className   = 'placement-text-input';
        textInput.value       = p.text;
        textInput.style.fontSize = `${p.hRatio * overlay.clientHeight * 0.7}px`;
        textInput.addEventListener('input', () => { p.text = textInput!.value; });
        textInput.addEventListener('mousedown', (ev) => ev.stopPropagation());
        el.appendChild(textInput);
      }

      // Resize handle
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      el.appendChild(handle);

      // Remove button
      const removeBtn = document.createElement('div');
      removeBtn.className   = 'remove-handle';
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
          el, placement,
          offsetX: ev.clientX - rect.left - placement.xRatio * overlay.clientWidth,
          offsetY: ev.clientY - rect.top  - placement.yRatio * overlay.clientHeight,
        };
      });

      handle.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        resizeState = {
          el, placement,
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
  el.style.left   = `${placement.xRatio * overlay.clientWidth}px`;
  el.style.top    = `${placement.yRatio * overlay.clientHeight}px`;
  el.style.width  = `${placement.wRatio * overlay.clientWidth}px`;
  el.style.height = `${placement.hRatio * overlay.clientHeight}px`;
  const inp = el.querySelector<HTMLInputElement>('.placement-text-input');
  if (inp) inp.style.fontSize = `${placement.hRatio * overlay.clientHeight * 0.7}px`;
}

// ── Drag & resize ────────────────────────────────────────────────────────────

window.addEventListener('mousemove', (ev) => {
  if (redactDraw) {
    const rect   = overlay.getBoundingClientRect();
    const curX   = ev.clientX - rect.left;
    const curY   = ev.clientY - rect.top;
    const x      = Math.min(curX, redactDraw.startX);
    const y      = Math.min(curY, redactDraw.startY);
    const w      = Math.abs(curX - redactDraw.startX);
    const h      = Math.abs(curY - redactDraw.startY);
    redactDraw.el.style.left   = `${x}px`;
    redactDraw.el.style.top    = `${y}px`;
    redactDraw.el.style.width  = `${w}px`;
    redactDraw.el.style.height = `${h}px`;
    return;
  }
  if (dragState) {
    const rect = overlay.getBoundingClientRect();
    const w = overlay.clientWidth, h = overlay.clientHeight;
    let x = (ev.clientX - rect.left - dragState.offsetX) / w;
    let y = (ev.clientY - rect.top  - dragState.offsetY) / h;
    x = Math.min(Math.max(x, 0), 1 - dragState.placement.wRatio);
    y = Math.min(Math.max(y, 0), 1 - dragState.placement.hRatio);
    dragState.placement.xRatio = x;
    dragState.placement.yRatio = y;
    applyPlacementStyle(dragState.el, dragState.placement);
  } else if (resizeState) {
    const w = overlay.clientWidth, h = overlay.clientHeight;
    const dx   = ev.clientX - resizeState.startX;
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
  if (redactDraw) {
    const p = redactDraw.placement;
    const w = overlay.clientWidth, h = overlay.clientHeight;
    p.xRatio = parseFloat(redactDraw.el.style.left)   / w;
    p.yRatio = parseFloat(redactDraw.el.style.top)    / h;
    p.wRatio = parseFloat(redactDraw.el.style.width)  / w;
    p.hRatio = parseFloat(redactDraw.el.style.height) / h;
    if (p.wRatio > 0.005 && p.hRatio > 0.005) placements.push(p);
    redactDraw = null;
    redrawOverlay();
  }
  dragState   = null;
  resizeState = null;
});

// ── Redact mode ───────────────────────────────────────────────────────────────

function toggleRedactMode() {
  redactMode = !redactMode;
  toggleRedactBtn.classList.toggle('active', redactMode);
  overlay.style.cursor = redactMode ? 'crosshair' : '';
}

// Start drawing a redaction rectangle
overlay.addEventListener('mousedown', (ev) => {
  if (!redactMode) return;
  if ((ev.target as HTMLElement).closest('.redact-placement')) return; // clicking existing one
  ev.preventDefault();
  const rect = overlay.getBoundingClientRect();
  const startX = ev.clientX - rect.left;
  const startY = ev.clientY - rect.top;

  const placement: RedactPlacement = {
    type: 'redact',
    page: currentPage,
    xRatio: startX / overlay.clientWidth,
    yRatio: startY / overlay.clientHeight,
    wRatio: 0,
    hRatio: 0,
  };

  const el = document.createElement('div');
  el.className = 'redact-placement redact-drawing';
  el.style.left   = `${startX}px`;
  el.style.top    = `${startY}px`;
  el.style.width  = '0px';
  el.style.height = '0px';
  overlay.appendChild(el);

  redactDraw = { startX, startY, el, placement };
});

// ── Placement factories ───────────────────────────────────────────────────────

function addSignaturePlacement() {
  if (!signatureImgEl) return;
  const wRatio = 0.25;
  const hRatio = (wRatio * canvas.width) / signatureAspect / canvas.height;
  placements.push({ type: 'signature', page: currentPage, xRatio: 0.35, yRatio: 0.45, wRatio, hRatio });
  redrawOverlay();
}

function todayString() {
  const d     = new Date();
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function addDatePlacement() {
  placements.push({ type: 'date', page: currentPage, xRatio: 0.35, yRatio: 0.55, wRatio: 0.18, hRatio: 0.035, text: todayString() });
  redrawOverlay();
}

function addTextboxPlacement() {
  placements.push({ type: 'textbox', page: currentPage, xRatio: 0.1, yRatio: 0.4, wRatio: 0.4, hRatio: 0.05, text: '' });
  redrawOverlay();
}

// ── Export ───────────────────────────────────────────────────────────────────

async function exportSignedPdf() {
  if (!pdfBytes) return;
  if (placements.length === 0 && acroFields.every((f) => f.value === '')) {
    alert('Nothing to export — add a signature, text, redaction, or fill in a form field first.');
    return;
  }

  const doc   = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const font  = await doc.embedFont(StandardFonts.Helvetica);
  const pngImage = signaturePngBytes ? await doc.embedPng(signaturePngBytes) : null;

  // Fill AcroForm fields
  if (acroFields.length > 0) {
    try {
      const form = doc.getForm();
      for (const field of acroFields) {
        if (!field.value) continue;
        try {
          if (field.fieldType === 'text') {
            const tf = form.getField(field.name) as PDFTextField;
            tf.setFontSize(10); // prevent auto-size from picking something too large
            tf.setText(field.value);
          } else if (field.fieldType === 'checkbox') {
            const cb = form.getField(field.name) as PDFCheckBox;
            field.value === 'true' ? cb.check() : cb.uncheck();
          } else if (field.fieldType === 'dropdown') {
            (form.getField(field.name) as PDFDropdown).select(field.value);
          }
        } catch (_) { /* skip individual field errors */ }
      }
      form.flatten();
    } catch (_) { /* form may be uneditable */ }
  }

  // Draw placed elements
  for (const placement of placements) {
    const page = pages[placement.page];
    const { width, height } = page.getSize();
    const bw = placement.wRatio * width;
    const bh = placement.hRatio * height;
    const x  = placement.xRatio * width;
    const y  = height - placement.yRatio * height - bh; // flip y

    if (placement.type === 'redact') {
      page.drawRectangle({ x, y, width: bw, height: bh, color: rgb(0, 0, 0), borderWidth: 0 });
    } else if (placement.type === 'signature') {
      if (!pngImage) continue;
      page.drawImage(pngImage, { x, y, width: bw, height: bh });
    } else {
      const p        = placement as TextPlacement;
      const fontSize = bh * 0.7;
      page.drawText(p.text || '', { x, y: y + bh * 0.15, size: Math.max(1, fontSize), font, color: rgb(0, 0, 0) });
    }
  }

  const signedBytes = await doc.save();
  const blob = new Blob([signedBytes.slice()], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'edited.pdf'; a.click();
  URL.revokeObjectURL(url);
}
