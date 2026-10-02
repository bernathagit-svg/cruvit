export const MY_PLANTS_APPROVED_LAYOUT = Object.freeze({
  viewport: Object.freeze({
    width: 941,
    height: 1672,
    aspectRatio: '941/1672',
  }),
  slots: Object.freeze([
    Object.freeze({ plantKey:'lemon-01', left:5.207226, top:24.401914, width:27.736451, height:9.688995, cameraLeft:28.374070, cameraTop:25.000000 }),
    Object.freeze({ plantKey:'olive-01', left:35.387885, top:24.401914, width:27.842721, height:9.688995, cameraLeft:58.660999, cameraTop:25.000000 }),
    Object.freeze({ plantKey:'lavender-01', left:65.781084, top:24.401914, width:27.842721, height:9.688995, cameraLeft:89.054198, cameraTop:25.000000 }),
    Object.freeze({ plantKey:'rosemary-01', left:5.207226, top:42.822967, width:27.736451, height:9.688995, cameraLeft:28.374070, cameraTop:43.421053 }),
    Object.freeze({ plantKey:'hydrangea-01', left:35.387885, top:42.822967, width:27.842721, height:9.688995, cameraLeft:58.660999, cameraTop:43.421053 }),
    Object.freeze({ plantKey:'bougainvillea-01', left:65.781084, top:42.822967, width:27.842721, height:9.688995, cameraLeft:89.054198, cameraTop:43.421053 }),
    Object.freeze({ plantKey:'agave-01', left:5.207226, top:62.141148, width:27.736451, height:9.868421, cameraLeft:28.374070, cameraTop:62.739234 }),
    Object.freeze({ plantKey:'bird-01', left:35.387885, top:62.141148, width:27.842721, height:9.868421, cameraLeft:58.660999, cameraTop:62.739234 }),
    Object.freeze({ plantKey:'mint-01', left:65.781084, top:62.141148, width:27.842721, height:9.868421, cameraLeft:89.054198, cameraTop:62.739234 }),
  ]),
  lemonOpen: Object.freeze({
    left:4.569607,
    top:23.325359,
    width:29.436769,
    height:16.387560,
    borderRadiusPx:26,
  }),
  detail: Object.freeze({
    back: Object.freeze({ left:5.100956, top:0.897129, width:20.191286, height:3.588517 }),
    heroUserPhoto: Object.freeze({ left:44.633369, top:0, width:55.366631, height:26.555024 }),
    heroFade: Object.freeze({ left:41.976621, top:0, width:11.158342, height:26.555024 }),
    cardUserPhoto: Object.freeze({ left:7.651435, top:31.638756, width:38.150903, height:19.258373 }),
    detailCamera: Object.freeze({ left:70.563231, top:1.136364, widthPx:50, heightPx:50 }),
    cardCamera: Object.freeze({ left:38.894793, top:47.009569, widthPx:44, heightPx:44 }),
  }),
});

export function percentStyle(box) {
  const parts=[];
  for (const key of ['left','top','width','height']) {
    if (box[key] != null) parts.push(key+':'+Number(box[key]).toFixed(6)+'%');
  }
  return parts.join(';');
}

export function slotByIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= MY_PLANTS_APPROVED_LAYOUT.slots.length) {
    throw new Error('invalid_my_plants_slot_index');
  }
  return MY_PLANTS_APPROVED_LAYOUT.slots[index];
}
