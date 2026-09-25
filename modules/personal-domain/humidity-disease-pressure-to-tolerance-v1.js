/**
 * Humidity disease-pressure -> atmospheric humidity tolerance V1
 *
 * Conservative catalog enrichment transform.
 * This transform NEVER emits SOURCE_SUPPORTED for humidityTolerance because
 * source publications usually describe performance/disease pressure under
 * humid/wet conditions rather than a categorical "humidity tolerance" label.
 *
 * Evidence remains HEURISTIC_ASSERTION with source lineage.
 */
export const HUMIDITY_DISEASE_PRESSURE_TRANSFORM_ID =
  'humidity-disease-pressure-to-tolerance-v1';
export const HUMIDITY_DISEASE_PRESSURE_TRANSFORM_VERSION='1.0.0';
export const HUMIDITY_DISEASE_PRESSURE_TRANSFORM_REF =
  HUMIDITY_DISEASE_PRESSURE_TRANSFORM_ID+'@'+HUMIDITY_DISEASE_PRESSURE_TRANSFORM_VERSION;

export function deriveHumidityToleranceFromDiseasePressure({
  establishedInHumidProductionClimate=false,
  highHumidityOrWetnessRaisesDiseasePressure=false,
  severeHumiditySpecificInjury=false
}={}){
  if(severeHumiditySpecificInjury===true){
    return Object.freeze({
      value:'low',
      evidenceClass:'HEURISTIC_ASSERTION',
      transformRef:HUMIDITY_DISEASE_PRESSURE_TRANSFORM_REF,
      rationale:'Humidity/wetness is associated with severe plant-level injury or disease pressure.'
    });
  }
  if(
    establishedInHumidProductionClimate===true
    || highHumidityOrWetnessRaisesDiseasePressure===true
  ){
    return Object.freeze({
      value:'medium',
      evidenceClass:'HEURISTIC_ASSERTION',
      transformRef:HUMIDITY_DISEASE_PRESSURE_TRANSFORM_REF,
      rationale:'Plant can be grown under humid conditions, but humidity/wetness materially increases disease pressure; medium is conservative.'
    });
  }
  return Object.freeze({
    value:null,
    evidenceClass:'UNKNOWN',
    transformRef:HUMIDITY_DISEASE_PRESSURE_TRANSFORM_REF,
    rationale:'Insufficient evidence to infer atmospheric humidity tolerance.'
  });
}
