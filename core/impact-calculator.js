// Contest estimates in kg CO2e saved per kg diverted, informed by EPA WARM v16.
// Values are illustrative proxies across routes and materials, including e-waste.
// WARM models differences between a baseline and a specified management scenario.
// https://www.epa.gov/waste-reduction-model/documentation-chapters-emissions-energy-and-economic-factors-used-waste
export const EPA_WARM_FACTORS = Object.freeze({
  aluminum: 9.1,
  steel: 1.8,
  cardboard: 3.1,
  paper: 3.5,
  pet: 1.0,
  hdpe: 0.8,
  pp: 0.9,
  glass: 0.3,
  organics: 0.5,
  ewaste: 4.2,
  landfill: 0,
});

const DIVERSION_BINS = new Set(["recycle", "compost", "dropoff"]);
const round = (value, places) => Number(value.toFixed(places));
const percent = (count, total) => total ? round(count / total * 100, 1) : 0;

function divertedImpact(item, bin) {
  const { baseWeightKg, epaMaterialKey } = item;
  const eligible = DIVERSION_BINS.has(bin) && !item.splitRequired;
  const mass = eligible && Number.isFinite(baseWeightKg) && baseWeightKg > 0 ? baseWeightKg : 0;
  const factor = Object.hasOwn(EPA_WARM_FACTORS, epaMaterialKey) ? EPA_WARM_FACTORS[epaMaterialKey] : 0;
  return { mass, co2e: mass * factor };
}

export function estimateItemImpact(triageResult) {
  const { mass, co2e } = divertedImpact(triageResult, triageResult.primaryBin);
  return { divertedMassKg: round(mass, 2), avoidedCo2eKg: round(co2e, 2) };
}

export function summarizeAuditImpact(entries) {
  let correctlySortedCount = 0;
  let wishcyclingInterceptedCount = 0;
  let criticalHazardCount = 0;
  let divertedCount = 0;
  let divertedMass = 0;
  let avoidedCo2e = 0;
  const contaminants = new Map();

  for (const entry of entries) {
    const recommendedBin = entry.recommendedBin ?? entry.primaryBin;
    // One recorded bin cannot establish that a required split was done.
    const correct = entry.observedBin === recommendedBin && !entry.splitRequired;
    const critical = entry.hazardLevel === "critical";
    if (critical) criticalHazardCount++;
    if (correct) {
      correctlySortedCount++;
      if (DIVERSION_BINS.has(recommendedBin)) {
        divertedCount++;
        const { mass, co2e } = divertedImpact(entry, recommendedBin);
        divertedMass += mass;
        avoidedCo2e += co2e;
      }
    } else if (entry.observedBin === "recycle") {
      wishcyclingInterceptedCount++;
    }

    if (!correct || critical || entry.hazardLevel === "high" || entry.contaminationRisk >= 80) {
      const itemId = entry.itemId;
      const risk = critical ? 100 : entry.contaminationRisk ?? 0;
      const current = contaminants.get(itemId);
      const prepFix = entry.prepFix || entry.prepSteps?.join(" ") ||
        `Use the recommended ${recommendedBin} stream.`;
      if (current) {
        current.count++;
        if (risk > current.risk) Object.assign(current, { risk, prepFix });
      } else {
        contaminants.set(itemId, { itemId, itemName: entry.itemName, count: 1, risk, prepFix });
      }
    }
  }

  const totalItems = entries.length;
  const contaminatedOrMisroutedCount = totalItems - correctlySortedCount;
  const contaminationRatePct = percent(contaminatedOrMisroutedCount, totalItems);
  const topContaminants = [...contaminants.values()]
    .sort((left, right) => right.count - left.count || right.risk - left.risk)
    .slice(0, 3).map(({ itemId, itemName, count, prepFix }) => ({ itemId, itemName, count, prepFix }));

  return {
    totalItems, correctlySortedCount, contaminatedOrMisroutedCount, wishcyclingInterceptedCount, criticalHazardCount,
    contaminationRatePct,
    diversionRatePct: percent(divertedCount, totalItems),
    divertedMassKg: round(divertedMass, 2),
    avoidedCo2eKg: round(avoidedCo2e, 2),
    loadRejectionRisk: criticalHazardCount > 0 || contaminationRatePct >= 20 ? "high"
      : contaminationRatePct >= 8 ? "medium" : "low",
    topContaminants,
  };
}
