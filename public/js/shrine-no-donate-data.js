/**
 * Items tagged `no_donate` in GSJS: every glitch-GameServerJS items/*.js whose `var tags` names it
 * (emblems are refused on their own, so they are left out). A shrine would not take them:
 * items/include/shrines.js 300-303 answers with HORRIBLE_SOUND and "...it merely bemuses them." and
 * keeps the item; 397 and 673 price one at 0. Read by js/shrines.js isNoDonate.
 *
 * A tag list, not a grant: tools/build-economy.mjs counts this file among its catalogs, so naming a
 * class here never lifts its credit gate.
 */
export const NO_DONATE_CLASSES = new Set([
  'antique_spigot', 'artifact_butterfly_hair_clip_piece1', 'artifact_butterfly_hair_clip_piece2',
  'artifact_butterfly_hair_clip_piece3', 'artifact_butterfly_hair_clip_piece4',
  'artifact_butterfly_hair_clip', 'artifact_butterlfy_hair_clip_piece1',
  'artifact_butterlfy_hair_clip_piece2', 'artifact_butterlfy_hair_clip_piece3',
  'artifact_butterlfy_hair_clip_piece4', 'artifact_chicken_brick_piece1', 'artifact_chicken_brick_piece2',
  'artifact_chicken_brick_piece3', 'artifact_chicken_brick_piece4', 'artifact_chicken_brick_piece5',
  'artifact_chicken_brick', 'artifact_glove_metal_finger_piece1', 'artifact_glove_metal_finger_piece2',
  'artifact_glove_metal_finger_piece3', 'artifact_glove_metal_finger', 'artifact_magical_pendant_piece1',
  'artifact_magical_pendant_piece2', 'artifact_magical_pendant_piece3', 'artifact_magical_pendant',
  'artifact_mirror_with_scribbles_piece1', 'artifact_mirror_with_scribbles_piece2',
  'artifact_mirror_with_scribbles_piece3', 'artifact_mirror_with_scribbles_piece4',
  'artifact_mirror_with_scribbles_piece5', 'artifact_mirror_with_scribbles',
  'artifact_mysterious_cube_piece1', 'artifact_mysterious_cube_piece2', 'artifact_mysterious_cube_piece3',
  'artifact_mysterious_cube_piece4', 'artifact_mysterious_cube_piece5', 'artifact_mysterious_cube',
  'artifact_necklace_amazonite_piece', 'artifact_necklace_amazonite', 'artifact_necklace_imperial_piece',
  'artifact_necklace_imperial', 'artifact_necklace_onyx_piece', 'artifact_necklace_onyx',
  'artifact_necklace_redtigereye_piece', 'artifact_necklace_redtigereye', 'artifact_necklace_rhyolite_piece',
  'artifact_necklace_rhyolite', 'artifact_nose_of_china_piece1', 'artifact_nose_of_china_piece2',
  'artifact_nose_of_china', 'artifact_platinumium_spork_piece1', 'artifact_platinumium_spork_piece2',
  'artifact_platinumium_spork', 'artifact_torn_manuscript_piece1', 'artifact_torn_manuscript_piece2',
  'artifact_torn_manuscript_piece3', 'artifact_torn_manuscript_piece4', 'artifact_torn_manuscript',
  'artifact_wooden_apple_piece1', 'artifact_wooden_apple_piece2', 'artifact_wooden_apple_piece3',
  'artifact_wooden_apple_piece4', 'artifact_wooden_apple', 'conch', 'dusty_stick', 'faded_heart',
  'gameshow_ticket', 'hogtied_piggy_explorer', 'hogtied_piggy', 'icon_alph', 'icon_cosma', 'icon_friendly',
  'icon_grendaline', 'icon_humbaba', 'icon_lem', 'icon_mab', 'icon_pot', 'icon_spriggan', 'icon_tii',
  'icon_zille', 'juju_paperweight', 'juju_trowel', 'limited_edition_imitation_grichmas_yeti',
  'million_currant_trophy', 'note_hint', 'note_manor_mystery', 'npc_cubimal_factorydefect_chick',
  'pareidolic_cosma_toast', 'plop', 'rube_potato', 'special_item_that_only_beta_testers_get',
  'stoot_barfield_pullstring_doll',
]);
