import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

const $ = (id) => document.getElementById(id);
const state = { pages: [], pdfUrl: null, page: 1, zoom: 1, rotation: 0, busy: false };
const supportedImage = (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(f.name);

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 4500);
}
function status(message) { $("status").textContent = message; }
function progress(value, message) {
  $("progressWrap").classList.remove("hidden");
  $("progressBar").style.width = `${Math.max(0, Math.min(100, value))}%`;
  $("progressText").textContent = message;
}
function hideProgress() { $("progressWrap").classList.add("hidden"); }
function showWorkspace() {
  $("welcome").classList.add("hidden"); $("workspace").classList.remove("hidden");
  $("uploadMore").classList.remove("hidden");
}
function updatePageLabel() {
  $("pageLabel").textContent = `${state.pages.length} ${state.pages.length === 1 ? "image" : "images"}`;
}
function renderQueue() {
  const list = $("pageGallery");
  if (!list) return;
  list.replaceChildren();
  for (let i = 0; i < state.pages.length; i++) {
    const p = state.pages[i], row = document.createElement("article"), image = document.createElement("img"), details = document.createElement("div"), name = document.createElement("strong"), dimensions = document.createElement("span"), actions = document.createElement("div");
    row.className = "preview-page-row";
    image.className = "preview-page-image"; image.src = p.previewUrl; image.alt = p.name; image.loading = "lazy";
    image.style.transform = `rotate(${p.rotation || 0}deg)`;
    details.className = "preview-page-details";
    name.textContent = `${i + 1}. ${p.name}`;
    const swapped = (p.rotation || 0) % 180 !== 0;
    dimensions.textContent = `${(swapped ? p.height : p.width).toLocaleString()} × ${(swapped ? p.width : p.height).toLocaleString()} px`;
    details.append(name, dimensions);
    actions.className = "preview-page-actions";
    for (const direction of [{ angle: -90, label: "Rotate left" }, { angle: 90, label: "Rotate right" }]) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "tool"; button.textContent = direction.angle < 0 ? "↶" : "↷";
      button.title = `${direction.label}: ${p.name}`; button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => rotateImage(i, direction.angle));
      actions.append(button);
    }
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "tool image-delete"; remove.textContent = "×";
    remove.title = `Delete ${p.name}`; remove.setAttribute("aria-label", remove.title);
    remove.addEventListener("click", () => removeImage(i)); actions.append(remove);
    row.append(image, details, actions); list.append(row);
  }
  $("downloadPdf").disabled = !state.pdfUrl || state.busy;
  updatePageLabel();
}
function downloadCurrentPdf() {
  if (!state.pdfUrl || state.busy) return;
  const link = document.createElement("a");
  link.href = state.pdfUrl;
  link.download = `photos-${state.pages.length}-pages.pdf`;
  document.body.append(link); link.click(); link.remove();
}
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`)); reader.readAsDataURL(file);
  });
}
function getImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} is not a readable image`)); };
    img.src = url;
  });
}
async function imageFileToPage(file) {
  const mime = file.type.toLowerCase();
  // JPEG and PNG can be embedded directly from their original bytes. Other formats
  // are losslessly converted to PNG at their original pixel dimensions.
  if (mime === "image/jpeg" || mime === "image/png") {
    const img = await getImage(file);
    return { bytes: await file.arrayBuffer(), mime, width: img.naturalWidth, height: img.naturalHeight, name: file.name, previewUrl: URL.createObjectURL(file) };
  }
  const img = await getImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Could not prepare the image for PDF.");
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error(`Could not convert ${file.name}`)), "image/png"));
  return { bytes: await blob.arrayBuffer(), mime: "image/png", width: canvas.width, height: canvas.height, name: file.name, previewUrl: URL.createObjectURL(blob) };
}
async function buildPdf(pages) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pointsPerPixel = 72 / 150;
    const rotated = (p.rotation || 0) % 180 !== 0;
    const pageWidth = (rotated ? p.height : p.width) * pointsPerPixel;
    const pageHeight = (rotated ? p.width : p.height) * pointsPerPixel;
    const page = pdf.addPage([pageWidth, pageHeight]);
    const rotation = (p.rotation || 0) * Math.PI / 180;
    const image = p.mime === "image/jpeg" ? await pdf.embedJpg(p.bytes) : await pdf.embedPng(p.bytes);
    const imageWidth = p.width * pointsPerPixel, imageHeight = p.height * pointsPerPixel;
    const originX = pageWidth / 2 - (imageWidth * Math.cos(rotation) - imageHeight * Math.sin(rotation)) / 2;
    const originY = pageHeight / 2 - (imageWidth * Math.sin(rotation) + imageHeight * Math.cos(rotation)) / 2;
    page.drawImage(image, {
      x: originX, y: originY,
      width: p.width * pointsPerPixel, height: p.height * pointsPerPixel,
      rotate: { type: "degrees", angle: (p.rotation || 0) },
    });
    progress(80 + (i + 1) / pages.length * 18, `Building PDF… ${i + 1}/${pages.length}`);
  }
  return pdf.save({ useObjectStreams: true });
}
async function rotateImage(index, angle = 90) {
  const page = state.pages[index];
  if (!page || state.busy) return;
  page.rotation = ((page.rotation || 0) + angle + 360) % 360;
  state.page = index + 1; updatePageLabel();
  renderQueue(); state.busy = true; renderQueue();
  status(`Rotating ${page.name}…`); progress(0, "Updating PDF…");
  try {
    const bytes = await buildPdf(state.pages);
    const newUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const oldUrl = state.pdfUrl; state.pdfUrl = newUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    status(`${state.pages.length} page(s) ready`); progress(100, "Rotation updated");
  } catch (err) {
    page.rotation = (page.rotation - angle + 360) % 360;
    console.error(err); toast(`Could not rotate image: ${err.message || err}`); status("PDF update failed");
  } finally { state.busy = false; renderQueue(); setTimeout(hideProgress, 800); }
}
async function removeImage(index) {
  if (state.busy) { toast("Wait until the PDF update finishes."); return; }
  const [removed] = state.pages.splice(index, 1);
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  if (!state.pages.length) {
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = null; state.page = 1; updatePageLabel(); renderQueue();
    $("workspace").classList.add("hidden"); $("welcome").classList.remove("hidden"); $("uploadMore").classList.add("hidden");
    return;
  }
  state.page = Math.min(state.page, state.pages.length); renderQueue(); state.busy = true; renderQueue();
  status("Updating PDF after deleting image…"); progress(0, "Updating PDF…");
  try {
    const bytes = await buildPdf(state.pages), newUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), oldUrl = state.pdfUrl;
    state.pdfUrl = newUrl; if (oldUrl) URL.revokeObjectURL(oldUrl);
    status(`${state.pages.length} page(s) ready`); progress(100, "PDF updated");
  } catch (err) { console.error(err); toast(`Could not update PDF: ${err.message || err}`); }
  finally { state.busy = false; renderQueue(); setTimeout(hideProgress, 800); }
}
async function processFiles(fileList) {
  if (state.busy) { toast("Please wait until the current files finish processing."); return; }
  const files = [...fileList].filter(f => supportedImage(f));
  if (!files.length) { toast("Choose one or more image files to create a PDF."); return; }
  const invalid = [...fileList].filter(f => !supportedImage(f));
  if (invalid.length) toast(`Skipped non-image file(s): ${invalid.map(f => f.name).join(", ")}`);
  state.busy = true; showWorkspace(); $("emptyPreview").classList.remove("hidden");
  progress(0, "Preparing images…"); status("Preparing images…");
  try {
    const incoming = [];
    for (let i = 0; i < files.length; i++) {
      status(`Opening ${files[i].name}…`);
      incoming.push(await imageFileToPage(files[i]));
      progress((i + 1) / files.length * 70, `Preparing images… ${i + 1}/${files.length}`);
    }
    const priorCount = state.pages.length;
    state.pages.push(...incoming);
    state.page = priorCount + 1;
    renderQueue();
    status("Creating your PDF…");
    const bytes = await buildPdf(state.pages);
    const newUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = newUrl;
    $("emptyPreview").classList.add("hidden");
    state.zoom = 1; updatePageLabel();
    status(`${state.pages.length} page(s) ready`); progress(100, "PDF ready"); renderQueue();
    downloadCurrentPdf();
    setTimeout(hideProgress, 800);
  } catch (err) {
    console.error(err); status("Could not create PDF"); toast(err.message || "Could not create the PDF."); hideProgress();
  } finally { state.busy = false; $("fileInput").value = ""; renderQueue(); }
}
$("downloadPdf").addEventListener("click", () => {
  downloadCurrentPdf();
});
async function pasteClipboard() {
  try {
    if (!navigator.clipboard?.read) throw new Error("Clipboard image access is not available");
    const items = await navigator.clipboard.read(), files = [];
    for (const item of items) {
      for (const type of item.types.filter(t => t.startsWith("image/"))) {
        const ext = type.split("/")[1].replace("jpeg", "jpg");
        files.push(new File([await item.getType(type)], `pasted-image-${Date.now()}-${files.length + 1}.${ext}`, { type }));
      }
    }
    if (files.length) await processFiles(files);
    else toast("No image found in the clipboard. Copy an image first, then try Paste.");
  } catch { toast("Clipboard access was unavailable. Click this page and press Ctrl+V, or use Upload images."); }
}
document.addEventListener("paste", e => {
  const files = [...(e.clipboardData?.items || [])]
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); processFiles(files); }
});
$("pasteButton").addEventListener("click", pasteClipboard);
$("fileInput").addEventListener("change", e => processFiles(e.target.files));
$("uploadMore").addEventListener("click", () => $("fileInput").click());
$("dropzone").addEventListener("dragover", e => { e.preventDefault(); $("dropzone").classList.add("dragover"); });
$("dropzone").addEventListener("dragleave", () => $("dropzone").classList.remove("dragover"));
$("dropzone").addEventListener("drop", e => { e.preventDefault(); $("dropzone").classList.remove("dragover"); processFiles(e.dataTransfer.files); });
$("fullscreen").addEventListener("click", () => { const el = $("previewFrame"); if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.(); });
$("remove").addEventListener("click", () => {
  if (state.busy) { toast("Wait until processing finishes before clearing the PDF."); return; }
  state.pages.forEach(p => URL.revokeObjectURL(p.previewUrl));
  state.pages = []; if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl); state.pdfUrl = null;
  $("workspace").classList.add("hidden"); $("welcome").classList.remove("hidden");
  $("uploadMore").classList.add("hidden"); hideProgress(); status("Ready"); state.page = 1; state.zoom = 1; updatePageLabel();
  renderQueue();
});
window.addEventListener("beforeunload", () => { if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl); });
