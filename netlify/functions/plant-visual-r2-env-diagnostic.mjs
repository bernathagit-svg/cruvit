function json(status,body){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}
export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const names=Object.keys(process.env)
    .filter(k=>/(PLANT_VISUAL|R2|CLOUDFLARE)/i.test(k))
    .filter(k=>!/TOKEN|SECRET|PASSWORD|PRIVATE/i.test(k))
    .sort();
  const presence={
    PLANT_VISUAL_R2_ACCOUNT_ID:Boolean(process.env.PLANT_VISUAL_R2_ACCOUNT_ID),
    PLANT_VISUAL_R2_ACCESS_KEY_ID:Boolean(process.env.PLANT_VISUAL_R2_ACCESS_KEY_ID),
    PLANT_VISUAL_R2_SECRET_ACCESS_KEY:Boolean(process.env.PLANT_VISUAL_R2_SECRET_ACCESS_KEY),
    PLANT_VISUAL_R2_CANDIDATES_BUCKET:Boolean(process.env.PLANT_VISUAL_R2_CANDIDATES_BUCKET),
    PLANT_VISUAL_R2_PRODUCTION_BUCKET:Boolean(process.env.PLANT_VISUAL_R2_PRODUCTION_BUCKET),
    PLANT_VISUAL_R2_PRODUCTION_ACCESS_KEY_ID:Boolean(process.env.PLANT_VISUAL_R2_PRODUCTION_ACCESS_KEY_ID),
    PLANT_VISUAL_R2_PRODUCTION_SECRET_ACCESS_KEY:Boolean(process.env.PLANT_VISUAL_R2_PRODUCTION_SECRET_ACCESS_KEY),
    PLANT_VISUAL_R2_PROD_ACCESS_KEY_ID:Boolean(process.env.PLANT_VISUAL_R2_PROD_ACCESS_KEY_ID),
    PLANT_VISUAL_R2_PROD_SECRET_ACCESS_KEY:Boolean(process.env.PLANT_VISUAL_R2_PROD_SECRET_ACCESS_KEY)
  };
  return json(200,{ok:true,names,presence,valuesExposed:false});
};
export const config={path:'/.netlify/functions/plant-visual-r2-env-diagnostic'};