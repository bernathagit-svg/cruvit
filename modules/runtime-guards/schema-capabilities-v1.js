const current =
  globalThis.CruvitSchemaCapabilities &&
  typeof globalThis.CruvitSchemaCapabilities === 'object'
    ? globalThis.CruvitSchemaCapabilities
    : {};

globalThis.CruvitSchemaCapabilities = Object.freeze({
  ...current,
  gardenPlantsUnassessedHealthV2: true,
});

export const CRUVIT_SCHEMA_CAPABILITIES = globalThis.CruvitSchemaCapabilities;
