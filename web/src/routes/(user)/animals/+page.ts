import { authenticate } from '$lib/utils/auth';
import { getAllTags } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const tags = await getAllTags();

  return {
    tags,
    meta: {
      title: 'Cats',
    },
  };
}) satisfies PageLoad;
