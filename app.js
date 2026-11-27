// Main application controller for SortWise Contamination Firewall & Waste Impact Studio.
import { getCity, listCities, validateCustomRulepack } from "./core/city-rules.js";
import { getItemByBarcode } from "./core/item-catalog.js";
import { MODIFIER_IDS, detectModifiers, triageWasteItem } from "./core/triage-engine.js";
import { estimateItemImpact, summarizeAuditImpact } from "./core/impact-calculator.js";
import { buildSampleAudit, createAuditEntry, exportAuditCsv, exportAuditJson } from "./core/audit-ledger.js";
import { analyzeWasteImage } from "./vision-scanner.js";
import { SortVoiceController, parseSortSpeech } from "./voice-controls.js";

const STORAGE_KEY = "sortwise.state.v1";
const DEFAULT_CITY = "san-francisco";
const CUSTOM_CITY = "__custom__";
const AUDIT_BINS = ["recycle", "compost", "trash", "dropoff"];

function safeReadStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWriteStorage(payload) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Ignore storage quota or disabled storage environments.
  }
}

function restoreEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(row =>
    typeof row?.itemId === "string" &&
    typeof row.itemName === "string" &&
    AUDIT_BINS.includes(row.observedBin) &&
    AUDIT_BINS.includes(row.recommendedBin ?? row.primaryBin))
    .map(({ prepSteps, ...row }) => {
      if (typeof row.prepFix !== "string") {
        row.prepFix = Array.isArray(prepSteps) ? prepSteps.filter(step => typeof step === "string").join(" ") : undefined;
      }
      return row;
    });
}

export class SortWiseApp {
  constructor() {
    const saved = safeReadStorage();
    const restored = validateCustomRulepack(saved?.customRulepack);
    this.cityId = getCity(saved?.cityId)?.id ?? DEFAULT_CITY;
    this.customRulepack = restored.rulepack ?? null;
    this.useCustomRulepack = restored.ok && saved?.useCustomRulepack !== false;
    this.activeModifiers = new Set();
    this.entries = restoreEntries(saved?.entries);
    this.lastTriage = null;
    this.lastTriageInput = null;
    this.pendingScan = null;
    this.voiceAutoSpeak = Boolean(saved?.voiceAutoSpeak);

    this.voice = new SortVoiceController({
      onTranscript: (text) => this.handleSpokenInput(text),
      onStatus: (msg) => this.setStatus(msg),
      onListeningChange: (on) => this.renderMicButton(on),
    });

    this.bindUi();
    this.renderAll();
  }

  persist() {
    safeWriteStorage({
      cityId: this.cityId,
      customRulepack: this.customRulepack,
      useCustomRulepack: this.useCustomRulepack,
      entries: this.entries,
      voiceAutoSpeak: this.voiceAutoSpeak,
    });
  }

  activeRulepack() {
    return this.useCustomRulepack ? this.customRulepack : getCity(this.cityId);
  }

  setCity(cityId) {
    const city = cityId === CUSTOM_CITY ? this.customRulepack : getCity(cityId);
    if (!city) {
      return { ok: false, reason: `Unknown city "${cityId}".`, field: "cityId" };
    }
    this.useCustomRulepack = cityId === CUSTOM_CITY;
    if (!this.useCustomRulepack) this.cityId = city.id;
    this.refreshRulepack();
    this.setStatus(`Active rulepack: ${city.name}.`);
    return { ok: true, city };
  }

  importCustomRulepack(rawJson) {
    const check = validateCustomRulepack(rawJson);
    if (!check.ok) {
      this.setStatus(check.reason);
      return check;
    }
    this.customRulepack = check.rulepack;
    this.useCustomRulepack = true;
    this.refreshRulepack();
    this.setStatus(`Loaded custom rulepack: ${check.rulepack.name}.`);
    return check;
  }

  refreshRulepack() {
    this.persist();
    this.renderCitySummary();
    if (this.lastTriageInput) this.runTriage(this.lastTriageInput);
  }

  toggleModifier(modId) {
    if (!MODIFIER_IDS.includes(modId)) {
      return;
    }
    if (this.activeModifiers.has(modId)) {
      this.activeModifiers.delete(modId);
    } else {
      this.activeModifiers.add(modId);
    }
    this.renderModifiers();
    if (this.lastTriageInput) this.runTriage(this.lastTriageInput);
  }

  runTriage({ query, itemId, barcode, modifiers } = {}) {
    if (this.pendingScan) {
      this.pendingScan = null;
      this.setScanHint("Photo check canceled.");
    }
    if (modifiers != null) {
      this.activeModifiers = new Set(detectModifiers("", modifiers));
      this.renderModifiers();
    }
    const res = triageWasteItem({
      query, itemId, barcode,
      cityId: this.cityId,
      customRulepack: this.useCustomRulepack ? this.customRulepack : null,
      modifiers: [...this.activeModifiers],
    });
    if (!res.ok) {
      this.setStatus(res.reason);
      return res;
    }
    this.lastTriageInput = { query, itemId, barcode };
    this.lastTriage = res;
    this.renderTriage();
    const spoken = this.formatTriageSpeech(res);
    this.setStatus(spoken);
    if (this.voiceAutoSpeak) {
      this.voice.speak(spoken);
    }
    return res;
  }

  formatTriageSpeech(res) {
    if (!res.matched) {
      return `${res.reason} Place in ${res.primaryBin} to protect recycling.`;
    }
    const splitNote = res.splitRequired ? " Split into parts before sorting." : "";
    const riskNote = res.contaminationRisk >= 70 ? ` Contamination alert: ${res.reason}` : ` ${res.reason}`;
    return `${res.itemName} in ${res.cityName}: ${res.binLabel}.${splitNote}${riskNote}`;
  }

  logCurrentItem(observedBin = "recycle") {
    if (!this.lastTriage?.matched) {
      return { ok: false, reason: "Match a catalog item before adding it to the audit ledger." };
    }
    if (!AUDIT_BINS.includes(observedBin)) return { ok: false, reason: "Unknown observed bin." };
    const entry = createAuditEntry(this.lastTriage, observedBin);
    this.entries = [entry, ...this.entries];
    this.persist();
    this.renderAudit();
    this.setStatus(`Logged "${entry.itemName}" (observed in ${entry.observedBin}, should go to ${entry.primaryBin}).`);
    return { ok: true, entry };
  }

  loadSampleAudit() {
    if (this.entries.length > 0) {
      const reason = "The sample audit can only be loaded into an empty ledger.";
      this.setStatus(reason);
      return { ok: false, reason };
    }
    this.entries = buildSampleAudit(this.cityId, this.useCustomRulepack ? this.customRulepack : null);
    this.persist();
    this.renderAudit();
    const summary = summarizeAuditImpact(this.entries);
    this.setStatus(`Loaded ${summary.totalItems}-item sample bin audit: ${summary.contaminationRatePct}% contamination, ${summary.avoidedCo2eKg} kg CO2e saved.`);
    return { ok: true, summary };
  }

  clearAudit() {
    this.entries = [];
    this.persist();
    this.renderAudit();
    this.setStatus("Audit ledger cleared.");
  }

  getSummary() {
    return summarizeAuditImpact(this.entries);
  }

  downloadExport(kind) {
    if (typeof document === "undefined") return;
    const summary = this.getSummary();
    const content = kind === "csv" ? exportAuditCsv(this.entries, summary) : exportAuditJson(this.entries, summary);
    const mime = kind === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sortwise-audit.${kind}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async handleSpokenInput(text) {
    const cmd = parseSortSpeech(text);
    if (cmd.type === "stop") {
      this.voice.stopSpeaking();
      this.setStatus("Speech stopped.");
      return;
    }
    if (cmd.type === "speak" && this.lastTriage) {
      this.voice.speak(this.formatTriageSpeech(this.lastTriage));
      return;
    }
    if (cmd.type === "audit_sample") {
      this.loadSampleAudit();
      return;
    }
    if (cmd.type === "triage") {
      const input = globalThis.document?.querySelector("#triage-query-input");
      if (input) input.value = cmd.query;
      this.runTriage({ query: cmd.query });
    }
  }

  async scanPhoto(file) {
    if (!file) return;
    const scanToken = {};
    this.pendingScan = scanToken;
    this.lastTriage = null;
    this.lastTriageInput = null;
    this.renderTriage();
    this.setStatus("");
    if (this.voiceAutoSpeak) this.voice.stopSpeaking();
    this.setScanHint("Checking photo…");

    const result = await analyzeWasteImage(file);
    if (this.pendingScan !== scanToken) return;
    this.pendingScan = null;
    if (!result.ok) {
      this.setScanHint(result.reason);
      return;
    }
    if (getItemByBarcode(result.barcode)) {
      this.setScanHint(`Barcode ${result.barcode} matched the sample catalog.`);
      this.runTriage({ barcode: result.barcode });
      return;
    }
    const barcodeHint = result.barcode ? `Barcode ${result.barcode} is outside the sample catalog.` : result.barcodeHint;
    this.setScanHint([barcodeHint, result.visualHint, "Describe the item to check a bin."].filter(Boolean).join(" "));
  }

  setScanHint(message) {
    const hint = globalThis.document?.querySelector("#scan-hint");
    if (hint) hint.textContent = message;
  }

  bindUi() {
    if (typeof document === "undefined" || typeof document.querySelector !== "function") {
      return;
    }
    const citySelect = document.querySelector("#city-select");
    if (!citySelect) return;

    citySelect.replaceChildren();
    for (const city of listCities()) {
      const opt = document.createElement("option");
      opt.value = city.id;
      opt.textContent = city.name;
      citySelect.appendChild(opt);
    }
    citySelect.addEventListener("change", (e) => this.setCity(e.target.value));

    document.querySelector("#triage-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = document.querySelector("#triage-query-input")?.value || "";
      this.runTriage({ query: q });
    });

    for (const btn of document.querySelectorAll("[data-quick-query]")) {
      btn.addEventListener("click", () => {
        const q = btn.getAttribute("data-quick-query");
        const input = document.querySelector("#triage-query-input");
        if (input) input.value = q;
        this.runTriage({ query: q });
      });
    }

    for (const btn of document.querySelectorAll("[data-modifier]")) {
      btn.addEventListener("click", () => this.toggleModifier(btn.getAttribute("data-modifier")));
    }

    for (const btn of document.querySelectorAll("[data-sample-barcode]")) {
      btn.addEventListener("click", () => {
        const code = btn.getAttribute("data-sample-barcode");
        this.runTriage({ barcode: code });
      });
    }

    document.querySelector("#photo-scan-input")?.addEventListener("change", e => this.scanPhoto(e.target.files?.[0]));

    document.querySelector("#btn-voice-dictate")?.addEventListener("click", () => this.voice.toggleListening());
    document.querySelector("#btn-speak-result")?.addEventListener("click", () => {
      if (this.lastTriage) {
        this.voice.speak(this.formatTriageSpeech(this.lastTriage));
      } else {
        this.voice.speak("SortWise is ready. Enter or speak an item to check its bin and contamination risk.");
      }
    });
    document.querySelector("#toggle-auto-speak")?.addEventListener("change", (e) => {
      this.voiceAutoSpeak = Boolean(e.target.checked);
      this.persist();
    });

    for (const bin of AUDIT_BINS) {
      document.querySelector(`#btn-log-${bin}`)?.addEventListener("click", () => this.logCurrentItem(bin));
    }
    document.querySelector("#btn-load-sample-audit")?.addEventListener("click", () => this.loadSampleAudit());
    document.querySelector("#btn-clear-audit")?.addEventListener("click", () => this.clearAudit());
    document.querySelector("#btn-export-csv")?.addEventListener("click", () => this.downloadExport("csv"));
    document.querySelector("#btn-export-json")?.addEventListener("click", () => this.downloadExport("json"));

    document.querySelector("#custom-rulepack-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const raw = document.querySelector("#custom-rulepack-input")?.value || "";
      this.importCustomRulepack(raw);
    });
  }

  setStatus(message) {
    if (typeof document === "undefined") return;
    const el = document.querySelector("#sortwise-status");
    if (el) el.textContent = message;
  }

  renderMicButton(listening) {
    if (typeof document === "undefined") return;
    const btn = document.querySelector("#btn-voice-dictate");
    btn?.setAttribute("aria-pressed", String(listening));
  }

  renderAll() {
    this.renderCitySummary();
    this.renderModifiers();
    this.renderTriage();
    this.renderAudit();
  }

  renderCitySummary() {
    if (typeof document === "undefined") return;
    const select = document.querySelector("#city-select");
    if (select) {
      if (this.customRulepack) {
        let option = select.querySelector(`option[value="${CUSTOM_CITY}"]`);
        if (!option) {
          option = document.createElement("option");
          option.value = CUSTOM_CITY;
          select.appendChild(option);
        }
        option.textContent = `${this.customRulepack.name} (Custom)`;
      }
      select.value = this.useCustomRulepack ? CUSTOM_CITY : this.cityId;
    }
    const rule = this.activeRulepack();
    const badge = document.querySelector("#city-rule-summary");
    if (badge) {
      badge.textContent = `${rule.name} | Resins: ${rule.acceptedResins.map((n) => `#${n}`).join(", ")} | Compost: ${rule.hasCompost ? "Yes" : "No"} | Film in curbside: ${rule.acceptsFilm ? "Yes" : "No (drop-off)"}`;
    }
    const autoCheck = document.querySelector("#toggle-auto-speak");
    if (autoCheck) autoCheck.checked = this.voiceAutoSpeak;
  }

  renderModifiers() {
    if (typeof document === "undefined") return;
    for (const btn of document.querySelectorAll("[data-modifier]")) {
      const id = btn.getAttribute("data-modifier");
      btn.setAttribute("aria-pressed", String(this.activeModifiers.has(id)));
    }
  }

  renderTriage() {
    if (typeof document === "undefined") return;
    const box = document.querySelector("#triage-result");
    if (!box) return;
    if (!this.lastTriage) {
      box.textContent = "Enter an item, scan a sample barcode, or click a common contaminant above to inspect part-by-part sorting rules.";
      this.setLogButtonsEnabled(false);
      return;
    }
    const r = this.lastTriage;
    this.setLogButtonsEnabled(Boolean(r.matched));
    const impact = r.matched ? estimateItemImpact(r) : { avoidedCo2eKg: 0 };
    const hazard = (r.hazardLevel || "moderate").toUpperCase();
    const cityName = r.cityName || this.activeRulepack().name;
    box.replaceChildren();

    const header = document.createElement("div");
    header.className = `triage-banner bin-${r.primaryBin} hazard-${r.hazardLevel || "moderate"}`;
    const title = document.createElement("h3");
    title.textContent = `${r.matched ? r.itemName : "Unrecognized Item"} -> ${r.binLabel || r.primaryBin.toUpperCase()}`;
    const meta = document.createElement("p");
    meta.textContent = `City: ${cityName} | Contamination Risk: ${r.contaminationRisk}/100 (${hazard}) | Est. avoided CO2e if sorted cleanly: ${impact.avoidedCo2eKg} kg`;
    const reason = document.createElement("p");
    reason.textContent = r.reason;
    header.append(title, meta, reason);
    box.appendChild(header);

    if (r.parts?.length) {
      const partHeading = document.createElement("h4");
      partHeading.textContent = r.splitRequired ? "Composite Split Required (Part-by-Part)" : "Component Breakdown";
      const list = document.createElement("ul");
      list.className = "part-list";
      for (const part of r.parts) {
        const li = document.createElement("li");
        li.className = `part-item bin-${part.assignedBin}`;
        li.textContent = `${part.partName} (${part.material}) -> ${part.binLabel || part.assignedBin.toUpperCase()}: ${part.note}`;
        list.appendChild(li);
      }
      box.append(partHeading, list);
    }

    if (r.prepSteps?.length) {
      const prep = document.createElement("p");
      prep.className = "prep-note";
      prep.textContent = `Prep steps: ${r.prepSteps.join(" ")}`;
      box.appendChild(prep);
    }
  }

  setLogButtonsEnabled(enabled) {
    if (typeof document === "undefined") return;
    for (const bin of AUDIT_BINS) {
      const btn = document.querySelector(`#btn-log-${bin}`);
      if (btn) btn.disabled = !enabled;
    }
  }

  renderAudit() {
    if (typeof document === "undefined") return;
    const summary = this.getSummary();
    const metricsEl = document.querySelector("#audit-metrics");
    if (metricsEl) {
      metricsEl.replaceChildren();
      const cards = [
        ["Items Audited", String(summary.totalItems)],
        ["Contamination Rate", `${summary.contaminationRatePct}%`],
        ["Clean Diversion", `${summary.diversionRatePct}%`],
        ["Avoided CO2e", `${summary.avoidedCo2eKg} kg`],
        ["MRF Rejection Risk", summary.loadRejectionRisk.toUpperCase()],
      ];
      for (const [label, value] of cards) {
        const div = document.createElement("div");
        div.className = "metric-card";
        const span = document.createElement("span");
        span.textContent = label;
        const strong = document.createElement("strong");
        strong.textContent = value;
        div.append(span, strong);
        metricsEl.appendChild(div);
      }
    }

    this.renderImpactChart(summary);

    const tbody = document.querySelector("#audit-table-body");
    if (tbody) {
      tbody.replaceChildren();
      if (!this.entries.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.textContent = "No audited items yet. Triage an item and log it, or click Load Sample Cafe/Dorm Audit.";
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        for (const row of this.entries) {
          const tr = document.createElement("tr");
          const recommendedBin = row.recommendedBin ?? row.primaryBin;
          const outcome = row.splitRequired ? "Split required" : row.observedBin === recommendedBin ? "Clean" : "Intercepted";
          for (const val of [
            row.itemName,
            row.observedBin,
            recommendedBin,
            `${row.contaminationRisk}%`,
            outcome,
          ]) {
            const td = document.createElement("td");
            td.textContent = val;
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
      }
    }
  }

  renderImpactChart(summary) {
    const svg = document.querySelector("#audit-chart");
    if (!svg || typeof svg.replaceChildren !== "function") return;
    const NS = "http://www.w3.org/2000/svg";
    svg.replaceChildren();
    const bars = [
      { label: "Clean Diversion %", value: summary.diversionRatePct, color: "#047857" },
      { label: "Contamination %", value: summary.contaminationRatePct, color: "#b91c1c" },
    ];
    bars.forEach((b, idx) => {
      const y = 16 + idx * 42;
      const bg = document.createElementNS(NS, "rect");
      bg.setAttribute("x", "182");
      bg.setAttribute("y", String(y));
      bg.setAttribute("width", "218");
      bg.setAttribute("height", "22");
      bg.setAttribute("rx", "6");
      bg.setAttribute("fill", "#e5e7eb");

      const fg = document.createElementNS(NS, "rect");
      fg.setAttribute("x", "182");
      fg.setAttribute("y", String(y));
      fg.setAttribute("width", String(Math.round((Math.min(100, Math.max(0, b.value)) / 100) * 218)));
      fg.setAttribute("height", "22");
      fg.setAttribute("rx", "6");
      fg.setAttribute("fill", b.color);

      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", "6");
      text.setAttribute("y", String(y + 16));
      text.setAttribute("font-size", "13");
      text.setAttribute("fill", "#18181b");
      text.textContent = `${b.label}: ${b.value}%`;

      svg.append(bg, fg, text);
    });
  }
}

export const sortWiseApp = typeof window !== "undefined" ? new SortWiseApp() : null;
if (typeof window !== "undefined") {
  window.SortWiseApp = sortWiseApp;
}
