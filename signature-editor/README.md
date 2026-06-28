# PDF Signature Editor

A fully client-side PDF signing tool: open a PDF, drop in a transparent-background
PNG signature, drag/resize it onto any page, and download the signed PDF.

Everything runs in the browser — the PDF and signature image are never uploaded
anywhere. After `npm run build`, the contents of `dist/` are a static site that
can be opened or served completely offline.

## Develop

```sh
npm install
npm run dev
```

## Build a standalone static bundle

```sh
npm run build
npm run preview   # serve dist/ locally to verify
```
