/**
 * CRUVIT Garden Design Auto Blend V3
 *
 * Extends V2 with directional lighting and local ground/color spill.
 * Still non-destructive, reversible, zero-paid-AI, generic across species.
 */
import {
  AUTO_BLEND_V2_POLICY,
  GARDEN_DESIGN_AUTO_BLEND_V2_VERSION,
  autoBlendMetadata as autoBlendMetadataV2,
  computeAutoBlendV2,
  sampleLocalGardenV2,
  samplePlantCutoutV2
} from './garden-design-auto-blend-v2.js';

export const GARDEN_DESIGN_AUTO_BLEND_V3_VERSION = 'garden-design-auto-blend-v3';

export const AUTO_BLEND_V3_POLICY = Object.freeze({
  ...AUTO_BLEND_V2_POLICY,
  version:GARDEN_DESIGN_AUTO_BLEND_V3_VERSION,
  directionalLighting:true,
  groundColorSpill:true,
  localSceneOcclusionProxy:true,
  true3DRelighting:false,
  paidCalls:0,
  usesAi:false,
  nonDestructive:true,
  reversible:true
});

function clamp(value,min,max){
  const n=Number(value);
  if(!Number.isFinite(n)) return min;
  return Math.min(max,Math.max(min,n));
}
function finite(value,fallback){
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}
function safeObject(v){
  return v&&typeof v==='object'&&!Array.isArray(v)?v:{};
}
function rgb255(stats){
  const rgb=stats?.meanRgb||{};
  return {
    r:Math.round(clamp(finite(rgb.r,0.5),0,1)*255),
    g:Math.round(clamp(finite(rgb.g,0.5),0,1)*255),
    b:Math.round(clamp(finite(rgb.b,0.5),0,1)*255)
  };
}
function luma(stat,fallback){
  return stat?.available===true?finite(stat.luminance,fallback):fallback;
}

export function computeDirectionalLightingV3(scene={}) {
  const d=safeObject(scene.directional);
  const left=luma(d.left,finite(scene.luminance,0.5));
  const right=luma(d.right,finite(scene.luminance,0.5));
  const top=luma(d.top,finite(scene.luminance,0.5));
  const bottom=luma(d.bottom,finite(scene.luminance,0.5));

  const dx=right-left;
  const dy=bottom-top;
  const magnitude=Math.sqrt(dx*dx+dy*dy);
  const angleDeg=Math.atan2(dy,dx)*180/Math.PI;

  return {
    angleDeg,
    magnitude,
    highlightOpacity:clamp(0.045+magnitude*0.55,0.04,0.13),
    shadeOpacity:clamp(0.055+magnitude*0.65,0.05,0.16),
    highlightStrength:clamp(1.08+magnitude*0.50,1.08,1.18),
    shadeStrength:clamp(0.90-magnitude*0.35,0.80,0.90),
    source:magnitude>0.015?'directional-scene-gradient':'low-gradient-conservative'
  };
}

export function computeGroundSpillV3(scene={}) {
  const ground=scene?.ground?.available===true?scene.ground:scene;
  const rgb=rgb255(ground);
  const l=finite(ground?.luminance,0.45);
  const sat=finite(ground?.saturation,0.25);
  return {
    color:rgb,
    colorAlpha:clamp(0.08+(1-l)*0.08+sat*0.03,0.08,0.18),
    coveragePct:clamp(16+(1-l)*8,16,24),
    occlusionOpacity:clamp(0.14+(1-l)*0.10,0.14,0.24),
    occlusionBlurPx:clamp(3.5+(1-finite(ground?.contrast,0.18))*3,3.5,7.5)
  };
}

export function computeAutoBlendV3(scene={},plant={},options={}) {
  const base=computeAutoBlendV2(scene,plant,options);
  const directional=computeDirectionalLightingV3(scene);
  const groundSpill=computeGroundSpillV3(scene);

  // V3 intentionally avoids pushing saturation upward beyond the scene.
  const adaptation={
    ...base.adaptation,
    saturate:Math.min(0.96,finite(base.adaptation?.saturate,0.9)),
    blurPx:clamp(finite(base.adaptation?.blurPx,0.3)*1.08,0.14,1.15),
    opacity:clamp(finite(base.adaptation?.opacity,0.985),0.96,0.995)
  };

  const shadow={
    ...base.shadow,
    opacity:clamp(finite(base.shadow?.opacity,0.24)*1.06,0.17,0.38),
    ambientOcclusionOpacity:clamp(
      Math.max(
        finite(base.shadow?.ambientOcclusionOpacity,0.14),
        groundSpill.occlusionOpacity
      ),
      0.14,0.24
    ),
    ambientOcclusionBlurPx:groundSpill.occlusionBlurPx
  };

  return {
    ...base,
    enabled:true,
    version:GARDEN_DESIGN_AUTO_BLEND_V3_VERSION,
    source:'plant-to-scene-directional-match',
    adaptation,
    shadow,
    directionalLighting:directional,
    groundSpill,
    paidCalls:0,
    nonDestructive:true
  };
}

export function autoBlendMetadata(layer={}) {
  const metadata=safeObject(layer.metadata);
  const v3=safeObject(metadata.autoBlendV3);
  if(Object.keys(v3).length){
    return {
      enabled:v3.enabled===true,
      version:v3.version||GARDEN_DESIGN_AUTO_BLEND_V3_VERSION,
      source:v3.source||null,
      adaptation:safeObject(v3.adaptation),
      shadow:safeObject(v3.shadow),
      scene:safeObject(v3.scene),
      plant:safeObject(v3.plant),
      directionalLighting:safeObject(v3.directionalLighting),
      groundSpill:safeObject(v3.groundSpill)
    };
  }
  return autoBlendMetadataV2(layer);
}

export function writeAutoBlendMetadata(layer={},result={}) {
  const metadata=safeObject(layer.metadata);
  layer.metadata={
    ...metadata,
    autoBlendV3:{
      enabled:result.enabled===true,
      version:GARDEN_DESIGN_AUTO_BLEND_V3_VERSION,
      source:result.source||null,
      adaptation:safeObject(result.adaptation),
      shadow:safeObject(result.shadow),
      scene:safeObject(result.scene),
      plant:safeObject(result.plant),
      directionalLighting:safeObject(result.directionalLighting),
      groundSpill:safeObject(result.groundSpill),
      sampledAtPlacement:result.sampledAtPlacement||null,
      recalculatesAfterMove:true,
      paidCalls:0,
      nonDestructive:true
    }
  };
  return layer;
}

export function disableAutoBlend(layer={}) {
  const current=autoBlendMetadata(layer);
  writeAutoBlendMetadata(layer,{
    enabled:false,
    source:current.source,
    adaptation:current.adaptation,
    shadow:current.shadow,
    scene:current.scene,
    plant:current.plant,
    directionalLighting:current.directionalLighting,
    groundSpill:current.groundSpill
  });
  return layer;
}

export async function calculateAutoBlendForLayer(options={}) {
  const [scene,plant]=await Promise.all([
    sampleLocalGardenV2(options),
    samplePlantCutoutV2(options)
  ]);
  const layerEl=options.layerEl;
  const sceneEl=options.sceneEl;
  const result=computeAutoBlendV3(scene,plant,{
    sceneHeightPx:sceneEl?.getBoundingClientRect?.().height,
    layerHeightPx:layerEl?.getBoundingClientRect?.().height,
    placementX:options.layer?.x,
    placementY:options.layer?.y
  });
  if(options.layer) writeAutoBlendMetadata(options.layer,result);
  return result;
}

export function blendFilterCss(blend={}) {
  const a=safeObject(blend.adaptation);
  const edge=safeObject(a.edgeTintColor);
  const r=Math.round(clamp(finite(edge.r,128),0,255));
  const g=Math.round(clamp(finite(edge.g,128),0,255));
  const b=Math.round(clamp(finite(edge.b,128),0,255));
  return [
    'brightness('+clamp(finite(a.brightness,0.96),0.82,1.08)+')',
    'contrast('+clamp(finite(a.contrast,0.93),0.82,1.05)+')',
    'saturate('+clamp(finite(a.saturate,0.88),0.70,0.96)+')',
    'sepia('+clamp(finite(a.sepia,0),0,0.09)+')',
    'hue-rotate('+clamp(finite(a.hueRotateDeg,0),-3,3)+'deg)',
    'blur('+clamp(finite(a.blurPx,0.32),0.14,1.15)+'px)',
    'drop-shadow(0 0 '+clamp(finite(a.edgeTintBlurPx,0.55),0.35,1.0)
      +'px rgba('+r+','+g+','+b+','+clamp(finite(a.edgeTintAlpha,0.14),0.08,0.24)+'))'
  ].join(' ');
}

function removeIntegrationOverlays(layerEl){
  layerEl.querySelectorAll('.gd-blend-directional-overlay,.gd-blend-ground-spill').forEach(el=>el.remove());
}

function ensureMaskedOverlay(layerEl,img,className){
  let el=layerEl.querySelector('.'+className);
  if(!el){
    el=document.createElement('div');
    el.className=className;
    const wrap=img.closest('.gd-plant-sprite-wrap')||layerEl;
    wrap.appendChild(el);
  }
  const src=img.currentSrc||img.src||'';
  const mask='url("'+src.replace(/"/g,'\\\"')+'")';
  Object.assign(el.style,{
    position:'absolute',
    inset:'0',
    pointerEvents:'none',
    WebkitMaskImage:mask,
    maskImage:mask,
    WebkitMaskSize:'contain',
    maskSize:'contain',
    WebkitMaskRepeat:'no-repeat',
    maskRepeat:'no-repeat',
    WebkitMaskPosition:'center bottom',
    maskPosition:'center bottom'
  });
  return el;
}

export function applyAutoBlendToLayerElement(layer={},layerEl=null){
  if(!layerEl) return {applied:false,reason:'LAYER_ELEMENT_REQUIRED'};
  const blend=autoBlendMetadata(layer);
  const img=layerEl.querySelector('img.gd-plant-cutout');
  const shadow=layerEl.querySelector('.gd-plant-shadow');
  layerEl.classList.toggle('gd-auto-blended',blend.enabled===true);

  if(!blend.enabled){
    if(img){
      img.style.removeProperty('filter');
      img.style.removeProperty('opacity');
    }
    if(shadow){
      shadow.removeAttribute('style');
    }
    removeIntegrationOverlays(layerEl);
    return {applied:false,reason:'DISABLED'};
  }

  if(img){
    img.style.filter=blendFilterCss(blend);
    img.style.opacity=String(clamp(finite(blend.adaptation?.opacity,0.985),0.95,0.995));

    const directional=ensureMaskedOverlay(layerEl,img,'gd-blend-directional-overlay');
    const dl=safeObject(blend.directionalLighting);
    const angle=finite(dl.angleDeg,0);
    const hi=clamp(finite(dl.highlightOpacity,0.06),0.03,0.14);
    const shade=clamp(finite(dl.shadeOpacity,0.08),0.04,0.17);
    directional.style.background=
      'linear-gradient('+(angle+90)+'deg,'
      +'rgba(255,255,255,'+hi+') 0%,'
      +'rgba(255,255,255,0) 48%,'
      +'rgba(0,0,0,'+shade+') 100%)';
    directional.style.mixBlendMode='soft-light';
    directional.style.opacity='1';

    const ground=ensureMaskedOverlay(layerEl,img,'gd-blend-ground-spill');
    const gs=safeObject(blend.groundSpill);
    const color=safeObject(gs.color);
    const r=Math.round(clamp(finite(color.r,128),0,255));
    const g=Math.round(clamp(finite(color.g,128),0,255));
    const b=Math.round(clamp(finite(color.b,128),0,255));
    const alpha=clamp(finite(gs.colorAlpha,0.12),0.06,0.20);
    const coverage=clamp(finite(gs.coveragePct,20),14,28);
    ground.style.background=
      'linear-gradient(to top,'
      +'rgba('+r+','+g+','+b+','+alpha+') 0%,'
      +'rgba('+r+','+g+','+b+','+(alpha*0.55)+') '+(coverage*0.55)+'%,'
      +'rgba('+r+','+g+','+b+',0) '+coverage+'%)';
    ground.style.mixBlendMode='multiply';
    ground.style.opacity='1';
  }

  if(shadow){
    const spec=safeObject(blend.shadow);
    const opacity=clamp(finite(spec.opacity,0.25),0.14,0.40);
    const aoOpacity=clamp(finite(spec.ambientOcclusionOpacity,0.16),0.10,0.25);
    const aoBlur=clamp(finite(spec.ambientOcclusionBlurPx,5),3,9);
    shadow.style.width=clamp(finite(spec.widthPct,60),40,76)+'%';
    shadow.style.height=clamp(finite(spec.heightPx,7),3,14)+'px';
    shadow.style.opacity='1';
    shadow.style.filter='blur('+clamp(finite(spec.blurPx,10),4,18)+'px)';
    shadow.style.transform='translateY(-2px)';
    shadow.style.background=
      'radial-gradient(ellipse,rgba(0,0,0,'+opacity+') 0%,rgba(0,0,0,'+(opacity*0.45)+') 48%,transparent 76%)';
    shadow.style.boxShadow='0 1px '+aoBlur+'px rgba(0,0,0,'+aoOpacity+')';
  }

  return {
    applied:true,
    version:GARDEN_DESIGN_AUTO_BLEND_V3_VERSION,
    source:blend.source||null
  };
}
