import { triageWasteItem } from "./triage-engine.js";
import { summarizeAuditImpact } from "./impact-calculator.js";

export const SAMPLE_BIN_AUDIT = [
  { itemId: "pizza-box", observedBin: "recycle", modifiers: ["greasy"] },
  { itemId: "coffee-cup-sleeve", observedBin: "recycle" },
  { itemId: "yogurt-tub-foil", observedBin: "recycle", modifiers: ["food-residue"] },
  { itemId: "tetra-pak-carton", observedBin: "trash" },
  { itemId: "pet-water-bottle", observedBin: "recycle" },
  { itemId: "black-takeout-tray", observedBin: "recycle" },
  { itemId: "plastic-grocery-bag", observedBin: "recycle" },
  { itemId: "lithium-battery", observedBin: "recycle" },
  { itemId: "aluminum-soda-can", observedBin: "recycle" },
  { itemId: "banana-peel", observedBin: "compost" },
  { itemId: "glass-pasta-jar", observedBin: "recycle" },
  { itemId: "compostable-pla-cup", observedBin: "compost" },
];

const BINS = new Set(["recycle", "compost", "trash", "dropoff"]);

function makeEntryId() {
  return [...globalThis.crypto.getRandomValues(new Uint32Array(4))]
    .map(word => word.toString(16).padStart(8, "0")).join("");
}

export function createAuditEntry(triageResult, observedBin) {
  if (!triageResult?.ok || !triageResult.matched) {
    throw new TypeError("A matched triage result is required to create an audit entry.");
  }
  if (!BINS.has(observedBin)) throw new RangeError("Unknown observed bin.");
  const { itemId, itemName, primaryBin, baseWeightKg, epaMaterialKey, contaminationRisk, hazardLevel,
    splitRequired, prepSteps } = triageResult;
  return {
    id: makeEntryId(), itemId, itemName, observedBin, recommendedBin: primaryBin, primaryBin,
    baseWeightKg, epaMaterialKey, contaminationRisk, hazardLevel, splitRequired, prepFix: prepSteps.join(" "),
  };
}

export function buildSampleAudit(cityId = "san-francisco", customRulepack = null) {
  const entries = [];
  for (const { observedBin, ...item } of SAMPLE_BIN_AUDIT) {
    const triage = triageWasteItem({ ...item, cityId, customRulepack });
    if (!triage.ok) throw new RangeError(triage.reason, { cause: triage });
    entries.push(createAuditEntry(triage, observedBin));
  }
  return entries;
}

const ENTRY_COLUMNS = [
  "id", "itemId", "itemName", "observedBin", "recommendedBin", "primaryBin", "baseWeightKg",
  "epaMaterialKey", "contaminationRisk", "hazardLevel", "splitRequired", "prepFix",
];

function csvCell(value) {
  const string = value == null ? "" : String(value);
  const neutralized = /^\s*[=+@\-\t\r\n]/u.test(string.normalize("NFKC")) ? `'${string}` : string;
  return /[",\r\n\t]/u.test(neutralized) ? `"${neutralized.replaceAll('"', '""')}"` : neutralized;
}

export function exportAuditCsv(entries, summary = summarizeAuditImpact(entries)) {
  const summaryRows = Object.entries(summary).map(([metric, value]) =>
    [metric, Array.isArray(value) ? JSON.stringify(value) : value]);
  const rows = [ENTRY_COLUMNS, ...entries.map(entry => ENTRY_COLUMNS.map(key => entry[key])),
    [], ["metric", "value"], ...summaryRows];
  return rows.map(row => ENTRY_COLUMNS.map((_, index) => csvCell(row[index])).join(",")).join("\r\n") + "\r\n";
}

export function exportAuditJson(entries, summary = summarizeAuditImpact(entries)) {
  return JSON.stringify({ entries, summary }, null, 2);
}
