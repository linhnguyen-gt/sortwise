import { getItemByBarcode } from "./core/item-catalog.js";

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];
const NO_BARCODE = "No barcode was found.";
const BARCODE_UNAVAILABLE = "Barcode scanning is unavailable in this browser.";

async function readBarcode(bitmap) {
  const Detector = globalThis.BarcodeDetector;
  if (typeof Detector !== "function") return { barcode: null, barcodeHint: BARCODE_UNAVAILABLE };
  try {
    const supported = typeof Detector.getSupportedFormats === "function" ? await Detector.getSupportedFormats() : null;
    const formats = supported ? BARCODE_FORMATS.filter(format => supported.includes(format)) : BARCODE_FORMATS;
    if (!formats.length) return { barcode: null, barcodeHint: BARCODE_UNAVAILABLE };

    const hits = await new Detector({ formats }).detect(bitmap);
    const codes = hits.map(hit => hit.rawValue).filter(code => typeof code === "string" && code.trim());
    const barcode = codes.find(code => getItemByBarcode(code)) ?? codes[0] ?? null;
    return { barcode, barcodeHint: barcode ? "" : NO_BARCODE };
  } catch {
    return { barcode: null, barcodeHint: BARCODE_UNAVAILABLE };
  }
}

function describeImage(bitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let rSum = 0, gSum = 0, bSum = 0, darkPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    rSum += r;
    gSum += g;
    bSum += b;
    if (r < 48 && g < 48 && b < 48) darkPixels++;
  }

  const total = canvas.width * canvas.height;
  const rAvg = Math.round(rSum / total);
  const gAvg = Math.round(gSum / total);
  const bAvg = Math.round(bSum / total);
  const darkRatio = darkPixels / total;
  if (darkRatio > 0.45) return "The photo is mostly dark. Verify the item's material and resin code.";
  if (rAvg > gAvg + 22 && gAvg > bAvg + 15) {
    return "The photo has warm tones. If the item is cardboard, check for grease or food residue.";
  }
  return "";
}

// A barcode can identify a catalog item. Color can only provide a visual cue.
export async function analyzeWasteImage(fileOrBlob) {
  if (!fileOrBlob) return { ok: false, reason: "Select an image file first.", field: "image" };
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return { ok: false, reason: "Photo analysis is unavailable. Describe the item to check a bin.", field: "image" };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(fileOrBlob);
  } catch {
    return { ok: false, reason: "Could not decode this image. Describe the item to check a bin.", field: "image" };
  }

  try {
    const { width, height } = bitmap;
    const scan = await readBarcode(bitmap);
    let visualHint = "";
    if (!getItemByBarcode(scan.barcode)) {
      try {
        visualHint = describeImage(bitmap);
      } catch {
        // Canvas failure leaves the barcode result usable.
      }
    }
    return { ok: true, width, height, ...scan, visualHint };
  } finally {
    bitmap.close?.();
  }
}
