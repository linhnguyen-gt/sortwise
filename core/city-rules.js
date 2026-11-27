const FLAGS = [
  "acceptsCartons", "acceptsFilm", "acceptsBlackPlastic", "acceptsStyrofoam",
  "hasCompost", "compostAcceptsSoiledPaper",
];
const REQUIRED_BINS = ["recycle", "compost", "trash", "dropoff"];
const OPTIONAL_LABELS = ["paperRecycle", "filmDropoff"];

function freezeRulepack(rulepack) {
  return Object.freeze({
    ...rulepack,
    bins: Object.freeze(rulepack.bins),
    acceptedResins: Object.freeze(rulepack.acceptedResins),
  });
}

function municipalRulepack(id, name, region, bins, sourceNote, overrides = {}) {
  return freezeRulepack({
    id, name, region, bins, sourceNote,
    acceptedResins: [1, 2, 5],
    acceptsCartons: true,
    acceptsFilm: false,
    acceptsBlackPlastic: false,
    acceptsStyrofoam: false,
    hasCompost: true,
    compostAcceptsSoiledPaper: true,
    acceptsLinedPaperCups: false,
    ...overrides,
  });
}

const cities = [
  municipalRulepack("san-francisco", "San Francisco, CA", "California, US", {
    recycle: "Blue recycling bin",
    compost: "Green curbside compost bin",
    trash: "Black landfill bin",
    dropoff: "Special waste drop-off",
  }, "Contest profile based on SF Environment's three-stream guide: " +
    "https://www.sfenvironment.org/blog/where-san-franciscos-recyclables-go"),
  municipalRulepack("new-york", "New York City, NY", "New York, US", {
    recycle: "Blue metal, glass, plastic and cartons bin",
    paperRecycle: "Green clean paper and cardboard bin",
    compost: "Brown curbside organics bin",
    trash: "Landfill trash",
    dropoff: "Special waste drop-off",
  }, "Three demo resins; DSNY accepts most rigid plastics regardless of resin number: " +
    "https://www.nyc.gov/site/dsny/collection/get-rid-of/metal-glass-plastic-cartons.page"),
  municipalRulepack("seattle", "Seattle, WA", "Washington, US", {
    recycle: "Recycling cart",
    compost: "Food and yard waste cart",
    trash: "Garbage cart",
    dropoff: "Special waste drop-off",
  }, "Contest profile based on Seattle Public Utilities' sorting guide: " +
    "https://www.seattle.gov/utilities/your-services/collection-and-disposal/where-does-it-go"),
  municipalRulepack("austin", "Austin, TX", "Texas, US", {
    recycle: "Blue single-stream recycling cart",
    compost: "Green curbside compost cart",
    trash: "Landfill trash cart",
    dropoff: "Special waste drop-off",
  }, "Austin Resource Recovery includes cartons and coated paper cups: " +
    "https://www.austintexas.gov/resource-recovery/programs/residential-recycling-collection",
  { acceptsLinedPaperCups: true }),
  municipalRulepack("london", "London, UK", "England, UK", {
    recycle: "Dry mixed recycling",
    compost: "Food waste caddy",
    trash: "Residual waste",
    dropoff: "Household recycling centre",
  }, "Representative London profile; collection varies by borough and building: " +
    "https://londonrecycles.co.uk/recycling-101/food-recycling/",
  { compostAcceptsSoiledPaper: false }),
  municipalRulepack("ho-chi-minh", "Ho Chi Minh City, VN", "Vietnam", {
    recycle: "Clean recyclables for local collectors or drop-off",
    compost: "Organic waste where separately collected",
    trash: "Organic/general residual waste",
    dropoff: "Dedicated e-waste and battery drop-off",
  }, "Contest recovery profile; verify ward collection and accepted materials locally. " +
    "Household e-waste collection: https://vietnamrecycles.com/en/for-households",
  { acceptsCartons: false, hasCompost: false, compostAcceptsSoiledPaper: false }),
];

export const CITY_IDS = Object.freeze(cities.map(({ id }) => id));
export const CITY_RULEPACKS = Object.freeze(Object.fromEntries(cities.map(city => [city.id, city])));

export function listCities() {
  return [...cities];
}

export function getCity(cityId) {
  return typeof cityId === "string" && Object.hasOwn(CITY_RULEPACKS, cityId)
    ? CITY_RULEPACKS[cityId]
    : null;
}

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isLabel = value => typeof value === "string" && value.trim().length > 0;
const invalid = (field, reason) => ({ ok: false, reason, field });

export function validateCustomRulepack(input) {
  let raw = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return invalid("rulepack", "Enter valid JSON for the custom rulepack.");
    }
  }
  if (!isRecord(raw)) return invalid("rulepack", "The rulepack must be an object.");

  for (const field of ["id", "name"]) {
    if (!Object.hasOwn(raw, field) || !isLabel(raw[field])) {
      return invalid(field, "Enter a non-empty string.");
    }
  }

  const resins = raw.acceptedResins;
  if (!Object.hasOwn(raw, "acceptedResins") || !Array.isArray(resins) ||
      Array.from(resins).some(code => !Number.isInteger(code) || code < 1 || code > 7)) {
    return invalid("acceptedResins", "Enter an array of integer resin codes from 1 to 7.");
  }
  for (const field of FLAGS) {
    if (!Object.hasOwn(raw, field) || typeof raw[field] !== "boolean") {
      return invalid(field, "Enter true or false.");
    }
  }
  if (Object.hasOwn(raw, "acceptsLinedPaperCups") && typeof raw.acceptsLinedPaperCups !== "boolean") {
    return invalid("acceptsLinedPaperCups", "Enter true or false.");
  }

  if (!Object.hasOwn(raw, "bins") || !isRecord(raw.bins)) {
    return invalid("bins", "Enter an object with the four bin labels.");
  }
  const bins = {};
  for (const bin of REQUIRED_BINS.concat(OPTIONAL_LABELS.filter(bin => Object.hasOwn(raw.bins, bin)))) {
    if (!Object.hasOwn(raw.bins, bin) || !isLabel(raw.bins[bin])) {
      return invalid(`bins.${bin}`, "Enter a non-empty bin label.");
    }
    bins[bin] = raw.bins[bin].trim();
  }
  for (const field of ["region", "sourceNote"]) {
    if (Object.hasOwn(raw, field) && !isLabel(raw[field])) {
      return invalid(field, "Enter a non-empty string.");
    }
  }

  return {
    ok: true,
    rulepack: freezeRulepack({
      id: raw.id.trim(),
      name: raw.name.trim(),
      region: Object.hasOwn(raw, "region") ? raw.region.trim() : "Custom",
      bins,
      acceptedResins: [...new Set(resins)],
      ...Object.fromEntries(FLAGS.map(field => [field, raw[field]])),
      acceptsLinedPaperCups: Object.hasOwn(raw, "acceptsLinedPaperCups") && raw.acceptsLinedPaperCups,
      sourceNote: Object.hasOwn(raw, "sourceNote") ? raw.sourceNote.trim() : "User-supplied sorting rules.",
    }),
  };
}
