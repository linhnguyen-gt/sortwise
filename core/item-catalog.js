function part(partName, material, baseBin, resinCode, details = {}) {
  return { partName, material, baseBin, ...(resinCode == null ? {} : { resinCode }), ...details };
}

function item(id, name, aliases, category, resinCode, baseWeightKg, defaultRisk, epaMaterialKey, parts,
  mrfHazard = null) {
  return { id, name, aliases, category, resinCode, baseWeightKg, defaultRisk, mrfHazard, epaMaterialKey, parts };
}

export const WASTE_ITEMS = [
  item("pizza-box", "Pizza box", ["pizza carton", "pizza cardboard"], "cardboard", null, 0.18, 35, "cardboard", [
    part("Clean Top Lid", "cardboard", "recycle", null, { protectedFromFood: true }),
    part("Greasy Bottom Box", "cardboard", "recycle", null, { contaminatedBy: ["greasy"] }),
  ]),
  item("coffee-cup-sleeve", "Coffee cup with sleeve", ["takeaway coffee cup", "paper coffee cup", "latte cup"],
    "drinkware", null, 0.022, 65, "paper", [
      part("Plastic-Lined Cup", "lined-paper", "recycle"),
      part("Cardboard Sleeve", "cardboard", "recycle"),
      part("Plastic Lid", "rigid-plastic", "recycle", 5, { alternateResinCodes: [6] }),
    ]),
  item("yogurt-tub-foil", "Yogurt tub with foil lid", ["yogurt tub", "yoghurt pot", "yogurt cup"],
    "plastic", 5, 0.016, 20, "pp", [
      part("Polypropylene Tub", "rigid-plastic", "recycle", 5),
      part("Foil Peel Lid", "small-foil", "trash"),
    ]),
  item("tetra-pak-carton", "Tetra Pak carton", ["aseptic carton", "juice box", "milk carton", "soup carton", "tetrapak"],
    "carton", null, 0.032, 20, "cardboard", [part("Empty Carton", "carton", "recycle")]),
  item("pet-water-bottle", "PET water bottle", ["plastic bottle", "water bottle", "PETE bottle"],
    "plastic", 1, 0.014, 5, "pet", [part("PET Bottle", "rigid-plastic", "recycle", 1)]),
  item("hdpe-milk-jug", "HDPE milk jug", ["plastic milk bottle", "gallon jug", "milk jug"],
    "plastic", 2, 0.06, 5, "hdpe", [part("HDPE Jug", "rigid-plastic", "recycle", 2)]),
  item("black-takeout-tray", "Black takeout tray", ["black plastic container", "black takeaway box", "carbon black tray"],
    "plastic", 5, 0.025, 75, "pp", [part("Black Plastic Tray", "black-plastic", "recycle", 5)]),
  item("plastic-grocery-bag", "Plastic grocery bag", ["plastic bag", "shopping bag", "carrier bag", "film"],
    "plastic film", 2, 0.006, 85, "hdpe", [part("Grocery Bag", "film", "recycle", 2)], "tangler"),
  item("bubble-wrap-mailer", "Bubble wrap mailer", ["bubble mailer", "padded envelope", "plastic shipping bag"],
    "plastic film", 4, 0.018, 85, "landfill", [part("All-Plastic Mailer", "film", "recycle", 4)], "tangler"),
  item("aluminum-soda-can", "Aluminum soda can", ["soda can", "aluminium can", "pop can", "drink can"],
    "metal", null, 0.014, 5, "aluminum", [part("Aluminum Can", "aluminum", "recycle")]),
  item("glass-pasta-jar", "Glass pasta sauce jar", ["pasta jar", "sauce jar", "glass jar", "jam jar"],
    "glass", null, 0.24, 8, "glass", [part("Glass Jar", "container-glass", "recycle")]),
  item("lithium-battery", "Lithium-ion battery", ["lithium battery", "lithium cell", "li-ion battery", "rechargeable battery"],
    "battery", null, 0.046, 100, "ewaste", [part("Lithium Battery", "battery", "dropoff")], "thermal-fire"),
  item("swollen-power-bank", "Swollen power bank", ["puffy power bank", "bulging power bank", "swollen lithium power bank",
    "swollen portable charger"],
    "battery", null, 0.2, 100, "ewaste", [part("Damaged Power Bank", "battery", "dropoff")], "thermal-fire"),
  item("usb-charging-cable", "USB charging cable", ["usb cable", "charger cord", "charging wire", "power cord"],
    "e-waste", null, 0.029, 85, "ewaste", [part("Charging Cable", "electronics", "dropoff")], "tangler"),
  item("styrofoam-clamshell", "Styrofoam clamshell", ["polystyrene foam", "eps foam", "foam food box", "styrofoam"],
    "foam", 6, 0.008, 75, "landfill", [part("EPS Clamshell", "eps-foam", "recycle", 6)]),
  item("thermal-receipt", "Thermal receipt", ["store receipt", "till receipt", "receipt", "bpa paper", "bps paper"],
    "paper", null, 0.001, 65, "landfill", [part("Coated Receipt", "thermal-paper", "trash")]),
  item("compostable-pla-cup", "Compostable PLA cup", ["pla cup", "bioplastic cup", "compostable plastic cup"],
    "plastic", 7, 0.012, 80, "landfill", [part("PLA Cup", "pla", "trash", 7)]),
  item("broken-drinking-glass", "Broken drinking glass", ["shattered glass", "broken tumbler", "borosilicate glass"],
    "glass", null, 0.18, 85, "landfill", [part("Broken Drinking Glass", "drinking-glass", "trash")], "sharps"),
  item("steel-soup-can", "Steel soup can", ["tin can", "steel can", "soup can", "food can"],
    "metal", null, 0.048, 8, "steel", [part("Steel Can", "steel", "recycle")]),
  item("greasy-takeout-container", "Greasy takeout container", ["greasy takeaway box", "oily takeout box", "dirty takeaway box"],
    "paper", null, 0.035, 55, "paper", [
      part("Uncoated Paper Takeout Box", "paper", "recycle", null, { contaminatedBy: ["greasy"] }),
    ]),
  item("cotton-tshirt", "Cotton T-shirt", ["cotton tshirt", "tee shirt", "old shirt", "clothing", "textile"],
    "textile", null, 0.17, 55, "landfill", [part("Cotton Shirt", "textile", "dropoff")], "tangler"),
  item("aa-alkaline-battery", "AA alkaline battery", ["aa battery", "single use aa", "alkaline battery"],
    "battery", null, 0.023, 85, "ewaste", [part("Alkaline Battery", "battery", "dropoff")]),
  item("wet-cardboard-box", "Wet cardboard box", ["soggy box", "wet corrugated box", "soaked cardboard"],
    "cardboard", null, 0.24, 60, "cardboard", [
      part("Wet Corrugated Box", "cardboard", "recycle", null, { contaminatedBy: ["wet"] }),
    ]),
  item("shredded-office-paper", "Shredded office paper", ["paper shreds", "shredded documents", "confetti"],
    "paper", null, 0.08, 55, "paper", [
      part("Paper Shreds", "paper", "recycle", null, { contaminatedBy: ["shredded"] }),
    ]),
  item("foil-chip-bag", "Foil chip bag", ["chip bag", "crisp packet", "potato chip packet", "snack wrapper"],
    "wrapper", null, 0.005, 65, "landfill", [part("Multilayer Bag", "laminate", "trash")]),
  item("aerosol-can-empty", "Empty aerosol can", ["empty spray can", "empty deodorant spray"],
    "metal", null, 0.075, 30, "steel", [part("Empty Aerosol Can", "steel", "recycle")]),
  item("aerosol-can-full", "Nonempty aerosol can", ["aerosol can", "spray can", "full aerosol can", "partially full aerosol can"],
    "metal", null, 0.15, 80, "landfill", [part("Pressurized Aerosol Can", "pressurized-aerosol", "dropoff")], "pressure"),
  item("banana-peel", "Banana peel", ["banana skin", "fruit peel", "food scraps"],
    "organics", null, 0.04, 30, "organics", [part("Banana Peel", "food", "compost")]),
  item("eggshells", "Eggshells", ["egg shell", "eggshell", "egg shells"],
    "organics", null, 0.006, 25, "organics", [part("Eggshells", "food", "compost")]),
  item("coffee-grounds", "Used coffee grounds", ["coffee grounds", "spent coffee"],
    "organics", null, 0.04, 25, "organics", [part("Coffee Grounds", "food", "compost")]),
  item("newspaper", "Newspaper", ["newsprint", "daily paper"],
    "paper", null, 0.12, 5, "paper", [part("Dry Newsprint", "paper", "recycle")]),
  item("glass-wine-bottle", "Glass wine bottle", ["wine bottle", "glass bottle"],
    "glass", null, 0.45, 5, "glass", [part("Wine Bottle", "container-glass", "recycle")]),
  item("shampoo-bottle", "HDPE shampoo bottle", ["shampoo bottle", "conditioner bottle"],
    "plastic", 2, 0.035, 10, "hdpe", [part("HDPE Bottle", "rigid-plastic", "recycle", 2)]),
  item("detergent-jug", "Laundry detergent jug", ["detergent bottle", "laundry jug"],
    "plastic", 2, 0.16, 10, "hdpe", [part("Detergent Jug", "rigid-plastic", "recycle", 2)]),
  item("pp-margarine-tub", "Polypropylene margarine tub", ["margarine tub", "butter tub"],
    "plastic", 5, 0.024, 12, "pp", [part("Margarine Tub", "rigid-plastic", "recycle", 5)]),
  item("polystyrene-coffee-lid", "Polystyrene coffee cup lid", ["coffee lid", "ps coffee lid", "plastic cup lid"],
    "plastic", 6, 0.003, 60, "landfill", [part("Polystyrene Lid", "rigid-plastic", "recycle", 6)]),
  item("power-bank", "Power bank", ["portable charger", "battery pack", "powerbank", "lithium power bank"],
    "battery", null, 0.18, 100, "ewaste", [part("Power Bank", "battery", "dropoff")], "thermal-fire"),
  item("computer-mouse", "Wired computer mouse", ["usb mouse", "computer mouse"],
    "e-waste", null, 0.085, 80, "ewaste", [part("Wired Mouse", "electronics", "dropoff")], "tangler"),
  item("paper-towel", "Used paper towel", ["paper towel", "kitchen roll", "dirty napkin"],
    "paper", null, 0.004, 48, "paper", [
      part("Food-Soiled Towel", "paper", "recycle", null, { contaminatedBy: ["food-residue"] }),
    ]),
  item("black-polystyrene-tray", "Black polystyrene takeout tray", ["black takeout tray", "black plastic tray"],
    "plastic", 6, 0.021, 75, "landfill", [part("Black Plastic Tray", "black-plastic", "recycle", 6)]),
];

// Check-digit-valid product samples and restricted-circulation demo codes.
export const SAMPLE_BARCODES = Object.freeze({
  "012000161155": { itemId: "pet-water-bottle", label: "PET still water bottle" },
  "049000042566": { itemId: "aluminum-soda-can", label: "Aluminum cola can" },
  "020000315744": { itemId: "hdpe-milk-jug", label: "HDPE whole milk jug" },
  "070470003016": { itemId: "yogurt-tub-foil", label: "Yogurt with foil seal" },
  "020000522142": { itemId: "tetra-pak-carton", label: "Shelf-stable juice carton" },
  "020000684321": { itemId: "glass-pasta-jar", label: "Glass tomato sauce jar" },
  "2000000715285": { itemId: "steel-soup-can", label: "Steel tomato soup can" },
  "2000000829418": { itemId: "foil-chip-bag", label: "Foil-lined potato chip bag" },
  "2000000965307": { itemId: "shampoo-bottle", label: "HDPE shampoo bottle" },
  "2000001094273": { itemId: "aa-alkaline-battery", label: "AA alkaline battery" },
  "2000001158234": { itemId: "pp-margarine-tub", label: "PP margarine tub" },
  "2000001382714": { itemId: "power-bank", label: "Lithium-ion portable charger" },
});

const itemsById = new Map(WASTE_ITEMS.map(entry => [entry.id, entry]));
export const getItemById = id => itemsById.get(id) ?? null;

export function getItemByBarcode(code) {
  if (typeof code !== "string") return null;
  // The scanner demo still exposes this legacy code with a non-GTIN check digit.
  const key = code.trim().replace(/^4895228411024$/, "2000001382714").replace(/^0(?=\d{12}$)/, "");
  return Object.hasOwn(SAMPLE_BARCODES, key) ? getItemById(SAMPLE_BARCODES[key].itemId) : null;
}

function tokenize(value) {
  const words = value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/#\s+/g, "#");
  return (words.match(/#\d+|[a-z0-9]+/g) ?? []).map(word => {
    if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
    return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
  });
}

const fillers = new Set(["a", "an", "the", "with", "of", "my", "how", "do", "i", "recycle", "please"]);
const searchIndex = WASTE_ITEMS.map(entry => {
  const resins = [entry.resinCode, ...entry.parts.flatMap(component =>
    [component.resinCode, ...(component.alternateResinCodes ?? [])])];
  const fields = [[entry.id, 12], [entry.name, 10], ...entry.aliases.map(alias => [alias, 8]),
    [entry.category, 3], ...resins.filter(Boolean).map(resin => [`#${resin}`, 4])];
  return { entry, fields: fields.map(([field, weight]) => ({ tokens: tokenize(field), weight })) };
});

export function findItemMatches(query) {
  if (typeof query !== "string") return [];
  const phrase = tokenize(query);
  const terms = [...new Set(phrase.filter(term => !fillers.has(term)))];
  if (!terms.length) return [];

  return searchIndex.flatMap(({ entry, fields }) => {
    const weights = terms.map(term => Math.max(0, ...fields.filter(field => field.tokens.includes(term))
      .map(field => field.weight)));
    if (weights.includes(0)) return [];
    const exact = Math.max(0, ...fields.filter(field => field.tokens.join(" ") === phrase.join(" "))
      .map(field => field.weight));
    return [{ entry, score: exact * 100 + weights.reduce((total, weight) => total + weight, 0) }];
  }).sort((left, right) => right.score - left.score).map(({ entry }) => entry);
}
