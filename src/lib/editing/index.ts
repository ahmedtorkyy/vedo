export { detectSilence } from './silence-detection'
export type { SilenceDetectionOptions } from './silence-detection'
export {
  detectFillerWords,
  detectRepeatedPhrases,
  detectLowEnergySections,
} from './analysis-engine'
export type { LowEnergyOptions } from './analysis-engine'
export { useEditingStore } from './editing-store'
export {
  filterSilenceSegments,
  generateTrimFilters,
  buildTrimCommand,
  getEffectiveOptions,
} from './smart-cut'
export { recommendModel, detectDeviceTierSync } from './device-capability'
export type { DeviceTier, ModelKey } from './device-capability'
