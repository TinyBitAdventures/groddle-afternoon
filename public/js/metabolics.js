/**
 * Metabolic maximums (players/inc_metabolics.js metabolics_recalc_limits):
 * energy and mood share one maximum, the imagination-era tank
 * (metabolics_calc_max returns metabolics_get_tank()). The remake keeps the
 * tank in pc.energyMax (100 plus Energy Tank cards), so mood tops out there too.
 */
export function moodMax(pc) {
  return Math.max(100, Number(pc?.energyMax) || 100);
}

export function energyMax(pc) {
  return Math.max(100, Number(pc?.energyMax) || 100);
}
