const APPROVED = Object.freeze({
  'my-garden-home':'ca1a929b0226d46b8ae75a8b160fdc8780dd9d2f84f9f419ee4b47410f3bd676',
  'my-plants':'64ddc9c59a62482c4050159a8a9109d19a71d1a777ebafc888d6d598d8b531d5',
  'plant-overview':'eab2a113e2a14d11eef09e8e4bbca31bb373c4034a0ab77b9bd651237def7b5a',
  'plant-care':'5881d6f3856b8b7d3b1ea8177c5812e64042ed17f1caf74293a9ee70c4316c7a',
  'plant-schedule':'ad56e981c75e407a5601190fdf3ac212fe5607e39bec94d52c683d9aa58dea75',
  'plant-history':'a9be08e731153677bbc4a89291c603cdbfeaac576b3a67ac41d83a2c783dbfa2',
  'add-plant':'aba9460f2caae847dbcf1017abbb71e2c1c9a986e5de89cc27ffdcfe189dbd7b',
  'upcoming-list':'03cca6920c02e4ec191f9dc1d8cfa197a4c1913a6da9b31af9e1a3b2385d7430',
  'upcoming-calendar':'322b3ef6c07203be8c5547930bd0a95ce2e79fb8824d01f7b1319f012212b4db',
  'garden-journal':'39017bb6c981198637e34dd8b2d8faadd7668d8f50a00c2e57c7c7e80749758a',
  'notifications':'36110c332c519ad959a173bd5fe6c1175308c847ff491ff5d02064549edf32d7',
});

export function createVisualAcceptanceRecord({
  screenId,
  referenceSha256,
  implementationCommit,
  viewport,
  screenshotSha256,
  comparison,
  ownerApproved=false,
}={}) {
  if (!APPROVED[screenId]) throw new Error('unknown_visual_screen:'+String(screenId ?? ''));
  if (referenceSha256 !== APPROVED[screenId]) {
    throw new Error('approved_reference_mismatch:'+screenId);
  }
  if (!implementationCommit) throw new Error('implementation_commit_required');
  if (!viewport?.width || !viewport?.height) throw new Error('visual_viewport_required');
  if (!/^[a-f0-9]{64}$/.test(String(screenshotSha256 ?? ''))) {
    throw new Error('screenshot_sha256_required');
  }
  if (!comparison || typeof comparison !== 'object') {
    throw new Error('visual_comparison_required');
  }

  const pass =
    comparison.layout === 'pass' &&
    comparison.typography === 'pass' &&
    comparison.color === 'pass' &&
    comparison.imagery === 'pass' &&
    comparison.spacing === 'pass' &&
    comparison.navigation === 'pass';

  return Object.freeze({
    screenId,
    referenceSha256,
    implementationCommit,
    viewport:Object.freeze({...viewport}),
    screenshotSha256,
    comparison:Object.freeze({...comparison}),
    automatedVisualPass:pass,
    ownerApproved:ownerApproved === true,
    state:pass && ownerApproved === true
      ? 'LOCKED_IMPLEMENTED'
      : pass
        ? 'AWAITING_OWNER_APPROVAL'
        : 'VISUAL_FIX_REQUIRED',
  });
}

export function canMarkScreenImplemented(record) {
  return record?.state === 'LOCKED_IMPLEMENTED';
}

export const APPROVED_VISUAL_SHA = APPROVED;
