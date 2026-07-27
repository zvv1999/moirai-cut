/**
 * Byte uploads are registered by the media route so they can be served back.
 * A proxied still's archived original is intentionally not an editor asset,
 * though, and must not survive in the public index as a metadata-less stub.
 */
export function omitArchivedOriginalStub({ index, assetId }) {
  const cleaned = { ...index };
  delete cleaned[`${assetId}-original`];
  return cleaned;
}
