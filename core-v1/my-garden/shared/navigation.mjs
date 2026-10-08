import{ROUTES}from'./preview-session.mjs';
// Transparent hit-target wiring only. No changes to the approved renderers, pixels or geometry.
export function bindGardenNavigation(stage,{plantCount,onNavigate=target=>location.assign(target)}={}){
 const link=stage.querySelector('[data-action="MY_PLANTS"]');
 if(!link)throw Error('Approved My Plants hit target missing.');
 link.href=ROUTES.plants;link.setAttribute('aria-label','My Plants — '+plantCount+' plants');
 link.onclick=event=>{event.preventDefault();onNavigate(ROUTES.plants)};
 return {from:ROUTES.garden,to:ROUTES.plants,selector:'[data-action="MY_PLANTS"]'};
}
