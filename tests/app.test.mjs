import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SortWiseApp } from "../app.js";
import { analyzeWasteImage } from "../vision-scanner.js";
import { parseSortSpeech, SortVoiceController } from "../voice-controls.js";
import { exportAuditCsv } from "../core/audit-ledger.js";
import { getCity } from "../core/city-rules.js";

function useGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
}

class Element {
  children = [];
  events = {};
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  replaceChildren() { this.children = []; }
  addEventListener(type, callback) { this.events[type] = callback; }
  querySelector() { return this.children.find(child => child.value === "__custom__"); }
}

function useDocument(t, selectors, createElement = () => new Element()) {
  const elements = Object.fromEntries(selectors.map(selector => [selector, new Element()]));
  useGlobal(t, "document", {
    querySelector: selector => elements[selector],
    querySelectorAll: () => [],
    createElement,
  });
  return elements;
}

const makeRulepack = () => ({ ...getCity("san-francisco"), id: "office-hub", name: "Office Zero Waste" });

test("SortWiseApp renders the unknown fallback and disables audit logging", t => {
  const ui = useDocument(t, ["#triage-result", "#btn-log-recycle"]);
  const app = new SortWiseApp();
  app.runTriage({ query: "soda can" });
  assert.equal(ui["#btn-log-recycle"].disabled, false);
  const res = app.runTriage({ query: "mystery unicorn plasma widget" });
  assert.deepEqual([res.ok, res.matched, res.primaryBin], [true, false, "trash"]);
  assert.match(ui["#triage-result"].children[0].children[0].textContent, /unrecognized item.*trash/i);
  assert.equal(ui["#btn-log-recycle"].disabled, true);
  assert.equal(app.logCurrentItem("recycle").ok, false);
});

test("SortWiseApp resolves composite splits, city switches, and custom rulepack", () => {
  const app = new SortWiseApp();
  const sf = app.runTriage({ query: "greasy pizza box" });
  assert.deepEqual([sf.matched, sf.splitRequired, sf.parts[1].bin], [true, true, "compost"]);

  const hcmc = app.setCity("ho-chi-minh");
  assert.equal(hcmc.ok, true);
  assert.equal(app.lastTriage.parts[1].bin, "trash");

  assert.equal(app.importCustomRulepack(JSON.stringify(makeRulepack())).ok, true);
  assert.equal(app.activeRulepack().id, "office-hub");
});

test("city and chip changes preserve query modifiers and the selected resin", () => {
  const app = new SortWiseApp();
  app.runTriage({ query: "cracked wine bottle" });
  app.setCity("london");
  assert.equal(app.lastTriage.primaryBin, "trash");
  app.runTriage({ query: "coffee cup with sleeve #6" });
  app.toggleModifier("wet");
  assert.equal(app.lastTriage.parts[2].resinCode, 6);
  app.runTriage({ query: "wine bottle", modifiers: [] });
  app.toggleModifier("broken");
  assert.equal(app.lastTriage.primaryBin, "trash");
});

test("custom rulepack survives reload and can be reselected after switching cities", t => {
  const ui = useDocument(t, ["#city-select", "#city-rule-summary"]);
  let saved;
  useGlobal(t, "localStorage", { getItem: () => saved, setItem: (_, value) => { saved = value; } });
  const original = new SortWiseApp();
  original.importCustomRulepack(JSON.stringify(makeRulepack()));
  const restored = new SortWiseApp();
  const select = ui["#city-select"];
  assert.equal(select.value, "__custom__");
  assert.equal(select.querySelector().textContent, "Office Zero Waste (Custom)");
  restored.setCity("london");
  assert.equal(new SortWiseApp().activeRulepack().id, "london");
  assert.equal(restored.setCity("__custom__").ok, true);
  assert.equal(restored.activeRulepack().id, "office-hub");
});

test("invalid persisted rulepacks and audit rows cannot break startup", t => {
  useDocument(t, ["#city-select", "#city-rule-summary"]);
  const appWithEntry = new SortWiseApp();
  appWithEntry.runTriage({ query: "soda can" });
  const { entry } = appWithEntry.logCurrentItem("trash");
  const { prepFix, ...legacy } = entry;
  const saved = JSON.stringify({ customRulepack: {}, entries: [null, { ...legacy, prepSteps: "Rinse" }] });
  useGlobal(t, "localStorage", { getItem: () => saved });
  const app = new SortWiseApp();
  assert.equal(app.activeRulepack().id, "san-francisco");
  assert.equal(app.getSummary().totalItems, 1);
});

test("custom rulepack labels render literally and unrecognized properties are discarded", t => {
  const ui = useDocument(t, ["#city-select", "#city-rule-summary", "#triage-result"]);
  const app = new SortWiseApp();
  const raw = { ...makeRulepack(), name: "<b>Campus</b>", ["__proto__"]: { marker: true } };
  raw.bins = { ...raw.bins, recycle: "<b>Blue</b>", constructor: { marker: true } };
  const { rulepack } = app.importCustomRulepack(JSON.stringify(raw));
  assert.equal(Object.hasOwn(rulepack, "__proto__"), false);
  assert.equal(Object.hasOwn(rulepack.bins, "constructor"), false);
  assert.equal({}.marker, undefined);
  assert.equal(ui["#city-select"].querySelector().textContent, "<b>Campus</b> (Custom)");
  app.runTriage({ query: "soda can" });
  assert.match(ui["#triage-result"].children[0].children[0].textContent, /<b>Blue<\/b>/);
});

test("SortWiseApp loads sample audit, logs items, and exports formula-safe CSV", () => {
  const app = new SortWiseApp();
  const sample = app.loadSampleAudit();
  assert.deepEqual([sample.ok, sample.summary.totalItems], [true, 12]);
  assert.ok(sample.summary.contaminationRatePct > 0);
  assert.ok(sample.summary.avoidedCo2eKg > 0);

  const triage = app.runTriage({ barcode: "049000042566" });
  assert.equal(triage.itemId, "aluminum-soda-can");
  const logged = app.logCurrentItem("recycle");
  assert.equal(logged.ok, true);
  assert.equal(app.getSummary().totalItems, 13);
  assert.equal(app.loadSampleAudit().ok, false);
  assert.equal(app.entries[0].id, logged.entry.id);

  const csv = exportAuditCsv(app.entries, app.getSummary());
  assert.ok(csv.includes("aluminum-soda-can"));
  assert.ok(exportAuditCsv([{ ...logged.entry, itemName: "　＝1+1" }], app.getSummary()).includes("'　＝1+1"));
  app.clearAudit();
  assert.equal(app.getSummary().totalItems, 0);
});

test("audit rows and metrics agree on splits and allow logging drop-off by button", t => {
  const ui = useDocument(t, ["#city-select", "#audit-table-body", "#btn-log-dropoff"]);
  const app = new SortWiseApp();
  app.runTriage({ query: "greasy pizza box" });
  app.logCurrentItem("recycle");
  assert.equal(app.getSummary().correctlySortedCount, 0);
  assert.equal(ui["#audit-table-body"].children[0].children.at(-1).textContent, "Split required");
  app.runTriage({ query: "lithium battery" });
  ui["#btn-log-dropoff"].events.click();
  assert.equal(app.entries[0].observedBin, "dropoff");
});

test("the scanner restricts detector formats and prefers a catalog match without Canvas", async t => {
  useDocument(t, [], () => ({ getContext: () => null }));
  useGlobal(t, "createImageBitmap", async () => ({ width: 20, height: 20 }));
  useGlobal(t, "BarcodeDetector", class {
    static async getSupportedFormats() { return ["upc_a"]; }
    constructor({ formats }) { assert.deepEqual(formats, ["upc_a"]); }
    async detect() { return [{ rawValue: "000000000000" }, { rawValue: "049000042566" }]; }
  });
  const result = await analyzeWasteImage(new Blob());
  assert.equal(result.ok, true);
  assert.equal(result.barcode, "049000042566");
});

test("photo hints do not guess a bin and an older scan cannot overwrite a query", async t => {
  const pixels = new Uint8ClampedArray(64 * 64 * 4).fill(255);
  const ui = useDocument(t, ["#city-select", "#photo-scan-input", "#scan-hint", "#sortwise-status"]);
  const createElement = document.createElement;
  document.createElement = tag => tag === "canvas"
    ? { getContext: () => ({ drawImage() {}, getImageData: () => ({ data: pixels }) }) }
    : createElement(tag);
  useGlobal(t, "BarcodeDetector", undefined);
  useGlobal(t, "createImageBitmap", async () => ({ width: 20, height: 20 }));
  const app = new SortWiseApp();
  const scan = () => ui["#photo-scan-input"].events.change({ target: { files: [new Blob()] } });
  app.runTriage({ query: "soda can" });
  await scan();
  assert.equal(app.lastTriage, null);
  assert.equal(ui["#sortwise-status"].textContent, "");
  assert.match(ui["#scan-hint"].textContent, /describe the item/i);
  let barcode = "000000000000";
  globalThis.BarcodeDetector = class { async detect() { return [{ rawValue: barcode }]; } };
  await scan();
  assert.match(ui["#scan-hint"].textContent, /outside the sample catalog/i);
  assert.equal(app.lastTriage, null);
  barcode = "049000042566";
  const pending = scan();
  app.runTriage({ query: "banana peel" });
  await pending;
  assert.equal(app.lastTriage.itemId, "banana-peel");
});

test("skip navigation and the scrollable audit ledger are keyboard reachable", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<main[^>]*id="main-content"[^>]*tabindex="-1"/);
  assert.match(html, /class="table-wrap"[^>]*tabindex="0"/);
});

test("stopping dictation ignores late transcripts and waits for recognition to end", t => {
  const transcripts = [];
  let recognition;
  useGlobal(t, "window", { SpeechRecognition: class {
    constructor() { recognition = this; }
    start() {}
    abort() {}
  } });
  const voice = new SortVoiceController({ onTranscript: text => transcripts.push(text) });
  assert.equal(voice.toggleListening(), true);
  voice.stopListening();
  assert.equal(voice.toggleListening(), false);
  recognition.onresult({ results: [[{ transcript: "pizza box" }]] });
  assert.deepEqual(transcripts, []);
  recognition.onend();
  assert.equal(voice.toggleListening(), true);
});
test("parseSortSpeech classifies voice commands and triage queries", () => {
  assert.deepEqual(parseSortSpeech("stop speaking"), { type: "stop" });
  assert.deepEqual(parseSortSpeech("read result."), { type: "speak" });
  assert.deepEqual(parseSortSpeech("load sample audit"), { type: "audit_sample" });
  assert.deepEqual(parseSortSpeech("swollen lithium battery"), { type: "triage", query: "swollen lithium battery" });
});
