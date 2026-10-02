import { projectPlantInstanceById } from './plant-instance-projection.js';

export const PLANT_DETAIL_TABS = Object.freeze([
  'overview',
  'care',
  'schedule',
  'history',
]);

export function buildPlantDetailBaseViewModel({
  plantId,
  plants = [],
  areas = [],
  media = [],
  activeTab = 'overview',
} = {}) {
  if (!PLANT_DETAIL_TABS.includes(activeTab)) {
    throw new Error('invalid_plant_detail_tab:' + activeTab);
  }

  const plant = projectPlantInstanceById({
    plantId,
    plants,
    areas,
    media,
  });

  return Object.freeze({
    plant,
    activeTab,
    tabs: PLANT_DETAIL_TABS,
    readOnly: plant.archived === true,
    photoAction: plant.archived
      ? null
      : Object.freeze({
          action: 'replace_plant_photo',
          plantId: plant.id,
        }),
    restoreSystemPhotoAction: plant.archived
      ? null
      : Object.freeze({
          action: 'restore_system_photo',
          plantId: plant.id,
        }),
  });
}

export function assertPlantDetailIdentity(viewModel) {
  if (!viewModel?.plant?.id) throw new Error('plant_detail_identity_required');

  if (!viewModel.readOnly) {
    if (viewModel.photoAction?.plantId !== viewModel.plant.id) {
      throw new Error('plant_detail_photo_wrong_instance:' + viewModel.plant.id);
    }
    if (viewModel.restoreSystemPhotoAction?.plantId !== viewModel.plant.id) {
      throw new Error('plant_detail_restore_wrong_instance:' + viewModel.plant.id);
    }
  }

  return true;
}
