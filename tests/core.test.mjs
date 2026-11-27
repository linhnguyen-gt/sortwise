import assert from "node:assert/strict";
import { test } from "node:test";
import { CITY_IDS, CITY_RULEPACKS, getCity, listCities, validateCustomRulepack } from "../core/city-rules.js";
import { WASTE_ITEMS, SAMPLE_BARCODES, findItemMatches, getItemByBarcode, getItemById } from "../core/item-catalog.js";
import { MODIFIER_IDS, detectModifiers, triageWasteItem } from "../core/triage-engine.js";
import { EPA_WARM_FACTORS, estimateItemImpact, summarizeAuditImpact } from "../core/impact-calculator.js";
import { SAMPLE_BIN_AUDIT, buildSampleAudit, createAuditEntry, exportAuditCsv, exportAuditJson } from "../core/audit-ledger.js";

const cityIds = ["san-francisco", "new-york", "seattle", "austin", "london", "ho-chi-minh"];
const triage = (itemId, options = {}) => triageWasteItem({ itemId, ...options });
const partBins = result => result.parts.map(part => part.bin);

test("all six rulepacks expose the expected acceptance flags and bin labels", () => {
  assert.deepEqual(CITY_IDS, cityIds);
  assert.deepEqual(listCities().map(city => city.id), cityIds);
  for (const city of listCities()) {
    assert.equal(getCity(city.id), CITY_RULEPACKS[city.id]);
    assert.deepEqual(city.acceptedResins, [1, 2, 5]);
    assert.deepEqual([city.acceptsCartons, city.hasCompost], Array(2).fill(city.id !== "ho-chi-minh"));
    assert.equal(city.compostAcceptsSoiledPaper, !["london", "ho-chi-minh"].includes(city.id));
    for (const flag of ["acceptsFilm", "acceptsBlackPlastic", "acceptsStyrofoam"]) assert.equal(city[flag], false);
    for (const bin of ["recycle", "compost", "trash", "dropoff"]) assert.ok(city.bins[bin]);
    assert.ok(city.name && city.region && city.sourceNote);
  }
  assert.deepEqual([getCity("constructor"), triageWasteItem({ cityId: "unknown" }).field], [null, "cityId"]);
});

test("custom rulepacks work from objects or JSON and override municipal routing", () => {
  const { region, sourceNote, ...base } = getCity("san-francisco");
  const input = { ...base, id: "campus", name: "Campus", acceptedResins: [2, 2, 7],
    acceptsFilm: true, acceptsBlackPlastic: true, acceptsStyrofoam: true };
  const parsed = validateCustomRulepack(JSON.stringify(input));
  assert.deepEqual(parsed, validateCustomRulepack(input));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rulepack.acceptedResins, [2, 7]);
  assert.equal(parsed.rulepack.region, "Custom");
  const options = { cityId: "unknown", customRulepack: input };
  assert.equal(triage("pet-water-bottle", options).primaryBin, "trash");
  assert.equal(triage("hdpe-milk-jug", options).cityId, "campus");
  assert.equal(triage("plastic-grocery-bag", options).primaryBin, "recycle");
  assert.equal(triage("styrofoam-clamshell", options).primaryBin, "recycle");
  assert.equal(triage("compostable-pla-cup", options).primaryBin, "trash");
});

test("custom rulepacks refuse malformed JSON, missing fields, invalid resins and bad labels", () => {
  const base = getCity("seattle");
  for (const [input, field] of [
    ["{", "rulepack"], [[], "rulepack"], [{ ...base, id: "" }, "id"], [{ ...base, name: null }, "name"],
    [{ ...base, acceptedResins: [0, 8] }, "acceptedResins"], [{ ...base, acceptedResins: ["5"] }, "acceptedResins"],
    [{ ...base, acceptedResins: [1.5] }, "acceptedResins"], [{ ...base, acceptedResins: Array(1) }, "acceptedResins"],
    [{ ...base, hasCompost: "true" }, "hasCompost"], [{ ...base, acceptsFilm: undefined }, "acceptsFilm"],
    [{ ...base, bins: null }, "bins"], [{ ...base, bins: { ...base.bins, dropoff: " " } }, "bins.dropoff"],
  ]) {
    const result = validateCustomRulepack(input);
    assert.deepEqual([result.ok, result.field], [false, field]);
    assert.ok(result.reason);
  }
  assert.equal(triage("pizza-box", { customRulepack: {} }).cityId, "san-francisco");
});

test("greasy pizza bottoms and cartons route differently across the three city profiles", () => {
  for (const [cityId, bottom, carton] of [
    ["san-francisco", "compost", "recycle"], ["london", "trash", "recycle"], ["ho-chi-minh", "trash", "trash"],
  ]) {
    const pizza = triageWasteItem({ query: "greasy pizza box", cityId });
    assert.deepEqual(pizza.parts.map(part => part.partName), ["Clean Top Lid", "Greasy Bottom Box"]);
    assert.deepEqual([pizza.splitRequired, ...partBins(pizza)], [true, "recycle", bottom]);
    assert.equal(triage("tetra-pak-carton", { cityId }).primaryBin, carton);
  }
  assert.match(triage("pizza-box", { cityId: "new-york" }).binLabel, /green.*paper/i);
  assert.match(triage("tetra-pak-carton", { cityId: "new-york" }).binLabel, /blue/i);
});

test("yogurt and coffee assemblies keep parts separate and respect residue and resin", () => {
  const dirty = triageWasteItem({ query: "yogurt tub with food residue" });
  const rinsed = triageWasteItem({ query: "yogurt tub with food residue", modifiers: ["rinsed"] });
  assert.deepEqual(partBins(dirty), ["trash", "trash"]);
  assert.match(dirty.reason, /food residue/i);
  assert.deepEqual([rinsed.splitRequired, ...partBins(rinsed)], [true, "recycle", "trash"]);
  assert.deepEqual(partBins(triage("yogurt-tub-foil")), ["recycle", "trash"]);
  const coffee = triage("coffee-cup-sleeve");
  assert.deepEqual([coffee.splitRequired, ...partBins(coffee)], [true, "trash", "recycle", "recycle"]);
  const psLid = triageWasteItem({ query: "coffee cup with sleeve #6" });
  assert.deepEqual([psLid.parts[2].resinCode, ...partBins(psLid)], [6, "trash", "recycle", "trash"]);
  assert.deepEqual(partBins(triage("coffee-cup-sleeve", { cityId: "austin" })), ["recycle", "recycle", "recycle"]);
});

test("modifiers are deduplicated and distinguish condition from material", () => {
  assert.deepEqual(MODIFIER_IDS, ["greasy", "food-residue", "wet", "rinsed", "broken", "swollen", "shredded"]);
  assert.deepEqual(detectModifiers("Soggy, oily, not rinsed", [" WET ", "greasy", "other"]), ["greasy", "food-residue", "wet"]);
  assert.equal(triageWasteItem({ query: "shredded newspaper" }).primaryBin, "trash");
  assert.equal(triageWasteItem({ query: "cracked wine bottle" }).hazardLevel, "high");
  assert.equal(triage("wet-cardboard-box").primaryBin, "trash");
});

test("tanglers, black plastic and battery hazards receive explicit routing", () => {
  for (const id of ["plastic-grocery-bag", "bubble-wrap-mailer", "usb-charging-cable"]) {
    const item = triage(id);
    assert.equal(item.primaryBin, "dropoff");
    assert.ok(item.contaminationRisk >= 80);
    assert.match(item.reason, /tangl/);
  }
  assert.match(triage("plastic-grocery-bag").binLabel, /retail/i);
  const black = triage("black-takeout-tray");
  assert.equal(black.primaryBin, "trash");
  assert.match(black.reason, /NIR.*optical/i);
  for (const id of ["lithium-battery", "swollen-power-bank"]) {
    const item = triage(id);
    assert.equal(item.primaryBin, "dropoff");
    assert.deepEqual([item.hazardLevel, item.contaminationRisk], ["critical", 100]);
    assert.match(item.reason, /MRF thermal runaway and fire/);
  }
  for (const query of ["swollen lithium power bank", "damaged lithium batteries", "leaking power bank"])
    assert.match(triageWasteItem({ query }).prepSteps[0], /before transport/);
  assert.equal(triageWasteItem({ query: "partially full aerosol can" }).primaryBin, "dropoff");
  assert.equal(triageWasteItem({ query: "empty spray can" }).primaryBin, "recycle");
});

test("catalog matches aliases, categories, resins and valid sample barcodes", () => {
  assert.ok(WASTE_ITEMS.length >= 36);
  assert.equal(new Set(WASTE_ITEMS.map(item => item.id)).size, WASTE_ITEMS.length);
  for (const [query, id] of [["tetra-pak-carton", "tetra-pak-carton"], ["YOGHURT POTS", "yogurt-tub-foil"], ["lithium batteries", "lithium-battery"],
    ["textile", "cotton-tshirt"], ["# 5 yogurt", "yogurt-tub-foil"]]) assert.equal(findItemMatches(query)[0].id, id);
  assert.equal(findItemMatches("#12").length, 0);
  assert.deepEqual([Object.keys(SAMPLE_BARCODES).length, getItemByBarcode("4895228411024")?.id], [12, "power-bank"]);
  for (const [code, { itemId, label }] of Object.entries(SAMPLE_BARCODES)) {
    assert.match(code, /^(?:\d{12}|\d{13})$/);
    const weighted = [...code].reverse().reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0);
    assert.deepEqual([weighted % 10, Boolean(label)], [0, true]);
    assert.equal(getItemByBarcode(code), getItemById(itemId));
    assert.equal(triageWasteItem({ barcode: code, itemId: "newspaper" }).itemId, itemId);
  }
});

test("unrecognized queries and barcodes fall back to trash", () => {
  const fallback = { ok: true, matched: false, item: null, primaryBin: "trash", contaminationRisk: 50,
    reason: "Unrecognized item; do not wishcycle into recycling.",
    prepSteps: ["Check local drop-off or place in trash to prevent MRF contamination."], parts: [] };
  for (const query of ["unknown mystery widget", "mystery bottle", "  "])
    assert.deepEqual(triageWasteItem({ query, barcode: "000000000000" }), fallback);
});

const auditEntry = (itemId, observedBin, recommendedBin, baseWeightKg, epaMaterialKey, extra = {}) => ({
  id: itemId, itemId, itemName: itemId, observedBin, recommendedBin, primaryBin: recommendedBin,
  baseWeightKg, epaMaterialKey, contaminationRisk: 0, hazardLevel: "none", ...extra,
});

test("WARM proxies, diversion, contamination and contaminant ranking use observed routing", () => {
  assert.deepEqual(EPA_WARM_FACTORS, { aluminum: 9.1, steel: 1.8, cardboard: 3.1, paper: 3.5, pet: 1,
    hdpe: 0.8, pp: 0.9, glass: 0.3, organics: 0.5, ewaste: 4.2, landfill: 0 });
  assert.deepEqual(estimateItemImpact(triage("aluminum-soda-can")), { divertedMassKg: 0.01, avoidedCo2eKg: 0.13 });
  assert.deepEqual(estimateItemImpact(triage("pizza-box")), { divertedMassKg: 0, avoidedCo2eKg: 0 });
  const bag = auditEntry("bag", "recycle", "dropoff", 0.4, "hdpe", { contaminationRisk: 85, prepFix: "Use retail drop-off." });
  const { topContaminants, ...summary } = summarizeAuditImpact([
    auditEntry("can", "recycle", "recycle", 0.1, "aluminum"), auditEntry("peel", "compost", "compost", 0.2, "organics"),
    auditEntry("battery", "dropoff", "dropoff", 0.1, "ewaste", { hazardLevel: "critical" }),
    auditEntry("wrapper", "trash", "trash", 0.9, "landfill"), bag, bag, auditEntry("steel", "trash", "recycle", 0.8, "steel"),
    auditEntry("wrong-cart", "compost", "recycle", 0.1, "paper"),
  ]);
  assert.deepEqual(summary, { totalItems: 8, correctlySortedCount: 4, contaminatedOrMisroutedCount: 4,
    wishcyclingInterceptedCount: 2, criticalHazardCount: 1, contaminationRatePct: 50, diversionRatePct: 37.5,
    divertedMassKg: 0.4, avoidedCo2eKg: 1.43, loadRejectionRisk: "high" });
  assert.deepEqual(topContaminants.map(({ itemId, count }) => [itemId, count]), [["bag", 2], ["battery", 1], ["steel", 1]]);
  assert.equal(topContaminants[0].prepFix, "Use retail drop-off.");
});

test("load rejection thresholds handle empty audits, boundaries and correctly routed critical hazards", () => {
  const clean = createAuditEntry(triage("pet-water-bottle"), "recycle");
  const mistake = { ...clean, observedBin: "trash" };
  const risk = (wrong, total) => summarizeAuditImpact([...Array(wrong).fill(mistake), ...Array(total - wrong).fill(clean)]);
  assert.equal(risk(0, 0).diversionRatePct, 0);
  for (const [wrong, total, expected] of [[1, 13, "low"], [2, 25, "medium"], [1, 5, "high"]])
    assert.equal(risk(wrong, total).loadRejectionRisk, expected);
  assert.equal(summarizeAuditImpact([createAuditEntry(triage("lithium-battery"), "dropoff")]).loadRejectionRisk, "high");
});

test("sample audit records city-specific advice and handles invalid inputs", () => {
  const sf = buildSampleAudit();
  const hcm = buildSampleAudit("ho-chi-minh");
  const { totalItems, wishcyclingInterceptedCount, criticalHazardCount } = summarizeAuditImpact(sf);
  assert.deepEqual([SAMPLE_BIN_AUDIT.length, totalItems, new Set(sf.map(entry => entry.id)).size], [12, 12, 12]);
  assert.deepEqual([wishcyclingInterceptedCount, criticalHazardCount], [6, 1]);
  assert.ok(sf.find(entry => entry.itemId === "pizza-box").splitRequired);
  assert.equal(hcm.find(entry => entry.itemId === "tetra-pak-carton").recommendedBin, "trash");
  assert.throws(() => buildSampleAudit("bad-city"), { cause: { ok: false, field: "cityId", reason: "Unknown city rulepack." } });
  assert.throws(() => createAuditEntry(triage("pet-water-bottle"), "unknown"), RangeError);
  assert.throws(() => createAuditEntry(triageWasteItem(), "trash"), TypeError);
});

test("CSV neutralizes formula prefixes and JSON preserves the original audit data", () => {
  const entries = [{ ...createAuditEntry(triage("aluminum-soda-can"), "recycle"),
    id: "=cmd", itemId: "+1", itemName: "-2", observedBin: "@SUM", recommendedBin: "\ttext",
    primaryBin: "\rtext", prepFix: '   =SUM("a,b")' }];
  const summary = summarizeAuditImpact(entries);
  const csv = exportAuditCsv(entries, summary);
  assert.ok(csv.includes(`\r\n'=cmd,'+1,'-2,'@SUM,"'\ttext","'\rtext",`));
  assert.ok(csv.includes(`"'   =SUM(""a,b"")"`));
  assert.ok(csv.includes("\r\nloadRejectionRisk,high,"));
  assert.deepEqual(JSON.parse(exportAuditJson(entries, summary)), { entries, summary });
});
