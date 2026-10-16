// Exact authorized observer additions only. Legacy preservation assertions retain every other byte.
const edits = [
  [
    "import {createPiAcceptedReviewPublication} from './modules/plant-identifier/accepted-review-publication-v1.js';\nconst acceptedPiReview = createPiAcceptedReviewPublication({window});\nObject.defineProperty(window,'cruvitCorePiAcceptedReview',{value:Object.freeze({read:acceptedPiReview.read})});\n",
    ""
  ],
  [
    "  evaluateSuitability: slug => evaluateIdentifierGardenSuitability(slug),\n  reviewObserver: acceptedPiReview.observer\n",
    "  evaluateSuitability: slug => evaluateIdentifierGardenSuitability(slug)\n"
  ],
  [
    "    document.body.appendChild(corePiFrame); acceptedPiReview.bind(corePiFrame); corePiHandoff.bind(corePiFrame);\n",
    "    document.body.appendChild(corePiFrame); corePiHandoff.bind(corePiFrame);\n"
  ],
  [
    "  close() { acceptedPiReview.unbind(); corePiHandoff.unbind(); corePiFrame?.remove(); corePiFrame = null; }\n",
    "  close() { corePiHandoff.unbind(); corePiFrame?.remove(); corePiFrame = null; }\n"
  ],
  [
    "// Read-only acceptance surface: no emit, setter, garden input, or Save behavior.\nObject.defineProperty(window,'cruvitCorePiReviewSurface',{value:Object.freeze({\n read:suitabilityView.readAcceptedReview,subscribe:suitabilityView.observeAcceptedReview\n})});\n",
    ""
  ],
  [
    "  getClimateProfile, getSiteContext, resolveCanonicalPlant, evaluateSuitability, reviewObserver = null}) {\n",
    "  getClimateProfile, getSiteContext, resolveCanonicalPlant, evaluateSuitability}) {\n"
  ],
  [
    "  // Host-only observer. It cannot change child-facing replies or their validation.\n  const observe = (method, value) => { try { reviewObserver?.[method]?.(value); } catch {} };\n",
    ""
  ],
  [
    "    if (request.operation === 'evaluate') observe('pending', {child, operationId: request.requestId});\n",
    ""
  ],
  [
    "    if (request.operation === 'evaluate') {\n      if (result.ok === true && target() === child) {\n        const selected = currentSelection(result.context);\n        observe('validated', {child, operationId: request.requestId, result: copy(result),\n          isCurrent: () => target() === child && currentSelection(context()) === selected});\n      } else observe('invalidate', 'EVALUATION_REJECTED');\n    }\n",
    ""
  ],
  [
    "    observe('invalidate', 'HOST_UNBOUND');\n",
    ""
  ],
  [
    "  let accepted = null, acceptedState = null;\n  const reviewListeners = new Set();\n  const notifyReview = () => { for (const listener of reviewListeners) { try { listener(); } catch {} } };\n  const revokeReview = () => { if (accepted) { accepted = null; acceptedState = null; notifyReview(); } };\n  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };\n  function clear() { if (acceptedState && readState() !== acceptedState) revokeReview(); run = null; current = null; root?.remove(); root = null; slots = null; }\n",
    "  function clear() { run = null; current = null; root?.remove(); root = null; slots = null; }\n"
  ],
  [
    "    revokeReview();\n",
    ""
  ],
  [
    "    revokeReview(); reviewListeners.clear(); clear(); for (const name of events) host?.removeEventListener(name, invalidate);\n",
    "    clear(); for (const name of events) host?.removeEventListener(name, invalidate);\n"
  ],
  [
    "      revokeReview(); clear(); current = state; const task = {}; run = task;\n",
    "      clear(); current = state; const task = {}; run = task;\n"
  ],
  [
    "        .then(result => { if (run === task && readState() === state) {\n          show(result);\n          // Publish only after the existing complete acceptance path and render.\n          if (result.ok === true) {\n            acceptedState = state; accepted = freeze(structuredClone(result)); notifyReview();\n          }\n        } });\n",
    "        .then(result => { if (run === task && readState() === state) show(result); });\n"
  ],
  [
    "    readAcceptedReview() { return acceptedState && readState() === acceptedState ? accepted : null; },\n    observeAcceptedReview(listener) {\n      if (typeof listener !== 'function') throw Error('Read-only observer required');\n      reviewListeners.add(listener); return () => reviewListeners.delete(listener);\n    },\n",
    ""
  ]
];
export function withoutAcceptedReview(source) {
 for (const [added, prior] of edits) if (added && source.includes(added)) source = source.replace(added, prior);
 return source;
}
