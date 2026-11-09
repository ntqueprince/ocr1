# Photo to PDF

A browser-based utility that combines one or more images into a PDF. Pick multiple images at once, drag and drop, or paste an image with Ctrl+V. Add more images later to append pages to the same PDF, then use Chrome's PDF viewer to print or download it.

## Image quality

JPEG and PNG images are embedded from their original file bytes. The app does not resize them, lower JPEG quality, or run OCR. Other browser-readable image formats (including WEBP, GIF, BMP, and TIFF where supported by the browser) are converted to PNG at their original pixel dimensions before embedding. Transparency is retained where supported. PDF pages use a consistent 150 pixels per inch, which affects the physical page size, not the image resolution.

Images are processed locally in the browser. The PDF generation library is loaded from jsDelivr; image contents are not sent to a server.

## Run locally

On Windows, double-click `start-ocr-preview.bat`, wait until it says `Serving HTTP`, then open `http://127.0.0.1:8000` in Chrome. Keep the command window open while using the app; press Ctrl+C in it to stop the server.

Or serve the project directory manually:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in a modern browser. An internet connection is needed to load the PDF generation library.
