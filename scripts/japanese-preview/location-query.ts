import { readPreviewLocation } from './navigation.ts';

/** Product query readers see only the validated route in this opaque document. */
export const qaLocationQuery = {
  get search() {
    const query = readPreviewLocation(location.hash).query.toString();
    return query ? `?${query}` : '';
  },
};
