const ALLOWED_BUCKET = 'user-garden-media';

function requireStorageClient(supabase) {
  if (!supabase?.storage || typeof supabase.storage.from !== 'function') {
    throw new Error('supabase_storage_client_required');
  }
}

function requirePath(path) {
  const value=String(path ?? '').trim();
  if (!value) throw new Error('garden_media_storage_path_required');
  if (value.startsWith('data:')) throw new Error('garden_media_data_url_forbidden');
  if (value.includes('..')) throw new Error('garden_media_path_traversal_forbidden');
  return value;
}

function requireTtl(value) {
  const n=Number(value);
  if (!Number.isInteger(n) || n < 30 || n > 3600) {
    throw new Error('invalid_signed_url_ttl');
  }
  return n;
}

export function createGardenMediaUrlResolver(supabase,{expiresIn=300}={}) {
  requireStorageClient(supabase);
  const ttl=requireTtl(expiresIn);

  async function resolveStorageRef({storageBucket,storagePath}={}) {
    if (storageBucket !== ALLOWED_BUCKET) {
      throw new Error('garden_media_bucket_not_allowed');
    }
    const path=requirePath(storagePath);

    const {data,error}=await supabase.storage
      .from(ALLOWED_BUCKET)
      .createSignedUrl(path,ttl);

    if (error) {
      const code=error.code ? ':'+error.code : '';
      throw new Error('garden_media_signed_url_failed'+code+':'+(error.message || 'unknown'));
    }

    const signedUrl=data?.signedUrl ?? data?.signedURL ?? null;
    if (!signedUrl) throw new Error('garden_media_signed_url_missing');

    return Object.freeze({
      signedUrl,
      expiresIn:ttl,
      bucket:ALLOWED_BUCKET,
      storagePath:path,
    });
  }

  async function resolveCover(cover) {
    if (!cover || cover.kind !== 'personal') return null;
    return resolveStorageRef({
      storageBucket:cover.storageBucket,
      storagePath:cover.storagePath,
    });
  }

  async function resolveCards(cards=[]) {
    const out=new Map();
    for (const card of cards) {
      if (!card?.id) throw new Error('media_resolver_card_id_required');
      const resolved=await resolveCover(card.cover);
      if (resolved) out.set(card.id,resolved);
    }
    return out;
  }

  return Object.freeze({
    resolveStorageRef,
    resolveCover,
    resolveCards,
  });
}

export const GARDEN_MEDIA_PRIVATE_BUCKET=ALLOWED_BUCKET;
