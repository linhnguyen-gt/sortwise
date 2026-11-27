import { getCity, validateCustomRulepack } from "./city-rules.js";
import { findItemMatches, getItemByBarcode, getItemById } from "./item-catalog.js";

const modifierPatterns = {
  greasy: /\b(?:greasy|grease|oily)\b/gi,
  "food-residue": /\b(?:food[ -](?:residue|soiled|stained)|unrinsed|dirty|not rinsed)\b/gi,
  wet: /\b(?:wet|soaked|soggy|damp)\b/gi,
  rinsed: /(?<!\bnot )\b(?:rinsed|washed)\b/gi,
  broken: /\b(?:broken|shattered|cracked|damaged|leaking)\b/gi,
  swollen: /\b(?:swollen|bulging|puffy)\b/gi,
  shredded: /\b(?:shredded|shreds)\b/gi,
};

export const MODIFIER_IDS = Object.freeze(Object.keys(modifierPatterns));

export function detectModifiers(query, explicitModifiers = []) {
  const text = typeof query === "string" ? query : "";
  const explicit = Array.isArray(explicitModifiers)
    ? explicitModifiers.map(value => typeof value === "string" ? value.trim().toLowerCase() : value)
    : [];
  return MODIFIER_IDS.filter(id => explicit.includes(id) || text.search(modifierPatterns[id]) !== -1);
}

function itemFromQuery(query) {
  if (typeof query !== "string") return null;
  const directMatch = findItemMatches(query)[0];
  if (directMatch) return directMatch;
  const withoutModifiers = MODIFIER_IDS.reduce((text, modifier) =>
    text.replace(modifierPatterns[modifier], " "), query);
  return findItemMatches(withoutModifiers)[0] ?? null;
}

const specialMaterials = {
  "small-foil": ["Small foil peel seals can fall through MRF screens.", "Peel off the foil seal and place it in trash."],
  "thermal-paper": ["BPA/BPS-coated thermal paper can contaminate recovered paper.", "Place the receipt in trash."],
  pla: ["#7 PLA needs a facility that accepts it for industrial composting and contaminates plastic recycling.",
    "Use trash unless a separate industrial compost program explicitly accepts PLA."],
  laminate: ["Fused plastic and foil layers are unsuitable for this recycling stream.", "Place the wrapper in trash."],
};

function evaluatePart(part, item, city, active, selectedResin) {
  const { material, baseBin } = part;
  const resinCode = part.alternateResinCodes?.includes(selectedResin) ? selectedResin : part.resinCode;
  const paper = material === "paper" || material === "cardboard";
  const builtIn = new Set(part.contaminatedBy);
  const soiled = builtIn.has("greasy") || builtIn.has("food-residue") ||
    (!part.protectedFromFood && (active.has("greasy") || active.has("food-residue")) &&
      (paper || !active.has("rinsed")));
  const wet = builtIn.has("wet") || active.has("wet");
  const route = (bin, reason, prepStep, binLabel = city.bins[bin]) => ({
    ...part, ...(resinCode == null ? {} : { resinCode }), bin, assignedBin: bin, binLabel, reason, note: reason, prepStep,
  });

  if (item.mrfHazard === "thermal-fire") {
    const damaged = item.id === "swollen-power-bank" || active.has("swollen") || active.has("broken");
    return route("dropoff", "Critical MRF thermal runaway and fire hazard if crushed or short-circuited.",
      damaged
        ? "Stop using or charging it. Contact a household hazardous waste program for damaged battery instructions before transport."
        : "Keep it out of curbside bins. Tape exposed terminals with nonconductive tape and use a battery collection site.");
  }
  if (material === "battery") {
    return route("dropoff", "Batteries need a separate collection stream.", "Use a battery collection point that accepts alkaline batteries.");
  }
  if (material === "pressurized-aerosol") {
    return route("dropoff", "Aerosol cans with contents remaining can burst during collection or sorting.",
      "Verify the can is empty before recycling. Take a nonempty can to household hazardous waste collection.",
      "Household hazardous waste collection");
  }
  if (material === "electronics") {
    return route("dropoff", "Cables can tangle sorting equipment at a materials recovery facility (MRF).",
      "Take it to an e-waste collection point.");
  }
  if (material === "textile") {
    return route("dropoff", "Textiles can wrap around MRF sorting equipment.",
      "Donate wearable clothing or use a textile collection point.", "Textile collection or donation");
  }
  if (material === "drinking-glass" || (material === "container-glass" && active.has("broken"))) {
    return route("trash", "Glass shards can injure collection and MRF workers. Drinking glass is also incompatible with container glass.",
      "Secure the shards in a rigid container and follow local instructions for broken glass.");
  }
  if (Object.hasOwn(specialMaterials, material)) return route("trash", ...specialMaterials[material]);

  if (material === "film") {
    if (soiled || wet) return route("trash", "Dirty or wet film is unsuitable for collection and can tangle MRF machinery.",
      "Use an approved film collection program only if the film can be cleaned and dried.");
    if (!city.acceptsFilm) return route("dropoff", "Plastic film is an MRF tangler and wraps around sorting machinery.",
      "Bring clean, dry film to a participating retailer that accepts this film type.",
      city.bins.filmDropoff ?? "Retail plastic film drop-off");
  }
  if (material === "black-plastic" && !city.acceptsBlackPlastic) {
    return route("trash", "Carbon-black pigment absorbs near-infrared (NIR) light; optical sorters often cannot identify the resin.",
      "Place this tray in trash.");
  }
  if (material === "eps-foam" && !city.acceptsStyrofoam) {
    return route("trash", "Expanded polystyrene (EPS) breaks into pieces and is excluded by this recycling program.",
      "Check for a foam recovery program or use trash.");
  }
  if (material === "carton" && !city.acceptsCartons) {
    return route("trash", "This recycling program does not accept composite cartons.", "Check for a dedicated carton collection program.");
  }
  if (material === "lined-paper" && !city.acceptsLinedPaperCups) {
    return route("trash", "The plastic lining in the cup is unsuitable for this paper recovery stream.",
      "Remove the sleeve and lid before discarding the cup.");
  }
  if (paper && (builtIn.has("shredded") || active.has("shredded"))) {
    return route("trash", "Loose paper shreds pass through sorting screens and can contaminate other streams.",
      "Use a dedicated shredded-paper program if available.");
  }
  if (paper && (soiled || wet)) {
    if (soiled && city.hasCompost && city.compostAcceptsSoiledPaper) {
      return route("compost", "Uncoated food-soiled paper is accepted in local compost.",
        "Remove any liners, tape or stickers before composting.");
    }
    return route("trash", "Wet or soiled paper is unsuitable for this recycling stream.",
      "Keep wet or food-soiled sections separate from clean, dry paper.");
  }
  if (baseBin === "compost") {
    return city.hasCompost
      ? route("compost", "Food scraps are accepted in this organics stream.", "Remove any wrappers or stickers.")
      : route("trash", "This profile has no dedicated curbside compost program.", "Use local food scrap collection where available.");
  }
  if (resinCode && material !== "film" && material !== "eps-foam" && !city.acceptedResins.includes(resinCode)) {
    return route("trash", `This recycling program does not accept resin #${resinCode}.`, "Keep this resin out of the recycling bin.");
  }
  if (soiled) {
    return route("trash", "Food residue can contaminate other recyclables.", "Empty and rinse first to recycle an accepted container.");
  }
  const prep = item.id === "aerosol-can-empty"
    ? "Recycle only when completely empty. Use hazardous waste collection for a partially full can."
    : paper ? "Keep paper clean and dry." : "Empty and rinse if needed.";
  return route("recycle", "This material is accepted in the local recycling stream.", prep,
    (paper || material === "lined-paper") ? city.bins.paperRecycle ?? city.bins.recycle : city.bins.recycle);
}

export function triageWasteItem({ query, itemId, barcode, cityId = "san-francisco", customRulepack = null,
  modifiers = [] } = {}) {
  const custom = customRulepack === null ? null : validateCustomRulepack(customRulepack);
  const city = custom?.ok ? custom.rulepack : getCity(cityId);
  if (!city) return { ok: false, reason: "Unknown city rulepack.", field: "cityId" };

  const item = getItemByBarcode(barcode) ?? getItemById(itemId) ?? itemFromQuery(query);
  if (!item) {
    return {
      ok: true, matched: false, item: null, primaryBin: "trash", contaminationRisk: 50,
      reason: "Unrecognized item; do not wishcycle into recycling.",
      prepSteps: ["Check local drop-off or place in trash to prevent MRF contamination."], parts: [],
    };
  }

  const activeModifiers = detectModifiers(query, modifiers);
  const active = new Set(activeModifiers);
  const selectedResin = typeof query === "string" ? Number(query.match(/#\s*([1-7])\b/)?.[1]) : NaN;
  const parts = item.parts.map(part => evaluatePart(part, item, city, active, selectedResin));
  const { bin: primaryBin, binLabel } = parts[0];
  const splitRequired = parts.some(part => part.bin !== primaryBin || part.binLabel !== binLabel);
  const wishcyclingPrevented = parts.some(part => part.bin === "trash" || part.bin === "dropoff" ||
    (part.baseBin === "recycle" && part.bin !== "recycle"));
  const contaminationRisk = Math.max(item.defaultRisk,
    wishcyclingPrevented ? 50 : 0, active.has("broken") && item.category === "glass" ? 85 : 0);
  const hazardLevel = item.mrfHazard === "thermal-fire" ? "critical"
    : contaminationRisk >= 80 ? "high" : contaminationRisk >= 40 ? "moderate" : "none";
  // Keep every part's routing reason visible while deduplicating shared prep steps.
  const reason = splitRequired
    ? parts.map(part => `${part.partName} → ${part.binLabel}. ${part.reason}`).join(" ")
    : [...new Set(parts.map(part => part.reason))].join(" ");
  const prepSteps = [...new Set(parts.map(part => part.prepStep))];
  if (splitRequired) prepSteps.unshift("Separate the parts before sorting.");

  return {
    ok: true, matched: true, cityId: city.id, cityName: city.name, itemId: item.id, itemName: item.name,
    category: item.category, primaryBin, binLabel, splitRequired, parts, modifiers: activeModifiers,
    contaminationRisk, hazardLevel, wishcyclingPrevented, reason, prepSteps,
    baseWeightKg: item.baseWeightKg, epaMaterialKey: item.epaMaterialKey, citySourceNote: city.sourceNote,
  };
}
