# PDF Signature Editor

A fully client-side PDF signing tool: open a PDF, drop in a transparent-background
PNG signature, drag/resize it onto any page, and download the signed PDF.

Everything runs in the browser — the PDF and signature image are never uploaded
anywhere.

## Just use it

Download `pdf-signature-editor.html` from this folder and double-click it (or
drag it into a browser tab). It is a single self-contained HTML file — no
server, no install, works fully offline.

## Develop

```sh
npm install
npm run dev
```

## Rebuild the standalone HTML file

```sh
npm run build
cp dist/index.html pdf-signature-editor.html
```
