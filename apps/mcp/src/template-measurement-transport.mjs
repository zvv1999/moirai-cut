/** Native fixture version selects the wire contract. Older resumed projects
 * may have different generated IDs and must remain explicitly unmeasured. */
export function productionMeasurementAttachment(fixture, job) {
  if (fixture.textMeasurementContractVersion !== 1) return {};
  return job.textMeasurements ? {textMeasurements:job.textMeasurements} : {};
}

/** Versioned fixtures must keep the exact source identities validated natively. */
export function productionCompilationDocument(fixture, compilation) {
  return fixture.textMeasurementContractVersion === 1 ? fixture.compilation.document : compilation.document;
}
