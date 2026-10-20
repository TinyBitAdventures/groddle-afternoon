/**
 * Groddle Afternoon — original street geometry + layered decos
 * PixiJS 7 · locations-xml streets · CoU PNG decos · quests/items
 */
import { getVerbsFor, runVerb, ITEM_ICONS, ITEM_LABELS } from './content.js?v=social-follow-1';
import { createFeatureHost } from './js/feature-host.js?v=features-1';
import { hellFeature } from './js/features/hell-feature.js?v=hell-1';
import { resourceNodesFeature } from './js/features/resource-nodes-feature.js?v=resource-nodes-1';
import { questFlagsFeature } from './js/features/quest-flags-feature.js?v=flags-1';
import { questOffersFeature } from './js/features/quest-offers-feature.js?v=offers-1';
import {
  actionDurationFor,
  createTimedAction,
  advanceTimedAction,
  cancelTimedAction,
} from './js/action-timing.js?v=timed-actions-1';
import {
  createQuestState,
  assignQuest,
  applyQuestProgress,
  completeQuest,
  getQuestProgress,
  listQuestLog,
  listQuestTracker,
  parseQuestConversation,
  cleanQuestMarkup,
} from './js/quests.js';
import {
  PHANTOM_QUEST_ID,
  REMEMBER_QUEST_ID,
  FADED_HEART_ID,
  PHANTOM_HAUNT_COUNT,
  PHANTOM_FINALE_BEATS,
  PHANTOM_APPEAR_FRAME_COUNT,
  PHANTOM_GIVE_HEART_ANIMATION_SPEED,
  PHANTOM_GIVE_HEART_DURATION_MS,
  PHANTOM_GIVE_HEART_FRAME_COUNT,
  PHANTOM_HEART_REVEAL_HOLD_MS,
  ensureGhostQuestState,
  ghostEncounterAt,
  noticePhantom,
  grantFadedHeart,
  rememberWithFadedHeart,
} from './js/ghost-quest.js?v=phantom-3';
import {
  HOG_HAUL_QUEST_ID,
  HOG_HAUL_STREET_ID,
  HOG_HAUL_GOAL,
  captureHogHaulPig,
  countdownCue,
  createHogHaulState,
  deliverHogHaulPig,
  hogHaulObjective,
  hogHaulResultReward,
  pickupHogHaulBait,
  tickHogHaul,
} from './js/hog-haul.js?v=hog-haul-1';
import {
  FOUR_LETTER_BASE_STREET_ID,
  FOUR_LETTER_BLOCKS,
  FOUR_LETTER_QUEST_ID,
  FOUR_LETTER_RIDDLES,
  FOUR_LETTER_ROOM_ID,
  createFourLetterState,
  currentFourLetterRiddle,
  fourLetterObjective,
  fourLetterWord,
  spinFourLetterBlock,
  startFourLetterPuzzle,
} from './js/four-letter-quest.js?v=four-letter-1';
import {
  AXIS_DENYDE_STREET_ID,
  HOGTIED_JONES_ID,
  ILMENSKIE_QUEST_ID,
  canReleaseIlmenskieJones,
  ensureIlmenskieState,
  ilmenskieObjective,
  meetIlmenskieJones,
  pickupIlmenskieJones,
  releaseIlmenskieJones,
  rememberIlmenskieSource,
} from './js/ilmenskie-quest.js?v=ilmenskie-1';
import {
  LEGALIZE_BACK_ALLEY_BEATS,
  LEGALIZE_BACK_ALLEY_STATION_TSID,
  LEGALIZE_BACK_ALLEY_TSID,
  LEGALIZE_CARD_COST,
  LEGALIZE_CARD_ID,
  LEGALIZE_CLERKS,
  LEGALIZE_GRANGE_STATION_TSID,
  LEGALIZE_GRANGE_TSID,
  LEGALIZE_HALL_TSID,
  LEGALIZE_QUEST_ID,
  activateQualification,
  answerLegalizeQuestion,
  beginLegalizeApplication,
  callLegalizeApplicant,
  completeBackAlleyBriefing,
  createLegalizeState,
  departForBackAlley,
  ensureLegalizeState,
  enterBackAlleyStation,
  enterBureaucraticHall,
  exitToGregariousGrange,
  legalizeObjective,
  purchaseQualification,
  requestLegalizeQualification,
  travelToGregarious,
} from './js/legalize-it.js?v=legalize-2';
import {
  WINTER_HAVEN_STREET_ID,
  WINTER_MOTE_REWARDS,
  WINTER_WALK_ICE_REWARD,
  WINTER_WALK_QUEST_ID,
  WINTER_WALK_REPEAT_QUEST_ID,
  WINTER_WALK_STREET_ID,
  collectWinterMote,
  createWinterWalkState,
  enterWinterHaven,
  expireWinterWalk,
  finishWinterWalk,
  returnToWinterWalk,
  winterWalkObjective,
  winterWalkProgress,
  winterWalkRemainingMs,
} from './js/winter-walk.js?v=winter-walk-2';
import {
  SUMMERS_DAY_BONUS_ID,
  SUMMERS_DAY_BONUS_DOT_COUNT,
  SUMMERS_DAY_BONUS_DOT_IMG,
  SUMMERS_DAY_BONUS_PRODUCTION_TSID,
  SUMMERS_DAY_CHECKPOINTS,
  SUMMERS_DAY_COMPLETION,
  SUMMERS_DAY_FIRST_PRODUCTION_TSID,
  SUMMERS_DAY_MAIN_ID,
  SUMMERS_DAY_MAIN_PRODUCTION_TSID,
  SUMMERS_DAY_OFFER,
  SUMMERS_DAY_QUEST_ID,
  SUMMERS_DAY_GUIDE_LINES,
  SUMMERS_DAY_REPEAT_COMPLETION,
  SUMMERS_DAY_REPEAT_OFFER,
  SUMMERS_DAY_REPEAT_QUEST_ID,
  abandonSummersDay,
  advanceSummersDayCheckpoint,
  canOfferSummersDay,
  collectSummersDayBonusQuoin,
  createSummersDayRun,
  ensureSummersDayStory,
  enterSummersDayBonus,
  expireSummersDay,
  finishSummersDay,
  markSummersDayOffered,
  summersDayObjective,
  summersDayProgress,
  summersDayQurazyPoints,
  summersDayRemainingMs,
} from './js/summers-day.js?v=summers-day-3';
import {
  ROOK_CRUSHERS,
  ROOK_EGG_INITIAL_STATE,
  ROOK_FOREST_ART_ID,
  ROOK_FOREST_DECOS,
  ROOK_FOREST_DEPTH_LAYERS,
  ROOK_FOREST_LIMBS,
  ROOK_QUEST_ID,
  ROOK_WOODS_DURATION_MS,
  ROOK_WOODS_STREET_ID,
  beginRookWoods,
  completeRookEggSmash,
  createRookWoodsState,
  crusherHitsAvatar,
  crusherMoodLoss,
  crusherPosition,
  expireRookWoods,
  findWorkingRookTool,
  recordCrusherHit,
  rookEggStateForProgress,
  rookWoodsObjective,
  rookWoodsRemainingMs,
} from './js/rook-woods.js?v=rook-woods-2';
import {
  ROOK_HALL_QUEST_ID,
  ROOK_HALL_START_QUEST_ID,
  ROOK_MUSEUM_COMPLETION,
  ROOK_MUSEUM_EXHIBIT_COUNT,
  ROOK_MUSEUM_EXHIBITS,
  ROOK_MUSEUM_GREETING,
  ROOK_MUSEUM_PRODUCTION_TSID,
  ROOK_MUSEUM_STREET_ID,
  ROOK_MUSEUM_TOUR_INTRO,
  beginRookMuseumTour,
  completeRookMuseum,
  createRookMuseumState,
  getRookMuseumExhibit,
  rookMuseumObjective,
  visitRookMuseumExhibit,
} from './js/rook-museum.js?v=rook-museum-1';
import {
  DE_EMBIGGENIFY_PART2_QUEST_ID,
  DE_EMBIGGENIFY_QUEST_ID,
  EESTI_MUSIC_FILE,
  EESTI_PLAYER_SCALE,
  EESTI_PRODUCTION_TSID,
  EESTI_ROOM_ROUTE,
  EESTI_SOURCE_SPAWN,
  EESTI_STREET_ID,
  EMOTIONAL_BEAR_ID,
  MR_HAIRBALL_COMPLETION,
  MR_HAIRBALL_GREETING,
  MR_HAIRBALL_REQUEST,
  SMALL_WORTHLESS_ID,
  beginDeEmbiggenifySearch,
  completeDeEmbiggenify,
  createDeEmbiggenifyState,
  deEmbiggenifyObjective,
  eestiRemainingMs,
  expireDeEmbiggenify,
  findSmallWorthless,
} from './js/de-embiggenify.js?v=de-embiggenify-2';
import {
  EMOTIONAL_BEAR_ACTIONS,
  EMOTIONAL_BEAR_COMPANIONS,
  createEmotionalBearState,
  emotionalBearActionQuote,
  emotionalBearHasUpgrade,
  emotionalBearIcon,
  emotionalBearIconState,
  emotionalBearUpgradeQuote,
  listEmotionalBearActions,
  performEmotionalBearAction,
  upgradeEmotionalBear,
} from './js/emotional-bear.js?v=emotional-bear-1';
import {
  LAST_FEAT_STREET_IDS,
  LAST_FEAT_STREET_LABELS,
  LOCAL_COMPANION_PROFILES,
  STALKER_ACHIEVEMENT_ID,
  approachCompanionX,
  companionFollowVelocity,
  createCompanionFollowState,
  localCompanionGatherTarget,
  planLocalCompanionSpawns,
  recordCompanionFollowStreet,
  startCompanionFollow,
  stopCompanionFollow,
} from './js/local-companions.js?v=street-players-3';
import {
  GREEDY_ACTS,
  GREEDY_FIRST_REWARD,
  GREEDY_REPEAT_REWARD,
  GREEDY_STREET_GEOMETRY_TSID,
  GREEDY_STREET_ID,
  GREEDY_STREET_PRODUCTION_TSID,
  GREEDY_STREET_SPIRIT_QUEST_ID,
  GREEDY_STREET_SPIRIT_REPEAT_ID,
  canOfferGreedyFirst,
  canOfferGreedyRepeat,
  createGreedyStreetSpiritState,
  ensureGreedyStory,
  expireGreedyStreetSpirit,
  greedyObjective,
  greedyRemainingMs,
  markGreedyFirstComplete,
  markGreedyRepeatComplete,
  markGreedyRepeatFailed,
  pressGreedyAct,
} from './js/greedy-street-spirit.js?v=greedy-story-2';
import {
  PARADISE_COURSES,
  PARADISE_DAILY_LIMIT,
  PARADISE_TICKET_IDS,
  CLOUD_RING_PROFILES,
  RADIAL_HEIGHTS_MOON,
  STARLIT_NIGHT_MOON,
  STARLIT_NIGHT_MOON_FADE_MS,
  STARLIT_NIGHT_STAR_FADE_MS,
  STARLIT_NIGHT_STAR_FIELDS,
  SLIP_N_SLIDE_LANDMARKS,
  SLIP_N_SLIDE_TREE_SPRITES,
  activateParadiseTicket,
  cloudRingPuffLayout,
  collectParadisePickup,
  createParadiseRun,
  createParadiseState,
  expireParadiseRun,
  finishParadiseRun,
  paradiseObjective,
  paradiseRemainingMs,
  paradiseRunProgress,
  paradiseTicketCost,
  paradiseObjectiveComplete,
  passParadiseRing,
  quoteParadiseTicket,
  slipTerrainSlope,
  slipTerrainY,
  starlitMoonPlainAlpha,
  starlitRevealAlpha,
} from './js/paradise-flight.js?v=paradise-flight-7';
import {
  createAchievementState,
  applyAchievementProgress as applyAchievementProgressRaw,
  worldVerbAchievementCounters,
  makingToolAchievementCounter,
  achievementConditionLabel,
  achievementCategories,
  achievementCategoryLabel,
  browseAchievementLog,
  seedAchievementNearCompletion,
  unlockAchievement,
} from './js/achievements.js?v=full-browser-1';
import {
  INCANTATION_LINES,
  INCANTATION_FEAT_TITLE,
  createFeatState,
  featStatus,
  resetIncantationChain,
  submitIncantation,
} from './js/feats.js?v=incantations-2';
import {
  createSkillState,
  listSkills,
  startSkillStudy,
  pauseSkillStudy,
  tickSkillStudy,
  accelerateActiveStudy,
  getActiveStudy,
  getStudyStatus,
  listStudyQueue,
  studySecondsForSkill,
  formatStudyTime,
  grantSkill,
  canLearnSkill,
  listLearnedSkills,
} from './js/skills.js?v=study-1';
import {
  createBuffState,
  removeBuff,
  listActiveBuffs,
  listPendingBuffs,
  hasBuff,
  activateBuffItem,
  getBuffItemInfo,
  listBuffItemsInPack,
  tickBuffs,
  buffPhysics,
  buffedRandom,
  formatBuffRemaining,
  consumeRewardBuff,
} from './js/buffs.js?v=item-buffs-1';
import {
  loadContentCatalogs,
  getContentMeta,
  getQuestCatalog,
  getAchievementCatalog,
  getSkillCatalog,
  getBuffCatalog,
} from './js/content-catalogs.js';
import {
  createInventory,
  useItem,
  listPackSlots,
  listPackItemSlots,
  listPackToolSlots,
  listPackRows,
  getItemUseInfo,
  ITEM_CATALOG,
  countItem,
  ensureItem,
  addItem,
  removeItem,
} from './js/inventory.js?v=catalog-unified-3';
import {
  packPagerState,
  packPageTarget,
} from './js/pack-pager.js?v=original-pager-1';
import { listAnimalFeedOptions } from './js/animals.js?v=butterfly-care-1';
import {
  createDroppedItemState,
  parseDroppedItemState,
  serializeDroppedItemState,
  listDroppedStacks,
  normalizeStackQuantity,
  dropInventoryStack,
  pickupDroppedStack,
} from './js/world-items.js?v=catalog-unified-2';
import {
  createPlayerSave,
  parsePlayerSave,
  serializePlayerSave,
  restorePlayerSave,
} from './js/player-save.js?v=features-1';
import {
  HOME_INTERIOR_TSID,
  HOME_PURCHASE_COST,
  HOME_STREET_TSID,
  HOME_STYLES,
  beginHomeVisit,
  createHomeState,
  endHomeVisit,
  enterHomeInterior,
  leaveHomeInterior,
  purchaseHome,
  quoteHomePurchase,
} from './js/homes.js?v=homes-mail-2';
import {
  MAIL_COMPANIONS,
  archiveMail,
  createMailboxState,
  deleteMail,
  listMailboxMessages,
  mailCost,
  readMail,
  receiveMailAttachments,
  seedMailbox,
  sendMail,
  unreadMailCount,
} from './js/mailbox.js?v=homes-mail-2';
import {
  TOOL_CONDITION_CATALOG,
  createToolConditionState,
  getToolCondition,
  canUseTool,
  useToolCondition,
  quoteToolRepair,
  repairToolCondition,
  setToolRemaining,
} from './js/tools.js?v=tools-2';
import {
  listRecipes,
  listRecipesForTool,
  listMakingTools,
  searchRecipes,
  craftRecipe,
  craftRecipeBatch,
  formatCraftProgress,
  craftDurationFor,
  createCraftSession,
  advanceCraftSession,
  cancelCraftSession,
  buildCraftBatchResult,
  canCraftAgain,
  canCraft,
  ensureMakingItems,
  loadRecipeCatalog,
  RECIPE_CATALOG,
  TOOL_CATALOG,
  starterToolsInventory,
  starterCraftIngredients,
  hasTool,
} from './js/making.js?v=recipes-full-1';
import {
  createGarden,
  tickGarden,
  plantPlot,
  waterPlot,
  harvestPlot,
  clearPlot,
  tendPlot,
  waterAllPlots,
  listPlantableSeeds,
  listPlotKeys,
  getPlot,
  plotStatusLabel,
  plotGrowProgress,
  suggestedPlotAction,
  ensureGardenItems,
  starterGardenSeeds,
  starterHerbSeeds,
  starterGardenTools,
  SEED_CATALOG,
  seedIcon,
  cropIcon,
  hasWateringCan,
  hasHoe,
} from './js/garden.js?v=catalog-unified-2';
import {
  ROCK_CATALOG,
  createMineRock,
  tickMineRock,
  rockStatusLabel,
  rockFrameIndex,
  rockSceneIndex,
  ensureMiningItems,
  starterMiningTools,
  STARTER_MINING_SKILLS,
} from './js/mining.js?v=rock-cells-1';
import {
  createActivityLog,
  appendActivity,
  formatActivityLine,
  formatActivityHtml,
  buildActivitySegments,
  activitySegmentsToHtml,
} from './js/verb-rewards.js?v=woodcutting-1';
import {
  loadStreetData,
  STREET_INDEX,
  availableStreetTsids,
  ensureStreetIndex,
  resolveIndexTsid,
} from './js/street-loader.js';
import {
  resolveGround as resolveStreetGround,
  groundBeneath,
  streetWidth,
  assertStreetGeometry,
  worldToScreen,
  wallsScreen,
  findClimbWallNear,
} from './js/street-model.js';
import {
  buildStreetView,
  signpostNear,
  pickConnection,
  loadDecoManifest,
  loadSignpostTextures,
  setSignpostHover,
  signpostBoardAt,
} from './js/street-render.js?v=parallax-4';
import {
  GAME_DAY_MS,
  shouldFireNewDay,
  setLastNewDayTs,
  resetGameDayClock,
  applyNewDayRefill,
  formatGameDayLabel,
  formatDametime,
  dametimeParts,
  daylightState,
  getGameDayKey,
  timestampForGameHour,
  msUntilNewDay,
} from './js/game-day.js?v=dametime-1';
import {
  FOOD_VARIETY_UPGRADE,
  createFoodState,
  quoteFoodVarietyBonus,
  foodFullness,
  foodBonusStatus,
  canEatFood,
  recordFoodEat,
  resetFoodDay,
} from './js/food.js?v=food-memory-2';
import {
  TRIPLE_JUMP_UPGRADES,
  createJumpState,
  queueJump,
  clearJumpQueue,
  hasQueuedJump,
  noteGrounded,
  resolveQueuedJump,
  dampingAlpha,
  cameraTargetX,
  cameraLocationViewWidth,
  cameraOverlayCenterX,
  cameraTargetY,
  cameraBottomSlack,
  cameraWorldHeightForGround,
} from './js/movement.js?v=movement-5';
import {
  levelInfoForXp,
  reconcilePlayerProgression,
  formatLevelProgress,
} from './js/progression.js?v=progression-1';
import {
  TRANT_META,
  setTrantTables,
  createTrantState,
  livingTrantPlanForStreet,
  resetTrantDay,
  refillFruit,
  maturityLabel,
  trantStatusLabel,
} from './js/trants.js?v=trant-harvest-2';
import {
  crossfadeElement,
  AWARD_FADE_IN,
  AWARD_FADE_OUT,
  NEW_DAY_HOLD_MS,
  runStreetTransition,
  showAwardScreen,
} from './js/screen-fx.js?v=quest-pages-2';
import {
  planTravel,
  listMapDestinations,
  planSignpostTravel,
} from './js/travel.js';
import { AVATAR_SHEETS, facingScaleX, facingFromVelocity } from './js/avatar.js';
import {
  createDefaultAppearance,
  loadAppearance,
  saveAppearance,
  normalizeAppearance,
  recolorImageData,
  randomAppearance,
  APPEARANCE_PRESETS,
  COLOR_SWATCHES,
  resolveBodySheets,
  appearanceCacheKey,
} from './js/character-builder.js';
import {
  loadAmbientMusicConfig,
  resolveAmbientTheme,
  pickAmbientTrack,
  themeLabel,
  allAmbientTrackUrls,
} from './js/ambient-music.js';
import {
  MUSICBLOCK_CATALOG,
  createMusicblockState,
  ensureMusicblockItems,
  getMusicblock,
  isMusicblock,
  listMusicblockCollection,
  planMusicblockDrop,
  playMusicblock,
  starterMusicblocks,
} from './js/musicblocks.js?v=catalog-unified-2';
import {
  VENDOR_PROFILES,
  selectVendorProfile,
  vendorBuy,
  vendorSell,
  listBuyOffers,
  listSellOffers,
  createVendorSellQuote,
} from './js/vendor.js?v=stores-1';
import {
  createAnimalState,
  resetAnimalDay,
  animalStatusLabel,
} from './js/animals.js?v=butterfly-care-1';
import {
  ensureWoodTreeState,
  resetWoodTreeDay,
  woodTreeStatusLabel,
} from './js/woodcutting.js?v=woodcutting-1';
import {
  GIANTS,
  createShrineState,
  giantForStreet,
  listShrineDonationOptions,
  quoteShrineDonation,
  donateToShrine,
  canClaimEmblem,
  claimShrineEmblem,
  emblemCostFor,
  resetShrineDay,
} from './js/shrines.js?v=stoot-doll-2';
import {
  GAMESHOW_TICKET_ID,
  applySpinningWheelReward,
  canSpinWheel,
  createSpinningWheelState,
  ensureSpinningWheelItems,
  spinMeResponse,
  spinningWheelPhase,
  startSpinningWheel,
} from './js/spinning-wheel.js?v=catalog-unified-2';
import {
  CUBIMAL_PACKAGE_IDS,
  cubimalCollectionProgress,
  cubimalInfo,
  cubimalPackageInfo,
  ensureCubimalItems,
  openCubimalPackage,
  setCubimalFree,
} from './js/cubimals.js?v=cubimals-1';
import {
  STOOT_DOLL_BUBBLE_MS,
  STOOT_DOLL_ID,
  STOOT_DOLL_LABEL,
  STOOT_MEMORIAL_STREET_ID,
  createStootDollState,
  pullStootDollString,
} from './js/stoot-doll.js?v=stoot-doll-2';
import {
  QUOIN_SHEET,
  QUOIN_TYPES,
  createQuoinState,
  planStreetQuoins,
  collectQuoin,
  resetQuoinDay,
} from './js/quoins.js?v=quoins-1';
import {
  buildHubMapView,
  mapClickTravel,
  renderHubMapSvg,
  resolveHubId,
  listHubsFromIndex,
  MAP_INDEX_URL,
  HUB_56_MAP_URL,
} from './js/map-graph.js';
import {
  loadStreetEcologyCatalog,
  ecologyForStreet,
  populationForStreet,
  planStreetPlacements,
  nearestPlacementGap,
} from './js/street-ecology.js?v=official-ecology-3';

/** @type {object|null} assets/maps/index.json */
let mapIndexCache = null;
/** @type {Map<string, object>} hubId → hub geometry JSON */
const hubMapCache = new Map();
/** Currently displayed hub on the map panel (may differ from player hub). */
let mapPanelHubId = null;

async function ensureMapIndex() {
  if (mapIndexCache) return mapIndexCache;
  const res = await fetch(MAP_INDEX_URL);
  if (!res.ok) throw new Error(`Map index load failed: ${res.status}`);
  mapIndexCache = await res.json();
  return mapIndexCache;
}

/**
 * Load hub geometry JSON by hub id (e.g. "56", "93").
 * @param {string|number} hubId
 */
async function loadHubMapData(hubId) {
  const id = String(hubId || '56');
  if (hubMapCache.has(id)) return hubMapCache.get(id);

  let url = `assets/maps/hubs/hub-${id}.json`;
  try {
    const idx = await ensureMapIndex();
    if (idx.hubs?.[id]?.file) url = idx.hubs[id].file;
  } catch {
    // fall through to default path / legacy
  }

  let res = await fetch(url);
  if (!res.ok && id === '56') {
    res = await fetch(HUB_56_MAP_URL);
  }
  if (!res.ok) throw new Error(`Hub map ${id} load failed: ${res.status}`);
  const data = await res.json();
  hubMapCache.set(id, data);
  return data;
}

function playerHubId() {
  return resolveHubId(
    currentStreet ? { hubId: currentStreet.hubId } : null,
    '56'
  );
}

const VIEW_W = 960;
const VIEW_H = 540;
// Tiny Speck's TSMainView subtracts MIN_PACK_HEIGHT (132px) before setting
// loc_vp_h. Our pack overlays the Pixi canvas, so camera framing must use the
// same shorter location viewport or low platforms disappear behind the pack.
const PACK_VIEW_RESERVE = 132;
const LOCATION_VIEW_H = VIEW_H - PACK_VIEW_RESERVE;
let WORLD_W = 2400;
let GROUND_Y = 420;
const SCALE = 1.35;
/**
 * Per-entity display scales relative to global SCALE.
 * Official Glitch sheets are low-res x1 rasters (no x2 / no vector bodies for animals).
 * Chickens ship with large frames (148×110) so they use a lower factor; piggies are
 * small frames (88×62) that looked huge + pixelated at full SCALE — keep them near 1:1
 * native size so they stay sharp. Apples are iconic inventory art, not world-scale fruit.
 */
const ENTITY_SCALE = {
  piggy: SCALE * 0.72, // ~86×60 — smaller than before; near-native so less mushy
  chicken: SCALE * 0.52, // looks right; leave alone
  apple: SCALE * 0.38, // ~20px ground pickup, not a melon
  // Official rest/fly sheets are ~70×65–78; keep near ambient size (not the old 39×28 rest single).
  butterfly: SCALE * 0.52,
  butterflyFly: SCALE * 0.52,
  /** Maturity trant frames are large (~600–900px); target ~220px screen height. */
  trant: SCALE * 0.28,
};

const SHEETS = {
  piggyWalk: {
    url: 'assets/sprites/npc_piggy__x1_walk_png_1354829432.png',
    fw: 88, fh: 62, cols: 8, rows: 3,
  },
  piggyNibble: {
    url: 'assets/sprites/npc_piggy__x1_nibble_png_1354829441.png',
    fw: 88, fh: 62, cols: 10, rows: 6,
  },
  appleIcon: {
    url: 'assets/sprites/apple__x1_iconic_png_1354829396.png',
    fw: 38, fh: 43, cols: 1, rows: 1,
  },
  chickenWalk: {
    url: 'assets/sprites/npc_chicken__x1_walk_png_1354830385.png',
    fw: 148, fh: 110, cols: 6, rows: 4,
  },
  chickenPeck: {
    url: 'assets/sprites/npc_chicken__x1_pecking_once_png_1354830398.png',
    fw: 148, fh: 110, cols: 6, rows: 6,
  },
  butterfly: {
    url: 'assets/sprites/npc_butterfly__x1_fly-side_png_1354829525.png',
    fw: 70, fh: 78, cols: 14, rows: 5,
  },
  // Official rest sheet (x1) — not the tiny hand-cropped 39×28 single used before.
  butterflyRest: {
    url: 'assets/sprites/npc_butterfly__x1_rest-angle1_png_1354829530.png',
    fw: 70, fh: 65, cols: 6, rows: 1,
  },
  bureaucrat0Idle: {
    url: 'assets/sprites/quests/legalize/npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_idle1_png_1354832995.png',
    fw: 97, fh: 89, cols: 10, rows: 6,
  },
  bureaucrat0Talk: {
    url: 'assets/sprites/quests/legalize/npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_talk_png_1354832993.png',
    fw: 97, fh: 89, cols: 9, rows: 3,
  },
  bureaucrat1Idle: {
    url: 'assets/sprites/quests/legalize/npc_bureaucrat_arms_02_glasses_none_hair_02_legs_02_necklace_none_tie_02_torso_02_x1_idle1_png_1354833004.png',
    fw: 97, fh: 91, cols: 10, rows: 6,
  },
  bureaucrat1Talk: {
    url: 'assets/sprites/quests/legalize/npc_bureaucrat_arms_02_glasses_none_hair_02_legs_02_necklace_none_tie_02_torso_02_x1_talk_png_1354833002.png',
    fw: 97, fh: 91, cols: 9, rows: 3,
  },
  bureaucrat2Idle: {
    url: 'assets/sprites/quests/legalize/npc_bureaucrat_arms_03_glasses_none_hair_04_legs_03_necklace_01_tie_none_torso_03_x1_idle1_png_1354833012.png',
    fw: 97, fh: 96, cols: 10, rows: 6,
  },
  bureaucrat2Talk: {
    url: 'assets/sprites/quests/legalize/npc_bureaucrat_arms_03_glasses_none_hair_04_legs_03_necklace_01_tie_none_torso_03_x1_talk_png_1354833010.png',
    fw: 97, fh: 96, cols: 9, rows: 3,
  },
  bureaucrat3Idle: {
    url: 'assets/sprites/quests/legalize/npc_bureaucrat_arms_04_glasses_none_hair_05_legs_04_necklace_02_tie_none_torso_04_x1_idle1_png_1354833021.png',
    fw: 97, fh: 101, cols: 10, rows: 6,
  },
  bureaucrat3Talk: {
    url: 'assets/sprites/quests/legalize/npc_bureaucrat_arms_04_glasses_none_hair_05_legs_04_necklace_02_tie_none_torso_04_x1_talk_png_1354833019.png',
    fw: 97, fh: 101, cols: 9, rows: 3,
  },
  quoin: {
    url: QUOIN_SHEET.url,
    fw: QUOIN_SHEET.frameWidth,
    fh: QUOIN_SHEET.frameHeight,
    cols: QUOIN_SHEET.columns,
    rows: QUOIN_SHEET.rows,
  },
  treeFruit: { url: 'assets/sprites/tree_fruit_single.png', whole: true },
  treeWood: { url: 'assets/sprites/tree_wood_single.png', whole: true },
  treeWoodGrowth: {
    url: 'assets/sprites/wood_tree_maturity_6_variant_2_x6_1_png_1354833445.png',
    fw: 88, fh: 138, cols: 6, rows: 1,
  },
  mineRockMetal: {
    url: 'assets/sprites/mining/rock_metal.png?v=exact-rock-cells-1',
    fw: 137, fh: 100, cols: 5, rows: 1,
  },
  mineRockDullite: {
    url: 'assets/sprites/mining/rock_dullite.png?v=exact-rock-cells-1',
    fw: 131, fh: 114, cols: 5, rows: 1,
  },
  mineRockBeryl: {
    url: 'assets/sprites/mining/rock_beryl.png?v=exact-rock-cells-1',
    fw: 134, fh: 120, cols: 5, rows: 1,
  },
  mineRockSparkly: {
    url: 'assets/sprites/mining/rock_sparkly.png?v=exact-rock-cells-1',
    fw: 131, fh: 127, cols: 5, rows: 1,
  },
  hatchetTool: {
    url: 'assets/sprites/tools/hatchet-tool.png',
    fw: 110, fh: 64, cols: 8, rows: 5,
  },
  wateringCanTool: {
    url: 'assets/sprites/tools/watering-can-tool.png',
    fw: 91, fh: 78, cols: 10, rows: 3,
  },
  wheelAppear: {
    url: 'assets/sprites/spinning-wheel/appear.png',
    fw: 514, fh: 450, cols: 7, rows: 2, frameCount: 14,
  },
  wheelDisappear: {
    url: 'assets/sprites/spinning-wheel/disappear.png',
    fw: 514, fh: 450, cols: 6, rows: 3, frameCount: 18,
  },
  wheelGreenSpin: {
    url: 'assets/sprites/spinning-wheel/green-spin.png',
    fw: 514, fh: 450, cols: 7, rows: 8, frameCount: 56,
  },
  wheelGreenEnd: {
    url: 'assets/sprites/spinning-wheel/green-end.png',
    fw: 514, fh: 450, cols: 1, rows: 8, frameCount: 8,
  },
  wheelWhiteSpin: {
    url: 'assets/sprites/spinning-wheel/white-spin.png',
    fw: 514, fh: 450, cols: 7, rows: 8, frameCount: 56,
  },
  wheelWhiteEnd: {
    url: 'assets/sprites/spinning-wheel/white-end.png',
    fw: 514, fh: 450, cols: 1, rows: 8, frameCount: 8,
  },
  wheelRedSpin: {
    url: 'assets/sprites/spinning-wheel/red-spin.png',
    fw: 514, fh: 450, cols: 7, rows: 8, frameCount: 56,
  },
  wheelRedEnd: {
    url: 'assets/sprites/spinning-wheel/red-end.png',
    fw: 514, fh: 450, cols: 1, rows: 8, frameCount: 8,
  },
  phantomAppear: {
    url: 'assets/sprites/quests/phantom-appear.png',
    fw: 126, fh: 214, cols: 7, rows: 8, frameCount: PHANTOM_APPEAR_FRAME_COUNT,
  },
  phantomGiveHeart: {
    url: 'assets/sprites/quests/phantom-give-heart.png',
    fw: 126, fh: 214, cols: 7, rows: 13, frameCount: PHANTOM_GIVE_HEART_FRAME_COUNT,
  },
  pigBait: {
    url: 'assets/sprites/races/pig_bait__x1_1_x1_2_x1_3_x1_4_png_1354830335.png',
    fw: 53, fh: 46, cols: 4, rows: 1,
  },
  hogtiedPiggy: {
    url: 'assets/sprites/races/hogtied_piggy__x1_1_png_1354830331.png',
    whole: true,
  },
  hogHaulTicket: {
    url: 'assets/sprites/races/race_ticket_hogtie_piggy__x1_iconic_png_1354836452.png',
    whole: true,
  },
  letterBlockA: {
    url: 'assets/sprites/quests/four-letter/letter-block-A.png',
    fw: 139, fh: 197, cols: 2, rows: 1,
  },
  letterBlockB: {
    url: 'assets/sprites/quests/four-letter/letter-block-B.png',
    fw: 139, fh: 197, cols: 2, rows: 1,
  },
  letterBlockE: {
    url: 'assets/sprites/quests/four-letter/letter-block-E.png',
    fw: 139, fh: 197, cols: 2, rows: 1,
  },
  letterBlockM: {
    url: 'assets/sprites/quests/four-letter/letter-block-M.png',
    fw: 139, fh: 197, cols: 2, rows: 1,
  },
  letterBlockS: {
    url: 'assets/sprites/quests/four-letter/letter-block-S.png',
    fw: 139, fh: 197, cols: 2, rows: 1,
  },
  letterBlockT: {
    url: 'assets/sprites/quests/four-letter/letter-block-T.png',
    fw: 139, fh: 197, cols: 2, rows: 1,
  },
  mrBlock: {
    url: 'assets/sprites/quests/four-letter/mr-block.png',
    fw: 121, fh: 117, cols: 2, rows: 1,
  },
  dustBunnyIdle: {
    url: 'assets/sprites/quests/de-embiggenify/npc_dustbunny__x1_idle_stand_png_1354831147.png',
    fw: 78, fh: 118, cols: 12, rows: 10, frameCount: 120,
  },
  dustBunnyTalk: {
    url: 'assets/sprites/quests/de-embiggenify/npc_dustbunny__x1_talk_png_1354831143.png',
    fw: 78, fh: 118, cols: 12, rows: 3, frameCount: 36,
  },
  jonesWalk: {
    url: 'assets/sprites/quests/ilmenskie/jones-walk.png',
    fw: 87, fh: 64, cols: 8, rows: 3,
  },
  // Styled clothed Glitch avatar (Wayback full-body portrait + bob walk strip).
  // Default play path — not the nude greyscale mannequin sheets.
  avatarStyledWalk: {
    url: AVATAR_SHEETS.walk.url,
    fw: AVATAR_SHEETS.walk.fw,
    fh: AVATAR_SHEETS.walk.fh,
    cols: AVATAR_SHEETS.walk.cols,
    rows: AVATAR_SHEETS.walk.rows,
  },
  avatarStyledIdle: { url: AVATAR_SHEETS.idle.url, whole: true },
  avatarStyledAlt: { url: 'assets/sprites/avatar_styled_alt.png', whole: true },
};

const keys = new Set();
let app, world, bgLayer, entityLayer, fxLayer, player, prompt, camTarget, camY, portalSprites;
let hoveredSignBoard = null;
let cameraRightInset = 0;

/**
 * Translate the HTML quest/activity rail into Pixi view coordinates. The
 * original client reserved this width when calculating its location viewport;
 * doing the same keeps the avatar out from underneath the rail at street ends.
 */
function syncCameraSafeArea() {
  const root = document.getElementById('game-root');
  const rail = document.getElementById('play-context');
  if (!root || !rail || rail.offsetParent === null || root.clientWidth <= 0) {
    cameraRightInset = 0;
    return cameraRightInset;
  }
  const rootRect = root.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const overlapCss = Math.max(0, rootRect.right - railRect.left);
  const avatarClearance = 34;
  cameraRightInset = clamp(
    overlapCss * (VIEW_W / rootRect.width) + avatarClearance,
    0,
    VIEW_W * 0.42
  );
  return cameraRightInset;
}

function cameraTargetForPlayer(playerX, velocityX = 0) {
  return cameraTargetX(playerX, velocityX, WORLD_W, VIEW_W, 4.4, cameraRightInset);
}

function horizontalLocationViewWidth() {
  return cameraLocationViewWidth(VIEW_W, cameraRightInset);
}

function deepestWalkableGroundY() {
  const platforms = Array.isArray(streetPlatforms) ? streetPlatforms : [];
  return platforms.reduce(
    (deepest, platform) => Math.max(
      deepest,
      Number(platform?.y1) || 0,
      Number(platform?.y2) || 0
    ),
    Number(GROUND_Y) || 0
  );
}

function activeCameraWorldHeight(anchorRatio = 0.75) {
  return cameraWorldHeightForGround(
    bgLayer?.worldH || VIEW_H,
    deepestWalkableGroundY(),
    LOCATION_VIEW_H,
    anchorRatio
  );
}

/**
 * Keep a world-space overlay wholly inside the same rail-safe viewport used by
 * the camera. Width is expressed in Pixi coordinates.
 */
function clampWorldOverlayX(worldX, width = 0, padding = 12) {
  const cameraX = Number.isFinite(camTarget) ? camTarget : 0;
  const requestedX = Number(worldX);
  const resolvedX = Number.isFinite(requestedX) ? requestedX : cameraX;
  return cameraX + cameraOverlayCenterX(
    resolvedX - cameraX,
    width,
    VIEW_W,
    cameraRightInset,
    padding
  );
}
/** @type {any[]} */
let interactables = [];
/** Session-stable per-street animal care state; revisiting a street keeps today's limits. */
const animalStateCache = new Map();
/** Versioned ecology snapshot. Runtime targets point directly into these street records. */
const persistentWorldState = { animals: {}, streets: {} };
let piggies = [], chickens = [], apples = [], worldMusicblocks = [], droppedItemSprites = [], quoins = [], butterflies = [], trees = [], particles = [], speechBubbles = [];
let textures = {};
let time = 0;
let menuTarget = null;
/** Target-item chooser state for the original Feed → "Feed what?" flow. */
let feedPickerTarget = null;
let feedPickerOptions = [];
/** Keep keyboard interaction on the just-used entity through short overlap ambiguity. */
let recentInteractionTarget = null;
let recentInteractionUntil = 0;
/** @type {(ReturnType<typeof createTimedAction> & { target?: any, verbLabel?: string })|null} */
let currentAction = null;
/** True only while a completed timed action resolves synchronously. */
let verbAnimationAlreadyStarted = false;
/** @type {any|null} official tool sprite attached to the current timed verb. */
let actionToolFx = null;

/** @type {import('./js/street-model.js').StreetData|null} */
let currentStreet = null;
/** @type {any[]|null} */
let streetPlatforms = null;
/** @type {{ id?:string, x:number, yTop:number, yBot:number, source?:string }[]} */
let streetWalls = [];
/** Source-derived population and one-pass placement for the active street. */
let currentStreetPopulation = null;
let currentStreetPlacement = null;
let currentStreetTsid = STREET_INDEX.default;
/** Climb state: original Glitch walls + trunk_ladder-synthesized zones */
let climb = { active: false, wall: null };
let homeMailboxTarget = null;
let homeDoorTarget = null;
let homeReturnTarget = null;
let mailboxFolder = 'inbox';
let mailboxSelectedId = null;
let mailboxComposeReplyTo = null;

/** @type {ReturnType<typeof createQuestState>} */
let questState = createQuestState();
/** @type {ReturnType<typeof createAchievementState>} */
let achieveState = createAchievementState();
/** @type {ReturnType<typeof createFeatState>} */
let featState = createFeatState();
/** @type {ReturnType<typeof createSkillState>} */
let skillState = createSkillState();
/** @type {ReturnType<typeof createBuffState>} */
let buffState = createBuffState();
/** Persistent per-class condition for the remake's unstackable tool row. */
const toolState = createToolConditionState();

const pc = { energy: 80, mood: 70, imagination: 5000, currants: 200, xp: 5000, level: 5, rewardMultiplier: 1 };
ensureMusicblockItems();
const musicblockState = createMusicblockState();
const shrineState = createShrineState();
// Achievement rewards use the same persistent per-Giant favor ledger as shrines.
Object.defineProperty(pc, 'giantFavor', {
  enumerable: false,
  get: () => shrineState.favor,
});
const quoinState = createQuoinState();
const foodState = createFoodState();
const paradiseState = createParadiseState();
const emotionalBearState = createEmotionalBearState();
const homeState = createHomeState();
const mailboxState = createMailboxState();
const jumpState = createJumpState();
const inv = createInventory({
  butterfly_lotion: 3,
  apple: 2,
  hatchet: 1,
  ...starterCraftIngredients(),
  ...starterToolsInventory(),
  ...starterGardenSeeds(),
  ...starterHerbSeeds(),
  ...starterGardenTools(),
  ...starterMiningTools(),
  ...starterMusicblocks(),
  paradise_ticket_cloud_rings: 1,
  paradise_ticket_radial_heights: 1,
  paradise_ticket_starlit_night: 1,
  paradise_ticket_slip_n_slide: 1,
});
const activityLog = createActivityLog(50);
/** @type {import('./js/character-builder.js').Appearance} */
let playerAppearance = loadAppearance();
/** @type {string} active builder tab */
let avatarBuilderSlot = 'hair';
/** open builder before game start? */
let openBuilderOnStart = false;

/** @type {ReturnType<typeof createGarden>|null} active garden model for tend panel */
let activeGarden = null;
/** @type {string|null} preferred seed class_tsid when planting */
let gardenSeedPick = null;
/** @type {any[]} garden entity targets for growth ticks */
let gardens = [];
/** @type {any[]} mineable rock entity targets */
let mineRocks = [];
ensureGardenItems();
ensureMiningItems();
let vendorTab = 'buy';
/** @type {(typeof VENDOR_PROFILES)[keyof typeof VENDOR_PROFILES]} */
let activeVendor = VENDOR_PROFILES.groceries;
/** @type {string|null} selected vendor item for detail view */
let vendorSelected = null;
/** @type {number} */
let vendorQty = 1;
/** @type {string|null} pack item currently being dragged toward the vendor */
let vendorDragTsid = null;
/** @type {null|{ label:string, qty:number, gain:number }} */
let vendorSellReceipt = null;
let vendorReceiptTimer = 0;
/** @type {string} make panel tool filter (`all` or tool class_tsid) */
let makeToolFilter = 'all';
let makeSearchQuery = '';
/** @type {string|null} recipe key for make detail */
let makeSelected = null;
const ACHIEVEMENT_PAGE_SIZE = 40;
const achievementBrowser = {
  status: 'all',
  category: 'all',
  query: '',
  limit: ACHIEVEMENT_PAGE_SIZE,
};
/** @type {number} */
let makeQty = 1;
/** @type {null|{ timer: object, key: string, recipe: object, qty: number, made: number, opts: object }} */
let activeCraftSession = null;
/** @type {null|{ classTsid:string, timer:number, finishesAt:number }} */
let activeToolRepair = null;
/** @type {string|null} selected bottom-pack stack for its action card */
let packSelected = null;
/** Pack action-card drop quantity state. */
let packDropMode = false;
let packDropQty = 1;
let vendorSprite = null;
/** Active Phantom Glitch echo/final encounter for the authored ghost quest. */
let phantomTarget = null;
/** Transient multiplayer-style instance; intentionally excluded from player saves. */
let hogHaulState = null;
let hogHaulSourceLocation = null;
let hogHaulBaits = [];
let hogHaulPigTargets = [];
let hogHaulPenTarget = null;
let hogHaulCarrySprite = null;
let hogHaulRivalSprite = null;
let hogHaulRivalWaypoints = [];
let hogHaulRivalWaypointIndex = 0;
let hogHaulLastCollisionAt = 0;
let hogHaulAutoNextAt = 0;
let hogHaulResultApplied = false;
let hogHaulStartPromise = null;
/** Transient source-authored Four Letter Words puzzle instance. */
let fourLetterState = null;
let fourLetterSourceLocation = null;
let fourLetterTargets = [];
let fourLetterMrBlock = null;
let fourLetterStartPromise = null;
let fourLetterPlayerBaseScale = null;
/** Transient Back Alley and Bureaucratic Hall route for Legalize It. */
let legalizeRun = null;
let legalizeSourceLocation = null;
let legalizeStartPromise = null;
let legalizeTransitionBusy = false;
let legalizeTargets = [];
let legalizeAutoNextAt = 0;
let legalizeWaitStartedAt = 0;
/** Transient source-authored Winter Walk and Winter Haven instance. */
let winterWalkState = null;
let winterWalkSourceLocation = null;
let winterWalkMotes = [];
let winterWalkPortal = null;
let winterSnow = null;
let winterWalkStartPromise = null;
let winterWalkTransitionBusy = false;
let winterWalkAutoNextAt = 0;
/** Transient source-authored A Summer's Day memory and Annex. */
let summersDayRun = null;
let summersDaySourceLocation = null;
let summersDayCheckpoints = [];
let summersDayPlatforms = [];
let summersDayBonusQuoins = [];
let summersDayExit = null;
let summersDayStartPromise = null;
let summersDayTransitionBusy = false;
let summersDayAutoNextAt = 0;
let summersDayWaterLine = null;
/** Transient Rooks' Woods Crusher gauntlet. */
let rookWoodsState = null;
let rookWoodsSourceLocation = null;
let rookCrushers = [];
let rookEggTarget = null;
let rookWoodsStartPromise = null;
let rookWoodsTransitionBusy = false;
let rookLastHitAt = 0;
let rookHitFx = null;
let rookAutoNextAt = 0;
let rookEggTextures = [];
/** Transient source-authored Museum of the Rook tour. */
let rookMuseumState = null;
let rookMuseumSourceLocation = null;
let rookMuseumTargets = [];
let rookMuseumGreeter = null;
let rookMuseumStartPromise = null;
let rookMuseumTransitionBusy = false;
let rookMuseumActiveExhibit = null;
let rookMuseumPageIndex = 0;
let rookMuseumArtTimer = null;
let rookMuseumAutoNextAt = 0;
/** Transient source-authored miniature quest in Eesti Life Catalogue Page 17. */
let deEmbiggenifyState = null;
let deEmbiggenifySourceLocation = null;
let deEmbiggenifyStartPromise = null;
let deEmbiggenifyTransitionBusy = false;
let deEmbiggenifyPlayerBaseScale = null;
let mrHairballTarget = null;
let smallWorthlessTarget = null;
let deEmbiggenifyAutoNextAt = 0;
/** Transient private Ticket to Paradise flight instance. */
let paradiseRun = null;
let paradiseSourceLocation = null;
let paradisePickups = [];
let paradiseRings = [];
let paradiseExit = null;
let paradiseBackdropStars = [];
let paradiseStartPromise = null;
let paradiseTransitionBusy = false;
let paradiseAutoNextAt = 0;
let paradiseCompletionAnnounced = false;
/** Persistent map-teleport rescue story; the state itself lives under questState.story. */
let ilmenskieTarget = null;
let ilmenskieAutoNextAt = 0;
let ilmenskieAutoBusy = false;
/** Current original-style quest offer conversation. */
let questDialogueState = null;
/** @type {any|null} currently opened world shrine target */
let activeShrineTarget = null;
/** @type {string|null} selected pack good in the shrine donation panel */
let shrineSelected = null;
let shrineQty = 1;
/** One transient owner-only prize wheel created by a Gameshow Ticket. */
let spinningWheelTarget = null;
let spinningWheelLastPhase = '';
let spinningWheelPrompted = false;
/** Interactive clean Stoot doll installed beside the memorial plaque. */
let stootDollTarget = null;
/** Non-persistent quote rotation metadata for the doll while it is in the pack. */
const packedStootDollState = createStootDollState();
/** Transient local companions used to make the recorded three-player Feat playable solo. */
let assistedFeatChain = null;
let featCompanionTimers = [];
/** Clean, street-local Glitch actors shared by Feats and Emotional Bear actions. */
let localCompanions = [];
/** Original-style live follow session; intentionally reset by a page reload. */
const companionFollowState = createCompanionFollowState();
let playerSpeechTarget = null;
/** Emotional Bear target chooser and source-animation overlay. */
let emotionalBearPendingAction = null;
let emotionalBearFxTimer = 0;
/** The Greedy Street Spirit's transient five-act theatre instance. */
let greedyStreetState = null;
let greedyStreetSourceLocation = null;
let greedyStreetSceneManifest = null;
let greedyStreetButtons = [];
let greedyStreetExit = null;
let greedyStreetStartPromise = null;
let greedyStreetTransitionBusy = false;
let greedyStreetAutoNextAt = 0;
ensureMakingItems();
ensureSpinningWheelItems();
ensureCubimalItems();
ensureItem(STOOT_DOLL_ID, {
  label: STOOT_DOLL_LABEL,
  desc: 'Loaded with a goodly amount of "inspirational" phrases.',
  icon: 'assets/sprites/spinning-wheel/stoot-doll.png',
  baseCost: 1_333_100,
  stackMax: 1,
  sellable: false,
  donatable: false,
});
ensureItem(FADED_HEART_ID, {
  label: 'Faded Heart',
  desc: 'This ghostly, Faded Heart is all that remains of a forgotten tragedy.',
});
ensureItem(HOGTIED_JONES_ID, {
  label: 'Hogtied Ilmenskie Jones',
  desc: 'A famous porkthropologist, temporarily packed for emergency cavern evacuation.',
  icon: 'assets/sprites/quests/ilmenskie/hogtied-jones.png',
});
ensureItem(LEGALIZE_CARD_ID, {
  label: 'Card-Carrying Qualification',
  desc: 'The basic bureaucratic proof that you are qualified to carry cards.',
  icon: 'assets/sprites/quests/legalize/card_carrying_qualification__x1_iconic_png_1354833115.png',
});
ensureItem('your_papers', {
  label: 'Your Papers',
  desc: 'A full yet incomplete set of papers, waiting to be put in order.',
  icon: 'assets/sprites/quests/legalize/your_papers__x1_iconic_png_1354833120.png',
});
ensureItem('ice', {
  label: 'Ice',
  desc: 'A clear, cold piece of Winter Walk, still sparkling after the journey home.',
  icon: 'assets/sprites/icons/ice.png',
});
ensureItem(SMALL_WORTHLESS_ID, {
  label: 'Small shiny object with no intrinsic value',
  desc: 'Shiny, but you can barely see the shine so it ends up a little dull. Totally worthless: it has no purpose.',
});
ensureItem(EMOTIONAL_BEAR_ID, {
  label: 'Emotional Bear',
  desc: "When you can't express how you're feeling, this furry companion will emote on your behalf. Attach Lips for kissing or a Moon for you-know-whatting.",
  icon: emotionalBearIcon(emotionalBearState),
  baseCost: 300,
  stackMax: 1,
});
ensureItem('lips', {
  label: 'Lips',
  desc: 'Pre-pursed and super-soft, these Lips can be attached to an Emotional Bear.',
  icon: 'assets/sprites/icons/lips.png',
  baseCost: 10,
  stackMax: 1,
});
ensureItem('moon', {
  label: 'Moon',
  desc: 'One full, craterous Moon, most useful when attached to an Emotional Bear.',
  icon: 'assets/sprites/icons/moon.png',
  baseCost: 99,
  stackMax: 1,
});
for (const course of Object.values(PARADISE_COURSES)) {
  ensureItem(course.ticketId, {
    label: `Ticket to ${course.name}`,
    desc:
      course.id === 'cloud_rings'
        ? "Activate this card to glide through soft cloud rings, collecting quoins as you go. Don't forget to enjoy the view!"
        : course.id === 'radial_heights'
          ? 'Activate this card to spiral through Radial Heights. Find all the stars, and see what awaits!'
          : course.id === 'starlit_night'
            ? 'Activate this card to float through Starlit Night. Play a twinkling melody as you collect quoins among the stars.'
            : "Activate this card to frolic amidst the snowy hills of this winter wonderland. Can you play a tune as you collect the quoins?",
  });
}

/** Player-created item stacks persist per street, like original location stacks. */
let droppedItemState = createDroppedItemState();

let state = {
  started: false,
  questDone: false,
  toastTimer: 0,
  energyTick: 0,
  // Start quietly; players can opt into audio once they are ready.
  muted: true,
};

const audio = {
  ctx: null,
  buffers: {},
  music: null,
  musicGain: null,
  sfxGain: null,
  musicblock: null,
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

const DAMETIME_DEMO_HOURS = {
  night: 23,
  dawn: 6,
  day: 12,
  dusk: 19,
};

/** Visual-only Dametime override. Daily mechanics always use the real clock. */
function dametimeDisplayNow() {
  const demo = new URLSearchParams(location.search).get('timedemo');
  const hour = DAMETIME_DEMO_HOURS[String(demo || '').toLowerCase()];
  return Number.isFinite(hour)
    ? timestampForGameHour(Date.now(), hour, 30)
    : Date.now();
}

function updateDametimeChrome(now = dametimeDisplayNow()) {
  const parts = dametimeParts(now);
  const clock = document.getElementById('dametime-clock');
  if (clock) {
    clock.textContent = `${parts.time} ${parts.ampm}`;
    clock.title = `${parts.stringDayMonth}, Year ${parts.year} · ${formatDametime(now)}`;
    clock.setAttribute(
      'aria-label',
      `${parts.time} ${parts.ampm}, ${parts.stringDayMonth}, year ${parts.year}`
    );
  }
  const light = daylightState(now);
  const overlay = document.getElementById('daylight-overlay');
  if (overlay) {
    const preserveAuthoredLight =
      typeof summersDayIsInstanced === 'function' && summersDayIsInstanced();
    overlay.dataset.phase = light.phase;
    overlay.style.backgroundColor = light.cssColor;
    overlay.style.opacity = preserveAuthoredLight ? '0' : light.opacity.toFixed(3);
    overlay.title = preserveAuthoredLight
      ? 'The Giants’ memory keeps its own light'
      : `${light.phase} in Ur`;
  }
  return light;
}

function toast(msg, ms = 3000) {
  const el = document.getElementById('toast');
  el.hidden = false;
  el.textContent = msg;
  state.toastTimer = ms;
}

/** @type {Promise<void>} */
let awardQueue = Promise.resolve();
/** @type {Record<string, string>} classTsid → local badge PNG path */
let badgeIconMap = {};
/** @type {Record<string, { url?: string, local?: string, w?: number, h?: number }>} */
let loadingImageMap = {};
/** @type {Record<string, { top_color?: string, btm_color?: string, hubName?: string }>} */
let hubColorCache = {};

async function loadTransitionAssets() {
  try {
    const [bRes, lRes] = await Promise.all([
      fetch('assets/content/badge-icons.json?v=catalog-art-2'),
      fetch('assets/content/loading-images.json'),
    ]);
    if (bRes.ok) badgeIconMap = await bRes.json();
    if (lRes.ok) loadingImageMap = await lRes.json();
  } catch (e) {
    console.warn('transition assets', e);
  }
}

function tsidAliases(tsid) {
  if (!tsid) return [];
  const out = new Set([tsid]);
  if (tsid.startsWith('G')) out.add('L' + tsid.slice(1));
  if (tsid.startsWith('L')) out.add('G' + tsid.slice(1));
  if (tsid.startsWith('GLI')) out.add('LLI' + tsid.slice(3));
  if (tsid.startsWith('LLI')) out.add('GLI' + tsid.slice(3));
  return [...out];
}

function resolveLoadingImg(tsid) {
  for (const a of tsidAliases(tsid)) {
    const info = loadingImageMap[a];
    if (info?.local) return info.local;
  }
  // Fallback: local file by primary tsid name
  for (const a of tsidAliases(tsid)) {
    // prefer G-prefix key used by fetch script
    const key = loadingImageMap[a]?.tsid || a;
    if (loadingImageMap[a]?.local) return loadingImageMap[a].local;
    // try predictable path even if map incomplete
  }
  for (const a of tsidAliases(tsid)) {
    const cand = loadingImageMap[a];
    if (cand?.local) return cand.local;
  }
  // last resort: assume fetch used primary street tsid from index
  const meta = STREET_INDEX.streets?.[tsid];
  const primary = meta ? tsid : tsid;
  for (const ext of ['.jpg', '.png']) {
    // we can't head-check sync; return map-local only
  }
  void primary;
  return null;
}

async function resolveHubColors(hubId) {
  if (!hubId) return { top: null, bottom: null };
  const id = String(hubId);
  if (hubColorCache[id]) {
    return {
      top: hubColorCache[id].top_color || null,
      bottom: hubColorCache[id].btm_color || hubColorCache[id].bottom_color || null,
    };
  }
  try {
    // maps index points at hub JSON with top_color / btm_color
    const idxRes = await fetch('assets/maps/index.json');
    if (!idxRes.ok) return { top: null, bottom: null };
    const idx = await idxRes.json();
    const hubMeta = idx.hubs?.[id];
    if (!hubMeta?.file) return { top: null, bottom: null };
    const res = await fetch(hubMeta.file);
    if (!res.ok) return { top: null, bottom: null };
    const hub = await res.json();
    hubColorCache[id] = hub;
    return { top: hub.top_color || null, bottom: hub.btm_color || null };
  } catch {
    return { top: null, bottom: null };
  }
}

function badgeIconFor(classTsid) {
  if (!classTsid) return null;
  return badgeIconMap[classTsid] || null;
}

/** Honest neutral art for catalog rows whose official PNG is not archived. */
function achievementBadgeFallback(def = {}) {
  const fallback = document.createElement('div');
  fallback.className = 'badge-art badge-art-missing';
  fallback.dataset.source = 'neutral-unrecovered';
  fallback.setAttribute('aria-hidden', 'true');
  fallback.title = `Official ${def.name || 'achievement'} badge art is unavailable`;
  fallback.textContent = '✦';
  return fallback;
}

/**
 * Queue a full-screen award (crossfade). Serial so multiple unlocks don't stack.
 * @param {Parameters<typeof showAwardScreen>[1]} payload
 */
function enqueueAward(payload) {
  if (payload.kind === 'achievement' && payload.classTsid && !payload.iconUrl) {
    payload.iconUrl = badgeIconFor(payload.classTsid);
  }
  awardQueue = awardQueue
    .then(async () => {
      const el = document.getElementById('award-screen');
      playSfx(payload.kind === 'quest' ? 'quest' : 'eat', { volume: 0.7 });
      await showAwardScreen(el, payload);
    })
    .catch((e) => console.warn('award screen', e));
  return awardQueue;
}

/** Show every newly unlocked badge from a counter update. */
function announceAchievementUpdates(updates = []) {
  for (const update of updates) {
    if (!update.unlocked || !update.def) continue;
    const rewards = update.rewards || update.def.rewards || {};
    const rewardBits = [];
    if (rewards.xp) rewardBits.push(`+${Number(rewards.xp).toLocaleString()} iMG`);
    if (rewards.currants) rewardBits.push(`+${Number(rewards.currants).toLocaleString()} currants`);
    if (rewards.favor?.points && rewards.favor?.giant) {
      const giant = String(rewards.favor.giant);
      rewardBits.push(`+${Number(rewards.favor.points).toLocaleString()} ${giant[0].toUpperCase()}${giant.slice(1)} favor`);
    }
    if (app?.view) {
      app.view.dataset.achievementUnlocked = update.classTsid || update.def.classTsid;
      app.view.dataset.achievementReward = rewardBits.join(' · ');
      app.view.dataset.achievementUnlockedCount = String(achieveState.unlocked.length);
    }
    pushActivity(`Badge earned: ${update.def.name || update.def.title || 'Achievement'}.`);
    enqueueAward({
      kind: 'achievement',
      classTsid: update.classTsid || update.def.classTsid,
      title: update.def.name || update.def.title || 'Badge',
      body:
        update.def.statusText ||
        update.def.status_text ||
        update.def.desc ||
        update.def.description ||
        '',
      subtitle: rewardBits.join(' · '),
      iconUrl: badgeIconFor(update.classTsid || update.def.classTsid),
    });
  }
}

/**
 * Street load with LoadingLocationView-style full-screen crossfade.
 * @param {string} tsid
 * @param {{ spawnX?: number, spawnY?: number, useTransition?: boolean, quiet?: boolean }} [opts]
 */
async function enterStreetWithTransition(tsid, opts = {}) {
  const useFx = opts.useTransition !== false;
  const el = document.getElementById('screen-transition');
  const currentWinterLabel = winterLocationLabel(currentStreetTsid);
  const fromLabel = currentWinterLabel?.street || currentStreet?.label || '';
  const fromHub = currentWinterLabel?.hub || currentStreet?.hubName || '';
  const meta =
    STREET_INDEX.streets?.[tsid] ||
    STREET_INDEX.streets?.[String(tsid).replace(/^G/, 'L')] ||
    STREET_INDEX.streets?.[String(tsid).replace(/^L/, 'G')] ||
    {};
  const winterLabel = winterLocationLabel(tsid);
  const featureLabel = features.query('labelFor', tsid, engine);
  const toLabel = featureLabel?.street || winterLabel?.street || LAST_FEAT_STREET_LABELS[tsid] ||
    (tsid === AXIS_DENYDE_STREET_ID ? 'Axis Denyde' : meta.label || tsid);
  const toHub = featureLabel?.hub || winterLabel?.hub ||
    (tsid === AXIS_DENYDE_STREET_ID ? 'Pollokoo' : meta.hubName || '');
  const hubId = featureLabel?.hubId || meta.hubId || currentStreet?.hubId;
  const colors = await resolveHubColors(hubId);
  const loadingImg = resolveLoadingImg(tsid);

  if (!useFx || !el) {
    return enterStreet(tsid, opts);
  }
  let data = null;
  await runStreetTransition(el, {
    fromLabel,
    fromHub,
    toLabel,
    toHub,
    loadingImg,
    topColor: colors.top,
    bottomColor: colors.bottom,
    onMid: async () => {
      data = await enterStreet(tsid, { ...opts, quiet: true });
    },
  });
  playSfx('start', { volume: 0.4, rate: 1.05 });
  return data;
}

function setBar(id, value) {
  const el = document.getElementById(id);
  if (el) el.style.width = `${clamp(value, 0, 100)}%`;
}

/**
 * Push an activity line. Accepts plain text or { base, effects } for signed gain/loss HTML.
 * @param {string|{ base?: string, text?: string, html?: string, effects?: object }} msg
 */
function pushActivity(msg) {
  if (!msg) return;
  let plain = '';
  let html = '';
  if (typeof msg === 'string') {
    plain = msg;
    // Color signed deltas already embedded in strings like "-4 energy, +2 mood"
    html = colorizeActivityText(msg);
  } else if (msg && typeof msg === 'object') {
    if (msg.html) {
      html = msg.html;
      plain = msg.text || msg.base || stripHtml(msg.html);
    } else if (msg.effects || msg.base) {
      const base = msg.base || msg.text || 'You did a thing';
      plain = formatActivityLine(base, msg.effects || {});
      html = formatActivityHtml(base, msg.effects || {});
    } else {
      plain = msg.text || String(msg);
      html = colorizeActivityText(plain);
    }
  } else {
    plain = String(msg);
    html = colorizeActivityText(plain);
  }
  appendActivity(activityLog, plain);
  renderActivityHistory();
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'act';
  el.innerHTML = html || escapeHtml(plain);
  feed.prepend(el);
  // Keep a short stack of whole bubbles. A fixed-height box plus eight
  // variable-height messages left the oldest card visibly sliced in half.
  while (feed.children.length > 4) feed.removeChild(feed.lastChild);
}

function renderActivityHistory() {
  const box = document.getElementById('activity-history');
  if (!box) return;
  box.innerHTML = '';
  const lines = activityLog.lines.slice(0, 7);
  if (!lines.length) {
    const empty = document.createElement('div');
    empty.className = 'activity-history-empty';
    empty.textContent = 'Pet, gather, make, or explore to begin your afternoon.';
    box.appendChild(empty);
    return;
  }
  for (const line of lines) {
    const row = document.createElement('div');
    row.className = 'activity-history-line';
    row.innerHTML = colorizeActivityText(line);
    box.appendChild(row);
  }
}

function renderQuestTracker() {
  const box = document.getElementById('quest-tracker-list');
  const count = document.getElementById('quest-tracker-count');
  if (!box) return;
  const rows = listQuestTracker(questState, 2);
  if (count) count.textContent = String(Object.keys(questState.active).length);
  box.innerHTML = '';
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'quest-tracker-empty';
    empty.textContent = 'All current quests complete. Open the log for more.';
    box.appendChild(empty);
    return;
  }
  for (const quest of rows) {
    const card = document.createElement('div');
    card.className = 'quest-tracker-card';
    const title = document.createElement('div');
    title.className = 'quest-tracker-title';
    title.textContent = quest.title;
    card.appendChild(title);
    for (const req of quest.requirements) {
      const label = document.createElement('div');
      label.className = 'quest-tracker-req';
      label.innerHTML = `<span>${escapeHtml(req.desc)}</span><strong>${req.current}/${req.total}</strong>`;
      card.appendChild(label);
      const bar = document.createElement('div');
      bar.className = 'quest-tracker-bar';
      const fill = document.createElement('i');
      fill.style.width = `${req.percent}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
    }
    box.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, '');
}

/** Wrap "-N energy" / "+N mood|iMG|xp" in gain/loss spans for plain craft lines. */
function colorizeActivityText(text) {
  const esc = escapeHtml(text);
  return esc
    .replace(
      /([−\-]\d+)\s+(energy|mood|iMG|xp)/gi,
      '<span class="act-loss">$1 $2</span>'
    )
    .replace(
      /(\+\d+)\s+(energy|mood|iMG|xp)/gi,
      '<span class="act-gain">$1 $2</span>'
    );
}

function findPackSlotElement(classTsid) {
  return [...document.querySelectorAll('.pack-slot[data-tsid]')]
    .find((el) => el.dataset.tsid === classTsid) || null;
}

function closePackPopover() {
  packSelected = null;
  packDropMode = false;
  packDropQty = 1;
  const pop = document.getElementById('pack-popover');
  if (pop) {
    pop.hidden = true;
    pop.innerHTML = '';
  }
  document.querySelectorAll('.pack-slot[data-tsid]').forEach((slot) => {
    slot.classList.remove('active');
    slot.setAttribute('aria-expanded', 'false');
  });
}

function isPackPopoverOpen() {
  const pop = document.getElementById('pack-popover');
  return Boolean(packSelected && pop && !pop.hidden);
}

function packSlotStep(box) {
  const slots = [...box.querySelectorAll('.pack-slot')];
  if (slots.length > 1) {
    const measured = slots[1].offsetLeft - slots[0].offsetLeft;
    if (measured > 0) return measured;
  }
  return (slots[0]?.getBoundingClientRect().width || 44) + 5;
}

function refreshPackPager(box) {
  if (!box) return;
  const shell = box.closest('.pack-row-shell');
  if (!shell) return;
  let pager = packPagerState(box);
  shell.classList.toggle('has-overflow', pager.overflow);
  // Adding the two original-style 22px controls narrows the row. Measure the
  // resulting viewport before publishing the exact end position.
  pager = packPagerState(box);
  shell.classList.toggle('can-scroll-back', pager.canBack);
  shell.classList.toggle('can-scroll-forward', pager.canForward);
  const back = shell.querySelector('[data-pack-scroll="-1"]');
  const forward = shell.querySelector('[data-pack-scroll="1"]');
  if (back) back.disabled = !pager.canBack;
  if (forward) forward.disabled = !pager.canForward;
  box.dataset.packOverflow = pager.overflow ? '1' : '0';
  box.dataset.packScrollLeft = String(Math.round(pager.left));
  box.dataset.packScrollMax = String(Math.round(pager.max));
  if (app?.view) {
    const prefix = box.id === 'pack-tools' ? 'packTool' : 'packItem';
    app.view.dataset[`${prefix}Overflow`] = pager.overflow ? '1' : '0';
    app.view.dataset[`${prefix}ScrollLeft`] = String(Math.round(pager.left));
    app.view.dataset[`${prefix}ScrollMax`] = String(Math.round(pager.max));
  }
}

function scrollPackRow(box, direction) {
  if (!box) return;
  const target = packPageTarget(box, direction, packSlotStep(box));
  box.scrollTo({ left: target, behavior: 'smooth' });
  window.setTimeout(() => refreshPackPager(box), 240);
}

function setupPackPager(box) {
  if (!box || box.dataset.packPagerReady === '1') return;
  box.dataset.packPagerReady = '1';
  const shell = box.closest('.pack-row-shell');
  shell?.querySelectorAll('[data-pack-scroll]').forEach((button) => {
    button.addEventListener('click', () => scrollPackRow(box, Number(button.dataset.packScroll)));
  });
  box.addEventListener('scroll', () => {
    refreshPackPager(box);
    if (isPackPopoverOpen()) {
      const anchor = findPackSlotElement(packSelected);
      if (anchor) positionPackPopover(document.getElementById('pack-popover'), anchor);
    }
  }, { passive: true });
  box.addEventListener('wheel', (event) => {
    const pager = packPagerState(box);
    if (!pager.overflow || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    box.scrollBy({ left: event.deltaY, behavior: 'auto' });
  }, { passive: false });
}

function refreshPackPagers() {
  for (const id of ['pack-items', 'pack-tools']) {
    const box = document.getElementById(id);
    setupPackPager(box);
    refreshPackPager(box);
  }
}

function positionPackPopover(pop, anchor) {
  const bar = document.getElementById('pack-bar');
  if (!bar || !anchor) return;
  const barRect = bar.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const popWidth = pop.offsetWidth || 300;
  const anchorCenter = anchorRect.left - barRect.left + anchorRect.width / 2;
  const left = clamp(anchorCenter - popWidth / 2, 8, Math.max(8, barRect.width - popWidth - 8));
  pop.style.left = `${Math.round(left)}px`;
  const arrowLeft = clamp(anchorCenter - left, 20, popWidth - 20);
  pop.style.setProperty('--pack-arrow-left', `${Math.round(arrowLeft)}px`);
}

function paradiseCourseForTicket(classTsid) {
  return Object.values(PARADISE_COURSES).find((course) => course.ticketId === classTsid) || null;
}

function syncEmotionalBearCatalog() {
  const meta = ITEM_CATALOG[EMOTIONAL_BEAR_ID];
  if (meta) meta.icon = emotionalBearIcon(emotionalBearState);
}

function isEmotionalBearPickerOpen() {
  const panel = document.getElementById('emotional-bear-picker');
  return Boolean(emotionalBearPendingAction && panel && !panel.hidden);
}

function closeEmotionalBearPicker(result = 'cancelled') {
  const panel = document.getElementById('emotional-bear-picker');
  if (panel) panel.hidden = true;
  emotionalBearPendingAction = null;
  if (app?.view) app.view.dataset.emotionalBearPicker = result;
}

function showEmotionalBearFx(animation, copy, durationMs, anthropomorphize = false) {
  const fx = document.getElementById('emotional-bear-fx');
  const art = document.getElementById('emotional-bear-fx-art');
  const label = document.getElementById('emotional-bear-fx-copy');
  if (!fx || !art || !label) return;
  clearTimeout(emotionalBearFxTimer);
  fx.hidden = false;
  fx.classList.toggle('is-anthropomorphize', anthropomorphize);
  label.textContent = copy;
  // Clearing src before the cache-busted assignment reliably restarts animated WebP.
  art.src = '';
  art.alt = `${copy} Emotional Bear animation`;
  requestAnimationFrame(() => {
    art.src = `assets/sprites/emotional-bear/${animation}.webp?play=${Date.now()}`;
  });
  emotionalBearFxTimer = window.setTimeout(() => {
    fx.hidden = true;
    art.src = '';
  }, Math.max(1_000, durationMs));
}

function runEmotionalBearAction(actionId, target = '') {
  if (countItem(inv, EMOTIONAL_BEAR_ID) < 1) {
    closeEmotionalBearPicker('missing');
    toast('Your Emotional Bear is no longer in your pack.');
    return false;
  }
  const result = performEmotionalBearAction(
    emotionalBearState,
    pc,
    actionId,
    target,
    {
      dayKey: getGameDayKey(Date.now()),
      inRace: hogHaulIsInstanced(),
    }
  );
  if (!result.ok) {
    toast(result.message || 'The Emotional Bear cannot do that.');
    if (isEmotionalBearPickerOpen()) {
      const pending = emotionalBearPendingAction;
      closeEmotionalBearPicker(result.reason || 'failed');
      if (pending) renderPackPopover(EMOTIONAL_BEAR_ID);
    }
    return false;
  }
  closeEmotionalBearPicker('selected');
  closePackPopover();
  showEmotionalBearFx(
    result.animation,
    actionId === 'anthropomorphize'
      ? 'You anthropomorphized your bear'
      : `${EMOTIONAL_BEAR_ACTIONS[actionId].label} · ${target}`,
    result.durationMs,
    actionId === 'anthropomorphize'
  );
  playSfx(actionId === 'high_five' ? 'pickup' : 'quest', {
    volume: 0.48,
    rate: actionId === 'moon' ? 0.82 : 1.08,
  });
  pushActivity(
    actionId === 'anthropomorphize'
      ? `${result.message} Mood +${result.effects.mood}.`
      : `${result.message}${result.targetEffects.mood > 0 ? ` ${target} mood +${result.targetEffects.mood}.` : ''}`
  );
  toast(
    actionId === 'anthropomorphize'
      ? `${result.message} Mood +${result.effects.mood}.`
      : `${result.message}${result.targetEffects.mood > 0 ? ` ${target} mood +${result.targetEffects.mood}.` : ''}`,
    Math.min(4_800, result.durationMs)
  );
  if (target) {
    const response = `${EMOTIONAL_BEAR_ACTIONS[actionId].label}! Mood +${result.targetEffects.mood}`;
    showLocalChatBubble(target, response);
    showLocalCompanionSpeech(target, response, {
      durationMs: Math.min(7_200, result.durationMs),
    });
  }
  if (result.uniqueTarget) {
    const counter = {
      hug: 'players_hugged',
      high_five: 'players_high_fived',
      kiss: 'kissed',
      moon: 'players_mooned',
    }[actionId];
    if (counter) {
      announceAchievementUpdates(applyAchievementProgress(achieveState, counter, 1, pc));
    }
  }
  if (player) {
    floatText(
      player.x,
      player.y - 88,
      actionId === 'anthropomorphize' ? `+${result.effects.mood} mood` : EMOTIONAL_BEAR_ACTIONS[actionId].label,
      0xf09ac1
    );
    burst(player.x, player.y - 45, 0xf09ac1, 18);
  }
  if (app?.view) {
    app.view.dataset.emotionalBearAction = actionId;
    app.view.dataset.emotionalBearTarget = target || 'self';
    app.view.dataset.emotionalBearState = emotionalBearIconState(emotionalBearState);
    app.view.dataset.emotionalBearTotal = String(emotionalBearState.totalEmotes);
  }
  updateHud();
  return true;
}

function openEmotionalBearPicker(actionId) {
  const action = EMOTIONAL_BEAR_ACTIONS[actionId];
  if (!action) return false;
  const quote = emotionalBearActionQuote(
    emotionalBearState,
    pc,
    actionId,
    EMOTIONAL_BEAR_COMPANIONS[0],
    { dayKey: getGameDayKey(Date.now()), inRace: hogHaulIsInstanced() }
  );
  if (!quote.ok) {
    toast(quote.message);
    return false;
  }
  closePackPopover();
  emotionalBearPendingAction = actionId;
  const panel = document.getElementById('emotional-bear-picker');
  const title = document.getElementById('emotional-bear-picker-title');
  const sub = document.getElementById('emotional-bear-picker-sub');
  const grid = document.getElementById('emotional-bear-picker-grid');
  if (!panel || !grid) return false;
  if (title) title.textContent = `${action.label} whom?`;
  if (sub) sub.textContent = `${action.energy} energy · choose a street companion`;
  grid.innerHTML = '';
  for (const companion of EMOTIONAL_BEAR_COMPANIONS) {
    const mood = emotionalBearState.companionMood[companion];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'emotional-bear-target';
    button.dataset.bearTarget = companion;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', `${action.label} ${companion}, mood ${mood}`);
    button.innerHTML = `
      <span class="emotional-bear-target-avatar" aria-hidden="true">${escapeHtml(companion.slice(0, 1))}</span>
      <strong>${escapeHtml(companion)}</strong>
      <small>Mood ${mood}/100</small>
      <span class="emotional-bear-target-mood" aria-hidden="true"><i style="width:${mood}%"></i></span>`;
    button.addEventListener('click', () => runEmotionalBearAction(actionId, companion));
    grid.appendChild(button);
  }
  panel.hidden = false;
  requestAnimationFrame(() => grid.querySelector('button')?.focus({ preventScroll: true }));
  if (app?.view) app.view.dataset.emotionalBearPicker = actionId;
  return true;
}

function upgradePackedEmotionalBear(upgrade) {
  const result = upgradeEmotionalBear(emotionalBearState, inv, upgrade);
  if (!result.ok) {
    const message = result.reason === 'missing_accessory'
      ? `You need ${upgrade === 'kiss' ? 'Lips' : 'a Moon'} in your pack.`
      : 'This Emotional Bear already has that upgrade.';
    toast(message);
    return false;
  }
  syncEmotionalBearCatalog();
  playSfx('pickup', { volume: 0.55, rate: 1.32 });
  pushActivity(result.message);
  toast(result.message, 4200);
  if (app?.view) app.view.dataset.emotionalBearState = result.iconState;
  updateHud();
  renderPackPopover(EMOTIONAL_BEAR_ID);
  return true;
}

/** Merge ordinary food metabolics with real item-triggered buff actions. */
function getPackUseInfo(classTsid) {
  const cubimalPackage = cubimalPackageInfo(classTsid);
  if (cubimalPackage) {
    const progress = cubimalCollectionProgress(inv, cubimalPackage.series);
    return {
      usable: countItem(inv, classTsid) > 0,
      verb: 'Open',
      singleAction: true,
      effects: {},
      message: `What's inside the boooooxxxxx???? Series ${cubimalPackage.series} collection: ${progress.owned}/${progress.total}.`,
      reason: countItem(inv, classTsid) > 0 ? '' : 'That Cubimal box is no longer in your pack.',
    };
  }
  const cubimal = cubimalInfo(classTsid);
  if (cubimal) {
    const progress = cubimalCollectionProgress(inv, cubimal.series);
    const canFree = cubimal.setFreeImg > 0;
    return {
      usable: canFree && countItem(inv, classTsid) > 0,
      verb: 'Set free, with love',
      singleAction: true,
      effects: canFree ? { xp: cubimal.setFreeImg } : {},
      message: canFree
        ? `Series ${cubimal.series} collection: ${progress.owned}/${progress.total}. Set this Cubimal free for ${cubimal.setFreeImg.toLocaleString()} Imagination.`
        : `Series ${cubimal.series} collection: ${progress.owned}/${progress.total}. This rare Cubimal cannot be set free for Imagination.`,
      reason: canFree ? '' : 'This rare Cubimal is staying with you.',
    };
  }
  if (classTsid === STOOT_DOLL_ID) {
    return {
      usable: countItem(inv, STOOT_DOLL_ID) > 0,
      verb: 'Pull string',
      singleAction: true,
      effects: {},
      message: 'You suspect the doll might say something.',
      reason: countItem(inv, STOOT_DOLL_ID) > 0 ? '' : 'The doll is no longer in your pack.',
    };
  }
  const paradiseCourse = paradiseCourseForTicket(classTsid);
  if (paradiseCourse) {
    const quote = quoteParadiseTicket(paradiseState, paradiseCourse.id, {
      imagination: pc.imagination,
      quoinMultiplier: quoinState.multiplier,
    });
    const tickets = paradiseState.ticketsToday;
    const ticketCopy = tickets === 1 ? 'ticket' : 'tickets';
    const reason =
      paradiseRun
        ? 'You already activated a ticket!'
        : quote.reason === 'daily_limit'
          ? `You have already activated the maximum ${PARADISE_DAILY_LIMIT} Ticket to Paradise cards today.`
          : quote.reason === 'not_enough_imagination'
            ? `You need at least ${quote.cost.toLocaleString()} iMG to do that!`
            : '';
    return {
      usable: !reason,
      verb: 'Activate',
      effects: {},
      message: `Be whisked away to ${paradiseCourse.name}. You have used ${tickets} ${ticketCopy} today.`,
      reason,
      paradise: {
        courseId: paradiseCourse.id,
        cost: quote.cost,
        ticketsToday: tickets,
        dailyLimit: PARADISE_DAILY_LIMIT,
      },
    };
  }
  if (classTsid === HOGTIED_JONES_ID) {
    const rescue = ensureIlmenskieState(questState);
    const gate = canReleaseIlmenskieJones(rescue, currentStreetTsid);
    return {
      usable: true,
      verb: 'Release',
      effects: {},
      message: gate.ok ? 'Release Ilmenskie Jones here.' : gate.message,
      reason: gate.message,
    };
  }
  if (classTsid === FADED_HEART_ID) {
    const story = ensureGhostQuestState(questState, availableStreetTsids());
    const active = Boolean(questState.active?.[REMEMBER_QUEST_ID]);
    const cooldownMs = Math.max(0, story.memoryCooldownUntil - Date.now());
    const rememberedHere = story.rememberedStreets.includes(currentStreetTsid);
    const reason = !active
      ? 'The heart is quiet. A later ghost story may wake it.'
      : cooldownMs > 0
        ? `The memory is still forming for ${Math.ceil(cooldownMs / 1000)}s.`
        : rememberedHere
          ? 'You have already remembered this street.'
          : '';
    return {
      usable: active && !reason,
      verb: 'Remember',
      effects: {},
      message: 'Dredge up memories of the past.',
      reason,
      ghostMemory: {
        active,
        remembered: story.rememberedStreets.length,
        total: 13,
      },
    };
  }
  if (classTsid === GAMESHOW_TICKET_ID) {
    const reason = spinningWheelTarget
      ? 'Finish this wheel before redeeming another ticket.'
      : '';
    return {
      usable: !reason,
      verb: 'Use',
      effects: {},
      message: 'Redeem for a chance at special prizes.',
      reason,
    };
  }
  if (classTsid === LEGALIZE_CARD_ID) {
    const legalize = ensureLegalizeState(questState);
    const active = Boolean(questState.active?.[LEGALIZE_QUEST_ID]);
    const reason = legalize.activated
      ? 'You already activated this qualification.'
      : !active
        ? 'There is no active application to attach this qualification to.'
        : '';
    return {
      usable: !reason,
      verb: 'Activate',
      effects: {},
      message: 'Qualify yourself to carry cards.',
      reason,
    };
  }
  const buff = getBuffItemInfo(classTsid);
  if (buff?.def) {
    return {
      usable: true,
      verb: buff.verb,
      effects: {},
      message: buff.message,
      buff,
    };
  }
  const info = getItemUseInfo(classTsid);
  if (!info.usable || !info.effects?.energy || info.kind === 'drink') return info;
  const quote = quoteFoodVarietyBonus(
    foodState,
    classTsid,
    info.effects.energy,
    pc.imaginationUpgrades || [],
    Date.now()
  );
  const gate = canEatFood(foodState, pc, 100);
  return {
    ...info,
    food: {
      quote,
      gate,
      fullness: foodFullness(foodState, 100),
      status: foodBonusStatus(quote),
    },
  };
}

function showToolRepairFx(label, durationMs) {
  document.getElementById('tool-repair-fx')?.remove();
  const fx = document.createElement('div');
  fx.id = 'tool-repair-fx';
  fx.className = 'tool-repair-fx';
  fx.style.setProperty('--tool-repair-ms', `${durationMs}ms`);
  fx.setAttribute('role', 'status');
  fx.setAttribute('aria-label', `Repairing ${label}`);
  const sprite = document.createElement('span');
  sprite.className = 'tool-repair-sprite';
  sprite.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.className = 'tool-repair-copy';
  copy.textContent = `Tinkering with ${label}…`;
  const track = document.createElement('span');
  track.className = 'tool-repair-track';
  track.appendChild(document.createElement('i'));
  fx.append(sprite, copy, track);
  document.body.appendChild(fx);
}

function hideToolRepairFx() {
  document.getElementById('tool-repair-fx')?.remove();
}

function beginToolRepair(classTsid) {
  if (activeToolRepair) {
    toast('Finish the current repair first.');
    return false;
  }
  const quote = quoteToolRepair(toolState, classTsid, skillState.learned || []);
  if (!quote.ok) {
    const msg = quote.reason === 'skill'
      ? 'You need Tinkering I to repair tools.'
      : quote.reason === 'self_skill'
        ? 'Repairing a Tinkertool requires Tinkering III and a spare Tinkertool.'
        : 'That tool does not need repairing.';
    toast(msg);
    return false;
  }
  if (countItem(inv, 'tinkertool') < 1) {
    toast('You need a working Tinkertool to repair this.');
    return false;
  }
  if (classTsid === 'tinkertool' && countItem(inv, 'tinkertool') < 2) {
    toast('A Tinkertool needs another working Tinkertool for this repair.');
    return false;
  }
  const tinkerCheck = canUseTool(toolState, 'tinkertool', quote.tinkertoolWear);
  if (!tinkerCheck.ok) {
    toast(tinkerCheck.msg);
    return false;
  }
  if (pc.energy < quote.energy) {
    toast(`You need ${quote.energy} energy to finish this repair.`);
    return false;
  }

  closePackPopover();
  const finishesAt = Date.now() + quote.durationMs;
  const timer = window.setTimeout(() => {
    if (!activeToolRepair || activeToolRepair.classTsid !== classTsid) return;
    activeToolRepair = null;
    hideToolRepairFx();
    const result = repairToolCondition(toolState, classTsid, pc, {
      learned: skillState.learned || [],
      hasTinkertool: countItem(inv, 'tinkertool') >= 1,
      hasSpareTinkertool: countItem(inv, 'tinkertool') >= 2,
    });
    if (!result.ok) {
      toast(result.msg || 'The repair could not be finished.');
      updateHud();
      return;
    }
    toast(result.msg, 3600);
    pushActivity(result.msg);
    playSfx('pickup', { volume: 0.45, rate: 1.35 });
    emitGameEvent(`tool_repaired:${classTsid}`);
    updateHud();
  }, quote.durationMs);
  activeToolRepair = { classTsid, timer, finishesAt };
  showToolRepairFx(quote.condition.label, quote.durationMs);
  toast(
    `Repairing ${quote.condition.label} · ${quote.energy} energy · ${quote.durationSeconds}s of tinkering`,
    quote.durationMs + 500
  );
  playSfx('step', { volume: 0.28, rate: 1.2 });
  return true;
}

/** Original-style pack inspection card with contextual use, recipe, and sell actions. */
function renderPackPopover(classTsid, anchor = null) {
  const pop = document.getElementById('pack-popover');
  const slot = listPackSlots(inv).find((entry) => entry.classTsid === classTsid);
  if (!pop || !slot || slot.count < 1) {
    closePackPopover();
    return;
  }
  if (packSelected && packSelected !== classTsid) {
    packDropMode = false;
    packDropQty = 1;
  }
  packSelected = classTsid;
  packDropQty = normalizeStackQuantity(packDropQty, slot.count);
  const sourceAnchor = anchor || findPackSlotElement(classTsid);
  const useInfo = getPackUseInfo(classTsid);
  const isEmotionalBear = classTsid === EMOTIONAL_BEAR_ID;
  const bearActions = isEmotionalBear
    ? listEmotionalBearActions(emotionalBearState, pc, {
        dayKey: getGameDayKey(Date.now()),
        inRace: hogHaulIsInstanced(),
      })
    : [];
  const bearStateName = isEmotionalBear ? emotionalBearIconState(emotionalBearState) : '';
  const bearUpgradeLabels = [];
  if (isEmotionalBear && emotionalBearHasUpgrade(emotionalBearState, 'kiss')) bearUpgradeLabels.push('Lips');
  if (isEmotionalBear && emotionalBearHasUpgrade(emotionalBearState, 'moon')) bearUpgradeLabels.push('Moon');
  const bearStateMarkup = isEmotionalBear
    ? `<div class="pack-bear-state" data-bear-state="${bearStateName}">
        <img src="${emotionalBearIcon(emotionalBearState)}" alt="" />
        <div>
          <strong>${bearUpgradeLabels.length ? `Upgraded with ${bearUpgradeLabels.join(' + ')}` : 'Plain Emotional Bear'}</strong>
          <span>${emotionalBearState.totalEmotes} social ${emotionalBearState.totalEmotes === 1 ? 'emote' : 'emotes'} · daily cheer ${emotionalBearState.anthropomorphizedDay === getGameDayKey(Date.now()) ? 'used' : 'ready'}</span>
        </div>
      </div>`
    : '';
  const bearActionMarkup = isEmotionalBear
    ? bearActions
        .filter((action) => action.available)
        .map((action) => `<button type="button" class="pack-bear-action${action.id === 'anthropomorphize' ? ' pack-pop-primary' : ''}" data-bear-action="${action.id}" ${action.enabled ? '' : `disabled title="${escapeHtml(action.reason)}"`}>${escapeHtml(action.label)}${action.energy ? ` · ${action.energy} energy` : ' · +20 mood'}</button>`)
        .join('')
    : '';
  const bearUpgradeMarkup = isEmotionalBear
    ? [
        ['kiss', 'Attach Lips'],
        ['moon', 'Attach Moon'],
      ].map(([upgrade, label]) => {
        if (emotionalBearHasUpgrade(emotionalBearState, upgrade)) return '';
        const quote = emotionalBearUpgradeQuote(emotionalBearState, inv, upgrade);
        return `<button type="button" class="pack-bear-upgrade" data-bear-upgrade="${upgrade}" ${quote.ok ? '' : 'disabled'} title="${quote.ok ? `Consume ${upgrade === 'kiss' ? 'Lips' : 'one Moon'} from your pack` : `Buy ${upgrade === 'kiss' ? 'Lips' : 'a Moon'} from a Toy Vendor`}">${label}</button>`;
      }).join('')
    : '';
  const bearReminisceQuote = isEmotionalBear
    ? canOfferGreedyRepeat(questState, Date.now(), {
        bypassCooldown: String(new URLSearchParams(location.search).get('questdemo') || '').startsWith('greedy'),
      })
    : null;
  const bearReminisceMarkup = isEmotionalBear
    ? `<button type="button" class="pack-bear-action pack-bear-reminisce" data-bear-reminisce
        ${bearReminisceQuote?.ok ? '' : `disabled title="${escapeHtml(
          bearReminisceQuote?.reason === 'cooldown'
            ? 'The Bear needs an hour before reminiscing again.'
            : 'First hear the bedtime story from a Piggy.'
        )}"`}>Reminisce · Greedy Street Spirit Story</button>`
    : '';
  const isBearAccessory = classTsid === 'lips' || classTsid === 'moon';
  const bearAccessoryMarkup = isBearAccessory && countItem(inv, EMOTIONAL_BEAR_ID) > 0
    ? '<button type="button" class="pack-bear-upgrade" data-show-emotional-bear>Show Emotional Bear</button>'
    : '';
  const musicblockDef = getMusicblock(classTsid);
  const musicblockCollection = musicblockDef ? listMusicblockCollection(inv) : null;
  const musicblockSeries = musicblockCollection
    ? musicblockCollection.rows.filter((row) => row.collection === musicblockDef.collection)
    : [];
  const relatedRecipes = listRecipes().filter((recipe) =>
    (recipe.inputs || []).some((input) => input.classTsid === classTsid)
  );
  const toolRecipes = slot.isTool ? listRecipesForTool(classTsid) : [];
  const recipeTarget = slot.isTool ? toolRecipes[0] : relatedRecipes[0];
  const kind = musicblockDef
    ? 'Musicblock'
    : slot.isTool
      ? 'Tool'
      : useInfo.usable
        ? useInfo.singleAction ? 'Item' : 'Consumable'
        : relatedRecipes.length
          ? 'Ingredient'
          : 'Item';
  const trackedCondition = getToolCondition(toolState, classTsid);
  const toolCondition = trackedCondition.tracked ? trackedCondition : null;
  const repairQuote = toolCondition?.tracked && toolCondition.needsRepair && toolCondition.repairable
    ? quoteToolRepair(toolState, classTsid, skillState.learned || [])
    : null;
  const hasRepairTool = countItem(inv, 'tinkertool') >= (classTsid === 'tinkertool' ? 2 : 1);
  const repairTinkertoolReady = repairQuote?.ok
    ? canUseTool(toolState, 'tinkertool', repairQuote.tinkertoolWear).ok
    : false;
  const canRepair = Boolean(
    repairQuote?.ok &&
    hasRepairTool &&
    repairTinkertoolReady &&
    pc.energy >= repairQuote.energy &&
    !activeToolRepair
  );
  const conditionMarkup = toolCondition?.tracked
    ? `<div class="pack-tool-condition${toolCondition.broken ? ' broken' : ''}">
        <div><span>${toolCondition.broken ? 'Broken' : 'Condition'}</span><strong>${toolCondition.remaining}/${toolCondition.capacity}</strong></div>
        <div class="pack-tool-condition-track"><i style="width:${Math.round(toolCondition.percent * 100)}%"></i></div>
      </div>`
    : slot.isTool
      ? '<p class="pack-tool-unlimited">This tool has no wear meter.</p>'
      : '';
  const metabolicEffects = Object.entries(useInfo.effects || {})
    .map(([stat, amount]) => `<span class="pack-pop-effect${amount < 0 ? ' loss' : ''}">${amount > 0 ? '+' : ''}${amount} ${escapeHtml(stat === 'xp' ? 'iMG' : stat)}</span>`)
    .join('');
  const buffEffect = useInfo.buff
    ? `<span class="pack-pop-effect buff">${escapeHtml(useInfo.buff.def.name)}${useInfo.buff.durationSeconds ? ` · ${useInfo.buff.durationSeconds}s` : ''}</span>`
    : '';
  const effects = musicblockDef
    ? '<span class="pack-pop-effect loss">−2 energy</span><span class="pack-pop-effect">+2 mood</span><span class="pack-pop-effect music">fresh tune +50 iMG</span>'
    : metabolicEffects + buffEffect;
  const foodMemory = useInfo.food
    ? `<div class="pack-food-memory${useInfo.food.quote.img > 0 ? ' has-bonus' : ''}">
        <div><strong>${escapeHtml(useInfo.food.status)}</strong><span>${Math.round(useInfo.food.fullness.percent)}% full today</span></div>
        <div class="pack-food-track" aria-hidden="true"><i style="width:${Math.round(useInfo.food.fullness.percent)}%"></i></div>
        ${!useInfo.food.gate.ok ? `<p>${escapeHtml(useInfo.food.gate.reason)}</p>` : ''}
      </div>`
    : '';
  const buffNote = useInfo.buff?.effectHint || '';
  const recipeNote = slot.isTool
    ? `${toolRecipes.length} ${toolRecipes.length === 1 ? 'recipe' : 'recipes'} with this tool`
    : relatedRecipes.length
      ? `Used in ${relatedRecipes.length} ${relatedRecipes.length === 1 ? 'recipe' : 'recipes'}`
      : '';
  const collectionNote = musicblockCollection
    ? `Recovered tunes ${musicblockCollection.owned}/${musicblockCollection.total} · ${musicblockDef.collection} series ${musicblockSeries.filter((row) => row.owned).length}/${musicblockSeries.length}`
    : '';
  const offer = activeVendor.offers.find((row) => row.classTsid === classTsid);
  const canSellHere = isVendorOpen() && !slot.isTool && slot.sellable !== false;
  const makeLabel = slot.isTool
    ? classTsid === 'fruit_changing_machine'
      ? 'Convert fruit'
      : `Make with ${slot.label}`
    : `Show ${relatedRecipes.length === 1 ? 'recipe' : 'recipes'}`;
  const dropPrompt = packDropMode
    ? `<div class="pack-drop-quantity" aria-label="Choose quantity to drop">
        <p>Drop this stack at your feet. Nearby matching stacks will merge.</p>
        <div class="pack-drop-stepper">
          <button type="button" data-pack-drop-dec aria-label="Drop one fewer">−</button>
          <output aria-live="polite">${packDropQty} of ${slot.count}</output>
          <button type="button" data-pack-drop-inc aria-label="Drop one more">+</button>
        </div>
        <div class="pack-drop-confirm-row">
          <button type="button" data-pack-drop-cancel>Cancel</button>
          <button type="button" class="pack-pop-primary" data-pack-drop-confirm>Drop ${packDropQty}</button>
        </div>
      </div>`
    : '';

  pop.hidden = false;
  pop.innerHTML = `
    <div class="pack-pop-head">
      <div class="pack-pop-icon"><img src="${slot.icon}" alt="" /></div>
      <div class="pack-pop-title">
        <span class="pack-pop-kind">${kind}</span>
        <h3 id="pack-popover-title">${escapeHtml(slot.label)} <b>×${slot.count}</b></h3>
      </div>
      <button type="button" class="pack-pop-close" data-pack-close aria-label="Close item actions">×</button>
    </div>
    <p class="pack-pop-desc">${escapeHtml(slot.desc || 'A thing from Ur.')}</p>
    ${bearStateMarkup}
    ${conditionMarkup}
    ${effects ? `<div class="pack-pop-effects">${effects}</div>` : ''}
    ${foodMemory}
    ${buffNote ? `<p class="pack-pop-recipes">${escapeHtml(buffNote)}</p>` : ''}
    ${collectionNote ? `<p class="pack-pop-recipes" data-musicblock-collection>${escapeHtml(collectionNote)}</p>` : ''}
    ${recipeNote ? `<p class="pack-pop-recipes">${escapeHtml(recipeNote)}</p>` : ''}
    <div class="pack-pop-actions">
      ${musicblockDef ? `<button type="button" class="pack-pop-primary" data-pack-play>Play tune</button>` : ''}
      ${useInfo.usable ? `<button type="button" class="pack-pop-primary" data-pack-use ${useInfo.food && !useInfo.food.gate.ok ? 'disabled' : ''}>${escapeHtml(useInfo.verb)}${useInfo.singleAction ? '' : ' one'}</button>` : ''}
      ${bearActionMarkup}
      ${bearReminisceMarkup}
      ${bearUpgradeMarkup}
      ${bearAccessoryMarkup}
      ${toolCondition?.tracked && toolCondition.needsRepair && toolCondition.repairable ? `<button type="button" class="pack-pop-repair" data-pack-repair ${canRepair ? '' : 'disabled'} title="${canRepair ? 'Repair with your Tinkertool' : 'Needs Tinkering, energy, and a working Tinkertool'}">Repair · ${repairQuote?.ok ? `${repairQuote.energy} energy` : 'unavailable'}</button>` : ''}
      ${recipeTarget ? `<button type="button" data-pack-make>${escapeHtml(makeLabel)}</button>` : ''}
      <button type="button" data-pack-drop>Drop</button>
      ${canSellHere ? `<button type="button" class="pack-pop-sell" data-pack-sell>Sell for ◎ ${offer?.sellPrice ?? 1}</button>` : ''}
    </div>
    ${dropPrompt}`;

  document.querySelectorAll('.pack-slot[data-tsid]').forEach((el) => {
    const selected = el.dataset.tsid === classTsid;
    el.classList.toggle('active', selected);
    el.setAttribute('aria-expanded', selected ? 'true' : 'false');
  });
  positionPackPopover(pop, sourceAnchor);

  pop.querySelector('[data-pack-close]')?.addEventListener('click', closePackPopover);
  pop.querySelector('[data-pack-use]')?.addEventListener('click', () => {
    closePackPopover();
    usePackItem(classTsid);
  });
  pop.querySelectorAll('[data-bear-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const actionId = button.dataset.bearAction;
      if (actionId === 'anthropomorphize') runEmotionalBearAction(actionId);
      else openEmotionalBearPicker(actionId);
    });
  });
  pop.querySelector('[data-bear-reminisce]')?.addEventListener('click', () => {
    openQuestDialogue(GREEDY_STREET_SPIRIT_REPEAT_ID);
  });
  pop.querySelectorAll('[data-bear-upgrade]').forEach((button) => {
    button.addEventListener('click', () => upgradePackedEmotionalBear(button.dataset.bearUpgrade));
  });
  pop.querySelector('[data-show-emotional-bear]')?.addEventListener('click', () => {
    const bear = findPackSlotElement(EMOTIONAL_BEAR_ID);
    renderPackPopover(EMOTIONAL_BEAR_ID, bear);
  });
  pop.querySelector('[data-pack-play]')?.addEventListener('click', () => {
    closePackPopover();
    playPackMusicblock(classTsid);
  });
  pop.querySelector('[data-pack-repair]')?.addEventListener('click', () => {
    beginToolRepair(classTsid);
  });
  pop.querySelector('[data-pack-make]')?.addEventListener('click', () => {
    closePackPopover();
    makeToolFilter = slot.isTool ? classTsid : recipeTarget.tool;
    openMakePanel();
    if (!slot.isTool && recipeTarget) {
      makeSelected = recipeTarget.key;
      makeQty = 1;
      renderMakePanel();
    }
  });
  pop.querySelector('[data-pack-sell]')?.addEventListener('click', () => {
    closePackPopover();
    stageVendorSell(classTsid);
  });
  pop.querySelector('[data-pack-drop]')?.addEventListener('click', () => {
    if (slot.count <= 1) {
      dropPackItem(classTsid, 1);
      return;
    }
    packDropMode = true;
    packDropQty = normalizeStackQuantity(packDropQty, slot.count);
    renderPackPopover(classTsid, sourceAnchor);
  });
  pop.querySelector('[data-pack-drop-dec]')?.addEventListener('click', () => {
    packDropQty = normalizeStackQuantity(packDropQty - 1, slot.count);
    renderPackPopover(classTsid, sourceAnchor);
  });
  pop.querySelector('[data-pack-drop-inc]')?.addEventListener('click', () => {
    packDropQty = normalizeStackQuantity(packDropQty + 1, slot.count);
    renderPackPopover(classTsid, sourceAnchor);
  });
  pop.querySelector('[data-pack-drop-cancel]')?.addEventListener('click', () => {
    packDropMode = false;
    packDropQty = 1;
    renderPackPopover(classTsid, sourceAnchor);
  });
  pop.querySelector('[data-pack-drop-confirm]')?.addEventListener('click', () => {
    dropPackItem(classTsid, packDropQty);
  });
}

/**
 * Render one pack row (items or tools).
 * @param {HTMLElement|null} box
 * @param {{ classTsid: string, label: string, count: number, icon: string, desc?: string, isTool?: boolean }[]} slots
 * @param {{ emptyCount?: number, toolRow?: boolean }} [opts]
 */
function renderPackRow(box, slots, opts = {}) {
  if (!box) return;
  setupPackPager(box);
  box.innerHTML = '';
  const emptyCount = opts.emptyCount ?? 4;
  if (!slots.length) {
    for (let i = 0; i < emptyCount; i++) {
      const empty = document.createElement('div');
      empty.className = 'pack-slot pack-empty';
      empty.setAttribute('role', 'listitem');
      box.appendChild(empty);
    }
    refreshPackPager(box);
    return;
  }
  for (const s of slots) {
    const trackedCondition = getToolCondition(toolState, s.classTsid);
    const toolCondition = trackedCondition.tracked
      ? trackedCondition
      : s.isTool || opts.toolRow
        ? trackedCondition
        : null;
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'pack-slot' + (s.isTool || opts.toolRow ? ' pack-tool' : '');
    slot.setAttribute('role', 'listitem');
    slot.setAttribute('aria-haspopup', 'dialog');
    slot.setAttribute('aria-expanded', packSelected === s.classTsid ? 'true' : 'false');
    slot.setAttribute(
      'aria-label',
      `${s.label} × ${s.count}${toolCondition?.tracked ? `, ${toolCondition.broken ? 'broken' : `${Math.round(toolCondition.percent * 100)} percent condition`}` : ''}`
    );
    if (toolCondition?.broken) slot.classList.add('is-broken');
    slot.title = s.isTool || opts.toolRow
      ? `${s.label} (tool)${toolCondition?.tracked ? ` · ${toolCondition.remaining}/${toolCondition.capacity} condition` : ''} · click for actions`
      : `${s.label} × ${s.count} · click for actions`;
    slot.dataset.tsid = s.classTsid;
    const canDragToVendor = !(s.isTool || opts.toolRow);
    slot.draggable = canDragToVendor;
    if (s.icon) {
      const img = document.createElement('img');
      const brokenToolIcons = {
        tinkertool: 'assets/sprites/icons/tinkertool_broken.png',
        hatchet: 'assets/sprites/icons/hatchet_broken.png',
        watering_can: 'assets/sprites/icons/watering_can_broken.png',
      };
      img.src = toolCondition?.broken && brokenToolIcons[s.classTsid]
        ? brokenToolIcons[s.classTsid]
        : s.icon;
      img.alt = s.label;
      img.loading = 'lazy';
      img.onerror = () => {
        img.replaceWith(document.createTextNode(s.label.slice(0, 2)));
      };
      slot.appendChild(img);
    } else {
      slot.textContent = s.label.slice(0, 2);
    }
    if (!(s.isTool || opts.toolRow) || s.count > 1) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = s.count;
      slot.appendChild(c);
    }
    if (toolCondition?.tracked) {
      const wear = document.createElement('span');
      wear.className = 'pack-slot-wear';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(toolCondition.percent * 100)}%`;
      wear.appendChild(fill);
      slot.appendChild(wear);
    }
    slot.addEventListener('click', (event) => {
      if (currentAction) cancelCurrentAction({ quiet: true });
      if (event.shiftKey && !(s.isTool || opts.toolRow) && getPackUseInfo(s.classTsid).usable) {
        closePackPopover();
        usePackItem(s.classTsid);
        return;
      }
      if (packSelected === s.classTsid && isPackPopoverOpen()) closePackPopover();
      else {
        if (packSelected !== s.classTsid) {
          packDropMode = false;
          packDropQty = 1;
        }
        renderPackPopover(s.classTsid, slot);
      }
    });
    if (canDragToVendor) {
      slot.addEventListener('dragstart', (event) => {
        if (!isVendorOpen()) {
          event.preventDefault();
          return;
        }
        closePackPopover();
        vendorDragTsid = s.classTsid;
        vendorSellReceipt = null;
        vendorTab = 'sell';
        vendorSelected = null;
        vendorQty = 1;
        document.querySelectorAll('.vendor-tab').forEach((tab) => {
          tab.classList.toggle('active', tab.dataset.tab === vendorTab);
        });
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('application/x-groddle-item', s.classTsid);
          event.dataTransfer.setData('text/plain', s.classTsid);
        }
        slot.classList.add('is-dragging');
        renderVendorList();
        document.getElementById('vendor-sell-drop')?.classList.add('is-dragover');
      });
      slot.addEventListener('dragend', () => {
        vendorDragTsid = null;
        slot.classList.remove('is-dragging');
        document.getElementById('vendor-sell-drop')?.classList.remove('is-dragover');
      });
    }
    box.appendChild(slot);
  }
  refreshPackPager(box);
}

function updateHud() {
  const spentRewardBuff = consumeRewardBuff(buffState, pc, Date.now());
  if (spentRewardBuff && state.started) {
    pushActivity(`${spentRewardBuff.def?.name || 'Reward buff'} boosted that reward and faded.`);
  }
  const holdProgressionAward = Boolean(phantomTarget?.state?.handoff);
  const levelUpdate = holdProgressionAward
    ? { leveledUp: false }
    : reconcilePlayerProgression(pc);
  if (levelUpdate.leveledUp && state.started) {
    const rewardText = levelUpdate.currants
      ? ` You also received ${levelUpdate.currants.toLocaleString()} currants.`
      : '';
    const activity = `Woo! You reached level ${levelUpdate.toLevel}. Energy and mood refilled.${rewardText}`;
    pushActivity(activity);
    enqueueAward({
      kind: 'level',
      title: `Level ${levelUpdate.toLevel}`,
      body: `Energy and mood completely refilled.${rewardText}`,
      subtitle: levelUpdate.levelsGained.length > 1
        ? `${levelUpdate.levelsGained.length} levels gained`
        : 'Onwards and upwards!',
    });
  }

  const streetEl = document.getElementById('street-name');
  if (streetEl && currentStreet) {
    const winterLabel = winterLocationLabel(currentStreet.tsid);
    const streetLabel = winterLabel?.street ||
      (currentStreet.tsid === AXIS_DENYDE_STREET_ID ? 'Axis Denyde' : currentStreet.label);
    const hubLabel = winterLabel?.hub ||
      (currentStreet.tsid === AXIS_DENYDE_STREET_ID
        ? 'Pollokoo'
        : currentStreet.hubName || 'Groddle Forest');
    streetEl.textContent = `${streetLabel} · ${hubLabel}`;
    streetEl.dataset.tsid = currentStreet.tsid;
  }
  updateDametimeChrome();

  // Quest log: active + completed from runner
  const qBox = document.getElementById('quest');
  if (qBox) {
    qBox.innerHTML = '';
    const log = listQuestLog(questState);
    const meta = document.getElementById('quest-meta');
    if (meta) {
      const n = Object.keys(getQuestCatalog()).length;
      meta.textContent = `${log.filter((r) => r.status === 'active').length} active · ${questState.completed.length} done · ${n} in catalog`;
    }
    if (!log.length) {
      const empty = document.createElement('div');
      empty.className = 'q-req';
      empty.textContent = 'No active quests. Catalog loaded from GSJS.';
      qBox.appendChild(empty);
    }
    for (const p of log.slice(0, 40)) {
      const card = document.createElement('div');
      card.className = 'q-card' + (p.completed ? ' done' : '');
      const title = document.createElement('div');
      title.className = 'q-title';
      title.textContent = p.def.title + (p.completed ? ' ✓' : '');
      card.appendChild(title);
      for (const r of p.requirements || []) {
        const row = document.createElement('div');
        row.className = 'q-req';
        row.textContent = `${r.desc}: ${r.current} / ${r.num}`;
        card.appendChild(row);
        const bar = document.createElement('div');
        bar.className = 'q-bar';
        const fill = document.createElement('i');
        fill.style.width = `${Math.min(100, (r.num ? (r.current / r.num) * 100 : 0))}%`;
        bar.appendChild(fill);
        card.appendChild(bar);
      }
      if (p.active && p.def.classTsid === PHANTOM_QUEST_ID) {
        const story = ensureGhostQuestState(questState, availableStreetTsids());
        const remaining = story.hauntStreets.filter((id) => !story.foundStreets.includes(id));
        const hint = document.createElement('div');
        hint.className = 'q-req';
        hint.textContent = story.finalReady
          ? 'The Phantom is ready to appear wherever you next notice it.'
          : `Cold spots: ${remaining
              .map((id) => STREET_INDEX.streets[id]?.label || id)
              .join(' · ')}`;
        card.appendChild(hint);
      }
      if (p.active && p.def.classTsid === HOG_HAUL_QUEST_ID && !hogHaulIsInstanced()) {
        const raceButton = document.createElement('button');
        raceButton.type = 'button';
        raceButton.className = 'content-action-btn';
        raceButton.textContent = 'Enter The Great Hog Haul';
        raceButton.addEventListener('click', () => startHogHaulRace());
        card.appendChild(raceButton);
      }
      if (p.active && p.def.classTsid === FOUR_LETTER_QUEST_ID && !fourLetterIsInstanced()) {
        const puzzleButton = document.createElement('button');
        puzzleButton.type = 'button';
        puzzleButton.className = 'content-action-btn';
        puzzleButton.textContent = "Enter Mr. Block's Playroom";
        puzzleButton.addEventListener('click', () => startFourLetterQuest());
        card.appendChild(puzzleButton);
      }
      if (p.active && p.def.classTsid === LEGALIZE_QUEST_ID && !legalizeIsInstanced()) {
        const legalizeButton = document.createElement('button');
        legalizeButton.type = 'button';
        legalizeButton.className = 'content-action-btn';
        legalizeButton.textContent = 'Enter the Back Alley';
        legalizeButton.addEventListener('click', () => startLegalizeIt());
        card.appendChild(legalizeButton);
      }
      if (
        p.active &&
        [DE_EMBIGGENIFY_QUEST_ID, DE_EMBIGGENIFY_PART2_QUEST_ID].includes(p.def.classTsid) &&
        !deEmbiggenifyIsInstanced()
      ) {
        const eestiButton = document.createElement('button');
        eestiButton.type = 'button';
        eestiButton.className = 'content-action-btn';
        eestiButton.textContent = 'Enter Eesti Life Catalogue Page 17';
        eestiButton.addEventListener('click', () => startDeEmbiggenify());
        card.appendChild(eestiButton);
      }
      if (
        p.active &&
        [WINTER_WALK_QUEST_ID, WINTER_WALK_REPEAT_QUEST_ID].includes(p.def.classTsid) &&
        !winterWalkIsInstanced()
      ) {
        const winterButton = document.createElement('button');
        winterButton.type = 'button';
        winterButton.className = 'content-action-btn';
        winterButton.textContent = 'Enter Winter Walk';
        winterButton.addEventListener('click', () =>
          startWinterWalk({ repeat: p.def.classTsid === WINTER_WALK_REPEAT_QUEST_ID })
        );
        card.appendChild(winterButton);
      }
      if (p.active && p.def.classTsid === ROOK_QUEST_ID && !rookWoodsIsInstanced()) {
        const tool = findWorkingRookTool(inv, toolState);
        const rookButton = document.createElement('button');
        rookButton.type = 'button';
        rookButton.className = 'content-action-btn';
        rookButton.textContent = tool.ok
          ? "Enter Rooks' Woods"
          : 'Working Pick, Fancy Pick, or Hatchet required';
        rookButton.disabled = !tool.ok;
        rookButton.addEventListener('click', () => startRookWoodsQuest());
        card.appendChild(rookButton);
      }
      if (
        p.active &&
        [ROOK_HALL_START_QUEST_ID, ROOK_HALL_QUEST_ID].includes(p.def.classTsid) &&
        !rookMuseumIsInstanced()
      ) {
        const museumButton = document.createElement('button');
        museumButton.type = 'button';
        museumButton.className = 'content-action-btn';
        museumButton.textContent = 'Enter the Museum of the Rook';
        museumButton.addEventListener('click', () => startRookMuseum());
        card.appendChild(museumButton);
      }
      if (p.active && p.def.classTsid === ILMENSKIE_QUEST_ID) {
        const rescue = ilmenskieStory();
        const hint = document.createElement('div');
        hint.className = 'q-req';
        hint.textContent = ilmenskieObjective(rescue, currentStreetTsid);
        card.appendChild(hint);
        if (!rescue.pickedUpJones && currentStreetTsid !== AXIS_DENYDE_STREET_ID) {
          const mapButton = document.createElement('button');
          mapButton.type = 'button';
          mapButton.className = 'content-action-btn';
          mapButton.textContent = 'Open Map to Axis Denyde';
          mapButton.addEventListener('click', () => openMap());
          card.appendChild(mapButton);
        } else if (rescue.pickedUpJones && currentStreetTsid === AXIS_DENYDE_STREET_ID) {
          const escapeButton = document.createElement('button');
          escapeButton.type = 'button';
          escapeButton.className = 'content-action-btn';
          escapeButton.textContent = 'Open Map to escape';
          escapeButton.addEventListener('click', () => openMap());
          card.appendChild(escapeButton);
        }
      }
      qBox.appendChild(card);
    }
    appendStoryQuestOffers(qBox);
  }
  renderQuestTracker();
  renderActivityHistory();

  // Achievements panel body
  const aBox = document.getElementById('achieve-body');
  if (aBox && !document.getElementById('achieve-panel')?.hidden) {
    renderAchievePanel();
  }
  if (!document.getElementById('feat-panel')?.hidden) renderFeatPanel();
  const sBox = document.getElementById('skills-body');
  if (sBox && !document.getElementById('skills-panel')?.hidden) {
    renderSkillsPanel();
  }
  const bBox = document.getElementById('buffs-body');
  if (bBox && !document.getElementById('buffs-panel')?.hidden) {
    renderBuffsPanel();
  }
  renderBuffStrip();
  updateSkillChrome();
  updateFeatChrome();

  document.getElementById('stat-img').textContent = pc.imagination;
  const levelInfo = levelUpdate.info || levelInfoForXp(pc.xp);
  const levelEl = document.getElementById('stat-level');
  const xpEl = document.getElementById('stat-xp');
  const levelBar = document.getElementById('bar-level');
  const levelMeter = document.getElementById('level-meter');
  if (levelEl) levelEl.textContent = String(levelInfo.level);
  if (xpEl) xpEl.textContent = formatLevelProgress(levelInfo);
  if (levelBar) levelBar.style.width = `${Math.round(levelInfo.progress * 100)}%`;
  if (levelMeter) {
    const label = `Level ${levelInfo.level}. ${formatLevelProgress(levelInfo)}`;
    levelMeter.setAttribute('aria-label', label);
    levelMeter.setAttribute('aria-valuenow', String(Math.round(levelInfo.progress * 100)));
    levelMeter.title = levelInfo.atCap
      ? label
      : `${label}. ${levelInfo.remaining.toLocaleString()} XP to level ${levelInfo.level + 1}.`;
  }
  const cur = String(pc.currants || 0);
  const curEl = document.getElementById('stat-currants');
  if (curEl) curEl.textContent = cur;
  const packCur = document.getElementById('pack-currants');
  if (packCur) packCur.textContent = cur;
  const vCur = document.getElementById('vendor-currants');
  if (vCur) vCur.textContent = cur;
  const quoinEl = document.getElementById('quoin-stat');
  if (quoinEl) {
    const multiplier = Number(quoinState.multiplier || 1);
    quoinEl.innerHTML = `<span aria-hidden="true">◉</span> <strong>${quoinState.collectedToday}/${quoinState.dailyLimit}</strong><small>×${multiplier.toFixed(multiplier % 1 ? 1 : 0)}</small>`;
    quoinEl.setAttribute(
      'aria-label',
      `${quoinState.collectedToday} of ${quoinState.dailyLimit} quoins collected today. Multiplier ${multiplier}.`
    );
    quoinEl.title = `${quoinState.totalCollected} quoins collected total`;
    quoinEl.classList.toggle('at-limit', quoinState.collectedToday >= quoinState.dailyLimit);
  }
  setBar('bar-energy', pc.energy);
  setBar('bar-mood', pc.mood);

  // Dual-row pack: items (top) + tools (bottom), currants already set above
  syncEmotionalBearCatalog();
  const rows = listPackRows(inv);
  const itemsBox = document.getElementById('pack-items');
  const toolsBox = document.getElementById('pack-tools');
  if (itemsBox || toolsBox) {
    renderPackRow(itemsBox, rows.items, { emptyCount: 6 });
    renderPackRow(toolsBox, rows.tools, { emptyCount: 4, toolRow: true });
  } else {
    // Fallback single strip if dual-row markup missing
    const box = document.getElementById('inventory');
    renderPackRow(box, listPackSlots(inv), { emptyCount: 4 });
  }
  if (packSelected) renderPackPopover(packSelected);
  updateLocalChatDockPosition();
  updateHomeChrome();
  if (state.started) savePlayerState();
}

function usePackItem(classTsid) {
  if (!state.started) return;
  if (cubimalPackageInfo(classTsid)) {
    openPackedCubimalBox(classTsid);
    return;
  }
  if (cubimalInfo(classTsid)) {
    setPackedCubimalFree(classTsid);
    return;
  }
  const paradiseCourse = paradiseCourseForTicket(classTsid);
  if (paradiseCourse) {
    confirmParadiseTicketActivation(paradiseCourse.id);
    return;
  }
  if (classTsid === HOGTIED_JONES_ID) {
    releasePackedIlmenskieJones();
    return;
  }
  if (classTsid === FADED_HEART_ID) {
    rememberFadedHeartInWorld();
    return;
  }
  if (classTsid === STOOT_DOLL_ID) {
    pullPackedStootDoll();
    return;
  }
  if (classTsid === GAMESHOW_TICKET_ID) {
    useGameshowTicket();
    return;
  }
  if (classTsid === LEGALIZE_CARD_ID) {
    activateLegalizeCard();
    return;
  }
  const buffInfo = getBuffItemInfo(classTsid);
  const ordinaryInfo = buffInfo?.def ? null : getItemUseInfo(classTsid);
  // Drinks never count toward fullness or food history in the source.
  const isFood = Boolean(
    ordinaryInfo?.usable && ordinaryInfo.effects?.energy && ordinaryInfo.kind !== 'drink'
  );
  if (isFood) {
    const deadGate = features.metabolicGate('energy', 'gain', engine);
    if (!deadGate.ok) {
      toast(deadGate.msg);
      return;
    }
    const gate = canEatFood(foodState, pc, 100);
    if (!gate.ok) {
      toast(gate.reason);
      renderPackPopover(classTsid);
      return;
    }
  }
  const r = buffInfo?.def
    ? activateBuffItem(buffState, inv, pc, classTsid, Date.now())
    : useItem(inv, pc, classTsid);
  if (!r.ok) {
    toast(r.msgs[0] || 'Cannot use that.');
    return;
  }
  emitGameEvent(`${classTsid}:${String(ordinaryInfo?.verb || 'use').toLowerCase()}`);
  let foodResult = null;
  if (isFood && r.effects?.energy > 0) {
    foodResult = recordFoodEat(foodState, classTsid, {
      baseEnergy: ordinaryInfo.effects.energy,
      appliedEnergy: r.effects.energy,
      energyMax: 100,
      upgrades: pc.imaginationUpgrades || [],
      now: Date.now(),
    });
    if (foodResult.bonus > 0) {
      pc.imagination = (pc.imagination || 0) + foodResult.bonus;
      pc.xp = (pc.xp || 0) + foodResult.bonus;
      r.effects.xp = (r.effects.xp || 0) + foodResult.bonus;
      r.msgs[0] += ` Eating a variety of foods helps you think! +${foodResult.bonus} iMG.`;
    }
  }
  playSfx('eat', { volume: 0.3, rate: 1.2 });
  const buffSuffix = r.effectLabel
    ? r.pending
      ? ` ${r.effectLabel} will begin in ${r.info.delaySeconds}s.`
      : ` ${r.effectLabel} is active.`
    : '';
  const fullnessSuffix = foodResult?.fullness?.stuffed
    ? " You're stuffed until the next day."
    : foodResult?.fullness?.percent >= 75
      ? " You're getting quite full."
      : foodResult?.fullness?.percent >= 50
        ? ' You are starting to feel kinda full.'
        : '';
  toast(`${r.msgs[0]}${buffSuffix}${fullnessSuffix}`, r.pending || foodResult?.bonus ? 4400 : 3200);
  if (r.effects) {
    pushActivity({ base: r.msgs[0] || 'You used an item', effects: r.effects });
  } else {
    pushActivity(r.msgs[0]);
  }
  if (player) {
    floatText(
      player.x,
      player.y - 70,
      r.effectLabel ? (r.pending ? `${r.effectLabel} soon…` : r.effectLabel) : '✓',
      r.pending ? 0xc98cff : 0x7dcea0
    );
    if (r.effectLabel) burst(player.x, player.y - 40, r.pending ? 0xa020f0 : 0x8fe3b0, 12);
    if (foodResult?.bonus) {
      floatText(player.x + 18, player.y - 95, `+${foodResult.bonus} variety iMG`, 0xf0c85a);
      burst(player.x, player.y - 45, 0xf0c85a, 12);
    }
  }
  updateHud();
  if (isVendorOpen()) renderVendorList();
}

/** Open one source-weighted Cubimal box and celebrate the clean recovered figure. */
function openPackedCubimalBox(classTsid) {
  const params = new URLSearchParams(location.search);
  const requestedRoll = Number(params.get('cubimalroll'));
  const roll = params.has('cubimalroll') && Number.isFinite(requestedRoll)
    ? requestedRoll
    : Math.random();
  const result = openCubimalPackage(inv, classTsid, roll);
  if (!result.ok) {
    toast(result.message || 'That Cubimal box will not open.');
    return null;
  }
  closePackPopover();
  playSfx('pickup', { volume: 0.62, rate: 1.3 });
  pushActivity(result.message);
  if (player) {
    floatText(player.x, player.y - 88, result.prize.label, 0xf0c85a);
    burst(player.x, player.y - 46, 0xffd76b, 22);
  }
  const achievementUpdates = applyAchievementProgress(
    achieveState,
    `in_inventory:${result.prize.classTsid}`,
    1,
    pc
  );
  announceAchievementUpdates(achievementUpdates);
  if (app?.view) {
    app.view.dataset.cubimalPackage = classTsid;
    app.view.dataset.cubimalSeries = String(result.package.series);
    app.view.dataset.cubimalPrize = result.prize.classTsid;
    app.view.dataset.cubimalCollection = `${result.collection.owned}/${result.collection.total}`;
    app.view.dataset.cubimalRoll = String(roll);
  }
  enqueueAward({
    kind: 'generic',
    title: result.prize.label,
    body: `Series ${result.package.series} collection: ${result.collection.owned}/${result.collection.total}`,
    subtitle: 'You opened the box!',
    iconUrl: `assets/sprites/icons/${result.prize.classTsid}.png`,
    holdMs: 1_800,
  });
  updateHud();
  return result;
}

/** Confirm and perform the source "set free, with love" pack action. */
function setPackedCubimalFree(classTsid, opts = {}) {
  const info = cubimalInfo(classTsid);
  if (!info?.setFreeImg) {
    toast(info ? 'This rare Cubimal cannot be set free for Imagination.' : 'That is not a Cubimal.');
    return false;
  }
  if (
    opts.confirm !== false &&
    !window.confirm(`Really, you want to set ${info.label} free? It will give you ${info.setFreeImg.toLocaleString()} Imagination.`)
  ) {
    return false;
  }
  const params = new URLSearchParams(location.search);
  const requestedRoll = Number(params.get('cubimalfreeroll'));
  const responseRoll = params.has('cubimalfreeroll') && Number.isFinite(requestedRoll)
    ? requestedRoll
    : Math.random();
  const result = setCubimalFree(inv, pc, classTsid, responseRoll);
  if (!result.ok) {
    toast(result.message || 'That Cubimal cannot be set free.');
    return false;
  }
  closePackPopover();
  playSfx('pickup', { volume: 0.55, rate: 1.55 });
  pushActivity({
    base: `${result.message} "${result.response}"`,
    effects: result.effects,
  });
  if (player) {
    floatText(player.x, player.y - 92, `+${result.reward} iMG`, 0xf0c85a);
    burst(player.x, player.y - 44, 0xffd76b, 24);
  }
  const achievementUpdates = applyAchievementProgress(
    achieveState,
    `cubimals_freed:${classTsid}`,
    1,
    pc
  );
  announceAchievementUpdates(achievementUpdates);
  if (app?.view) {
    app.view.dataset.cubimalFreed = classTsid;
    app.view.dataset.cubimalFreeReward = String(result.reward);
    app.view.dataset.cubimalFreeResponse = result.response;
  }
  enqueueAward({
    kind: 'generic',
    title: 'Cubimal set free',
    body: result.response,
    subtitle: `+${result.reward.toLocaleString()} Imagination`,
    iconUrl: `assets/sprites/icons/${classTsid}.png`,
    holdMs: 1_800,
  });
  updateHud();
  return true;
}

function playPackMusicblock(classTsid) {
  if (!state.started) return;
  const result = playMusicblock(musicblockState, pc, classTsid, Date.now());
  if (!result.ok) {
    toast(result.msg || 'That musicblock will not play.');
    return;
  }
  playMusicblockAudio(result.def);
  showMusicblockFx(result.def);
  toast(`${result.def.label}: ${result.msg}`, Math.max(3200, result.def.durationMs));
  pushActivity({
    base: `You played ${result.def.label}. ${result.msg.replace(/[.!?]+$/, '')}`,
    effects: result.effects,
  });
  if (player) {
    floatText(player.x, player.y - 86, `♪ ${result.def.label}`, 0xd6a6ff);
    burst(player.x, player.y - 46, 0xb783e6, 14);
  }
  const achievementUpdates = applyAchievementProgress(
    achieveState,
    `musicblocks_played:${classTsid}`,
    1,
    pc
  );
  announceAchievementUpdates(achievementUpdates);
  updateHud();
  if (isVendorOpen()) renderVendorList();
}

function checkQuest() {
  // Quest completion handled by applyQuestProgress; full-screen award when starters done
  if (state.questDone) return;
  const main = ['animalkinship_pet_piggies', 'animalkinship_milk_butterflies'];
  if (main.every((id) => questState.completed.includes(id))) {
    state.questDone = true;
    floatText(player.x, player.y - 90, 'QUESTS ✓', 0xffe066);
    burst(player.x, player.y - 50, 0xffe066, 22);
    updateHud();
    enqueueAward({
      kind: 'quest',
      title: 'Starter quests complete',
      body: 'Browse Badges, Skills, and Buffs — or open the Map to explore Ur.',
    });
  }
}

// —— Audio ——
/** Current ambient theme id (hub-tuned). */
let ambientThemeId = 'default';
/** URL of currently playing music buffer. */
let ambientTrackUrl = null;

async function loadAudio() {
  await loadAmbientMusicConfig('assets/content/ambient-music.json?v=eesti-1');
  const files = {
    music: 'assets/audio/groddle.mp3', // legacy default / fallback
    pet: 'assets/audio/piggy_plop.mp3',
    pickup: 'assets/audio/discover_new_item.mp3',
    quest: 'assets/audio/quest_complete.mp3',
    start: 'assets/audio/game_loaded.mp3',
    quoin: 'assets/audio/qurazy_quoin.mp3',
    jump: 'assets/audio/triple_jump.mp3',
    alert: 'assets/audio/new_quest_alert.mp3',
    eat: 'assets/audio/level_up_kazoo.mp3',
    spinningWheel: 'assets/audio/ambient/Spinning-Wheel_1292034939.mp3',
    // Original client sound key NEWDAY / "NEW_DAY" — fanfare until rooster MP3 recovered
    newDay: 'assets/audio/new_day_fanfare.mp3',
  };
  // Preload hub ambient tracks (GSJS ambient_library stand-ins)
  for (const url of allAmbientTrackUrls()) {
    files[`amb:${url}`] = url;
  }
  for (const def of Object.values(MUSICBLOCK_CATALOG)) {
    files[`musicblock:${def.classTsid}`] = def.audio;
  }
  audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.musicGain = audio.ctx.createGain();
  audio.sfxGain = audio.ctx.createGain();
  audio.musicGain.gain.value = 0.26;
  audio.sfxGain.gain.value = 1;
  audio.musicGain.connect(audio.ctx.destination);
  audio.sfxGain.connect(audio.ctx.destination);
  await Promise.all(
    Object.entries(files).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        audio.buffers[key] = await audio.ctx.decodeAudioData((await res.arrayBuffer()).slice(0));
      } catch (e) {
        console.warn('audio', key, e);
      }
    })
  );
}

function playSfx(name, { volume = 0.7, rate = 1 } = {}) {
  if (state.muted || !audio.ctx || !audio.buffers[name]) return;
  const src = audio.ctx.createBufferSource();
  const g = audio.ctx.createGain();
  src.buffer = audio.buffers[name];
  src.playbackRate.value = rate;
  g.gain.value = volume;
  src.connect(g);
  g.connect(audio.sfxGain);
  src.start(0);
}

/**
 * Procedural sound effects for client sound keys with no recovered file
 * (CROAK, SQUISH_GRAPES have no entry in the archived sound map).
 * @param {'croak'|'squish'} name
 */
function playSynthSfx(name) {
  if (state.muted || !audio.ctx) return;
  const ctx = audio.ctx;
  const t0 = ctx.currentTime;
  const out = ctx.createGain();
  out.connect(audio.sfxGain);
  if (name === 'croak') {
    // A comic descending "bwoooomp" with a soft low thud underneath.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, t0);
    osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.9);
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(90, t0 + 0.75);
    thud.frequency.exponentialRampToValueAtTime(40, t0 + 1.15);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.5, t0 + 0.04);
    out.gain.exponentialRampToValueAtTime(0.2, t0 + 0.8);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);
    osc.connect(out);
    thud.connect(out);
    osc.start(t0);
    thud.start(t0 + 0.75);
    osc.stop(t0 + 1.3);
    thud.stop(t0 + 1.3);
    return;
  }
  // Squish: a wet, low-passed noise burst with a quick downward blip.
  const length = Math.floor(ctx.sampleRate * 0.28);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, t0);
  filter.frequency.exponentialRampToValueAtTime(260, t0 + 0.25);
  const blip = ctx.createOscillator();
  blip.type = 'sine';
  blip.frequency.setValueAtTime(260, t0);
  blip.frequency.exponentialRampToValueAtTime(90, t0 + 0.18);
  const blipGain = ctx.createGain();
  blipGain.gain.setValueAtTime(0.35, t0);
  blipGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  out.gain.setValueAtTime(0.6, t0);
  noise.connect(filter);
  filter.connect(out);
  blip.connect(blipGain);
  blipGain.connect(out);
  noise.start(t0);
  blip.start(t0);
  blip.stop(t0 + 0.22);
}

function playMusicblockAudio(def) {
  if (!audio.ctx || !def || !audio.buffers[`musicblock:${def.classTsid}`]) return;
  if (audio.musicblock) {
    const previous = audio.musicblock;
    audio.musicblock = null;
    try { previous.stop(); } catch { /* already ended */ }
  }
  const src = audio.ctx.createBufferSource();
  const gain = audio.ctx.createGain();
  src.buffer = audio.buffers[`musicblock:${def.classTsid}`];
  gain.gain.value = 0.72;
  src.connect(gain);
  gain.connect(audio.sfxGain);
  audio.musicblock = src;
  src.onended = () => {
    if (audio.musicblock !== src) return;
    audio.musicblock = null;
    applyMute();
  };
  const durationSec = Math.min(src.buffer.duration, Math.max(0.5, def.durationMs / 1000));
  src.start(0);
  src.stop(audio.ctx.currentTime + durationSec);
  applyMute();
}

/**
 * Start (or keep) ambient music for the current street/hub.
 * Mirrors GSJS: hub → ambient_hub_map → ambient_library track set.
 */
function startMusic() {
  setAmbientForStreet(currentStreet || { hubId: '56', hubName: 'Groddle Forest' });
}

/**
 * Crossfade / switch ambient BGM for a street (hub-based).
 * @param {{ hubId?: string|number, hubName?: string, musicFile?: string }} street
 * @param {{ force?: boolean }} [opts]
 */
function setAmbientForStreet(street, opts = {}) {
  if (!audio.ctx) return;
  const theme = resolveAmbientTheme(street || {});
  const url =
    pickAmbientTrack(theme, { hubId: street?.hubId, random: false }) ||
    'assets/audio/groddle.mp3';
  const bufKey = audio.buffers[`amb:${url}`] ? `amb:${url}` : audio.buffers.music ? 'music' : null;
  if (!bufKey) return;

  // Same theme+track already playing — leave it
  if (!opts.force && ambientThemeId === theme && ambientTrackUrl === url && audio.music) {
    applyMute();
    return;
  }

  const prev = audio.music;
  const prevGain = audio.musicGain;
  const now = audio.ctx.currentTime;
  const fade = 0.85;

  // Fade out previous
  if (prev && prevGain) {
    try {
      prevGain.gain.cancelScheduledValues(now);
      prevGain.gain.setValueAtTime(prevGain.gain.value, now);
      prevGain.gain.linearRampToValueAtTime(0.001, now + fade);
      prev.stop(now + fade + 0.05);
    } catch {
      try {
        prev.stop();
      } catch {
        /* */
      }
    }
  }

  // Fresh gain node for new track (so we can crossfade cleanly next time)
  const g = audio.ctx.createGain();
  g.gain.value = 0.001;
  g.connect(audio.ctx.destination);
  audio.musicGain = g;

  const src = audio.ctx.createBufferSource();
  src.buffer = audio.buffers[bufKey];
  src.loop = true;
  src.connect(g);
  src.start(0);
  const targetVol = state.muted ? 0 : 0.26;
  g.gain.linearRampToValueAtTime(Math.max(0.001, targetVol), now + fade);

  audio.music = src;
  ambientThemeId = theme;
  ambientTrackUrl = url;
  applyMute();
}

function applyMute() {
  if (!audio.musicGain) return;
  const vol = state.muted ? 0 : audio.musicblock ? 0.055 : 0.26;
  try {
    audio.musicGain.gain.setTargetAtTime(vol, audio.ctx.currentTime, 0.05);
  } catch {
    audio.musicGain.gain.value = vol;
  }
  audio.sfxGain.gain.value = state.muted ? 0 : 1;
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = state.muted ? 'Unmute' : 'Mute';
}

// —— Textures ——
function sliceSheet(baseTexture, { fw, fh, cols, rows }, frameCount = null) {
  const frames = [];
  const total = frameCount ?? cols * rows;
  let n = 0;
  for (let r = 0; r < rows && n < total; r++) {
    for (let c = 0; c < cols && n < total; c++) {
      frames.push(new PIXI.Texture(baseTexture, new PIXI.Rectangle(c * fw, r * fh, fw, fh)));
      n++;
    }
  }
  return frames;
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const tex = PIXI.Texture.from(url);
    // Linear filter softens the x1 animal sheets when scaled; nearest looks blocky.
    if (tex.baseTexture) tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    if (tex.baseTexture.valid) return resolve(tex);
    tex.baseTexture.on('loaded', () => {
      tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      resolve(tex);
    });
    tex.baseTexture.on('error', reject);
  });
}

/** Maturity art stages we ship (nearest-stage lookup). */
const TRANT_MAT_STAGES = [1, 3, 5, 7, 10];
const TRANT_FRAME_VERSION = 'all-species-cell-2';

/** Nearest shipped maturity stage art for a 0–10 maturity value. */
function nearestTrantMatStage(maturity) {
  const m = Math.max(0, Math.min(10, Math.floor(maturity ?? 7)));
  if (m <= 0) return 1;
  let best = TRANT_MAT_STAGES[0];
  let bestDist = Math.abs(m - best);
  for (const s of TRANT_MAT_STAGES) {
    const d = Math.abs(m - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

function trantTextureKey(classTsid, maturity) {
  return `${classTsid}_m${nearestTrantMatStage(maturity)}`;
}

async function loadSheets() {
  for (const [key, def] of Object.entries(SHEETS)) {
    const tex = await loadTexture(def.url);
    if (def.whole || !def.fw) {
      textures[key] = { def, frames: [tex] };
    } else {
      textures[key] = {
        def,
        frames: sliceSheet(tex.baseTexture, def, def.frameCount ?? null),
      };
    }
  }
  // Living trant maturity frames (one complete plant cell from each OGA sheet)
  for (const classTsid of Object.keys(TRANT_META)) {
    for (const m of TRANT_MAT_STAGES) {
      const key = `${classTsid}_m${m}`;
      const url = `assets/sprites/trants/frames/${key}.png?v=${TRANT_FRAME_VERSION}`;
      try {
        const tex = await loadTexture(url);
        textures[key] = { def: { url, whole: true }, frames: [tex] };
      } catch {
        // Optional: fall back to raw sheet or treeFruit later at spawn
      }
    }
  }
}

async function loadTrantTables() {
  const res = await fetch('assets/content/trants.json');
  if (!res.ok) throw new Error(`trants.json load failed: ${res.status}`);
  setTrantTables(await res.json());
}

/** Texture for a trant at maturity, with fallbacks. */
function textureForTrant(classTsid, maturity) {
  const m0 = maturity ?? 7;
  // Every shipped stage is now one verified source cell, so show the nearest
  // actual maturity first instead of masking broken mid-stage atlases with m10.
  const order = [nearestTrantMatStage(m0), 10, 7, 5, 3, 1];
  const seen = new Set();
  for (const m of order) {
    if (seen.has(m)) continue;
    seen.add(m);
    const tex = textures[`${classTsid}_m${m}`]?.frames?.[0];
    if (!tex) continue;
    // Reject leftover multi-plant sheets (very wide or sparse tall grids)
    if (tex.width > tex.height * 2.2) continue;
    if (tex.height < 60) continue;
    return tex;
  }
  if (textures.treeFruit?.frames?.[0]) return textures.treeFruit.frames[0];
  return null;
}

/** Six official Wood Tree maturity frames, from stump to mighty trunk. */
function textureForWoodTree(maturity) {
  const frames = textures.treeWoodGrowth?.frames || [];
  const index = clamp(Math.floor(Number(maturity) || 1), 1, 6) - 1;
  return frames[index] || textures.treeWood?.frames?.[0] || textures.treeFruit?.frames?.[0] || null;
}

/**
 * Display scale for trant art: downscale large sheets, never upscale past 1.0
 * (upscaling OGA x1 rasters is what made trees look soft/blurry).
 * @param {PIXI.Texture} tex
 * @param {{ targetH?: number, maxScale?: number }} [opts]
 */
function trantDisplayScale(tex, opts = {}) {
  const targetH = opts.targetH ?? 210;
  const maxScale = opts.maxScale ?? 1;
  const baseH = Math.max(1, tex?.height || targetH);
  return Math.min(maxScale, targetH / baseH);
}

// —— Hover / pick targeting (crowded entities) ——
/** @type {any|null} */
let hoverTarget = null;

function clearSignpostBoardHover() {
  if (!hoveredSignBoard) return;
  setSignpostHover(hoveredSignBoard.view, false);
  hoveredSignBoard = null;
  if (app?.view) {
    app.view.style.cursor = '';
    app.view.dataset.signpostHoverLabel = '';
  }
}

function setSignpostBoardHover(hit) {
  if (
    hoveredSignBoard?.view === hit?.view &&
    hoveredSignBoard?.index === hit?.index
  ) return;
  clearSignpostBoardHover();
  if (!hit) return;
  hoveredSignBoard = hit;
  setSignpostHover(hit.view, true, hit.index);
  if (app?.view) {
    app.view.style.cursor = 'pointer';
    app.view.dataset.signpostHoverLabel =
      hit.connection?.label || hit.connection?.tsid || '';
  }
}

/** Axis-aligned hit box in world space (anchor-aware). */
function spriteWorldHitBox(spr, pad = 6) {
  if (!spr) return null;
  // Garden plot / mine rock cells use world coords + explicit hit size (Containers often report 0×0)
  const w = Math.abs(
    spr._worldHitW || spr._gardenHitW || spr._mineHitW || spr._rookHitW || spr.width || 0
  );
  const h = Math.abs(
    spr._worldHitH || spr._gardenHitH || spr._mineHitH || spr._rookHitH || spr.height || 0
  );
  if (w < 2 || h < 2) return null;
  // Default anchor 0.5,1 for world entities; fall back to actual anchor
  const ax = spr.anchor?.x ?? 0.5;
  const ay = spr.anchor?.y ?? 1;
  const left = spr.x - w * ax - pad;
  const top = spr.y - h * ay - pad;
  return { left, top, right: left + w + pad * 2, bottom: top + h + pad * 2, w, h };
}

function pointInHitBox(box, x, y) {
  return box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** Prefer pointer-under sprite; among overlaps pick smallest area (most specific). */
function pickInteractableAt(worldX, worldY) {
  /** @type {{ t: any, area: number }[]} */
  const hits = [];
  for (const t of interactables) {
    if (!t.sprite || t.sprite.destroyed) continue;
    const box = spriteWorldHitBox(t.sprite, t.airborne ? 14 : 8);
    if (pointInHitBox(box, worldX, worldY)) {
      // Prefer garden_plot over whole bed / other large targets
      const area =
        (box.w * box.h) * (t.classId === 'garden_plot' ? 0.15 : 1);
      hits.push({ t, area });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.area - b.area);
  return hits[0].t;
}

/**
 * Soft silhouette rim (Flash GlowFilter-style).
 * Sibling BEHIND the source on entityLayer — never a child of the sprite
 * (Pixi draws children above the sprite texture → solid fill bug).
 * No BlurFilter: blur render-targets clip tall/wide art (egg plants, trees).
 * @param {PIXI.Sprite|PIXI.AnimatedSprite} source
 * @param {{ color?: number, thickness?: number }} [opts]
 */
function createSpriteOutline(source, opts = {}) {
  // Soft cool rim like original selection glow
  const color = opts.color ?? 0xa8e8ff;
  const thickness = Math.max(1, opts.thickness ?? 2);
  const outline = new PIXI.Container();
  outline.eventMode = 'none';
  outline.name = 'hover-outline';

  /** @type {PIXI.Sprite[]} */
  const copies = [];
  // 8-neighbor ring only (1–2px) — enough for a rim, not a filled slab
  const ring = [];
  for (let dy = -thickness; dy <= thickness; dy++) {
    for (let dx = -thickness; dx <= thickness; dx++) {
      if (dx === 0 && dy === 0) continue;
      const d2 = dx * dx + dy * dy;
      // keep only outer ring so stacked copies don't form a solid body
      if (d2 < thickness * thickness - 0.01) continue;
      if (d2 > (thickness + 0.6) * (thickness + 0.6)) continue;
      ring.push([dx, dy]);
    }
  }
  // Always include cardinals/diagonals at exact thickness
  if (!ring.length) {
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      ring.push([dx * thickness, dy * thickness]);
    }
  }

  for (const [dx, dy] of ring) {
    const s = new PIXI.Sprite(source.texture);
    if (source.anchor) s.anchor.copyFrom(source.anchor);
    s.position.set(dx, dy);
    s.alpha = 0.7;
    s.eventMode = 'none';
    copies.push(s);
    outline.addChild(s);
  }

  // Solid rim color from alpha (preserves silhouette; main sprite paints over center)
  const ColorMatrixFilter = PIXI.ColorMatrixFilter;
  if (ColorMatrixFilter) {
    const cr = ((color >> 16) & 255) / 255;
    const cg = ((color >> 8) & 255) / 255;
    const cb = (color & 255) / 255;
    const cm = new ColorMatrixFilter();
    cm.matrix = [
      0, 0, 0, 0, cr,
      0, 0, 0, 0, cg,
      0, 0, 0, 0, cb,
      0, 0, 0, 0.75, 0,
    ];
    // Padding so filter RT doesn't clip wide trant arms
    cm.padding = 12;
    outline.filters = [cm];
  } else {
    for (const s of copies) {
      s.tint = color;
      s.alpha = 0.45;
    }
  }

  outline._outlineCopies = copies;
  outline._outlineSource = source;
  outline.syncOutlineTexture = () => {
    const src = outline._outlineSource;
    if (!src || src.destroyed) {
      outline.visible = false;
      return;
    }
    const tex = src.texture;
    for (const s of outline._outlineCopies || []) {
      if (!s.destroyed && s.texture !== tex) s.texture = tex;
    }
    outline.position.set(src.x, src.y);
    outline.scale.copyFrom(src.scale);
    outline.rotation = src.rotation || 0;
    if (src.pivot) outline.pivot.copyFrom(src.pivot);
    // Always strictly behind the source
    outline.zIndex = (Number(src.zIndex) || 0) - 1;
    outline.alpha = src.alpha ?? 1;
    outline.visible = !!src.visible && src.worldAlpha > 0.01;
  };
  outline.syncOutlineTexture();
  return outline;
}

function clearHoverGlow() {
  if (!hoverTarget) return;
  const t = hoverTarget;
  if (t._hoverGlow) {
    try {
      if (t._hoverGlow.parent) t._hoverGlow.parent.removeChild(t._hoverGlow);
      t._hoverGlow.destroy({ children: true });
    } catch {
      /* already removed */
    }
  }
  t._hoverGlow = null;
  if (t.sprite && !t.sprite.destroyed) {
    t.sprite.tint = 0xffffff;
    if (t._hoverBaseY != null) t.sprite.y = t._hoverBaseY;
  }
  hoverTarget = null;
}

/**
 * Soft cyan silhouette rim behind the sprite (original Glitch selection look).
 * @param {any|null} target
 */
function setHoverTarget(target) {
  if (hoverTarget === target) return;
  clearHoverGlow();
  if (!target?.sprite || target.sprite.destroyed || !entityLayer) return;
  hoverTarget = target;
  const spr = target.sprite;
  target._hoverBaseY = spr.y;

  const outline = createSpriteOutline(spr, { color: 0xa8e4ff, thickness: 2 });
  // Insert just below the sprite in the child list, then rely on zIndex sort
  if (spr.parent === entityLayer) {
    const idx = entityLayer.getChildIndex(spr);
    entityLayer.addChildAt(outline, Math.max(0, idx));
  } else {
    entityLayer.addChild(outline);
  }
  outline.syncOutlineTexture();
  // Force draw order: outline under sprite
  entityLayer.sortableChildren = true;
  if (typeof entityLayer.sortChildren === 'function') entityLayer.sortChildren();
  target._hoverGlow = outline;
}

function wireInteractableSprite(target) {
  const spr = target.sprite;
  if (!spr || spr.destroyed) return;
  // Cursor + hover glow via Pixi; actual click handled on the canvas so we can
  // do bounds-based "smallest hit" among overlaps (sprite events alone can't).
  spr.eventMode = 'static';
  spr.cursor = 'pointer';
  spr.on('pointerover', () => {
    if (!state.started || menuTarget || isScreenFxBlocking()) return;
    setHoverTarget(target);
  });
  spr.on('pointerout', () => {
    if (hoverTarget === target) clearHoverGlow();
  });
}

// —— FX ——
function removeSpeechBubble(bubble) {
  if (!bubble) return;
  speechBubbles = speechBubbles.filter((entry) => entry !== bubble);
  if (bubble.parent) bubble.parent.removeChild(bubble);
  if (!bubble.destroyed) bubble.destroy({ children: true });
}

function clearSpeechBubbles() {
  for (const bubble of [...speechBubbles]) removeSpeechBubble(bubble);
  speechBubbles = [];
}

function positionSpeechBubble(bubble) {
  const meta = bubble?._speechFx;
  const spr = meta?.target?.sprite;
  if (!meta || !spr || spr.destroyed) return false;
  const cameraX = Number.isFinite(camTarget) ? camTarget : 0;
  const cameraY = Number.isFinite(camY) ? camY : 0;
  const spriteHeight = clamp(Math.abs(spr.height || 60), 36, 170);
  bubble.x = clampWorldOverlayX(spr.x, meta.width, 12);
  bubble.y = clamp(
    spr.y - spriteHeight - 12,
    cameraY + meta.height + 24,
    cameraY + LOCATION_VIEW_H - 18
  );
  if (app?.view) {
    app.view.dataset.speechTarget = `${Math.round(spr.x)},${Math.round(spr.y)}`;
    app.view.dataset.speechBubble = `${Math.round(bubble.x)},${Math.round(bubble.y)}`;
    app.view.dataset.speechScreen = `${Math.round(bubble.x - cameraX)},${Math.round(bubble.y - cameraY)}`;
    app.view.dataset.speechSafeRight = horizontalLocationViewWidth().toFixed(2);
    app.view.dataset.speechWidth = Number(meta.width).toFixed(2);
  }
  return true;
}

function showSpeechBubble(target, speech) {
  if (!target?.sprite || target.sprite.destroyed || !fxLayer || !speech) return null;
  const text = String(speech.text || '').trim();
  if (!text) return null;
  for (const bubble of [...speechBubbles]) {
    if (bubble._speechFx?.target === target) removeSpeechBubble(bubble);
  }

  const body = new PIXI.Text(text, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 15,
    fill: 0x453b34,
    lineHeight: 19,
    wordWrap: true,
    wordWrapWidth: 246,
  });
  const speaker = new PIXI.Text(String(speech.speaker || target.label || ''), {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 12,
    fill: 0x7f6c55,
    fontWeight: '700',
    letterSpacing: 0.4,
  });
  const width = clamp(Math.max(body.width, speaker.width) + 24, 156, 280);
  const height = Math.ceil(12 + speaker.height + 4 + body.height + 12);
  const bg = new PIXI.Graphics();
  bg.lineStyle(2, 0x594c40, 0.34);
  bg.beginFill(0xfffdf5, 0.97);
  bg.drawRoundedRect(0, 0, width, height, 12);
  bg.endFill();
  bg.lineStyle(1, 0x594c40, 0.28);
  bg.beginFill(0xfffdf5, 0.97);
  bg.drawPolygon([width / 2 - 9, height - 1, width / 2, height + 11, width / 2 + 9, height - 1]);
  bg.endFill();
  speaker.x = 12;
  speaker.y = 10;
  body.x = 12;
  body.y = 10 + speaker.height + 4;

  const bubble = new PIXI.Container();
  bubble.addChild(bg, speaker, body);
  bubble.pivot.set(width / 2, height + 11);
  bubble.alpha = 0;
  bubble.zIndex = 99999;
  bubble.eventMode = 'none';
  bubble._speechFx = {
    target,
    width,
    height,
    life: 0,
    max: Math.max(210, Number(speech.durationMs || 5000) / (1000 / 60)),
  };
  speechBubbles.push(bubble);
  fxLayer.addChild(bubble);
  positionSpeechBubble(bubble);
  if (app?.view) {
    app.view.dataset.speechSpeaker = String(speech.speaker || target.label || '');
    app.view.dataset.lastSpeech = text;
    app.view.dataset.speechBubbles = String(speechBubbles.length);
  }
  return bubble;
}

function updateSpeechBubbles(dt) {
  for (const bubble of [...speechBubbles]) {
    const meta = bubble._speechFx;
    if (!meta || !positionSpeechBubble(bubble)) {
      removeSpeechBubble(bubble);
      continue;
    }
    meta.life += dt;
    const fadeIn = clamp(meta.life / 8, 0, 1);
    const fadeOut = clamp((meta.max - meta.life) / 24, 0, 1);
    bubble.alpha = Math.min(fadeIn, fadeOut);
    if (meta.life >= meta.max) removeSpeechBubble(bubble);
  }
  if (app?.view) app.view.dataset.speechBubbles = String(speechBubbles.length);
}

function floatText(x, y, text, color = 0xfff4d6) {
  const t = new PIXI.Text(text, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 15,
    fill: color,
    fontWeight: '700',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowBlur: 2,
    dropShadowDistance: 1,
  });
  t.anchor.set(0.5);
  t.x = x; t.y = y; t._life = 0; t._vy = -0.7;
  fxLayer.addChild(t);
  return t;
}

function burst(x, y, color = 0xffe066, n = 10) {
  for (let i = 0; i < n; i++) {
    const g = new PIXI.Graphics();
    g.beginFill(color, 0.9);
    g.drawCircle(0, 0, 2 + Math.random() * 3);
    g.endFill();
    g.x = x; g.y = y;
    g._vx = (Math.random() - 0.5) * 3.5;
    g._vy = -1 - Math.random() * 2.5;
    g._life = 0;
    g._max = 25 + Math.random() * 20;
    particles.push(g);
    fxLayer.addChild(g);
  }
}

/** Source-video-style rainbow celebration shared by animal and tree super harvests. */
function showSuperHarvestFx(target, itemClassTsid, amount) {
  if (!fxLayer || !target?.sprite || target.sprite.destroyed) return null;
  const count = Math.max(1, Math.floor(Number(amount) || 1));
  const itemId = String(itemClassTsid || '').trim();
  const fx = new PIXI.Container();
  const rainbow = new PIXI.Graphics();
  const colors = [0xf15b5a, 0xf8a33a, 0xf5d74e, 0x78c96b, 0x5ba8e5, 0x9566d7];
  colors.forEach((color, index) => {
    rainbow.lineStyle(4, color, 0.92);
    rainbow.moveTo(-112, 29 + index * 3);
    rainbow.bezierCurveTo(-58, -30 + index * 2, 58, -30 + index * 2, 112, 29 + index * 3);
  });
  const heading = new PIXI.Text('SUPER HARVEST!', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 27,
    fill: 0xfff8d6,
    fontWeight: '900',
    letterSpacing: 1.5,
    stroke: 0x54402d,
    strokeThickness: 5,
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowAlpha: 0.28,
    dropShadowBlur: 3,
    dropShadowDistance: 2,
  });
  heading.anchor.set(0.5);
  heading.y = 19;
  const itemIcon = PIXI.Sprite.from(
    ITEM_CATALOG[itemId]?.icon || `assets/sprites/icons/${itemId}.png`
  );
  itemIcon.anchor.set(0.5);
  const largest = Math.max(itemIcon.texture.width || 1, itemIcon.texture.height || 1);
  const itemScale = Math.min(1.05, 38 / largest);
  itemIcon.scale.set(itemScale);
  itemIcon.x = -18;
  itemIcon.y = 62;
  const countText = new PIXI.Text(`+${count}`, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 21,
    fill: 0xffffff,
    fontWeight: '900',
    stroke: 0x4a3829,
    strokeThickness: 4,
  });
  countText.anchor.set(0, 0.5);
  countText.x = 8;
  countText.y = 62;
  fx.addChild(rainbow, heading, itemIcon, countText);
  fx.x = target.sprite.x;
  fx.y = target.sprite.y - Math.min(178, Math.max(118, Math.abs(target.sprite.height) * 0.72));
  fx.zIndex = 100001;
  fx.eventMode = 'none';
  fx._superHarvestFx = true;
  fx._life = 0;
  fx._max = 126;
  fx._baseY = fx.y;
  fxLayer.addChild(fx);
  burst(target.sprite.x, target.sprite.y - 70, 0xffd95a, 18);
  if (app?.view) {
    app.view.dataset.superHarvestFx = 'playing';
    app.view.dataset.superHarvestItem = itemId;
    app.view.dataset.superHarvestAmount = String(count);
  }
  return fx;
}

function showMusicblockFx(def) {
  if (!fxLayer || !player || !def) return;
  for (const child of [...fxLayer.children]) {
    if (child._musicFx) fxLayer.removeChild(child);
  }

  const icon = PIXI.Sprite.from(ITEM_CATALOG[def.classTsid]?.icon || `assets/sprites/icons/${def.classTsid}.png`);
  icon.anchor.set(0.5);
  icon.scale.set(1.35);
  icon._musicFx = 'block';
  icon._life = 0;
  icon._max = Math.max(90, def.durationMs / (1000 / 60));
  icon._phase = 0;
  icon.x = player.x + 18;
  icon.y = player.y - 112;
  fxLayer.addChild(icon);

  const glyphs = ['♪', '♫', '♬', '♩'];
  const colors = def.collection === 'DR'
    ? [0xf397a6, 0xffc66d, 0xd982ae]
    : [0x8ee3a1, 0x7dc9ff, 0xc6a2ff];
  const count = Math.max(10, Math.ceil(def.durationMs / 700));
  for (let i = 0; i < count; i++) {
    const note = new PIXI.Text(glyphs[i % glyphs.length], {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 18 + (i % 3) * 3,
      fill: colors[i % colors.length],
      fontWeight: '700',
      dropShadow: true,
      dropShadowColor: 0x3b274c,
      dropShadowBlur: 2,
      dropShadowDistance: 1,
    });
    note.anchor.set(0.5);
    note._musicFx = 'note';
    note._life = 0;
    note._delay = i * 34;
    note._max = 88;
    note._vx = (i % 2 ? 1 : -1) * (0.25 + (i % 4) * 0.08);
    note._vy = -0.58 - (i % 3) * 0.08;
    note.x = player.x + 20 + (i % 2 ? 20 : -20);
    note.y = player.y - 112;
    note.alpha = 0;
    fxLayer.addChild(note);
  }
}

// —— Verb menu (HTML) ——
function openVerbMenu(target) {
  if (currentAction) return;
  menuTarget = target;
  const verbs = features.verbsFor(target, engine) ?? getVerbsFor(target, {
    pc,
    inv,
    tools: toolState,
    skills: skillState,
    learned: skillState.learned,
  });
  const menu = document.getElementById('verb-menu');
  const list = document.getElementById('verb-menu-list');
  const title = document.getElementById('verb-menu-title');
  const sub = document.getElementById('verb-menu-sub');

  title.textContent = target.label || target.classId;
  sub.textContent = target.subtitle || 'What do you want to do?';
  list.innerHTML = '';

  if (!verbs.length) {
    list.innerHTML = '<li class="verb-choice-tip" style="padding:0.75rem 1rem">Nothing to do here.</li>';
  }

  /** @type {HTMLButtonElement|null} */
  let firstEnabled = null;
  verbs.forEach((v) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'verb-choice';
    btn.disabled = !v.enabled;
    btn.innerHTML = `
      <span class="verb-choice-label">${v.label}${v.energy ? ` · ${v.energy} energy` : ''}</span>
      <span class="verb-choice-tip">${v.tooltip || ''}</span>
      ${!v.enabled && v.reason ? `<span class="verb-choice-reason">${v.reason}</span>` : ''}
    `;
    if (v.enabled) {
      if (!firstEnabled) firstEnabled = btn;
      btn.addEventListener('click', () => {
        closeVerbMenu();
        if (v.id === 'feed') openFeedPicker(target);
        else beginVerbAction(target, v);
      });
    }
    li.appendChild(btn);
    list.appendChild(li);
  });

  menu.hidden = false;
  // Defer focus so the Enter that opened the menu does not also activate this choice.
  requestAnimationFrame(() => {
    const focusBtn = firstEnabled || list.querySelector('.verb-choice');
    focusBtn?.focus({ preventScroll: true });
  });
}

function closeVerbMenu() {
  document.getElementById('verb-menu').hidden = true;
  menuTarget = null;
}

function isFeedPickerOpen() {
  const panel = document.getElementById('feed-picker');
  return Boolean(feedPickerTarget && panel && !panel.hidden);
}

function markFeedPickerChoice(button) {
  document.querySelectorAll('#feed-picker-grid .feed-picker-choice').forEach((choice) => {
    const selected = choice === button;
    choice.classList.toggle('is-selected', selected);
    choice.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  if (app?.view && button?.dataset?.food) {
    app.view.dataset.feedPickerSelection = button.dataset.food;
  }
}

function closeFeedPicker(result = 'cancelled') {
  const panel = document.getElementById('feed-picker');
  if (panel) panel.hidden = true;
  feedPickerTarget = null;
  feedPickerOptions = [];
  if (app?.view && result) app.view.dataset.feedPickerResult = result;
}

function chooseFeedPickerItem(classTsid) {
  const target = feedPickerTarget;
  const food = feedPickerOptions.find((option) => option.classTsid === classTsid);
  if (!target || !food || currentAction) return false;
  const stillAvailable = listAnimalFeedOptions(target.classId, inv)
    .some((option) => option.classTsid === classTsid);
  if (!stillAvailable) {
    closeFeedPicker('missing');
    toast(`You have no ${food.label}.`, 2400);
    return false;
  }
  if (app?.view) app.view.dataset.feedPickerSelection = classTsid;
  closeFeedPicker('selected');
  return beginVerbAction(target, {
    id: `feed:${classTsid}`,
    label: `feed ${food.label}`,
  });
}

function openFeedPicker(target) {
  if (!target || currentAction) return false;
  const panel = document.getElementById('feed-picker');
  const grid = document.getElementById('feed-picker-grid');
  const sub = document.getElementById('feed-picker-sub');
  if (!panel || !grid || !sub) return false;
  const options = listAnimalFeedOptions(target.classId, inv);
  if (!options.length) {
    toast(`You don't have anything this ${target.label || 'animal'} wants to eat.`, 2800);
    return false;
  }

  closePackPopover();
  feedPickerTarget = target;
  feedPickerOptions = options;
  sub.textContent = `Choose something from your pack for ${target.label || 'this animal'}.`;
  grid.innerHTML = '';
  for (const food of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'feed-picker-choice';
    button.dataset.food = food.classTsid;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.setAttribute('aria-label', `${food.label}, ${food.have} in pack`);
    button.title = `Feed one ${food.label} · ${food.have} in your pack`;

    const image = document.createElement('img');
    image.src = ITEM_ICONS[food.classTsid] || `assets/sprites/icons/${food.classTsid}.png`;
    image.alt = '';
    image.loading = 'lazy';
    const label = document.createElement('span');
    label.className = 'feed-picker-choice-label';
    label.textContent = food.label;
    const count = document.createElement('span');
    count.className = 'feed-picker-choice-count';
    count.textContent = String(food.have);
    button.append(image, label, count);
    button.addEventListener('focus', () => markFeedPickerChoice(button));
    button.addEventListener('pointerenter', () => markFeedPickerChoice(button));
    button.addEventListener('click', () => chooseFeedPickerItem(food.classTsid));
    grid.appendChild(button);
  }

  panel.hidden = false;
  if (app?.view) {
    app.view.dataset.feedPickerTarget = target.classId;
    app.view.dataset.feedPickerOptions = options.map((option) => option.classTsid).join(',');
    app.view.dataset.feedPickerSelection = '';
    app.view.dataset.feedPickerResult = 'open';
  }
  requestAnimationFrame(() => {
    const first = grid.querySelector('.feed-picker-choice');
    markFeedPickerChoice(first);
    first?.focus({ preventScroll: true });
  });
  return true;
}

function positionActionProgress() {
  const el = document.getElementById('action-progress');
  if (!el || el.hidden || !player || !app?.view) return;
  const canvas = app.view;
  const canvasW = canvas.clientWidth || canvas.width || VIEW_W;
  const canvasH = canvas.clientHeight || canvas.height || VIEW_H;
  const screenX = (player.x - camTarget) * (canvasW / VIEW_W);
  const screenY = (player.y - (camY || 0) - 98) * (canvasH / VIEW_H);
  const halfWidth = Math.max(1, el.offsetWidth || 238) / 2;
  const safeRight = horizontalLocationViewWidth() * (canvasW / VIEW_W);
  const clampedX = cameraOverlayCenterX(
    screenX,
    halfWidth * 2,
    canvasW,
    cameraRightInset * (canvasW / VIEW_W),
    10
  );
  el.style.left = `${clampedX}px`;
  el.style.top = `${clamp(screenY, 66, Math.max(66, canvasH - 120))}px`;
  canvas.dataset.actionScreenX = clampedX.toFixed(2);
  canvas.dataset.actionSafeRight = safeRight.toFixed(2);
  canvas.dataset.actionWidth = (halfWidth * 2).toFixed(2);
}

function renderCurrentAction() {
  const el = document.getElementById('action-progress');
  if (!el) return;
  if (!currentAction || currentAction.status !== 'running') {
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    return;
  }
  el.hidden = false;
  el.setAttribute('aria-hidden', 'false');
  const label = el.querySelector('[data-action-label]');
  const fill = el.querySelector('[data-action-fill]');
  if (label) label.textContent = currentAction.label;
  if (fill) fill.style.width = `${Math.round(currentAction.progress * 100)}%`;
  positionActionProgress();
}

function clearActionToolFx(status = 'cancelled') {
  const fx = actionToolFx;
  actionToolFx = null;
  if (fx?.parent) fx.parent.removeChild(fx);
  if (fx && !fx.destroyed) fx.destroy();
  if (app?.view && fx?._toolAnimationDataset) {
    app.view.dataset[fx._toolAnimationDataset] = status;
  }
}

function stopTrantHarvestAnimation(target, status = 'complete') {
  const spr = target?.sprite;
  const fx = spr?._trantHarvestFx;
  if (!spr || !fx) return;
  spr.scale.set(fx.baseScaleX, fx.baseScaleY);
  spr.rotation = fx.baseRotation;
  delete spr._trantHarvestFx;
  if (app?.view) app.view.dataset.trantHarvestAnimation = status;
}

function playTrantHarvestAnimation(target, durationMs = 0) {
  const spr = target?.sprite;
  if (!spr || spr.destroyed) return null;
  stopTrantHarvestAnimation(target, 'replaced');
  spr._trantHarvestFx = {
    phase: 0,
    remaining: Math.max(1, Number(durationMs) || 2000) / (1000 / 60),
    baseScaleX: spr.scale.x,
    baseScaleY: spr.scale.y,
    baseRotation: spr.rotation || 0,
  };
  burst(spr.x, spr.y - Math.min(120, Math.abs(spr.height) * 0.55), 0x9bd66f, 8);
  if (app?.view) app.view.dataset.trantHarvestAnimation = 'playing';
  return spr._trantHarvestFx;
}

function playVerbStartAnimation(target, verbId, durationMs = 0) {
  const spr = target?.sprite;
  if (!spr || spr.destroyed) return;
  const baseVerb = String(verbId || '').split(':')[0];
  if (baseVerb === 'pet' && spr.playPet) spr.playPet(durationMs);
  if ((baseVerb === 'nibble' || baseVerb === 'feed') && spr.playNibble) spr.playNibble(durationMs);
  if ((baseVerb === 'squeeze' || baseVerb === 'feed') && spr.playSqueeze) spr.playSqueeze(durationMs);
  if (target.classId === 'npc_butterfly' && (baseVerb === 'massage' || baseVerb === 'milk')) {
    playButterflyCareAnimation(target, baseVerb, durationMs);
  }
  if (target.classId === 'wood_tree' && baseVerb === 'harvest') playHatchetAnimation(target);
  if (TRANT_META[target.classId] && baseVerb === 'harvest') {
    playTrantHarvestAnimation(target, durationMs);
  }
  if (baseVerb === 'water' || baseVerb === 'water_all') {
    playWateringCanAnimation(target, durationMs);
  }
}

function playButterflyCareAnimation(target, verbId, durationMs = 0) {
  const spr = target?.sprite;
  if (!spr || spr.destroyed) return;
  const frames = Math.max(42, Math.ceil((Number(durationMs) || 900) / (1000 / 60)));
  spr._butterflyCare = {
    verbId,
    phase: 0,
    remaining: frames,
    direction: Math.sign(spr.scale.x) || 1,
    baseScale: Math.abs(spr.baseScale || spr.scale.y || ENTITY_SCALE.butterfly),
  };
  burst(spr.x, spr.y - 30, verbId === 'milk' ? 0x9adcf8 : 0xd7a9ff, verbId === 'milk' ? 12 : 16);
  if (app?.view) app.view.dataset.butterflyCareAnimation = `${verbId}:playing`;
}

function playHatchetAnimation(target) {
  const frames = textures.hatchetTool?.frames || [];
  if (!frames.length || !fxLayer || !player || !target?.sprite) return null;
  clearActionToolFx('replaced');
  const tool = new PIXI.AnimatedSprite(frames);
  const targetIsLeft = target.sprite.x < player.x;
  tool.anchor.set(0.5);
  tool.x = player.x + (targetIsLeft ? -25 : 25);
  tool.y = player.y - 58;
  tool.scale.set(targetIsLeft ? -1 : 1, 1);
  tool.animationSpeed = 0.17;
  tool.loop = false;
  tool.zIndex = 100000;
  tool.eventMode = 'none';
  tool._hatchetFx = true;
  tool._toolAnimationDataset = 'hatchetAnimation';
  actionToolFx = tool;
  fxLayer.addChild(tool);
  if (app?.view) app.view.dataset.hatchetAnimation = 'playing';
  tool.onComplete = () => {
    if (actionToolFx === tool) actionToolFx = null;
    if (tool.parent) tool.parent.removeChild(tool);
    if (!tool.destroyed) tool.destroy();
    if (app?.view) app.view.dataset.hatchetAnimation = 'complete';
  };
  tool.play();
  return tool;
}

function playWateringCanAnimation(target, durationMs = 0) {
  const frames = textures.wateringCanTool?.frames || [];
  if (!frames.length || !fxLayer || !player || !target?.sprite) return null;
  clearActionToolFx('replaced');
  const tool = new PIXI.AnimatedSprite(frames);
  const targetIsLeft = target.sprite.x < player.x;
  tool.anchor.set(0.5);
  tool.x = player.x + (targetIsLeft ? -29 : 29);
  tool.y = player.y - 55;
  tool.scale.set(targetIsLeft ? -0.92 : 0.92, 0.92);
  const seconds = Math.max(0.75, (Number(durationMs) || 2000) / 1000);
  tool.animationSpeed = frames.length / (60 * seconds);
  tool.loop = false;
  tool.zIndex = 100000;
  tool.eventMode = 'none';
  tool._toolAnimationDataset = 'wateringCanAnimation';
  actionToolFx = tool;
  fxLayer.addChild(tool);
  if (app?.view) app.view.dataset.wateringCanAnimation = 'playing';
  tool.onComplete = () => {
    if (actionToolFx === tool) actionToolFx = null;
    if (tool.parent) tool.parent.removeChild(tool);
    if (!tool.destroyed) tool.destroy();
    if (app?.view) app.view.dataset.wateringCanAnimation = 'complete';
  };
  tool.play();
  return tool;
}

function beginVerbAction(target, verb) {
  if (!target || !verb || currentAction) return false;
  const durationMs = Number.isFinite(verb.durationMs)
    ? Math.max(0, Number(verb.durationMs))
    : actionDurationFor(target.classId, verb.id);
  if (durationMs <= 0) {
    executeVerb(target, verb.id);
    return true;
  }
  if (!target.sprite || target.sprite.destroyed) return false;
  if (climb.active) stopClimb();
  keys.clear();
  player.vx = 0;
  player.vy = 0;
  setPlayerAnim('idle');
  if (target.sprite.x !== player.x) {
    player.facing = target.sprite.x < player.x ? 'left' : 'right';
    applyPlayerFacing();
  }
  currentAction = {
    ...createTimedAction({
      classId: target.classId,
      verbId: verb.id,
      verbLabel: verb.label,
      targetLabel: target.label || target.classId,
      durationMs,
    }),
    target,
    verbLabel: verb.label,
  };
  clearHoverGlow();
  playVerbStartAnimation(target, verb.id, durationMs);
  renderCurrentAction();
  return true;
}

function cancelCurrentAction(opts = {}) {
  if (!currentAction || currentAction.status !== 'running') return false;
  stopTrantHarvestAnimation(currentAction.target, 'cancelled');
  if (currentAction.target === rookEggTarget) resetRookEggSmashVisual();
  currentAction = cancelTimedAction(currentAction);
  clearActionToolFx('cancelled');
  renderCurrentAction();
  currentAction = null;
  if (!opts.quiet) toast('Action cancelled.', 1500);
  return true;
}

function updateCurrentAction(deltaMs) {
  if (!currentAction) return;
  const target = currentAction.target;
  if (!target?.sprite || target.sprite.destroyed || isScreenFxBlocking()) {
    cancelCurrentAction({ quiet: true });
    return;
  }
  currentAction = advanceTimedAction(currentAction, deltaMs);
  if (currentAction.target === rookEggTarget) updateRookEggSmashVisual(currentAction);
  renderCurrentAction();
  if (currentAction.status !== 'complete') return;
  const completed = currentAction;
  currentAction = null;
  stopTrantHarvestAnimation(completed.target, 'complete');
  renderCurrentAction();
  verbAnimationAlreadyStarted = true;
  try {
    executeVerb(completed.target, completed.verbId);
  } finally {
    verbAnimationAlreadyStarted = false;
  }
}

const SPEECH_REACTION_VERBS = new Set([
  'talk_to',
  'pet',
  'nibble',
  'feed',
  'squeeze',
  'butter_up',
  'massage',
  'milk',
  'sing_to',
  'water',
]);

function executeVerb(target, verbId) {
  if (features.runVerb(target, verbId, engine)) return;
  if (target?.classId === 'pc_local') {
    handleLocalCompanionTarget(target, verbId);
    return;
  }
  if (
    target?.classId === 'npc_mailbox' ||
    target?.classId === 'home_door' ||
    target?.classId === 'home_return_marker'
  ) {
    if (handleHomeTarget(target, verbId)) return;
  }
  if (target?.classId === 'greedy_story_button' || target?.classId === 'greedy_story_exit') {
    handleGreedyStreetTarget(target, verbId);
    return;
  }
  if (target?.classId === 'npc_piggy' && verbId === 'talk_to') {
    if (handleGreedyStreetPiggy(target)) return;
  }
  if (target?.classId === STOOT_DOLL_ID) {
    handleStootDollTarget(target, verbId);
    return;
  }
  if (target?.classId === 'npc_spinning_wheel') {
    handleSpinningWheelTarget(target, verbId);
    return;
  }
  if (
    [
      'legalize_transit_gate',
      'legalize_subway_entrance',
      'legalize_hall_entrance',
      'npc_back_alley_bureaucrat',
      'npc_bureaucrat',
    ].includes(target?.classId)
  ) {
    handleLegalizeTarget(target, verbId);
    return;
  }
  if (target?.classId === 'npc_dustbunny' || target?.classId === SMALL_WORTHLESS_ID) {
    handleDeEmbiggenifyTarget(target, verbId);
    return;
  }
  if (target?.classId === 'rook_hall_speaker' || target?.classId === 'npc_quest_widget') {
    handleRookMuseumTarget(target, verbId);
    return;
  }
  if (target?.classId === 'rook_egg') {
    handleRookEggTarget(target, verbId);
    return;
  }
  if (target?.classId === 'winter_portal') {
    handleWinterPortal(target, verbId);
    return;
  }
  if (target?.classId === 'npc_piggy_explorer') {
    handleIlmenskieTarget(target, verbId);
    return;
  }
  if (target?.classId === 'phantom_glitch') {
    handlePhantomInteraction(target, verbId);
    return;
  }
  if (target?.classId === 'letter_block' || target?.classId === 'npc_letterblock') {
    handleFourLetterTarget(target, verbId);
    return;
  }
  if (
    target?.classId === 'race_pig_bait' ||
    target?.classId === 'race_piggy' ||
    target?.classId === 'race_pig_pen'
  ) {
    handleHogHaulTarget(target);
    return;
  }
  if (target?.classId === 'dropped_item') {
    if (verbId === 'pull_string' && target.state?.classTsid === STOOT_DOLL_ID) {
      handleStootDollTarget(target, verbId, { context: 'ground' });
      return;
    }
    if (verbId === 'pickup') {
      pickupDroppedWorldItem(target);
      return;
    }
  }
  if (target?.classId?.startsWith('npc_shrine_') && (verbId === 'donate_to' || verbId === 'check_favor')) {
    openShrinePanel(target);
    return;
  }
  const baseVerb = String(verbId || '').split(':')[0];
  const animalRollParam = new URLSearchParams(location.search).get('animalroll');
  const animalRoll = animalRollParam === null ? Number.NaN : Number(animalRollParam);
  const harvestRollParam = new URLSearchParams(location.search).get('harvestroll');
  const harvestRoll = harvestRollParam === null ? Number.NaN : Number(harvestRollParam);
  const forcedRoll = baseVerb === 'harvest' && Number.isFinite(harvestRoll)
    ? harvestRoll
    : animalRoll;
  const result = runVerb(target, verbId, {
    pc,
    inv,
    tools: toolState,
    skills: skillState,
    learned: skillState.learned,
    imaginationUpgrades: pc.imaginationUpgrades || [],
    musicblocks: musicblockState,
    shrines: shrineState,
    streetTsid: currentStreetTsid,
    rng: () => Number.isFinite(forcedRoll)
      ? clamp(forcedRoll, 0, 0.999999)
      : buffedRandom(buffState, Math.random, Date.now()),
  });
  if (baseVerb === 'feed' && app?.view) {
    app.view.dataset.feedPickerResult = result.ok ? 'success' : 'failed';
  }
  let reactionText = null;
  if (result.ok && result.speech?.text) {
    showSpeechBubble(target, result.speech);
  } else if (result.ok && SPEECH_REACTION_VERBS.has(baseVerb)) {
    reactionText = result.msgs?.[1] || result.msgs?.[0] || null;
    if (reactionText) {
      showSpeechBubble(target, {
        speaker: target.label || target.classId,
        text: reactionText,
        durationMs: clamp(2400 + reactionText.length * 30, 3200, 7200),
      });
    }
  }
  // Single feed entry: prefer colorized activityLine; toast first msg once
  const feedLine = result.effects?.activityLine || result.msgs?.[0];
  if (feedLine) {
    toast(result.msgs?.[0] || feedLine, 3200);
    pushActivity(feedLine);
  }
  (result.msgs || []).forEach((m, i) => {
    if (i === 0) return; // already toasted / fed above
    if (reactionText && m === reactionText) return; // rendered in a wrapped speech bubble
    floatText(target.sprite.x, target.sprite.y - 50 - i * 16, m, 0xfff4d6);
  });
  // Floating metabolic deltas
  if (result.ok && result.effects) {
    const e = result.effects;
    if (e.energy) {
      floatText(
        player.x,
        player.y - 70,
        `${e.energy > 0 ? '+' : ''}${e.energy} energy`,
        e.energy < 0 ? 0xff8888 : 0x7dcea0
      );
    }
    if (e.mood > 0) floatText(player.x + 20, player.y - 90, `+${e.mood} mood`, 0xffe066);
    if ((e.img || e.xp) > 0) {
      floatText(player.x - 20, player.y - 90, `+${e.img || e.xp} iMG`, 0xb388ff);
    }
  }

  if (result.trantCareAttempted) {
    const condition = getToolCondition(toolState, 'watering_can');
    if (app?.view) {
      app.view.dataset.trantCareResult = result.ok ? 'success' : (result.trantCare?.reason || 'failed');
      app.view.dataset.wateringCanRemaining = String(condition.remaining);
      app.view.dataset.trantCareClass = target.classId;
    }
    if (target.classId === 'wood_tree') {
      refreshWoodTreeVisual(target);
    } else if (TRANT_META[target.classId] && target.state) {
      target.subtitle = trantStatusLabel(target.state, TRANT_META[target.classId]);
    }
    if (result.trantCare?.toolUse?.broke) {
      toast('Ooops! You done broke your Watering Can. Repair it with the Tinkertool.', 4200);
    }
  }

  if (result.animalKinshipAttempted) {
    const care = result.animalKinship || {};
    if (app?.view) {
      app.view.dataset.animalKinshipResult = result.ok ? 'success' : (care.reason || 'failed');
      app.view.dataset.animalKinshipClass = target.classId;
      app.view.dataset.animalKinshipVerb = baseVerb;
      app.view.dataset.animalKinshipRank = String(care.rank ?? 0);
      app.view.dataset.animalKinshipUses = String(care.usesToday ?? 0);
      app.view.dataset.animalKinshipYield = String(care.itemCount || 0);
      app.view.dataset.animalKinshipSuper = care.superHarvest ? '1' : '0';
      if (target.classId === 'npc_butterfly') {
        const lotion = getToolCondition(toolState, 'butterfly_lotion');
        app.view.dataset.butterflyMassageUses = String(target.state?.massageUsesToday || 0);
        app.view.dataset.butterflyMilkUses = String(target.state?.milkUsesToday || 0);
        app.view.dataset.butterflyLotionRemaining = String(lotion.remaining);
        app.view.dataset.butterflyLotionTubes = String(inv.butterfly_lotion || 0);
      }
    }
    if (result.ok && care.superHarvest && care.itemClassTsid) {
      const bonus = Math.max(
        1,
        (Number(care.itemCount) || 0) - (Number(care.profile?.bonusAmount) || 0)
      );
      showSuperHarvestFx(target, care.itemClassTsid, bonus);
    }
  }

  if (result.ok && result.harvest) {
    const harvest = result.harvest;
    if (app?.view) {
      app.view.dataset.trantHarvestClass = target.classId;
      app.view.dataset.trantHarvestFruit = harvest.fruitClass;
      app.view.dataset.trantHarvestYield = String(harvest.amount || 0);
      app.view.dataset.trantHarvestBase = String(harvest.baseAmount || 0);
      app.view.dataset.trantHarvestSuper = harvest.superHarvest ? '1' : '0';
      app.view.dataset.trantHarvestRemaining = String(harvest.remainingOnTree || 0);
      app.view.dataset.trantHarvestUses = String(harvest.harvestsToday || 0);
      app.view.dataset.trantHarvestLimit = String(harvest.harvestsLimit || 0);
    }
    if (harvest.superHarvest) {
      showSuperHarvestFx(target, harvest.fruitClass, harvest.superAmount);
    }
  }

  if (result.ok) {
    if (result.openVendor) openVendor();
    if (result.gardenChanged) {
      const gEnt = result.gardenTarget || target.state?.gardenEntity || target;
      refreshGardenVisual(gEnt);
      updateHud();
    }
    if (result.miningChanged) {
      refreshMineRockVisual(target);
      updateHud();
    }
    if (result.woodTreeChanged) {
      refreshWoodTreeVisual(target);
      const condition = getToolCondition(toolState, 'hatchet');
      app.view.dataset.woodYield = String(result.woodHarvest?.plankYield || 0);
      app.view.dataset.hatchetRemaining = String(condition.remaining);
      if (condition.broken) toast('Ooops! You done broke your Hatchet. Repair it with the Tinkertool.', 4200);
    }
    if (result.animalChanged && target.state) {
      target.subtitle = animalStatusLabel(target.classId, target.state);
    }
    if (result.musicblockPickup) {
      const picked = result.musicblockPickup;
      if (picked.newDiscovery) {
        const updates = applyAchievementProgress(
          achieveState,
          `in_inventory:${picked.def.classTsid}`,
          1,
          pc
        );
        announceAchievementUpdates(updates);
      }
      floatText(
        target.sprite.x,
        target.sprite.y - 112,
        picked.collection.complete
          ? 'Musicblock set complete!'
          : `Tunes ${picked.collection.owned}/${picked.collection.total}`,
        0xc6a2ff
      );
    }
    playSfx(verbId === 'pickup' || verbId === 'harvest' || verbId === 'milk' ? 'pickup' : 'pet', {
      volume: 0.7,
      rate: 0.95 + Math.random() * 0.2,
    });
    burst(target.sprite.x, target.sprite.y - 30, 0xffe066, 8);

    // Refresh trant subtitle after tend/harvest
    if (TRANT_META[target.classId] && target.state) {
      const meta = TRANT_META[target.classId];
      target.subtitle = trantStatusLabel(target.state, meta);
    }

    // Original quest counters (GSJS-style)
    let questEvent = null;
    if (target.classId === 'npc_piggy' && verbId === 'pet') questEvent = 'pet_piggy';
    if (target.classId === 'npc_chicken' && verbId === 'squeeze') questEvent = 'squeeze_chicken';
    if (target.classId === 'npc_butterfly' && verbId === 'milk') questEvent = 'milk_butterfly';
    if (target.classId === 'trant_fruit' && verbId === 'harvest') questEvent = 'harvest_fruit';
    if (target.classId === 'trant_egg' && verbId === 'harvest') questEvent = 'harvest_egg';
    if (target.classId === 'wood_tree' && verbId === 'harvest') questEvent = 'harvest_tree';
    if ((TRANT_META[target.classId] || target.classId === 'wood_tree') && verbId === 'water') {
      questEvent = 'trees_watered';
    }
    if ((TRANT_META[target.classId] || target.classId === 'wood_tree') && verbId === 'pet') {
      questEvent = 'trees_petted';
    }
    if (
      TRANT_META[target.classId] &&
      verbId === 'harvest' &&
      target.classId !== 'trant_fruit' &&
      target.classId !== 'trant_egg'
    ) {
      questEvent = 'harvest_trant';
    }
    if (questEvent) {
      const updates = applyQuestProgress(questState, questEvent, 1, pc);
      for (const u of updates) {
        if (u.completed) {
          floatText(player.x, player.y - 100, `${u.def.title} ✓`, 0xffe066);
          enqueueAward({
            kind: 'quest',
            title: u.def.title || u.def.name || 'Quest complete',
            body: u.def.desc || u.def.description || 'You did a thing. A good thing.',
          });
        }
      }
    }
    const achievementEvents = worldVerbAchievementCounters(target.classId, verbId, result);
    for (const achievementEvent of achievementEvents) {
      const achievementUpdates = applyAchievementProgress(
        achieveState,
        achievementEvent.counter,
        achievementEvent.amount,
        pc
      );
      announceAchievementUpdates(achievementUpdates);
    }
    if (achievementEvents.length) {
      app.view.dataset.achievementCounter = achievementEvents
        .map((event) => `${event.counter}=${event.amount}`)
        .join(',');
    }
    // Every world verb is also a `<class>:<verb>` quest event, unless a badge
    // counter of the same name already carried it.
    const verbEvent = `${target.classId}:${verbId}`;
    if (!achievementEvents.some((event) => event.counter === verbEvent)) emitGameEvent(verbEvent);
    if (ROCK_CATALOG[target.classId] && verbId === 'mine' && target.state?.rock?.depleted) {
      emitGameEvent(`rocks_depleted:${target.classId}`);
    }

    // anim hooks
    if (!verbAnimationAlreadyStarted) playVerbStartAnimation(target, result.anim);
    if (result.anim === 'massage' || result.anim === 'milk') {
      floatText(target.sprite.x, target.sprite.y - 70, result.anim === 'milk' ? '🥛' : '✨', 0xc9a0ff);
    }

    if (result.remove) {
      if (target.classId === 'apple') {
        collectNaturalIndex('apple', target.state?.naturalIndex);
      }
      if (target.sprite._worldGlow?.parent) {
        target.sprite._worldGlow.parent.removeChild(target.sprite._worldGlow);
      }
      entityLayer.removeChild(target.sprite);
      apples = apples.filter((a) => a !== target.sprite);
      worldMusicblocks = worldMusicblocks.filter((block) => block !== target.sprite);
      interactables = interactables.filter((t) => t !== target);
    }
  } else {
    playSfx('alert', { volume: 0.25, rate: 0.8 });
  }

  if (!result.remove && target?.sprite && !target.sprite.destroyed) {
    recentInteractionTarget = target;
    recentInteractionUntil = Date.now() + 6000;
    if (app?.view) app.view.dataset.recentInteractionTarget = target.classId || '';
  }

  // show item gains
  if (result.effects?.items) {
    Object.entries(result.effects.items).forEach(([id, n]) => {
      if (n > 0) floatText(target.sprite.x, target.sprite.y - 90, `+${n} ${ITEM_LABELS[id] || id}`, 0x7dcea0);
    });
  }

  updateHud();
  checkQuest();
}

function tryOpenNearestMenu() {
  // The original interaction cadence often chains verbs (pet → nibble). Large
  // trant hit boxes can overlap small animals, so keep E on the entity just
  // used until the player moves away or deliberately moves the pointer.
  if (
    recentInteractionTarget?.sprite &&
    !recentInteractionTarget.sprite.destroyed &&
    Date.now() < recentInteractionUntil &&
    interactDistance(recentInteractionTarget, player.x, player.y) < 160
  ) {
    openVerbMenu(recentInteractionTarget);
    return;
  }
  // Prefer hovered target when player is roughly near it
  if (hoverTarget?.sprite && !hoverTarget.sprite.destroyed) {
    const d = interactDistance(hoverTarget, player.x, player.y);
    if (d < 160) {
      openVerbMenu(hoverTarget);
      return;
    }
  }
  const t = nearestInteractable(100);
  if (t) openVerbMenu(t);
  else toast('Nothing nearby to interact with.');
}

/** Distance to an interactable; airborne (flying butterflies) get vertical slack. */
function interactDistance(t, px, py) {
  if (!t?.sprite) return Infinity;
  const box = spriteWorldHitBox(t.sprite, 0);
  if (box) {
    // Distance to nearest point on AABB (0 if player inside footprint)
    const cx = clamp(px, box.left, box.right);
    const cy = clamp(py, box.top, box.bottom);
    if (t.airborne) {
      return Math.hypot(cx - px, Math.max(0, Math.abs(cy - py) - 40));
    }
    return Math.hypot(cx - px, cy - py);
  }
  const dx = t.sprite.x - px;
  const dy = t.sprite.y - py;
  if (t.airborne) {
    return Math.hypot(dx, Math.max(0, Math.abs(dy) - 110));
  }
  return Math.hypot(dx, dy);
}

function nearestInteractable(maxD) {
  let best = null;
  let bestD = maxD;
  for (const t of interactables) {
    if (!t.sprite || t.sprite.destroyed) continue;
    let d = interactDistance(t, player.x, player.y);
    // Prefer individual garden plots over the bed foot / large entities
    if (t.classId === 'dropped_item') {
      if (d > 130) continue;
      d = d * 0.35 - 48;
    }
    if (t.classId === 'garden_plot') d *= 0.55;
    if (t.classId === 'garden_new') d *= 1.35;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

// —— World ——
function makeBackground() {
  const g = new PIXI.Graphics();
  const theme = worldSession?.location?.theme || 'forest';
  const palettes = {
    forest: [
      [0x8ec8e8, 0], [0x9fd3e8, 80], [0xb5dce8, 180],
      [0xcfe6c0, 300], [0xb5d090, 360],
    ],
    meadow: [
      [0xa8d4f0, 0], [0xb8dff5, 80], [0xd0ead0, 180],
      [0xd8e8a8, 300], [0xc4d878, 360],
    ],
    path: [
      [0x9ec0d8, 0], [0xb0c8d8, 80], [0xc8d0b0, 180],
      [0xc0b890, 300], [0xa89870, 360],
    ],
    house: [
      [0xd4c4a8, 0], [0xe0d4b8, 100], [0xc8b090, 220],
      [0xb89870, 320], [0x8a7050, 380],
    ],
  };
  const bands = palettes[theme] || palettes.forest;
  for (let i = 0; i < bands.length; i++) {
    const y0 = bands[i][1];
    const y1 = i + 1 < bands.length ? bands[i + 1][1] : VIEW_H;
    g.beginFill(bands[i][0]);
    g.drawRect(0, y0, WORLD_W, y1 - y0 + 2);
    g.endFill();
  }
  g.beginFill(0x7aa85a, 0.55);
  for (let x = -40; x < WORLD_W; x += 180) g.drawEllipse(x + 90, GROUND_Y - 30, 120, 50);
  g.endFill();
  g.beginFill(0x6b9848, 0.7);
  for (let x = -20; x < WORLD_W; x += 140) g.drawEllipse(x + 70, GROUND_Y - 8, 90, 36);
  g.endFill();

  const plats = [
    { x: 700, y: GROUND_Y - 90, w: 160 },
    { x: 1150, y: GROUND_Y - 130, w: 140 },
    { x: 1600, y: GROUND_Y - 100, w: 180 },
  ];
  g.beginFill(0x5f8a40);
  plats.forEach((p) => g.drawRoundedRect(p.x - p.w / 2, p.y, p.w, 16, 6));
  g.endFill();
  makeBackground.platforms = plats;

  g.beginFill(0x6b8f3c);
  g.drawRect(0, GROUND_Y, WORLD_W, VIEW_H - GROUND_Y);
  g.endFill();
  g.beginFill(0x8b6914);
  g.drawRect(0, GROUND_Y + 16, WORLD_W, VIEW_H);
  g.endFill();
  g.beginFill(0x6b4f35);
  g.drawRect(0, GROUND_Y + 38, WORLD_W, VIEW_H);
  g.endFill();

  for (let x = 0; x < WORLD_W; x += 22) {
    const hh = 5 + (x * 17) % 12;
    g.beginFill(0x4f7a38);
    g.moveTo(x, GROUND_Y + 1);
    g.lineTo(x + 4, GROUND_Y - hh);
    g.lineTo(x + 8, GROUND_Y + 1);
    g.closePath();
    g.endFill();
  }

  const clouds = new PIXI.Graphics();
  for (let i = 0; i < 16; i++) {
    const x = 60 + i * 150 + (i % 3) * 30;
    const y = 40 + (i * 37) % 70;
    const r = 40 + (i * 13) % 30;
    clouds.beginFill(0xffffff, 0.72);
    clouds.drawEllipse(x, y, r, r * 0.5);
    clouds.drawEllipse(x + r * 0.45, y + 5, r * 0.65, r * 0.38);
    clouds.endFill();
  }

  const locLabel = worldSession?.location
    ? `${worldSession.location.label} (${worldSession.location.tsid}) · T = teleport/door`
    : 'Street';
  const label = new PIXI.Text(locLabel, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 13,
    fill: theme === 'house' ? 0x3a2a18 : 0x2b3a20,
    fontWeight: '600',
  });
  label.x = 16;
  label.y = GROUND_Y + 48;
  label.alpha = 0.55;

  const layer = new PIXI.Container();
  layer.addChild(g, clouds, label);
  return layer;
}

function makeAnimated(sheetKey, { animationSpeed = 0.12, frameSlice = null, scale = SCALE } = {}) {
  let frames = textures[sheetKey].frames;
  if (frameSlice) frames = frames.slice(frameSlice[0], frameSlice[1]);
  const anim = new PIXI.AnimatedSprite(frames);
  anim.animationSpeed = animationSpeed;
  anim.anchor.set(0.5, 1);
  anim.scale.set(scale);
  anim.play();
  return anim;
}

function wheelSheetKey(phase) {
  if (phase === 'appear' || phase === 'ready') return 'wheelAppear';
  if (phase === 'disappear') return 'wheelDisappear';
  if (phase === 'spin') return 'wheelWhiteSpin';
  const match = /^(green|white|red)_(spin|end)$/.exec(phase);
  if (!match) return 'wheelAppear';
  const color = match[1][0].toUpperCase() + match[1].slice(1);
  const suffix = match[2] === 'spin' ? 'Spin' : 'End';
  return `wheel${color}${suffix}`;
}

function setSpinningWheelVisual(target, phase) {
  const sprite = target?.sprite;
  const wheel = target?.state?.wheel;
  if (!sprite || sprite.destroyed || !wheel || spinningWheelLastPhase === phase) return;
  spinningWheelLastPhase = phase;
  wheel.phase = phase;
  target.subtitle =
    phase === 'ready'
      ? 'Spin me!'
      : phase === 'spin' || phase.endsWith('_spin')
        ? 'Round and round...'
        : phase.endsWith('_end')
          ? wheel.reward?.label || 'A special prize!'
          : '';
  const sheet = textures[wheelSheetKey(phase)];
  if (!sheet?.frames?.length) return;
  sprite.textures = sheet.frames;
  sprite.onComplete = null;
  if (phase === 'ready') {
    sprite.loop = false;
    sprite.gotoAndStop(sprite.totalFrames - 1);
  } else if (phase === 'appear') {
    sprite.loop = false;
    sprite.animationSpeed = 14 / 72;
    sprite.gotoAndPlay(0);
    sprite.onComplete = () => sprite.gotoAndStop(sprite.totalFrames - 1);
  } else if (phase === 'disappear') {
    sprite.loop = false;
    sprite.animationSpeed = 18 / 36;
    sprite.gotoAndPlay(0);
  } else if (phase.endsWith('_end')) {
    sprite.loop = false;
    sprite.animationSpeed = 0.25;
    sprite.gotoAndPlay(0);
    sprite.onComplete = () => sprite.gotoAndStop(sprite.totalFrames - 1);
  } else {
    sprite.loop = true;
    sprite.animationSpeed = phase === 'spin' ? 0.38 : 0.62;
    sprite.gotoAndPlay(0);
  }
  if (app?.view) app.view.dataset.spinningWheelPhase = phase;
}

function removeSpinningWheelTarget() {
  const target = spinningWheelTarget;
  if (!target) return;
  clearHoverGlow();
  interactables = interactables.filter((entry) => entry !== target);
  if (target.sprite?.parent) target.sprite.parent.removeChild(target.sprite);
  if (target.sprite && !target.sprite.destroyed) target.sprite.destroy();
  spinningWheelTarget = null;
  spinningWheelLastPhase = '';
  spinningWheelPrompted = false;
  if (app?.view) {
    app.view.dataset.spinningWheelPhase = 'destroyed';
    app.view.dataset.spinningWheelActive = '0';
  }
}

function spawnSpinningWheel({ now = Date.now() } = {}) {
  if (!entityLayer || !player || spinningWheelTarget) return null;
  const wheel = createSpinningWheelState('player', now);
  wheel.phase = 'appear';
  const sprite = new PIXI.AnimatedSprite(textures.wheelAppear.frames);
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(0.72);
  sprite.x = clamp(player.x + 100, 95, Math.max(95, WORLD_W - 100));
  sprite.y = resolveGround(sprite.x, player.y) + 2;
  sprite.zIndex = 43;
  // The 514×450 animation cell includes transparent registration padding.
  sprite._worldHitW = 155;
  sprite._worldHitH = 215;
  entityLayer.addChild(sprite);
  spinningWheelTarget = register({
    classId: 'npc_spinning_wheel',
    label: 'Spinning Wheel',
    subtitle: '',
    sprite,
    state: { wheel },
  });
  spinningWheelLastPhase = '';
  spinningWheelPrompted = false;
  setSpinningWheelVisual(spinningWheelTarget, 'appear');
  if (app?.view) {
    app.view.dataset.spinningWheelActive = '1';
    app.view.dataset.spinningWheelOwner = wheel.ownerId;
    app.view.dataset.spinningWheelReward = '';
  }
  return spinningWheelTarget;
}

function spawnStootMemorial() {
  if (
    !entityLayer ||
    !currentStreet ||
    currentStreetTsid !== STOOT_MEMORIAL_STREET_ID ||
    stootDollTarget
  ) return null;
  const ground = resolveGround(WORLD_W * 0.5, GROUND_Y);
  const memorial = new PIXI.Container();
  memorial.x = WORLD_W * 0.5;
  memorial.y = ground - 14;
  memorial.zIndex = 7;
  memorial.eventMode = 'none';

  const shadow = new PIXI.Graphics();
  shadow.beginFill(0x111523, 0.82);
  shadow.drawEllipse(0, -77, 174, 166);
  shadow.endFill();
  const frame = new PIXI.Graphics();
  frame.lineStyle(8, 0x584028, 1);
  frame.beginFill(0x201d2b, 0.98);
  frame.drawRoundedRect(-116, -232, 232, 170, 14);
  frame.endFill();
  frame.lineStyle(2, 0xe5cc82, 0.72);
  frame.drawRoundedRect(-104, -220, 208, 146, 10);
  const glow = new PIXI.Graphics();
  glow.beginFill(0xffe6a0, 0.12);
  glow.drawEllipse(0, -145, 150, 94);
  glow.endFill();
  const portrait = PIXI.Sprite.from('assets/sprites/spinning-wheel/stoot-doll.png');
  portrait.anchor.set(0.5);
  portrait.scale.set(1.55);
  portrait.y = -150;
  const title = new PIXI.Text('STOOT', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 24,
    fill: 0xffefc2,
    fontWeight: '900',
    letterSpacing: 3,
    stroke: 0x251b17,
    strokeThickness: 4,
  });
  title.anchor.set(0.5);
  title.y = -205;
  const inscription = new PIXI.Text('An old friend, still making Ur brighter.', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 12,
    fill: 0xf5ead0,
    fontStyle: 'italic',
  });
  inscription.anchor.set(0.5);
  inscription.y = -91;
  memorial.addChild(shadow, frame, glow, portrait, title, inscription);
  entityLayer.addChild(memorial);

  const doll = PIXI.Sprite.from('assets/sprites/spinning-wheel/stoot-doll.png');
  doll.anchor.set(0.5, 1);
  doll.scale.set(1.18);
  doll.x = memorial.x - 132;
  doll.y = ground + 1;
  doll.zIndex = 44;
  doll._worldHitW = 68;
  doll._worldHitH = 76;
  entityLayer.addChild(doll);
  stootDollTarget = register({
    classId: STOOT_DOLL_ID,
    label: STOOT_DOLL_LABEL,
    subtitle: 'Pull string',
    sprite: doll,
    state: createStootDollState(),
  });
  if (app?.view) {
    app.view.dataset.stootMemorial = 'clean-cc0';
    app.view.dataset.stootDollActive = '1';
    app.view.dataset.stootDollAudio = 'source-unavailable';
  }
  return memorial;
}

function handleStootDollTarget(target, verbId, { context = 'world', animate = true } = {}) {
  if (verbId !== 'pull_string') return;
  const params = new URLSearchParams(location.search);
  const requestedIndex = params.has('stootquote')
    ? Math.max(0, Math.min(42, Math.floor(Number(params.get('stootquote')) || 0)))
    : null;
  const roll = requestedIndex === null
    ? Math.random()
    : (requestedIndex + 0.25) / 43;
  const result = pullStootDollString(target.state, { roll });
  showSpeechBubble(target, {
    speaker: STOOT_DOLL_LABEL,
    text: result.quote,
    durationMs: STOOT_DOLL_BUBBLE_MS,
  });
  pushActivity(result.activity);
  if (animate) {
    const baseScale = Number(target.sprite.baseScale) || 1.18;
    target.sprite.scale.set(baseScale * 1.08, baseScale * 0.92);
    setTimeout(() => {
      if (!target.sprite?.destroyed) target.sprite.scale.set(baseScale);
    }, 180);
  }
  if (app?.view) {
    app.view.dataset.stootDollContext = context;
    app.view.dataset.stootDollPulls = String(result.pullCount);
    app.view.dataset.stootDollQuoteIndex = String(result.index);
    app.view.dataset.stootDollQuote = result.quote;
    app.view.dataset.stootDollSoundKey = result.soundKey || '';
  }
  // The production audio keys are preserved in stoot-doll.js, but their clean
  // source files are unavailable. Never substitute compressed video audio.
}

function pullPackedStootDoll() {
  if (countItem(inv, STOOT_DOLL_ID) < 1 || !player) {
    toast('The doll is no longer in your pack.');
    return false;
  }
  const target = {
    classId: STOOT_DOLL_ID,
    label: STOOT_DOLL_LABEL,
    sprite: player,
    state: packedStootDollState,
  };
  handleStootDollTarget(target, 'pull_string', { context: 'pack', animate: false });
  toast('You pull the doll’s string.', 1800);
  return true;
}

function useGameshowTicket() {
  if (spinningWheelTarget) {
    toast('Finish this wheel before redeeming another ticket.');
    return false;
  }
  if (!removeItem(inv, GAMESHOW_TICKET_ID, 1)) {
    toast('You do not have a Gameshow Ticket.');
    return false;
  }
  const target = spawnSpinningWheel();
  if (!target) {
    addItem(inv, GAMESHOW_TICKET_ID, 1);
    toast('There is no room for the wheel here.');
    return false;
  }
  pushActivity('You used a Gameshow Ticket. A Spinning Wheel appeared!');
  toast('A Spinning Wheel appears. Give it a moment, then spin!', 3200);
  playSfx('alert', { volume: 0.42, rate: 1.12 });
  updateHud();
  return true;
}

function handleSpinningWheelTarget(target, verbId) {
  if (verbId !== 'spin') return;
  const params = new URLSearchParams(location.search);
  const colorName = String(params.get('wheelcolor') || '').toLowerCase();
  const forcedColorRoll =
    colorName === 'green' ? 0.1 : colorName === 'white' ? 0.5 : colorName === 'red' ? 0.9 : Number.NaN;
  const result = startSpinningWheel(target.state.wheel, 'player', {
    rewardRoll: params.has('wheelroll') ? Number(params.get('wheelroll')) : Math.random(),
    snoConeRoll: params.has('wheelconeroll') ? Number(params.get('wheelconeroll')) : Math.random(),
    colorRoll: Number.isFinite(forcedColorRoll)
      ? forcedColorRoll
      : params.has('wheelcolorroll')
        ? Number(params.get('wheelcolorroll'))
        : Math.random(),
    responseRoll: params.has('wheelresponseroll')
      ? Number(params.get('wheelresponseroll'))
      : Math.random(),
  });
  if (!result.ok) {
    toast(result.message || 'The wheel cannot be spun.');
    return;
  }
  target.state.wheel.phase = 'spin';
  setSpinningWheelVisual(target, 'spin');
  playSfx('spinningWheel', { volume: 0.72 });
  pushActivity('You spin the Spinning Wheel. Round and round it goes!');
  if (app?.view) {
    app.view.dataset.spinningWheelColor = result.color;
    app.view.dataset.spinningWheelReward = result.reward.kind === 'currants'
      ? `${result.reward.amount}:currants`
      : `${result.reward.amount}:${result.reward.classTsid}`;
    app.view.dataset.spinningWheelTier = String(result.tier);
  }
}

function updateSpinningWheel() {
  const target = spinningWheelTarget;
  const wheel = target?.state?.wheel;
  if (!target || !wheel) return;
  const now = Date.now();
  const phase = spinningWheelPhase(wheel, now);
  wheel.phase = phase;
  setSpinningWheelVisual(target, phase);
  if (phase === 'ready' && !spinningWheelPrompted) {
    spinningWheelPrompted = true;
    showSpeechBubble(target, {
      speaker: 'Spinning Wheel',
      text: spinMeResponse(new URLSearchParams(location.search).has('wheelpromptroll')
        ? Number(new URLSearchParams(location.search).get('wheelpromptroll'))
        : Math.random()),
      durationMs: 4_800,
    });
  }
  if (phase.endsWith('_end') && !wheel.rewardApplied) {
    const result = applySpinningWheelReward(wheel, inv, pc);
    if (result.ok) {
      showSpeechBubble(target, {
        speaker: 'Spinning Wheel',
        text: `${result.response} ${result.label}!`,
        durationMs: 5_800,
      });
      pushActivity(`The Spinning Wheel awards ${result.label}. ${result.response}`);
      toast(`You won ${result.label}!`, 4200);
      floatText(target.sprite.x, target.sprite.y - 170, result.label, 0xffdc5e);
      burst(target.sprite.x, target.sprite.y - 90, 0xffdc5e, result.tier === 4 ? 32 : 18);
      playSfx(result.tier === 4 ? 'quest' : 'pickup', {
        volume: result.tier === 4 ? 0.76 : 0.58,
        rate: result.tier === 1 ? 0.86 : 1.08,
      });
      if (app?.view) {
        app.view.dataset.spinningWheelAwarded = result.label;
        app.view.dataset.spinningWheelRewardApplied = '1';
      }
      updateHud();
    }
  }
  if (phase === 'destroyed') removeSpinningWheelTarget();
}

function makePlayer() {
  // Clothed Glitch avatar — optionally recolored by character builder.
  const pack = getAppearanceTextures(playerAppearance);
  const walkFrames = pack.walkFrames;
  const idleFrame = pack.idleFrame;
  const body = new PIXI.AnimatedSprite(walkFrames);
  body.texturesIdle = [idleFrame];
  body.texturesWalk = walkFrames;
  body.animationSpeed = 0.18;
  body.loop = true;
  body.gotoAndStop(0);
  body.anchor.set(0.5, 1);
  // Portrait ~172×248; keep a bit under entity scale so pigs/chickens read correctly.
  body.baseScale = SCALE * 0.42;
  // Pixi AnimatedSprite advances by animationSpeed * delta each tick
  body.autoUpdate = true;
  // Art faces left; start facing right via flip so first movement looks correct
  body.facing = 'right';
  body.scale.set(facingScaleX(body.baseScale, body.facing), body.baseScale);
  body.x = 200;
  body.y = GROUND_Y + 2;
  body.vx = 0;
  body.vy = 0;
  body.onGround = true;
  body.zIndex = 50;
  body.walkPhase = 0;
  body.animState = 'idle';
  body.textures = body.texturesIdle;
  body.gotoAndStop(0);
  body.appearanceKey = pack.key;
  return body;
}

function makeLocalCompanion(profile) {
  const appearance =
    APPEARANCE_PRESETS[profile.preset]?.appearance ||
    APPEARANCE_PRESETS.classic.appearance;
  const pack = getAppearanceTextures(appearance);
  const root = new PIXI.Container();
  const body = new PIXI.AnimatedSprite(pack.walkFrames);
  body.texturesIdle = [pack.idleFrame];
  body.texturesWalk = pack.walkFrames;
  body.anchor.set(0.5, 1);
  body.baseScale = SCALE * 0.39;
  body.facing = profile.gatherOffset < 0 ? 'right' : 'left';
  body.scale.set(facingScaleX(body.baseScale, body.facing), body.baseScale);
  body.textures = body.texturesIdle;
  body.animationSpeed = 0.16;
  body.loop = true;
  body.autoUpdate = false;
  body.gotoAndStop(0);
  body.animState = 'idle';

  const name = new PIXI.Text(profile.name, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 12,
    fill: 0x4e4943,
    fontWeight: '700',
    dropShadow: true,
    dropShadowColor: 0xffffff,
    dropShadowAlpha: 0.92,
    dropShadowBlur: 2,
    dropShadowDistance: 0,
  });
  name.anchor.set(0.5, 1);
  name.y = -104;
  const plate = new PIXI.Graphics();
  plate.beginFill(0xfffdf5, 0.82);
  plate.lineStyle(1, profile.color, 0.64);
  plate.drawRoundedRect(
    -Math.ceil(name.width / 2) - 7,
    name.y - name.height - 4,
    Math.ceil(name.width) + 14,
    Math.ceil(name.height) + 7,
    7
  );
  plate.endFill();
  plate.alpha = 0.72;

  root.addChild(body, plate, name);
  root.zIndex = 49;
  root.eventMode = 'none';
  root._companionBody = body;
  root._namePlate = plate;
  root._profile = profile;
  return root;
}

function setLocalCompanionAnim(actor, state) {
  const body = actor?.body;
  if (!body || body.destroyed || body.animState === state) return;
  body.animState = state;
  if (state === 'walk') {
    body.textures = body.texturesWalk;
    body.autoUpdate = true;
    body.gotoAndPlay(0);
  } else {
    body.textures = body.texturesIdle;
    body.autoUpdate = false;
    body.gotoAndStop(0);
  }
}

function publishCompanionFollowState() {
  if (!app?.view) return;
  const followee = companionFollowState.active
    ? localCompanionTarget(companionFollowState.followee)
    : null;
  app.view.dataset.followActive = companionFollowState.active ? '1' : '0';
  app.view.dataset.followee = companionFollowState.followee || '';
  app.view.dataset.followStreets = String(companionFollowState.streetsFollowed || 0);
  app.view.dataset.followVisited = companionFollowState.visitedStreets.join(',');
  app.view.dataset.followDistance = followee?.sprite && player
    ? String(Math.round(Math.abs(followee.sprite.x - player.x)))
    : '';
  app.view.dataset.followAchievement = achieveState.unlocked.includes(STALKER_ACHIEVEMENT_ID)
    ? 'unlocked'
    : companionFollowState.achievementAwarded
      ? 'already-awarded'
      : 'pending';
}

function syncLocalCompanionFollowActors() {
  for (const actor of localCompanions) {
    const following = companionFollowState.active && actor.name === companionFollowState.followee;
    actor.state ||= {};
    actor.state.following = following;
    actor.state.followee = companionFollowState.followee || '';
    actor.subtitle = following
      ? `You are following ${actor.name}`
      : 'Another Glitch';
    actor.sprite._following = following;
    if (actor.sprite._namePlate) {
      actor.sprite._namePlate.alpha = following ? 1 : 0.72;
      actor.sprite._namePlate.tint = following ? 0xfff0a6 : 0xffffff;
    }
  }
  publishCompanionFollowState();
}

function handleLocalCompanionTarget(target, verbId) {
  if (target?.classId !== 'pc_local') return false;
  let result;
  if (verbId === 'follow') {
    result = startCompanionFollow(companionFollowState, target.name || target.label, {
      distance: interactDistance(target, player?.x, player?.y),
      streetTsid: currentStreetTsid,
    });
    if (result.ok) {
      target.socialTargetX = localCompanionGatherTarget(target.name, player?.x, WORLD_W);
      target.socialUntil = Date.now() + 5000;
    }
  } else if (verbId === 'stop_following') {
    result = stopCompanionFollow(companionFollowState);
  } else {
    return false;
  }
  if (result.activity) {
    pushActivity(result.activity);
    toast(result.activity, result.ok ? 2800 : 3400);
  }
  syncLocalCompanionFollowActors();
  return true;
}

function countCompanionFollowStreet(streetTsid) {
  if (!companionFollowState.active) {
    publishCompanionFollowState();
    return;
  }
  const result = recordCompanionFollowStreet(companionFollowState, streetTsid);
  syncLocalCompanionFollowActors();
  if (!result.achievementReady) return;
  companionFollowState.achievementAwarded = true;
  const unlocked = unlockAchievement(achieveState, STALKER_ACHIEVEMENT_ID, pc);
  if (unlocked.ok) {
    announceAchievementUpdates([{
      classTsid: STALKER_ACHIEVEMENT_ID,
      unlocked: true,
      rewards: unlocked.rewards,
      def: unlocked.def,
    }]);
    savePlayerState();
  }
  publishCompanionFollowState();
}

function stopCompanionFollowForInstance() {
  if (!companionFollowState.active) return;
  const result = stopCompanionFollow(companionFollowState);
  if (result.activity) pushActivity(result.activity);
  publishCompanionFollowState();
}

function spawnLocalCompanions() {
  if (!entityLayer || !player || !currentStreet) return [];
  localCompanions = planLocalCompanionSpawns(player.x, WORLD_W).map((plan, index) => {
    const sprite = makeLocalCompanion(plan);
    sprite.x = plan.x;
    // Spawn at the player's level: the ground beneath the player's feet at x.
    const spawnGround = groundBeneath(streetPlatforms, plan.x, player.y - 60, 0);
    sprite.y = spawnGround?.y ?? resolveGround(plan.x, player.y);
    const homePlatform = spawnGround?.platform || null;
    const actor = {
      name: plan.name,
      label: plan.name,
      classId: 'pc_local',
      sprite,
      body: sprite._companionBody,
      state: {
        following: companionFollowState.active && companionFollowState.followee === plan.name,
        followee: companionFollowState.followee || '',
      },
      homeX: plan.x,
      // Idle wandering stays on the spawn platform, like a Glitch chatting nearby.
      homeMinX: homePlatform ? Math.min(homePlatform.x1, homePlatform.x2) + 24 : 42,
      homeMaxX: homePlatform ? Math.max(homePlatform.x1, homePlatform.x2) - 24 : WORLD_W - 42,
      wanderRange: plan.wanderRange,
      wanderDirection: index % 2 ? -1 : 1,
      wanderTargetX: plan.x,
      nextWanderAt: Date.now() + 1400 + index * 650,
      socialTargetX: null,
      socialUntil: 0,
      speakingUntil: 0,
    };
    entityLayer.addChild(sprite);
    register(actor);
    return actor;
  });
  if (app?.view) {
    app.view.dataset.localCompanionCount = String(localCompanions.length);
    app.view.dataset.localCompanionNames = localCompanions.map((actor) => actor.name).join(',');
    app.view.dataset.localCompanionArt = 'clean-avatar-sheets';
  }
  syncLocalCompanionFollowActors();
  return localCompanions;
}

function localCompanionTarget(name) {
  return localCompanions.find((actor) => actor.name === name) || null;
}

function gatherLocalCompanions(durationMs = 12_000) {
  const until = Date.now() + durationMs;
  for (const actor of localCompanions) {
    actor.socialTargetX = localCompanionGatherTarget(
      actor.name,
      player?.x,
      WORLD_W
    );
    actor.socialUntil = until;
  }
}

function showLocalCompanionSpeech(name, text, opts = {}) {
  const actor = localCompanionTarget(name);
  if (!actor || !text) return null;
  actor.socialTargetX = localCompanionGatherTarget(name, player?.x, WORLD_W);
  actor.socialUntil = Date.now() + Math.max(2_500, Number(opts.durationMs) || 7_200);
  actor.speakingUntil = actor.socialUntil;
  if (app?.view) {
    app.view.dataset.localCompanionSpeaker = name;
    app.view.dataset.localCompanionSpeech = String(text).slice(0, 180);
  }
  return showSpeechBubble(actor, {
    speaker: name,
    text,
    durationMs: opts.durationMs || 7_200,
  });
}

function updateLocalCompanions(dt) {
  const now = Date.now();
  for (const actor of localCompanions) {
    const sprite = actor.sprite;
    const body = actor.body;
    if (!sprite || sprite.destroyed || !body || body.destroyed) continue;
    let targetX;
    if (now < actor.socialUntil && Number.isFinite(actor.socialTargetX)) {
      targetX = actor.socialTargetX;
    } else {
      actor.socialTargetX = null;
      if (now >= actor.nextWanderAt) {
        actor.wanderDirection *= -1;
        actor.wanderTargetX = clamp(
          actor.homeX + actor.wanderDirection * actor.wanderRange,
          Math.max(42, actor.homeMinX ?? 42),
          Math.max(42, Math.min(WORLD_W - 42, actor.homeMaxX ?? WORLD_W - 42))
        );
        actor.nextWanderAt = now + 3600 + actor.wanderRange * 18;
      }
      targetX = actor.wanderTargetX;
    }
    const motion = approachCompanionX(
      sprite.x,
      targetX,
      dt,
      now < actor.socialUntil ? 2.25 : 0.72
    );
    sprite.x = motion.x;
    // Companions use their own ground rule, not the player's vertical velocity:
    // gentle rises only, otherwise drop to the platform beneath.
    const ground = groundBeneath(streetPlatforms, sprite.x, sprite.y)?.y ?? GROUND_Y;
    sprite.y += (ground - sprite.y) * Math.min(1, 0.32 * dt);
    if (Math.abs(motion.vx) > 0.05) {
      body.facing = facingFromVelocity(motion.vx, body.facing || 'right');
      body.scale.x = facingScaleX(body.baseScale, body.facing);
      body.scale.y = body.baseScale;
      setLocalCompanionAnim(actor, 'walk');
    } else {
      if (now < actor.socialUntil && player) {
        body.facing = sprite.x < player.x ? 'right' : 'left';
        body.scale.x = facingScaleX(body.baseScale, body.facing);
      }
      setLocalCompanionAnim(actor, 'idle');
    }
    sprite._namePlate.alpha =
      actor.state?.following || now < actor.speakingUntil ? 1 : 0.72;
  }
  if (app?.view && localCompanions.length) {
    app.view.dataset.localCompanionPositions = localCompanions
      .map((actor) => `${actor.name}:${Math.round(actor.sprite.x)},${Math.round(actor.sprite.y)}`)
      .join('|');
  }
  publishCompanionFollowState();
}

/** @type {Map<string, { idleFrame: PIXI.Texture, walkFrames: PIXI.Texture[], key: string }>} */
const appearanceTexCache = new Map();

/**
 * Build (or fetch cached) idle + walk textures for an appearance via canvas recolor.
 * @param {import('./js/character-builder.js').Appearance} appearance
 */
function getAppearanceTextures(appearance) {
  const app = normalizeAppearance(appearance);
  const key = appearanceCacheKey(app);
  if (appearanceTexCache.has(key)) return appearanceTexCache.get(key);

  const sheets = resolveBodySheets(app);
  const isDefaultClassic =
    key === appearanceCacheKey(createDefaultAppearance()) && app.bodyStyle === 'classic';

  // Default classic look uses preloaded sheets (no recolor cost)
  if (isDefaultClassic && textures.avatarStyledWalk?.frames?.length) {
    const pack = {
      key,
      idleFrame: textures.avatarStyledIdle.frames[0],
      walkFrames: textures.avatarStyledWalk.frames,
    };
    appearanceTexCache.set(key, pack);
    return pack;
  }

  // Recolor base bitmaps (must already be in PIXI loader / Image cache)
  const idleBase = textures.avatarStyledIdle?.frames?.[0];
  const walkBase = textures.avatarStyledWalk;
  if (!idleBase) {
    // Fallback if sheets not loaded
    const blank = PIXI.Texture.WHITE;
    const pack = { key, idleFrame: blank, walkFrames: [blank] };
    appearanceTexCache.set(key, pack);
    return pack;
  }

  // Use HTMLImageElement sources when possible
  const idleImg = idleBase.baseTexture?.resource?.source;
  let idleFrame = recolorTextureFromImage(idleImg || idleBase, app, {
    whole: true,
  });

  let walkFrames;
  if (app.bodyStyle === 'alt') {
    // Single-frame alt body for walk until a walk strip exists
    const altTex = textures.avatarStyledAlt?.frames?.[0] || idleFrame;
    const altImg = altTex.baseTexture?.resource?.source;
    const recolored = recolorTextureFromImage(altImg || altTex, app, { whole: true });
    idleFrame = recolored;
    walkFrames = [recolored, recolored, recolored, recolored, recolored, recolored, recolored, recolored];
  } else {
    const walkImg =
      walkBase?.frames?.[0]?.baseTexture?.resource?.source ||
      walkBase?.baseTexture?.resource?.source;
    // Full strip recolor then slice frames
    const stripTex = recolorTextureFromImage(walkImg || idleImg, app, {
      whole: true,
      forceSize: walkImg
        ? { w: walkImg.width || walkImg.naturalWidth, h: walkImg.height || walkImg.naturalHeight }
        : null,
    });
    const fw = AVATAR_SHEETS.walk.fw;
    const fh = AVATAR_SHEETS.walk.fh;
    const cols = AVATAR_SHEETS.walk.cols;
    walkFrames = [];
    const base = stripTex.baseTexture;
    for (let i = 0; i < cols; i++) {
      walkFrames.push(
        new PIXI.Texture(base, new PIXI.Rectangle(i * fw, 0, fw, fh))
      );
    }
    // Also recolor idle from idle image specifically
    idleFrame = recolorTextureFromImage(idleImg, app, { whole: true });
  }

  const pack = { key, idleFrame, walkFrames };
  appearanceTexCache.set(key, pack);
  return pack;
}

/**
 * @param {CanvasImageSource|PIXI.Texture} source
 * @param {import('./js/character-builder.js').Appearance} appearance
 * @param {{ whole?: boolean, forceSize?: { w: number, h: number }|null }} [opts]
 */
function recolorTextureFromImage(source, appearance, opts = {}) {
  let img = source;
  if (source && source.baseTexture) {
    img = source.baseTexture.resource?.source || source;
  }
  const w =
    opts.forceSize?.w ||
    img.naturalWidth ||
    img.width ||
    source?.width ||
    172;
  const h =
    opts.forceSize?.h ||
    img.naturalHeight ||
    img.height ||
    source?.height ||
    248;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  try {
    ctx.drawImage(img, 0, 0, w, h);
  } catch {
    // CORS or bad source — return original if Texture
    if (source?.baseTexture) return source;
    return PIXI.Texture.from(canvas);
  }
  const imageData = ctx.getImageData(0, 0, w, h);
  recolorImageData(imageData.data, w, h, appearance);
  ctx.putImageData(imageData, 0, 0);
  return PIXI.Texture.from(canvas);
}

/** Apply current playerAppearance to the live player sprite. */
function applyPlayerAppearance() {
  if (!player) return;
  const pack = getAppearanceTextures(playerAppearance);
  if (player.appearanceKey === pack.key) return;
  const was = player.animState || 'idle';
  player.texturesIdle = [pack.idleFrame];
  player.texturesWalk = pack.walkFrames;
  player.appearanceKey = pack.key;
  if (was === 'walk' || was === 'climb') {
    player.textures = player.texturesWalk;
    player.play();
  } else {
    player.textures = player.texturesIdle;
    player.gotoAndStop(0);
  }
  applyPlayerFacing();
}

// —— Character builder UI ——
function isAvatarOpen() {
  const p = document.getElementById('avatar-panel');
  return p && !p.hidden;
}

function openAvatarPanel() {
  closeFeatPanel();
  if (isShrineOpen()) closeShrinePanel();
  closeMap();
  closeQuestPanel();
  closeAchievePanel();
  closeSkillsPanel();
  closeBuffsPanel();
  closeVendor();
  closeMakePanel();
  closeGardenPanel();
  const panel = document.getElementById('avatar-panel');
  if (!panel) return;
  panel.hidden = false;
  renderAvatarBuilder();
  paintAvatarPreview();
}

function closeAvatarPanel() {
  const panel = document.getElementById('avatar-panel');
  if (panel) panel.hidden = true;
}

function renderAvatarBuilder() {
  const presetsEl = document.getElementById('avatar-presets');
  if (presetsEl && !presetsEl.dataset.ready) {
    presetsEl.dataset.ready = '1';
    for (const p of Object.values(APPEARANCE_PRESETS)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-preset-chip';
      btn.textContent = p.label;
      btn.dataset.preset = p.id;
      btn.addEventListener('click', () => {
        playerAppearance = normalizeAppearance(p.appearance);
        renderAvatarSwatches();
        paintAvatarPreview();
        presetsEl.querySelectorAll('.avatar-preset-chip').forEach((c) => {
          c.classList.toggle('active', c.dataset.preset === p.id);
        });
      });
      presetsEl.appendChild(btn);
    }
  }

  document.querySelectorAll('.avatar-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.slot === avatarBuilderSlot);
  });
  renderAvatarSwatches();
}

function renderAvatarSwatches() {
  const box = document.getElementById('avatar-swatches');
  if (!box) return;
  const slot = avatarBuilderSlot;
  const list = COLOR_SWATCHES[slot] || COLOR_SWATCHES.hair;
  const current = playerAppearance[slot] || playerAppearance.hair;
  box.innerHTML = '';
  for (const s of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-swatch';
    btn.style.background = `rgb(${s.rgb.r},${s.rgb.g},${s.rgb.b})`;
    btn.title = s.label;
    btn.setAttribute('aria-label', s.label);
    const match =
      current.r === s.rgb.r && current.g === s.rgb.g && current.b === s.rgb.b;
    if (match) btn.classList.add('active');
    const lab = document.createElement('span');
    lab.className = 'sw-label';
    lab.textContent = s.label;
    btn.appendChild(lab);
    btn.addEventListener('click', () => {
      playerAppearance = normalizeAppearance({
        ...playerAppearance,
        [slot]: { ...s.rgb },
      });
      if (slot === 'shirt') {
        playerAppearance.shirtDark = {
          r: Math.round(s.rgb.r * 0.25),
          g: Math.round(s.rgb.g * 0.25),
          b: Math.round(s.rgb.b * 0.3),
        };
      }
      renderAvatarSwatches();
      paintAvatarPreview();
    });
    box.appendChild(btn);
  }
}

function paintAvatarPreview() {
  const canvas = document.getElementById('avatar-preview');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const sheets = resolveBodySheets(playerAppearance);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    canvas.width = 172;
    canvas.height = 248;
    ctx.clearRect(0, 0, 172, 248);
    // Draw centered, cover height
    const scale = Math.min(172 / img.width, 248 / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (172 - dw) / 2, (248 - dh) / 2, dw, dh);
    const id = ctx.getImageData(0, 0, 172, 248);
    recolorImageData(id.data, 172, 248, playerAppearance);
    ctx.putImageData(id, 0, 0);
  };
  img.onerror = () => {
    ctx.fillStyle = '#ccc';
    ctx.fillRect(0, 0, 172, 248);
  };
  img.src = sheets.idleUrl + '?v=1';
}

function commitAvatarAppearance() {
  playerAppearance = normalizeAppearance(playerAppearance);
  saveAppearance(playerAppearance);
  applyPlayerAppearance();
  updateHud();
  pushActivity('You admire your new look in a puddle.');
  toast('Look saved.');
  closeAvatarPanel();
}

function setPlayerAnim(state) {
  if (!player) return;
  if (player.animState === state) {
    // Keep walk cycling if something stopped the AnimatedSprite
    if (state === 'walk' && player.playing === false) player.play();
    if (state === 'climb' && player.playing === false) player.play();
    return;
  }
  player.animState = state;
  if (state === 'walk') {
    player.textures = player.texturesWalk;
    player.animationSpeed = 0.18;
    player.loop = true;
    player.autoUpdate = true;
    player.gotoAndPlay(0);
  } else if (state === 'climb') {
    // No dedicated climb sheet yet (Flash had avatarContainer climb frames).
    // Reuse walk frames at a slower rate for a climb read.
    player.textures = player.texturesWalk;
    player.animationSpeed = 0.12;
    player.loop = true;
    player.autoUpdate = true;
    player.gotoAndPlay(0);
  } else {
    player.textures = player.texturesIdle;
    player.loop = false;
    player.autoUpdate = false;
    player.gotoAndStop(0);
  }
  // Re-apply facing after texture swap (Pixi can reset scale edge cases)
  applyPlayerFacing();
}

function startClimb(wallHit) {
  if (!player || !wallHit) return;
  clearJumpQueue(jumpState);
  climb.active = true;
  climb.wall = wallHit.wall;
  player.x = wallHit.x;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  noteGrounded(jumpState, false, movementNow());
  player.climbing = true;
  setPlayerAnim('climb');
}

function stopClimb({ jumpOff = false, side = 0 } = {}) {
  if (!climb.active && !player?.climbing) return;
  climb.active = false;
  climb.wall = null;
  if (player) {
    player.climbing = false;
    if (jumpOff) {
      player.vy = -7.2;
      player.vx = side * 3.2;
      player.onGround = false;
    }
    setPlayerAnim(Math.abs(player.vx) > 0.35 ? 'walk' : 'idle');
  }
}

function applyPlayerFacing() {
  if (!player) return;
  player.facing = facingFromVelocity(player.vx, player.facing || 'right');
  const sx = facingScaleX(player.baseScale, player.facing);
  player.scale.set(sx, Math.abs(player.baseScale));
}

function register(target) {
  interactables.push(target);
  wireInteractableSprite(target);
  return target;
}

/**
 * Badge progress plus the feature event stream: every counter the game emits
 * also reaches features (quest offers advance from these).
 */
function applyAchievementProgress(state, counter, amount = 1, pcRef = pc) {
  const updates = applyAchievementProgressRaw(state, counter, amount, pcRef);
  features.event(counter, amount, engine);
  return updates;
}

/** Quest-only game events (no badge counter of their own). */
function emitGameEvent(counter, amount = 1) {
  features.event(counter, amount, engine);
}

function unregisterTarget(target) {
  if (!target) return;
  if (hoverTarget === target) clearHoverGlow();
  interactables = interactables.filter((entry) => entry !== target);
  if (target.sprite?.parent) target.sprite.parent.removeChild(target.sprite);
  if (target.sprite && !target.sprite.destroyed) target.sprite.destroy({ children: true });
}

// —— Feature modules (js/feature-host.js) ——
// Each feature lives in one file and reaches the world only through `engine`.
const features = createFeatureHost([questFlagsFeature, hellFeature, resourceNodesFeature, questOffersFeature]);

function anyTransientInstance() {
  return [
    deEmbiggenifyIsInstanced,
    fourLetterIsInstanced,
    greedyStreetIsInstanced,
    hogHaulIsInstanced,
    legalizeIsInstanced,
    paradiseIsInstanced,
    rookMuseumIsInstanced,
    rookWoodsIsInstanced,
    summersDayIsInstanced,
    winterWalkIsInstanced,
  ].some((isInstanced) => isInstanced());
}

/** The engine API features use instead of reaching into game.js state. */
const engine = {
  PIXI,
  get started() {
    return state.started === true;
  },
  get entityLayer() {
    return entityLayer;
  },
  get fxLayer() {
    return fxLayer;
  },
  get player() {
    return player;
  },
  get pc() {
    return pc;
  },
  get inv() {
    return inv;
  },
  get street() {
    return currentStreet;
  },
  get streetTsid() {
    return currentStreetTsid;
  },
  get groundY() {
    return GROUND_Y;
  },
  get worldW() {
    return WORLD_W;
  },
  get population() {
    return currentStreetPopulation;
  },
  get toolState() {
    return toolState;
  },
  get learnedSkills() {
    return skillState.learned || [];
  },
  get unlockedAchievements() {
    return achieveState.unlocked || [];
  },
  get questState() {
    return questState;
  },
  activeBuffIds() {
    return Object.keys(buffState.active || {});
  },
  award: (payload) => enqueueAward(payload),
  busy() {
    return Boolean(
      currentAction ||
        menuTarget ||
        isQuestDialogueOpen() ||
        isScreenFxBlocking() ||
        anyTransientInstance() ||
        homeIsInstanced()
    );
  },
  questDialogueOpen: () => isQuestDialogueOpen(),
  /** A quest offer: the recovered beats, then accept / decline. */
  offerQuestDialogue({ title, kicker, beats, acceptLabel, declineLabel, onAccept, onDecline }) {
    openScriptedQuestDialogue({
      title,
      kicker,
      beats: beats?.length ? beats : [{ text: title, response: acceptLabel || 'OK' }],
      onComplete: onAccept,
      onCancel: onDecline,
      cancelable: true,
      primaryLabel: acceptLabel || 'OK',
      cancelLabel: declineLabel || 'Not right now',
    });
  },
  /** QA autoplay: step through the open offer's beats and accept it. */
  acceptOpenOffer() {
    let guard = 20;
    while (isQuestDialogueOpen() && guard > 0) {
      advanceQuestDialogue();
      guard -= 1;
    }
  },
  get platforms() {
    return streetPlatforms;
  },
  /** Planner points for a group a feature requested via placementGroups(). */
  placement(key) {
    return currentStreetPlacement?.groups?.[key] || [];
  },
  /** Persistent per-street object owned by one feature (saved with the world). */
  streetSlot(featureId, tsid = currentStreetTsid) {
    const street = streetWorldState(tsid);
    street.features ||= {};
    street.features[featureId] ||= {};
    return street.features[featureId];
  },
  floatText: (x, y, text, color) => floatText(x, y, text, color),
  /** updateHud re-renders both pack rows. */
  refreshPack: () => updateHud(),
  register,
  unregister: unregisterTarget,
  toast,
  pushActivity,
  updateHud,
  playSfx,
  playSynth: playSynthSfx,
  save: () => savePlayerState(),
  setData(key, value) {
    if (app?.view) app.view.dataset[key] = String(value);
  },
  param(name) {
    return new URLSearchParams(location.search).get(name);
  },
  achievement(counter, amount = 1) {
    announceAchievementUpdates(applyAchievementProgress(achieveState, counter, amount, pc));
  },
  /** Grant a condition-less badge outright (rewards from the catalog). */
  grantAchievement(classTsid) {
    const unlocked = unlockAchievement(achieveState, classTsid, pc);
    if (!unlocked.ok) return false;
    announceAchievementUpdates([{ classTsid, unlocked: true, rewards: unlocked.rewards, def: unlocked.def }]);
    return true;
  },
  questFlag(flag) {
    questFlagsFeature.set(flag);
  },
  prompt({ title = '', kicker = '', text = '' } = {}) {
    openScriptedQuestDialogue({
      title,
      kicker,
      beats: [{ text, response: 'OK' }],
      cancelable: true,
    });
  },
  stopFollowing: () => stopCompanionFollowForInstance(),
  transientInstance: anyTransientInstance,
  homeContext() {
    return { inHome: homeIsInstanced(), room: homeState.room || 'street' };
  },
  streetExists(tsid) {
    if (tsid === HOME_STREET_TSID || tsid === HOME_INTERIOR_TSID) return homeState.owned === true;
    return Boolean(resolveIndexTsid(tsid));
  },
  /** Feature-driven travel: home rooms, ordinary streets, gate bypass. */
  async enter(tsid, opts = {}) {
    if (tsid === HOME_STREET_TSID || tsid === HOME_INTERIOR_TSID) {
      homeState.inHome = true;
      homeState.room = tsid === HOME_INTERIOR_TSID ? 'interior' : 'street';
      await renderHomeScene(homeState.room, { spawnX: opts.spawnX });
      return;
    }
    if (homeIsInstanced()) homeState.inHome = false;
    const resolved = resolveIndexTsid(tsid) || tsid;
    await enterStreetWithTransition(resolved, opts);
  },
};

function streetWorldState(tsid = currentStreetTsid) {
  const key = String(tsid || currentStreetTsid);
  if (!persistentWorldState.streets[key]) {
    persistentWorldState.streets[key] = {
      gardens: {},
      trees: [],
      rocks: [],
      collectedApples: [],
      collectedQuoins: [],
    };
  }
  const street = persistentWorldState.streets[key];
  street.gardens ||= {};
  street.trees ||= [];
  street.rocks ||= [];
  street.collectedApples ||= [];
  street.collectedQuoins ||= [];
  return street;
}

function collectNaturalIndex(kind, index) {
  if (!Number.isInteger(index) || index < 0) return;
  const key = kind === 'quoin' ? 'collectedQuoins' : 'collectedApples';
  const values = streetWorldState()[key];
  if (!values.includes(index)) values.push(index);
  values.sort((a, b) => a - b);
}

function syncAnimalWorldState() {
  const animals = {};
  for (const [key, row] of animalStateCache.entries()) animals[key] = row;
  persistentWorldState.animals = animals;
  return persistentWorldState;
}

function restoreAnimalStateCache() {
  animalStateCache.clear();
  for (const [key, row] of Object.entries(persistentWorldState.animals || {})) {
    if (!row?.classId) continue;
    const restored = { classId: row.classId, state: createAnimalState(row.classId, row.state) };
    animalStateCache.set(key, restored);
    persistentWorldState.animals[key] = restored;
  }
}

function animalStateFor(classId, index) {
  const key = `${currentStreetTsid}:${classId}:${index}`;
  if (!animalStateCache.has(key)) {
    const saved = persistentWorldState.animals?.[key];
    const row = { classId, state: createAnimalState(classId, saved?.state) };
    animalStateCache.set(key, row);
    persistentWorldState.animals[key] = row;
  }
  return animalStateCache.get(key).state;
}

function spawnPiggies(xs) {
  const list = [];
  (xs !== undefined ? xs : [380, 700, 1100, 1500, 1900]).forEach((x, i) => {
    const spr = makeAnimated('piggyWalk', {
      animationSpeed: 0.14,
      frameSlice: [0, 8],
      scale: ENTITY_SCALE.piggy,
    });
    spr.baseScale = ENTITY_SCALE.piggy;
    spr.x = x;
    spr.y = GROUND_Y + 2;
    spr.vx = (i % 2 === 0 ? 1 : -1) * 0.45;
    spr.baseX = x;
    spr.range = 90;
    spr.zIndex = 20;
    spr.playPet = (durationMs = 0) => {
      const actionFrames = textures.piggyNibble.frames.slice(0, 10);
      spr.textures = actionFrames;
      spr.loop = false;
      spr.animationSpeed = durationMs > 0
        ? clamp(actionFrames.length / (60 * (durationMs / 1000)), 0.025, 0.3)
        : 0.18;
      spr.gotoAndPlay(0);
      spr.onComplete = () => {
        spr.loop = true;
        spr.textures = textures.piggyWalk.frames.slice(0, 8);
        spr.animationSpeed = 0.14;
        spr.gotoAndPlay(0);
        spr.onComplete = null;
      };
    };
    spr.playNibble = spr.playPet;
    entityLayer.addChild(spr);
    list.push(spr);
    const animalState = animalStateFor('npc_piggy', i);
    register({
      classId: 'npc_piggy',
      label: 'Piggy',
      subtitle: animalStatusLabel('npc_piggy', animalState),
      sprite: spr,
      state: animalState,
    });
  });
  return list;
}

function spawnChickens(xs) {
  const list = [];
  (xs !== undefined ? xs : [520, 1200, 1750]).forEach((x, i) => {
    const spr = makeAnimated('chickenWalk', {
      animationSpeed: 0.12,
      frameSlice: [0, 6],
      scale: ENTITY_SCALE.chicken,
    });
    spr.baseScale = ENTITY_SCALE.chicken;
    spr.x = x;
    spr.y = GROUND_Y + 2;
    spr.vx = i % 2 ? -0.5 : 0.5;
    spr.baseX = x;
    spr.range = 100;
    spr.zIndex = 18;
    spr.playSqueeze = (durationMs = 0) => {
      const actionFrames = textures.chickenPeck.frames.slice(0, 6);
      spr.textures = actionFrames;
      spr.loop = false;
      spr.animationSpeed = durationMs > 0
        ? clamp(actionFrames.length / (60 * (durationMs / 1000)), 0.025, 0.3)
        : 0.16;
      spr.gotoAndPlay(0);
      spr.onComplete = () => {
        spr.loop = true;
        spr.textures = textures.chickenWalk.frames.slice(0, 6);
        spr.animationSpeed = 0.12;
        spr.gotoAndPlay(0);
        spr.onComplete = null;
      };
    };
    entityLayer.addChild(spr);
    list.push(spr);
    const animalState = animalStateFor('npc_chicken', i);
    register({
      classId: 'npc_chicken',
      label: 'Chicken',
      subtitle: animalStatusLabel('npc_chicken', animalState),
      sprite: spr,
      state: animalState,
    });
  });
  return list;
}

function spawnButterflies(xs, flyingSpots) {
  const list = [];
  const restFrames = textures.butterflyRest.frames;
  // Resting on the path — same native sheet family + scale as flyers (not the old upscaled 39px crop).
  (xs !== undefined ? xs : [450, 980, 1450, 2000]).forEach((x, i) => {
    const spr = new PIXI.Sprite(restFrames[i % restFrames.length] || restFrames[0]);
    spr.anchor.set(0.5, 1);
    spr.baseScale = ENTITY_SCALE.butterfly;
    spr.scale.set(ENTITY_SCALE.butterfly);
    spr.x = x;
    spr.y = GROUND_Y + 2;
    spr.zIndex = 22;
    spr.bob = i;
    spr._ambient = false;
    entityLayer.addChild(spr);
    list.push(spr);
    const animalState = animalStateFor('npc_butterfly', i);
    register({
      classId: 'npc_butterfly',
      label: 'Butterfly',
      subtitle: animalStatusLabel('npc_butterfly', animalState),
      sprite: spr,
      airborne: false,
      state: animalState,
    });
  });
  // Flying butterflies — also interactable (Enter when near, or click). Same scale as rest.
  const frames = textures.butterfly.frames.slice(0, 14);
  const flyPlan = flyingSpots !== undefined
    ? flyingSpots
    : Array.from({ length: 5 }, (_, i) => ({
        x: 250 + i * 400,
        y: GROUND_Y - 90 - (i % 3) * 22,
      }));
  for (let i = 0; i < flyPlan.length; i++) {
    const spot = flyPlan[i] || {};
    const b = new PIXI.AnimatedSprite(frames);
    b.animationSpeed = 0.25;
    b.anchor.set(0.5, 0.5);
    b.baseScale = ENTITY_SCALE.butterflyFly;
    b.scale.set(ENTITY_SCALE.butterflyFly);
    b.x = Number.isFinite(spot.x) ? spot.x : 250 + i * 400;
    b.y = Number.isFinite(spot.y) ? spot.y - 90 - (i % 3) * 22 : GROUND_Y - 90 - (i % 3) * 22;
    b.baseY = b.y;
    b.vx = 0.65;
    b.phase = i;
    b.zIndex = 40;
    b.play();
    b._ambient = true;
    entityLayer.addChild(b);
    list.push(b);
    const animalState = animalStateFor('npc_butterfly', (xs !== undefined ? xs.length : 4) + i);
    register({
      classId: 'npc_butterfly',
      label: 'Butterfly',
      subtitle: animalStatusLabel('npc_butterfly', animalState),
      sprite: b,
      airborne: true,
      state: animalState,
    });
  }
  return list;
}

/**
 * Spawn harvestable trees on the street.
 * Default mix: fruit + egg plants with maturity art + trant state; optional wood tree.
 * @param {{ x: number, y?: number }[]|number[]} [spots]
 */
function spawnTrees(spots) {
  const list = [];
  const streetState = streetWorldState();
  if (Array.isArray(spots) && spots.length === 0) {
    streetState.trees.length = 0;
    return list;
  }
  const spotCount = Array.isArray(spots) && spots.length ? spots.length : 4;
  const livingCount = spotCount > 2 ? spotCount - 1 : spotCount;
  const livingPlan = livingTrantPlanForStreet(currentStreetTsid, livingCount);
  /** @type {{ x: number, y: number, classId: string, maturity?: number, health?: number }[]} */
  let plan;
  if (spots !== undefined && spots.length && typeof spots[0] === 'number') {
    const xs = /** @type {number[]} */ (spots);
    plan = xs.map((x, i) => ({
      x,
      y: GROUND_Y + 2,
      classId:
        i === xs.length - 1 && xs.length > 2
          ? 'wood_tree'
          : livingPlan[i % livingPlan.length],
      // 7 or 10 → clean full-plant stage art (mid stages were often contact-sheet crops)
      maturity: i % 2 === 0 ? 10 : 7,
      health: 7 + (i % 3),
    }));
  } else if (spots !== undefined && spots.length) {
    plan = /** @type {{ x: number, y?: number, classId?: string }[]} */ (spots).map((p, i) => ({
      x: p.x,
      y: (p.y ?? GROUND_Y) + 2,
      classId: p.classId || (
        i === spots.length - 1 && spots.length > 2
          ? 'wood_tree'
          : livingPlan[i % livingPlan.length]
      ),
      maturity: i % 2 === 0 ? 10 : 7,
      health: 7 + (i % 3),
    }));
  } else {
    plan = [
      { x: 300, y: GROUND_Y + 2, classId: livingPlan[0], maturity: 10, health: 8 },
      { x: 900, y: GROUND_Y + 2, classId: livingPlan[1], maturity: 10, health: 8 },
      { x: 1600, y: GROUND_Y + 2, classId: livingPlan[2], maturity: 7, health: 9 },
      { x: 2100, y: GROUND_Y + 2, classId: 'wood_tree' },
    ];
  }

  plan.forEach(({ x, y, classId, maturity, health }, i) => {
    const isWood = classId === 'wood_tree';
    const meta = TRANT_META[classId];
    const savedTree = streetState.trees[i]?.classId === classId
      ? streetState.trees[i]
      : null;
    let tex = null;
    let trantState = null;
    let woodState = null;
    if (isWood) {
      woodState = ensureWoodTreeState({ maturity: 6, ...(savedTree?.state || {}) });
      tex = textureForWoodTree(woodState.maturity);
    } else {
      trantState = createTrantState(classId, { maturity: maturity ?? 7, health: health ?? 8 });
      if (savedTree?.state) Object.assign(trantState, savedTree.state, { classTsid: classId });
      tex = textureForTrant(classId, trantState.maturity);
    }
    if (!tex) return;
    // Prefer high-quality linear filtering without mip-chain blur on big sheets
    if (tex.baseTexture) {
      tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      if (tex.baseTexture.mipmap !== undefined) {
        tex.baseTexture.mipmap = PIXI.MIPMAP_MODES?.OFF ?? tex.baseTexture.mipmap;
      }
    }
    const spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5, 1);
    spr.roundPixels = true;
    // Never upscale x1 OGA rasters. Cap height so tall egg/fruit plants fit in view
    // (~VIEW_H * 0.42) without clipping against the camera top.
    const s = isWood
      ? trantDisplayScale(tex, { targetH: 190, maxScale: 1 })
      : trantDisplayScale(tex, { targetH: 210, maxScale: 1 });
    spr._woodDirection = i % 2 ? -1 : 1;
    spr.scale.set(spr._woodDirection * s, s);
    spr.x = x;
    spr.y = y;
    // Above ground apples/quoins clutter, below airborne NPCs — avoid burial under y-sort
    spr.zIndex = 16;
    // Tall plants (egg/fruit) can span > half the view; keep full texture, no mask
    spr.mask = null;
    entityLayer.addChild(spr);
    list.push(spr);

    const label = isWood ? 'Wood Tree' : meta?.label || classId;
    const matHint = trantState
      ? trantStatusLabel(trantState, meta)
      : woodTreeStatusLabel(woodState);
    const targetState = isWood ? woodState : trantState;
    register({
      classId,
      label,
      subtitle: matHint,
      sprite: spr,
      state: targetState,
    });
    streetState.trees[i] = { classId, state: targetState };
  });
  streetState.trees.length = plan.length;
  return list;
}

function refreshWoodTreeVisual(target) {
  if (target?.classId !== 'wood_tree' || !target.sprite || !target.state) return;
  const state = ensureWoodTreeState(target.state);
  const tex = textureForWoodTree(state.maturity);
  if (tex) {
    target.sprite.texture = tex;
    const scale = trantDisplayScale(tex, { targetH: 190, maxScale: 1 });
    target.sprite.scale.set((target.sprite._woodDirection || 1) * scale, scale);
  }
  target.subtitle = woodTreeStatusLabel(state);
  if (app?.view) {
    app.view.dataset.woodMaturity = String(state.maturity);
    app.view.dataset.woodHarvested = String(state.harvestedToday);
    app.view.dataset.woodPlanks = String(inv.plank || 0);
    app.view.dataset.hatchetRemaining = String(getToolCondition(toolState, 'hatchet').remaining);
  }
}

/** Apply new-game-day to persisted trees on every visited street. */
function resetAllTrantsForNewDay() {
  let n = 0;
  const seen = new Set();
  for (const street of Object.values(persistentWorldState.streets || {})) {
    for (const tree of street.trees || []) {
      if (!tree?.state || seen.has(tree.state)) continue;
      seen.add(tree.state);
      if (TRANT_META[tree.classId]) {
        resetTrantDay(tree.state);
        // Partial refill (not full) — trees regrow overnight, not instantly full.
        refillFruit(tree.state, 0.55 + Math.random() * 0.25);
        n += 1;
      } else if (tree.classId === 'wood_tree') {
        resetWoodTreeDay(tree.state);
        n += 1;
      }
    }
  }
  for (const target of interactables) {
    if (target.classId === 'wood_tree') {
      refreshWoodTreeVisual(target);
      continue;
    }
    if (!TRANT_META[target.classId] || !target.state) continue;
    const meta = TRANT_META[target.classId];
    target.subtitle = trantStatusLabel(target.state, meta);
  }
  return n;
}

/** Reset today's Animal Kinship limits, including animals on streets revisited later. */
function resetAllAnimalsForNewDay() {
  for (const row of animalStateCache.values()) resetAnimalDay(row.classId, row.state);
  for (const target of interactables) {
    if (!target?.state || !String(target.classId || '').startsWith('npc_')) continue;
    const subtitle = animalStatusLabel(target.classId, target.state);
    if (subtitle) target.subtitle = subtitle;
  }
  return animalStateCache.size;
}

function resetStreetCollectiblesForNewDay() {
  let n = 0;
  for (const street of Object.values(persistentWorldState.streets || {})) {
    n += (street.collectedApples?.length || 0) + (street.collectedQuoins?.length || 0);
    street.collectedApples = [];
    street.collectedQuoins = [];
  }
  return n;
}

function spawnApples(xs) {
  const list = [];
  const collected = new Set(streetWorldState().collectedApples);
  (xs !== undefined ? xs : [250, 600, 850, 1300, 1800, 2200]).forEach((x, i) => {
    if (collected.has(i)) return;
    const spr = new PIXI.Sprite(textures.appleIcon.frames[0]);
    spr.anchor.set(0.5, 1);
    spr.baseScale = ENTITY_SCALE.apple;
    spr.scale.set(ENTITY_SCALE.apple);
    spr.x = x;
    spr.y = GROUND_Y + 2;
    spr.bob = Math.random() * 6;
    spr._naturalIndex = i;
    spr.zIndex = 15;
    entityLayer.addChild(spr);
    list.push(spr);
    register({
      classId: 'apple',
      label: 'Apple',
      subtitle: 'Boldly red and brazenly juicy',
      sprite: spr,
      state: { naturalIndex: i },
    });
  });
  return list;
}

/** Place one deterministic unowned tune on each newly visited street. */
function spawnMusicblockDrop(point, exactPlacement = false) {
  const def = planMusicblockDrop(musicblockState, inv, currentStreetTsid);
  if (!def || !point) return [];
  const collection = listMusicblockCollection(inv);
  const spr = PIXI.Sprite.from(
    ITEM_CATALOG[def.classTsid]?.icon || `assets/sprites/icons/${def.classTsid}.png`
  );
  spr.anchor.set(0.5, 1);
  spr.baseScale = 1.65;
  spr.scale.set(spr.baseScale);
  spr.x = clamp(point.x + (exactPlacement ? 0 : 92), 44, Math.max(44, WORLD_W - 44));
  // Hover above crowded street furniture so the collectible reads as its own target.
  spr.baseY = point.y - 120;
  spr.y = spr.baseY;
  spr.bob = 0;
  spr.zIndex = 27;
  const glow = new PIXI.Graphics();
  glow.beginFill(def.collection === 'DR' ? 0xf5a5b5 : 0x9ee4ac, 0.2);
  glow.drawCircle(0, 0, 34);
  glow.endFill();
  glow.x = spr.x;
  glow.y = spr.baseY - 30;
  glow.zIndex = 26;
  glow.eventMode = 'none';
  spr._worldGlow = glow;
  entityLayer.addChild(glow);
  entityLayer.addChild(spr);
  register({
    classId: def.classTsid,
    label: def.label,
    subtitle: `Playable collectible · recovered tunes ${collection.owned}/${collection.total}`,
    sprite: spr,
    airborne: true,
    state: { streetTsid: currentStreetTsid },
  });
  return [spr];
}

function sizeDroppedItemSprite(spr) {
  const width = Math.max(1, spr.texture?.orig?.width || spr.texture?.width || 36);
  const height = Math.max(1, spr.texture?.orig?.height || spr.texture?.height || 36);
  const scale = Math.min(1.25, 48 / Math.max(width, height));
  spr.baseScale = scale;
  spr.scale.set(scale);
}

/** Render one persistent street stack using its official iconic item art. */
function spawnDroppedItemStack(stack) {
  const item = ITEM_CATALOG[stack.classTsid] || {
    label: stack.classTsid.replace(/_/g, ' '),
    icon: `assets/sprites/icons/${stack.classTsid}.png`,
  };
  const spr = PIXI.Sprite.from(item.icon || `assets/sprites/icons/${stack.classTsid}.png`);
  spr.name = 'world-item-stack';
  spr.anchor.set(0.5, 1);
  sizeDroppedItemSprite(spr);
  if (!spr.texture?.baseTexture?.valid) {
    spr.texture?.baseTexture?.once?.('loaded', () => sizeDroppedItemSprite(spr));
  }
  spr.x = stack.x;
  spr.baseY = stack.y;
  spr.y = stack.y;
  // Dropped stacks must stay legible in front of large vendors/gardens at crowded spawns.
  spr.zIndex = 43;
  spr.worldItemId = stack.id;
  spr.bob = (stack.id.match(/(\d+)$/)?.[1] || 0) * 0.7;

  if (stack.count > 1) {
    const badge = new PIXI.Graphics();
    badge.beginFill(0x3b352d, 0.9);
    badge.lineStyle(1, 0xfff7e6, 0.9);
    badge.drawCircle(16, -33, 10);
    badge.endFill();
    badge.eventMode = 'none';
    const count = new PIXI.Text(String(stack.count), {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 12,
      fontWeight: '800',
      fill: 0xffffff,
      align: 'center',
    });
    count.anchor.set(0.5);
    count.position.set(16, -33);
    count.eventMode = 'none';
    spr.addChild(badge, count);
  }

  entityLayer.addChild(spr);
  droppedItemSprites.push(spr);
  register({
    classId: 'dropped_item',
    label: item.label || stack.classTsid,
    subtitle: `Dropped stack · ${stack.count} in this pile`,
    sprite: spr,
    state: {
      id: stack.id,
      classTsid: stack.classTsid,
      count: stack.count,
      label: item.label || stack.classTsid,
    },
    worldItemId: stack.id,
  });
  return spr;
}

/** Reconcile only player-dropped stacks, leaving natural street entities intact. */
function refreshDroppedWorldItems() {
  if (hoverTarget?.worldItemId) clearHoverGlow();
  const ids = new Set(droppedItemSprites.map((spr) => spr.worldItemId));
  interactables = interactables.filter((target) => !target.worldItemId && !ids.has(target.worldItemId));
  for (const spr of droppedItemSprites) {
    if (spr?.parent) spr.parent.removeChild(spr);
    spr?.destroy?.({ children: true });
  }
  droppedItemSprites = [];
  const streetStacks = listDroppedStacks(droppedItemState, currentStreetTsid);
  app.view.dataset.droppedStacks = String(streetStacks.length);
  app.view.dataset.droppedStootDolls = String(
    streetStacks.filter((stack) => stack.classTsid === STOOT_DOLL_ID).length
  );
  for (const stack of streetStacks) {
    spawnDroppedItemStack(stack);
  }
}

/** Pack action: place a chosen stack at the player's feet, merging nearby matches. */
function dropPackItem(classTsid, requested = 1) {
  if (!state.started || !player || !currentStreetTsid) return;
  const count = normalizeStackQuantity(requested, inv[classTsid] || 0);
  if (!count) {
    toast('That stack is no longer in your pack.');
    closePackPopover();
    return;
  }
  const facing = player.facing === 'left' ? -1 : 1;
  const x = clamp(player.x + facing * 72, 24, Math.max(24, WORLD_W - 24));
  // Tiny Speck's takeable_drop lifts the stack above pc.y. Our two-row pack
  // overlaps more of the world, so use a larger readable lift while keeping the
  // pile within pickup range and visually tethered to the avatar's platform.
  const y = player.y - 74;
  const result = dropInventoryStack(
    droppedItemState,
    inv,
    currentStreetTsid,
    classTsid,
    count,
    { x, y },
    { now: Date.now() }
  );
  closePackPopover();
  if (!result.ok) {
    toast('Could not drop that item.');
    return;
  }
  saveDroppedItems();
  refreshDroppedWorldItems();
  const label = ITEM_CATALOG[classTsid]?.label || classTsid.replace(/_/g, ' ');
  const line = `You dropped ${result.count}× ${label}${result.merged ? ' onto a nearby stack' : ''}.`;
  toast(line);
  pushActivity(line);
  floatText(result.stack.x, result.stack.y - 55, `−${result.count} ${label}`, 0xf2c879);
  burst(result.stack.x, result.stack.y - 12, 0xd8c49a, 7);
  playSfx('pickup', { volume: 0.36, rate: 0.72 });
  updateHud();
}

function pickupDroppedWorldItem(target) {
  const id = target?.state?.id || target?.worldItemId;
  const x = target?.sprite?.x ?? player?.x ?? 0;
  const y = target?.sprite?.y ?? player?.y ?? 0;
  const result = pickupDroppedStack(droppedItemState, inv, currentStreetTsid, id);
  if (!result.ok) {
    toast('That stack has already been picked up.');
    refreshDroppedWorldItems();
    return false;
  }
  saveDroppedItems();
  const label = ITEM_CATALOG[result.classTsid]?.label || result.classTsid.replace(/_/g, ' ');
  const line = `You picked up ${result.count}× ${label}.`;
  toast(line);
  pushActivity(line);
  floatText(x, y - 55, `+${result.count} ${label}`, 0x7dcea0);
  burst(x, y - 12, 0xffe066, 10);
  playSfx('pickup', { volume: 0.7, rate: 1.02 });
  refreshDroppedWorldItems();
  updateHud();
  return true;
}

function quoinFrames(typeId) {
  const def = QUOIN_TYPES[typeId] || QUOIN_TYPES.xp;
  const start = def.row * QUOIN_SHEET.columns;
  return textures.quoin.frames.slice(start, start + QUOIN_SHEET.columns);
}

function spawnWorldQuoin(spot, typeId = 'xp', opts = {}) {
  const def = QUOIN_TYPES[typeId] || QUOIN_TYPES.xp;
  const q = new PIXI.AnimatedSprite(quoinFrames(typeId));
  const phaseIndex = Number(opts.phaseIndex) || 0;
  q.anchor.set(0.5, 0.5);
  q.animationSpeed = typeId === 'qurazy' ? 0.42 : 0.28;
  q.loop = true;
  q.play();
  q.baseScale = SCALE * (typeId === 'qurazy' ? 1.08 : 0.95);
  q.scale.set(q.baseScale);
  q.x = spot.x;
  q.baseY = opts.useExactY ? spot.y : spot.y - 58 - (phaseIndex % 3) * 34;
  q.y = q.baseY;
  q.phase = phaseIndex * 1.3;
  q.def = def;
  q.typeId = typeId;
  q.naturalQuoinIndex = Number.isInteger(opts.naturalQuoinIndex)
    ? opts.naturalQuoinIndex
    : null;
  q.summersDayBonusIndex = Number.isInteger(opts.summersDayBonusIndex)
    ? opts.summersDayBonusIndex
    : null;
  q.summersDayRewardIndex = Number.isInteger(opts.summersDayRewardIndex)
    ? opts.summersDayRewardIndex
    : null;
  q.zIndex = 25;
  const glow = new PIXI.Graphics();
  glow.beginFill(def.color, typeId === 'qurazy' ? 0.32 : 0.18);
  glow.drawCircle(0, 0, typeId === 'qurazy' ? 27 : 22);
  glow.endFill();
  q.addChildAt(glow, 0);
  entityLayer.addChild(q);
  return q;
}

function spawnQuoins(points = samplePlatformPoints(8)) {
  const list = [];
  const collected = new Set(streetWorldState().collectedQuoins);
  const plan = planStreetQuoins(currentStreetTsid, points.length);
  const demoType = new URLSearchParams(location.search).get('quoindemo');
  if (demoType !== null) plan[0] = QUOIN_TYPES[demoType] ? demoType : 'currants';
  points.forEach((spot, i) => {
    if (collected.has(i)) return;
    const typeId = plan[i] || 'xp';
    const q = spawnWorldQuoin(spot, typeId, {
      naturalQuoinIndex: i,
      phaseIndex: i,
    });
    list.push(q);
  });
  return list;
}

function quoinResultCopy(result) {
  const amount = result.actual ?? result.amount;
  if (result.resolvedTypeId === 'xp') return `+${amount} iMG`;
  if (result.resolvedTypeId === 'qurazy') return `Qurazy! +${amount} iMG`;
  if (result.resolvedTypeId === 'energy') return amount ? `+${amount} energy` : 'Energy already full';
  if (result.resolvedTypeId === 'mood') return amount ? `+${amount} mood` : 'Mood already full';
  if (result.resolvedTypeId === 'currants') return `+${amount} currants`;
  if (result.resolvedTypeId === 'favor') {
    const giant = GIANTS[result.giantId];
    return `+${amount} favor${giant ? ` with ${giant.name}` : ''}`;
  }
  if (result.resolvedTypeId === 'time') {
    const applied = result.acceleration?.applied || 0;
    return applied ? `${applied}s faster study` : 'No active study to accelerate';
  }
  return `+${amount}`;
}

function resolveGround(px, py) {
  if (streetPlatforms?.length) {
    const hit = resolveStreetGround(streetPlatforms, px, py, player?.vy ?? 0, 16);
    if (hit) return hit.y;
    // fall through to lowest platform near x, else street bottom
    let best = null;
    let bestY = -Infinity;
    for (const p of streetPlatforms) {
      const y = (p.y1 + p.y2) / 2;
      const minX = Math.min(p.x1, p.x2) - 8;
      const maxX = Math.max(p.x1, p.x2) + 8;
      if (px >= minX && px <= maxX && y > bestY) {
        bestY = y;
        best = y;
      }
    }
    if (best != null && py >= best - 80) return best;
    return streetPlatforms.reduce((m, p) => Math.max(m, p.y1, p.y2), 0);
  }
  return GROUND_Y;
}

/** Pick spawn points along lower platforms. */
function samplePlatformPoints(n) {
  const pts = [];
  if (!streetPlatforms?.length) {
    for (let i = 0; i < n; i++) pts.push({ x: 200 + i * 180, y: GROUND_Y });
    return pts;
  }
  // Prefer platforms near the bottom third of the street
  const maxY = Math.max(...streetPlatforms.map((p) => Math.max(p.y1, p.y2)));
  const minY = Math.min(...streetPlatforms.map((p) => Math.min(p.y1, p.y2)));
  const thresh = minY + (maxY - minY) * 0.55;
  const low = streetPlatforms.filter((p) => (p.y1 + p.y2) / 2 >= thresh);
  const pool = low.length ? low : streetPlatforms;
  for (let i = 0; i < n; i++) {
    const p = pool[i % pool.length];
    const t = 0.2 + (i / Math.max(n, 1)) * 0.6;
    const x = p.x1 + (p.x2 - p.x1) * t;
    const y = p.y1 + (p.y2 - p.y1) * t;
    pts.push({ x, y });
  }
  return pts;
}

function isScreenFxBlocking() {
  const st = document.getElementById('screen-transition');
  const aw = document.getElementById('award-screen');
  const nd = document.getElementById('new-day-screen');
  const fp = document.getElementById('feed-picker');
  const eb = document.getElementById('emotional-bear-picker');
  const qd = document.getElementById('quest-dialogue');
  const hp = document.getElementById('home-panel');
  const mp = document.getElementById('mail-panel');
  return (
    (st && !st.hidden && st.classList.contains('is-visible')) ||
    (aw && !aw.hidden && aw.classList.contains('is-visible')) ||
    (nd && !nd.hidden && nd.classList.contains('is-visible')) ||
    (fp && !fp.hidden) ||
    (eb && !eb.hidden) ||
    (qd && !qd.hidden) ||
    (hp && !hp.hidden) ||
    (mp && !mp.hidden)
  );
}

/** @type {boolean} */
let newDayBusy = false;

/** localStorage key for last street + xy (auto save/load). */
const LOCATION_STORAGE_KEY = 'groddle_player_location';
/** Persistent Tiny Speck-style item stacks placed on streets by the player. */
const DROPPED_ITEMS_STORAGE_KEY = 'groddle_dropped_items_v1';
/** Pack and metabolics must persist with street stacks to keep moves atomic across reloads. */
const PLAYER_STATE_STORAGE_KEY = 'groddle_player_state_v1';
let lastSerializedPlayerState = '';

function persistentSystems() {
  return {
    quests: questState,
    achievements: achieveState,
    skills: skillState,
    buffs: buffState,
    tools: toolState,
    musicblocks: musicblockState,
    shrines: shrineState,
    quoins: quoinState,
    food: foodState,
    paradise: paradiseState,
    feats: featState,
    emotionalBear: emotionalBearState,
    home: homeState,
    mailbox: mailboxState,
    features: features.save(),
  };
}

function rehydrateSavedBuffs() {
  const catalog = getBuffCatalog();
  const now = Date.now();
  for (const [classTsid, row] of Object.entries(buffState.active || {})) {
    const def = catalog[classTsid];
    if (!def) {
      delete buffState.active[classTsid];
      continue;
    }
    row.def = def;
    row.activated = row.activated !== false;
    if (row.nextTickAt == null && def.tickDuration > 0) {
      row.nextTickAt = Math.max(now, row.appliedAt || now) + def.tickDuration * 1000;
    }
  }
  const active = listActiveBuffs(buffState, now);
  const ids = new Set(active.map((row) => row.classTsid));
  pc.activeBuffs = active.map((row) => row.classTsid);
  pc.rewardMultiplier = ids.has('gift_of_gab')
    ? 1.2
    : ids.has('silvertongue')
      ? 1.05
      : 1;
}

function loadPlayerState() {
  try {
    return parsePlayerSave(localStorage.getItem(PLAYER_STATE_STORAGE_KEY), {
      inventory: inv,
      player: pc,
      systems: persistentSystems(),
      world: persistentWorldState,
    });
  } catch {
    return null;
  }
}

function savePlayerState() {
  if (!state.started) return false;
  try {
    syncAnimalWorldState();
    const serialized = serializePlayerSave(createPlayerSave({
      inventory: inv,
      player: pc,
      systems: persistentSystems(),
      world: persistentWorldState,
      savedAt: Date.now(),
    }));
    // savedAt changes each capture; compare gameplay payloads before writing.
    const comparable = serialized.replace(/"savedAt":\d+/, '"savedAt":0');
    if (comparable === lastSerializedPlayerState) return true;
    localStorage.setItem(PLAYER_STATE_STORAGE_KEY, serialized);
    lastSerializedPlayerState = comparable;
    return true;
  } catch {
    return false;
  }
}

function loadDroppedItems() {
  try {
    return parseDroppedItemState(localStorage.getItem(DROPPED_ITEMS_STORAGE_KEY));
  } catch {
    return createDroppedItemState();
  }
}

function saveDroppedItems() {
  try {
    localStorage.setItem(
      DROPPED_ITEMS_STORAGE_KEY,
      serializeDroppedItemState(droppedItemState)
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist current street + player position (best-effort).
 * @param {{ tsid?: string, x?: number, y?: number }} [override]
 */
function savePlayerLocation(override = {}) {
  const tsid = override.tsid ?? currentStreetTsid;
  const x = override.x ?? player?.x;
  const y = override.y ?? player?.y;
  if (!tsid || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  try {
    localStorage.setItem(
      LOCATION_STORAGE_KEY,
      JSON.stringify({
        tsid,
        x: Math.round(x),
        y: Math.round(y),
        savedAt: Date.now(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {{ tsid: string, x: number, y: number, savedAt?: number }|null}
 */
function loadPlayerLocation() {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.tsid !== 'string') return null;
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Resolve a saved location against the street index (G/L tsid aliases).
 * @param {{ tsid: string, x: number, y: number }} saved
 * @returns {{ tsid: string, x: number, y: number }|null}
 */
function resolveSavedLocation(saved) {
  if (!saved?.tsid) return null;
  const streets = STREET_INDEX.streets || {};
  const candidates = [
    saved.tsid,
    String(saved.tsid).replace(/^G/, 'L'),
    String(saved.tsid).replace(/^L/, 'G'),
  ];
  for (const id of candidates) {
    if (streets[id] || availableStreetTsids().includes(id)) {
      return { tsid: id, x: saved.x, y: saved.y };
    }
  }
  // Allow tsid even if only in loader index after ensureStreetIndex
  if (availableStreetTsids().includes(saved.tsid)) {
    return { tsid: saved.tsid, x: saved.x, y: saved.y };
  }
  return null;
}

/**
 * New Day celebration (NewDayView.as): morning crossfade, energy refill, fanfare.
 * Non-skippable — holds for NEW_DAY_HOLD_MS then fades out.
 * @param {{ force?: boolean }} [opts]
 */
async function maybeNewDay(opts = {}) {
  if (newDayBusy || !state.started) return false;
  if (!opts.force && !shouldFireNewDay()) return false;
  newDayBusy = true;
  const el = document.getElementById('new-day-screen');
  const refill = applyNewDayRefill(pc, { energyMax: 100, moodMax: 100 });
  setLastNewDayTs(Date.now());
  // Living things: reset daily care/harvest limits and regrow tree produce.
  const trantN = resetAllTrantsForNewDay();
  const animalN = resetAllAnimalsForNewDay();
  resetShrineDay(shrineState);
  const quoinReset = resetQuoinDay(quoinState, pc.imaginationUpgrades);
  resetFoodDay(foodState);
  resetStreetCollectiblesForNewDay();
  features.newDay(Date.now(), engine);
  updateHud();
  pushActivity(
    `A new day — energy refilled (+${Math.round(refill.energyGained)}) · mood restored` +
      (trantN ? ` · ${trantN} tree${trantN === 1 ? '' : 's'} regrew` : '') +
      (animalN ? ` · ${animalN} animal${animalN === 1 ? '' : 's'} ready for care` : '') +
      (quoinReset.hitLimit ? ` · quoin-limit streak ${quoinReset.limitStreak}` : '')
  );

  if (el) {
    const dateEl = el.querySelector('[data-nd-date]');
    const statsEl = el.querySelector('[data-nd-stats]');
    const okBtn = el.querySelector('[data-nd-ok]');
    if (dateEl) dateEl.textContent = formatGameDayLabel();
    if (statsEl) {
      statsEl.textContent =
        refill.energyGained > 0 || refill.moodGained > 0
          ? `Energy ${Math.round(refill.energyBefore)} → 100 · Mood restored`
          : 'You were already full. Still — a new day!';
    }
    // Decorative button only — cannot skip
    if (okBtn) {
      okBtn.disabled = true;
      okBtn.setAttribute('aria-disabled', 'true');
      okBtn.textContent = 'A new day dawns…';
    }
    const swallow = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('click', swallow);
    el.addEventListener('keydown', swallow);

    playSfx('newDay', { volume: 0.75 });
    await crossfadeElement(el, { show: true, durationSec: AWARD_FADE_IN });
    await new Promise((resolve) => setTimeout(resolve, NEW_DAY_HOLD_MS));
    el.removeEventListener('click', swallow);
    el.removeEventListener('keydown', swallow);
    await crossfadeElement(el, { show: false, durationSec: AWARD_FADE_OUT });
    if (okBtn) {
      okBtn.disabled = false;
      okBtn.removeAttribute('aria-disabled');
      okBtn.textContent = 'Onwards and upwards!';
    }
  } else {
    toast('A new day — energy refilled!', 4000);
    playSfx('newDay', { volume: 0.75 });
  }
  newDayBusy = false;
  return true;
}

function movementNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function gameplayInputBlocked() {
  return Boolean(
    hogHaulBlocksInput() ||
    fourLetterState?.status === 'staging' ||
    rookWoodsState?.status === 'warning' ||
    rookWoodsTransitionBusy ||
    rookMuseumTransitionBusy ||
    deEmbiggenifyTransitionBusy ||
    summersDayTransitionBusy ||
    greedyStreetTransitionBusy ||
    rookHitFx ||
    isQuestDialogueOpen() ||
    isRookMuseumExhibitOpen() ||
    menuTarget ||
    currentAction ||
    isScreenFxBlocking() ||
    isPackPopoverOpen() ||
    isMapOpen() ||
    isVendorOpen() ||
    isQuestOpen() ||
    isAchieveOpen() ||
    isSkillsOpen() ||
    isBuffsOpen() ||
    isMakeOpen() ||
    isGardenOpen() ||
    isAvatarOpen() ||
    isShrineOpen()
  );
}

function publishJumpState(result = null) {
  if (!app?.view) return;
  app.view.dataset.jumpChain = String(jumpState.chainCount || 0);
  app.view.dataset.tripleJumps = String(jumpState.tripleJumps || 0);
  if (player) {
    app.view.dataset.playerX = player.x.toFixed(2);
    app.view.dataset.playerY = player.y.toFixed(2);
    if (Number.isFinite(camTarget)) {
      app.view.dataset.playerScreenX = (player.x - camTarget).toFixed(2);
    }
  }
  if (Number.isFinite(camTarget)) app.view.dataset.cameraX = camTarget.toFixed(2);
  app.view.dataset.cameraRightInset = cameraRightInset.toFixed(2);
  if (result?.reason) app.view.dataset.lastJump = result.reason;
  if (result?.multiplier) app.view.dataset.jumpMultiplier = result.multiplier.toFixed(3);
}

function performPlayerJump(result, baseVelocity, now) {
  player.vy = baseVelocity * result.multiplier;
  player.onGround = false;
  noteGrounded(jumpState, false, now);
  pc.energy = clamp(pc.energy - 1.2, 0, 100);
  if (result.triple) {
    playSfx('jump', { volume: 0.58, rate: 1 });
    const boost = result.multiplier.toFixed(2).replace(/0$/, '');
    floatText(player.x, player.y - 82, `TRIPLE JUMP ×${boost}`, 0xffd85a);
    burst(player.x, player.y, 0xffd85a, 18);
    pushActivity(`${result.profile.label}! Triple jump ×${boost}.`);
  } else {
    burst(player.x, player.y, 0xd4c4a0, 5);
  }
  publishJumpState(result);
  updateHud();
}

/** Buff physics with feature multipliers (e.g. Pooped) folded in. */
function combinedPhysics() {
  const base = buffPhysics(buffState, Date.now());
  const extra = features.physics(engine);
  return { ...base, speed: base.speed * extra.speed, jump: base.jump * extra.jump };
}

function handleInput() {
  if (gameplayInputBlocked()) {
    player.vx = 0;
    clearJumpQueue(jumpState);
    return;
  }
  if (paradiseIsInstanced()) {
    if (paradiseCourse()?.movement === 'slide') handleParadiseSlideInput();
    else {
      clearJumpQueue(jumpState);
      handleParadiseFlightInput();
    }
    return;
  }
  if (summersDayInBuoyancy()) {
    handleSummersDayBuoyancyInput();
    return;
  }
  if (pc.energy <= 0 && features.query('allowZeroEnergyMovement', engine) !== true) {
    player.vx *= 0.85;
    if (climb.active) stopClimb();
    clearJumpQueue(jumpState);
    return;
  }
  const now = movementNow();
  const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
  const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
  const up = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
  const down = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
  const jumpRequested = hasQueuedJump(jumpState, now);
  const climbHit = findClimbWallNear(streetWalls, player.x, player.y, 40);
  const movementBuff = combinedPhysics();

  // —— Climbing (original walls + trunk_ladder zones) ——
  if (climb.active) {
    const wall = climb.wall;
    if (!wall) {
      stopClimb();
      return;
    }
    player.x = wall.x;
    player.vx = 0;
    const climbSpeed = 2.35 * movementBuff.speed;
    if (up && !down) {
      player.vy = -climbSpeed;
      setPlayerAnim('climb');
    } else if (down && !up) {
      player.vy = climbSpeed;
      setPlayerAnim('climb');
    } else {
      player.vy = 0;
      // Pause pose at current climb frame
      if (player.playing) player.stop();
    }
    // Jump off left/right (Glitch wall-jump lite)
    if (jumpRequested || (left && !right) || (right && !left)) {
      const side = left && !right ? -1 : right && !left ? 1 : player.facing === 'left' ? -1 : 1;
      if (jumpRequested || left || right) {
        clearJumpQueue(jumpState);
        stopClimb({ jumpOff: true, side });
        noteGrounded(jumpState, false, now);
        if (jumpRequested) {
          pc.energy = clamp(pc.energy - 1.2, 0, 100);
          updateHud();
        }
        return;
      }
    }
    // Drop off bottom of wall onto ground
    if (player.y >= wall.yBot - 2 && down) {
      stopClimb();
      player.y = wall.yBot;
    }
    // Top of wall — mount onto any platform nearby or stop climbing
    if (player.y <= wall.yTop + 4 && up) {
      const ground = resolveGround(player.x, player.y);
      if (ground != null && Math.abs(ground - player.y) < 48) {
        stopClimb();
        player.y = ground;
        player.onGround = true;
        player.vy = 0;
      } else {
        player.y = wall.yTop + 4;
        player.vy = 0;
      }
    }
    applyPlayerFacing();
    return;
  }

  // Grab onto climbable surface when near + holding up (or jump into it)
  if (climbHit && (up || (!player.onGround && Math.abs(player.x - climbHit.x) < 28))) {
    // Only auto-grab when airborne near wall, or pressing up at base
    if (up || player.vy !== 0 || !player.onGround) {
      startClimb(climbHit);
      return;
    }
  }

  const accel = 0.58;
  const max = 4.4 * movementBuff.speed;
  const jumpVelocity = -9.6 * movementBuff.jump;
  if (left) {
    player.vx = Math.max(player.vx - accel, -max);
  } else if (right) {
    player.vx = Math.min(player.vx + accel, max);
  } else if (companionFollowState.active && !up && !down) {
    const followee = localCompanionTarget(companionFollowState.followee);
    player.vx = followee?.sprite && !followee.sprite.destroyed
      ? companionFollowVelocity(player.x, followee.sprite.x, player.vx, { maxSpeed: max })
      : player.vx * 0.78;
  } else {
    player.vx *= 0.78;
    if (Math.abs(player.vx) < 0.05) player.vx = 0;
  }
  applyPlayerFacing();
  if (jumpRequested && player.onGround && climbHit && up) {
    clearJumpQueue(jumpState);
    startClimb(climbHit);
    return;
  }
  const jumpResult = resolveQueuedJump(jumpState, {
    now,
    grounded: player.onGround,
    upgrades: pc.imaginationUpgrades,
    velocityX: player.vx,
    maxVelocityX: max,
  });
  if (jumpResult.ok) {
    performPlayerJump(jumpResult, jumpVelocity, now);
  }
  // Walk cycle whenever moving horizontally (don't require onGround —
  // slope/platform frames often flicker onGround and were freezing anim at frame 0)
  if (Math.abs(player.vx) > 0.35) setPlayerAnim('walk');
  else setPlayerAnim('idle');
}

function physics(dt) {
  time += dt;
  if (paradiseIsInstanced()) {
    if (paradiseCourse()?.movement === 'slide') paradiseSlidePhysics(dt);
    else paradiseFlightPhysics(dt);
  } else if (summersDayInBuoyancy()) {
    summersDayBuoyancyPhysics(dt);
  } else if (menuTarget || currentAction) {
    // still bob quoins / butterflies ambient
  } else if (climb.active && climb.wall) {
    const wall = climb.wall;
    player.x = wall.x;
    player.y += player.vy * dt;
    player.y = clamp(player.y, wall.yTop + 2, wall.yBot);
    player.vx = 0;
    player.onGround = false;
    // Climb bob
    player.walkPhase += dt * 0.35;
    player.pivot.y = Math.sin(player.walkPhase) * 1.5;
    // Small energy drain while actively climbing
    if (Math.abs(player.vy) > 0.1) {
      pc.energy = clamp(pc.energy - 0.012 * dt, 0, 100);
    }
  } else {
    const movementBuff = buffPhysics(buffState, Date.now());
    player.vy += 0.42 * movementBuff.gravity * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 24, WORLD_W - 24);
    // Snap onto climb wall if flying into one
    const hit = findClimbWallNear(streetWalls, player.x, player.y, 22);
    if (hit && !player.onGround && Math.abs(player.vx) > 0.5) {
      startClimb(hit);
    } else {
      const ground = resolveGround(player.x, player.y);
      if (player.y >= ground && player.vy >= 0) {
        player.y = ground;
        player.vy = 0;
        player.onGround = true;
      } else if (player.y < ground - 2) {
        player.onGround = false;
      }
    }
    // Foot-plant bob only if not using full walk sheet animation
    if (player.animState !== 'walk' && player.animState !== 'climb' && player.onGround && Math.abs(player.vx) > 0.4) {
      player.walkPhase += dt * 0.45;
      player.pivot.y = Math.sin(player.walkPhase) * 2;
    } else if (player.animState !== 'walk' && player.animState !== 'climb') {
      player.pivot.y *= 0.8;
    } else if (player.animState === 'walk') {
      player.pivot.y = 0;
    }
  }

  noteGrounded(jumpState, player.onGround === true && !climb.active, movementNow());
  publishJumpState();

  state.energyTick += dt;
  if (state.energyTick > 40 && !paradiseIsInstanced()) {
    state.energyTick = 0;
    if (Math.abs(player.vx) > 0.5) {
      if (features.metabolicGate('energy', 'loss', engine).ok) {
        pc.energy = clamp(pc.energy - 0.6, 0, 100);
      }
    } else if (features.metabolicGate('energy', 'gain', engine).ok) {
      pc.energy = clamp(pc.energy + 0.5, 0, 100);
    }
    updateHud();
  }

  for (const tree of trees) {
    const harvestFx = tree._trantHarvestFx;
    if (!harvestFx) continue;
    harvestFx.phase += 0.13 * dt;
    harvestFx.remaining -= dt;
    const pulse = 1 + Math.sin(harvestFx.phase) * 0.035;
    tree.scale.x = harvestFx.baseScaleX * pulse;
    tree.scale.y = harvestFx.baseScaleY * (1 + Math.cos(harvestFx.phase * 0.85) * 0.025);
    tree.rotation = harvestFx.baseRotation + Math.sin(harvestFx.phase * 0.62) * 0.012;
    if (harvestFx.remaining <= 0) {
      tree.scale.set(harvestFx.baseScaleX, harvestFx.baseScaleY);
      tree.rotation = harvestFx.baseRotation;
      delete tree._trantHarvestFx;
      if (app?.view) app.view.dataset.trantHarvestAnimation = 'complete';
    }
  }

  // patrol NPCs
  for (const p of piggies) {
    if (menuTarget?.sprite === p || currentAction?.target?.sprite === p) continue;
    p.x += p.vx * dt;
    if (p.x > p.baseX + p.range) { p.x = p.baseX + p.range; p.vx *= -1; }
    if (p.x < p.baseX - p.range) { p.x = p.baseX - p.range; p.vx *= -1; }
    const ps = p.baseScale ?? ENTITY_SCALE.piggy;
    p.scale.x = (p.vx >= 0 ? 1 : -1) * ps;
    p.scale.y = Math.abs(ps);
  }
  for (const c of chickens) {
    if (menuTarget?.sprite === c || currentAction?.target?.sprite === c) continue;
    c.x += c.vx * dt;
    if (c.x > c.baseX + c.range) { c.x = c.baseX + c.range; c.vx *= -1; }
    if (c.x < c.baseX - c.range) { c.x = c.baseX - c.range; c.vx *= -1; }
    const cs = c.baseScale ?? ENTITY_SCALE.chicken;
    c.scale.x = (c.vx >= 0 ? 1 : -1) * cs;
    c.scale.y = Math.abs(cs);
  }

  for (const a of apples) {
    a.bob = (a.bob || 0) + 0.05 * dt;
    if (!a._baseY) a._baseY = a.y;
    a.y = a._baseY + Math.sin(a.bob) * 3;
  }

  for (const block of worldMusicblocks) {
    block.bob = (block.bob || 0) + 0.045 * dt;
    block.y = block.baseY + Math.sin(block.bob) * 5;
    const pulse = 1 + Math.sin(block.bob * 1.4) * 0.055;
    block.scale.set(block.baseScale * pulse);
    if (block._worldGlow) {
      block._worldGlow.x = block.x;
      block._worldGlow.y = block.y - 30;
      block._worldGlow.scale.set(0.92 + Math.sin(block.bob * 1.4) * 0.08);
      block._worldGlow.alpha = 0.72 + Math.sin(block.bob) * 0.15;
    }
  }

  for (const stack of droppedItemSprites) {
    stack.bob = (stack.bob || 0) + 0.025 * dt;
    stack.y = stack.baseY + Math.sin(stack.bob) * 1.8;
  }

  for (const q of quoins) {
    q.phase += 0.05 * dt;
    q.y = q.baseY + Math.sin(q.phase) * 8;
    const pulse = 1 + Math.sin(q.phase * 1.6) * 0.08;
    q.scale.set(q.baseScale * pulse);
  }

  for (const b of butterflies) {
    if (b._butterflyCare) {
      const care = b._butterflyCare;
      care.phase += 0.16 * dt;
      care.remaining -= dt;
      const pulse = 1 + Math.sin(care.phase) * (care.verbId === 'milk' ? 0.11 : 0.07);
      b.scale.x = care.direction * care.baseScale * pulse;
      b.scale.y = care.baseScale * (2 - pulse * 0.96);
      b.rotation = Math.sin(care.phase * 0.7) * (care.verbId === 'milk' ? 0.055 : 0.035);
      if (care.remaining <= 0) {
        b.scale.x = care.direction * care.baseScale;
        b.scale.y = care.baseScale;
        b.rotation = 0;
        if (app?.view) app.view.dataset.butterflyCareAnimation = `${care.verbId}:complete`;
        delete b._butterflyCare;
      }
      continue;
    }
    if (menuTarget?.sprite === b || currentAction?.target?.sprite === b) continue;
    if (b._ambient) {
      b.x += b.vx * dt;
      b.phase += 0.06 * dt;
      b.y = b.baseY + Math.sin(b.phase) * 14;
      if (b.x > WORLD_W + 40) b.x = -40;
      const bs = b.baseScale ?? ENTITY_SCALE.butterflyFly;
      b.scale.x = (b.vx >= 0 ? 1 : -1) * bs;
      b.scale.y = Math.abs(bs);
    } else {
      b.bob = (b.bob || 0) + 0.04 * dt;
      const base = b._groundY ?? GROUND_Y;
      b.y = base + 2 + Math.sin(b.bob) * 2;
    }
  }

  updateLocalCompanions(dt);
  updateSpeechBubbles(dt);

  // FX
  for (let i = fxLayer.children.length - 1; i >= 0; i--) {
    const t = fxLayer.children[i];
    if (t === prompt || t._speechFx) continue;
    if (t._superHarvestFx) {
      t._life += dt;
      const enter = clamp(t._life / 12, 0, 1);
      const leave = clamp((t._max - t._life) / 26, 0, 1);
      const pulse = 0.86 + enter * 0.14 + Math.sin(t._life * 0.1) * 0.025;
      t.scale.set(pulse);
      t.y = t._baseY - Math.min(18, t._life * 0.14);
      t.alpha = Math.min(enter, leave);
      if (t._life > t._max) {
        fxLayer.removeChild(t);
        if (!t.destroyed) t.destroy({ children: true });
        if (app?.view) app.view.dataset.superHarvestFx = 'complete';
      }
    } else if (t._musicFx) {
      t._life += dt;
      const localLife = t._life - (t._delay || 0);
      if (localLife < 0) {
        t.alpha = 0;
        continue;
      }
      if (t._musicFx === 'block') {
        t._phase += 0.08 * dt;
        t.x = player.x + 18;
        t.y = player.y - 112 + Math.sin(t._phase) * 5;
        const pulse = 1.35 + Math.sin(t._phase * 1.8) * 0.08;
        t.scale.set(pulse);
        t.alpha = Math.min(1, localLife / 10, Math.max(0, (t._max - localLife) / 18));
      } else {
        t.x += t._vx * dt;
        t.y += t._vy * dt;
        t.rotation += 0.012 * dt * (t._vx < 0 ? -1 : 1);
        t.alpha = Math.min(1, localLife / 10, Math.max(0, (t._max - localLife) / 24));
      }
      if (localLife > t._max) fxLayer.removeChild(t);
    } else if (t._vx !== undefined) {
      t._life += dt;
      t.x += t._vx * dt;
      t.y += t._vy * dt;
      t._vy += 0.08 * dt;
      t.alpha = Math.max(0, 1 - t._life / t._max);
      if (t._life > t._max) fxLayer.removeChild(t);
    } else if (t._life !== undefined) {
      t._life += dt;
      t.y += (t._vy || -0.55) * dt;
      t.alpha = Math.max(0, 1 - t._life / 55);
      if (t._life > 55) fxLayer.removeChild(t);
    }
  }

  // auto-pickup apples on walk-over still? Keep click/menu only for apples to showcase verbs
  // quoin auto collect
  if (!menuTarget) {
    for (let i = quoins.length - 1; i >= 0; i--) {
      const q = quoins[i];
      if (Math.hypot(q.x - player.x, q.y - (player.y - 28)) < 44) {
        const giantId = giantForStreet(currentStreet).id;
        const result = collectQuoin(quoinState, q.typeId, pc, {
          giantId,
          favor: shrineState.favor,
          accelerateStudy: (seconds) => accelerateActiveStudy(skillState, seconds, Date.now()),
        });
        if (!result.ok) {
          if (!q._limitNoticeAt || Date.now() - q._limitNoticeAt > 5000) {
            q._limitNoticeAt = Date.now();
            toast(`Wowza! You've reached today's ${result.dailyLimit}-quoin limit.`);
          }
          continue;
        }
        if (Number.isInteger(q.naturalQuoinIndex)) {
          collectNaturalIndex('quoin', q.naturalQuoinIndex);
        }
        if (Number.isInteger(q.summersDayBonusIndex) && summersDayRun?.stage === 'bonus') {
          collectSummersDayBonusQuoin(
            summersDayRun,
            q.summersDayBonusIndex,
            Date.now(),
            summersDayBonusQuoins.length || 8
          );
        }
        if (Number.isInteger(q.summersDayRewardIndex)) {
          const summerStory = ensureSummersDayStory(questState);
          summerStory.pendingQurazies = Math.max(0, summerStory.pendingQurazies - 1);
          if (!summerStory.pendingQurazies) summerStory.qurazyStreetTsid = '';
        }
        entityLayer.removeChild(q);
        quoins.splice(i, 1);
        const rewardDef = QUOIN_TYPES[result.resolvedTypeId] || q.def;
        const copy = quoinResultCopy(result);
        playSfx('quoin', {
          volume: result.typeId === 'qurazy' ? 0.82 : 0.55,
          rate: result.typeId === 'qurazy' ? 1.2 : 1,
        });
        toast(result.typeId === 'mystery' ? `Mystery quoin: ${copy}` : copy);
        pushActivity(`You collected a ${q.typeId} quoin. ${copy}.`);
        if (result.acceleration?.completed?.length) {
          handleSkillCompletions(result.acceleration.completed);
        }
        floatText(q.x, q.y - 20, copy, rewardDef.color);
        burst(q.x, q.y, rewardDef.color, result.typeId === 'qurazy' ? 28 : 12);
        applyQuestProgress(questState, 'quoins_collected', 1, pc);
        if (result.resolvedTypeId === 'favor') {
          const shrine = interactables.find((target) => target.classId?.startsWith('npc_shrine_'));
          if (shrine) refreshShrineTarget(shrine);
        }
        if (result.hitLimit) {
          enqueueAward({
            kind: 'achievement',
            title: 'Quoin Limit Reached!',
            body: `You gathered all ${result.dailyLimit} quoins available this game day.`,
            subtitle: 'Numismatical!',
          });
        }
        updateHud();
      }
    }
  }

  entityLayer.children.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0) || a.y - b.y);
  const target = cameraTargetForPlayer(player.x, player.vx);
  camTarget += (target - camTarget) * dampingAlpha(0.08, dt);
  world.x = -Math.round(camTarget * 2) / 2;
  // Vertical follow for tall original streets
  const streetH = activeCameraWorldHeight();
  const targetY = cameraTargetY(player.y, streetH, LOCATION_VIEW_H);
  if (camY === undefined || Number.isNaN(camY)) camY = targetY;
  camY += (targetY - camY) * dampingAlpha(0.12, dt);
  world.y = -Math.round(camY * 2) / 2;
  if (app?.view) {
    app.view.dataset.cameraY = camY.toFixed(2);
    app.view.dataset.cameraWorldHeight = streetH.toFixed(2);
    app.view.dataset.locationViewportHeight = String(LOCATION_VIEW_H);
    app.view.dataset.playerScreenY = (player.y - camY).toFixed(2);
    app.view.dataset.groundClearance =
      (LOCATION_VIEW_H - (player.y - camY)).toFixed(2);
  }

  if (state.toastTimer > 0) {
    state.toastTimer -= (1000 / 60) * dt;
    if (state.toastTimer <= 0) document.getElementById('toast').hidden = true;
  }
}

function eatApple() {
  const r = useItem(inv, pc, 'apple');
  if (!r.ok) {
    toast(r.msgs[0] || 'No apples in pack.');
    return;
  }
  playSfx('eat', { volume: 0.35, rate: 1.4 });
  toast(r.msgs[0] || 'Crunch.');
  floatText(player.x, player.y - 70, '+energy', 0x7dcea0);
  updateHud();
}

function announceQuestCompletions(updates = []) {
  for (const update of updates) {
    if (!update.completed || !update.def) continue;
    const rewards = update.rewards || update.def.rewards || {};
    const rewardBits = [];
    if (rewards.xp) rewardBits.push(`+${Number(rewards.xp).toLocaleString()} iMG`);
    if (rewards.currants) rewardBits.push(`+${Number(rewards.currants).toLocaleString()} currants`);
    if (rewards.energy) rewardBits.push(`+${Number(rewards.energy).toLocaleString()} energy`);
    if (rewards.mood) rewardBits.push(`+${Number(rewards.mood).toLocaleString()} mood`);
    for (const item of Object.values(rewards.items || {})) {
      if (!item?.class_tsid || !item?.count) continue;
      const label = item.label || ITEM_LABELS[item.class_tsid] || item.class_tsid.replace(/_/g, ' ');
      rewardBits.push(`+${Number(item.count).toLocaleString()} ${label}`);
    }
    const favorReward = rewards.favor?.points
      ? rewards.favor
      : Object.values(rewards.favor || {}).find((entry) => entry?.points && entry?.giant);
    if (favorReward?.points && favorReward?.giant) {
      const giant = String(favorReward.giant);
      rewardBits.push(
        `+${Number(favorReward.points).toLocaleString()} ${giant[0].toUpperCase()}${giant.slice(1)} favor`
      );
    }
    const completionPages = parseQuestConversation(update.def.completion);
    enqueueAward({
      kind: 'quest',
      title: update.def.title || 'Quest complete',
      body: cleanQuestMarkup(update.def.completion || update.def.desc),
      subtitle: rewardBits.join(' · ') || 'Quest complete',
      iconUrl: completionPages.length ? 'assets/ui/quest-book.png' : null,
      steps: completionPages,
      primaryLabel: 'OK',
      onPage: completionPages.length
        ? ({ index, total, final }) => {
            if (!app?.view) return;
            app.view.dataset.questAwardClass =
              update.classTsid || update.def.classTsid || '';
            app.view.dataset.questAwardPage = String(index);
            app.view.dataset.questAwardPages = String(total);
            app.view.dataset.questAwardFinal = final ? 'true' : 'false';
            app.view.dataset.questAwardDismissed = 'false';
          }
        : undefined,
      onDismiss: completionPages.length || update.onDismiss
        ? () => {
            if (app?.view) app.view.dataset.questAwardDismissed = 'true';
            update.onDismiss?.();
          }
        : undefined,
    });
    pushActivity(
      `Quest complete: ${update.def.title}.` +
      (rewardBits.length ? ` ${rewardBits.join(' · ')}.` : '')
    );
  }
}

function showGhostVignette(text, durationMs = 2800) {
  document.getElementById('ghost-vignette')?.remove();
  const vignette = document.createElement('div');
  vignette.id = 'ghost-vignette';
  vignette.className = 'ghost-vignette';
  const copy = document.createElement('span');
  copy.textContent = text;
  vignette.appendChild(copy);
  document.getElementById('game-root')?.appendChild(vignette);
  requestAnimationFrame(() => vignette.classList.add('visible'));
  setTimeout(() => {
    vignette.classList.remove('visible');
    setTimeout(() => vignette.remove(), 500);
  }, durationMs);
}

function removePhantomTarget(target = phantomTarget) {
  if (!target) return;
  interactables = interactables.filter((entry) => entry !== target);
  if (target.sprite?.parent) target.sprite.parent.removeChild(target.sprite);
  if (target.sprite && !target.sprite.destroyed) target.sprite.destroy({ children: true });
  if (phantomTarget === target) phantomTarget = null;
}

function fadePhantomTarget(target, done = null) {
  const sprite = target?.sprite;
  if (!sprite || sprite.destroyed) {
    removePhantomTarget(target);
    done?.();
    return;
  }
  sprite.eventMode = 'none';
  const startAlpha = sprite.alpha;
  const start = performance.now();
  const fade = () => {
    if (!sprite || sprite.destroyed) {
      app.ticker.remove(fade);
      done?.();
      return;
    }
    const progress = clamp((performance.now() - start) / 650, 0, 1);
    sprite.alpha = startAlpha * (1 - progress);
    if (progress >= 1) {
      app.ticker.remove(fade);
      removePhantomTarget(target);
      done?.();
    }
  };
  app.ticker.add(fade);
}

function spawnPhantomQuestEncounter() {
  if (!entityLayer || !currentStreet || phantomTarget) return null;
  const encounter = ghostEncounterAt(questState, currentStreetTsid);
  if (!encounter) return null;
  const baseX = player?.x || WORLD_W / 2;
  const point = {
    x: clamp(baseX + (baseX < WORLD_W - 230 ? 155 : -155), 80, WORLD_W - 80),
    y: player?.y || GROUND_Y,
  };
  const sprite = makeAnimated('phantomAppear', {
    animationSpeed: encounter.kind === 'final' ? 0.3 : 0.16,
    scale: encounter.kind === 'final' ? 0.7 : 0.62,
  });
  sprite.x = point.x;
  sprite.y = point.y + 2;
  sprite.zIndex = 44;
  sprite.alpha = encounter.kind === 'final' ? 0.94 : 0.9;
  if (encounter.kind === 'echo') sprite.blendMode = PIXI.BLEND_MODES.SCREEN;
  sprite.loop = false;
  sprite.eventMode = 'none';
  sprite.cursor = 'pointer';
  entityLayer.addChild(sprite);
  phantomTarget = register({
    classId: 'phantom_glitch',
    label: 'Phantom Glitch',
    subtitle: encounter.kind === 'final'
      ? "I've got something for you…"
      : 'A half-remembered shape',
    sprite,
    state: {
      kind: encounter.kind,
      streetTsid: currentStreetTsid,
      appearing: true,
    },
  });
  const makeReadableAt = encounter.kind === 'final' ? 12 : 9;
  sprite.onFrameChange = (frame) => {
    if (frame < makeReadableAt || !phantomTarget || phantomTarget.sprite !== sprite) return;
    phantomTarget.state.appearing = false;
    sprite.eventMode = 'static';
    sprite.onFrameChange = null;
    if (app?.view) app.view.dataset.ghostMaterialized = 'true';
  };
  sprite.onComplete = () => {
    if (sprite.destroyed) return;
    sprite.gotoAndStop(sprite.totalFrames - 1);
    sprite.eventMode = 'static';
    if (phantomTarget?.sprite === sprite) phantomTarget.state.appearing = false;
    if (app?.view) app.view.dataset.ghostAppearAnimation = 'complete';
  };
  recentInteractionTarget = phantomTarget;
  recentInteractionUntil = Date.now() + 10_000;
  if (app?.view) {
    app.view.dataset.ghostEncounter = encounter.kind;
    app.view.dataset.ghostStreet = currentStreetTsid;
  }
  if (encounter.kind === 'echo') {
    pushActivity('You feel a chill. Something half-imagined is nearby.');
  }
  return phantomTarget;
}

function completePhantomHeartHandoff(target) {
  const heart = grantFadedHeart(questState, inv);
  if (!heart.ok) {
    toast('The Phantom has nothing more to give.');
    return;
  }
  const sprite = target.sprite;
  sprite.textures = textures.phantomGiveHeart.frames;
  sprite.loop = false;
  sprite.animationSpeed = PHANTOM_GIVE_HEART_ANIMATION_SPEED;
  sprite.eventMode = 'none';
  target.state.handoff = true;
  target.subtitle = 'What is not forgotten is never really lost.';
  showSpeechBubble(target, {
    speaker: 'Phantom Glitch',
    text: 'What is not forgotten is never really lost.',
    durationMs: 5200,
  });
  const updates = applyQuestProgress(questState, 'got_heart', 1, pc);
  toast('A Faded Heart settles into your pack.', 3400);
  playSfx('pickup', { volume: 0.55, rate: 0.82 });
  if (app?.view) {
    app.view.dataset.ghostHeart = 'granted';
    app.view.dataset.ghostFinale = 'handoff';
    app.view.dataset.ghostHandoffFrames = String(PHANTOM_GIVE_HEART_FRAME_COUNT);
    app.view.dataset.ghostHandoffDuration = String(PHANTOM_GIVE_HEART_DURATION_MS);
    app.view.dataset.ghostQuest = questState.completed.includes(PHANTOM_QUEST_ID)
      ? 'complete'
      : 'active';
  }
  savePlayerState();
  let finalized = false;
  const finishHandoff = () => {
    if (finalized) return;
    finalized = true;
    if (!sprite.destroyed) sprite.gotoAndStop(sprite.totalFrames - 1);
    setTimeout(() => {
      target.state.handoff = false;
      if (app?.view) {
        app.view.dataset.ghostFinale = 'complete';
        app.view.dataset.ghostHandoffAnimation = 'complete';
      }
      announceQuestCompletions(updates);
      updateHud();
      fadePhantomTarget(target);
    }, PHANTOM_HEART_REVEAL_HOLD_MS);
  };
  sprite.onComplete = finishHandoff;
  sprite.gotoAndPlay(0);
}

function handlePhantomInteraction(target, verbId) {
  const kind = target?.state?.kind;
  if (target?.state?.appearing) {
    toast('The half-remembered shape is still coming into focus.');
    return;
  }
  if (kind === 'echo' && verbId === 'notice') {
    const result = noticePhantom(questState, currentStreetTsid);
    if (!result.ok) {
      toast('The shape has already faded.');
      return;
    }
    const updates = applyQuestProgress(questState, 'found_ghost', 1, pc);
    showGhostVignette(result.whisper);
    pushActivity(
      `You noticed the Phantom Glitch. ${result.found}/${PHANTOM_HAUNT_COUNT} hauntings found.`
    );
    if (app?.view) {
      app.view.dataset.ghostFound = String(result.found);
      app.view.dataset.ghostRemaining = String(result.remaining);
    }
    fadePhantomTarget(target, () => {
      if (result.finalReady) {
        setTimeout(() => spawnPhantomQuestEncounter(), 700);
      }
    });
    announceQuestCompletions(updates);
    updateHud();
    return;
  }
  if (kind === 'final' && verbId === 'talk_to') {
    const story = ensureGhostQuestState(questState, availableStreetTsids());
    if (story.heartGranted) {
      toast('The Phantom has nothing more to give.');
      return;
    }
    if (isQuestDialogueOpen()) return;
    if (app?.view) app.view.dataset.ghostFinale = 'conversation';
    openScriptedQuestDialogue({
      title: 'Notice the Unnoticeable',
      kicker: 'Phantom Glitch',
      beats: PHANTOM_FINALE_BEATS,
      primaryLabel: '?',
      onComplete: () => completePhantomHeartHandoff(target),
    });
    return;
  }
  toast('For a moment, you cannot quite remember what to do.');
}

function rememberFadedHeartInWorld() {
  const result = rememberWithFadedHeart(
    questState,
    inv,
    currentStreetTsid,
    Date.now()
  );
  if (!result.ok) {
    const message = result.reason === 'inactive'
      ? 'The Faded Heart is quiet. A later ghost story may wake it.'
      : result.reason === 'cooldown'
        ? `You must wait ${Math.ceil(result.remainingMs / 1000)}s before remembering more.`
        : result.reason === 'already_remembered'
          ? "You can't remember anything new in connection with this place."
          : 'You do not have the Faded Heart.';
    toast(message, 3200);
    renderPackPopover(FADED_HEART_ID);
    return;
  }
  closePackPopover();
  const points = samplePlatformPoints(7);
  const point = points[5] || { x: player.x + 180, y: player.y };
  const memory = makeAnimated('phantomAppear', { animationSpeed: 0.15, scale: 0.56 });
  memory.x = point.x;
  memory.y = point.y + 2;
  memory.alpha = 0.42;
  memory.loop = true;
  memory.eventMode = 'none';
  memory.zIndex = 90;
  fxLayer.addChild(memory);
  pushActivity(
    `The Faded Heart remembered this place. ${result.remembered}/13 new haunts found.`
  );
  setTimeout(() => {
    if (memory.parent) memory.parent.removeChild(memory);
    if (!memory.destroyed) memory.destroy();
  }, 15_000);
  const updates = applyQuestProgress(questState, 'faded_heart_remembered', 1, pc);
  if (!updates.some((update) => update.completed)) {
    showGhostVignette('You remembered the half-forgotten Glitch.');
  }
  if (app?.view) {
    app.view.dataset.ghostRemembered = String(result.remembered);
    app.view.dataset.ghostMemoryStreet = currentStreetTsid;
  }
  announceQuestCompletions(updates);
  updateHud();
}

function hogHaulIsInstanced() {
  return Boolean(hogHaulState && currentStreetTsid === HOG_HAUL_STREET_ID);
}

function hogHaulBlocksInput() {
  return Boolean(
    hogHaulState &&
    ['staging', 'countdown', 'won', 'lost'].includes(hogHaulState.status)
  );
}

function hogHaulRivalTimesFromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = String(params.get('rivalscoreseconds') || '').trim();
  if (raw) {
    const values = raw
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => value * 1000);
    if (values.length) return values;
  }
  const delay = Number(params.get('rivaldelay'));
  if (Number.isFinite(delay) && delay > 0) {
    return [delay, delay * 2, delay * 3].map((seconds) => seconds * 1000);
  }
  return undefined;
}

function hideHogHaulScreens() {
  const ready = document.getElementById('hog-haul-ready');
  const countdown = document.getElementById('hog-haul-countdown');
  const result = document.getElementById('hog-haul-result');
  if (ready) ready.hidden = true;
  if (countdown) countdown.hidden = true;
  if (result) result.hidden = true;
}

function renderHogHaulHud() {
  const hud = document.getElementById('hog-haul-hud');
  if (!hud) return;
  const visible = hogHaulIsInstanced();
  hud.hidden = !visible;
  if (!visible) return;
  const set = (selector, value) => {
    const el = hud.querySelector(selector);
    if (el) el.textContent = String(value);
  };
  set('[data-hog-player]', 'You');
  set('[data-hog-player-score]', hogHaulState.playerScore);
  set('[data-hog-rival]', hogHaulState.rivalLabel);
  set('[data-hog-rival-score]', hogHaulState.rivalScore);
  set('[data-hog-objective]', hogHaulObjective(hogHaulState));

  const cargo = hud.querySelector('[data-hog-cargo]');
  const cargoIcon = hud.querySelector('[data-hog-cargo-icon]');
  const cargoLabel = hud.querySelector('[data-hog-cargo-label]');
  const carrying = hogHaulState.carryingPig || hogHaulState.hasBait;
  cargo?.classList.toggle('is-carrying', carrying);
  if (cargo) {
    cargo.setAttribute(
      'aria-label',
      hogHaulState.carryingPig
        ? 'Carrying a hogtied Piggy'
        : hogHaulState.hasBait
          ? 'Carrying Pig Bait'
          : 'Carrying nothing'
    );
  }
  if (cargoIcon) {
    cargoIcon.src = hogHaulState.carryingPig
      ? 'assets/sprites/races/hogtied_piggy__x1_1_png_1354830331.png'
      : 'assets/sprites/races/pig_bait__x1_iconic_png_1354830334.png';
  }
  if (cargoLabel) {
    cargoLabel.textContent = hogHaulState.carryingPig
      ? 'Hogtied Piggy'
      : hogHaulState.hasBait
        ? 'Pig Bait'
        : 'Hands free';
  }
  if (app?.view) {
    app.view.dataset.hogHaulStatus = hogHaulState.status;
    app.view.dataset.hogHaulPlayerScore = String(hogHaulState.playerScore);
    app.view.dataset.hogHaulRivalScore = String(hogHaulState.rivalScore);
    app.view.dataset.hogHaulHasBait = hogHaulState.hasBait ? '1' : '0';
    app.view.dataset.hogHaulCarryingPig = hogHaulState.carryingPig ? '1' : '0';
    app.view.dataset.hogHaulObjective = hogHaulObjective(hogHaulState);
  }
}

function positionHogHaulCarrySprite() {
  if (!hogHaulCarrySprite || !player) return;
  hogHaulCarrySprite.visible = Boolean(hogHaulState?.carryingPig);
  if (!hogHaulCarrySprite.visible) return;
  hogHaulCarrySprite.x = player.x;
  hogHaulCarrySprite.y = player.y - Math.abs(player.height) - 8;
  hogHaulCarrySprite.rotation = Math.sin(time * 0.07) * 0.08;
}

function spawnHogHaulBait(point, index) {
  const spr = makeAnimated('pigBait', { animationSpeed: 0.1, scale: 0.92 });
  spr.x = point.x;
  spr.y = point.y + 2;
  spr.baseY = spr.y;
  spr.bob = index * 0.85;
  spr.zIndex = 34;
  entityLayer.addChild(spr);
  const target = register({
    classId: 'race_pig_bait',
    label: 'Pig Bait',
    subtitle: 'Grab this, then find a Piggy',
    sprite: spr,
    state: {
      raceId: `bait-${index + 1}`,
      raceState: hogHaulState,
      available: true,
    },
  });
  hogHaulBaits.push(target);
  return target;
}

function spawnHogHaulPiggy(point, index) {
  const spr = makeAnimated('piggyWalk', {
    animationSpeed: 0.14,
    frameSlice: [0, 8],
    scale: ENTITY_SCALE.piggy,
  });
  spr.baseScale = ENTITY_SCALE.piggy;
  spr.x = point.x;
  spr.y = point.y + 2;
  spr.vx = (index % 2 === 0 ? 1 : -1) * 0.48;
  spr.baseX = point.x;
  spr.range = Math.max(42, Math.min(105, Number(point.clearance) || 86));
  spr.zIndex = 35;
  entityLayer.addChild(spr);
  piggies.push(spr);
  const target = register({
    classId: 'race_piggy',
    label: 'Loose Piggy',
    subtitle: 'Needs Pig Bait',
    sprite: spr,
    state: {
      raceId: `pig-${index + 1}`,
      raceState: hogHaulState,
      available: true,
    },
  });
  hogHaulPigTargets.push(target);
  return target;
}

function spawnHogHaulPen(point) {
  // The authored street already paints the fence and "Pig Pen" sign. This
  // transparent Sprite contributes only a generous collision/interaction box.
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5, 1);
  spr.x = point.x;
  spr.y = point.y + 5;
  spr.width = 310;
  spr.height = 145;
  spr.zIndex = 33;
  entityLayer.addChild(spr);
  hogHaulPenTarget = register({
    classId: 'race_pig_pen',
    label: 'Pig Pen',
    subtitle: 'Return hogtied Piggies here',
    sprite: spr,
    state: { raceState: hogHaulState },
  });
  return hogHaulPenTarget;
}

function spawnHogHaulRival(point) {
  const frames = textures.avatarStyledWalk?.frames || [];
  if (!frames.length) return null;
  const rival = new PIXI.AnimatedSprite(frames);
  rival.anchor.set(0.5, 1);
  rival.animationSpeed = 0.18;
  rival.loop = true;
  rival.scale.set(SCALE * 0.4);
  rival.tint = 0xd8b5ff;
  rival.alpha = 0.88;
  rival.x = point.x + 82;
  rival.y = point.y;
  rival.zIndex = 46;
  rival.play();
  entityLayer.addChild(rival);
  hogHaulRivalSprite = rival;
  return rival;
}

function spawnHogHaulPenPiggy(index) {
  if (!hogHaulPenTarget?.sprite || !textures.piggyWalk?.frames?.length) return;
  const spr = new PIXI.AnimatedSprite(textures.piggyWalk.frames.slice(0, 8));
  spr.anchor.set(0.5, 1);
  spr.animationSpeed = 0.1;
  spr.baseScale = ENTITY_SCALE.piggy * 0.8;
  spr.scale.set(index % 2 ? -spr.baseScale : spr.baseScale, spr.baseScale);
  spr.x = hogHaulPenTarget.sprite.x - 70 + index * 64;
  spr.y = hogHaulPenTarget.sprite.y - 7;
  spr.vx = (index % 2 ? -1 : 1) * 0.18;
  spr.baseX = spr.x;
  spr.range = 18;
  spr.zIndex = 34;
  spr._racePenPig = true;
  spr.play();
  entityLayer.addChild(spr);
  piggies.push(spr);
}

function updateHogHaulRival(dt) {
  const rival = hogHaulRivalSprite;
  if (!rival || rival.destroyed || !hogHaulRivalWaypoints.length) return;
  if (!hogHaulState || !['countdown', 'running'].includes(hogHaulState.status)) {
    rival.stop();
    return;
  }
  const point = hogHaulRivalWaypoints[hogHaulRivalWaypointIndex % hogHaulRivalWaypoints.length];
  const dx = point.x - rival.x;
  const dy = point.y - rival.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 16) {
    hogHaulRivalWaypointIndex = (hogHaulRivalWaypointIndex + 1) % hogHaulRivalWaypoints.length;
    return;
  }
  const step = Math.min(distance, 2.15 * dt);
  rival.x += (dx / distance) * step;
  rival.y += (dy / distance) * step;
  const scale = SCALE * 0.4;
  rival.scale.set(dx < 0 ? scale : -scale, scale);
  if (!rival.playing) rival.play();
}

function setupHogHaulWorld() {
  clearWorldEntities();
  const penRaw = worldToScreen(currentStreet, -15, -875);
  const penPoint = {
    x: clamp(penRaw.x, 190, WORLD_W - 190),
    y: resolveGround(penRaw.x, penRaw.y + 10),
  };
  const racePlacement = planStreetPlacements(
    streetPlatforms,
    [
      { key: 'raceBaits', count: 11, clearance: 66 },
      { key: 'racePiggies', count: 8, clearance: 92 },
    ],
    {
      worldW: WORLD_W,
      seed: `${HOG_HAUL_STREET_ID}:race-items`,
      reserved: [
        { ...penPoint, key: 'pig-pen', clearance: 210 },
        { x: penPoint.x - 145, y: penPoint.y, key: 'race-start', clearance: 105 },
      ],
    }
  );
  let baitPoints = racePlacement.groups.raceBaits || [];
  let pigPoints = racePlacement.groups.racePiggies || [];
  if (new URLSearchParams(location.search).get('raceassist') === '1') {
    const offsets = [-250, 250, -420];
    baitPoints = offsets.map((offset) => {
      const x = clamp(penPoint.x + offset, 60, WORLD_W - 60);
      return { x, y: resolveGround(x, penPoint.y - 60), clearance: 54 };
    });
    pigPoints = offsets.map((offset) => {
      const x = clamp(penPoint.x + offset + Math.sign(offset) * 85, 60, WORLD_W - 60);
      return { x, y: resolveGround(x, penPoint.y - 60), clearance: 54 };
    });
  }
  baitPoints.forEach(spawnHogHaulBait);
  pigPoints.forEach(spawnHogHaulPiggy);
  spawnHogHaulPen(penPoint);
  spawnHogHaulRival(penPoint);

  hogHaulCarrySprite = new PIXI.Sprite(textures.hogtiedPiggy.frames[0]);
  hogHaulCarrySprite.anchor.set(0.5, 1);
  hogHaulCarrySprite.scale.set(1.05);
  hogHaulCarrySprite.visible = false;
  hogHaulCarrySprite.zIndex = 100;
  hogHaulCarrySprite.eventMode = 'none';
  fxLayer.addChild(hogHaulCarrySprite);

  hogHaulRivalWaypoints = [];
  const loopCount = Math.max(baitPoints.length, pigPoints.length);
  for (let i = 0; i < loopCount; i += 1) {
    if (baitPoints[i]) hogHaulRivalWaypoints.push(baitPoints[i]);
    if (pigPoints[i]) hogHaulRivalWaypoints.push(pigPoints[i]);
    hogHaulRivalWaypoints.push(penPoint);
  }
  hogHaulRivalWaypointIndex = 0;
  player.x = clamp(penPoint.x - 145, 40, WORLD_W - 40);
  player.y = resolveGround(player.x, penPoint.y);
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  camTarget = cameraTargetForPlayer(player.x);
  camY = cameraTargetY(player.y, activeCameraWorldHeight(), LOCATION_VIEW_H);
  world.x = -camTarget;
  world.y = -camY;
  renderHogHaulHud();
}

async function startHogHaulRace(opts = {}) {
  if (hogHaulStartPromise) return hogHaulStartPromise;
  if (hogHaulIsInstanced() && ['staging', 'countdown', 'running'].includes(hogHaulState.status)) {
    return hogHaulState;
  }
  hogHaulStartPromise = (async () => {
    closeQuestPanel();
    closeQuestDialogue();
    closePackPopover();
    hideHogHaulScreens();
    hogHaulSourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x,
      y: player?.y,
    };
    hogHaulState = createHogHaulState({
      status: 'staging',
      now: Date.now(),
      rivalLabel: opts.rivalLabel || 'Gomez Addams',
      rivalTimesMs: hogHaulRivalTimesFromUrl(),
    });
    hogHaulResultApplied = false;
    hogHaulLastCollisionAt = 0;
    hogHaulAutoNextAt = 0;
    await enterStreetWithTransition(HOG_HAUL_STREET_ID, {
      useTransition: opts.useTransition !== false,
      quiet: true,
    });
    // enterStreet autosaves every destination. A race instance must never
    // replace the player's resumable exploration location.
    if (hogHaulSourceLocation?.tsid) savePlayerLocation(hogHaulSourceLocation);
    setupHogHaulWorld();
    const ready = document.getElementById('hog-haul-ready');
    if (ready) ready.hidden = false;
    renderHogHaulHud();
    pushActivity('The Great Hog Haul: grab bait, catch a Piggy, and race it back to the pen.');
    if (
      new URLSearchParams(location.search).get('racedemo') === '1' ||
      opts.autoReady === true
    ) {
      setTimeout(beginHogHaulCountdown, 120);
    }
    return hogHaulState;
  })();
  try {
    return await hogHaulStartPromise;
  } finally {
    hogHaulStartPromise = null;
  }
}

function beginHogHaulCountdown() {
  if (!hogHaulIsInstanced() || hogHaulState.status !== 'staging') return false;
  const now = Date.now();
  hogHaulState.status = 'countdown';
  hogHaulState.createdAt = now;
  hogHaulState.startAt = now + 4_000;
  const ready = document.getElementById('hog-haul-ready');
  if (ready) ready.hidden = true;
  const countdown = document.getElementById('hog-haul-countdown');
  if (countdown) {
    countdown.hidden = false;
    countdown.classList.remove('is-go');
    countdown.textContent = 'READY?';
  }
  keys.clear();
  player.vx = 0;
  playSfx('start', { volume: 0.55, rate: 0.9 });
  renderHogHaulHud();
  return true;
}

function clearHogHaulHoverTarget(target) {
  if (menuTarget === target) closeVerbMenu();
  if (hoverTarget === target) clearHoverGlow();
  if (recentInteractionTarget === target) {
    recentInteractionTarget = null;
    recentInteractionUntil = 0;
  }
}

function handleHogHaulTarget(target) {
  if (!hogHaulState || !target?.state) return { ok: false, reason: 'no_race' };
  if (target.classId === 'race_pig_bait') {
    const result = pickupHogHaulBait(hogHaulState, target.state.raceId);
    if (!result.ok) return result;
    target.state.available = false;
    target.sprite.visible = false;
    target.sprite.eventMode = 'none';
    clearHogHaulHoverTarget(target);
    playSfx('pickup', { volume: 0.7, rate: 1.14 });
    burst(target.sprite.x, target.sprite.y - 18, 0xffd762, 12);
    toast('You have bait, now go get a piggy!', 2700);
    pushActivity('You picked up Pig Bait. Find a loose Piggy!');
  } else if (target.classId === 'race_piggy') {
    const result = captureHogHaulPig(hogHaulState, target.state.raceId);
    if (!result.ok) {
      if (result.reason === 'needs_bait') toast('You need bait first!', 1600);
      return result;
    }
    target.state.available = false;
    target.sprite.visible = false;
    target.sprite.eventMode = 'none';
    clearHogHaulHoverTarget(target);
    playSfx('pet', { volume: 0.72, rate: 1.25 });
    burst(target.sprite.x, target.sprite.y - 26, 0xffa2c3, 16);
    toast(
      hogHaulState.playerScore === 0
        ? 'You hogtied a piggy, now take it to the Pig Pen!'
        : 'Got a pig! Back to the pen!',
      3000
    );
    pushActivity('You hogtied a Piggy. Back to the pen!');
  } else if (target.classId === 'race_pig_pen') {
    const result = deliverHogHaulPig(hogHaulState, Date.now());
    if (!result.ok) return result;
    spawnHogHaulPenPiggy(result.score - 1);
    playSfx('pickup', { volume: 0.8, rate: 0.82 });
    burst(target.sprite.x, target.sprite.y - 42, 0xffd85a, 24);
    if (result.won) {
      finishHogHaulRace();
    } else {
      const word = result.remaining === 1 ? 'one more' : 'two more';
      toast(`Nice job! Now, get ${word}!`, 2800);
      pushActivity(`Piggy returned! ${result.score}/${HOG_HAUL_GOAL}.`);
    }
  } else {
    return { ok: false, reason: 'not_race_target' };
  }
  hogHaulLastCollisionAt = Date.now();
  renderHogHaulHud();
  return { ok: true };
}

function finishHogHaulRace() {
  if (!hogHaulState || !['won', 'lost'].includes(hogHaulState.status)) return;
  if (!hogHaulResultApplied) {
    const reward = hogHaulResultReward(hogHaulState);
    if (reward.currants) pc.currants += reward.currants;
    if (reward.xp) {
      pc.imagination += reward.xp;
      pc.xp += reward.xp;
    }
    if (hogHaulState.status === 'won') {
      applyQuestProgress(questState, 'multiplayer_quest_win', 1, pc);
      pushActivity(`You won The Great Hog Haul! +${reward.currants} currants · +${reward.xp} iMG.`);
    } else {
      pushActivity(`${hogHaulState.rivalLabel} won The Great Hog Haul.`);
    }
    hogHaulResultApplied = true;
  }
  keys.clear();
  player.vx = 0;
  player.vy = 0;
  if (hogHaulCarrySprite) hogHaulCarrySprite.visible = false;
  const resultScreen = document.getElementById('hog-haul-result');
  const card = resultScreen?.querySelector('.hog-haul-result-card');
  const won = hogHaulState.status === 'won';
  card?.classList.toggle('is-loss', !won);
  const title = resultScreen?.querySelector('[data-hog-result-title]');
  const reward = resultScreen?.querySelector('[data-hog-result-reward]');
  if (title) title.textContent = won ? 'YOU WON!' : `${hogHaulState.rivalLabel} is the winner!`;
  if (reward) {
    reward.textContent = won
      ? '(You got 100 currants and 50 xp.)'
      : 'Better luck next time — the Piggies are still loose.';
  }
  if (resultScreen) resultScreen.hidden = false;
  const countdown = document.getElementById('hog-haul-countdown');
  if (countdown) countdown.hidden = true;
  if (app?.view) app.view.dataset.hogHaulOutcome = hogHaulState.status;
  renderHogHaulHud();
  updateHud();
}

async function leaveHogHaulRace() {
  if (!hogHaulState || !['won', 'lost'].includes(hogHaulState.status)) return false;
  const outcome = hogHaulState.status;
  if (outcome === 'won') {
    const updates = applyQuestProgress(questState, 'race_leave', 1, pc);
    announceQuestCompletions(updates);
  }
  const destination = hogHaulSourceLocation?.tsid
    ? { ...hogHaulSourceLocation }
    : { tsid: STREET_INDEX.default };
  hideHogHaulScreens();
  const hud = document.getElementById('hog-haul-hud');
  if (hud) hud.hidden = true;
  hogHaulState = null;
  hogHaulSourceLocation = null;
  await enterStreetWithTransition(destination.tsid, {
    spawnX: destination.x,
    spawnY: destination.y,
    quiet: true,
  });
  if (app?.view) {
    app.view.dataset.hogHaulStatus = 'left';
    app.view.dataset.hogHaulOutcome = outcome;
  }
  if (outcome === 'lost') {
    toast('The Great Hog Haul is still in your Quest Log. Try again anytime.', 4200);
  } else {
    toast('Dem Piggies got hogtied up good! Nice work.', 3600);
  }
  updateHud();
  return true;
}

function updateHogHaul(deltaMs) {
  if (!hogHaulIsInstanced()) return;
  const now = Date.now();
  const result = tickHogHaul(hogHaulState, now);
  if (hogHaulState.status === 'countdown') {
    const countdown = document.getElementById('hog-haul-countdown');
    if (countdown) {
      countdown.hidden = false;
      countdown.classList.remove('is-go');
      countdown.textContent = countdownCue(hogHaulState, now);
    }
  }
  for (const event of result.events) {
    if (event.type === 'started') {
      const countdown = document.getElementById('hog-haul-countdown');
      if (countdown) {
        countdown.hidden = false;
        countdown.classList.add('is-go');
        countdown.textContent = 'GO!';
        setTimeout(() => {
          if (hogHaulState?.status === 'running') countdown.hidden = true;
        }, 650);
      }
      playSfx('start', { volume: 0.7, rate: 1.16 });
      toast('Find a Pig Bait sack!', 2200);
    }
    if (event.type === 'rival_scored') {
      toast(`${hogHaulState.rivalLabel} returned a Piggy!`, 2200);
      playSfx('alert', { volume: 0.35, rate: 0.92 });
    }
    if (event.type === 'lost') finishHogHaulRace();
  }

  updateHogHaulRival(deltaMs / (1000 / 60));
  positionHogHaulCarrySprite();
  for (const target of hogHaulBaits) {
    const spr = target.sprite;
    if (!target.state.available || !spr?.visible) continue;
    spr.bob += 0.05 * (deltaMs / (1000 / 60));
    spr.y = spr.baseY + Math.sin(spr.bob) * 3;
  }
  if (hogHaulState.status === 'running' && now - hogHaulLastCollisionAt >= 220) {
    if (
      new URLSearchParams(location.search).get('raceautoplay') === '1' &&
      now >= hogHaulAutoNextAt
    ) {
      const target = hogHaulState.carryingPig
        ? hogHaulPenTarget
        : hogHaulState.hasBait
          ? hogHaulPigTargets.find((row) => row.state.available)
          : hogHaulBaits.find((row) => row.state.available);
      if (target) handleHogHaulTarget(target);
      hogHaulAutoNextAt = now + 650;
      renderHogHaulHud();
      return;
    }
    const bait = hogHaulBaits.find(
      (target) => target.state.available && interactDistance(target, player.x, player.y) < 16
    );
    if (bait && !hogHaulState.hasBait && !hogHaulState.carryingPig) {
      handleHogHaulTarget(bait);
    } else {
      const pig = hogHaulPigTargets.find(
        (target) => target.state.available && interactDistance(target, player.x, player.y) < 18
      );
      if (pig && !hogHaulState.carryingPig) {
        handleHogHaulTarget(pig);
      } else if (
        hogHaulState.carryingPig &&
        hogHaulPenTarget &&
        interactDistance(hogHaulPenTarget, player.x, player.y) < 45
      ) {
        handleHogHaulTarget(hogHaulPenTarget);
      }
    }
  }
  renderHogHaulHud();
}

const FOUR_LETTER_INTRO = [
  {
    text: "Hello! Hello, young person! I'm in desperate need of some help. I've been trying to solve these three riddles for hours, but I'm absolutely dreadful with riddles.",
    response: 'I bet I can solve them!',
  },
  {
    text: 'You charming soul! Here is the first: Through waves that roll and winds that whip, this stands tall from a mighty ship.',
    response: 'Uh, what?',
  },
  {
    text: 'Oh dear, oh dear. I knew it was too difficult.',
    response: 'No, I can do it! Just say it again, please.',
  },
  {
    text: 'Through waves that roll and winds that whip, this stands tall from a mighty ship.',
    response: "OK. I'm thinking now…",
  },
  {
    text: 'When you have the answer, spin these letter blocks to spell it out.',
    response: 'OK!',
  },
];

const FOUR_LETTER_NEXT_DIALOGUE = [
  [
    {
      text: 'Of course, of course. But can you solve this troubling conundrum?',
      response: 'Sure, let me at it!',
    },
    {
      text: 'Of animals I reminisce, some are wild and some are this.',
      response: 'Hm…',
    },
  ],
  [
    {
      text: "Inconceivable! But there's still another. This one is of such fiendish difficulty I can scarcely bear to contemplate it.",
      response: "Oh, it can't be that tough.",
    },
    {
      text: 'You are truly courageous. Here it is: Up and down through every song, this tells you when to dance along.',
      response: 'I see…',
    },
  ],
];

const FOUR_LETTER_FINAL_DIALOGUE = [
  {
    text: "Goodness. My flabber is well and truly ghasted. Are you sure you haven't heard this riddle before?",
    response: 'Nope. It was kind of easy.',
  },
  {
    text: 'Easy? Well, if you say so. I still bow to your staggering intellect.',
    response: 'Well, thank you.',
  },
  {
    text: "Now if you don't mind, I'd like to be alone now to ponder these riddles.",
    response: 'OK',
  },
];

function fourLetterIsInstanced() {
  return Boolean(fourLetterState && currentStreetTsid === FOUR_LETTER_ROOM_ID);
}

function fourLetterTexture(letter) {
  return textures[`letterBlock${letter}`]?.frames?.[0] || PIXI.Texture.WHITE;
}

function drawPlayroomBackground() {
  const layer = new PIXI.Container();
  layer.name = 'four-letter-playroom';
  layer.worldH = 760;
  layer.platformsScreen = [{ id: 'playroom-floor', x1: 0, y1: 620, x2: 1150, y2: 620, pc_perm: 1 }];

  const room = new PIXI.Graphics();
  room.beginFill(0xf7f0d9);
  room.drawRect(0, 0, 1150, 620);
  room.endFill();

  // Clean vector interpretation of the recorded playroom: patterned wall,
  // tall cyan windows, oversized furniture, and warm wooden floor.
  const colors = [0x72c8c8, 0xeba75f, 0xcf6179, 0x9bc761, 0x7aa9d1];
  for (let x = -70, i = 0; x < 1220; x += 165, i += 1) {
    const color = colors[i % colors.length];
    room.beginFill(color, 0.9);
    room.drawRoundedRect(x, 40 + (i % 2) * 20, 96, 72, 30);
    room.drawCircle(x + 26, 35 + (i % 2) * 20, 23);
    room.drawCircle(x + 76, 35 + (i % 2) * 20, 23);
    room.endFill();
  }
  for (const x of [95, 850]) {
    room.lineStyle(8, 0xffffff, 0.9);
    room.beginFill(0x9fe1e7);
    room.drawRoundedRect(x, 155, 190, 340, 8);
    room.endFill();
    room.lineStyle(5, 0xffffff, 0.85);
    room.moveTo(x + 95, 160);
    room.lineTo(x + 95, 490);
    room.moveTo(x + 5, 325);
    room.lineTo(x + 185, 325);
  }
  room.lineStyle(0);
  room.beginFill(0x8b5f42);
  room.drawRect(0, 620, 1150, 140);
  room.endFill();
  room.beginFill(0x6d4936);
  room.drawRect(0, 604, 1150, 18);
  room.endFill();
  room.lineStyle(2, 0xb88962, 0.45);
  for (let y = 646; y < 760; y += 28) {
    room.moveTo(0, y);
    room.lineTo(1150, y);
  }
  for (let x = 0; x < 1150; x += 145) {
    room.moveTo(x, 620);
    room.lineTo(x + 35, 760);
  }
  // Tea table and chairs echo the source scene without copying compression.
  room.lineStyle(0);
  room.beginFill(0x694b38);
  room.drawRoundedRect(785, 470, 310, 30, 10);
  room.drawRect(830, 497, 26, 123);
  room.drawRect(1035, 497, 26, 123);
  room.endFill();
  room.beginFill(0xf6f1df);
  room.drawEllipse(880, 463, 22, 10);
  room.drawEllipse(1008, 463, 22, 10);
  room.endFill();
  room.beginFill(0xcd4f68);
  room.drawCircle(882, 438, 13);
  room.beginFill(0x79b8c7);
  room.drawCircle(1010, 438, 13);
  room.endFill();
  layer.addChild(room);

  const roomLabel = new PIXI.Text("MR. BLOCK'S PLAYROOM", {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 22,
    fontWeight: '900',
    fill: 0x8d7357,
    letterSpacing: 3,
  });
  roomLabel.anchor.set(0.5);
  roomLabel.position.set(575, 165);
  roomLabel.alpha = 0.42;
  layer.addChild(roomLabel);
  return layer;
}

function renderFourLetterHud(spinningIndex = -1) {
  const hud = document.getElementById('four-letter-hud');
  const visible = fourLetterIsInstanced();
  if (hud) hud.hidden = !visible;
  if (!visible) return;

  const riddle = currentFourLetterRiddle(fourLetterState);
  const progress = hud.querySelector('[data-four-letter-progress]');
  const copy = hud.querySelector('[data-four-letter-riddle]');
  if (progress) {
    progress.textContent =
      fourLetterState.status === 'staging'
        ? 'Meet Mr. Block'
        : fourLetterState.status === 'solved'
        ? '3 of 3 solved'
        : `Riddle ${fourLetterState.riddleIndex + 1} of ${FOUR_LETTER_RIDDLES.length}`;
  }
  if (copy) {
    copy.textContent =
      fourLetterState.status === 'staging'
        ? fourLetterObjective(fourLetterState)
        : riddle?.text || fourLetterObjective(fourLetterState);
  }
  for (let i = 0; i < 4; i += 1) {
    const cell = hud.querySelector(`[data-four-letter-cell="${i}"]`);
    if (!cell) continue;
    cell.textContent = fourLetterState.letters[i];
    cell.classList.toggle('is-spinning', i === spinningIndex);
  }
  if (app?.view) {
    app.view.dataset.fourLetterStatus = fourLetterState.status;
    app.view.dataset.fourLetterRiddle = String(fourLetterState.riddleIndex + 1);
    app.view.dataset.fourLetterWord = fourLetterWord(fourLetterState);
    app.view.dataset.fourLetterSolved = fourLetterState.solvedWords.join(',');
    app.view.dataset.fourLetterObjective = fourLetterObjective(fourLetterState);
  }
}

function spawnFourLetterBlocks() {
  const xs = [310, 430, 550, 670];
  fourLetterTargets = FOUR_LETTER_BLOCKS.map((block, index) => {
    const letter = fourLetterState.letters[index];
    const spr = new PIXI.Sprite(fourLetterTexture(letter));
    spr.name = block.id;
    spr.anchor.set(0.5, 1);
    spr.scale.set(0.74);
    spr.x = xs[index];
    spr.y = 620;
    spr.zIndex = 45;
    entityLayer.addChild(spr);
    return register({
      classId: 'letter_block',
      label: `Letter Block ${index + 1}`,
      subtitle: `Shows ${letter} · spins through ${block.letters.join(', ')}`,
      sprite: spr,
      state: {
        puzzleState: fourLetterState,
        blockIndex: index,
        letters: [...block.letters],
      },
    });
  });
  return fourLetterTargets;
}

function spawnFourLetterMrBlock() {
  const spr = new PIXI.Sprite(textures.mrBlock?.frames?.[0] || PIXI.Texture.WHITE);
  spr.name = 'mr-block';
  spr.anchor.set(0.5, 1);
  spr.scale.set(1.15);
  spr.x = 690;
  spr.y = 500;
  spr.zIndex = 44;
  entityLayer.addChild(spr);
  fourLetterMrBlock = register({
    classId: 'npc_letterblock',
    label: 'Mr. Block',
    subtitle: 'A charming blockhead with three troubling riddles',
    sprite: spr,
    state: { puzzleState: fourLetterState },
  });
  return fourLetterMrBlock;
}

function openCurrentFourLetterRiddle() {
  const riddle = currentFourLetterRiddle(fourLetterState);
  if (!riddle) return;
  openScriptedQuestDialogue({
    title: 'Mr. Block',
    kicker: `Riddle ${fourLetterState.riddleIndex + 1} of ${FOUR_LETTER_RIDDLES.length}`,
    beats: [{ text: riddle.text, response: 'Hm…' }],
  });
}

function confirmLeaveFourLetterQuest() {
  if (!fourLetterIsInstanced()) return;
  openScriptedQuestDialogue({
    title: 'Mr. Block',
    kicker: 'Leaving so soon?',
    cancelable: true,
    beats: [
      {
        text: 'Oh, are you not having fun here? You can come back and try the riddles again later.',
        response: 'Leave the playroom',
      },
    ],
    onComplete: () => leaveFourLetterQuest({ abandon: true }),
  });
}

function finishFourLetterQuest() {
  if (!fourLetterState || fourLetterState.status !== 'solved') return;
  const updates = applyQuestProgress(questState, 'riddles_solved', 1, pc);
  announceQuestCompletions(
    updates.map((update) =>
      (update.classTsid || update.def?.classTsid) === FOUR_LETTER_QUEST_ID
        ? { ...update, onDismiss: () => leaveFourLetterQuest({ abandon: false }) }
        : update
    )
  );
  pushActivity('Mr. Block is going to be staring at those blocks for days.');
  savePlayerState();
  updateHud();
}

function handleFourLetterTarget(target, verbId) {
  if (!fourLetterIsInstanced() || !target) return;
  if (target.classId === 'npc_letterblock') {
    if (verbId === 'leave') confirmLeaveFourLetterQuest();
    else openCurrentFourLetterRiddle();
    return;
  }
  if (target.classId !== 'letter_block' || verbId !== 'spin') return;

  const index = Number(target.state?.blockIndex);
  const result = spinFourLetterBlock(fourLetterState, index);
  if (!result.ok) {
    toast(result.reason === 'not_running' ? 'Talk to Mr. Block first.' : 'That block will not turn.');
    return;
  }
  target.sprite.texture = fourLetterTexture(result.letter);
  target.sprite._fourLetterSpin = { startedAt: Date.now(), durationMs: 520 };
  target.subtitle = `Shows ${result.letter} · spins through ${target.state.letters.join(', ')}`;
  renderFourLetterHud(index);
  playSfx('pickup', { volume: 0.32, rate: 0.72 + index * 0.08 });
  burst(target.sprite.x, target.sprite.y - 60, 0xffd86b, 7);
  if (!result.solved) return;

  floatText(target.sprite.x, target.sprite.y - 118, `${result.word}!`, 0xffe066);
  pushActivity(`Riddle ${fourLetterState.riddleIndex} solved: ${result.word}.`);
  if (!result.complete) {
    applyQuestProgress(questState, 'riddles_solved', 1, pc);
    updateHud();
    const dialogue = FOUR_LETTER_NEXT_DIALOGUE[fourLetterState.riddleIndex - 1];
    openScriptedQuestDialogue({
      title: 'Mr. Block',
      kicker: `${result.word}!`,
      beats: dialogue,
    });
    return;
  }

  openScriptedQuestDialogue({
    title: 'Mr. Block',
    kicker: 'BEAT!',
    beats: FOUR_LETTER_FINAL_DIALOGUE,
    onComplete: finishFourLetterQuest,
  });
}

async function startFourLetterQuest(opts = {}) {
  if (fourLetterStartPromise) return fourLetterStartPromise;
  if (fourLetterIsInstanced()) return fourLetterState;
  fourLetterStartPromise = (async () => {
    if (!questState.active[FOUR_LETTER_QUEST_ID]) {
      const assigned = assignQuest(questState, FOUR_LETTER_QUEST_ID, { ignorePrereq: true });
      if (!assigned.ok) return null;
    }
    fourLetterSourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x ?? WORLD_W * 0.5,
      y: player?.y ?? GROUND_Y,
    };
    fourLetterState = createFourLetterState();
    fourLetterPlayerBaseScale = player?.baseScale ?? null;
    savePlayerLocation(fourLetterSourceLocation);

    await enterStreet(FOUR_LETTER_BASE_STREET_ID, { quiet: true });
    clearWorldEntities();
    if (bgLayer && world) {
      world.removeChild(bgLayer);
      bgLayer.destroy({ children: true });
    }
    bgLayer = drawPlayroomBackground();
    world.addChildAt(bgLayer, 0);
    currentStreet = {
      tsid: FOUR_LETTER_ROOM_ID,
      label: "Mr. Block's Playroom",
      hubName: 'A very small room',
      bounds: { l: 0, r: 1150, t: 0, b: 760 },
      platforms: bgLayer.platformsScreen,
      signposts: [],
    };
    currentStreetTsid = FOUR_LETTER_ROOM_ID;
    WORLD_W = 1150;
    GROUND_Y = 620;
    streetPlatforms = bgLayer.platformsScreen;
    streetWalls = [];
    climb = { active: false, wall: null };
    spawnFourLetterBlocks();
    spawnFourLetterMrBlock();

    if (player) {
      player.baseScale = (fourLetterPlayerBaseScale || player.baseScale) * 0.42;
      player.x = 180;
      player.y = GROUND_Y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      applyPlayerFacing();
    }
    camTarget = cameraTargetForPlayer(player.x);
    camY = cameraTargetY(player.y, activeCameraWorldHeight(), LOCATION_VIEW_H);
    world.x = -Math.round(camTarget);
    world.y = -Math.round(camY);
    const nameEl = document.getElementById('street-name');
    if (nameEl) {
      nameEl.textContent = "Mr. Block's Playroom · A very small room";
      nameEl.dataset.tsid = FOUR_LETTER_ROOM_ID;
    }
    savePlayerLocation(fourLetterSourceLocation);
    renderFourLetterHud();
    updateHud();
    pushActivity('You shrink down and arrive in Mr. Block’s Playroom.');
    toast('Everything suddenly looks enormous.', 3200);
    openScriptedQuestDialogue({
      title: 'Mr. Block',
      kicker: 'Four Letter Words',
      beats: FOUR_LETTER_INTRO,
      onComplete: () => {
        startFourLetterPuzzle(fourLetterState);
        renderFourLetterHud();
        if (app?.view) app.view.dataset.fourLetterStatus = fourLetterState.status;
      },
    });
    return fourLetterState;
  })();
  try {
    return await fourLetterStartPromise;
  } finally {
    fourLetterStartPromise = null;
  }
}

async function leaveFourLetterQuest({ abandon = false } = {}) {
  if (!fourLetterState || !fourLetterSourceLocation?.tsid) return false;
  const destination = { ...fourLetterSourceLocation };
  if (abandon) {
    delete questState.active[FOUR_LETTER_QUEST_ID];
    pushActivity('You left Mr. Block’s riddles for another time.');
  }
  if (fourLetterPlayerBaseScale && player) {
    player.baseScale = fourLetterPlayerBaseScale;
    applyPlayerFacing();
  }
  fourLetterState = null;
  fourLetterSourceLocation = null;
  fourLetterPlayerBaseScale = null;
  fourLetterTargets = [];
  fourLetterMrBlock = null;
  legalizeTargets = [];
  document.getElementById('four-letter-hud').hidden = true;
  closeQuestDialogue({ force: true });
  await enterStreetWithTransition(destination.tsid, {
    spawnX: destination.x,
    spawnY: destination.y,
    quiet: true,
  });
  if (app?.view) app.view.dataset.fourLetterStatus = abandon ? 'abandoned' : 'completed';
  savePlayerState();
  savePlayerLocation(destination);
  updateHud();
  return true;
}

function updateFourLetterQuest() {
  if (!fourLetterIsInstanced()) return;
  const now = Date.now();
  for (const target of fourLetterTargets) {
    const spin = target.sprite?._fourLetterSpin;
    if (!spin) continue;
    const progress = clamp((now - spin.startedAt) / spin.durationMs, 0, 1);
    const bounce = Math.sin(progress * Math.PI);
    target.sprite.rotation = Math.sin(progress * Math.PI * 2) * 0.075;
    target.sprite.scale.set(0.74 + bounce * 0.08, 0.74 - bounce * 0.05);
    if (progress >= 1) {
      target.sprite.rotation = 0;
      target.sprite.scale.set(0.74);
      delete target.sprite._fourLetterSpin;
      renderFourLetterHud();
    }
  }

  if (new URLSearchParams(location.search).get('letterautoplay') !== '1') return;
  if (now < (fourLetterState._autoNextAt || 0)) return;
  fourLetterState._autoNextAt = now + 260;
  if (isQuestDialogueOpen()) {
    advanceQuestDialogue();
    return;
  }
  if (fourLetterState.status !== 'running') return;
  const answer = currentFourLetterRiddle(fourLetterState)?.answer;
  if (!answer) return;
  const index = fourLetterState.letters.findIndex((letter, i) => letter !== answer[i]);
  if (index >= 0) handleFourLetterTarget(fourLetterTargets[index], 'spin');
}

const LEGALIZE_ASSET_ROOT = 'assets/sprites/quests/legalize';
const LEGALIZE_BUREAUCRAT_ART = [
  'npc_bureaucrat_arms_01_glasses_none_hair_01_legs_01_necklace_none_tie_01_torso_01_x1_iconic_png_1354832989.png',
  'npc_bureaucrat_arms_02_glasses_none_hair_02_legs_02_necklace_none_tie_02_torso_02_x1_iconic_png_1354832997.png',
  'npc_bureaucrat_arms_03_glasses_none_hair_04_legs_03_necklace_01_tie_none_torso_03_x1_iconic_png_1354833006.png',
  'npc_bureaucrat_arms_04_glasses_none_hair_05_legs_04_necklace_02_tie_none_torso_04_x1_iconic_png_1354833015.png',
];

function legalizeIsInstanced() {
  return Boolean(
    legalizeRun &&
      [
        LEGALIZE_GRANGE_STATION_TSID,
        LEGALIZE_BACK_ALLEY_TSID,
        LEGALIZE_BACK_ALLEY_STATION_TSID,
        LEGALIZE_GRANGE_TSID,
        LEGALIZE_HALL_TSID,
      ].includes(currentStreetTsid)
  );
}

function legalizeStageProgress(state = legalizeRun) {
  if (!state) return 0;
  if (['gregarious_departure', 'back_alley'].includes(state.stage)) return 1;
  if (['back_alley_briefed', 'back_alley_station'].includes(state.stage)) return 2;
  if (['gregarious_arrival', 'grange_exterior'].includes(state.stage)) return 3;
  if (['hall_waiting', 'hall_called'].includes(state.stage)) return 4;
  return 5;
}

function renderLegalizeHud() {
  const hud = document.getElementById('legalize-hud');
  const visible = legalizeIsInstanced();
  if (hud) hud.hidden = !visible;
  if (!visible) return;
  const progress = legalizeStageProgress();
  const stage = hud.querySelector('[data-legalize-stage]');
  const count = hud.querySelector('[data-legalize-progress]');
  const objective = hud.querySelector('[data-legalize-objective]');
  if (stage) {
    const labels = {
      gregarious_departure: 'Gregarious Grange Subway Station',
      back_alley: 'The Back Alley',
      back_alley_briefed: 'The Back Alley',
      back_alley_station: 'The Back Alley Subway Station',
      gregarious_arrival: 'Gregarious Grange Subway Station',
      grange_exterior: 'Gregarious Grange',
      hall_waiting: 'Bureaucratic Hall · waiting area',
      hall_called: `Bureaucratic Hall · ${LEGALIZE_CLERKS[legalizeRun.clerkIndex].name}`,
      hall_processing: `Bureaucratic Hall · ${LEGALIZE_CLERKS[legalizeRun.clerkIndex].name}`,
      card_owned: 'Qualification received',
      complete: 'Qualification activated',
    };
    stage.textContent = labels[legalizeRun.stage] || 'Legalize It';
  }
  if (count) count.textContent = `${progress} / 5`;
  if (objective) objective.textContent = legalizeObjective(legalizeRun);
  const dots = ['alley', 'subway', 'hall', 'waiting', 'activate'];
  dots.forEach((name, index) => {
    hud.querySelector(`[data-legalize-dot="${name}"]`)?.classList.toggle(
      'is-done',
      index < progress
    );
  });
  if (app?.view) {
    app.view.dataset.legalizeStage = legalizeRun.stage;
    app.view.dataset.legalizeHandoffs = String(legalizeRun.handoffs);
    app.view.dataset.legalizeClerk = String(legalizeRun.clerkIndex);
    app.view.dataset.legalizeObjective = legalizeObjective(legalizeRun);
    app.view.dataset.legalizeCardOwned = legalizeRun.cardOwned ? '1' : '0';
    app.view.dataset.legalizeActivated = legalizeRun.activated ? '1' : '0';
    app.view.dataset.legalizeRoute =
      'gregarious-subway>back-alley>gregarious-subway>gregarious-grange>bureaucratic-hall';
    app.view.dataset.legalizeBackAlleyBriefed =
      ['back_alley_briefed', 'back_alley_station', 'gregarious_arrival', 'grange_exterior',
        'hall_waiting', 'hall_called', 'hall_processing', 'card_owned', 'complete']
        .includes(legalizeRun.stage)
        ? '1'
        : '0';
    app.view.dataset.legalizeArt = 'recovered-subway-forest-hall';
    app.view.dataset.legalizeClerkArt = 'recovered-animated-bureaucrats';
    app.view.dataset.legalizeQuestion = 'Beige|Other';
  }
}

function legalizeRoomBase(name, width = 1600, height = 760, groundY = 620) {
  const layer = new PIXI.Container();
  layer.name = name;
  layer.worldH = height;
  layer.platformsScreen = [
    { id: `${name}-floor`, x1: 0, y1: groundY, x2: width, y2: groundY, pc_perm: 1 },
  ];
  return layer;
}

function drawLegalizeSubwayStation(stationName, destinationName) {
  const layer = legalizeRoomBase(`legalize-subway-${stationName.toLowerCase().replace(/\W+/g, '-')}`);
  const wall = new PIXI.Graphics();
  wall.beginFill(0x747774);
  wall.drawRect(0, 0, 1600, 620);
  wall.endFill();
  wall.beginFill(0x2d302f);
  wall.drawRect(0, 0, 1600, 92);
  wall.endFill();
  wall.beginFill(0x4f5351);
  for (let x = 35; x < 1600; x += 205) wall.drawRect(x, 100, 7, 480);
  wall.endFill();
  layer.addChild(wall);

  const train = new PIXI.Graphics();
  train.name = 'legalize-subway-train';
  train.beginFill(0xe4e6df);
  train.lineStyle(5, 0x3c4546, 1);
  train.drawRoundedRect(165, 260, 1120, 278, 74);
  train.endFill();
  train.beginFill(0x58676a);
  train.drawRoundedRect(240, 300, 410, 118, 22);
  train.drawRoundedRect(690, 300, 410, 118, 22);
  train.endFill();
  train.beginFill(0xa9c1c2, 0.72);
  train.drawRoundedRect(272, 317, 160, 84, 14);
  train.drawRoundedRect(452, 317, 160, 84, 14);
  train.drawRoundedRect(722, 317, 160, 84, 14);
  train.drawRoundedRect(902, 317, 160, 84, 14);
  train.endFill();
  train.zIndex = 1;
  layer.addChild(train);

  const platform = PIXI.Sprite.from('assets/decos/groddle/subway_platform_1.png');
  platform.anchor.set(0, 1);
  platform.position.set(0, 760);
  platform.width = 1600;
  platform.height = 414;
  platform.zIndex = 0;
  layer.addChild(platform);
  // Re-add the train after the opaque platform PNG so it remains visible.
  layer.addChild(train);

  const title = new PIXI.Text(stationName.toUpperCase(), {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 23,
    fontWeight: '900',
    fill: 0xd9d6c7,
    letterSpacing: 3,
  });
  title.anchor.set(0.5);
  title.position.set(800, 115);
  title.alpha = 0.72;
  title.zIndex = 2;
  layer.addChild(title);

  const destination = new PIXI.Text(`NEXT TRAIN · ${destinationName}`, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 16,
    fontWeight: '700',
    fill: 0xf1efe2,
  });
  destination.anchor.set(0.5);
  destination.position.set(800, 154);
  destination.alpha = 0.76;
  destination.zIndex = 2;
  layer.addChild(destination);
  return layer;
}

function drawLegalizeBackAlley() {
  const layer = legalizeRoomBase('legalize-back-alley-forest');
  const sky = new PIXI.Graphics();
  sky.beginFill(0x142d20);
  sky.drawRect(0, 0, 1600, 620);
  sky.endFill();
  sky.beginFill(0x285039, 0.74);
  sky.drawEllipse(790, 300, 680, 310);
  sky.endFill();
  sky.beginFill(0xa8dca3, 0.13);
  sky.drawPolygon([560, 0, 850, 0, 1060, 620, 770, 620]);
  sky.endFill();
  layer.addChild(sky);

  const rearTrees = [
    ['tree_background_01.png', 80, 500, 1.65],
    ['tree_background_02.png', 310, 500, 1.7],
    ['tree_background_03.png', 530, 500, 1.8],
    ['tree_background_02.png', 780, 500, 1.55],
    ['tree_background_01.png', 1080, 500, 1.75],
    ['tree_background_03.png', 1390, 500, 1.9],
  ];
  for (const [file, x, y, scale] of rearTrees) {
    const tree = PIXI.Sprite.from(`assets/decos/groddle/${file}`);
    tree.anchor.set(0.5, 1);
    tree.position.set(x, y);
    tree.scale.set(scale);
    tree.alpha = 0.72;
    layer.addChild(tree);
  }

  const hole = PIXI.Sprite.from('assets/decos/groddle/forest_hole_back.png');
  hole.anchor.set(0.5, 1);
  hole.position.set(285, 620);
  hole.scale.set(1.05);
  layer.addChild(hole);

  const floor = PIXI.Sprite.from('assets/decos/groddle/ground_forest_terrain_plat_01.png');
  floor.anchor.set(0.5, 1);
  floor.position.set(800, 760);
  floor.width = 1660;
  floor.height = 238;
  layer.addChild(floor);

  const frontTrees = [
    ['tree_front_02.png', 90, 655, 0.68],
    ['tree_dark_1.png', 1510, 660, 0.58],
    ['tree_front_01.png', 1240, 640, 0.92],
  ];
  for (const [file, x, y, scale] of frontTrees) {
    const tree = PIXI.Sprite.from(`assets/decos/groddle/${file}`);
    tree.anchor.set(0.5, 1);
    tree.position.set(x, y);
    tree.scale.set(scale);
    tree.alpha = 0.96;
    layer.addChild(tree);
  }
  layer.sortableChildren = true;
  return layer;
}

function drawGregariousGrangeExterior() {
  const layer = legalizeRoomBase('legalize-gregarious-grange');
  const meadow = new PIXI.Graphics();
  meadow.beginFill(0xbde8ef);
  meadow.drawRect(0, 0, 1600, 620);
  meadow.endFill();
  meadow.beginFill(0x7fb45e);
  meadow.drawEllipse(320, 590, 760, 260);
  meadow.drawEllipse(1180, 590, 880, 285);
  meadow.drawRect(0, 520, 1600, 240);
  meadow.endFill();
  meadow.beginFill(0x5b933f);
  meadow.drawRect(0, 610, 1600, 150);
  meadow.endFill();
  layer.addChild(meadow);

  for (const [file, x, scale] of [
    ['tree_deciduous1.png', 170, 1.2],
    ['tree_deciduous2.png', 455, 1.12],
    ['tree_deciduous3.png', 1450, 1.08],
  ]) {
    const tree = PIXI.Sprite.from(`assets/decos/groddle/${file}`);
    tree.anchor.set(0.5, 1);
    tree.position.set(x, 620);
    tree.scale.set(scale);
    layer.addChild(tree);
  }

  const subway = PIXI.Sprite.from('assets/decos/groddle/subway_station_entrance.png');
  subway.anchor.set(0.5, 1);
  subway.position.set(335, 620);
  subway.scale.set(0.34);
  subway.alpha = 0.92;
  layer.addChild(subway);

  const flowers = new PIXI.Graphics();
  for (let i = 0; i < 44; i++) {
    const x = 30 + ((i * 149) % 1540);
    const y = 548 + ((i * 37) % 58);
    flowers.beginFill(i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffdf6b : 0xf0a7d8);
    flowers.drawCircle(x, y, 2.5);
    flowers.endFill();
  }
  layer.addChild(flowers);
  layer.sortableChildren = true;
  return layer;
}

function drawBureaucraticHall() {
  const layer = legalizeRoomBase('legalize-bureaucratic-hall');
  const room = new PIXI.Graphics();
  room.beginFill(0xe7e3d4);
  room.drawRect(0, 0, 1600, 620);
  room.endFill();
  room.beginFill(0xd4cfbd);
  room.drawRect(0, 500, 1600, 120);
  room.endFill();
  room.beginFill(0x77766d);
  room.drawRect(0, 620, 1600, 140);
  room.endFill();
  room.lineStyle(2, 0xb9b3a1, 0.5);
  for (let x = 0; x < 1600; x += 120) {
    room.moveTo(x, 620);
    room.lineTo(x + 60, 760);
  }
  room.lineStyle(0);
  room.beginFill(0x9a5735);
  for (const x of [90, 180, 270, 360]) {
    room.drawRoundedRect(x, 526, 58, 15, 6);
    room.drawRoundedRect(x + 5, 541, 48, 36, 5);
    room.drawRect(x + 11, 575, 6, 45);
    room.drawRect(x + 41, 575, 6, 45);
  }
  room.endFill();
  layer.addChild(room);

  const waiting = new PIXI.Text('WAITING\nAREA', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 17,
    fontWeight: '900',
    fill: 0xeee9d9,
    align: 'center',
  });
  waiting.anchor.set(0.5);
  waiting.position.set(255, 460);
  const plaque = new PIXI.Graphics();
  plaque.beginFill(0x4a4b46);
  plaque.drawRoundedRect(195, 420, 120, 76, 5);
  plaque.endFill();
  layer.addChild(plaque, waiting);

  const tv = PIXI.Sprite.from('assets/decos/groddle/bureaucratic_hall_tv_1.png');
  tv.anchor.set(0.5);
  tv.position.set(690, 215);
  tv.scale.set(0.72);
  layer.addChild(tv);

  const light = PIXI.Sprite.from('assets/decos/groddle/bureaucratic_hall_light_1.png');
  light.anchor.set(0.5, 0);
  light.position.set(1110, 18);
  light.scale.set(1.35);
  layer.addChild(light);
  layer.sortableChildren = true;
  return layer;
}

function installLegalizeScene(layer, { tsid, label, hubName, spawnX }) {
  clearWorldEntities();
  if (bgLayer && world) {
    world.removeChild(bgLayer);
    bgLayer.destroy({ children: true });
  }
  bgLayer = layer;
  world.addChildAt(bgLayer, 0);
  currentStreet = {
    tsid,
    label,
    hubName,
    bounds: { l: 0, r: 1600, t: 0, b: 760 },
    platforms: layer.platformsScreen,
    signposts: [],
  };
  currentStreetTsid = tsid;
  WORLD_W = 1600;
  GROUND_Y = 620;
  streetPlatforms = layer.platformsScreen;
  streetWalls = [];
  climb = { active: false, wall: null };
  Object.assign(jumpState, createJumpState(movementNow()));
  if (player) {
    player.position.set(spawnX, GROUND_Y);
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    applyPlayerFacing();
  }
  camTarget = cameraTargetForPlayer(player?.x || spawnX);
  camY = cameraTargetY(
    player?.y || GROUND_Y,
    activeCameraWorldHeight(),
    LOCATION_VIEW_H
  );
  world.x = -Math.round(camTarget);
  world.y = -Math.round(camY);
  const nameEl = document.getElementById('street-name');
  if (nameEl) {
    nameEl.textContent = `${label} · ${hubName}`;
    nameEl.dataset.tsid = tsid;
  }
  savePlayerLocation(legalizeSourceLocation);
}

function makeLegalizeBureaucrat(index, x, y, scale = 0.86) {
  const idle = textures[`bureaucrat${index}Idle`]?.frames;
  const talk = textures[`bureaucrat${index}Talk`]?.frames;
  const fallback = PIXI.Texture.from(`${LEGALIZE_ASSET_ROOT}/${LEGALIZE_BUREAUCRAT_ART[index]}`);
  const spr = new PIXI.AnimatedSprite(idle?.length ? idle : [fallback]);
  spr.texturesIdle = idle?.length ? idle : [fallback];
  spr.texturesTalk = talk?.length ? talk : spr.texturesIdle;
  spr.anchor.set(0.5, 1);
  spr.position.set(x, y);
  spr.scale.set(scale);
  spr.animationSpeed = 0.18;
  spr.loop = true;
  spr.autoUpdate = true;
  spr.play();
  spr.zIndex = 40;
  return spr;
}

function setLegalizeBureaucratAnimation(target, mode = 'idle', durationMs = 0) {
  const spr = target?.sprite;
  if (!(spr instanceof PIXI.AnimatedSprite)) return;
  spr.textures = mode === 'talk' ? spr.texturesTalk : spr.texturesIdle;
  spr.animationSpeed = mode === 'talk' ? 0.24 : 0.12;
  spr.gotoAndPlay(0);
  spr._legalizeAnimation = mode;
  spr._legalizeAnimationUntil = durationMs ? Date.now() + durationMs : 0;
}

function spawnLegalizeTransitGate({
  label,
  subtitle,
  action,
  x = 1370,
  scale = 3.4,
}) {
  const gate = PIXI.Sprite.from(
    `${LEGALIZE_ASSET_ROOT}/subway_gate__x1_1_png_1354832987.png`
  );
  gate.anchor.set(0.5, 1);
  gate.position.set(x, GROUND_Y);
  gate.scale.set(scale);
  gate.zIndex = 42;
  entityLayer.addChild(gate);
  const target = register({
    classId: 'legalize_transit_gate',
    label,
    subtitle,
    sprite: gate,
    state: { legalizeState: legalizeRun, routeAction: action },
  });
  legalizeTargets.push(target);
  return target;
}

function spawnLegalizeDepartureStation() {
  installLegalizeScene(
    drawLegalizeSubwayStation('Gregarious Grange Subway Station', 'The Back Alley'),
    {
      tsid: LEGALIZE_GRANGE_STATION_TSID,
      label: 'Gregarious Grange Subway Station',
      hubName: 'Groddle Meadow',
      spawnX: 220,
    }
  );
  legalizeTargets = [];
  spawnLegalizeTransitGate({
    label: 'Subway Map',
    subtitle: 'Travel to The Back Alley',
    action: 'depart_back_alley',
  });
  renderLegalizeHud();
}

function spawnLegalizeBackAlley() {
  installLegalizeScene(drawLegalizeBackAlley(), {
    tsid: LEGALIZE_BACK_ALLEY_TSID,
    label: 'The Back Alley',
    hubName: 'Instance',
    spawnX: 1120,
  });
  legalizeTargets = [];

  const shady = makeLegalizeBureaucrat(0, 880, GROUND_Y, 0.88);
  shady.zIndex = 43;
  entityLayer.addChild(shady);
  legalizeTargets.push(register({
    classId: 'npc_back_alley_bureaucrat',
    label: 'Shady Bureaucrat',
    subtitle:
      legalizeRun.stage === 'back_alley'
        ? 'Pssst. I know a route through the red tape.'
        : 'The closest Hall is marked on your route.',
    sprite: shady,
    state: { legalizeState: legalizeRun },
  }));

  const entrance = PIXI.Sprite.from('assets/decos/groddle/subway_station_entrance.png');
  entrance.anchor.set(0.5, 1);
  entrance.position.set(285, GROUND_Y);
  entrance.scale.set(0.53);
  entrance.zIndex = 41;
  entityLayer.addChild(entrance);
  legalizeTargets.push(register({
    classId: 'legalize_subway_entrance',
    label: 'Back Alley Subway',
    subtitle:
      legalizeRun.stage === 'back_alley_briefed'
        ? 'Return to Gregarious Grange'
        : 'Speak with the Bureaucrat first',
    sprite: entrance,
    state: { legalizeState: legalizeRun, routeAction: 'enter_back_alley_station' },
  }));
  renderLegalizeHud();
}

function spawnLegalizeBackAlleyStation() {
  installLegalizeScene(
    drawLegalizeSubwayStation('The Back Alley Subway Station', 'Gregarious Grange'),
    {
      tsid: LEGALIZE_BACK_ALLEY_STATION_TSID,
      label: 'The Back Alley Subway Station',
      hubName: 'Instance',
      spawnX: 220,
    }
  );
  legalizeTargets = [];
  spawnLegalizeTransitGate({
    label: 'Subway Map',
    subtitle: 'Travel to Gregarious Grange',
    action: 'travel_gregarious',
  });
  renderLegalizeHud();
}

function spawnLegalizeGregariousStation() {
  installLegalizeScene(
    drawLegalizeSubwayStation('Gregarious Grange Subway Station', 'Gregarious Grange'),
    {
      tsid: LEGALIZE_GRANGE_STATION_TSID,
      label: 'Gregarious Grange Subway Station',
      hubName: 'Groddle Meadow',
      spawnX: 220,
    }
  );
  legalizeTargets = [];
  spawnLegalizeTransitGate({
    label: 'Station Exit',
    subtitle: 'Exit to Gregarious Grange',
    action: 'exit_gregarious_station',
  });
  renderLegalizeHud();
}

function spawnLegalizeGregariousExterior() {
  installLegalizeScene(drawGregariousGrangeExterior(), {
    tsid: LEGALIZE_GRANGE_TSID,
    label: 'Gregarious Grange',
    hubName: 'Groddle Meadow',
    spawnX: 390,
  });
  legalizeTargets = [];
  const hall = PIXI.Sprite.from('assets/decos/groddle/bureaucratic_hall_exterior_1.png');
  hall.anchor.set(0.5, 1);
  hall.position.set(1110, GROUND_Y);
  hall.scale.set(0.27);
  hall.zIndex = 42;
  entityLayer.addChild(hall);
  legalizeTargets.push(register({
    classId: 'legalize_hall_entrance',
    label: 'Bureaucratic Hall',
    subtitle: 'Bureau of Administrative Affairs · Ministry of Departments',
    sprite: hall,
    state: { legalizeState: legalizeRun, routeAction: 'enter_hall' },
  }));
  renderLegalizeHud();
}

function spawnLegalizeHall() {
  installLegalizeScene(drawBureaucraticHall(), {
    tsid: LEGALIZE_HALL_TSID,
    label: 'Bureaucratic Hall',
    hubName: 'Gregarious Grange',
    spawnX: 135,
  });
  legalizeTargets = LEGALIZE_CLERKS.map((clerk, index) => {
    const spr = makeLegalizeBureaucrat(index, 850 + index * 170, 555, 0.84);
    spr.zIndex = 40;
    entityLayer.addChild(spr);
    return register({
      classId: 'npc_bureaucrat',
      label: clerk.name,
      subtitle: index === legalizeRun.clerkIndex ? 'Handling your application' : 'Not your department',
      sprite: spr,
      state: { legalizeState: legalizeRun, clerkIndex: index },
    });
  });
  const counter = PIXI.Sprite.from('assets/decos/groddle/bureaucratic_hall_counter_1.png');
  counter.anchor.set(0.5, 1);
  counter.position.set(830, GROUND_Y);
  counter.width = 1020;
  counter.height = 132;
  counter.zIndex = 44;
  counter.eventMode = 'none';
  entityLayer.addChild(counter);
  refreshLegalizeClerks();
  renderLegalizeHud();
}

function refreshLegalizeClerks() {
  for (const target of legalizeTargets) {
    if (target.classId !== 'npc_bureaucrat') continue;
    const index = Number(target.state?.clerkIndex);
    const current = index === Number(legalizeRun.clerkIndex);
    const called =
      current && ['hall_called', 'hall_processing', 'card_owned'].includes(legalizeRun.stage);
    target.subtitle = called
      ? 'Handling your application'
      : current
        ? 'Please wait to be called'
        : 'Not your department';
    target.sprite.alpha = called ? 1 : 0.82;
    target.sprite.position.set(called ? 520 + index * 70 : 850 + index * 170, called ? GROUND_Y : 555);
    target.sprite.zIndex = called ? 48 : 40;
  }
  entityLayer.sortChildren();
  renderLegalizeHud();
}

function callNextLegalizeClerk() {
  const called = callLegalizeApplicant(legalizeRun);
  if (!called.ok) return called;
  refreshLegalizeClerks();
  const target = legalizeTargets.find(
    (entry) =>
      entry.classId === 'npc_bureaucrat' &&
      Number(entry.state?.clerkIndex) === Number(legalizeRun.clerkIndex)
  );
  if (target) {
    setLegalizeBureaucratAnimation(target, 'talk', 5200);
    showSpeechBubble(target, {
      speaker: called.clerk.name,
      text: 'Attention, Ur! When you’re ready?',
      durationMs: 5200,
    });
  }
  pushActivity(`${called.clerk.name} calls you to the counter.`);
  return called;
}

function openLegalizeQuestion(result) {
  openScriptedQuestDialogue({
    title: result.clerk.name,
    kicker: 'Bureaucratic Hall',
    beats: [{
      text: 'I understand you’re here to procure yourself a Card-Carrying Qualification, is that right?',
      response: 'YES',
    }],
    primaryLabel: 'YES',
    onComplete: () => openLegalizeQuestionChoice(result),
  });
}

function openLegalizeQuestionChoice(result) {
  const options = result.question.options;
  openScriptedQuestDialogue({
    title: result.clerk.name,
    kicker: 'Bureaucratic Hall',
    beats: [{ text: result.question.text, response: options[0] }],
    primaryLabel: options[0],
    cancelLabel: options[1],
    cancelable: true,
    onComplete: () => resolveLegalizeAnswer(0),
    onCancel: () => resolveLegalizeAnswer(1),
  });
}

function openLegalizeItemSelection(result) {
  openScriptedQuestDialogue({
    title: result.clerk.name,
    kicker: 'Available documentation',
    beats: [{
      text: 'The following items are available to you:',
      response: `Card-Carrying Qualification (${LEGALIZE_CARD_COST}c)`,
    }],
    primaryLabel: `Qualification (${LEGALIZE_CARD_COST}c)`,
    cancelLabel: 'Nevermind',
    cancelable: true,
    onComplete: transferLegalizeRequest,
  });
}

function transferLegalizeRequest() {
  const result = requestLegalizeQualification(legalizeRun);
  if (!result.ok) return;
  refreshLegalizeClerks();
  openScriptedQuestDialogue({
    title: LEGALIZE_CLERKS[0].name,
    kicker: 'Application transferred',
    beats: [{
      text: `I understand you’re hoping to attain a Card-Carrying Qualification, Ur. That’s a matter for ${result.clerk.name}. Let me find out if they’re in the office this week.`,
      response: 'OK',
    }],
    onComplete: callNextLegalizeClerk,
  });
}

function resolveLegalizeAnswer(optionIndex) {
  const result = answerLegalizeQuestion(legalizeRun, optionIndex);
  if (!result.ok) return;
  openScriptedQuestDialogue({
    title: result.clerk.name,
    kicker: 'Application approved',
    beats: [{
      text: `Very well. The fee is ${LEGALIZE_CARD_COST}. We only accept cash.`,
      response: `Pay ${LEGALIZE_CARD_COST}`,
    }],
    primaryLabel: `Pay ${LEGALIZE_CARD_COST}`,
    cancelLabel: 'Nevermind',
    cancelable: true,
    onComplete: finishLegalizePurchase,
  });
}

function finishLegalizePurchase() {
  const result = purchaseQualification(legalizeRun, pc.currants, Date.now());
  if (!result.ok) {
    toast(`You need ${result.shortfall} more currants.`);
    openScriptedQuestDialogue({
      title: LEGALIZE_CLERKS[legalizeRun.clerkIndex].name,
      kicker: 'Insufficient funds',
      beats: [{ text: "Oops, you don't have enough for that. Come back when you do.", response: 'OK' }],
    });
    return;
  }
  pc.currants -= result.cost;
  addItem(inv, LEGALIZE_CARD_ID, 1);
  applyQuestProgress(questState, 'acquired_card_carrying_qualification', 1, pc);
  playSfx('pickup', { volume: 0.55, rate: 0.88 });
  pushActivity(`You paid ${result.cost} currants and received a Card-Carrying Qualification.`);
  floatText(player.x, player.y - 90, 'Qualification acquired', 0xffe066);
  burst(player.x, player.y - 50, 0xffe066, 15);
  renderLegalizeHud();
  updateHud();
  openScriptedQuestDialogue({
    title: LEGALIZE_CLERKS[legalizeRun.clerkIndex].name,
    kicker: 'Transaction complete',
    beats: [{
      text: 'Thank you for your business. To conduct another transaction, you must exit and re-enter the Hall.',
      response: 'OK',
    }],
  });
}

function handleLegalizeTarget(target, verbId) {
  if (!legalizeIsInstanced() || !target) return;
  if (target.classId === 'npc_back_alley_bureaucrat' && verbId === 'talk_to') {
    if (legalizeRun.stage !== 'back_alley') {
      toast('The Bureaucratic Hall on Gregarious Grange is marked on your route.');
      return;
    }
    setLegalizeBureaucratAnimation(target, 'talk', 13_000);
    openScriptedQuestDialogue({
      title: 'Shady Bureaucrat',
      kicker: 'The Back Alley',
      beats: LEGALIZE_BACK_ALLEY_BEATS,
      onComplete: () => {
        const result = completeBackAlleyBriefing(legalizeRun);
        if (!result.ok) return;
        setLegalizeBureaucratAnimation(target, 'idle');
        target.subtitle = 'The closest Hall is marked on your route.';
        const entrance = legalizeTargets.find(
          (entry) => entry.classId === 'legalize_subway_entrance'
        );
        if (entrance) entrance.subtitle = 'Return to Gregarious Grange';
        pushActivity('The Shady Bureaucrat marks the Bureaucratic Hall on your route.');
        renderLegalizeHud();
      },
    });
    return;
  }
  if (
    [
      'legalize_transit_gate',
      'legalize_subway_entrance',
      'legalize_hall_entrance',
    ].includes(target.classId)
  ) {
    const action = target.state?.routeAction;
    let result = { ok: false };
    let spawn = null;
    let activity = '';
    let message = '';
    if (action === 'depart_back_alley' && verbId === 'travel') {
      result = departForBackAlley(legalizeRun);
      spawn = spawnLegalizeBackAlley;
      activity = 'The subway carries you into The Back Alley.';
      message = 'Find the Shady Bureaucrat in the forest.';
    } else if (action === 'enter_back_alley_station' && verbId === 'enter') {
      result = enterBackAlleyStation(legalizeRun);
      spawn = spawnLegalizeBackAlleyStation;
      activity = 'You enter The Back Alley Subway Station.';
      message = 'Take the train back to Gregarious Grange.';
    } else if (action === 'travel_gregarious' && verbId === 'travel') {
      result = travelToGregarious(legalizeRun);
      spawn = spawnLegalizeGregariousStation;
      activity = 'The subway returns you to Gregarious Grange.';
      message = 'Exit the station to reach the Bureaucratic Hall.';
    } else if (action === 'exit_gregarious_station' && verbId === 'exit') {
      result = exitToGregariousGrange(legalizeRun);
      spawn = spawnLegalizeGregariousExterior;
      activity = 'You step out onto Gregarious Grange.';
      message = 'The Bureaucratic Hall is just across the meadow.';
    } else if (action === 'enter_hall' && verbId === 'enter') {
      result = enterBureaucraticHall(legalizeRun);
      spawn = spawnLegalizeHall;
      activity = 'You enter the Bureaucratic Hall.';
      message = 'Please move into the waiting area to your left.';
    }
    if (!result.ok || !spawn) return;
    legalizeTransitionBusy = true;
    spawn();
    legalizeTransitionBusy = false;
    pushActivity(activity);
    toast(message, 4200);
    if (action === 'enter_hall') {
      openScriptedQuestDialogue({
        title: 'Bureaucrat',
        kicker: 'Bureaucratic Hall',
        beats: [{
          text: 'Ur! We will be with you as soon as possible. Now please go and wait.',
          response: 'Go and wait',
        }],
      });
    }
    return;
  }
  if (target.classId !== 'npc_bureaucrat' || verbId !== 'talk_to') return;
  if (Number(target.state?.clerkIndex) !== Number(legalizeRun.clerkIndex)) {
    toast('This is not the clerk handling your application.');
    return;
  }
  const result = beginLegalizeApplication(legalizeRun);
  if (!result.ok) {
    toast('Please wait until your name is called.');
    return;
  }
  refreshLegalizeClerks();
  setLegalizeBureaucratAnimation(target, 'talk', 7000);
  if (result.reason === 'item_selection') openLegalizeItemSelection(result);
  else openLegalizeQuestion(result);
}

function activateLegalizeCard() {
  const legalize = ensureLegalizeState(questState);
  const result = activateQualification(
    legalize,
    countItem(inv, LEGALIZE_CARD_ID) > 0,
    Date.now()
  );
  if (!result.ok) {
    toast(result.reason === 'already_activated' ? 'Already activated.' : 'The qualification is missing.');
    return false;
  }
  removeItem(inv, LEGALIZE_CARD_ID, 1);
  const badge = unlockAchievement(achieveState, LEGALIZE_CARD_ID, pc);
  if (badge.ok) {
    announceAchievementUpdates([
      {
        classTsid: LEGALIZE_CARD_ID,
        unlocked: true,
        rewards: badge.rewards,
        def: badge.def,
      },
    ]);
  }
  const updates = applyQuestProgress(questState, 'ccq_completed', 1, pc);
  announceQuestCompletions(
    updates.map((update) =>
      (update.classTsid || update.def?.classTsid) === LEGALIZE_QUEST_ID
        ? { ...update, onDismiss: () => leaveLegalizeIt({ abandon: false }) }
        : update
    )
  );
  playSfx('quest', { volume: 0.65, rate: 1.04 });
  pushActivity('You activated your Card-Carrying Qualification.');
  toast('Your qualification is now active.', 3600);
  renderLegalizeHud();
  updateHud();
  savePlayerState();
  return true;
}

async function startLegalizeIt(opts = {}) {
  if (legalizeStartPromise) return legalizeStartPromise;
  if (legalizeIsInstanced()) return legalizeRun;
  legalizeStartPromise = (async () => {
    if (!questState.active?.[LEGALIZE_QUEST_ID]) {
      const assigned = assignQuest(questState, LEGALIZE_QUEST_ID, { ignorePrereq: true });
      if (!assigned.ok) return null;
    }
    legalizeSourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x ?? WORLD_W * 0.5,
      y: player?.y ?? GROUND_Y,
    };
    legalizeRun = ensureLegalizeState(questState, legalizeSourceLocation);
    legalizeRun.sourceLocation ||= createLegalizeState(legalizeSourceLocation).sourceLocation;
    legalizeSourceLocation = legalizeRun.sourceLocation || legalizeSourceLocation;
    savePlayerLocation(legalizeSourceLocation);
    const stage = legalizeRun.stage;
    if (stage === 'gregarious_departure') {
      spawnLegalizeDepartureStation();
      pushActivity('You arrive at Gregarious Grange Subway Station.');
      toast('Take the subway to The Back Alley.', 3600);
    } else if (['back_alley', 'back_alley_briefed'].includes(stage)) {
      spawnLegalizeBackAlley();
      pushActivity('You arrive in the forest at The Back Alley.');
      toast(
        stage === 'back_alley'
          ? 'Find the Shady Bureaucrat.'
          : 'Return through The Back Alley Subway Station.',
        3600
      );
    } else if (stage === 'back_alley_station') {
      spawnLegalizeBackAlleyStation();
      pushActivity('You return to The Back Alley Subway Station.');
      toast('Take the subway to Gregarious Grange.', 3600);
    } else if (stage === 'gregarious_arrival') {
      spawnLegalizeGregariousStation();
      pushActivity('You arrive at Gregarious Grange Subway Station.');
      toast('Exit the station to Gregarious Grange.', 3600);
    } else if (stage === 'grange_exterior') {
      spawnLegalizeGregariousExterior();
      pushActivity('You return to Gregarious Grange.');
      toast('Enter the Bureaucratic Hall across the meadow.', 3600);
    } else {
      spawnLegalizeHall();
      pushActivity('You return to the Bureaucratic Hall on Gregarious Grange.');
      if (stage === 'hall_waiting') {
        legalizeWaitStartedAt = 0;
        toast('Please move into the waiting area.', 3600);
      }
    }
    renderLegalizeHud();
    updateHud();
    return legalizeRun;
  })();
  try {
    return await legalizeStartPromise;
  } finally {
    legalizeStartPromise = null;
  }
}

async function leaveLegalizeIt({ abandon = false } = {}) {
  if (!legalizeRun || legalizeTransitionBusy) return false;
  const destination = legalizeSourceLocation || legalizeRun.sourceLocation;
  if (!destination?.tsid) return false;
  legalizeTransitionBusy = true;
  if (abandon && legalizeRun.stage !== 'complete') {
    delete questState.active[LEGALIZE_QUEST_ID];
    delete questState.story?.legalize;
    removeItem(inv, LEGALIZE_CARD_ID, countItem(inv, LEGALIZE_CARD_ID));
    pushActivity('You left the bureaucracy for another time.');
  }
  closeQuestDialogue({ force: true });
  legalizeRun = null;
  legalizeSourceLocation = null;
  legalizeTargets = [];
  legalizeWaitStartedAt = 0;
  const hud = document.getElementById('legalize-hud');
  if (hud) hud.hidden = true;
  try {
    await enterStreetWithTransition(destination.tsid, {
      spawnX: destination.x,
      spawnY: destination.y,
      quiet: true,
    });
    if (app?.view) app.view.dataset.legalizeStatus = abandon ? 'abandoned' : 'completed';
    savePlayerState();
    savePlayerLocation(destination);
    updateHud();
    return true;
  } finally {
    legalizeTransitionBusy = false;
  }
}

function confirmLeaveLegalizeIt() {
  if (!legalizeIsInstanced()) return;
  openScriptedQuestDialogue({
    title: 'Legalize It',
    kicker: 'Leave the application?',
    cancelable: true,
    beats: [{
      text: 'Leaving now will abandon the current application. You can visit the Back Alley again later.',
      response: 'Abandon application',
    }],
    onComplete: () => leaveLegalizeIt({ abandon: true }),
  });
}

function updateLegalizeIt() {
  if (!legalizeIsInstanced() || legalizeTransitionBusy || !player) return;
  const now = Date.now();
  for (const target of legalizeTargets) {
    const sprite = target?.sprite;
    if (
      target.classId === 'npc_bureaucrat' &&
      sprite?._legalizeAnimation === 'talk' &&
      sprite._legalizeAnimationUntil > 0 &&
      now >= sprite._legalizeAnimationUntil
    ) {
      setLegalizeBureaucratAnimation(target, 'idle');
    }
  }
  if (
    currentStreetTsid === LEGALIZE_HALL_TSID &&
    legalizeRun.stage === 'hall_waiting' &&
    legalizeRun.handoffs === 0 &&
    player.x >= 250
  ) {
    if (!legalizeWaitStartedAt) legalizeWaitStartedAt = now;
    if (now - legalizeWaitStartedAt >= 10_000) callNextLegalizeClerk();
  } else if (
    legalizeRun.stage === 'hall_waiting' &&
    legalizeRun.handoffs === 0 &&
    player.x < 250
  ) {
    legalizeWaitStartedAt = 0;
  }
  const autoplayMode =
    new URLSearchParams(location.search).get('legalizeautoplay') || '';
  const autoplay = ['1', 'hall', 'purchase'].includes(autoplayMode);
  if (!autoplay || now < legalizeAutoNextAt) return;
  legalizeAutoNextAt = now + 180;
  if (isQuestDialogueOpen()) {
    advanceQuestDialogue();
    return;
  }
  if (
    autoplayMode === 'hall' &&
    currentStreetTsid === LEGALIZE_HALL_TSID &&
    legalizeRun.stage === 'hall_called'
  ) {
    return;
  }
  if (autoplayMode === 'purchase' && legalizeRun.stage === 'card_owned') return;
  if (legalizeRun.stage === 'gregarious_departure') {
    const gate = legalizeTargets.find(
      (entry) => entry.state?.routeAction === 'depart_back_alley'
    );
    if (gate) handleLegalizeTarget(gate, 'travel');
  } else if (legalizeRun.stage === 'back_alley') {
    const shady = legalizeTargets.find(
      (entry) => entry.classId === 'npc_back_alley_bureaucrat'
    );
    if (shady) {
      player.position.set(shady.sprite.x - 45, GROUND_Y);
      handleLegalizeTarget(shady, 'talk_to');
    }
  } else if (legalizeRun.stage === 'back_alley_briefed') {
    const entrance = legalizeTargets.find(
      (entry) => entry.state?.routeAction === 'enter_back_alley_station'
    );
    if (entrance) handleLegalizeTarget(entrance, 'enter');
  } else if (legalizeRun.stage === 'back_alley_station') {
    const gate = legalizeTargets.find(
      (entry) => entry.state?.routeAction === 'travel_gregarious'
    );
    if (gate) handleLegalizeTarget(gate, 'travel');
  } else if (legalizeRun.stage === 'gregarious_arrival') {
    const exit = legalizeTargets.find(
      (entry) => entry.state?.routeAction === 'exit_gregarious_station'
    );
    if (exit) handleLegalizeTarget(exit, 'exit');
  } else if (legalizeRun.stage === 'grange_exterior') {
    const hall = legalizeTargets.find(
      (entry) => entry.state?.routeAction === 'enter_hall'
    );
    if (hall) handleLegalizeTarget(hall, 'enter');
  } else if (legalizeRun.stage === 'hall_waiting') {
    player.x = 300;
    if (legalizeRun.handoffs === 0) legalizeWaitStartedAt = now - 10_000;
  } else if (['hall_called', 'hall_processing'].includes(legalizeRun.stage)) {
    const clerk = legalizeTargets.find(
      (entry) =>
        entry.classId === 'npc_bureaucrat' &&
        Number(entry.state?.clerkIndex) === Number(legalizeRun.clerkIndex)
    );
    if (clerk) {
      player.position.set(clerk.sprite.x - 70, GROUND_Y);
      handleLegalizeTarget(clerk, 'talk_to');
    }
  } else if (legalizeRun.stage === 'card_owned') {
    activateLegalizeCard();
  }
}

function winterWalkIsInstanced() {
  return Boolean(
    winterWalkState &&
      [WINTER_WALK_STREET_ID, WINTER_HAVEN_STREET_ID].includes(currentStreetTsid)
  );
}

function greedyStreetIsInstanced() {
  return Boolean(
    greedyStreetState &&
    [GREEDY_STREET_GEOMETRY_TSID, GREEDY_STREET_ID].includes(currentStreetTsid)
  );
}

function applyGreedySceneEvent(eventId) {
  const event = greedyStreetSceneManifest?.events?.[eventId];
  const views = bgLayer?.decoViews;
  if (!event || !views) return { hidden: 0, shown: 0, missing: 0 };
  const dynamicOnly = new Set(greedyStreetSceneManifest.dynamicOnlyDecos || []);
  let hidden = 0;
  let shown = 0;
  let missing = 0;
  for (const id of event.hide || []) {
    const view = views.get(id);
    if (!view) {
      if (!dynamicOnly.has(id)) missing += 1;
      continue;
    }
    view.visible = false;
    hidden += 1;
  }
  for (const id of event.show || []) {
    const view = views.get(id);
    if (!view) {
      if (!dynamicOnly.has(id)) missing += 1;
      continue;
    }
    view.visible = true;
    shown += 1;
  }
  if (app?.view) {
    app.view.dataset.greedySceneEvent = eventId;
    app.view.dataset.greedySceneChanged = `${hidden}:${shown}`;
    app.view.dataset.greedySceneMissing = String(missing);
  }
  return { hidden, shown, missing };
}

function greedyButtonSprite(actIndex, x, y) {
  const root = new PIXI.Container();
  root.name = `greedy-story-act-${actIndex + 1}`;
  root.sortableChildren = true;
  const button = PIXI.Sprite.from(
    'assets/sprites/quests/greedy-street-spirit/wall_button__x1_out_png_1354839763.png'
  );
  button.anchor.set(0.5, 1);
  button.width = 126;
  button.height = 18;
  button.zIndex = 1;
  root.addChild(button);
  const label = new PIXI.Text(`ACT ${['I', 'II', 'III', 'IV', 'V'][actIndex]}`, {
    fontFamily: 'Fredoka, Arial, sans-serif',
    fontSize: 17,
    fontWeight: '800',
    fill: 0xfff6c8,
    stroke: 0x422b54,
    strokeThickness: 4,
    dropShadow: true,
    dropShadowColor: 0x24172e,
    dropShadowBlur: 2,
    dropShadowDistance: 1,
  });
  label.anchor.set(0.5, 1);
  label.y = -20;
  label.zIndex = 2;
  root.addChild(label);
  root.x = x;
  root.y = y;
  root.zIndex = 51;
  root._buttonArt = button;
  entityLayer.addChild(root);
  return root;
}

function createGreedyExitSprite(x, y) {
  const root = new PIXI.Container();
  root.name = 'greedy-story-exit';
  const sign = new PIXI.Graphics();
  sign.beginFill(0x5c3d72, 0.94);
  sign.lineStyle(3, 0xfff1ae, 0.94);
  sign.drawRoundedRect(-82, -43, 164, 38, 14);
  sign.endFill();
  root.addChild(sign);
  const label = new PIXI.Text('RETURN TO UR →', {
    fontFamily: 'Fredoka, Arial, sans-serif',
    fontSize: 15,
    fontWeight: '800',
    fill: 0xfff9dd,
  });
  label.anchor.set(0.5);
  label.y = -24;
  root.addChild(label);
  root.x = x;
  root.y = y;
  root.zIndex = 52;
  entityLayer.addChild(root);
  return root;
}

function renderGreedyStreetHud() {
  const hud = document.getElementById('greedy-street-hud');
  const visible = greedyStreetIsInstanced();
  if (!hud) return;
  hud.hidden = !visible;
  if (!visible) return;
  const remaining = greedyRemainingMs(greedyStreetState);
  const seconds = Math.ceil(remaining / 1000);
  const timer = hud.querySelector('[data-greedy-timer]');
  const stage = hud.querySelector('[data-greedy-stage]');
  const objective = hud.querySelector('[data-greedy-objective]');
  const line = hud.querySelector('[data-greedy-line]');
  const firstIncomplete = greedyStreetState.actSteps.findIndex(
    (step, index) => step < GREEDY_ACTS[index].lines.length
  );
  if (timer) {
    timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    timer.classList.toggle('is-low', remaining > 0 && remaining <= 30_000);
  }
  if (stage) {
    stage.textContent = firstIncomplete < 0
      ? 'Storyland · all five acts read'
      : `Storyland · ${GREEDY_ACTS[firstIncomplete].title}`;
  }
  if (objective) objective.textContent = greedyObjective(greedyStreetState);
  if (line) line.textContent = greedyStreetState.lastLine || 'Once upon a time…';
  hud.querySelectorAll('[data-greedy-act]').forEach((dot) => {
    dot.classList.toggle(
      'is-done',
      greedyStreetState.actsRead.includes(Number(dot.dataset.greedyAct))
    );
  });
  if (greedyStreetExit?.sprite) {
    greedyStreetExit.sprite.alpha = greedyStreetState.status === 'ready' ? 1 : 0.38;
  }
  if (app?.view) {
    app.view.dataset.greedyStoryStatus = greedyStreetState.status;
    app.view.dataset.greedyStoryRepeat = greedyStreetState.repeat ? '1' : '0';
    app.view.dataset.greedyStoryActs = greedyStreetState.actsRead.join(',');
    app.view.dataset.greedyStorySteps = greedyStreetState.actSteps.join(',');
    app.view.dataset.greedyStoryRemaining = String(remaining);
    app.view.dataset.greedyStoryObjective = greedyObjective(greedyStreetState);
    app.view.dataset.greedyStoryProductionTsid = GREEDY_STREET_PRODUCTION_TSID;
  }
}

function setupGreedyStreetInstance() {
  clearWorldEntities();
  currentStreetTsid = GREEDY_STREET_ID;
  currentStreetPopulation = {
    source: 'production-instance',
    sourceTsid: GREEDY_STREET_PRODUCTION_TSID,
    giantId: '',
    piggies: 0,
    chickens: 0,
    butterflies: 0,
    flyingButterflies: 0,
    treeClasses: [],
    rockClasses: [],
    gardens: 0,
    vendor: false,
    shrine: false,
  };
  applyGreedySceneEvent('player_enter');
  const groundY = streetPlatforms?.[0]?.y1 || GROUND_Y;
  const buttonXs = [700, 1775, 2925, 4075, 5200];
  greedyStreetButtons = GREEDY_ACTS.map((act, actIndex) => {
    const sprite = greedyButtonSprite(actIndex, buttonXs[actIndex], groundY);
    return register({
      classId: 'greedy_story_button',
      label: `${act.title} Wall Button`,
      subtitle: `Read ${act.title} of The Greedy Street Spirit`,
      sprite,
      state: {
        storyState: greedyStreetState,
        actIndex,
        actTitle: act.title,
        totalSteps: act.lines.length,
      },
    });
  });
  const exitSprite = createGreedyExitSprite(WORLD_W - 120, groundY);
  greedyStreetExit = register({
    classId: 'greedy_story_exit',
    label: 'Storyland exit',
    subtitle: 'Return to Ur after reading all five acts',
    sprite: exitSprite,
    state: { storyState: greedyStreetState },
  });
  if (player) {
    player.x = 365;
    player.y = groundY;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
  }
  const name = document.getElementById('street-name');
  if (name) {
    name.textContent = 'The Greedy Street Spirit · Storyland';
    name.dataset.tsid = GREEDY_STREET_PRODUCTION_TSID;
  }
  camTarget = cameraTargetForPlayer(player?.x || 365);
  camY = cameraTargetY(player?.y || groundY, activeCameraWorldHeight(), LOCATION_VIEW_H);
  world.x = -Math.round(camTarget);
  world.y = -Math.round(camY);
  renderGreedyStreetHud();
  updateHud();
}

async function startGreedyStreetSpirit(opts = {}) {
  if (greedyStreetStartPromise) return greedyStreetStartPromise;
  if (greedyStreetIsInstanced()) return greedyStreetState;
  greedyStreetStartPromise = (async () => {
    const repeat = Boolean(opts.repeat);
    const questId = repeat
      ? GREEDY_STREET_SPIRIT_REPEAT_ID
      : GREEDY_STREET_SPIRIT_QUEST_ID;
    if (repeat) {
      questState.completed = questState.completed.filter(
        (id) => id !== GREEDY_STREET_SPIRIT_REPEAT_ID
      );
    }
    if (!questState.active[questId]) {
      const assigned = assignQuest(questState, questId, { ignorePrereq: repeat });
      if (!assigned.ok) return null;
    }
    closeQuestPanel();
    closeQuestDialogue({ force: true });
    closePackPopover();
    greedyStreetSourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x ?? WORLD_W * 0.5,
      y: player?.y ?? GROUND_Y,
    };
    greedyStreetState = createGreedyStreetSpiritState({
      repeat,
      sourceLocation: greedyStreetSourceLocation,
      enteredAt: Date.now(),
    });
    greedyStreetAutoNextAt = 0;
    savePlayerLocation(greedyStreetSourceLocation);
    const [manifest] = await Promise.all([
      fetch('assets/content/greedy-street-spirit-scenes.json').then((response) => {
        if (!response.ok) throw new Error(`Greedy Street Spirit scenes: HTTP ${response.status}`);
        return response.json();
      }),
      enterStreetWithTransition(GREEDY_STREET_GEOMETRY_TSID, {
        useTransition: opts.useTransition !== false,
        quiet: true,
      }),
    ]);
    greedyStreetSceneManifest = manifest;
    if (!greedyStreetState) return null;
    setupGreedyStreetInstance();
    savePlayerLocation(greedyStreetSourceLocation);
    pushActivity('The Greedy Street Spirit: read all five acts before Storyland fades.');
    toast('Five minutes. Press each act’s Wall Button.', 3400);
    return greedyStreetState;
  })();
  try {
    return await greedyStreetStartPromise;
  } finally {
    greedyStreetStartPromise = null;
  }
}

function pressGreedyStoryButton(target) {
  if (!greedyStreetIsInstanced() || !target?.state) return false;
  const result = pressGreedyAct(
    greedyStreetState,
    target.state.actIndex,
    Date.now()
  );
  if (!result.ok) {
    if (result.reason === 'expired') returnFromGreedyStreetSpirit({ expired: true });
    else toast(result.reason === 'act_complete' ? 'That act is already complete.' : 'The story cannot continue.');
    return false;
  }
  applyGreedySceneEvent(result.eventId);
  if (target.sprite?._buttonArt) {
    const art = target.sprite._buttonArt;
    art.texture = PIXI.Texture.from(
      'assets/sprites/quests/greedy-street-spirit/wall_button__x1_in_png_1354839762.png'
    );
    window.setTimeout(() => {
      if (!art.destroyed) {
        art.texture = PIXI.Texture.from(
          'assets/sprites/quests/greedy-street-spirit/wall_button__x1_out_png_1354839763.png'
        );
      }
    }, 240);
  }
  if (result.actCompleted) {
    const activeId = greedyStreetState.repeat
      ? GREEDY_STREET_SPIRIT_REPEAT_ID
      : GREEDY_STREET_SPIRIT_QUEST_ID;
    if (questState.active?.[activeId]) {
      questState.active[activeId].progress[`read_act_${result.actIndex + 1}`] = 1;
    }
  }
  playSfx(result.actCompleted ? 'quest' : 'pickup', {
    volume: result.actCompleted ? 0.54 : 0.34,
    rate: 0.92 + result.actIndex * 0.04,
  });
  pushActivity(`${GREEDY_ACTS[result.actIndex].title}: ${result.line}`);
  openScriptedQuestDialogue({
    title: 'The Greedy Street Spirit',
    kicker: `${GREEDY_ACTS[result.actIndex].title} · scene ${result.step + 1} of ${GREEDY_ACTS[result.actIndex].lines.length}`,
    beats: [{ text: result.line, response: result.storyCompleted ? 'The end' : 'Continue' }],
    onComplete: () => {
      if (result.storyCompleted) {
        const text = greedyStreetState.repeat
          ? 'The whole story has been remembered. Return to Ur for breakfast.'
          : "What a wonderful story. Let's return to the Piggy to wrap this up.";
        toast(text, 4800);
        pushActivity(text);
      }
      renderGreedyStreetHud();
    },
  });
  renderGreedyStreetHud();
  savePlayerState();
  return true;
}

function handleGreedyStreetTarget(target, verbId) {
  if (target?.classId === 'greedy_story_button' && verbId === 'press') {
    pressGreedyStoryButton(target);
    return;
  }
  if (target?.classId === 'greedy_story_exit' && verbId === 'leave_storyland') {
    returnFromGreedyStreetSpirit();
  }
}

function finishGreedyRepeat() {
  const active = questState.active?.[GREEDY_STREET_SPIRIT_REPEAT_ID];
  if (!active || greedyStreetState?.actsRead.length !== GREEDY_ACTS.length) return false;
  greedyStreetState.status = 'complete';
  const result = completeQuest(questState, GREEDY_STREET_SPIRIT_REPEAT_ID, pc);
  if (!result.ok) return false;
  addItem(inv, GREEDY_REPEAT_REWARD.item, GREEDY_REPEAT_REWARD.count);
  markGreedyRepeatComplete(questState, Date.now());
  announceQuestCompletions([{
    classTsid: GREEDY_STREET_SPIRIT_REPEAT_ID,
    completed: true,
    rewards: result.rewards,
    def: result.def,
  }]);
  pushActivity("Wasn't that sweet? Now that naptime is over, here's some breakfast. +4 Waffles.");
  if (app?.view) {
    app.view.dataset.greedyStoryReward = 'waffles:4';
    app.view.dataset.greedyStoryCooldown = String(
      ensureGreedyStory(questState).lastRepeatCompletedAt
    );
  }
  return true;
}

async function returnFromGreedyStreetSpirit({ abandon = false, expired = false } = {}) {
  if (!greedyStreetState || greedyStreetTransitionBusy) return false;
  if (!abandon && !expired && greedyStreetState.status !== 'ready') {
    toast("You've missed some of the story! It's much more rewarding if you read it all the way through.", 4800);
    return false;
  }
  greedyStreetTransitionBusy = true;
  const wasRepeat = greedyStreetState.repeat;
  const destination = greedyStreetSourceLocation?.tsid
    ? { ...greedyStreetSourceLocation }
    : { tsid: STREET_INDEX.default };
  const questId = wasRepeat
    ? GREEDY_STREET_SPIRIT_REPEAT_ID
    : GREEDY_STREET_SPIRIT_QUEST_ID;
  let status = expired ? 'expired' : abandon ? 'abandoned' : greedyStreetState.status;
  if (expired || abandon) {
    delete questState.active[questId];
    if (wasRepeat) markGreedyRepeatFailed(questState, Date.now());
  } else if (wasRepeat) {
    finishGreedyRepeat();
    status = 'complete';
  }
  closeQuestDialogue({ force: true });
  greedyStreetState = null;
  greedyStreetSourceLocation = null;
  greedyStreetSceneManifest = null;
  greedyStreetButtons = [];
  greedyStreetExit = null;
  const hud = document.getElementById('greedy-street-hud');
  if (hud) hud.hidden = true;
  try {
    await enterStreetWithTransition(destination.tsid, {
      spawnX: destination.x,
      spawnY: destination.y,
      quiet: true,
    });
    savePlayerLocation(destination);
    if (app?.view) app.view.dataset.greedyStoryStatus = status;
    if (expired) toast('Storyland faded before the bedtime story was finished.', 4200);
    else if (abandon) {
      toast("You've missed some of the story. You can begin again later.", 3600);
    } else if (wasRepeat) {
      toast("Wasn't that sweet? Breakfast: +4 Waffles.", 4200);
    } else {
      toast("What a wonderful story. Find a Piggy to wrap this up.", 4200);
      if (new URLSearchParams(location.search).get('greedyautoplay') === '1') {
        const piggy = interactables.find((entry) => entry.classId === 'npc_piggy');
        if (piggy) handleGreedyStreetPiggy(piggy);
      }
    }
    savePlayerState();
    updateHud();
    return true;
  } finally {
    greedyStreetTransitionBusy = false;
  }
}

function completeGreedyStreetSpiritWithPiggy(target) {
  const active = questState.active?.[GREEDY_STREET_SPIRIT_QUEST_ID];
  if (!active) return false;
  const actsRead = GREEDY_ACTS.every(
    (_act, index) => Number(active.progress[`read_act_${index + 1}`]) >= 1
  );
  if (!actsRead) return false;
  active.progress.talk_to_piggy = 1;
  const result = completeQuest(questState, GREEDY_STREET_SPIRIT_QUEST_ID, pc);
  if (!result.ok) return false;
  addItem(inv, GREEDY_FIRST_REWARD.item, GREEDY_FIRST_REWARD.count);
  markGreedyFirstComplete(questState, Date.now());
  syncEmotionalBearCatalog();
  announceQuestCompletions([{
    classTsid: GREEDY_STREET_SPIRIT_QUEST_ID,
    completed: true,
    rewards: result.rewards,
    def: result.def,
  }]);
  const completion = "Wasn't that sweet? Here's a cuddly Emotional Bear to remind you of this bedtime story.";
  showSpeechBubble(target, {
    speaker: target.label || 'Piggy',
    text: completion,
    durationMs: 7200,
  });
  pushActivity(`${completion} +1 Emotional Bear · +100 favor with Pot.`);
  toast('Quest complete · Emotional Bear acquired!', 4600);
  playSfx('quest', { volume: 0.74, rate: 1.05 });
  if (app?.view) {
    app.view.dataset.greedyStoryStatus = 'complete';
    app.view.dataset.greedyStoryReward = 'emotional_bear:1';
    app.view.dataset.greedyStoryPiggy = 'talked';
  }
  savePlayerState();
  updateHud();
  return true;
}

function handleGreedyStreetPiggy(target) {
  if (completeGreedyStreetSpiritWithPiggy(target)) return true;
  if (!canOfferGreedyFirst(questState, pc).ok) return false;
  openQuestDialogue(GREEDY_STREET_SPIRIT_QUEST_ID);
  return true;
}

function confirmLeaveGreedyStreetSpirit() {
  if (!greedyStreetIsInstanced()) return;
  const complete = greedyStreetState.status === 'ready';
  openScriptedQuestDialogue({
    title: 'The Greedy Street Spirit',
    kicker: complete ? 'Return to Ur?' : 'Leave Storyland?',
    cancelable: true,
    beats: [{
      text: complete
        ? greedyStreetState.repeat
          ? 'Return to Ur and collect your breakfast.'
          : 'Return to Ur, then talk to a Piggy to wrap this up.'
        : "You've missed some of the story! It's much more rewarding if you read it all the way through.",
      response: complete ? 'Return to Ur' : 'Leave anyway',
    }],
    onComplete: () => returnFromGreedyStreetSpirit({ abandon: !complete }),
  });
}

function updateGreedyStreetSpirit() {
  if (!greedyStreetIsInstanced() || greedyStreetTransitionBusy) return;
  const now = Date.now();
  if (greedyRemainingMs(greedyStreetState, now) <= 0) {
    expireGreedyStreetSpirit(greedyStreetState, now);
    returnFromGreedyStreetSpirit({ expired: true });
    return;
  }
  const autoplay = new URLSearchParams(location.search).get('greedyautoplay');
  if (autoplay === '1' && now >= greedyStreetAutoNextAt) {
    greedyStreetAutoNextAt = now + 190;
    if (isQuestDialogueOpen()) {
      advanceQuestDialogue();
    } else if (greedyStreetState.status === 'ready') {
      returnFromGreedyStreetSpirit();
    } else {
      const nextIndex = greedyStreetState.actSteps.findIndex(
        (step, index) => step < GREEDY_ACTS[index].lines.length
      );
      const target = greedyStreetButtons[nextIndex];
      if (target) {
        player.x = target.sprite.x - 44;
        player.y = target.sprite.y;
        player.vx = 0;
        player.vy = 0;
        pressGreedyStoryButton(target);
      }
    }
  }
  renderGreedyStreetHud();
}

function winterLocationLabel(tsid) {
  if (tsid === WINTER_WALK_STREET_ID) {
    return { street: 'Winter Walk', hub: 'A quiet place beyond Ur' };
  }
  if (tsid === WINTER_HAVEN_STREET_ID) {
    return { street: 'Winter Haven', hub: 'Beneath Winter Walk' };
  }
  return null;
}

function winterRouteCandidates(stage = winterWalkState?.stage) {
  const rows = (streetPlatforms || [])
    .map((platform) => {
      const width = Math.abs(platform.x2 - platform.x1);
      return {
        x: (platform.x1 + platform.x2) / 2,
        y: (platform.y1 + platform.y2) / 2,
        width,
        platform,
      };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.width >= 24);
  if (stage === 'haven') {
    return rows.sort((a, b) => b.y - a.y || a.x - b.x);
  }
  const surface = rows.sort((a, b) => a.x - b.x || b.y - a.y);
  if (stage === 'return') {
    const count = Math.max(6, Math.ceil(surface.length * 0.22));
    return surface.slice(-count);
  }
  return surface;
}

function winterRoutePoints(stage, count) {
  const pool = winterRouteCandidates(stage);
  if (!pool.length) return samplePlatformPoints(count);
  const points = [];
  const start = stage === 'haven' ? 0.08 : 0.12;
  const end = stage === 'haven' ? 0.9 : 0.84;
  for (let i = 0; i < count; i += 1) {
    const progress = count <= 1 ? 0.5 : i / (count - 1);
    const index = Math.round((start + (end - start) * progress) * (pool.length - 1));
    const point = pool[clamp(index, 0, pool.length - 1)];
    points.push({ x: point.x, y: point.y, platform: point.platform });
  }
  return points;
}

function clearWinterAtmosphere() {
  if (winterSnow?.parent) winterSnow.parent.removeChild(winterSnow);
  if (winterSnow && !winterSnow.destroyed) winterSnow.destroy({ children: true });
  winterSnow = null;
}

function spawnWinterSnow() {
  clearWinterAtmosphere();
  if (!entityLayer) return null;
  const snow = new PIXI.Container();
  snow.name = 'winter-snow';
  snow.zIndex = 110;
  snow.eventMode = 'none';

  const veil = new PIXI.Graphics();
  veil.beginFill(winterWalkState?.stage === 'haven' ? 0x18345f : 0xc9efff, 0.055);
  veil.drawRect(0, 0, VIEW_W, VIEW_H);
  veil.endFill();
  veil._winterVeil = true;
  snow.addChild(veil);

  const count = winterWalkState?.stage === 'haven' ? 64 : 92;
  for (let i = 0; i < count; i += 1) {
    const flake = new PIXI.Sprite(PIXI.Texture.WHITE);
    const size = 1.4 + ((i * 17) % 31) / 10;
    flake.width = size;
    flake.height = size;
    flake.tint = i % 7 === 0 ? 0xc8eaff : 0xffffff;
    flake.alpha = 0.34 + ((i * 13) % 54) / 100;
    flake.x = (i * 149 + 31) % VIEW_W;
    flake.y = (i * 83 + 17) % VIEW_H;
    flake._winterFlake = true;
    flake._vx = -0.18 - ((i * 7) % 13) / 28;
    flake._vy = 0.42 + ((i * 11) % 17) / 18;
    flake._phase = i * 0.91;
    snow.addChild(flake);
  }
  entityLayer.addChild(snow);
  winterSnow = snow;
  return snow;
}

function updateWinterSnow(dt) {
  if (!winterSnow || winterSnow.destroyed) return;
  const left = Number.isFinite(camTarget) ? camTarget : 0;
  const top = Number.isFinite(camY) ? camY : 0;
  const veil = winterSnow.children.find((child) => child._winterVeil);
  if (veil) veil.position.set(left, top);
  for (const flake of winterSnow.children) {
    if (!flake._winterFlake) continue;
    flake._phase += 0.018 * dt;
    flake.x += (flake._vx + Math.sin(flake._phase) * 0.12) * dt;
    flake.y += flake._vy * dt;
    if (flake.x < left - 18) flake.x = left + VIEW_W + 18;
    if (flake.x > left + VIEW_W + 18) flake.x = left - 18;
    if (flake.y > top + VIEW_H + 18) {
      flake.y = top - 18;
      flake.x = left + ((flake._phase * 173) % VIEW_W);
    }
    if (flake.y < top - 24) flake.y = top + VIEW_H + 18;
  }
}

function spawnWinterMotes(stage) {
  const rewards = WINTER_MOTE_REWARDS[stage] || [];
  const points = winterRoutePoints(stage, rewards.length);
  winterWalkMotes = [];
  points.forEach((point, index) => {
    if (winterWalkState?.collected?.[stage]?.includes(index)) return;
    const sprite = new PIXI.AnimatedSprite(quoinFrames('xp'));
    sprite.anchor.set(0.5);
    sprite.animationSpeed = 0.28;
    sprite.loop = true;
    sprite.play();
    sprite.baseScale = SCALE * (index === 2 && stage === 'surface' ? 1.12 : 0.94);
    sprite.scale.set(sprite.baseScale);
    sprite.x = point.x;
    sprite.baseY = point.y - 62 - (index % 2) * 26;
    sprite.y = sprite.baseY;
    sprite.phase = index * 1.37;
    sprite.tint = index === 2 && stage === 'surface' ? 0xe0a8ff : 0xc58cff;
    sprite.zIndex = 42;
    const glow = new PIXI.Graphics();
    glow.beginFill(0x9b5de5, index === 2 && stage === 'surface' ? 0.34 : 0.2);
    glow.drawCircle(0, 0, index === 2 && stage === 'surface' ? 30 : 23);
    glow.endFill();
    sprite.addChildAt(glow, 0);
    entityLayer.addChild(sprite);
    winterWalkMotes.push({ stage, index, amount: rewards[index], sprite });
  });
  return winterWalkMotes;
}

function spawnWinterPortal(stage) {
  const route = winterRouteCandidates(stage);
  const point = route[route.length - 1];
  const fallback = samplePlatformPoints(1)[0] || { x: WORLD_W - 140, y: GROUND_Y };
  const spot = point || fallback;
  const root = new PIXI.Container();
  root.name = `winter-portal-${stage}`;
  root.position.set(spot.x, spot.y + 2);
  root.zIndex = 48;
  root.hitArea = new PIXI.Rectangle(-66, -190, 132, 190);

  let art = 'ice-passage';
  if (stage === 'haven') {
    art = 'recovered-exit-ladder';
    const ladder = new PIXI.Sprite(
      PIXI.Texture.from('assets/decos/groddle/ladder_interior_4steps.png')
    );
    ladder.anchor.set(0.5, 1);
    ladder.scale.set(0.58);
    root.addChild(ladder);

    const sign = new PIXI.Sprite(
      PIXI.Texture.from('assets/decos/groddle/sign_exit_starter_01a.png')
    );
    sign.anchor.set(0.5);
    sign.position.set(78, -112);
    sign.scale.set(0.9);
    root.addChild(sign);
  } else {
    const light = new PIXI.Graphics();
    const returning = stage === 'return';
    art = returning ? 'white-home-light' : art;
    light.beginFill(0xffffff, returning ? 0.24 : 0.045);
    light.drawEllipse(0, -78, returning ? 108 : 46, returning ? 152 : 82);
    light.endFill();
    light.beginFill(returning ? 0xf5feff : 0xcdf4ff, returning ? 0.52 : 0.12);
    light.drawEllipse(0, -66, returning ? 56 : 26, returning ? 128 : 62);
    light.endFill();
    if (returning) {
      light.beginFill(0xffffff, 0.34);
      light.drawRect(-18, -206, 36, 206);
      light.endFill();
    }
    root.addChild(light);

    if (!returning) {
      const ice = new PIXI.Sprite(
        PIXI.Texture.from('assets/decos/groddle/snow_skirt_01b_al1.png')
      );
      ice.anchor.set(0.5, 0);
      ice.position.set(0, -174);
      ice.scale.set(0.42);
      root.addChild(ice);
    }
  }
  root._winterPortalArt = art;

  entityLayer.addChild(root);
  winterWalkPortal = register({
    classId: 'winter_portal',
    label:
      stage === 'surface'
        ? 'Passage to Winter Haven'
        : stage === 'haven'
          ? 'Exit Ladder'
          : 'The Way Home',
    subtitle:
      stage === 'surface'
        ? 'The path continues below'
        : stage === 'haven'
          ? 'Climb back to Winter Walk'
          : 'Return to Ur',
    sprite: root,
    state: { stage, active: true },
  });
  if (app?.view) {
    app.view.dataset.winterWalkPortalArt = art;
    app.view.dataset.winterWalkPortalCount = '1';
  }
  return winterWalkPortal;
}

function renderWinterWalkHud() {
  const hud = document.getElementById('winter-walk-hud');
  const visible = winterWalkIsInstanced();
  if (hud) hud.hidden = !visible;
  if (!visible) return;
  const remaining = winterWalkRemainingMs(winterWalkState);
  const seconds = Math.ceil(remaining / 1000);
  const progress = winterWalkProgress(winterWalkState);
  const stage = hud.querySelector('[data-winter-stage]');
  const timer = hud.querySelector('[data-winter-timer]');
  const objective = hud.querySelector('[data-winter-objective]');
  const motes = hud.querySelector('[data-winter-motes]');
  const img = hud.querySelector('[data-winter-img]');
  if (stage) {
    stage.textContent =
      winterWalkState.stage === 'haven'
        ? 'Winter Haven'
        : winterWalkState.stage === 'return'
          ? 'Winter Walk · Homeward'
          : 'Snowy path';
  }
  if (timer) {
    timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    timer.classList.toggle('is-low', remaining <= 30_000);
  }
  if (objective) objective.textContent = winterWalkObjective(winterWalkState);
  if (motes) motes.textContent = `${progress.collected} / ${progress.total}`;
  if (img) img.textContent = winterWalkState.imgEarned.toLocaleString();
  if (app?.view) {
    app.view.dataset.winterWalkStatus = winterWalkState.status;
    app.view.dataset.winterWalkStage = winterWalkState.stage;
    app.view.dataset.winterWalkRemaining = String(remaining);
    app.view.dataset.winterWalkMotes = `${progress.collected}/${progress.total}`;
    app.view.dataset.winterWalkImg = String(winterWalkState.imgEarned);
    app.view.dataset.winterWalkObjective = winterWalkObjective(winterWalkState);
    app.view.dataset.winterWalkRoute = 'surface>haven>return';
  }
}

function setupWinterWalkStage(stage) {
  clearWorldEntities();
  for (const sign of bgLayer?.signViews || []) sign.visible = false;
  if (currentStreet) currentStreet.signposts = [];
  spawnWinterSnow();
  spawnWinterMotes(stage);
  spawnWinterPortal(stage);
  const route = winterRouteCandidates(stage);
  const routeStart = route[0] || samplePlatformPoints(1)[0] || { x: 100, y: GROUND_Y };
  const preview = new URLSearchParams(location.search).get('winterpreview');
  const portalSpot = winterWalkPortal?.sprite;
  const start =
    preview === 'portal' && portalSpot
      ? { x: portalSpot.x - 86, y: portalSpot.y }
      : routeStart;
  if (player) {
    player.x = clamp(start.x, 40, Math.max(80, WORLD_W - 40));
    player.y = start.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    noteGrounded(jumpState, true, movementNow());
  }
  camTarget = cameraTargetForPlayer(player.x);
  camY = cameraTargetY(player.y, activeCameraWorldHeight(), LOCATION_VIEW_H);
  world.x = -camTarget;
  world.y = -camY;
  const label = winterLocationLabel(currentStreetTsid);
  if (currentStreet && label) {
    currentStreet.label = label.street;
    currentStreet.hubName = label.hub;
  }
  const name = document.getElementById('street-name');
  if (name && label) {
    name.textContent = `${label.street} · ${label.hub}`;
    name.dataset.tsid = currentStreetTsid;
  }
  renderWinterWalkHud();
  updateHud();
}

async function startWinterWalk(opts = {}) {
  if (winterWalkStartPromise) return winterWalkStartPromise;
  if (winterWalkIsInstanced()) return winterWalkState;
  winterWalkStartPromise = (async () => {
    const repeat = Boolean(opts.repeat);
    const questId = repeat ? WINTER_WALK_REPEAT_QUEST_ID : WINTER_WALK_QUEST_ID;
    if (repeat) {
      questState.completed = questState.completed.filter(
        (id) => id !== WINTER_WALK_REPEAT_QUEST_ID
      );
    }
    if (!questState.active[questId]) {
      const assigned = assignQuest(questState, questId, { ignorePrereq: true });
      if (!assigned.ok) return null;
    }
    closeQuestPanel();
    closeQuestDialogue();
    closePackPopover();
    winterWalkSourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x ?? WORLD_W * 0.5,
      y: player?.y ?? GROUND_Y,
    };
    winterWalkState = createWinterWalkState({
      now: Date.now(),
      sourceLocation: winterWalkSourceLocation,
      repeat,
    });
    winterWalkAutoNextAt = 0;
    savePlayerLocation(winterWalkSourceLocation);
    await enterStreetWithTransition(WINTER_WALK_STREET_ID, {
      useTransition: opts.useTransition !== false,
      quiet: true,
    });
    savePlayerLocation(winterWalkSourceLocation);
    setupWinterWalkStage('surface');
    pushActivity('Winter Walk: cross the snowy path, then climb through Winter Haven.');
    toast('Five minutes. Follow the winter motes.', 3200);
    return winterWalkState;
  })();
  try {
    return await winterWalkStartPromise;
  } finally {
    winterWalkStartPromise = null;
  }
}

function collectWinterWalkMote(entry) {
  if (!entry?.sprite || entry.collected || !winterWalkState) return false;
  const result = collectWinterMote(
    winterWalkState,
    entry.stage,
    entry.index,
    Date.now()
  );
  if (!result.ok) return false;
  entry.collected = true;
  pc.imagination = (pc.imagination || 0) + result.amount;
  pc.xp = (pc.xp || 0) + result.amount;
  const { x, y } = entry.sprite;
  if (entry.sprite.parent) entry.sprite.parent.removeChild(entry.sprite);
  if (!entry.sprite.destroyed) entry.sprite.destroy({ children: true });
  playSfx('quoin', { volume: result.amount >= 1000 ? 0.8 : 0.56, rate: result.amount >= 1000 ? 1.18 : 1.04 });
  floatText(x, y - 18, `+${result.amount.toLocaleString()} iMG`, 0xc98dff);
  burst(x, y, 0xb873ed, result.amount >= 1000 ? 26 : 13);
  pushActivity(`A winter mote sparkles into imagination. +${result.amount.toLocaleString()} iMG.`);
  renderWinterWalkHud();
  updateHud();
  return true;
}

async function enterWinterHavenStage() {
  if (!winterWalkIsInstanced() || winterWalkTransitionBusy) return false;
  const result = enterWinterHaven(winterWalkState, Date.now());
  if (!result.ok) return false;
  winterWalkTransitionBusy = true;
  if (winterWalkPortal?.state) winterWalkPortal.state.active = false;
  keys.clear();
  try {
    await enterStreetWithTransition(WINTER_HAVEN_STREET_ID, { quiet: true });
    if (!winterWalkState) return false;
    savePlayerLocation(winterWalkSourceLocation);
    setupWinterWalkStage('haven');
    pushActivity('You descend into Winter Haven. The exit ladder waits above.');
    toast('Winter Haven — climb to the EXIT sign.', 2800);
    return true;
  } finally {
    winterWalkTransitionBusy = false;
  }
}

async function reenterWinterWalkStage() {
  if (!winterWalkIsInstanced() || winterWalkTransitionBusy) return false;
  const result = returnToWinterWalk(winterWalkState, Date.now());
  if (!result.ok) return false;
  winterWalkTransitionBusy = true;
  if (winterWalkPortal?.state) winterWalkPortal.state.active = false;
  keys.clear();
  try {
    await enterStreetWithTransition(WINTER_WALK_STREET_ID, { quiet: true });
    if (!winterWalkState) return false;
    savePlayerLocation(winterWalkSourceLocation);
    setupWinterWalkStage('return');
    pushActivity('You climb back into Winter Walk. Three bright motes mark the way home.');
    toast('Winter Walk — gather the last motes and follow the light.', 3200);
    return true;
  } finally {
    winterWalkTransitionBusy = false;
  }
}

async function returnFromWinterWalk({ abandon = false, expired = false } = {}) {
  if (!winterWalkState || winterWalkTransitionBusy) return false;
  winterWalkTransitionBusy = true;
  const destination = winterWalkSourceLocation?.tsid
    ? { ...winterWalkSourceLocation }
    : { tsid: STREET_INDEX.default };
  const questId = winterWalkState.repeat
    ? WINTER_WALK_REPEAT_QUEST_ID
    : WINTER_WALK_QUEST_ID;
  if (abandon || expired) delete questState.active[questId];
  const status = expired ? 'expired' : abandon ? 'abandoned' : winterWalkState.status;
  closeQuestDialogue({ force: true });
  clearWinterAtmosphere();
  winterWalkState = null;
  winterWalkSourceLocation = null;
  winterWalkMotes = [];
  winterWalkPortal = null;
  const hud = document.getElementById('winter-walk-hud');
  if (hud) hud.hidden = true;
  try {
    await enterStreetWithTransition(destination.tsid, {
      spawnX: destination.x,
      spawnY: destination.y,
      quiet: true,
    });
    savePlayerLocation(destination);
    savePlayerState();
    if (app?.view) app.view.dataset.winterWalkStatus = status;
    if (expired) toast('The winter path faded. You can try the walk again.', 4000);
    else if (abandon) toast('You leave the winter path for another time.', 3200);
    updateHud();
    return true;
  } finally {
    winterWalkTransitionBusy = false;
  }
}

async function completeWinterWalk() {
  if (!winterWalkIsInstanced() || winterWalkTransitionBusy) return false;
  const result = finishWinterWalk(winterWalkState, Date.now());
  if (!result.ok) return false;
  const questId = winterWalkState.repeat
    ? WINTER_WALK_REPEAT_QUEST_ID
    : WINTER_WALK_QUEST_ID;
  if (result.iceReward) addItem(inv, 'ice', result.iceReward);
  const active = questState.active?.[questId];
  if (active) active.progress.leave = 1;
  const completed = active ? completeQuest(questState, questId, pc) : null;
  const updates = completed?.ok
    ? [{ classTsid: questId, completed: true, rewards: completed.rewards, def: completed.def }]
    : [];
  announceQuestCompletions(updates);
  playSfx('quest', { volume: 0.72, rate: 1.05 });
  pushActivity(
    winterWalkState.repeat
      ? `Winter Walk complete. ${result.imgEarned.toLocaleString()} iMG gathered.`
      : `Winter Walk complete. +${WINTER_WALK_ICE_REWARD} Ice · ${result.imgEarned.toLocaleString()} iMG gathered.`
  );
  savePlayerState();
  renderWinterWalkHud();
  await returnFromWinterWalk();
  return true;
}

function handleWinterPortal(target, verbId) {
  if (!winterWalkIsInstanced() || verbId !== 'enter' || target?.state?.active === false) return;
  if (target.state.stage === 'surface') enterWinterHavenStage();
  else if (target.state.stage === 'haven') reenterWinterWalkStage();
  else completeWinterWalk();
}

function confirmLeaveWinterWalk() {
  if (!winterWalkIsInstanced()) return;
  openScriptedQuestDialogue({
    title: 'Winter Walk',
    kicker: 'Leave the winter path?',
    cancelable: true,
    beats: [
      {
        text: 'The cold path will close behind you, but you can begin another walk later.',
        response: 'Leave Winter Walk',
      },
    ],
    onComplete: () => returnFromWinterWalk({ abandon: true }),
  });
}

function updateWinterWalk(dt) {
  if (!winterWalkIsInstanced() || winterWalkTransitionBusy) return;
  const now = Date.now();
  updateWinterSnow(dt);
  if (winterWalkRemainingMs(winterWalkState, now) <= 0) {
    expireWinterWalk(winterWalkState, now);
    pushActivity('The five-minute Winter Walk timer ran out.');
    returnFromWinterWalk({ expired: true });
    return;
  }
  for (const entry of winterWalkMotes) {
    if (entry.collected || !entry.sprite?.parent) continue;
    entry.sprite.phase += 0.05 * dt;
    entry.sprite.y = entry.sprite.baseY + Math.sin(entry.sprite.phase) * 8;
    const pulse = 1 + Math.sin(entry.sprite.phase * 1.5) * 0.075;
    entry.sprite.scale.set(entry.sprite.baseScale * pulse);
    if (!menuTarget && Math.hypot(entry.sprite.x - player.x, entry.sprite.y - (player.y - 28)) < 48) {
      collectWinterWalkMote(entry);
    }
  }
  if (
    !menuTarget &&
    winterWalkPortal?.sprite &&
    winterWalkPortal.state.active !== false &&
    Math.hypot(
      winterWalkPortal.sprite.x - player.x,
      winterWalkPortal.sprite.y - player.y
    ) < 62
  ) {
    handleWinterPortal(winterWalkPortal, 'enter');
    return;
  }
  const autoplay = new URLSearchParams(location.search).get('winterautoplay');
  const autoplayStages = {
    surface: ['surface'],
    haven: ['surface', 'haven'],
    return: ['surface', 'haven', 'return'],
  };
  const autoplayActive =
    autoplay === '1' || autoplayStages[autoplay]?.includes(winterWalkState.stage);
  if (autoplayActive && now >= winterWalkAutoNextAt) {
    winterWalkAutoNextAt = now + 260;
    if (isQuestDialogueOpen()) {
      advanceQuestDialogue();
    } else {
      const next = winterWalkMotes.find((entry) => !entry.collected && entry.sprite?.parent);
      const target = next?.sprite || winterWalkPortal?.sprite;
      if (target && player) {
        player.x = target.x;
        player.y = next ? target.y + 28 : target.y;
        player.vx = 0;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }
  renderWinterWalkHud();
}

function summersDayIsInstanced() {
  return Boolean(
    summersDayRun &&
      [SUMMERS_DAY_MAIN_ID, SUMMERS_DAY_BONUS_ID].includes(currentStreetTsid)
  );
}

function summersDayLocationLabel(tsid = currentStreetTsid) {
  if (tsid === SUMMERS_DAY_MAIN_ID) {
    return { street: 'A Summer’s Day', hub: 'A shared memory of the Giants' };
  }
  if (tsid === SUMMERS_DAY_BONUS_ID) {
    return { street: 'Annex of A Summer’s Day', hub: 'A shared memory of the Giants' };
  }
  return null;
}

function summerDeco(url, x, y, scale, opts = {}) {
  const sprite = new PIXI.Sprite(PIXI.Texture.from(url));
  sprite.anchor.set(opts.anchorX ?? 0.5, opts.anchorY ?? 1);
  sprite.position.set(x, y);
  sprite.scale.set((opts.flip ? -1 : 1) * scale, scale);
  sprite.tint = opts.tint ?? 0xffffff;
  sprite.alpha = opts.alpha ?? 1;
  sprite.zIndex = opts.zIndex ?? -100;
  return sprite;
}

function drawSummersDayMainBackground() {
  const root = new PIXI.Container();
  root.name = 'summers-day-main-background';
  root.sortableChildren = true;
  root.worldW = 4200;
  root.worldH = 940;

  const sky = new PIXI.Graphics();
  sky.beginFill(0xf8fcff);
  sky.drawRect(0, 0, root.worldW, root.worldH);
  sky.beginFill(0xd7eff7, 0.82);
  sky.drawRect(0, 260, root.worldW, 680);
  sky.endFill();
  sky.zIndex = -1000;
  root.addChild(sky);

  const far = new PIXI.Graphics();
  far.zIndex = -940;
  far.beginFill(0xb7dce8, 0.74);
  far.drawPolygon([
    0, 690, 240, 535, 510, 640, 790, 480, 1060, 630, 1360, 455,
    1680, 610, 1990, 500, 2290, 635, 2610, 470, 2920, 615, 3220, 490,
    3530, 620, 3860, 475, 4200, 610, 4200, 940, 0, 940,
  ]);
  far.endFill();
  root.addChild(far);

  for (let i = 0; i < 9; i += 1) {
    root.addChild(
      summerDeco(
        'assets/decos/groddle/backhill1_blue.png',
        210 + i * 505,
        805 - (i % 3) * 20,
        0.62 + (i % 2) * 0.08,
        { alpha: 0.52, flip: i % 2 === 1, zIndex: -900 }
      )
    );
  }

  const water = new PIXI.Graphics();
  water.zIndex = -760;
  water.beginFill(0x9ed6e7, 0.82);
  water.drawRoundedRect(1190, 770, 1260, 154, 54);
  water.endFill();
  water.lineStyle(4, 0xf8fdff, 0.8);
  for (let x = 1235; x < 2410; x += 150) {
    water.moveTo(x, 808 + (x % 300 ? 8 : 0));
    water.bezierCurveTo(x + 34, 795, x + 75, 825, x + 116, 808);
  }
  root.addChild(water);
  root.summersDayWater = water;

  const terrain = new PIXI.Graphics();
  terrain.zIndex = -720;
  terrain.beginFill(0xf9fdff);
  terrain.lineStyle(3, 0xd8f1f8, 0.76);
  terrain.drawPolygon([0, 820, 1160, 820, 1240, 900, 0, 940]);
  terrain.drawPolygon([2400, 790, 2920, 790, 3050, 940, 2320, 940]);
  terrain.drawPolygon([2860, 740, 4200, 350, 4200, 940, 3000, 940]);
  terrain.endFill();
  root.addChild(terrain);

  const platforms = [
    { x1: 0, y1: 820, x2: 1190, y2: 820, visibleAt: 0 },
    { x1: 720, y1: 710, x2: 1040, y2: 710, visibleAt: 2 },
    { x1: 1120, y1: 790, x2: 1420, y2: 790, visibleAt: 3 },
    { x1: 1450, y1: 730, x2: 1690, y2: 730, visibleAt: 4 },
    { x1: 1700, y1: 655, x2: 1940, y2: 655, visibleAt: 5 },
    { x1: 1950, y1: 585, x2: 2190, y2: 585, visibleAt: 6 },
    { x1: 2200, y1: 695, x2: 2460, y2: 695, visibleAt: 7 },
    { x1: 2380, y1: 790, x2: 2940, y2: 790, visibleAt: 8 },
    { x1: 2790, y1: 710, x2: 3080, y2: 710, visibleAt: 9 },
    { x1: 3030, y1: 625, x2: 3320, y2: 625, visibleAt: 10 },
    { x1: 3260, y1: 540, x2: 3540, y2: 540, visibleAt: 11 },
    { x1: 3490, y1: 455, x2: 3770, y2: 455, visibleAt: 12 },
    { x1: 3720, y1: 365, x2: 4140, y2: 365, visibleAt: 13 },
  ];
  root.platformsScreen = platforms;
  root.summersDayPlatformSprites = [];
  for (let index = 1; index < platforms.length; index += 1) {
    const platform = platforms[index];
    const shelf = new PIXI.Graphics();
    shelf.zIndex = -650;
    shelf.beginFill(0xf9fdff, 0.99);
    shelf.drawRoundedRect(
      platform.x1,
      platform.y1 - 10,
      platform.x2 - platform.x1,
      20,
      10
    );
    shelf.endFill();
    shelf.alpha = platform.visibleAt <= 1 ? 0.95 : 0.14;
    shelf._visibleAt = platform.visibleAt;
    root.addChild(shelf);
    root.summersDayPlatformSprites.push(shelf);
  }

  for (let i = 0; i < 7; i += 1) {
    const pillar = new PIXI.Graphics();
    const x = 520 + i * 590;
    const y = i < 4 ? 840 : 640 - (i - 4) * 85;
    const width = 124 + (i % 3) * 24;
    const height = 92 + ((i * 37) % 118);
    pillar.zIndex = -610;
    pillar.beginFill(0xf9fdff, 0.92);
    pillar.drawRoundedRect(x - width / 2, y - height, width, height, 30);
    pillar.endFill();
    root.addChild(pillar);
  }

  const vine = summerDeco(
    'assets/decos/groddle/vine_rope.png',
    3920,
    700,
    0.43,
    { alpha: 0.72, zIndex: -580 }
  );
  root.addChild(vine);
  root.summersDayVine = vine;
  const ladder = summerDeco(
    'assets/decos/groddle/firebog_ladder.png',
    3930,
    720,
    0.62,
    { alpha: 0.1, zIndex: -570 }
  );
  root.addChild(ladder);
  root.summersDayLadder = ladder;

  const ripple = summerDeco(
    'assets/decos/groddle/water_ripple_double_1.png',
    1850,
    815,
    1.75,
    { anchorY: 0.5, alpha: 0.72, tint: 0xdff7ff, zIndex: -560 }
  );
  root.addChild(ripple);
  summersDayWaterLine = ripple;
  root.summersDayMainArt = 'white-memory-silhouettes';
  return root;
}

function drawSummersDayBonusBackground() {
  const root = new PIXI.Container();
  root.name = 'summers-day-annex-background';
  root.sortableChildren = true;
  root.worldW = 1280;
  root.worldH = 1520;
  const wash = new PIXI.Graphics();
  wash.beginFill(0xfafdff);
  wash.drawRect(0, 0, root.worldW, root.worldH);
  wash.beginFill(0x9dd8e9, 0.82);
  wash.drawRoundedRect(150, 42, 980, 1438, 86);
  wash.endFill();
  wash.zIndex = -1000;
  root.addChild(wash);
  const walls = new PIXI.Graphics();
  walls.zIndex = -930;
  walls.beginFill(0xf9fdff, 0.98);
  walls.drawPolygon([
    0, 0, 218, 0, 202, 180, 228, 355, 184, 520, 218, 705,
    190, 900, 230, 1080, 196, 1260, 220, 1520, 0, 1520,
  ]);
  walls.drawPolygon([
    1068, 0, 1280, 0, 1280, 1520, 1050, 1520, 1082, 1310, 1048, 1110,
    1094, 905, 1058, 720, 1090, 540, 1050, 360, 1084, 170,
  ]);
  walls.endFill();
  root.addChild(walls);
  const platforms = [
    { x1: 110, y1: 1430, x2: 1170, y2: 1430 },
    { x1: 180, y1: 1290, x2: 560, y2: 1290 },
    { x1: 700, y1: 1150, x2: 1080, y2: 1150 },
    { x1: 220, y1: 1010, x2: 650, y2: 1010 },
    { x1: 720, y1: 870, x2: 1090, y2: 870 },
    { x1: 170, y1: 730, x2: 550, y2: 730 },
    { x1: 650, y1: 590, x2: 1080, y2: 590 },
    { x1: 210, y1: 450, x2: 620, y2: 450 },
    { x1: 650, y1: 310, x2: 1080, y2: 310 },
    { x1: 360, y1: 185, x2: 880, y2: 185 },
  ];
  root.platformsScreen = platforms;
  const floor = new PIXI.Graphics();
  floor.zIndex = -700;
  floor.beginFill(0xf9fdff, 0.99);
  floor.lineStyle(3, 0xd8f2f9, 0.84);
  floor.drawRoundedRect(80, 1418, 1120, 116, 46);
  floor.endFill();
  root.addChild(floor);
  for (let index = 1; index < platforms.length; index += 1) {
    const platform = platforms[index];
    const shelf = new PIXI.Graphics();
    shelf.zIndex = -650;
    shelf.beginFill(0xf9fdff, 0.99);
    shelf.drawRoundedRect(
      platform.x1,
      platform.y1 - 11,
      platform.x2 - platform.x1,
      22,
      11
    );
    shelf.endFill();
    shelf.lineStyle(2, 0xd7f0f7, 0.72);
    shelf.moveTo(platform.x1 + 12, platform.y1 + 10);
    shelf.lineTo(platform.x2 - 12, platform.y1 + 10);
    root.addChild(shelf);
  }
  root.summersDayAnnexArt = 'source-pulse-dots-and-ladder';
  return root;
}

function makeSummersDayCheckpoint(id, x, y, index) {
  let sprite;
  let guideText = null;
  if (id.startsWith('bird')) {
    sprite = new PIXI.Sprite(PIXI.Texture.from('assets/decos/groddle/owl_1.png'));
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(0.36);
    const memoryWhite = new PIXI.ColorMatrixFilter();
    memoryWhite.greyscale(1, false);
    memoryWhite.brightness(5, true);
    sprite.filters = [memoryWhite];
    guideText = new PIXI.Text(SUMMERS_DAY_GUIDE_LINES[id] || '', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 18,
      fontWeight: '700',
      fill: 0xffffff,
      align: 'center',
      dropShadow: true,
      dropShadowColor: 0x6ca8bb,
      dropShadowBlur: 3,
      dropShadowDistance: 1,
    });
    guideText.anchor.set(0.5, 1);
    guideText.position.set(
      x + (index % 2 === 0 ? 138 : -138),
      y - 54
    );
    guideText.alpha = 0;
    guideText.zIndex = 39;
  } else if (id.startsWith('orb') || id.startsWith('dot')) {
    sprite = new PIXI.Sprite(PIXI.Texture.from('assets/decos/groddle/pulseDot.png'));
    sprite.anchor.set(0.5);
    sprite.scale.set(id.startsWith('orb') ? 0.76 : 0.62);
  } else if (id.startsWith('stone')) {
    sprite = new PIXI.Sprite(PIXI.Texture.from('assets/decos/groddle/boulder_1.png'));
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(0.115);
  } else if (id === 'water') {
    sprite = new PIXI.Sprite(PIXI.Texture.from('assets/decos/groddle/water_ripple_double_1.png'));
    sprite.anchor.set(0.5);
    sprite.scale.set(0.72);
  } else {
    const marker = new PIXI.Graphics();
    marker.beginFill(0xffffff, 0.86);
    marker.drawRoundedRect(-24, -72, 48, 72, 20);
    marker.endFill();
    marker.lineStyle(3, 0x77b9cd, 0.88);
    marker.drawRoundedRect(-24, -72, 48, 72, 20);
    sprite = marker;
  }
  sprite.position.set(x, y);
  sprite.alpha = index === 0 ? 1 : 0.14;
  sprite.zIndex = 38;
  sprite._summerBaseScaleX = sprite.scale.x;
  sprite._summerBaseScaleY = sprite.scale.y;
  entityLayer.addChild(sprite);
  if (guideText) entityLayer.addChild(guideText);
  return { id, index, x, y, sprite, guideText, completed: false };
}

function revealSummersDayProgress() {
  const count = summersDayRun?.checkpoints?.length || 0;
  for (const checkpoint of summersDayCheckpoints) {
    checkpoint.completed = checkpoint.index < count;
    checkpoint.sprite.alpha = checkpoint.completed ? 0.24 : checkpoint.index === count ? 1 : 0.12;
    checkpoint.sprite.tint = checkpoint.completed ? 0xa9cbd5 : 0xffffff;
    if (checkpoint.guideText) {
      checkpoint.guideText.alpha = checkpoint.index === count ? 0.96 : 0;
    }
  }
  for (const shelf of bgLayer?.summersDayPlatformSprites || []) {
    shelf.alpha = shelf._visibleAt <= count ? 0.92 : 0.12;
  }
  if (bgLayer?.summersDayVine) bgLayer.summersDayVine.alpha = count >= 14 ? 0.12 : 0.74;
  if (bgLayer?.summersDayLadder) bgLayer.summersDayLadder.alpha = count >= 14 ? 0.96 : 0.1;
}

function spawnSummersDayMainSequence() {
  const points = [
    [360, 820], [610, 820], [900, 710], [1260, 790], [1520, 730],
    [1770, 655], [2020, 585], [2280, 695], [2550, 790], [2860, 710],
    [3090, 625], [3330, 540], [3550, 455], [3760, 365], [3990, 365],
  ];
  summersDayCheckpoints = SUMMERS_DAY_CHECKPOINTS.map((id, index) =>
    makeSummersDayCheckpoint(id, points[index][0], points[index][1], index)
  );
  revealSummersDayProgress();
  summersDayExit = summersDayCheckpoints.at(-1);
}

function spawnSummersDayBonusRoom() {
  const spots = [
    [380, 1345], [880, 1100], [410, 960], [890, 820],
    [360, 680], [850, 540], [420, 400], [850, 260],
  ];
  summersDayBonusQuoins = spots.map(([x, y], index) => {
    const sprite = new PIXI.Sprite(
      PIXI.Texture.from('assets/decos/groddle/pulseDot.png')
    );
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.baseScale = 0.86;
    sprite.scale.set(sprite.baseScale);
    sprite.tint = 0xf8feff;
    sprite.alpha = 0.9;
    sprite.zIndex = 32;
    sprite._summerPhase = index * 1.17;
    entityLayer.addChild(sprite);
    return { index, sprite, collected: false };
  });
  const exit = new PIXI.Container();
  exit.position.set(620, 185);
  exit.zIndex = 40;
  const ladder = new PIXI.Sprite(
    PIXI.Texture.from('assets/decos/groddle/firebog_ladder.png')
  );
  ladder.anchor.set(0.5, 1);
  ladder.scale.set(0.62);
  ladder.tint = 0xf8fdff;
  exit.addChild(ladder);
  entityLayer.addChild(exit);
  summersDayExit = {
    id: 'annex_exit',
    sprite: exit,
    x: exit.x,
    y: exit.y,
    art: 'recovered-firebog-ladder',
  };
}

function renderSummersDayHud() {
  const hud = document.getElementById('summers-day-hud');
  const visible = summersDayIsInstanced();
  if (hud) hud.hidden = !visible;
  if (!visible) return;
  const remaining = summersDayRemainingMs(summersDayRun);
  const seconds = Math.ceil(remaining / 1000);
  const progress = summersDayProgress(summersDayRun);
  const stage = hud.querySelector('[data-summer-stage]');
  const timer = hud.querySelector('[data-summer-timer]');
  const objective = hud.querySelector('[data-summer-objective]');
  const count = hud.querySelector('[data-summer-progress]');
  const bonus = hud.querySelector('[data-summer-bonus]');
  if (stage) stage.textContent = summersDayRun.stage === 'bonus' ? 'The Annex' : 'The shared memory';
  if (timer) {
    timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    timer.classList.toggle('is-low', remaining <= 30_000);
  }
  if (objective) objective.textContent = summersDayObjective(summersDayRun);
  if (count) count.textContent =
    summersDayRun.stage === 'bonus'
      ? 'Memory unfolded'
      : `${progress.current} / ${progress.total} moments`;
  if (bonus) {
    bonus.textContent =
      summersDayRun.stage === 'bonus'
        ? `${progress.bonusCollected} / ${progress.bonusTotal} pale iMG dots`
        : 'Follow what the Giants remember';
  }
  if (app?.view) {
    app.view.dataset.summerDayStatus = summersDayRun.status;
    app.view.dataset.summerDayStage = summersDayRun.stage;
    app.view.dataset.summerDayCheckpoint =
      SUMMERS_DAY_CHECKPOINTS[summersDayRun.checkpoints.length] || 'complete';
    app.view.dataset.summerDayProgress = `${progress.current}/${progress.total}`;
    app.view.dataset.summerDayRemaining = String(remaining);
    app.view.dataset.summerDayBonusQuoins = `${progress.bonusCollected}/${progress.bonusTotal}`;
    app.view.dataset.summerDayBonusImg = String(summersDayRun.bonusImgEarned || 0);
    app.view.dataset.summerDayObjective = summersDayObjective(summersDayRun);
    app.view.dataset.summerDayMainTsid = SUMMERS_DAY_MAIN_PRODUCTION_TSID;
    app.view.dataset.summerDayBonusTsid = SUMMERS_DAY_BONUS_PRODUCTION_TSID;
    app.view.dataset.summerDayMainArt =
      bgLayer?.summersDayMainArt || 'not-in-main';
    app.view.dataset.summerDayGuideArt = 'source-white-owl';
    app.view.dataset.summerDayAnnexArt =
      bgLayer?.summersDayAnnexArt || 'not-in-annex';
    app.view.dataset.summerDayAnnexDots = String(SUMMERS_DAY_BONUS_DOT_COUNT);
    app.view.dataset.summerDayAnnexDotReward = String(SUMMERS_DAY_BONUS_DOT_IMG);
    app.view.dataset.summerDayAnnexExit =
      summersDayExit?.art || 'not-in-annex';
    app.view.dataset.summerDayGuide =
      SUMMERS_DAY_GUIDE_LINES[
        SUMMERS_DAY_CHECKPOINTS[summersDayRun.checkpoints.length]
      ] || '';
  }
}

function setupSummersDayStage(stage) {
  clearWorldEntities();
  if (bgLayer && world) {
    world.removeChild(bgLayer);
    bgLayer.destroy({ children: true });
  }
  bgLayer = stage === 'bonus'
    ? drawSummersDayBonusBackground()
    : drawSummersDayMainBackground();
  world.addChildAt(bgLayer, 0);
  currentStreetTsid = stage === 'bonus' ? SUMMERS_DAY_BONUS_ID : SUMMERS_DAY_MAIN_ID;
  const label = summersDayLocationLabel();
  currentStreet = {
    tsid: currentStreetTsid,
    label: label.street,
    hubName: label.hub,
    bounds: { l: 0, r: bgLayer.worldW, t: 0, b: bgLayer.worldH },
    platforms: [],
    signposts: [],
  };
  WORLD_W = bgLayer.worldW;
  GROUND_Y = stage === 'bonus' ? 1430 : 820;
  streetPlatforms = bgLayer.platformsScreen || [];
  summersDayPlatforms = streetPlatforms;
  streetWalls = stage === 'main'
    ? [{ x: 3930, yTop: 350, yBot: 720 }]
    : [];
  climb = { active: false, wall: null };
  Object.assign(jumpState, createJumpState(movementNow()));
  if (stage === 'bonus') spawnSummersDayBonusRoom();
  else spawnSummersDayMainSequence();
  if (player) {
    player.x = stage === 'bonus' ? 380 : 170;
    player.y = stage === 'bonus' ? 1430 : 820;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.rotation = 0;
    noteGrounded(jumpState, true, movementNow());
  }
  camTarget = cameraTargetForPlayer(player.x);
  const summerCameraAnchor = stage === 'bonus' ? 0.64 : 0.56;
  camY = cameraTargetY(
    player.y,
    activeCameraWorldHeight(summerCameraAnchor),
    LOCATION_VIEW_H,
    summerCameraAnchor
  );
  world.x = -camTarget;
  world.y = -camY;
  const name = document.getElementById('street-name');
  if (name) {
    name.textContent = `${label.street} · ${label.hub}`;
    name.dataset.tsid = currentStreetTsid;
  }
  savePlayerLocation(summersDaySourceLocation);
  updateDametimeChrome();
  renderSummersDayHud();
  updateHud();
}

async function transitionIntoSummersDay(stage, useTransition = true) {
  const setup = () => setupSummersDayStage(stage);
  const el = document.getElementById('screen-transition');
  if (!useTransition || !el) {
    setup();
    return;
  }
  const label = stage === 'bonus' ? 'Annex of A Summer’s Day' : 'A Summer’s Day';
  await runStreetTransition(el, {
    fromLabel: currentStreet?.label || '',
    fromHub: currentStreet?.hubName || '',
    toLabel: label,
    toHub: 'A shared memory of the Giants',
    topColor: 0xf9fdff,
    bottomColor: 0xb8dce8,
    onMid: async () => setup(),
  });
}

async function startSummersDay(opts = {}) {
  if (summersDayStartPromise) return summersDayStartPromise;
  if (summersDayIsInstanced()) return summersDayRun;
  summersDayStartPromise = (async () => {
    const repeat = Boolean(opts.repeat);
    const questId = repeat ? SUMMERS_DAY_REPEAT_QUEST_ID : SUMMERS_DAY_QUEST_ID;
    if (repeat) {
      questState.completed = questState.completed.filter(
        (id) => id !== SUMMERS_DAY_REPEAT_QUEST_ID
      );
    }
    if (!questState.active[questId]) {
      const assigned = assignQuest(questState, questId, { ignorePrereq: true });
      if (!assigned.ok) return null;
    }
    closeQuestPanel();
    closeQuestDialogue({ force: true });
    closePackPopover();
    summersDaySourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x ?? WORLD_W * 0.5,
      y: player?.y ?? GROUND_Y,
    };
    summersDayRun = createSummersDayRun({
      now: Date.now(),
      sourceLocation: summersDaySourceLocation,
      repeat,
    });
    summersDayAutoNextAt = 0;
    savePlayerLocation(summersDaySourceLocation);
    await transitionIntoSummersDay('main', opts.useTransition !== false);
    pushActivity('A Summer’s Day: follow the collision of birds, stones, water, and blue lights.');
    toast('Five minutes. Let the Giants’ memory unfold.', 3600);
    return summersDayRun;
  })();
  try {
    return await summersDayStartPromise;
  } finally {
    summersDayStartPromise = null;
  }
}

function advanceSummersDayMoment(entry) {
  if (!entry || !summersDayRun || entry.completed) return false;
  const result = advanceSummersDayCheckpoint(summersDayRun, entry.id, Date.now());
  if (!result.ok) return false;
  entry.completed = true;
  playSfx(entry.id.startsWith('bird') ? 'alert' : 'quest', {
    volume: 0.44,
    rate: 0.9 + entry.index * 0.018,
  });
  burst(entry.x, entry.y - 28, entry.id === 'water' ? 0x8bd0e5 : 0xbdeafb, 14);
  if (entry.id === 'water') {
    toast('Oh. Can’t swim.', 2500);
    pushActivity('Oh. Can’t swim.');
  } else if (entry.id === 'orb_4') {
    toast('The water remembers how to hold you.', 2600);
  } else if (entry.id === 'bird_4') {
    toast('Almost there.', 2200);
  }
  revealSummersDayProgress();
  renderSummersDayHud();
  if (entry.id === 'exit') {
    enterSummersDayAnnex();
  }
  return true;
}

async function enterSummersDayAnnex() {
  if (!summersDayIsInstanced() || summersDayTransitionBusy) return false;
  const result = enterSummersDayBonus(summersDayRun, Date.now());
  if (!result.ok) return false;
  summersDayTransitionBusy = true;
  keys.clear();
  try {
    await transitionIntoSummersDay('bonus', true);
    pushActivity('The memory opens into the Annex of A Summer’s Day.');
    toast('Two minutes in the Annex. Climb toward the way home.', 3200);
    return true;
  } finally {
    summersDayTransitionBusy = false;
  }
}

async function returnFromSummersDay({ expired = false, abandon = false, completionText = '' } = {}) {
  if (!summersDayRun || summersDayTransitionBusy) return false;
  summersDayTransitionBusy = true;
  const destination = summersDaySourceLocation?.tsid
    ? { ...summersDaySourceLocation }
    : { tsid: STREET_INDEX.default };
  const questId = summersDayRun.repeat
    ? SUMMERS_DAY_REPEAT_QUEST_ID
    : SUMMERS_DAY_QUEST_ID;
  if (expired) expireSummersDay(summersDayRun, questState, Date.now());
  else if (abandon) abandonSummersDay(summersDayRun, questState, Date.now());
  if (expired || abandon) delete questState.active[questId];
  const status = expired ? 'expired' : abandon ? 'abandoned' : summersDayRun.status;
  closeQuestDialogue({ force: true });
  keys.clear();
  summersDayRun = null;
  summersDaySourceLocation = null;
  summersDayCheckpoints = [];
  summersDayPlatforms = [];
  summersDayBonusQuoins = [];
  summersDayExit = null;
  summersDayWaterLine = null;
  const hud = document.getElementById('summers-day-hud');
  if (hud) hud.hidden = true;
  try {
    await enterStreetWithTransition(destination.tsid, {
      spawnX: destination.x,
      spawnY: destination.y,
      quiet: true,
    });
    savePlayerLocation(destination);
    updateDametimeChrome();
    savePlayerState();
    if (app?.view) {
      app.view.dataset.summerDayStatus = status;
      app.view.dataset.summerDayCompleted = status === 'complete' ? '1' : '0';
      app.view.dataset.summerDayPendingQurazies = String(
        ensureSummersDayStory(questState).pendingQurazies
      );
    }
    if (expired) toast('The summer memory faded. You can try again later.', 4200);
    else if (abandon) toast('You let the summer memory go for now.', 3200);
    else if (completionText) {
      openScriptedQuestDialogue({
        title: 'A Summer’s Day',
        kicker: 'The Giants remember',
        beats: [{ text: completionText, response: 'Let my imagination go wild' }],
      });
    }
    updateHud();
    return true;
  } finally {
    summersDayTransitionBusy = false;
  }
}

async function completeSummersDay() {
  if (!summersDayIsInstanced() || summersDayTransitionBusy) return false;
  const wasRepeat = summersDayRun.repeat;
  const result = finishSummersDay(summersDayRun, questState, Date.now());
  if (!result.ok) return false;
  const questId = wasRepeat ? SUMMERS_DAY_REPEAT_QUEST_ID : SUMMERS_DAY_QUEST_ID;
  const active = questState.active?.[questId];
  if (active) active.progress.leave = 1;
  const completed = active ? completeQuest(questState, questId, pc) : null;
  const updates = completed?.ok
    ? [{ classTsid: questId, completed: true, rewards: completed.rewards, def: completed.def }]
    : [];
  announceQuestCompletions(updates);
  playSfx('quest', { volume: 0.74, rate: 1.08 });
  pushActivity(
    wasRepeat
      ? 'You reminisce A Summer’s Day and return to Ur.'
      : 'A Summer’s Day complete. Five Qurazy quoins gather around you.'
  );
  savePlayerState();
  renderSummersDayHud();
  const copy = (wasRepeat ? SUMMERS_DAY_REPEAT_COMPLETION : SUMMERS_DAY_COMPLETION)
    .replace('{pc_label}', 'friend');
  await returnFromSummersDay({ completionText: copy });
  return true;
}

function confirmLeaveSummersDay() {
  if (!summersDayIsInstanced()) return;
  openScriptedQuestDialogue({
    title: 'A Summer’s Day',
    kicker: 'Leave the memory?',
    cancelable: true,
    beats: [{
      text: 'This private memory will dissolve behind you, but you can ask to visit again.',
      response: 'Leave the memory',
    }],
    onComplete: () => returnFromSummersDay({ abandon: true }),
  });
}

function summersDayInBuoyancy() {
  return Boolean(
    summersDayRun?.stage === 'main' &&
      player &&
      player.x >= 1270 &&
      player.x <= 2440 &&
      player.y >= 500
  );
}

function handleSummersDayBuoyancyInput() {
  const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
  const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
  const lift =
    keys.has(' ') ||
    keys.has('ArrowUp') ||
    keys.has('w') ||
    keys.has('W');
  const down = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
  if (left && !right) player.vx = Math.max(-2.8, player.vx - 0.13);
  else if (right && !left) player.vx = Math.min(2.8, player.vx + 0.13);
  else player.vx *= 0.94;
  if (lift && !down) player.vy = Math.max(-2.45, player.vy - 0.16);
  else if (down && !lift) player.vy = Math.min(2.3, player.vy + 0.13);
  else player.vy += 0.035;
  player.vy *= 0.97;
  player.onGround = false;
  clearJumpQueue(jumpState);
  applyPlayerFacing();
  setPlayerAnim(Math.abs(player.vx) + Math.abs(player.vy) > 0.25 ? 'walk' : 'idle');
}

function summersDayBuoyancyPhysics(dt) {
  player.x = clamp(player.x + player.vx * dt, 1250, 2460);
  player.y = clamp(player.y + player.vy * dt, 535, 830);
  if (player.x <= 1252 && player.vx < 0) player.vx *= -0.2;
  if (player.x >= 2458 && player.vx > 0) player.vx *= -0.2;
  if (player.y <= 537 && player.vy < 0) player.vy *= -0.18;
  if (player.y >= 828 && player.vy > 0) player.vy *= -0.18;
  player.rotation += (clamp(player.vy * 0.018, -0.1, 0.1) - player.rotation) * dampingAlpha(0.14, dt);
  if (app?.view) app.view.dataset.summerDayBuoyancy = '1';
}

function updateSummersDay(dt) {
  if (!summersDayIsInstanced() || summersDayTransitionBusy) return;
  const now = Date.now();
  if (summersDayRemainingMs(summersDayRun, now) <= 0) {
    pushActivity(
      summersDayRun.stage === 'bonus'
        ? 'The two-minute Annex faded.'
        : 'The five-minute summer memory faded.'
    );
    returnFromSummersDay({ expired: true });
    return;
  }
  if (summersDayWaterLine) {
    summersDayWaterLine.alpha = 0.62 + Math.sin(time * 0.05) * 0.12;
    summersDayWaterLine.scale.x = 1.72 + Math.sin(time * 0.035) * 0.05;
  }
  if (summersDayRun.stage === 'main') {
    const next = summersDayCheckpoints[summersDayRun.checkpoints.length];
    if (next?.sprite) {
      const pulse = 1 + Math.sin(time * 0.09 + next.index) * 0.09;
      next.sprite.scale.set(
        next.sprite._summerBaseScaleX * pulse,
        next.sprite._summerBaseScaleY * pulse
      );
      if (
        !menuTarget &&
        Math.hypot(next.x - player.x, next.y - player.y) < (next.id === 'water' ? 105 : 78)
      ) {
        advanceSummersDayMoment(next);
        return;
      }
    }
  } else {
    for (const entry of summersDayBonusQuoins) {
      if (entry.collected || !entry.sprite?.parent) continue;
      entry.sprite._summerPhase += 0.05 * dt;
      const pulse = 1 + Math.sin(entry.sprite._summerPhase) * 0.13;
      entry.sprite.scale.set(entry.sprite.baseScale * pulse);
      entry.sprite.alpha = 0.78 + Math.sin(entry.sprite._summerPhase * 1.4) * 0.16;
      if (
        !menuTarget &&
        Math.hypot(entry.sprite.x - player.x, entry.sprite.y - (player.y - 28)) < 46
      ) {
        const result = collectSummersDayBonusQuoin(
          summersDayRun,
          entry.index,
          Date.now(),
          SUMMERS_DAY_BONUS_DOT_COUNT
        );
        if (result.ok) {
          entry.collected = true;
          pc.imagination = (pc.imagination || 0) + result.amount;
          pc.xp = (pc.xp || 0) + result.amount;
          const { x, y } = entry.sprite;
          entityLayer.removeChild(entry.sprite);
          playSfx('quoin', { volume: 0.48, rate: 1.08 });
          floatText(x, y - 18, `+${result.amount} iMG`, 0xeafcff);
          burst(x, y, 0xdff8ff, 11);
          pushActivity(`A pale memory dot becomes +${result.amount} iMG.`);
          updateHud();
        }
      }
    }
    if (
      summersDayExit?.sprite &&
      Math.hypot(summersDayExit.sprite.x - player.x, summersDayExit.sprite.y - player.y) < 76
    ) {
      completeSummersDay();
      return;
    }
  }
  const autoplay = new URLSearchParams(location.search).get('summerautoplay');
  const autoplayActive =
    autoplay === '1' ||
    (autoplay === 'main' && summersDayRun.stage === 'main') ||
    (autoplay === 'water' &&
      summersDayRun.stage === 'main' &&
      summersDayRun.checkpoints.length < 5) ||
    (autoplay === 'bonus' && summersDayRun.stage === 'main');
  if (autoplayActive && now >= summersDayAutoNextAt) {
    summersDayAutoNextAt = now + 190;
    if (isQuestDialogueOpen()) {
      advanceQuestDialogue();
      return;
    }
    if (summersDayRun.stage === 'main') {
      const next = summersDayCheckpoints[summersDayRun.checkpoints.length];
      if (next) {
        player.x = next.x;
        player.y = next.y;
        player.vx = 0;
        player.vy = 0;
        player.onGround = true;
      }
    } else {
      const nextQuoin = summersDayBonusQuoins.find(
        (entry) => !entry.collected && entry.sprite?.parent
      );
      const target = nextQuoin?.sprite || summersDayExit?.sprite;
      if (target) {
        player.x = target.x;
        player.y = nextQuoin ? target.y + 28 : target.y;
        player.vx = 0;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }
  if (app?.view && !summersDayInBuoyancy()) app.view.dataset.summerDayBuoyancy = '0';
  renderSummersDayHud();
}

function rookWoodsIsInstanced() {
  return Boolean(rookWoodsState && currentStreetTsid === ROOK_WOODS_STREET_ID);
}

function rookEggTexture(state = ROOK_EGG_INITIAL_STATE) {
  if (!rookEggTextures.length) {
    const texture = PIXI.Texture.from(
      'assets/sprites/quests/rook-woods/rook-egg-states.png'
    );
    rookEggTextures = Array.from(
      { length: 5 },
      (_, index) =>
        new PIXI.Texture(
          texture.baseTexture,
          new PIXI.Rectangle(index * 171, 0, 171, 168)
        )
    );
  }
  const index = clamp(ROOK_EGG_INITIAL_STATE - Number(state || 5), 0, 4);
  return rookEggTextures[index] || rookEggTextures[0];
}

function drawRookWoodsBackground() {
  const root = new PIXI.Container();
  root.sortableChildren = true;
  root.worldW = 2300;
  root.worldH = 900;

  const sky = new PIXI.Graphics();
  sky.beginFill(0x262a24);
  sky.drawRect(0, 0, root.worldW, root.worldH);
  sky.beginFill(0x394038, 0.76);
  sky.drawRect(0, 245, root.worldW, 350);
  sky.beginFill(0x1b211d, 0.88);
  sky.drawRect(0, 595, root.worldW, 305);
  sky.endFill();
  sky.zIndex = -1000;
  root.addChild(sky);

  const hills = new PIXI.Graphics();
  hills.zIndex = -900;
  hills.beginFill(0x212923, 0.7);
  hills.drawPolygon([
    0, 650, 210, 505, 420, 620, 660, 470, 890, 625, 1120, 485,
    1360, 610, 1580, 450, 1820, 615, 2050, 490, 2300, 625, 2300, 900, 0, 900,
  ]);
  hills.endFill();
  root.addChild(hills);

  const mist = new PIXI.Graphics();
  mist.zIndex = -880;
  for (let i = 0; i < 14; i += 1) {
    mist.beginFill(0x8b9184, 0.035 + (i % 3) * 0.012);
    mist.drawEllipse(100 + i * 175, 510 + (i % 4) * 34, 230, 58);
    mist.endFill();
  }
  root.addChild(mist);

  const layerById = new Map(
    ROOK_FOREST_DEPTH_LAYERS.map((layer) => [layer.id, layer])
  );
  for (const spec of ROOK_FOREST_DECOS) {
    const layer = layerById.get(spec.layer);
    if (!layer) continue;
    const sprite = new PIXI.Sprite(
      PIXI.Texture.from(`assets/decos/groddle/${spec.asset}`)
    );
    sprite.anchor.set(spec.anchorX, spec.anchorY);
    sprite.position.set(spec.x, spec.y);
    sprite.scale.set(spec.scaleX, spec.scaleY);
    sprite.rotation = spec.rotation;
    sprite.tint = layer.tint;
    sprite.alpha = layer.alpha * spec.alpha;
    sprite.zIndex = layer.zIndex;
    sprite.eventMode = 'none';
    root.addChild(sprite);
  }

  const limbs = new PIXI.Graphics();
  limbs.zIndex = -165;
  for (const limb of ROOK_FOREST_LIMBS) {
    const [startX, startY, ...rest] = limb.points;
    limbs.lineStyle(limb.width + 11, 0x050806, limb.alpha * 0.42);
    limbs.moveTo(startX, startY);
    for (let index = 0; index < rest.length; index += 2) {
      limbs.lineTo(rest[index], rest[index + 1]);
    }
    limbs.lineStyle(limb.width, 0x0a0d0a, limb.alpha);
    limbs.moveTo(startX, startY);
    for (let index = 0; index < rest.length; index += 2) {
      limbs.lineTo(rest[index], rest[index + 1]);
    }
    limbs.lineStyle(Math.max(3, limb.width * 0.1), 0x343a2e, limb.alpha * 0.24);
    limbs.moveTo(startX, startY - limb.width * 0.13);
    for (let index = 0; index < rest.length; index += 2) {
      limbs.lineTo(rest[index], rest[index + 1] - limb.width * 0.13);
    }
  }
  root.addChild(limbs);

  const platforms = [
    { id: 'rook-ground-west', x1: 0, y1: 780, x2: 560, y2: 780 },
    { id: 'rook-rise-one', x1: 560, y1: 780, x2: 760, y2: 690 },
    { id: 'rook-branch-one', x1: 760, y1: 690, x2: 1020, y2: 690 },
    { id: 'rook-rise-two', x1: 1020, y1: 690, x2: 1210, y2: 560 },
    { id: 'rook-branch-high', x1: 1210, y1: 560, x2: 1430, y2: 560 },
    { id: 'rook-fall', x1: 1430, y1: 560, x2: 1610, y2: 780 },
    { id: 'rook-ground-nest', x1: 1610, y1: 780, x2: 2300, y2: 780 },
  ];

  const path = new PIXI.Graphics();
  path.zIndex = -80;
  for (const platform of platforms) {
    path.lineStyle(62, 0x0b0e0c, 1);
    path.moveTo(platform.x1, platform.y1 + 16);
    path.lineTo(platform.x2, platform.y2 + 16);
    path.lineStyle(27, 0x20251c, 1);
    path.moveTo(platform.x1, platform.y1 + 3);
    path.lineTo(platform.x2, platform.y2 + 3);
    path.lineStyle(5, 0x5d624b, 0.28);
    path.moveTo(platform.x1, platform.y1 - 2);
    path.lineTo(platform.x2, platform.y2 - 2);
  }
  root.addChild(path);

  const foreground = new PIXI.Graphics();
  foreground.zIndex = -40;
  foreground.beginFill(0x080b09);
  foreground.drawPolygon([
    0, 797, 310, 790, 455, 805, 610, 790, 760, 705, 1010, 706,
    1208, 578, 1438, 578, 1610, 798, 1790, 792, 1940, 804, 2300, 792,
    2300, 900, 0, 900,
  ]);
  foreground.endFill();
  root.addChild(foreground);

  const nest = new PIXI.Graphics();
  nest.zIndex = -25;
  nest.lineStyle(6, 0x241a12, 1);
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI;
    nest.moveTo(2070 - Math.cos(angle) * 78, 778 - Math.sin(angle) * 12);
    nest.lineTo(2190 + Math.cos(angle * 1.7) * 34, 773 - Math.sin(angle * 1.3) * 28);
  }
  root.addChild(nest);

  const birds = new PIXI.Graphics();
  birds.zIndex = -860;
  birds.lineStyle(3, 0x0d110e, 0.52);
  for (let i = 0; i < 8; i += 1) {
    const bx = 330 + i * 245;
    const by = 215 + (i % 3) * 44;
    birds.moveTo(bx - 14, by + 3);
    birds.quadraticCurveTo(bx - 5, by - 8, bx, by);
    birds.quadraticCurveTo(bx + 6, by - 9, bx + 15, by + 2);
  }
  root.addChild(birds);

  root.platformsScreen = platforms;
  root.signViews = [];
  return root;
}

function drawRookCrusher(spec) {
  const root = new PIXI.Container();
  root.name = `rook-crusher-${spec.id}`;
  root.zIndex = 58;
  root.eventMode = 'none';

  const shadow = new PIXI.Graphics();
  shadow.beginFill(0x050706, 0.52);
  shadow.drawEllipse(0, spec.size * 0.48, spec.size * 0.52, 15);
  shadow.endFill();
  root.addChild(shadow);

  const body = new PIXI.Graphics();
  const half = spec.size / 2;
  body.lineStyle(4, 0x151812, 0.9);
  body.beginFill(0x4b5142);
  body.drawRoundedRect(-half, -half, spec.size, spec.size, 17);
  body.endFill();
  body.beginFill(0x68705c, 0.46);
  body.drawPolygon([
    -half + 9, -half + 10,
    half - 13, -half + 10,
    half - 24, -half + 31,
    -half + 18, -half + 27,
  ]);
  body.endFill();
  body.beginFill(0x272c24, 0.52);
  body.drawPolygon([
    half - 22, -half + 30,
    half - 8, -half + 13,
    half - 8, half - 13,
    half - 27, half - 5,
  ]);
  body.endFill();
  const pocks = [
    [-0.25, -0.22, 0.1],
    [0.22, -0.29, 0.075],
    [-0.12, 0.19, 0.08],
    [0.29, 0.23, 0.11],
    [-0.34, 0.31, 0.055],
  ];
  for (const [px, py, radius] of pocks) {
    body.beginFill(0x252a22, 0.75);
    body.drawEllipse(px * spec.size, py * spec.size, radius * spec.size, radius * spec.size * 0.78);
    body.endFill();
    body.lineStyle(2, 0x7d836c, 0.25);
    body.drawEllipse(px * spec.size - 2, py * spec.size - 2, radius * spec.size * 0.72, radius * spec.size * 0.5);
  }
  root.addChild(body);
  root._body = body;
  root._shadow = shadow;
  root._lastPhase = '';
  return root;
}

function spawnRookCrushers() {
  rookCrushers = ROOK_CRUSHERS.map((spec) => {
    const sprite = drawRookCrusher(spec);
    const position = crusherPosition(spec, 0);
    sprite.position.set(position.x, position.y);
    entityLayer.addChild(sprite);
    return { spec, sprite, position };
  });
}

function spawnRookEgg() {
  const sprite = new PIXI.Sprite(rookEggTexture(rookWoodsState?.eggState));
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(0.84);
  sprite.position.set(2140, 784);
  sprite.zIndex = 54;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  sprite._rookHitW = 145;
  sprite._rookHitH = 118;
  entityLayer.addChild(sprite);
  rookEggTarget = register({
    classId: 'rook_egg',
    label: 'Rook Egg',
    subtitle: 'Do it! Smash it open!',
    sprite,
    state: { rookState: rookWoodsState },
  });
  return rookEggTarget;
}

function resetRookEggSmashVisual() {
  if (!rookEggTarget || rookWoodsState?.eggSmashed) return;
  rookWoodsState.eggState = ROOK_EGG_INITIAL_STATE;
  rookEggTarget.sprite.texture = rookEggTexture(ROOK_EGG_INITIAL_STATE);
  rookEggTarget.sprite.rotation = 0;
  rookEggTarget.sprite.scale.set(0.84);
}

function updateRookEggSmashVisual(action) {
  if (action?.target !== rookEggTarget || !rookWoodsState || rookWoodsState.eggSmashed) return;
  const state = rookEggStateForProgress(action.progress);
  if (state !== rookWoodsState.eggState) {
    rookWoodsState.eggState = state;
    rookEggTarget.sprite.texture = rookEggTexture(state);
    playSfx('pickup', { volume: 0.32, rate: 0.56 + (5 - state) * 0.08 });
    burst(rookEggTarget.sprite.x, rookEggTarget.sprite.y - 56, 0x9b997c, 8);
  }
  const pulse = Math.sin(action.progress * Math.PI * 8);
  rookEggTarget.sprite.rotation = pulse * 0.025;
  rookEggTarget.sprite.scale.set(0.84 + Math.abs(pulse) * 0.025, 0.84 - Math.abs(pulse) * 0.015);
}

function renderRookWoodsHud() {
  const hud = document.getElementById('rook-woods-hud');
  const visible = rookWoodsIsInstanced();
  if (hud) hud.hidden = !visible;
  if (!visible) return;
  const remaining = rookWoodsRemainingMs(rookWoodsState);
  const seconds = Math.ceil(remaining / 1000);
  const tool = findWorkingRookTool(inv, toolState);
  const timer = hud.querySelector('[data-rook-timer]');
  const objective = hud.querySelector('[data-rook-objective]');
  const hits = hud.querySelector('[data-rook-hits]');
  const egg = hud.querySelector('[data-rook-egg]');
  const toolEl = hud.querySelector('[data-rook-tool]');
  if (timer) {
    timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    timer.classList.toggle('is-low', remaining <= 20_000);
  }
  if (objective) objective.textContent = rookWoodsObjective(rookWoodsState);
  if (hits) hits.textContent = String(rookWoodsState.hits);
  if (egg) egg.textContent = rookWoodsState.eggSmashed ? 'Smashed' : `State ${rookWoodsState.eggState}/5`;
  if (toolEl) {
    toolEl.textContent = tool.ok
      ? `${tool.profile.label} ready · ${Math.round(tool.condition.condition.remaining)} condition`
      : 'No working smashing tool';
  }
  if (app?.view) {
    app.view.dataset.rookWoodsStatus = rookWoodsState.status;
    app.view.dataset.rookWoodsRemaining = String(remaining);
    app.view.dataset.rookWoodsHits = String(rookWoodsState.hits);
    app.view.dataset.rookEggState = String(rookWoodsState.eggState);
    app.view.dataset.rookWoodsObjective = rookWoodsObjective(rookWoodsState);
    app.view.dataset.rookTool = tool.ok ? tool.classTsid : 'none';
  }
}

function setupRookWoodsInstance() {
  clearWorldEntities();
  if (bgLayer && world) {
    world.removeChild(bgLayer);
    bgLayer.destroy({ children: true });
  }
  bgLayer = drawRookWoodsBackground();
  world.addChildAt(bgLayer, 0);
  currentStreet = {
    tsid: ROOK_WOODS_STREET_ID,
    label: "Rooks' Woods",
    hubName: 'A Humbaba trial',
    hubId: 'rook',
    bounds: { l: 0, r: bgLayer.worldW, t: 0, b: bgLayer.worldH },
    platforms: bgLayer.platformsScreen,
    signposts: [],
  };
  currentStreetTsid = ROOK_WOODS_STREET_ID;
  WORLD_W = bgLayer.worldW;
  GROUND_Y = rookWoodsState.spawn.y;
  streetPlatforms = bgLayer.platformsScreen;
  streetWalls = [];
  climb = { active: false, wall: null };
  Object.assign(jumpState, createJumpState(movementNow()));
  spawnRookCrushers();
  spawnRookEgg();
  if (player) {
    player.position.set(rookWoodsState.spawn.x, rookWoodsState.spawn.y);
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.rotation = 0;
    noteGrounded(jumpState, true, movementNow());
  }
  camTarget = cameraTargetForPlayer(player.x);
  camY = cameraTargetY(player.y, activeCameraWorldHeight(), LOCATION_VIEW_H);
  world.position.set(-Math.round(camTarget), -Math.round(camY));
  const name = document.getElementById('street-name');
  if (name) {
    name.textContent = "Rooks' Woods · A Humbaba trial";
    name.dataset.tsid = ROOK_WOODS_STREET_ID;
  }
  setAmbientForStreet({ hubName: 'Rook Woods' }, { force: true });
  if (app?.view) {
    app.view.dataset.rookWoodsSource = 'rook_egg_smash.js + crusher.js + supplied video';
    app.view.dataset.rookForestArt = ROOK_FOREST_ART_ID;
    app.view.dataset.rookForestLayers = String(ROOK_FOREST_DEPTH_LAYERS.length);
    app.view.dataset.rookForestDecos = String(ROOK_FOREST_DECOS.length);
    app.view.dataset.rookForestLimbs = String(ROOK_FOREST_LIMBS.length);
  }
  savePlayerLocation(rookWoodsSourceLocation);
  renderRookWoodsHud();
  updateHud();
}

async function startRookWoodsQuest(opts = {}) {
  if (rookWoodsStartPromise) return rookWoodsStartPromise;
  if (rookWoodsIsInstanced()) return rookWoodsState;
  const tool = findWorkingRookTool(inv, toolState);
  if (!tool.ok) {
    toast(tool.msg, 4200);
    return null;
  }
  rookWoodsStartPromise = (async () => {
    if (!questState.active[ROOK_QUEST_ID]) {
      const assigned = assignQuest(questState, ROOK_QUEST_ID, { ignorePrereq: true });
      if (!assigned.ok) return null;
    }
    closeQuestPanel();
    closeQuestDialogue();
    closePackPopover();
    rookWoodsSourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x ?? WORLD_W * 0.5,
      y: player?.y ?? GROUND_Y,
    };
    rookWoodsState = createRookWoodsState({
      sourceLocation: rookWoodsSourceLocation,
    });
    rookWoodsTransitionBusy = true;
    rookLastHitAt = 0;
    rookHitFx = null;
    rookAutoNextAt = 0;
    savePlayerLocation(rookWoodsSourceLocation);
    const setup = () => setupRookWoodsInstance();
    const transition = document.getElementById('screen-transition');
    if (opts.useTransition !== false && transition) {
      await runStreetTransition(transition, {
        fromLabel: currentStreet?.label || '',
        fromHub: currentStreet?.hubName || '',
        toLabel: "Rooks' Woods",
        toHub: 'A Humbaba trial',
        topColor: '#2e332c',
        bottomColor: '#101411',
        onMid: setup,
      });
    } else {
      setup();
    }
    rookWoodsTransitionBusy = false;
    pushActivity("Rooks' Woods: evade the Crushers and smash the Rook Egg.");
    openScriptedQuestDialogue({
      title: "Rooks' Woods",
      kicker: 'A warning from Humbaba',
      beats: [
        {
          text: "Ah, the Rooks' Woods. Careful of the Crushers …",
          response: 'Crushers?',
        },
        {
          text: "Get too close to those mean rocks and you'll get a bad shock and have to start over.",
          response: "I'll be careful.",
        },
      ],
      onComplete: () => {
        beginRookWoods(rookWoodsState, Date.now());
        renderRookWoodsHud();
        toast('Two minutes. Find the Egg!', 3000);
      },
    });
    return rookWoodsState;
  })();
  try {
    return await rookWoodsStartPromise;
  } finally {
    rookWoodsStartPromise = null;
    rookWoodsTransitionBusy = false;
  }
}

async function returnFromRookWoods({ abandon = false, expired = false } = {}) {
  if (!rookWoodsState || rookWoodsTransitionBusy) return false;
  rookWoodsTransitionBusy = true;
  const destination = rookWoodsSourceLocation?.tsid
    ? { ...rookWoodsSourceLocation }
    : { tsid: STREET_INDEX.default };
  if (abandon || expired) delete questState.active[ROOK_QUEST_ID];
  const status = expired ? 'expired' : abandon ? 'abandoned' : rookWoodsState.status;
  closeQuestDialogue({ force: true });
  rookWoodsState = null;
  rookWoodsSourceLocation = null;
  rookCrushers = [];
  rookEggTarget = null;
  rookHitFx = null;
  mrHairballTarget = null;
  smallWorthlessTarget = null;
  rookMuseumTargets = [];
  rookMuseumGreeter = null;
  closeRookMuseumExhibit();
  const hud = document.getElementById('rook-woods-hud');
  if (hud) hud.hidden = true;
  try {
    await enterStreetWithTransition(destination.tsid, {
      spawnX: destination.x,
      spawnY: destination.y,
      quiet: true,
    });
    savePlayerLocation(destination);
    savePlayerState();
    if (app?.view) app.view.dataset.rookWoodsStatus = status;
    if (expired) toast("The Rooks' Woods closed. You can try again later.", 4000);
    else if (abandon) toast('You leave the Rook Egg for another attempt.', 3200);
    updateHud();
    return true;
  } finally {
    rookWoodsTransitionBusy = false;
  }
}

function confirmLeaveRookWoods() {
  if (!rookWoodsIsInstanced()) return;
  openScriptedQuestDialogue({
    title: "Rooks' Woods",
    kicker: 'Leave the trial?',
    cancelable: true,
    beats: [
      {
        text: 'Humbaba can send you back when you have another working tool and feel ready.',
        response: "Leave Rooks' Woods",
      },
    ],
    onComplete: () => returnFromRookWoods({ abandon: true }),
  });
}

function handleRookEggTarget(target, verbId) {
  if (!rookWoodsIsInstanced() || target !== rookEggTarget || verbId !== 'smash') return;
  const tool = findWorkingRookTool(inv, toolState);
  if (!tool.ok) {
    toast(tool.msg, 3600);
    resetRookEggSmashVisual();
    return;
  }
  const result = completeRookEggSmash(rookWoodsState, tool.classTsid);
  if (!result.ok) return;
  const wear = useToolCondition(toolState, tool.classTsid, tool.profile.wear);
  target.sprite.texture = rookEggTexture(1);
  target.sprite.rotation = 0;
  target.sprite.scale.set(0.84);
  target.subtitle = "It's been smashed already.";
  playSfx('quest', { volume: 0.76, rate: 0.92 });
  burst(target.sprite.x, target.sprite.y - 58, 0xd2c281, 34);
  floatText(target.sprite.x, target.sprite.y - 122, 'ROOK EGG SMASHED!', 0xf0d78d);
  const updates = applyQuestProgress(questState, 'rook_egg_smashed', 1, pc);
  announceQuestCompletions(
    updates.map((update) =>
      (update.classTsid || update.def?.classTsid) === ROOK_QUEST_ID
        ? { ...update, onDismiss: () => returnFromRookWoods() }
        : update
    )
  );
  pushActivity(
    `You smashed the Rook Egg with a ${tool.profile.label}.` +
      (wear.broke ? ` ${wear.msg}` : '')
  );
  savePlayerState();
  renderRookWoodsHud();
  updateHud();
}

function beginRookCrusherHit(entry, now) {
  if (!rookWoodsState || rookHitFx || now - rookLastHitAt < 900) return false;
  const hit = recordCrusherHit(rookWoodsState, entry.spec.id);
  if (!hit.ok) return false;
  rookLastHitAt = now;
  cancelCurrentAction({ quiet: true });
  const moodLoss = crusherMoodLoss(player.x, rookWoodsState.spawn.x);
  pc.mood = Math.max(0, (pc.mood || 0) - moodLoss);
  keys.clear();
  rookHitFx = {
    startedAt: now,
    durationMs: 760,
    fromX: player.x,
    fromY: player.y,
    toX: rookWoodsState.spawn.x,
    toY: rookWoodsState.spawn.y,
  };
  burst(player.x, player.y - 48, 0xa79d7b, 26);
  playSfx('pickup', { volume: 0.62, rate: 0.45 });
  toast('Ow. Crushers suck!', 2200);
  pushActivity(
    `A Crusher knocked you back to the start.${moodLoss ? ` -${moodLoss} mood.` : ''}`
  );
  if (app?.view) app.view.dataset.rookLastHit = entry.spec.id;
  renderRookWoodsHud();
  updateHud();
  return true;
}

function updateRookHitFx(now) {
  if (!rookHitFx || !player) return false;
  const progress = clamp((now - rookHitFx.startedAt) / rookHitFx.durationMs, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  player.x = rookHitFx.fromX + (rookHitFx.toX - rookHitFx.fromX) * eased;
  player.y =
    rookHitFx.fromY +
    (rookHitFx.toY - rookHitFx.fromY) * eased -
    Math.sin(progress * Math.PI) * 86;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.rotation = Math.sin(progress * Math.PI * 6) * 0.13 * (1 - progress);
  if (progress < 1) return true;
  player.position.set(rookHitFx.toX, rookHitFx.toY);
  player.rotation = 0;
  player.onGround = true;
  noteGrounded(jumpState, true, movementNow());
  rookHitFx = null;
  resetRookEggSmashVisual();
  return false;
}

function updateRookWoods(dt) {
  if (!rookWoodsIsInstanced() || rookWoodsTransitionBusy) return;
  const now = Date.now();
  if (rookWoodsState.status === 'running' && rookWoodsRemainingMs(rookWoodsState, now) <= 0) {
    expireRookWoods(rookWoodsState, now);
    pushActivity("The two-minute Rooks' Woods timer ran out.");
    returnFromRookWoods({ expired: true });
    return;
  }

  const knocked = updateRookHitFx(now);
  const elapsed = rookWoodsState.startedAt ? now - rookWoodsState.startedAt : 0;
  for (const entry of rookCrushers) {
    const position = crusherPosition(entry.spec, elapsed);
    entry.position = position;
    entry.sprite.position.set(position.x, position.y);
    const impact = position.phase === 'impact';
    entry.sprite._body.scale.set(impact ? 1.04 : 1, impact ? 0.96 : 1);
    entry.sprite._shadow.alpha = impact ? 0.75 : 0.42;
    if (impact && entry.sprite._lastPhase !== 'impact') {
      burst(position.x, position.y + entry.spec.size * 0.45, 0x7d765f, 12);
      playSfx('pickup', { volume: 0.24, rate: 0.42 });
    }
    entry.sprite._lastPhase = position.phase;
  }

  const autoplay = new URLSearchParams(location.search).get('rookautoplay') === '1';
  if (
    !knocked &&
    !autoplay &&
    rookWoodsState.status === 'running' &&
    now - rookLastHitAt >= 900
  ) {
    for (const entry of rookCrushers) {
      if (
        crusherHitsAvatar(entry.spec, entry.position, {
          x: player.x,
          y: player.y,
          halfWidth: 21,
          height: 86,
        })
      ) {
        beginRookCrusherHit(entry, now);
        break;
      }
    }
  }

  if (autoplay && now >= rookAutoNextAt) {
    rookAutoNextAt = now + 220;
    if (isQuestDialogueOpen()) {
      advanceQuestDialogue();
    } else if (
      rookWoodsState.status === 'running' &&
      !currentAction &&
      rookEggTarget?.sprite
    ) {
      player.position.set(rookEggTarget.sprite.x - 72, rookEggTarget.sprite.y);
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      const smash = getVerbsFor(rookEggTarget, {
        pc,
        inv,
        tools: toolState,
        skills: skillState,
      }).find((verb) => verb.id === 'smash' && verb.enabled);
      if (smash) beginVerbAction(rookEggTarget, smash);
    }
  }
  renderRookWoodsHud();
}

const ROOK_MUSEUM_ASSET_ROOT = 'assets/sprites/quests/rook-museum';

function rookMuseumIsInstanced() {
  return Boolean(rookMuseumState && currentStreetTsid === ROOK_MUSEUM_STREET_ID);
}

function drawRookMuseumBackground() {
  const root = new PIXI.Container();
  root.sortableChildren = true;
  root.worldW = 3300;
  root.worldH = 620;
  root.sourceWorldH = 620;

  const wall = new PIXI.Graphics();
  wall.zIndex = -1000;
  wall.beginFill(0x2c1b15);
  wall.drawRect(0, 0, root.worldW, root.worldH);
  wall.beginFill(0x6f472e);
  wall.drawRect(0, 40, root.worldW, 450);
  wall.beginFill(0x54321f);
  for (let x = 0; x < root.worldW; x += 86) wall.drawRect(x, 40, 4, 450);
  wall.beginFill(0x281913);
  wall.drawRect(0, 0, root.worldW, 46);
  wall.drawRect(0, 482, root.worldW, 138);
  wall.beginFill(0x9b6b3c);
  wall.drawRect(0, 474, root.worldW, 12);
  wall.beginFill(0xc69a5c, 0.24);
  for (let x = 0; x < root.worldW; x += 145) wall.drawRect(x, 504, 110, 4);
  wall.endFill();
  root.addChild(wall);

  for (let x = 340; x < root.worldW; x += 470) {
    const light = new PIXI.Graphics();
    light.zIndex = -900;
    light.beginFill(0xffe9aa, 0.045);
    light.drawPolygon([x - 95, 48, x + 95, 48, x + 180, 482, x - 180, 482]);
    light.endFill();
    root.addChild(light);
  }

  const trim = new PIXI.Graphics();
  trim.zIndex = -40;
  trim.lineStyle(3, 0xd3aa69, 0.55);
  trim.moveTo(0, 475);
  trim.lineTo(root.worldW, 475);
  trim.lineStyle(2, 0x1f120d, 0.8);
  trim.moveTo(0, 500);
  trim.lineTo(root.worldW, 500);
  root.addChild(trim);

  root.platformsScreen = [
    { id: 'rook-museum-floor', x1: 0, y1: 500, x2: root.worldW, y2: 500, pc_perm: 1 },
  ];
  root.signViews = [];
  return root;
}

function makeRookMuseumPlacard(exhibit) {
  const label = new PIXI.Text(exhibit.shortTitle, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 14,
    fontWeight: '700',
    fill: 0xf2dab0,
    align: 'center',
  });
  label.anchor.set(0.5, 1);
  label.position.set(exhibit.x, 453);
  label.zIndex = 42;
  entityLayer.addChild(label);
}

function makeRookMuseumSpeaker(exhibit) {
  const sprite = new PIXI.Sprite(
    PIXI.Texture.from(`${ROOK_MUSEUM_ASSET_ROOT}/rook_hall_speaker__x1_stop_png_1354835940.png`)
  );
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(0.68);
  sprite.position.set(exhibit.x + 168, 502);
  sprite.zIndex = 55;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  entityLayer.addChild(sprite);
  const target = register({
    classId: 'rook_hall_speaker',
    label: `${exhibit.number}. ${exhibit.shortTitle}`,
    subtitle: 'Push for the recorded lesson',
    sprite,
    state: { museumState: rookMuseumState, exhibitId: exhibit.id },
  });
  rookMuseumTargets.push(target);
  return target;
}

function spawnRookMuseumExhibits() {
  rookMuseumTargets = [];
  for (const exhibit of ROOK_MUSEUM_EXHIBITS) {
    let sprite;
    if (exhibit.kind === 'painting') {
      sprite = new PIXI.Sprite(
        PIXI.Texture.from(
          `${ROOK_MUSEUM_ASSET_ROOT}/paintings/painting-${exhibit.painting}c.jpg`
        )
      );
      sprite.anchor.set(0.5, 1);
      sprite.width = 330;
      sprite.height = 201;
      sprite.position.set(exhibit.x, 408);
    } else if (exhibit.kind === 'orb') {
      sprite = new PIXI.Sprite(
        PIXI.Texture.from(
          `${ROOK_MUSEUM_ASSET_ROOT}/rook_hall_focusing_orb__x1_1_png_1354835872.png`
        )
      );
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(0.86);
      sprite.position.set(exhibit.x, 425);
    } else {
      sprite = new PIXI.Sprite(
        PIXI.Texture.from(
          `${ROOK_MUSEUM_ASSET_ROOT}/rook_hall_shrine_holofilm__x1_stop_png_1354835839.png`
        )
      );
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(0.66);
      sprite.position.set(exhibit.x, 420);
    }
    sprite.zIndex = 35;
    entityLayer.addChild(sprite);
    makeRookMuseumPlacard(exhibit);
    makeRookMuseumSpeaker(exhibit);
  }
}

function spawnRookMuseumGreeter() {
  const sprite = new PIXI.Container();
  sprite.zIndex = 58;
  const shadow = new PIXI.Graphics();
  shadow.beginFill(0x1d100b, 0.35);
  shadow.drawEllipse(0, 0, 38, 9);
  shadow.endFill();
  sprite.addChild(shadow);
  const body = new PIXI.Graphics();
  body.lineStyle(3, 0x4e301e, 0.9);
  body.beginFill(0x9b744c);
  body.drawRoundedRect(-31, -96, 62, 72, 14);
  body.endFill();
  body.beginFill(0xc49a63);
  body.drawRoundedRect(-38, -144, 76, 54, 18);
  body.endFill();
  body.beginFill(0xead6a5);
  body.drawCircle(-13, -119, 7);
  body.drawCircle(13, -119, 7);
  body.beginFill(0x754534);
  body.drawCircle(-13, -119, 3);
  body.drawCircle(13, -119, 3);
  body.beginFill(0xc44f3f);
  body.drawCircle(0, -59, 7);
  body.endFill();
  sprite.addChild(body);
  const antenna = new PIXI.Graphics();
  antenna.lineStyle(3, 0x765238, 1);
  antenna.moveTo(0, -145);
  antenna.lineTo(0, -164);
  antenna.beginFill(0xe0b85e);
  antenna.drawCircle(0, -168, 6);
  antenna.endFill();
  sprite.addChild(antenna);
  sprite.position.set(185, 500);
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  entityLayer.addChild(sprite);
  rookMuseumGreeter = register({
    classId: 'npc_quest_widget',
    label: 'Greeterbot Sentry G-42',
    subtitle: 'Museum docent',
    sprite,
    state: { museumState: rookMuseumState },
  });
  return rookMuseumGreeter;
}

function renderRookMuseumHud() {
  const hud = document.getElementById('rook-museum-hud');
  const visible = rookMuseumIsInstanced();
  if (hud) hud.hidden = !visible;
  if (!visible) return;
  const visited = rookMuseumState.visited || [];
  const objective = hud.querySelector('[data-rook-museum-objective]');
  const count = hud.querySelector('[data-rook-museum-count]');
  const stage = hud.querySelector('[data-rook-museum-stage]');
  if (objective) objective.textContent = rookMuseumObjective(rookMuseumState);
  if (count) count.textContent = `${visited.length} / ${ROOK_MUSEUM_EXHIBIT_COUNT}`;
  if (stage) {
    stage.textContent =
      rookMuseumState.status === 'arrival'
        ? 'Greeterbot orientation'
        : rookMuseumState.status === 'ready'
          ? 'Final briefing'
          : 'Self-guided exhibition';
  }
  for (const dot of hud.querySelectorAll('[data-rook-museum-dot]')) {
    dot.classList.toggle('visited', visited.includes(dot.dataset.rookMuseumDot));
  }
  if (app?.view) {
    app.view.dataset.rookMuseumStatus = rookMuseumState.status;
    app.view.dataset.rookMuseumVisited = String(visited.length);
    app.view.dataset.rookMuseumObjective = rookMuseumObjective(rookMuseumState);
    app.view.dataset.rookMuseumProductionTsid = ROOK_MUSEUM_PRODUCTION_TSID;
  }
}

function isRookMuseumExhibitOpen() {
  const panel = document.getElementById('rook-museum-exhibit');
  return Boolean(panel && !panel.hidden);
}

function clearRookMuseumArtTimer() {
  if (rookMuseumArtTimer) clearTimeout(rookMuseumArtTimer);
  rookMuseumArtTimer = null;
}

function renderRookMuseumExhibitPage() {
  const exhibit = rookMuseumActiveExhibit;
  if (!exhibit) return;
  const panel = document.getElementById('rook-museum-exhibit');
  const visual = panel?.querySelector('[data-rook-museum-visual]');
  const art = panel?.querySelector('[data-rook-museum-art]');
  const glow = panel?.querySelector('[data-rook-museum-orb-glow]');
  const title = panel?.querySelector('[data-rook-museum-title]');
  const kicker = panel?.querySelector('[data-rook-museum-kicker]');
  const copy = panel?.querySelector('[data-rook-museum-page]');
  const count = panel?.querySelector('[data-rook-museum-page-count]');
  const next = document.getElementById('rook-museum-exhibit-next');
  if (!visual || !art) return;
  clearRookMuseumArtTimer();
  visual.className = `rook-museum-exhibit-visual is-${exhibit.kind}`;
  if (title) title.textContent = exhibit.title;
  if (kicker) kicker.textContent = `Exhibit ${exhibit.number} · recorded lesson`;
  if (copy) copy.textContent = exhibit.pages[rookMuseumPageIndex] || '';
  if (count) count.textContent = `${rookMuseumPageIndex + 1} / ${exhibit.pages.length}`;
  if (next) next.textContent = rookMuseumPageIndex >= exhibit.pages.length - 1 ? 'Finish exhibit' : 'Continue';
  if (exhibit.kind === 'painting') {
    const base = `${ROOK_MUSEUM_ASSET_ROOT}/paintings/painting-${exhibit.painting}`;
    art.src = `${base}a.jpg`;
    art.alt = exhibit.title;
    rookMuseumArtTimer = setTimeout(() => { art.src = `${base}b.jpg`; }, 280);
    setTimeout(() => { if (rookMuseumActiveExhibit === exhibit) art.src = `${base}c.jpg`; }, 560);
    if (glow) glow.hidden = true;
  } else if (exhibit.kind === 'orb') {
    art.src = `${ROOK_MUSEUM_ASSET_ROOT}/rook_hall_focusing_orb__x1_1_png_1354835872.png`;
    art.alt = 'Ancient Focusing Orb';
    visual.style.setProperty('--rook-orb-scale', String(0.68 + rookMuseumPageIndex * 0.07));
    visual.classList.toggle('is-broken', rookMuseumPageIndex === exhibit.pages.length - 1);
    if (glow) glow.hidden = false;
  } else {
    art.src = `${ROOK_MUSEUM_ASSET_ROOT}/rook_hall_shrine_holofilm__x1_stop_png_1354835839.png`;
    art.alt = 'Primitive shrine holofilm';
    if (glow) glow.hidden = true;
  }
  if (app?.view) {
    app.view.dataset.rookMuseumExhibit = exhibit.id;
    app.view.dataset.rookMuseumPage = String(rookMuseumPageIndex + 1);
  }
}

function openRookMuseumExhibit(exhibit) {
  if (!exhibit || !rookMuseumState) return false;
  const visit = visitRookMuseumExhibit(rookMuseumState, exhibit.id);
  if (!visit.ok) {
    toast('Speak with Greeterbot before starting the exhibits.');
    return false;
  }
  rookMuseumActiveExhibit = exhibit;
  rookMuseumPageIndex = 0;
  const panel = document.getElementById('rook-museum-exhibit');
  if (panel) panel.hidden = false;
  playSfx('alert', { volume: 0.35, rate: 0.86 });
  if (visit.firstVisit) {
    pushActivity(`You studied museum exhibit ${exhibit.number}: ${exhibit.shortTitle}.`);
    if (visit.complete) toast('All six exhibits studied. Return to Greeterbot.', 4200);
  }
  renderRookMuseumExhibitPage();
  renderRookMuseumHud();
  updateHud();
  return true;
}

function closeRookMuseumExhibit() {
  clearRookMuseumArtTimer();
  const panel = document.getElementById('rook-museum-exhibit');
  if (panel) panel.hidden = true;
  rookMuseumActiveExhibit = null;
  rookMuseumPageIndex = 0;
  if (rookMuseumState) rookMuseumState.activeExhibitId = null;
  if (app?.view) {
    delete app.view.dataset.rookMuseumExhibit;
    delete app.view.dataset.rookMuseumPage;
  }
}

function advanceRookMuseumExhibit() {
  if (!rookMuseumActiveExhibit) return;
  if (rookMuseumPageIndex < rookMuseumActiveExhibit.pages.length - 1) {
    rookMuseumPageIndex += 1;
    renderRookMuseumExhibitPage();
  } else {
    closeRookMuseumExhibit();
  }
}

function beginRookMuseumOrientation() {
  if (!rookMuseumState || rookMuseumState.status !== 'arrival') return;
  const beginTourDialogue = () =>
    openScriptedQuestDialogue({
      title: 'Museum of the Rook',
      kicker: 'Greeterbot Sentry G-42',
      beats: ROOK_MUSEUM_TOUR_INTRO,
      onComplete: () => {
        beginRookMuseumTour(rookMuseumState);
        if (rookMuseumGreeter?.sprite) rookMuseumGreeter.sprite.x = 3150;
        pushActivity('Greeterbot asked you to study all six Rook exhibits.');
        renderRookMuseumHud();
        updateHud();
      },
    });
  if (questState.completed.includes(ROOK_HALL_START_QUEST_ID)) {
    beginTourDialogue();
    return;
  }
  openScriptedQuestDialogue({
    title: 'It’s Educational',
    kicker: 'Greeterbot Sentry G-42',
    beats: ROOK_MUSEUM_GREETING,
    onComplete: () => {
      if (questState.active?.[ROOK_HALL_START_QUEST_ID]) {
        completeQuest(questState, ROOK_HALL_START_QUEST_ID, pc);
      }
      if (!questState.active?.[ROOK_HALL_QUEST_ID]) {
        assignQuest(questState, ROOK_HALL_QUEST_ID, { ignorePrereq: true });
      }
      beginTourDialogue();
    },
  });
}

function finishRookMuseumQuest() {
  const result = completeRookMuseum(rookMuseumState);
  if (!result.ok) return false;
  const active = questState.active?.[ROOK_HALL_QUEST_ID];
  if (active) active.progress.learn_rook = 1;
  const completed = active ? completeQuest(questState, ROOK_HALL_QUEST_ID, pc) : null;
  playSfx('quest', { volume: 0.7 });
  pushActivity('You completed It’s Educational II. +400 iMG.');
  toast('Museum training complete · +400 iMG', 4200);
  if (app?.view) {
    app.view.dataset.rookMuseumReward = '400';
    app.view.dataset.rookMuseumQuestCompleted = completed?.ok ? '1' : '0';
  }
  if (completed?.ok) {
    announceQuestCompletions([{
      classTsid: ROOK_HALL_QUEST_ID,
      completed: true,
      rewards: completed.rewards,
      def: completed.def,
      onDismiss: () => returnFromRookMuseum(),
    }]);
  }
  savePlayerState();
  updateHud();
  if (!completed?.ok) setTimeout(() => returnFromRookMuseum(), 650);
  return true;
}

function handleRookMuseumTarget(target, verbId) {
  if (!rookMuseumState) return false;
  if (target?.classId === 'rook_hall_speaker' && String(verbId).split(':')[0] === 'push') {
    const exhibit = getRookMuseumExhibit(target.state?.exhibitId);
    if (target.sprite) {
      target.sprite.tint = 0xffd789;
      setTimeout(() => { if (target.sprite && !target.sprite.destroyed) target.sprite.tint = 0xffffff; }, 420);
    }
    return openRookMuseumExhibit(exhibit);
  }
  if (target?.classId !== 'npc_quest_widget') return false;
  if (rookMuseumState.status === 'arrival') {
    beginRookMuseumOrientation();
  } else if (rookMuseumState.status === 'ready') {
    openScriptedQuestDialogue({
      title: 'It’s Educational II',
      kicker: 'Greeterbot Sentry G-42',
      beats: ROOK_MUSEUM_COMPLETION,
      onComplete: finishRookMuseumQuest,
    });
  } else {
    const remaining = ROOK_MUSEUM_EXHIBIT_COUNT - rookMuseumState.visited.length;
    openScriptedQuestDialogue({
      title: 'Museum of the Rook',
      kicker: 'Greeterbot Sentry G-42',
      beats: [{
        text: `Study each exhibit and push its speaker button. ${remaining} remain${remaining === 1 ? 's' : ''}.`,
        response: 'Back to the exhibits.',
      }],
    });
  }
  return true;
}

function setupRookMuseumInstance() {
  clearWorldEntities();
  if (bgLayer && world) {
    world.removeChild(bgLayer);
    bgLayer.destroy({ children: true });
  }
  bgLayer = drawRookMuseumBackground();
  world.addChildAt(bgLayer, 0);
  currentStreet = {
    tsid: ROOK_MUSEUM_STREET_ID,
    productionTsid: ROOK_MUSEUM_PRODUCTION_TSID,
    label: 'Museum of the Rook',
    hubName: 'Jethimadh Tower',
    hubId: 'rook-museum',
    bounds: { l: 0, r: bgLayer.worldW, t: 0, b: bgLayer.worldH },
    platforms: bgLayer.platformsScreen,
    signposts: [],
  };
  currentStreetTsid = ROOK_MUSEUM_STREET_ID;
  WORLD_W = bgLayer.worldW;
  GROUND_Y = 500;
  streetPlatforms = bgLayer.platformsScreen;
  streetWalls = [];
  climb = { active: false, wall: null };
  Object.assign(jumpState, createJumpState(movementNow()));
  spawnRookMuseumExhibits();
  spawnRookMuseumGreeter();
  if (player) {
    player.position.set(115, GROUND_Y);
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    noteGrounded(jumpState, true, movementNow());
  }
  camTarget = cameraTargetForPlayer(player.x);
  camY = cameraTargetY(player.y, activeCameraWorldHeight(), LOCATION_VIEW_H);
  world.x = -camTarget;
  world.y = -camY;
  const name = document.getElementById('street-name');
  if (name) {
    name.textContent = 'Museum of the Rook · Jethimadh Tower';
    name.dataset.tsid = ROOK_MUSEUM_PRODUCTION_TSID;
  }
  renderRookMuseumHud();
}

async function startRookMuseum(opts = {}) {
  if (rookMuseumStartPromise) return rookMuseumStartPromise;
  if (rookMuseumIsInstanced()) return rookMuseumState;
  rookMuseumStartPromise = (async () => {
    if (!questState.completed.includes(ROOK_HALL_START_QUEST_ID) &&
        !questState.active?.[ROOK_HALL_START_QUEST_ID]) {
      assignQuest(questState, ROOK_HALL_START_QUEST_ID, { ignorePrereq: true });
    }
    rookMuseumSourceLocation = {
      tsid: currentStreetTsid,
      x: player?.x || 120,
      y: player?.y || GROUND_Y,
    };
    rookMuseumState = createRookMuseumState({
      sourceLocation: rookMuseumSourceLocation,
    });
    rookMuseumTransitionBusy = true;
    setupRookMuseumInstance();
    rookMuseumTransitionBusy = false;
    pushActivity('You entered the Museum of the Rook.');
    updateHud();
    setTimeout(beginRookMuseumOrientation, opts.autoGreeting === false ? 850 : 180);
    return rookMuseumState;
  })();
  try {
    return await rookMuseumStartPromise;
  } finally {
    rookMuseumStartPromise = null;
  }
}

async function returnFromRookMuseum({ abandon = false } = {}) {
  if (!rookMuseumState || rookMuseumTransitionBusy) return false;
  rookMuseumTransitionBusy = true;
  closeRookMuseumExhibit();
  closeQuestDialogue({ force: true });
  const source = rookMuseumSourceLocation || rookMuseumState.sourceLocation;
  if (abandon && rookMuseumState.status !== 'complete') {
    delete questState.active[ROOK_HALL_START_QUEST_ID];
    delete questState.active[ROOK_HALL_QUEST_ID];
    pushActivity('You left the museum before finishing the tour.');
  }
  rookMuseumState = null;
  rookMuseumSourceLocation = null;
  if (source?.tsid && source.tsid !== ROOK_MUSEUM_STREET_ID) {
    await enterStreet(source.tsid, { spawnX: source.x, spawnY: source.y, quiet: true });
  } else {
    await enterStreet(STREET_INDEX.default, { quiet: true });
  }
  rookMuseumTransitionBusy = false;
  savePlayerState();
  updateHud();
  return true;
}

function confirmLeaveRookMuseum() {
  if (!rookMuseumState) return;
  if (rookMuseumState.status === 'complete' ||
      window.confirm('Leave the museum? The unfinished tour will be abandoned.')) {
    returnFromRookMuseum({ abandon: rookMuseumState.status !== 'complete' });
  }
}

function updateRookMuseum() {
  if (!rookMuseumIsInstanced() || rookMuseumTransitionBusy) return;
  const autoplay = new URLSearchParams(location.search).get('rookmuseumautoplay') === '1';
  const now = Date.now();
  if (autoplay && now >= rookMuseumAutoNextAt) {
    rookMuseumAutoNextAt = now + 90;
    if (isQuestDialogueOpen()) {
      advanceQuestDialogue();
    } else if (isRookMuseumExhibitOpen()) {
      advanceRookMuseumExhibit();
    } else if (rookMuseumState.status === 'arrival') {
      beginRookMuseumOrientation();
    } else if (rookMuseumState.status === 'touring') {
      const next = ROOK_MUSEUM_EXHIBITS.find(
        (exhibit) => !rookMuseumState.visited.includes(exhibit.id)
      );
      const target = rookMuseumTargets.find((entry) => entry.state?.exhibitId === next?.id);
      if (target?.sprite) player.position.set(target.sprite.x - 60, GROUND_Y);
      if (next) openRookMuseumExhibit(next);
    } else if (rookMuseumState.status === 'ready') {
      player.position.set(rookMuseumGreeter?.sprite?.x - 70 || 3060, GROUND_Y);
      handleRookMuseumTarget(rookMuseumGreeter, 'talk_to');
    }
  }
  renderRookMuseumHud();
}

const EESTI_ASSET_ROOT = 'assets/sprites/quests/de-embiggenify';
const EESTI_DECO_ROOT = 'assets/decos/groddle';

function deEmbiggenifyIsInstanced() {
  return Boolean(deEmbiggenifyState && currentStreetTsid === EESTI_STREET_ID);
}

function addEestiDeco(root, file, x, y, width, height, zIndex = 0, anchorX = 0.5) {
  const sprite = new PIXI.Sprite(PIXI.Texture.from(`${EESTI_DECO_ROOT}/${file}`));
  sprite.anchor.set(anchorX, 1);
  sprite.position.set(x, y);
  sprite.width = width;
  sprite.height = height;
  sprite.zIndex = zIndex;
  sprite.eventMode = 'none';
  root.addChild(sprite);
  return sprite;
}

function drawEestiCatalogueRoom() {
  const root = new PIXI.Container();
  root.sortableChildren = true;
  root.worldW = 2800;
  root.worldH = 910;
  root.sourceWorldH = 910;

  const base = new PIXI.Graphics();
  base.zIndex = -1000;
  base.beginFill(0xe6d3a4);
  base.drawRect(0, 0, root.worldW, 800);
  base.beginFill(0x9b642c);
  base.drawRect(0, 800, root.worldW, 110);
  base.endFill();
  root.addChild(base);

  for (let x = 0; x < root.worldW; x += 600) {
    addEestiDeco(root, 'k04_wallpaper_01_tan.png', x, 800, 600, 800, -900, 0);
  }
  const molding = addEestiDeco(
    root,
    'k04_molding_02_white.png',
    0,
    800,
    root.worldW,
    55,
    -700,
    0
  );
  molding.tint = 0xfff9e8;
  for (let x = 0; x < root.worldW; x += 505) {
    addEestiDeco(root, 'k04_floor_01_wood.png', x, 910, 505, 110, -650, 0);
  }

  // The recording pans left-to-right through this exact K04 landmark order:
  // white sofa and sleepy cat, lamp/end table, ornate chair, long curled table,
  // then the cake hiding the quest object. These are clean recovered assets,
  // not pixels enlarged from the supplied video.
  addEestiDeco(root, 'k04_plant_02_bamboo.png', 125, 800, 215, 602, -35);
  addEestiDeco(root, 'k04_plant_03.png', 720, 800, 215, 534, -32);
  addEestiDeco(root, 'k04_rug_03_red.png', 465, 870, 930, 119, -30);
  addEestiDeco(root, 'k04_sofa_01.png', 445, 800, 720, 451, -12);
  addEestiDeco(root, 'k04_sleepycat_01.png', 410, 800, 390, 157, 18);
  addEestiDeco(root, 'k04_endtable_01.png', 855, 800, 185, 178, -4);
  addEestiDeco(root, 'k04_lamp_04.png', 855, 636, 124, 219, 2);
  addEestiDeco(root, 'k04_plant_07.png', 1035, 800, 175, 351, -28);
  addEestiDeco(root, 'k04_chair_02.png', 1060, 800, 280, 461, 22);

  for (const [x, file] of [
    [1450, 'k04_pictureframe_01_kitty.png'],
    [1760, 'k04_pictureframe_02_kitty.png'],
    [2070, 'k04_pictureframe_03_kitty.png'],
  ]) {
    addEestiDeco(root, file, x, 205, 235, 233, -26);
  }

  const curvedTable = addEestiDeco(
    root,
    'k04_table_03.png',
    1960,
    800,
    1580,
    527,
    28
  );
  curvedTable.eventMode = 'none';
  addEestiDeco(root, 'k04_dessert_01.png', 1450, 294, 112, 71, 48);
  addEestiDeco(root, 'k04_coffee_01.png', 1590, 294, 69, 71, 49);
  addEestiDeco(root, 'k04_candle_01.png', 1790, 294, 42, 96, 50);
  addEestiDeco(root, 'k04_candle_01.png', 1930, 294, 35, 80, 50);
  addEestiDeco(root, 'k04_candlestick_01.png', 2190, 294, 96, 131, 50);
  addEestiDeco(root, 'k04_wineglass_01.png', 2405, 294, 45, 104, 50);

  root.platformsScreen = [
    { id: 'eesti-floor', x1: 0, y1: 800, x2: root.worldW, y2: 800, pc_perm: 1 },
    { id: 'eesti-sofa', x1: 175, y1: 585, x2: 750, y2: 585, pc_perm: 1 },
    { id: 'eesti-chair-seat', x1: 955, y1: 580, x2: 1135, y2: 580, pc_perm: 1 },
    { id: 'eesti-table-curl-low', x1: 1160, y1: 575, x2: 1305, y2: 575, pc_perm: 1 },
    { id: 'eesti-table-curl-mid', x1: 1240, y1: 450, x2: 1390, y2: 450, pc_perm: 1 },
    { id: 'eesti-table-curl-high', x1: 1325, y1: 340, x2: 1475, y2: 340, pc_perm: 1 },
    { id: 'eesti-tabletop', x1: 1170, y1: 290, x2: 2740, y2: 290, pc_perm: 1 },
  ];
  root.signViews = [];
  return root;
}

function spawnMrHairball() {
  const idleFrames = textures.dustBunnyIdle?.frames;
  const talkFrames = textures.dustBunnyTalk?.frames;
  const fallback = PIXI.Texture.from(
    `${EESTI_ASSET_ROOT}/npc_dustbunny__x1_idle_stand_png_1354831147.png`
  );
  const sprite = new PIXI.AnimatedSprite(idleFrames?.length ? idleFrames : [fallback]);
  sprite.texturesIdle = idleFrames?.length ? idleFrames : [fallback];
  sprite.texturesTalk = talkFrames?.length ? talkFrames : sprite.texturesIdle;
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(0.82);
  sprite.position.set(1140, 800);
  sprite.zIndex = 62;
  sprite.animationSpeed = 0.16;
  sprite.loop = true;
  sprite.play();
  sprite._eestiAnimation = 'idle';
  entityLayer.addChild(sprite);
  mrHairballTarget = register({
    classId: 'npc_dustbunny',
    label: 'Mr. Hairball',
    subtitle: 'A remarkably present little Dust Bunny',
    sprite,
    state: { deEmbiggenifyState },
  });
  return mrHairballTarget;
}

function setMrHairballAnimation(mode = 'idle') {
  const sprite = mrHairballTarget?.sprite;
  if (!(sprite instanceof PIXI.AnimatedSprite)) return;
  sprite.textures = mode === 'talk' ? sprite.texturesTalk : sprite.texturesIdle;
  sprite.animationSpeed = mode === 'talk' ? 0.22 : 0.14;
  sprite._eestiAnimation = mode;
  sprite.gotoAndPlay(0);
}

function spawnSmallWorthless() {
  const sprite = new PIXI.Sprite(
    PIXI.Texture.from(
      `${EESTI_ASSET_ROOT}/small_worthless__x1_1_x1_2_png_1354829517.png`
    )
  );
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(1.25);
  sprite.position.set(2580, 288);
  // The cake sits in front, as in the source. A restrained glint makes the
  // target discoverable without turning the hidden-object beat into guesswork.
  sprite.zIndex = 49;
  sprite.visible = false;
  entityLayer.addChild(sprite);

  const glint = new PIXI.Graphics();
  glint.lineStyle(2, 0xfff5af, 0.88);
  glint.moveTo(-8, 0);
  glint.lineTo(8, 0);
  glint.moveTo(0, -8);
  glint.lineTo(0, 8);
  glint.zIndex = 53;
  glint.position.set(2580, 258);
  glint.visible = false;
  entityLayer.addChild(glint);

  smallWorthlessTarget = register({
    classId: SMALL_WORTHLESS_ID,
    label: 'Small shiny object with no intrinsic value',
    subtitle: 'A tiny glint behind the cake',
    sprite,
    state: { deEmbiggenifyState, glint },
  });
  const cake = new PIXI.Sprite(PIXI.Texture.from(`${EESTI_DECO_ROOT}/k04_cake_01.png`));
  cake.anchor.set(0.5, 1);
  cake.position.set(2610, 292);
  cake.width = 112;
  cake.height = 98;
  cake.zIndex = 52;
  cake.eventMode = 'none';
  entityLayer.addChild(cake);
  return smallWorthlessTarget;
}

function renderDeEmbiggenifyHud(now = Date.now()) {
  const hud = document.getElementById('de-embiggenify-hud');
  const visible = deEmbiggenifyIsInstanced();
  if (hud) hud.hidden = !visible;
  if (!visible) return;
  const remaining = eestiRemainingMs(deEmbiggenifyState, now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const timer = hud.querySelector('[data-eesti-timer]');
  const objective = hud.querySelector('[data-eesti-objective]');
  const stage = hud.querySelector('[data-eesti-stage]');
  if (timer) {
    timer.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
    timer.classList.toggle('is-low', remaining > 0 && remaining <= 30000);
  }
  if (objective) objective.textContent = deEmbiggenifyObjective(deEmbiggenifyState);
  if (stage) {
    stage.textContent =
      deEmbiggenifyState.status === 'arrival'
        ? 'Find Mr. Hairball'
        : deEmbiggenifyState.status === 'searching'
          ? 'Search behind the cake'
          : deEmbiggenifyState.status === 'found'
            ? 'Return to Mr. Hairball'
            : 'Quest complete';
  }
  const order = ['arrival', 'searching', 'found', 'complete'];
  const step = order.indexOf(deEmbiggenifyState.status);
  for (const [selector, index] of [
    ['[data-eesti-hairball]', 0],
    ['[data-eesti-object]', 1],
    ['[data-eesti-return]', 2],
  ]) {
    const el = hud.querySelector(selector);
    el?.classList.toggle('done', step > index);
    el?.classList.toggle('active', step === index);
  }
  if (smallWorthlessTarget?.sprite) {
    const available = deEmbiggenifyState.status === 'searching';
    smallWorthlessTarget.sprite.visible = available;
    if (smallWorthlessTarget.state?.glint) {
      smallWorthlessTarget.state.glint.visible = available;
      smallWorthlessTarget.state.glint.rotation = now * 0.0013;
      smallWorthlessTarget.state.glint.alpha = 0.52 + Math.sin(now * 0.006) * 0.3;
    }
  }
  if (app?.view) {
    app.view.dataset.deEmbiggenifyStatus = deEmbiggenifyState.status;
    app.view.dataset.deEmbiggenifyObjective = deEmbiggenifyObjective(deEmbiggenifyState);
    app.view.dataset.deEmbiggenifyRemaining = String(remaining);
    app.view.dataset.deEmbiggenifyProductionTsid = EESTI_PRODUCTION_TSID;
    app.view.dataset.deEmbiggenifyPlayerScale = String(player?.baseScale || 0);
    app.view.dataset.deEmbiggenifyArt = 'recovered-eesti-page-17';
    app.view.dataset.deEmbiggenifyLandmarks = EESTI_ROOM_ROUTE.join('>');
    app.view.dataset.deEmbiggenifyTableArt = 'k04_table_03';
    app.view.dataset.deEmbiggenifyMusic = EESTI_MUSIC_FILE.split('/').pop();
    app.view.dataset.deEmbiggenifySourceSpawn =
      `${EESTI_SOURCE_SPAWN.x},${EESTI_SOURCE_SPAWN.y}`;
  }
}

function openMrHairballRequest() {
  setMrHairballAnimation('talk');
  openScriptedQuestDialogue({
    title: 'De-Embiggenify II',
    kicker: 'Mr. Hairball',
    beats: MR_HAIRBALL_REQUEST,
    onComplete: () => {
      setMrHairballAnimation('idle');
      beginDeEmbiggenifySearch(deEmbiggenifyState, Date.now());
      pushActivity('Mr. Hairball asked you to find a small shiny object behind the cake.');
      toast('Two minutes. Look behind the cake!', 3600);
      renderDeEmbiggenifyHud();
      updateHud();
    },
  });
  return true;
}

function startMrHairballSearch() {
  if (!deEmbiggenifyState || deEmbiggenifyState.status !== 'arrival') return false;
  setMrHairballAnimation('talk');
  openScriptedQuestDialogue({
    title: 'De-Embiggenify',
    kicker: 'Mr. Hairball',
    beats: MR_HAIRBALL_GREETING,
    onComplete: () => {
      if (questState.active?.[DE_EMBIGGENIFY_QUEST_ID]) {
        completeQuest(questState, DE_EMBIGGENIFY_QUEST_ID, pc);
      }
      if (!questState.active?.[DE_EMBIGGENIFY_PART2_QUEST_ID]) {
        assignQuest(questState, DE_EMBIGGENIFY_PART2_QUEST_ID, { ignorePrereq: true });
      }
      openMrHairballRequest();
    },
  });
  return true;
}

function pickUpSmallWorthless() {
  const result = findSmallWorthless(deEmbiggenifyState, Date.now());
  if (!result.ok) return false;
  addItem(inv, SMALL_WORTHLESS_ID, 1);
  if (smallWorthlessTarget?.sprite) smallWorthlessTarget.sprite.visible = false;
  if (smallWorthlessTarget?.state?.glint) smallWorthlessTarget.state.glint.visible = false;
  playSfx('pickup', { volume: 0.55, rate: 1.25 });
  const pickupX = smallWorthlessTarget?.sprite?.x || 2580;
  const pickupY = smallWorthlessTarget?.sprite?.y || 288;
  burst(pickupX, pickupY - 23, 0xffef9a, 18);
  floatText(pickupX, pickupY - 56, 'SMALL! SHINY! WORTHLESS!', 0xffe899);
  pushActivity('You found the small shiny object with no intrinsic value.');
  renderDeEmbiggenifyHud();
  updateHud();
  return true;
}

function finishDeEmbiggenifyQuest() {
  const result = completeDeEmbiggenify(deEmbiggenifyState);
  if (!result.ok) return false;
  removeItem(inv, SMALL_WORTHLESS_ID, 1);
  const active = questState.active?.[DE_EMBIGGENIFY_PART2_QUEST_ID];
  if (active) active.progress.r96 = 1;
  const completed = active
    ? completeQuest(questState, DE_EMBIGGENIFY_PART2_QUEST_ID, pc)
    : null;
  if (completed?.ok) addItem(inv, EMOTIONAL_BEAR_ID, 1);
  playSfx('quest', { volume: 0.72 });
  pushActivity('You completed De-Embiggenify II. +200 iMG, +200 currants, +50 mood, +1 Emotional Bear.');
  toast('Emotional Bear received · +200 iMG · +200 currants', 4600);
  if (app?.view) {
    app.view.dataset.deEmbiggenifyReward = '200-img,200-currants,50-mood,1-emotional-bear';
    app.view.dataset.deEmbiggenifyQuestCompleted = completed?.ok ? '1' : '0';
  }
  if (completed?.ok) {
    announceQuestCompletions([{
      classTsid: DE_EMBIGGENIFY_PART2_QUEST_ID,
      completed: true,
      rewards: completed.rewards,
      def: completed.def,
      onDismiss: () => returnFromDeEmbiggenify(),
    }]);
  }
  savePlayerState();
  updateHud();
  if (!completed?.ok) setTimeout(() => returnFromDeEmbiggenify(), 700);
  return true;
}

function handleDeEmbiggenifyTarget(target, verbId) {
  if (!deEmbiggenifyIsInstanced() || !target) return false;
  const verb = String(verbId || '').split(':')[0];
  if (target.classId === SMALL_WORTHLESS_ID && verb === 'pickup') {
    return pickUpSmallWorthless();
  }
  if (target.classId !== 'npc_dustbunny' || verb !== 'talk_to') return false;
  if (deEmbiggenifyState.status === 'arrival') return startMrHairballSearch();
  if (deEmbiggenifyState.status === 'found') {
    setMrHairballAnimation('talk');
    openScriptedQuestDialogue({
      title: 'De-Embiggenify II',
      kicker: 'Mr. Hairball',
      beats: MR_HAIRBALL_COMPLETION,
      onComplete: () => {
        setMrHairballAnimation('idle');
        finishDeEmbiggenifyQuest();
      },
    });
    return true;
  }
  if (deEmbiggenifyState.status === 'searching') {
    setMrHairballAnimation('talk');
    openScriptedQuestDialogue({
      title: 'De-Embiggenify II',
      kicker: 'Mr. Hairball',
      beats: [{
        text: "Still looking? It's behind the cake. I'd get it myself, but: appendages.",
        response: 'Back to the cake.',
      }],
      onComplete: () => setMrHairballAnimation('idle'),
    });
    return true;
  }
  return false;
}

function setupDeEmbiggenifyInstance() {
  clearWorldEntities();
  if (bgLayer && world) {
    world.removeChild(bgLayer);
    bgLayer.destroy({ children: true });
  }
  bgLayer = drawEestiCatalogueRoom();
  world.addChildAt(bgLayer, 0);
  currentStreet = {
    tsid: EESTI_STREET_ID,
    productionTsid: EESTI_PRODUCTION_TSID,
    label: 'Eesti Life Catalogue Page 17',
    hubName: 'A very big little room',
    hubId: '49',
    bounds: { l: 0, r: bgLayer.worldW, t: 0, b: bgLayer.worldH },
    platforms: bgLayer.platformsScreen,
    signposts: [],
  };
  currentStreetTsid = EESTI_STREET_ID;
  WORLD_W = bgLayer.worldW;
  GROUND_Y = 800;
  streetPlatforms = bgLayer.platformsScreen;
  streetWalls = [];
  climb = { active: false, wall: null };
  Object.assign(jumpState, createJumpState(movementNow()));
  spawnMrHairball();
  spawnSmallWorthless();
  if (player) {
    player.baseScale = (deEmbiggenifyPlayerBaseScale || player.baseScale) * EESTI_PLAYER_SCALE;
    player.position.set(220, GROUND_Y);
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    applyPlayerFacing();
    noteGrounded(jumpState, true, movementNow());
  }
  camTarget = cameraTargetForPlayer(player.x);
  camY = cameraTargetY(player.y, activeCameraWorldHeight(), LOCATION_VIEW_H);
  world.x = -Math.round(camTarget);
  world.y = -Math.round(camY);
  const name = document.getElementById('street-name');
  if (name) {
    name.textContent = 'Eesti Life Catalogue Page 17 · A very big little room';
    name.dataset.tsid = EESTI_PRODUCTION_TSID;
  }
  if (state.started && audio.ctx) {
    setAmbientForStreet(currentStreet, { force: true });
  }
  renderDeEmbiggenifyHud();
}

async function startDeEmbiggenify(opts = {}) {
  if (deEmbiggenifyStartPromise) return deEmbiggenifyStartPromise;
  if (deEmbiggenifyIsInstanced()) return deEmbiggenifyState;
  deEmbiggenifyStartPromise = (async () => {
    const resumingPart2 = Boolean(questState.active?.[DE_EMBIGGENIFY_PART2_QUEST_ID]);
    if (!questState.active?.[DE_EMBIGGENIFY_QUEST_ID] && !resumingPart2) {
      const assigned = assignQuest(questState, DE_EMBIGGENIFY_QUEST_ID, {
        ignorePrereq: true,
      });
      if (!assigned.ok) return null;
    }
    deEmbiggenifySourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x ?? WORLD_W * 0.5,
      y: player?.y ?? GROUND_Y,
    };
    deEmbiggenifyPlayerBaseScale = player?.baseScale ?? null;
    if (app?.view) {
      app.view.dataset.deEmbiggenifySourceScale = String(
        deEmbiggenifyPlayerBaseScale || 0
      );
    }
    deEmbiggenifyState = createDeEmbiggenifyState({
      sourceLocation: deEmbiggenifySourceLocation,
    });
    if (resumingPart2) beginDeEmbiggenifySearch(deEmbiggenifyState, Date.now());
    deEmbiggenifyTransitionBusy = true;
    setupDeEmbiggenifyInstance();
    deEmbiggenifyTransitionBusy = false;
    pushActivity('You shrink down inside Eesti Life Catalogue Page 17.');
    toast('Everything is enormous. Find Mr. Hairball.', 3400);
    updateHud();
    return deEmbiggenifyState;
  })();
  try {
    return await deEmbiggenifyStartPromise;
  } finally {
    deEmbiggenifyStartPromise = null;
  }
}

async function returnFromDeEmbiggenify({ abandon = false, expired = false } = {}) {
  if (!deEmbiggenifyState || deEmbiggenifyTransitionBusy) return false;
  deEmbiggenifyTransitionBusy = true;
  const source = deEmbiggenifySourceLocation || deEmbiggenifyState.sourceLocation;
  const status = expired ? 'expired' : abandon ? 'abandoned' : deEmbiggenifyState.status;
  if ((abandon || expired) && deEmbiggenifyState.status !== 'complete') {
    delete questState.active[DE_EMBIGGENIFY_QUEST_ID];
    delete questState.active[DE_EMBIGGENIFY_PART2_QUEST_ID];
    removeItem(inv, SMALL_WORTHLESS_ID, countItem(inv, SMALL_WORTHLESS_ID));
    pushActivity(
      expired
        ? 'The catalogue page closed before you could finish.'
        : 'You left the miniature room before helping Mr. Hairball.'
    );
  }
  closeQuestDialogue({ force: true });
  if (deEmbiggenifyPlayerBaseScale && player) {
    player.baseScale = deEmbiggenifyPlayerBaseScale;
    applyPlayerFacing();
    if (app?.view) {
      app.view.dataset.deEmbiggenifyRestoredScale = String(player.baseScale);
    }
  }
  deEmbiggenifyState = null;
  deEmbiggenifySourceLocation = null;
  deEmbiggenifyPlayerBaseScale = null;
  mrHairballTarget = null;
  smallWorthlessTarget = null;
  const hud = document.getElementById('de-embiggenify-hud');
  if (hud) hud.hidden = true;
  try {
    if (source?.tsid && source.tsid !== EESTI_STREET_ID) {
      await enterStreetWithTransition(source.tsid, {
        spawnX: source.x,
        spawnY: source.y,
        quiet: true,
      });
    } else {
      await enterStreet(STREET_INDEX.default, { quiet: true });
    }
    if (app?.view) app.view.dataset.deEmbiggenifyStatus = status;
    savePlayerState();
    updateHud();
    return true;
  } finally {
    deEmbiggenifyTransitionBusy = false;
  }
}

function confirmLeaveDeEmbiggenify() {
  if (!deEmbiggenifyIsInstanced()) return;
  openScriptedQuestDialogue({
    title: 'De-Embiggenify',
    kicker: 'Leave the catalogue page?',
    cancelable: true,
    beats: [{
      text: 'Leaving now will abandon this tiny attempt. You can accept the quest again later.',
      response: 'Return to normal size',
    }],
    onComplete: () => returnFromDeEmbiggenify({ abandon: true }),
  });
}

function updateDeEmbiggenify() {
  if (!deEmbiggenifyIsInstanced() || deEmbiggenifyTransitionBusy) return;
  const now = Date.now();
  if (
    !['complete', 'expired'].includes(deEmbiggenifyState.status) &&
    eestiRemainingMs(deEmbiggenifyState, now) <= 0
  ) {
    expireDeEmbiggenify(deEmbiggenifyState, now);
    renderDeEmbiggenifyHud(now);
    toast('The catalogue page closes. You return to normal size.', 4200);
    setTimeout(() => returnFromDeEmbiggenify({ expired: true }), 450);
    return;
  }
  if (
    deEmbiggenifyState.status === 'searching' &&
    smallWorthlessTarget?.sprite?.visible &&
    player &&
    Math.abs(player.x - smallWorthlessTarget.sprite.x) <= 46 &&
    Math.abs(player.y - smallWorthlessTarget.sprite.y) <= 58
  ) {
    // The source location's collision box creates the item as soon as the
    // tiny player reaches the hiding spot; the explicit Pickup verb remains
    // available as an accessible fallback.
    pickUpSmallWorthless();
  }
  const autoplayMode = new URLSearchParams(location.search).get('eestiautoplay') || '';
  const autoplay = ['1', 'hairball', 'search', 'found'].includes(autoplayMode);
  if (autoplay && now >= deEmbiggenifyAutoNextAt) {
    deEmbiggenifyAutoNextAt = now + 90;
    if (isQuestDialogueOpen()) {
      if (autoplayMode !== 'hairball') advanceQuestDialogue();
    } else if (deEmbiggenifyState.status === 'arrival') {
      player.position.set(mrHairballTarget?.sprite?.x - 55 || 795, GROUND_Y);
      handleDeEmbiggenifyTarget(mrHairballTarget, 'talk_to');
    } else if (deEmbiggenifyState.status === 'searching') {
      if (autoplayMode === 'search') {
        player.position.set(2495, 290);
        player.vx = 0;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.position.set(2550, 290);
      }
    } else if (deEmbiggenifyState.status === 'found') {
      if (autoplayMode !== 'found') {
        player.position.set(mrHairballTarget?.sprite?.x - 55 || 795, GROUND_Y);
        handleDeEmbiggenifyTarget(mrHairballTarget, 'talk_to');
      }
    }
  }
  renderDeEmbiggenifyHud(now);
}

function paradiseIsInstanced() {
  return Boolean(
    paradiseRun &&
      currentStreetTsid === `PARADISE_${String(paradiseRun.courseId).toUpperCase()}`
  );
}

function paradiseCourse() {
  return paradiseRun ? PARADISE_COURSES[paradiseRun.courseId] || null : null;
}

function paradiseRewardColor(rewardDef) {
  return rewardDef?.type === 'xp'
    ? 0xc58cff
    : rewardDef?.type === 'currants'
      ? 0xe0b65b
      : rewardDef?.type === 'favor'
        ? 0xe986ad
        : rewardDef?.type === 'energy'
          ? 0xbde663
          : 0x8fd160;
}

function applyParadiseReward(rewardDef) {
  if (!rewardDef) return { actual: 0, copy: '' };
  const amount = Math.max(0, Math.floor(Number(rewardDef.amount) || 0));
  let actual = amount;
  if (rewardDef.type === 'xp') {
    pc.imagination = Math.max(0, pc.imagination || 0) + amount;
    pc.xp = Math.max(0, pc.xp || 0) + amount;
  } else if (rewardDef.type === 'currants') {
    pc.currants = Math.max(0, pc.currants || 0) + amount;
  } else if (rewardDef.type === 'energy' || rewardDef.type === 'mood') {
    const before = clamp(Number(pc[rewardDef.type]) || 0, 0, 100);
    pc[rewardDef.type] = clamp(before + amount, 0, 100);
    actual = pc[rewardDef.type] - before;
  } else if (rewardDef.type === 'favor') {
    const giantId = rewardDef.giantId || 'friendly';
    shrineState.favor[giantId] = Math.max(0, shrineState.favor[giantId] || 0) + amount;
  }
  const copy =
    rewardDef.type === 'xp'
      ? `+${amount.toLocaleString()} iMG`
      : rewardDef.type === 'currants'
        ? `+${amount.toLocaleString()} currants`
        : rewardDef.type === 'favor'
          ? `+${amount.toLocaleString()} ${rewardDef.giantId || 'Friendly'} favor`
          : actual > 0
            ? `+${actual.toLocaleString()} ${rewardDef.type}`
            : `${rewardDef.type[0].toUpperCase()}${rewardDef.type.slice(1)} already full`;
  return { actual, copy };
}

function vectorStar(radius = 16, color = 0xffe96a, alpha = 1) {
  const star = new PIXI.Graphics();
  const points = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const r = index % 2 === 0 ? radius : radius * 0.43;
    points.push(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  star.beginFill(color, alpha);
  star.lineStyle(Math.max(1, radius * 0.08), 0xfff8c5, alpha * 0.9);
  star.drawPolygon(points);
  star.endFill();
  return star;
}

function addParadiseCloud(root, x, y, width, height, alpha = 0.9, tint = 0xffffff) {
  const kind = width > 520 ? 'cloud_fluffy_2' : 'cloud_fluffy_1';
  const cloud = new PIXI.Sprite(PIXI.Texture.from(`assets/decos/groddle/${kind}.png`));
  cloud.anchor.set(0.5, 1);
  cloud.position.set(x, y);
  cloud.width = width;
  cloud.height = height;
  cloud.alpha = alpha;
  cloud.tint = tint;
  cloud.zIndex = -20;
  root.addChild(cloud);
  return cloud;
}

function paintParadiseSky(root, course) {
  const palettes = {
    cloud_rings: [0x789ed0, 0xe3a1a5, 0xf2d3aa, 0x889aba],
    radial_heights: [0x071e31, 0x0d3a50, 0x286276, 0x567d89],
    starlit_night: [0x170d3e, 0x382264, 0x65447d, 0x79678d],
    slip_n_slide: [0x102f42, 0x17485b, 0x2a6170, 0x477b82],
  };
  const colors = palettes[course.id];
  const sky = new PIXI.Graphics();
  const bands = 28;
  for (let index = 0; index < bands; index += 1) {
    const progress = index / Math.max(1, bands - 1);
    const section = Math.min(2, Math.floor(progress * 3));
    const local = progress * 3 - section;
    const from = colors[section];
    const to = colors[section + 1];
    const mix = (a, b) => Math.round(a + (b - a) * local);
    const color =
      (mix((from >> 16) & 0xff, (to >> 16) & 0xff) << 16) |
      (mix((from >> 8) & 0xff, (to >> 8) & 0xff) << 8) |
      mix(from & 0xff, to & 0xff);
    sky.beginFill(color);
    sky.drawRect(0, (course.height / bands) * index, course.width, course.height / bands + 2);
  }
  sky.endFill();
  sky.zIndex = -100;
  root.addChild(sky);

  const stars = new PIXI.Graphics();
  for (let index = 0; index < (course.id === 'cloud_rings' ? 45 : course.id === 'slip_n_slide' ? 95 : 180); index += 1) {
    const x = (index * 193 + 71) % course.width;
    const y = (index * 83 + 29) % Math.max(200, course.height * 0.84);
    const size = 0.8 + ((index * 17) % 22) / 10;
    stars.beginFill(
      course.id === 'cloud_rings' ? 0xfff4dc : 0xe7f7ff,
      course.id === 'cloud_rings' ? 0.18 : course.id === 'slip_n_slide' ? 0.34 : 0.28 + (index % 5) * 0.08
    );
    stars.drawCircle(x, y, size);
  }
  stars.endFill();
  stars.zIndex = -90;
  root.addChild(stars);
  return sky;
}

function buildCloudRingsBackground(root, course) {
  const mountains = new PIXI.Graphics();
  mountains.beginFill(0x5f6f8c, 0.58);
  mountains.drawPolygon([0, 810, 0, 470, 115, 405, 210, 470, 300, 610, 365, 810]);
  mountains.drawPolygon([3215, 810, 3300, 600, 3385, 465, 3490, 385, 3600, 450, 3600, 810]);
  mountains.beginFill(0x3f526f, 0.76);
  mountains.drawPolygon([0, 850, 0, 600, 90, 530, 185, 620, 250, 850]);
  mountains.drawPolygon([3370, 850, 3435, 620, 3525, 520, 3600, 580, 3600, 850]);
  mountains.endFill();
  mountains.zIndex = -60;
  root.addChild(mountains);

  for (let index = 0; index < 12; index += 1) {
    addParadiseCloud(
      root,
      index * 330 + 90,
      910 - (index % 3) * 32,
      500 + (index % 4) * 90,
      135 + (index % 3) * 24,
      0.78,
      index % 2 ? 0xdce9f3 : 0xf4e6df
    );
  }
  for (let index = 0; index < 9; index += 1) {
    addParadiseCloud(
      root,
      280 + index * 410,
      300 + (index % 4) * 80,
      210 + (index % 3) * 60,
      62 + (index % 2) * 18,
      0.28,
      0xfff4ee
    );
  }
}

function buildRadialBackground(root, course) {
  for (let index = 0; index < 8; index += 1) {
    const side = index % 2 ? course.width - 150 : 150;
    addParadiseCloud(
      root,
      side + ((index * 71) % 210) - 105,
      420 + index * 205,
      620 + (index % 3) * 170,
      210 + (index % 3) * 55,
      0.2,
      0x74a5b2
    );
  }
  addParadiseCloud(root, 1000, 1950, 1550, 320, 0.52, 0xc3d9de);
  addParadiseCloud(root, 500, 1685, 410, 120, 0.88, 0xe9f1f0);
  addParadiseCloud(root, 1000, 1160, 440, 120, 0.72, 0xdbe7e8);

  const moonAsset = `assets/decos/groddle/${RADIAL_HEIGHTS_MOON.asset}?v=radial-322`;
  const moonTexture = PIXI.Assets.get(moonAsset) || PIXI.Texture.from(moonAsset);
  const moon = new PIXI.Sprite(moonTexture);
  moon.anchor.set(0.5);
  moon.position.set(RADIAL_HEIGHTS_MOON.x, RADIAL_HEIGHTS_MOON.y);
  moon.width = RADIAL_HEIGHTS_MOON.width;
  moon.height = RADIAL_HEIGHTS_MOON.height;
  moon.zIndex = -3;
  moon._sourceStreetTsid = course.sourceStreetTsid;
  root.addChild(moon);
  root.paradiseRadialMoon = moon;
}

function buildStarlitBackground(root, course, points) {
  const starFieldAsset = 'assets/decos/groddle/stars_2.png';
  const starFields = STARLIT_NIGHT_STAR_FIELDS.map((spec, index) => {
    const field = new PIXI.Sprite(PIXI.Assets.get(starFieldAsset) || PIXI.Texture.from(starFieldAsset));
    field.anchor.set(0.5);
    field.position.set(spec.x, spec.y);
    field.width = spec.width;
    field.height = spec.height;
    field.tint = spec.depth === 'sky' ? 0xbca9d7 : 0xd4c7e7;
    field.alpha = spec.depth === 'sky' ? 0.32 : 0.46;
    field.zIndex = spec.depth === 'sky' ? -82 : -72;
    field._sourceFieldIndex = index;
    root.addChild(field);
    return field;
  });

  const cloudFloor = new PIXI.Graphics();
  for (let index = 0; index < 15; index += 1) {
    cloudFloor.beginFill(index % 2 ? 0xb6a7cb : 0xd9d1e2, 0.82);
    cloudFloor.drawEllipse(index * 115 - 40, 865 - (index % 3) * 16, 135, 58);
  }
  cloudFloor.endFill();
  cloudFloor.zIndex = -30;
  root.addChild(cloudFloor);

  points.forEach((point, index) => {
    const starAsset = `assets/decos/groddle/star_asset_0${point.major ? '1' : '2'}.png`;
    const ghost = new PIXI.Sprite(
      PIXI.Assets.get(starAsset) || PIXI.Texture.from(starAsset)
    );
    ghost.anchor.set(0.5);
    ghost.position.set(point.x, point.y);
    ghost.width = (point.radius || 13) * 2.38;
    ghost.height = (point.radius || 13) * 2.38;
    ghost.alpha = 0;
    ghost.zIndex = -4;
    ghost.rotation = index % 2 ? 0.18 : -0.12;
    ghost._litStartedAt = 0;
    root.addChild(ghost);
    paradiseBackdropStars[index] = ghost;
  });

  const makeMoonState = (spec, version, zIndex) => {
    const src = `assets/decos/groddle/${spec.asset}?v=${version}`;
    const sprite = new PIXI.Sprite(PIXI.Assets.get(src) || PIXI.Texture.from(src));
    sprite.anchor.set(0.5);
    sprite.position.set(spec.x, spec.y);
    sprite.width = spec.width;
    sprite.height = spec.height;
    sprite.zIndex = zIndex;
    root.addChild(sprite);
    return sprite;
  };
  const smile = makeMoonState(STARLIT_NIGHT_MOON.smile, 'starlit-150', -8);
  const plain = makeMoonState(STARLIT_NIGHT_MOON.plain, 'starlit-149', -7);
  root.paradiseMoonSmile = smile;
  root.paradiseMoonPlain = plain;
  root.paradiseMoonFadeStartedAt = 0;
  root.paradiseStarlitStarFields = starFields;
}

function addSlipRecoveredDeco(root, spec) {
  const texture = PIXI.Texture.from(`assets/decos/groddle/${spec.sprite}.png`);
  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.position.set(
    spec.x,
    slipTerrainY(spec.x) + (Number(spec.groundOffset) || 0)
  );
  sprite.alpha = Number.isFinite(spec.alpha) ? spec.alpha : 1;
  sprite.zIndex = Number(spec.z) || -20;
  sprite._slipLandmarkId = spec.id || '';
  const applySize = () => {
    const sourceWidth = Math.max(1, texture.orig?.width || texture.width || 1);
    const sourceHeight = Math.max(1, texture.orig?.height || texture.height || 1);
    sprite.width = spec.width;
    sprite.height = spec.width * (sourceHeight / sourceWidth);
  };
  if (texture.baseTexture.valid) applySize();
  else texture.baseTexture.once('loaded', applySize);
  root.addChild(sprite);
  return sprite;
}

function buildSlipBackground(root, course) {
  const moon = new PIXI.Graphics();
  moon.beginFill(0xffef9a, 0.78);
  moon.drawCircle(0, 0, 72);
  moon.beginFill(0x17485b, 1);
  moon.drawCircle(28, -18, 70);
  moon.endFill();
  moon.position.set(2860, 175);
  moon.zIndex = -78;
  root.addChild(moon);

  const mountains = new PIXI.Graphics();
  mountains.beginFill(0x79949a, 0.48);
  mountains.drawPolygon([
    0, 690, 0, 520, 170, 405, 285, 555, 430, 350, 610, 540, 795, 365,
    1010, 565, 1200, 410, 1410, 575, 1640, 330, 1860, 555, 2090, 390,
    2290, 580, 2520, 350, 2760, 555, 3010, 390, 3250, 565, 3600, 430,
    3600, 690,
  ]);
  mountains.beginFill(0xc7d7d9, 0.82);
  mountains.drawPolygon([
    0, 700, 0, 570, 185, 440, 285, 555, 430, 383, 610, 550, 795, 405,
    1010, 575, 1200, 450, 1410, 585, 1640, 375, 1860, 565, 2090, 430,
    2290, 590, 2520, 395, 2760, 565, 3010, 430, 3250, 575, 3600, 470,
    3600, 700,
  ]);
  mountains.endFill();
  mountains.zIndex = -55;
  root.addChild(mountains);

  const snowTrees = [];
  for (let index = 0; index < 24; index += 1) {
    const x = 70 + ((index * 271) % (course.width - 140));
    const ground = slipTerrainY(x);
    const width = 34 + (index % 5) * 9;
    const tree = addSlipRecoveredDeco(root, {
      id: `snow-tree-${index + 1}`,
      sprite: SLIP_N_SLIDE_TREE_SPRITES[index % SLIP_N_SLIDE_TREE_SPRITES.length],
      x,
      width,
      z: -24,
      groundOffset: 4,
      alpha: 0.86 + (index % 3) * 0.06,
    });
    tree.y = ground + 4;
    snowTrees.push(tree);
  }

  const landmarks = SLIP_N_SLIDE_LANDMARKS.map((spec) =>
    addSlipRecoveredDeco(root, spec)
  );

  const terrain = new PIXI.Graphics();
  const terrainPoints = [0, course.height];
  for (let x = 0; x <= course.width; x += 16) {
    terrainPoints.push(x, slipTerrainY(x));
  }
  terrainPoints.push(course.width, course.height);
  terrain.beginFill(0xdce8e9);
  terrain.lineStyle(5, 0xf6fbfa, 1);
  terrain.drawPolygon(terrainPoints);
  terrain.endFill();
  terrain.zIndex = -10;
  root.addChild(terrain);

  const flakes = [];
  for (let index = 0; index < 90; index += 1) {
    const flake = new PIXI.Graphics();
    const radius = 0.8 + (index % 4) * 0.55;
    flake.beginFill(0xf8ffff, 0.32 + (index % 5) * 0.1);
    flake.drawCircle(0, 0, radius);
    flake.endFill();
    flake.position.set((index * 167 + 31) % course.width, (index * 79 + 23) % 650);
    flake._speed = 0.18 + (index % 7) * 0.055;
    flake._drift = ((index % 5) - 2) * 0.035;
    flake.zIndex = 4;
    root.addChild(flake);
    flakes.push(flake);
  }
  root.paradiseSnowflakes = flakes;
  root.paradiseSlipLandmarks = landmarks;
  root.paradiseSlipTrees = snowTrees;
}

async function loadParadiseSourcePoints(course) {
  if (!course?.sourceStreetTsid) return [];
  try {
    const response = await fetch(`assets/streets/${course.sourceStreetTsid}.json`);
    if (!response.ok) return [];
    const data = await response.json();
    const layer = (data.layers || []).find((entry) =>
      course.id === 'radial_heights'
        ? entry.name === 'yellow stars'
        : entry.name === 'middleground'
    );
    if (!layer) return [];
    return (layer.decos || [])
      .filter((deco) => /^star_asset_0[12]$/.test(String(deco.sprite || '')))
      .map((deco) => {
        const screenSpace = /^T_/.test(String(layer.id || ''));
        return {
          x: screenSpace ? deco.x : deco.x - data.bounds.l,
          y: screenSpace ? deco.y : deco.y - data.bounds.t,
          radius: Math.max(10, Math.min(28, Number(deco.w || 30) * 0.42)),
          major: String(deco.sprite) === 'star_asset_01',
        };
      });
  } catch {
    return [];
  }
}

async function loadParadiseVisualAssets(course) {
  if (course?.id === 'radial_heights') {
    const src = `assets/decos/groddle/${RADIAL_HEIGHTS_MOON.asset}?v=radial-322`;
    await PIXI.Assets.load({
      src,
      data: {
        resourceOptions: {
          width: RADIAL_HEIGHTS_MOON.width,
          height: RADIAL_HEIGHTS_MOON.height,
        },
      },
    }).catch(() => null);
    return;
  }
  if (course?.id === 'starlit_night') {
    const moonAssets = [
      [STARLIT_NIGHT_MOON.plain, 'starlit-149'],
      [STARLIT_NIGHT_MOON.smile, 'starlit-150'],
    ];
    await Promise.all([
      ...moonAssets.map(([spec, version]) =>
        PIXI.Assets.load({
          src: `assets/decos/groddle/${spec.asset}?v=${version}`,
          data: {
            resourceOptions: {
              width: spec.width,
              height: spec.height,
            },
          },
        }).catch(() => null)
      ),
      PIXI.Assets.load('assets/decos/groddle/stars_2.png').catch(() => null),
      PIXI.Assets.load('assets/decos/groddle/star_asset_01.png').catch(() => null),
      PIXI.Assets.load('assets/decos/groddle/star_asset_02.png').catch(() => null),
    ]);
    return;
  }
  if (course?.id !== 'slip_n_slide') return;
  const sprites = new Set([
    ...SLIP_N_SLIDE_LANDMARKS.map((entry) => entry.sprite),
    ...SLIP_N_SLIDE_TREE_SPRITES,
  ]);
  await Promise.all(
    [...sprites].map((sprite) =>
      PIXI.Assets.load(`assets/decos/groddle/${sprite}.png`).catch(() => null)
    )
  );
}

function cloudRingPickupPoints(course) {
  return Array.from({ length: course.pickupCount }, (_, index) => {
    const progress = (index + 1) / (course.pickupCount + 1);
    return {
      x: 260 + progress * (course.width - 520),
      y: 420 + Math.sin(progress * Math.PI * 5.2) * 185 + (index % 3) * 22,
      radius: 18,
    };
  });
}

function slipPickupPoints(course) {
  const heights = [58, 116, 62, 132, 58, 108, 62, 138, 58, 112, 60, 136, 58, 108, 62, 128, 58, 104];
  return heights.map((height, index) => {
    const x = 350 + index * ((course.width - 700) / (heights.length - 1));
    return {
      x,
      y: slipTerrainY(x) - height,
      radius: index % 3 === 1 ? 22 : 17,
      major: index % 3 === 1,
    };
  });
}

function fallbackParadisePoints(course) {
  const count = course.pickupCount;
  if (course.id === 'radial_heights') {
    return Array.from({ length: count }, (_, index) => {
      const progress = index / Math.max(1, count - 1);
      const angle = progress * Math.PI * 6.3;
      const radius = 90 + progress * 470;
      return {
        x: 1000 + Math.cos(angle) * radius,
        y: 1000 + Math.sin(angle) * radius,
        radius: index % 4 ? 12 : 23,
      };
    });
  }
  return Array.from({ length: count }, (_, index) => ({
    x: 140 + index * ((course.width - 280) / Math.max(1, count - 1)),
    y: 440 + Math.sin(index * 1.17) * 220,
    radius: 13,
  }));
}

function buildParadiseBackground(course, points) {
  const root = new PIXI.Container();
  root.sortableChildren = true;
  root.worldH = course.height;
  root.platformsScreen = [];
  root.signViews = [];
  paintParadiseSky(root, course);
  if (course.id === 'cloud_rings') buildCloudRingsBackground(root, course);
  else if (course.id === 'radial_heights') buildRadialBackground(root, course);
  else if (course.id === 'starlit_night') buildStarlitBackground(root, course, points);
  else buildSlipBackground(root, course);
  return root;
}

function paradiseQuoinType(course, index) {
  const type = course.rewards[index % course.rewards.length]?.type || 'xp';
  return QUOIN_TYPES[type] ? type : type === 'favor' ? 'favor' : 'xp';
}

function spawnParadisePickup(course, point, index) {
  let sprite;
  if (course.id === 'radial_heights' || course.id === 'slip_n_slide') {
    sprite = vectorStar(point.radius || 13, 0xffe15c, 0.96);
    sprite.rotation = index % 2 ? 0.13 : -0.13;
    sprite.baseScale = 1;
  } else {
    const quoinType = paradiseQuoinType(course, index);
    sprite = new PIXI.AnimatedSprite(quoinFrames(quoinType));
    sprite.anchor.set(0.5);
    sprite.animationSpeed = 0.28;
    sprite.loop = true;
    sprite.play();
    sprite.baseScale = course.id === 'cloud_rings' ? SCALE * 0.9 : SCALE * 0.82;
    sprite.scale.set(sprite.baseScale);
    const glow = new PIXI.Graphics();
    glow.beginFill(QUOIN_TYPES[quoinType].color, 0.18);
    glow.drawCircle(0, 0, 23);
    glow.endFill();
    sprite.addChildAt(glow, 0);
  }
  sprite.position.set(point.x, point.y);
  sprite.baseY = point.y;
  sprite.phase = index * 0.91;
  sprite.zIndex = 30;
  entityLayer.addChild(sprite);
  const entry = { index, sprite, point, collected: false };
  paradisePickups.push(entry);
  return entry;
}

function spawnCloudRing(course, index) {
  const positions = [
    [670, 425],
    [1240, 610],
    [1850, 330],
    [2460, 570],
    [3040, 370],
  ];
  const [x, y] = positions[index] || [500 + index * 580, 450];
  const root = new PIXI.Container();
  root.position.set(x, y);
  root.zIndex = 12;
  root.sortableChildren = true;
  root._cloudPhase = index * 1.37;
  const profile = CLOUD_RING_PROFILES[index % CLOUD_RING_PROFILES.length];
  const glow = new PIXI.Graphics();
  glow.lineStyle(72, profile.tint, 0.18);
  glow.drawEllipse(0, 0, profile.outerRx - 20, profile.outerRy - 28);
  glow.zIndex = -2;
  root.addChild(glow);
  const puffs = cloudRingPuffLayout(index).map((puff, puffIndex) => {
    // The source tunnels fill most of the location viewport. Build their
    // cloud masses as native-resolution vector lobes so scaling never carries
    // thumbnail blur or recording artifacts into the remake.
    const sprite = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.beginFill(puff.shadowTint, 0.24);
    shadow.drawEllipse(3, 5, puff.width * 0.5, puff.height * 0.45);
    shadow.endFill();
    sprite.addChild(shadow);
    const body = new PIXI.Graphics();
    body.beginFill(puff.tint, 0.96);
    body.drawEllipse(0, 0, puff.width * 0.5, puff.height * 0.38);
    body.drawEllipse(-puff.width * 0.22, -puff.height * 0.08, puff.width * 0.27, puff.height * 0.35);
    body.drawEllipse(puff.width * 0.03, -puff.height * 0.19, puff.width * 0.31, puff.height * 0.4);
    body.drawEllipse(puff.width * 0.27, -puff.height * 0.04, puff.width * 0.25, puff.height * 0.32);
    body.endFill();
    sprite.addChild(body);
    const highlight = new PIXI.Graphics();
    highlight.beginFill(0xffffff, 0.14);
    highlight.drawEllipse(-puff.width * 0.08, -puff.height * 0.22, puff.width * 0.29, puff.height * 0.16);
    highlight.endFill();
    sprite.addChild(highlight);
    sprite.position.set(puff.x, puff.y);
    sprite.rotation = puff.rotation;
    sprite.alpha = puff.alpha;
    sprite.zIndex = Math.sin((puffIndex / 32) * Math.PI * 2) > 0 ? 2 : 0;
    sprite._baseX = puff.x;
    sprite._baseY = puff.y;
    sprite._baseAlpha = puff.alpha;
    sprite._phase = puffIndex * 0.61 + index;
    root.addChild(sprite);
    return sprite;
  });
  const sparkle = new PIXI.Graphics();
  for (let dot = 0; dot < 14; dot += 1) {
    const angle = (dot / 14) * Math.PI * 2 + index * 0.4;
    sparkle.beginFill(0xffffff, 0.3 + (dot % 3) * 0.16);
    sparkle.drawCircle(
      Math.cos(angle) * (profile.outerRx + 8),
      Math.sin(angle) * (profile.outerRy + 10),
      1.4 + (dot % 2)
    );
  }
  sparkle.endFill();
  sparkle.zIndex = 4;
  root.addChild(sparkle);
  root._cloudPuffs = puffs;
  entityLayer.addChild(root);
  const entry = {
    index,
    sprite: root,
    rx: profile.innerRx,
    ry: profile.innerRy,
    passed: false,
  };
  paradiseRings.push(entry);
  return entry;
}

function spawnParadiseExit(course) {
  const root = new PIXI.Container();
  root.position.set(
    course.exit.x,
    course.movement === 'slide' ? slipTerrainY(course.exit.x) : course.exit.y
  );
  root.zIndex = 44;
  const glow = new PIXI.Graphics();
  glow.beginFill(0xbfefff, 0.18);
  glow.drawEllipse(0, -50, 62, 84);
  glow.lineStyle(5, 0xf9ffff, 0.94);
  glow.drawRoundedRect(-42, -120, 84, 112, 39);
  glow.lineStyle(2, 0x7dadd1, 0.88);
  glow.drawRoundedRect(-33, -110, 66, 101, 31);
  root.addChild(glow);
  const arrow = new PIXI.Text('↓', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 27,
    fontWeight: '900',
    fill: 0xffffff,
    stroke: 0x34506f,
    strokeThickness: 3,
  });
  arrow.anchor.set(0.5);
  arrow.position.set(0, -68);
  root.addChild(arrow);
  const label = new PIXI.Text(
    course.id === 'radial_heights' ? "EXIT'S DOWN HERE!" : 'WAY HOME',
    {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 12,
      fontWeight: '900',
      fill: 0xffffff,
      stroke: 0x314764,
      strokeThickness: 4,
    }
  );
  label.anchor.set(0.5);
  label.position.set(0, -140);
  root.addChild(label);
  root.alpha = 0.36;
  entityLayer.addChild(root);
  paradiseExit = { sprite: root, active: false };
  return paradiseExit;
}

function announceParadiseFlight(course) {
  const promptText = new PIXI.Text(
    course.movement === 'slide' ? 'BUILD SPEED · SPACEBAR JUMPS!' : 'PRESS SPACEBAR TO FLY!',
    {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 26,
    fontWeight: '900',
    fill: 0xffffff,
    stroke: 0x283a66,
    strokeThickness: 5,
    dropShadow: true,
    dropShadowColor: 0x11152f,
    dropShadowBlur: 6,
    dropShadowDistance: 2,
    }
  );
  promptText.anchor.set(0.5);
  promptText.position.set(course.spawn.x + 260, course.spawn.y - 145);
  promptText.zIndex = 90;
  promptText._life = 0;
  promptText._max = 190;
  promptText._vy = -0.08;
  fxLayer.addChild(promptText);
}

function renderParadiseFlightHud() {
  const hud = document.getElementById('paradise-flight-hud');
  const visible = paradiseIsInstanced();
  if (hud) hud.hidden = !visible;
  if (!visible || !hud) return;
  const course = paradiseCourse();
  const progress = paradiseRunProgress(paradiseRun);
  const remaining = paradiseRemainingMs(paradiseRun);
  const seconds = Math.ceil(remaining / 1000);
  const icon = hud.querySelector('[data-paradise-icon]');
  const title = hud.querySelector('[data-paradise-title]');
  const timer = hud.querySelector('[data-paradise-timer]');
  const objective = hud.querySelector('[data-paradise-objective]');
  const progressEl = hud.querySelector('[data-paradise-progress]');
  const tickets = hud.querySelector('[data-paradise-tickets]');
  const controls = hud.querySelector('[data-paradise-controls]');
  if (icon) icon.src = `assets/sprites/icons/${course.ticketId}.png`;
  if (title) title.textContent = course.name;
  if (controls) {
    controls.textContent = course.movement === 'slide'
      ? 'Arrows build speed · Spacebar jumps'
      : 'Spacebar to fly · arrows to steer';
  }
  if (timer) {
    timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    timer.classList.toggle('is-low', remaining <= 30_000);
  }
  if (objective) objective.textContent = paradiseObjective(paradiseRun);
  if (progressEl) {
    progressEl.textContent = course.ringCount
      ? `${progress.rings} / ${progress.ringTotal} rings · ${progress.collected} quoins`
      : `${progress.collected} / ${progress.total} ${
          course.id === 'radial_heights' || course.id === 'slip_n_slide' ? 'stars' : 'lights'
        }`;
  }
  if (tickets) tickets.textContent = `${paradiseState.ticketsToday}/${PARADISE_DAILY_LIMIT} tickets today`;
  if (app?.view) {
    app.view.dataset.paradiseCourse = course.id;
    app.view.dataset.paradiseStatus = paradiseRun.status;
    app.view.dataset.paradiseRemaining = String(remaining);
    app.view.dataset.paradiseCollected = String(progress.collected);
    app.view.dataset.paradiseTotal = String(progress.total);
    app.view.dataset.paradiseRings = String(progress.rings);
    app.view.dataset.paradiseRingTotal = String(progress.ringTotal);
    app.view.dataset.paradiseObjective = paradiseObjective(paradiseRun);
    app.view.dataset.paradiseExit = paradiseExit?.active ? 'open' : 'closed';
    if (course.id === 'cloud_rings') {
      app.view.dataset.paradiseRingArt = 'clean-cloud-puffs';
      app.view.dataset.paradiseRingPuffs = String(
        paradiseRings.reduce(
          (total, entry) => total + (entry.sprite?._cloudPuffs?.length || 0),
          0
        )
      );
    } else if (course.id === 'radial_heights') {
      app.view.dataset.paradiseRadialArt = 'source-moon-and-stars';
      app.view.dataset.paradiseRadialMoon = [
        RADIAL_HEIGHTS_MOON.x,
        RADIAL_HEIGHTS_MOON.y,
        RADIAL_HEIGHTS_MOON.width,
      ].join(',');
      app.view.dataset.paradiseSourceStars = String(paradisePickups.length);
    } else if (course.id === 'starlit_night') {
      app.view.dataset.paradiseStarlitArt = 'source-starfield-and-moon-states';
      app.view.dataset.paradiseStarlitFields = String(
        bgLayer?.paradiseStarlitStarFields?.length || 0
      );
      app.view.dataset.paradiseStarlitMoon = [
        STARLIT_NIGHT_MOON.plain.x,
        STARLIT_NIGHT_MOON.plain.y,
        STARLIT_NIGHT_MOON.plain.width,
      ].join(',');
      app.view.dataset.paradiseStarlitLit = String(
        paradiseBackdropStars.filter((star) => star?._litStartedAt > 0).length
      );
      app.view.dataset.paradiseStarlitSourceStars = String(paradiseBackdropStars.length);
    } else if (course.id === 'slip_n_slide') {
      app.view.dataset.paradiseSlipArt = 'recovered-k03-landmarks';
      app.view.dataset.paradiseSlipLandmarks = String(
        bgLayer?.paradiseSlipLandmarks?.length || 0
      );
      app.view.dataset.paradiseSlipTrees = String(
        bgLayer?.paradiseSlipTrees?.length || 0
      );
    }
  }
}

function setupParadiseCourse(course, sourcePoints) {
  clearWorldEntities();
  const points = sourcePoints.length === course.pickupCount
    ? sourcePoints
    : course.id === 'cloud_rings'
      ? cloudRingPickupPoints(course)
      : course.id === 'slip_n_slide'
        ? slipPickupPoints(course)
      : fallbackParadisePoints(course);
  if (bgLayer && world) {
    world.removeChild(bgLayer);
    bgLayer.destroy({ children: true });
  }
  const backdropPoints =
    course.id === 'starlit_night' && sourcePoints.length
      ? sourcePoints
      : points;
  bgLayer = buildParadiseBackground(course, backdropPoints);
  world.addChildAt(bgLayer, 0);
  currentStreetTsid = `PARADISE_${course.id.toUpperCase()}`;
  currentStreet = {
    tsid: currentStreetTsid,
    label: course.name,
    hubName: 'Ticket to Paradise',
    bounds: { l: 0, r: course.width, t: 0, b: course.height },
    platforms: [],
    signposts: [],
  };
  WORLD_W = course.width;
  GROUND_Y = course.height - 80;
  streetPlatforms = [];
  streetWalls = [];
  climb = { active: false, wall: null };
  points.forEach((point, index) => spawnParadisePickup(course, point, index));
  if (course.id === 'cloud_rings') {
    for (let index = 0; index < course.ringCount; index += 1) spawnCloudRing(course, index);
  }
  spawnParadiseExit(course);
  if (player) {
    const previewRing =
      course.id === 'cloud_rings' &&
      new URLSearchParams(location.search).get('paradisepreview') === 'ring'
        ? paradiseRings[0]
        : null;
    const previewMoon =
      course.id === 'radial_heights' &&
      new URLSearchParams(location.search).get('paradisepreview') === 'moon';
    const starlitPreview =
      course.id === 'starlit_night'
        ? new URLSearchParams(location.search).get('paradisepreview')
        : '';
    const previewStarlitMoon = starlitPreview === 'moon' || starlitPreview === 'smile';
    const previewFinish =
      course.id === 'slip_n_slide' &&
      new URLSearchParams(location.search).get('paradisepreview') === 'finish';
    player.x = previewRing
      ? previewRing.sprite.x - 330
      : previewMoon
        ? 1080
        : previewStarlitMoon
          ? 1100
        : previewFinish
          ? 3160
          : course.spawn.x;
    player.y = previewRing
      ? previewRing.sprite.y - 80
      : previewMoon
        ? 1120
        : previewStarlitMoon
          ? 350
          : previewFinish
            ? slipTerrainY(player.x)
            : course.movement === 'slide'
              ? slipTerrainY(course.spawn.x)
              : course.spawn.y;
    player.vx = previewFinish ? 0 : course.movement === 'slide' ? 2.4 : 0;
    player.vy = 0;
    player.onGround = course.movement === 'slide';
    player.rotation = 0;
    setPlayerAnim('idle');
    if (previewRing && app?.view) app.view.dataset.paradisePreview = 'cloud-ring';
    if (previewMoon && app?.view) app.view.dataset.paradisePreview = 'radial-moon';
    if (previewStarlitMoon && bgLayer) {
      if (starlitPreview === 'smile') {
        const now = Date.now();
        bgLayer.paradiseMoonFadeStartedAt = now - STARLIT_NIGHT_MOON_FADE_MS;
        for (const star of paradiseBackdropStars) {
          if (star) star._litStartedAt = now - STARLIT_NIGHT_STAR_FADE_MS;
        }
      }
      if (app?.view) {
        app.view.dataset.paradisePreview =
          starlitPreview === 'smile' ? 'starlit-moon-smile' : 'starlit-moon-plain';
      }
    }
    if (previewFinish && app?.view) app.view.dataset.paradisePreview = 'slip-finish';
  }
  camTarget = cameraTargetForPlayer(player.x);
  camY = cameraTargetY(
    player.y,
    activeCameraWorldHeight(0.55),
    LOCATION_VIEW_H,
    0.55
  );
  world.x = -camTarget;
  world.y = -camY;
  const name = document.getElementById('street-name');
  if (name) {
    name.textContent = `${course.name} · Ticket to Paradise`;
    name.dataset.tsid = currentStreetTsid;
  }
  savePlayerLocation(paradiseSourceLocation);
  announceParadiseFlight(course);
  renderParadiseFlightHud();
  updateHud();
}

async function transitionIntoParadise(course, points, useTransition = true) {
  const setup = () => setupParadiseCourse(course, points);
  const el = document.getElementById('screen-transition');
  if (!useTransition || !el) {
    setup();
    return;
  }
  const colors = {
    cloud_rings: [0x769ed1, 0xe5aca5],
    radial_heights: [0x08243a, 0x3f7380],
    starlit_night: [0x180f43, 0x725184],
    slip_n_slide: [0x14384a, 0x4b7c82],
  }[course.id];
  await runStreetTransition(el, {
    fromLabel: currentStreet?.label || '',
    fromHub: currentStreet?.hubName || '',
    toLabel: course.name,
    toHub: 'Ticket to Paradise',
    topColor: colors[0],
    bottomColor: colors[1],
    onMid: async () => setup(),
  });
}

async function startParadiseFlight(courseId, opts = {}) {
  if (paradiseStartPromise) return paradiseStartPromise;
  if (paradiseRun) return paradiseRun;
  const course = PARADISE_COURSES[courseId];
  if (!course) return null;
  paradiseStartPromise = (async () => {
    closeQuestPanel();
    closeQuestDialogue({ force: true });
    closePackPopover();
    paradiseSourceLocation = opts.sourceLocation || {
      tsid: currentStreetTsid,
      x: player?.x ?? WORLD_W * 0.5,
      y: player?.y ?? GROUND_Y,
    };
    paradiseRun = createParadiseRun(courseId, {
      now: Date.now(),
      sourceLocation: paradiseSourceLocation,
    });
    state.energyTick = 0;
    paradiseAutoNextAt = 0;
    paradiseCompletionAnnounced = false;
    savePlayerLocation(paradiseSourceLocation);
    const [points] = await Promise.all([
      loadParadiseSourcePoints(course),
      loadParadiseVisualAssets(course),
    ]);
    await transitionIntoParadise(course, points, opts.useTransition !== false);
    const controls = course.movement === 'slide'
      ? 'Use the arrows to build speed. Spacebar jumps.'
      : 'Spacebar to fly. Arrow keys steer.';
    pushActivity(`${course.name}: ${controls} ${course.objective}.`);
    toast(controls, 3600);
    return paradiseRun;
  })();
  try {
    return await paradiseStartPromise;
  } finally {
    paradiseStartPromise = null;
  }
}

function confirmParadiseTicketActivation(courseId) {
  const course = PARADISE_COURSES[courseId];
  if (!course) return false;
  const quote = quoteParadiseTicket(paradiseState, courseId, {
    imagination: pc.imagination,
    quoinMultiplier: quoinState.multiplier,
  });
  if (!quote.ok) {
    const info = getPackUseInfo(course.ticketId);
    toast(info.reason || 'That ticket cannot be activated.');
    renderPackPopover(course.ticketId);
    return false;
  }
  closePackPopover();
  openScriptedQuestDialogue({
    title: `Go to ${course.name}?`,
    kicker: 'Ticket to Paradise',
    cancelable: true,
    beats: [{
      text: `Activating this ticket to ${course.name} will cost you ${quote.cost.toLocaleString()} iMG (though you're sure to make it back, and more). Any quoins collected will not count toward your daily quoin limit. Do you want to?!`,
      response: 'Activate',
    }],
    onComplete: async () => {
      if (countItem(inv, course.ticketId) < 1) {
        toast('That ticket is no longer in your pack.');
        return;
      }
      const activated = activateParadiseTicket(paradiseState, courseId, {
        imagination: pc.imagination,
        quoinMultiplier: quoinState.multiplier,
      });
      if (!activated.ok) {
        toast(getPackUseInfo(course.ticketId).reason || 'The ticket fizzled.');
        return;
      }
      if (!removeItem(inv, course.ticketId, 1)) return;
      pc.imagination = Math.max(0, pc.imagination - activated.cost);
      pc.xp = Math.max(0, pc.xp - activated.cost);
      savePlayerState();
      updateHud();
      await startParadiseFlight(courseId);
    },
  });
  return true;
}

function collectParadiseEntry(entry) {
  if (!entry?.sprite?.parent || entry.collected || !paradiseRun) return false;
  const result = collectParadisePickup(paradiseRun, entry.index, Date.now());
  if (!result.ok) return false;
  entry.collected = true;
  const applied = applyParadiseReward(result.reward);
  const { x, y } = entry.sprite;
  if (entry.sprite.parent) entry.sprite.parent.removeChild(entry.sprite);
  if (!entry.sprite.destroyed) entry.sprite.destroy({ children: true });
  if (paradiseRun.courseId === 'starlit_night') {
    const star = paradiseBackdropStars[entry.index];
    if (star) star._litStartedAt = Date.now();
    const progress = paradiseRunProgress(paradiseRun);
    if (
      progress.collected === progress.total &&
      bgLayer?.paradiseMoonPlain &&
      !bgLayer.paradiseMoonFadeStartedAt
    ) {
      bgLayer.paradiseMoonFadeStartedAt = Date.now();
    }
  }
  const color = paradiseRewardColor(result.reward);
  playSfx('quoin', { volume: 0.58, rate: 0.92 + (entry.index % 5) * 0.07 });
  floatText(x, y - 20, applied.copy, color);
  burst(x, y, color, result.reward.amount >= 500 ? 24 : 12);
  pushActivity(`${paradiseCourse().name}: ${applied.copy}.`);
  updateHud();
  renderParadiseFlightHud();
  return true;
}

function passParadiseRingEntry(entry) {
  if (!entry?.sprite?.parent || entry.passed || !paradiseRun) return false;
  const result = passParadiseRing(paradiseRun, entry.index, Date.now());
  if (!result.ok) return false;
  entry.passed = true;
  const applied = applyParadiseReward(result.reward);
  entry.sprite.alpha = 0.24;
  entry.sprite.scale.set(1.18);
  playSfx('quest', { volume: 0.5, rate: 0.86 + entry.index * 0.08 });
  floatText(entry.sprite.x, entry.sprite.y - 130, applied.copy, 0xffe278);
  burst(entry.sprite.x, entry.sprite.y, 0xffe278, 28);
  pushActivity(`Cloud Ring ${entry.index + 1}: ${applied.copy}.`);
  updateHud();
  renderParadiseFlightHud();
  return true;
}

function unlockParadiseExit() {
  if (!paradiseExit || paradiseExit.active) return;
  paradiseExit.active = true;
  paradiseExit.sprite.alpha = 1;
  paradiseExit.sprite.scale.set(1.05);
  playSfx('quest', { volume: 0.62, rate: 1.08 });
  burst(paradiseExit.sprite.x, paradiseExit.sprite.y - 55, 0xd6f6ff, 25);
  const course = paradiseCourse();
  toast(course.completion, 4800);
  pushActivity(course.completion);
  paradiseCompletionAnnounced = true;
  renderParadiseFlightHud();
}

async function returnFromParadise({ expired = false, abandon = false } = {}) {
  if (!paradiseRun || paradiseTransitionBusy) return false;
  paradiseTransitionBusy = true;
  const destination = paradiseSourceLocation?.tsid
    ? { ...paradiseSourceLocation }
    : { tsid: STREET_INDEX.default };
  const finalStatus = expired ? 'expired' : abandon ? 'abandoned' : paradiseRun.status;
  closeQuestDialogue({ force: true });
  keys.clear();
  if (player) {
    player.rotation = 0;
    player.pivot.y = 0;
  }
  paradiseRun = null;
  paradiseSourceLocation = null;
  paradisePickups = [];
  paradiseRings = [];
  paradiseExit = null;
  paradiseBackdropStars = [];
  paradiseCompletionAnnounced = false;
  const hud = document.getElementById('paradise-flight-hud');
  if (hud) hud.hidden = true;
  try {
    await enterStreetWithTransition(destination.tsid, {
      spawnX: destination.x,
      spawnY: destination.y,
      quiet: true,
    });
    savePlayerLocation(destination);
    savePlayerState();
    if (app?.view) app.view.dataset.paradiseStatus = finalStatus;
    if (expired) toast('Your four minutes in Paradise are up. Another ticket can take you back.', 4500);
    else if (abandon) toast('You leave Paradise and return to Ur.', 3200);
    updateHud();
    return true;
  } finally {
    paradiseTransitionBusy = false;
  }
}

function completeParadiseAtExit() {
  if (!paradiseIsInstanced() || !paradiseExit?.active || paradiseTransitionBusy) return false;
  const result = finishParadiseRun(paradiseRun, Date.now());
  if (!result.ok) return false;
  const course = paradiseCourse();
  const applied = applyParadiseReward(result.completionReward);
  paradiseState.completions[course.id] = (paradiseState.completions[course.id] || 0) + 1;
  savePlayerState();
  updateHud();
  playSfx('quest', { volume: 0.72, rate: 1.1 });
  openScriptedQuestDialogue({
    title: course.name,
    kicker: 'Paradise complete',
    beats: [{
      text: `${course.completion} ${applied.copy}.`,
      response: 'Return to Ur',
    }],
    onComplete: () => returnFromParadise(),
  });
  renderParadiseFlightHud();
  return true;
}

function confirmLeaveParadise() {
  if (!paradiseIsInstanced()) return;
  openScriptedQuestDialogue({
    title: paradiseCourse().name,
    kicker: 'Leave Paradise?',
    cancelable: true,
    beats: [{
      text: 'This private Paradise will dissolve behind you, but another ticket can bring you back.',
      response: 'Return to Ur',
    }],
    onComplete: () => returnFromParadise({ abandon: true }),
  });
}

function handleParadiseSlideInput() {
  if (!paradiseIsInstanced() || paradiseCourse()?.movement !== 'slide' || !player) return;
  const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
  const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
  const now = movementNow();
  const jumpRequested = hasQueuedJump(jumpState, now);
  const steer = player.onGround ? 0.18 : 0.08;
  if (left && !right) player.vx = Math.max(-9.5, player.vx - steer);
  else if (right && !left) player.vx = Math.min(10.5, player.vx + steer);
  if (jumpRequested) {
    clearJumpQueue(jumpState);
    if (player.onGround) {
      player.vy = -8.9 - Math.min(1.8, Math.abs(player.vx) * 0.13);
      player.onGround = false;
      playSfx('jump', { volume: 0.48, rate: 1.08 });
      burst(player.x, player.y - 2, 0xe9f7f7, 9);
    }
  }
  applyPlayerFacing();
  if (Math.abs(player.vx) > 0.4 || !player.onGround) setPlayerAnim('walk');
  else setPlayerAnim('idle');
}

function handleParadiseFlightInput() {
  if (!paradiseIsInstanced() || !player) return;
  const previewRing =
    paradiseCourse()?.id === 'cloud_rings' &&
    new URLSearchParams(location.search).get('paradisepreview') === 'ring'
      ? paradiseRings[0]
      : null;
  const previewMoon =
    paradiseCourse()?.id === 'radial_heights' &&
    new URLSearchParams(location.search).get('paradisepreview') === 'moon';
  const starlitPreview =
    paradiseCourse()?.id === 'starlit_night'
      ? new URLSearchParams(location.search).get('paradisepreview')
      : '';
  const previewStarlitMoon = starlitPreview === 'moon' || starlitPreview === 'smile';
  if (previewRing?.sprite?.parent) {
    // Keep the dedicated visual-QA route framed on the first tunnel. Normal
    // course play retains gravity and the complete flight model.
    player.x = previewRing.sprite.x - 330;
    player.y = previewRing.sprite.y - 80;
    player.vx = 0;
    player.vy = 0;
    player.rotation = 0;
    player.onGround = false;
    setPlayerAnim('idle');
    return;
  }
  if (previewMoon) {
    player.x = 1080;
    player.y = 1120;
    player.vx = 0;
    player.vy = 0;
    player.rotation = 0;
    player.onGround = false;
    setPlayerAnim('idle');
    return;
  }
  if (previewStarlitMoon) {
    player.x = 1100;
    player.y = 350;
    player.vx = 0;
    player.vy = 0;
    player.rotation = 0;
    player.onGround = false;
    setPlayerAnim('idle');
    return;
  }
  const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
  const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
  const lift =
    keys.has(' ') ||
    keys.has('ArrowUp') ||
    keys.has('w') ||
    keys.has('W');
  const down = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
  if (left && !right) player.vx = Math.max(-5.8, player.vx - 0.34);
  else if (right && !left) player.vx = Math.min(5.8, player.vx + 0.34);
  else player.vx *= 0.965;
  if (lift && !down) player.vy = Math.max(-5.4, player.vy - 0.46);
  else if (down && !lift) player.vy = Math.min(5.2, player.vy + 0.38);
  else player.vy = Math.min(3.1, player.vy + 0.16);
  player.vy *= 0.985;
  player.onGround = false;
  applyPlayerFacing();
  if (Math.abs(player.vx) > 0.3 || Math.abs(player.vy) > 0.3) setPlayerAnim('walk');
  else setPlayerAnim('idle');
}

function paradiseSlidePhysics(dt) {
  if (!paradiseIsInstanced() || paradiseCourse()?.movement !== 'slide' || !player) return;
  const course = paradiseCourse();
  const previewFinish =
    new URLSearchParams(location.search).get('paradisepreview') === 'finish';
  if (previewFinish) {
    player.x = 3160;
    player.y = slipTerrainY(player.x);
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    player.rotation = Math.atan(slipTerrainSlope(player.x)) * 0.34;
    return;
  }
  const previousX = player.x;
  const slope = slipTerrainSlope(player.x);
  if (player.onGround) {
    // Gravity projected onto the authored hill provides the characteristic
    // accelerate-downhill, bleed-speed-uphill rhythm visible in the source.
    player.vx += slope * 0.34 * dt;
    player.vx *= Math.pow(0.994, dt);
    if (Math.abs(player.vx) < 0.12) player.vx = 0;
  } else {
    player.vy += 0.43 * dt;
    player.vx *= Math.pow(0.998, dt);
  }
  player.vx = clamp(player.vx, -10.5, 10.5);
  player.x = clamp(player.x + player.vx * dt, 32, course.width - 32);
  if (player.x <= 33 && player.vx < 0) player.vx *= -0.32;
  if (player.x >= course.width - 33 && player.vx > 0) player.vx *= -0.24;
  const ground = slipTerrainY(player.x);
  if (player.onGround) {
    player.y = ground;
    player.vy = 0;
  } else {
    player.y += player.vy * dt;
    if (player.y >= ground && player.vy >= -0.4) {
      player.y = ground;
      player.vy = 0;
      player.onGround = true;
      playSfx('step', { volume: 0.18, rate: 1.25 });
      burst(player.x, player.y, 0xf3fbfb, Math.abs(player.vx) > 6 ? 12 : 6);
    }
  }
  const groundAngle = Math.atan(slipTerrainSlope(player.x));
  const airAngle = clamp(player.vy * 0.018 + player.vx * 0.006, -0.18, 0.18);
  const rotationTarget = player.onGround ? clamp(groundAngle * 0.34, -0.24, 0.24) : airAngle;
  player.rotation += (rotationTarget - player.rotation) * dampingAlpha(0.18, dt);
  player.pivot.y = player.onGround ? Math.sin(time * 0.32) * Math.min(1.4, Math.abs(player.vx) * 0.12) : 0;
  if (
    player.onGround &&
    Math.abs(player.x - previousX) > 1.5 &&
    Math.floor(time) % 6 === 0
  ) {
    const spray = new PIXI.Graphics();
    spray.beginFill(0xf7ffff, 0.56);
    spray.drawCircle(0, 0, 1.8 + (Math.floor(time) % 3));
    spray.endFill();
    spray.position.set(player.x - Math.sign(player.vx || 1) * 20, player.y - 5);
    spray._vx = -player.vx * 0.12;
    spray._vy = -0.2 - Math.abs(player.vx) * 0.03;
    spray._life = 0;
    spray._max = 34;
    fxLayer.addChild(spray);
  }
  if (app?.view) {
    app.view.dataset.paradiseSlope = slope.toFixed(3);
    app.view.dataset.paradiseGrounded = player.onGround ? '1' : '0';
    app.view.dataset.paradiseSpeed = Math.abs(player.vx).toFixed(2);
  }
}

function paradiseFlightPhysics(dt) {
  if (!paradiseIsInstanced() || !player) return;
  const course = paradiseCourse();
  player.x = clamp(player.x + player.vx * dt, 34, course.width - 34);
  player.y = clamp(player.y + player.vy * dt, 72, course.height - 45);
  if (player.x <= 35 && player.vx < 0) player.vx *= -0.24;
  if (player.x >= course.width - 35 && player.vx > 0) player.vx *= -0.24;
  if (player.y <= 73 && player.vy < 0) player.vy *= -0.18;
  if (player.y >= course.height - 46 && player.vy > 0) player.vy *= -0.18;
  const bankTarget = clamp(player.vy * 0.026 + player.vx * 0.012, -0.15, 0.15);
  player.rotation += (bankTarget - player.rotation) * dampingAlpha(0.14, dt);
  player.pivot.y = Math.sin(time * 0.13) * 1.4;
  if (Math.abs(player.vx) + Math.abs(player.vy) > 2.4 && Math.floor(time) % 7 === 0) {
    const mote = new PIXI.Graphics();
    mote.beginFill(0xf3fbff, 0.52);
    mote.drawCircle(0, 0, 1.5 + (Math.floor(time) % 3));
    mote.endFill();
    mote.position.set(player.x - Math.sign(player.vx || 1) * 24, player.y - 35);
    mote._vx = -player.vx * 0.12;
    mote._vy = 0.18;
    mote._life = 0;
    mote._max = 38;
    fxLayer.addChild(mote);
  }
}

function updateParadiseFlight(dt) {
  if (!paradiseIsInstanced() || paradiseTransitionBusy) return;
  const now = Date.now();
  const course = paradiseCourse();
  const autoplay = new URLSearchParams(location.search).get('paradiseautoplay');
  const autoplayActive = autoplay === '1' || autoplay === course.id;
  if (course.id === 'starlit_night') {
    for (const star of paradiseBackdropStars) {
      if (!star || star.destroyed) continue;
      star.alpha = starlitRevealAlpha(star._litStartedAt, now);
    }
    const plain = bgLayer?.paradiseMoonPlain;
    if (plain && !plain.destroyed) {
      plain.alpha = starlitMoonPlainAlpha(bgLayer.paradiseMoonFadeStartedAt, now);
    }
    if (app?.view) {
      app.view.dataset.paradiseStarlitLit = String(
        paradiseBackdropStars.filter((star) => star?._litStartedAt > 0).length
      );
      app.view.dataset.paradiseStarlitMoonAlpha = plain
        ? plain.alpha.toFixed(3)
        : '0.000';
      app.view.dataset.paradiseStarlitMoonState = !bgLayer?.paradiseMoonFadeStartedAt
        ? 'plain'
        : plain?.alpha > 0
          ? 'revealing'
          : 'smile';
    }
  }
  if (paradiseRun.status === 'complete') {
    if (autoplayActive && isQuestDialogueOpen() && now >= paradiseAutoNextAt) {
      paradiseAutoNextAt = now + 170;
      advanceQuestDialogue();
    }
    renderParadiseFlightHud();
    return;
  }
  if (paradiseRemainingMs(paradiseRun, now) <= 0) {
    expireParadiseRun(paradiseRun, now);
    pushActivity(`Your four minutes in ${course.name} came to an end.`);
    returnFromParadise({ expired: true });
    return;
  }
  for (const flake of bgLayer?.paradiseSnowflakes || []) {
    flake.y += flake._speed * dt;
    flake.x += flake._drift * dt;
    if (flake.y > course.height - 190) flake.y = -8;
    if (flake.x < 0) flake.x = course.width;
    else if (flake.x > course.width) flake.x = 0;
  }
  for (const entry of paradisePickups) {
    if (entry.collected || !entry.sprite?.parent) continue;
    entry.sprite.phase += 0.048 * dt;
    entry.sprite.y = entry.sprite.baseY + Math.sin(entry.sprite.phase) * 8;
    const pulse = 1 + Math.sin(entry.sprite.phase * 1.4) * 0.075;
    entry.sprite.scale.set((entry.sprite.baseScale || 1) * pulse);
    if (
      !menuTarget &&
      Math.hypot(entry.sprite.x - player.x, entry.sprite.y - (player.y - 30)) <
        (course.id === 'radial_heights' || course.id === 'slip_n_slide'
          ? Math.max(30, entry.point.radius + 22)
          : 47)
    ) {
      collectParadiseEntry(entry);
    }
  }
  for (const entry of paradiseRings) {
    if (entry.passed || !entry.sprite?.parent) continue;
    entry.sprite._cloudPhase += 0.022 * dt;
    const breathe = 1 + Math.sin(entry.sprite._cloudPhase) * 0.018;
    entry.sprite.scale.set(breathe);
    for (const puff of entry.sprite._cloudPuffs || []) {
      const drift = Math.sin(entry.sprite._cloudPhase * 1.7 + puff._phase);
      puff.x = puff._baseX + drift * 2.4;
      puff.y = puff._baseY + Math.cos(entry.sprite._cloudPhase + puff._phase) * 1.8;
      puff.alpha = puff._baseAlpha + drift * 0.035;
      if (puff._shadow) {
        puff._shadow.x = puff.x + 3;
        puff._shadow.y = puff.y + 5;
      }
    }
    const dx = player.x - entry.sprite.x;
    const dy = player.y - 34 - entry.sprite.y;
    if ((dx * dx) / (entry.rx * entry.rx) + (dy * dy) / (entry.ry * entry.ry) <= 1) {
      passParadiseRingEntry(entry);
    }
  }
  const starlitRevealComplete =
    course.id !== 'starlit_night' ||
    starlitMoonPlainAlpha(bgLayer?.paradiseMoonFadeStartedAt, now) <= 0;
  if (paradiseObjectiveComplete(paradiseRun) && starlitRevealComplete) {
    unlockParadiseExit();
  }
  if (
    paradiseExit?.active &&
    !isQuestDialogueOpen() &&
    Math.hypot(
      paradiseExit.sprite.x - player.x,
      paradiseExit.sprite.y - player.y
    ) < 74
  ) {
    completeParadiseAtExit();
    return;
  }

  if (autoplayActive && now >= paradiseAutoNextAt) {
    paradiseAutoNextAt = now + 170;
    if (isQuestDialogueOpen()) {
      advanceQuestDialogue();
      return;
    }
    const ring = paradiseRings.find((entry) => !entry.passed && entry.sprite?.parent);
    const pickup = paradisePickups.find((entry) => !entry.collected && entry.sprite?.parent);
    const target = ring?.sprite || pickup?.sprite || (paradiseExit?.active ? paradiseExit.sprite : null);
    if (target) {
      player.x = target.x;
      player.y = ring ? target.y + 34 : pickup ? target.y + 30 : target.y;
      player.vx = 0;
      player.vy = 0;
      if (course.movement === 'slide' && pickup) player.onGround = false;
    }
  }
  renderParadiseFlightHud();
}

function updateIlmenskieAutoplay() {
  if (new URLSearchParams(location.search).get('jonesautoplay') !== '1') return;
  if (!questState.active?.[ILMENSKIE_QUEST_ID] || ilmenskieAutoBusy) return;
  const now = Date.now();
  if (now < ilmenskieAutoNextAt) return;
  ilmenskieAutoNextAt = now + 420;
  const rescue = ilmenskieStory();
  if (isQuestDialogueOpen()) {
    advanceQuestDialogue();
    return;
  }
  if (currentStreetTsid !== AXIS_DENYDE_STREET_ID && !rescue.pickedUpJones) {
    ilmenskieAutoBusy = true;
    teleportToAxisDenyde().finally(() => {
      ilmenskieAutoBusy = false;
      ilmenskieAutoNextAt = Date.now() + 500;
    });
    return;
  }
  if (currentStreetTsid === AXIS_DENYDE_STREET_ID && !rescue.metJones && ilmenskieTarget) {
    handleIlmenskieTarget(ilmenskieTarget, 'talk_to');
    return;
  }
  if (currentStreetTsid === AXIS_DENYDE_STREET_ID && rescue.metJones && !rescue.pickedUpJones && ilmenskieTarget) {
    handleIlmenskieTarget(ilmenskieTarget, 'pickup');
    return;
  }
  if (currentStreetTsid === AXIS_DENYDE_STREET_ID && rescue.pickedUpJones) {
    ilmenskieAutoBusy = true;
    teleportFromAxisDenyde().finally(() => {
      ilmenskieAutoBusy = false;
      ilmenskieAutoNextAt = Date.now() + 500;
    });
    return;
  }
  if (rescue.pickedUpJones && !rescue.releasedJones) releasePackedIlmenskieJones();
}

const ILMENSKIE_CAVE_DIALOGUE = [
  {
    text: 'Thank the Giants you’re here, and not a second too soon!',
    response: 'What’s wrong?',
  },
  {
    text: 'I seem to have become trapped somehow. Probably something about an idol and an ancient curse. I’m pretty sure mummies were involved in some capacity. We can work out the details later. Anyway, the cave entrance has collapsed, and I can’t reach the exit. You’ve got to help me escape!',
    response: 'How do I do that?',
  },
  {
    text: 'Just pick me up, and we can get the hell out of here!',
    response: 'OK',
  },
];

const ILMENSKIE_RELEASE_DIALOGUE = [
  {
    text: 'That was a close one. Thanks for your help; this will rank among one of my greatest adventures.',
    response: 'Getting stuck in a cave?',
  },
  {
    text: 'We can spice it up a little. I’ll throw in something about the cult of an ancient god and a pit full of serpents. Trust me, this stuff is box office dynamite.',
    response: 'If you say so.',
  },
];

function ilmenskieStory() {
  return ensureIlmenskieState(questState);
}

function spawnIlmenskieJones({ released = false } = {}) {
  if (!entityLayer || !questState.active?.[ILMENSKIE_QUEST_ID]) return null;
  const rescue = ilmenskieStory();
  if (!released) {
    if (currentStreetTsid !== AXIS_DENYDE_STREET_ID || rescue.pickedUpJones || rescue.releasedJones) {
      return null;
    }
  }
  const frames = textures.jonesWalk?.frames || [];
  const spr = new PIXI.AnimatedSprite(frames.length ? frames.slice(0, 8) : [PIXI.Texture.WHITE]);
  spr.name = 'ilmenskie-jones';
  spr.anchor.set(0.5, 1);
  spr.animationSpeed = 0.08;
  spr.loop = true;
  spr.scale.set(1.28);
  spr.x = released ? player.x + 82 : 2444;
  spr.y = released ? player.y : 330;
  spr.zIndex = 46;
  spr.play();
  entityLayer.addChild(spr);
  ilmenskieTarget = register({
    classId: 'npc_piggy_explorer',
    label: 'Ilmenskie Jones',
    subtitle: released
      ? 'Famed explorer and freshly liberated porkthropologist'
      : 'Famed explorer, trapped in the Sealed Cavern',
    sprite: spr,
    state: { rescueState: rescue, released },
  });
  if (app?.view) {
    app.view.dataset.ilmenskiePhase = rescue.phase;
    app.view.dataset.ilmenskieObjective = ilmenskieObjective(rescue, currentStreetTsid);
  }
  return ilmenskieTarget;
}

function handleIlmenskieTarget(target, verbId) {
  if (!target || target !== ilmenskieTarget) return;
  const rescue = ilmenskieStory();
  if (verbId === 'nibble') {
    showSpeechBubble(target, {
      speaker: 'Ilmenskie Jones',
      text: "Don't get fresh with me, kid. This is life or death here.",
      durationMs: 5200,
    });
    pushActivity('You tried to nibble Ilmenskie Jones.');
    return;
  }
  if (verbId === 'talk_to') {
    meetIlmenskieJones(rescue);
    target.state.rescueState = rescue;
    openScriptedQuestDialogue({
      title: 'Ilmenskie Jones',
      kicker: 'Sealed Cavern',
      beats: ILMENSKIE_CAVE_DIALOGUE,
      onComplete: () => {
        toast('Pick up Ilmenskie Jones, then use Map to escape.');
        savePlayerState();
        updateHud();
      },
    });
    return;
  }
  if (verbId !== 'pickup') return;
  const result = pickupIlmenskieJones(rescue);
  if (!result.ok) {
    toast(result.reason === 'meet_first' ? 'Talk to Ilmenskie Jones first.' : 'Jones is already packed.');
    return;
  }
  addItem(inv, HOGTIED_JONES_ID, 1);
  if (target.sprite?.parent) target.sprite.parent.removeChild(target.sprite);
  if (target.sprite && !target.sprite.destroyed) target.sprite.destroy();
  interactables = interactables.filter((entry) => entry !== target);
  ilmenskieTarget = null;
  playSfx('pickup', { volume: 0.52, rate: 0.82 });
  toast('You picked up Ilmenskie Jones. Open Map to teleport out.', 4200);
  pushActivity('You picked up Ilmenskie Jones.');
  if (app?.view) {
    app.view.dataset.ilmenskiePhase = rescue.phase;
    app.view.dataset.ilmenskieObjective = ilmenskieObjective(rescue, currentStreetTsid);
  }
  savePlayerState();
  updateHud();
}

async function teleportToAxisDenyde() {
  if (!questState.active?.[ILMENSKIE_QUEST_ID]) return false;
  const rescue = ilmenskieStory();
  if (currentStreetTsid !== AXIS_DENYDE_STREET_ID) {
    rememberIlmenskieSource(rescue, {
      tsid: currentStreetTsid,
      x: player?.x,
      y: player?.y,
    });
  }
  closeMap();
  closeVerbMenu();
  pushActivity('Teleporting through the sealed entrance to Axis Denyde…');
  await enterStreetWithTransition(AXIS_DENYDE_STREET_ID, {
    spawnX: 2240,
    spawnY: 330,
    quiet: true,
  });
  savePlayerLocation(rescue.sourceLocation);
  savePlayerState();
  if (app?.view) {
    app.view.dataset.ilmenskiePhase = rescue.phase;
    app.view.dataset.ilmenskieObjective = ilmenskieObjective(rescue, currentStreetTsid);
  }
  toast(rescue.pickedUpJones ? 'The cavern is still sealed. Teleport back out.' : 'Axis Denyde. Find Ilmenskie Jones.', 3600);
  return true;
}

async function teleportFromAxisDenyde() {
  const rescue = ilmenskieStory();
  if (currentStreetTsid !== AXIS_DENYDE_STREET_ID || !rescue.sourceLocation?.tsid) return false;
  const destination = { ...rescue.sourceLocation };
  closeMap();
  closeVerbMenu();
  await enterStreetWithTransition(destination.tsid, {
    spawnX: destination.x,
    spawnY: destination.y,
    quiet: true,
  });
  savePlayerLocation(destination);
  savePlayerState();
  if (app?.view) {
    app.view.dataset.ilmenskiePhase = rescue.phase;
    app.view.dataset.ilmenskieObjective = ilmenskieObjective(rescue, currentStreetTsid);
  }
  toast('You escaped the Sealed Cavern. Release Jones from your pack.', 4200);
  pushActivity('You teleported out of Axis Denyde with Ilmenskie Jones.');
  updateHud();
  return true;
}

function releasePackedIlmenskieJones() {
  const rescue = ilmenskieStory();
  const gate = canReleaseIlmenskieJones(rescue, currentStreetTsid);
  if (!gate.ok) {
    toast(gate.message);
    return false;
  }
  if (!removeItem(inv, HOGTIED_JONES_ID, 1)) {
    toast('Ilmenskie Jones is not in your pack.');
    return false;
  }
  releaseIlmenskieJones(rescue, currentStreetTsid);
  const target = spawnIlmenskieJones({ released: true });
  playSfx('pickup', { volume: 0.46, rate: 1.25 });
  burst(target?.sprite?.x || player.x, (target?.sprite?.y || player.y) - 55, 0xe8e1ce, 18);
  pushActivity('You released Ilmenskie Jones.');
  openScriptedQuestDialogue({
    title: 'Ilmenskie Jones',
    kicker: 'Safe at last',
    beats: ILMENSKIE_RELEASE_DIALOGUE,
    onComplete: () => {
      const updates = applyQuestProgress(questState, 'rescue_pig', 1, pc);
      announceQuestCompletions(updates);
      if (target?.sprite?.parent) target.sprite.parent.removeChild(target.sprite);
      if (target?.sprite && !target.sprite.destroyed) target.sprite.destroy();
      interactables = interactables.filter((entry) => entry !== target);
      ilmenskieTarget = null;
      if (app?.view) {
        app.view.dataset.ilmenskiePhase = 'released';
        app.view.dataset.ilmenskieObjective = 'Ilmenskie Jones rescued';
      }
      savePlayerState();
      updateHud();
    },
  });
  savePlayerState();
  updateHud();
  return true;
}

function homeIsInstanced() {
  return homeState.inHome === true &&
    [HOME_STREET_TSID, HOME_INTERIOR_TSID].includes(currentStreetTsid);
}

function updateHomeChrome() {
  const button = document.getElementById('home-btn');
  const badge = document.getElementById('mail-unread-badge');
  const unread = unreadMailCount(mailboxState, Date.now());
  if (button) {
    button.classList.toggle('is-owned', homeState.owned);
    button.title = homeState.owned
      ? `${homeState.inHome ? 'At home' : 'Go home'} · ${unread} unread mail`
      : `Buy a home · ${HOME_PURCHASE_COST} currants`;
  }
  if (badge) {
    badge.textContent = String(unread);
    badge.hidden = unread < 1;
  }
  if (homeMailboxTarget?.sprite && !homeMailboxTarget.sprite.destroyed) {
    homeMailboxTarget.state.unread = unread;
    homeMailboxTarget.subtitle = unread
      ? `${unread} unread message${unread === 1 ? '' : 's'}`
      : 'Your very own mail';
    homeMailboxTarget.sprite.texture = PIXI.Texture.from(unread > 0
      ? 'assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_has_mail_idle_png_1354832230.png'
      : 'assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_idle_png_1354832227.png');
  }
  if (app?.view) {
    app.view.dataset.homeOwned = homeState.owned ? '1' : '0';
    app.view.dataset.homeStyle = homeState.style || '';
    app.view.dataset.homeRoom = homeState.inHome ? homeState.room : '';
    app.view.dataset.mailUnread = String(unread);
    app.view.dataset.mailTotal = String(mailboxState.messages.length);
  }
}

function closeHomePanel() {
  const panel = document.getElementById('home-panel');
  if (panel) panel.hidden = true;
}

function isHomePanelOpen() {
  const panel = document.getElementById('home-panel');
  return Boolean(panel && !panel.hidden);
}

function renderHomePanel() {
  const body = document.getElementById('home-body');
  const title = document.getElementById('home-panel-title');
  if (!body) return;
  if (!homeState.owned) {
    if (title) title.textContent = 'Choose your home';
    const selected = body.dataset.style && HOME_STYLES[body.dataset.style]
      ? body.dataset.style
      : 'meadow';
    body.dataset.style = selected;
    const quote = quoteHomePurchase(homeState, pc, selected);
    body.innerHTML = `
      <p class="home-intro">The old real-estate market and the later homestreet ticket have been folded into one tidy deed. Pick a landscape; the deed includes a house, a home street, and Mailbox (1).</p>
      <div class="home-style-grid">
        ${Object.values(HOME_STYLES).map((style) => `
          <button type="button" class="home-style${style.id === selected ? ' is-selected' : ''}" data-home-style="${style.id}" style="--home-accent:${style.accent}">
            <span class="home-style-visual"></span>
            <strong>${escapeHtml(style.label)}</strong>
            <span>${escapeHtml(style.description)}</span>
          </button>
        `).join('')}
      </div>
      <div class="home-purchase-bar">
        <div class="home-purchase-copy">
          <strong>Deed: ◎ ${HOME_PURCHASE_COST.toLocaleString()} currants</strong>
          <span>${quote.ok ? `You will have ◎ ${(pc.currants - HOME_PURCHASE_COST).toLocaleString()} left.` : `You need ◎ ${quote.shortfall.toLocaleString()} more.`}</span>
        </div>
        <button type="button" id="home-purchase-btn" class="btn-glitch-primary" ${quote.ok ? '' : 'disabled'}>Purchase ${escapeHtml(HOME_STYLES[selected].label)} home</button>
      </div>
    `;
    body.querySelectorAll('[data-home-style]').forEach((button) => {
      button.addEventListener('click', () => {
        body.dataset.style = button.dataset.homeStyle;
        renderHomePanel();
      });
    });
    body.querySelector('#home-purchase-btn')?.addEventListener('click', () => {
      const style = body.dataset.style || 'meadow';
      const result = purchaseHome(homeState, pc, style, Date.now());
      if (!result.ok) {
        toast(result.reason === 'no_money'
          ? `You need ${result.shortfall} more currants.`
          : 'That deed cannot be purchased.');
        return;
      }
      seedMailbox(mailboxState, Date.now());
      pushActivity(`You purchased a ${result.styleLabel} home for ${result.cost} currants.`);
      toast('The deed is yours. Your mailbox already has something in it!', 3600);
      playSfx('quest', { volume: 0.48, rate: 1.08 });
      updateHud();
      updateHomeChrome();
      savePlayerState();
      renderHomePanel();
    });
    return;
  }

  const style = HOME_STYLES[homeState.style] || HOME_STYLES.meadow;
  if (title) title.textContent = `${style.label} home`;
  const locationCopy = homeState.inHome
    ? homeState.room === 'interior'
      ? 'You are inside your house.'
      : 'You are on your home street.'
    : 'Your home is one thought away.';
  const unread = unreadMailCount(mailboxState, Date.now());
  body.innerHTML = `
    <div class="home-owned-hero" style="--home-accent:${style.accent}">
      <div class="home-owned-mark" aria-hidden="true">⌂</div>
      <div>
        <h3>Your ${escapeHtml(style.label)} home</h3>
        <p>${escapeHtml(style.description)} ${escapeHtml(locationCopy)}</p>
      </div>
    </div>
    <div class="home-owned-actions">
      ${homeState.inHome
        ? `<button type="button" class="btn-glitch-primary" data-home-action="mail">${unread ? `Open mailbox (${unread})` : 'Open mailbox'}</button>
           <button type="button" data-home-action="${homeState.room === 'interior' ? 'outside' : 'inside'}">${homeState.room === 'interior' ? 'Go outside' : 'Enter house'}</button>
           <button type="button" data-home-action="return">Return to Ur</button>`
        : '<button type="button" class="btn-glitch-primary" data-home-action="teleport">Teleport home</button>'}
      <span class="home-owned-meta">${homeState.visits} visit${homeState.visits === 1 ? '' : 's'} · ${unread} unread</span>
    </div>
  `;
  body.querySelectorAll('[data-home-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.homeAction;
      closeHomePanel();
      if (action === 'teleport') await teleportHome();
      else if (action === 'return') await returnFromHome();
      else if (action === 'inside') await switchHomeRoom('interior');
      else if (action === 'outside') await switchHomeRoom('street');
      else if (action === 'mail') openMailboxPanel();
    });
  });
}

function openHomePanel() {
  closeMailboxPanel();
  closeMap();
  closeVendor();
  closeQuestPanel();
  closePackPopover();
  renderHomePanel();
  const panel = document.getElementById('home-panel');
  if (panel) panel.hidden = false;
}

function closeMailboxPanel() {
  const panel = document.getElementById('mail-panel');
  if (panel) panel.hidden = true;
  mailboxComposeReplyTo = null;
}

function isMailboxOpen() {
  const panel = document.getElementById('mail-panel');
  return Boolean(panel && !panel.hidden);
}

function mailWhen(timestamp) {
  if (!timestamp) return 'now';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function mailboxRows() {
  if (mailboxFolder === 'archived') {
    return listMailboxMessages(mailboxState, { now: Date.now(), archived: true });
  }
  if (mailboxFolder === 'sent') {
    return listMailboxMessages(mailboxState, { now: Date.now(), outgoing: true });
  }
  return listMailboxMessages(mailboxState, { now: Date.now() });
}

function mailAttachmentLabel(message) {
  const parts = [];
  if (message.attachment) {
    parts.push(`${message.attachment.count}× ${ITEM_CATALOG[message.attachment.classTsid]?.label || message.attachment.classTsid}`);
  }
  if (message.currants) parts.push(`◎ ${message.currants} currants`);
  return parts.join(' · ');
}

function renderMailboxCompose(recipient = '', replyTo = null) {
  const reader = document.getElementById('mail-reader');
  if (!reader) return;
  // A truthy sentinel distinguishes a new unsent draft from the ordinary
  // reader state so the once-per-second delivery refresh does not erase it.
  mailboxComposeReplyTo = replyTo || '__new_mail__';
  const reply = mailboxState.messages.find((message) => message.id === replyTo);
  const selectedRecipient = recipient || reply?.sender || MAIL_COMPANIONS[0];
  const attachable = listPackItemSlots(inv)
    .filter((slot) => slot.count > 0)
    .slice(0, 80);
  reader.innerHTML = `
    <form id="mail-compose-form" class="mail-compose-form">
      <label>To
        <select name="recipient">
          ${MAIL_COMPANIONS.map((name) => `<option value="${escapeHtml(name)}" ${name === selectedRecipient ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
        </select>
      </label>
      <label>Message
        <textarea name="text" maxlength="500" required placeholder="Write something envelope-sized…"></textarea>
      </label>
      <div class="mail-compose-grid">
        <label>Attach one stack
          <select name="attachment">
            <option value="">Nothing</option>
            ${attachable.map((slot) => `<option value="${escapeHtml(slot.classTsid)}">${escapeHtml(slot.label)} ×${slot.count}</option>`).join('')}
          </select>
        </label>
        <label>Qty
          <input name="quantity" type="number" min="1" value="1" />
        </label>
        <label>Enclose currants
          <input name="currants" type="number" min="0" max="${Math.max(0, Math.floor(pc.currants))}" value="0" />
        </label>
      </div>
      <div class="mail-compose-cost">
        <span>Base postage starts at 2 currants</span>
        <strong data-mail-cost>◎ 2</strong>
      </div>
      <div class="mail-message-actions">
        <button type="submit" class="btn-glitch-primary">Send mail</button>
        <button type="button" data-mail-cancel>Cancel</button>
      </div>
    </form>
  `;
  const form = reader.querySelector('#mail-compose-form');
  const updateCost = () => {
    const data = new FormData(form);
    const classTsid = String(data.get('attachment') || '');
    const count = Math.max(0, Math.floor(Number(data.get('quantity')) || 0));
    const currants = Math.max(0, Math.floor(Number(data.get('currants')) || 0));
    const cost = mailCost({
      itemBaseCost: ITEM_CATALOG[classTsid]?.baseCost || 10,
      itemCount: classTsid ? count : 0,
      currants,
    });
    const costEl = form.querySelector('[data-mail-cost]');
    if (costEl) costEl.textContent = `◎ ${cost}`;
  };
  form.addEventListener('input', updateCost);
  form.querySelector('[data-mail-cancel]')?.addEventListener('click', () => {
    mailboxComposeReplyTo = null;
    renderMailboxPanel();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const classTsid = String(data.get('attachment') || '');
    const count = classTsid ? Math.max(1, Math.floor(Number(data.get('quantity')) || 1)) : 0;
    const result = sendMail(mailboxState, pc, inv, {
      recipient: String(data.get('recipient') || ''),
      text: String(data.get('text') || ''),
      attachment: classTsid ? { classTsid, count } : null,
      attachmentBaseCost: ITEM_CATALOG[classTsid]?.baseCost || 10,
      currants: Math.max(0, Math.floor(Number(data.get('currants')) || 0)),
      replyTo: mailboxComposeReplyTo === '__new_mail__' ? null : mailboxComposeReplyTo,
      now: Date.now(),
    });
    if (!result.ok) {
      const messages = {
        empty: 'Write a message first.',
        missing_item: 'That item stack is no longer in your pack.',
        no_money: `You need ${result.shortfall} more currants.`,
        recipient: 'Choose someone to receive this.',
      };
      toast(messages[result.reason] || 'That letter could not be sent.');
      return;
    }
    mailboxFolder = 'sent';
    mailboxSelectedId = result.id;
    mailboxComposeReplyTo = null;
    pushActivity(`Mail sent · ${result.postage} currants postage.`);
    emitGameEvent('mail_sent');
    toast('Your letter is on its way.', 2400);
    playSfx('pickup', { volume: 0.38, rate: 1.22 });
    updateHud();
    updateHomeChrome();
    savePlayerState();
    renderMailboxPanel();
  });
  updateCost();
  form.querySelector('textarea')?.focus({ preventScroll: true });
}

function renderMailboxReader(message) {
  const reader = document.getElementById('mail-reader');
  if (!reader) return;
  if (!message) {
    reader.innerHTML = '<div class="mail-empty"><div><strong>No message selected</strong><br/>Choose an envelope, or write a new one.</div></div>';
    return;
  }
  if (!message.outgoing) {
    const wasUnread = !message.read;
    readMail(mailboxState, message.id, Date.now());
    if (wasUnread) savePlayerState();
  }
  const attachment = mailAttachmentLabel(message);
  const canReceive = !message.outgoing && attachment && !message.attachmentsClaimed;
  reader.innerHTML = `
    <p class="mail-message-from">${message.outgoing ? 'To' : 'From'} ${escapeHtml(message.outgoing ? message.recipient : message.sender)}</p>
    <h3 class="mail-message-title">${message.replyTo ? 'Re: ' : ''}${message.outgoing ? 'Sent message' : 'Delivered message'}</h3>
    <time class="mail-message-time">${new Date(message.deliveryAt).toLocaleString()}</time>
    <div class="mail-message-body">${escapeHtml(message.text)}</div>
    ${attachment ? `
      <div class="mail-attachment">
        ${message.attachment ? `<img src="${escapeHtml(ITEM_CATALOG[message.attachment.classTsid]?.icon || `assets/sprites/icons/${message.attachment.classTsid}.png`)}" alt="" />` : '<span class="currant-coin">◎</span>'}
        <div class="mail-attachment-copy">
          <strong>${escapeHtml(attachment)}</strong>
          <span>${message.attachmentsClaimed ? 'Collected' : 'Waiting in this envelope'}</span>
        </div>
        ${canReceive ? '<button type="button" class="btn-glitch-primary" data-mail-receive>Receive</button>' : ''}
      </div>` : ''}
    <div class="mail-message-actions">
      ${!message.outgoing ? `<button type="button" class="btn-glitch-primary" data-mail-reply>Reply</button>
        <button type="button" data-mail-archive>${message.archived ? 'Move to inbox' : 'Archive'}</button>
        <button type="button" data-mail-delete>Delete</button>` : ''}
    </div>
  `;
  reader.querySelector('[data-mail-receive]')?.addEventListener('click', () => {
    const result = receiveMailAttachments(mailboxState, inv, pc, message.id, Date.now());
    if (!result.ok) {
      toast('There is nothing left to receive.');
      return;
    }
    const itemCopy = result.item
      ? `${result.item.count}× ${ITEM_CATALOG[result.item.classTsid]?.label || result.item.classTsid}`
      : '';
    const currantCopy = result.currants ? `◎ ${result.currants}` : '';
    toast(`Received ${[itemCopy, currantCopy].filter(Boolean).join(' and ')}.`);
    pushActivity(`Mailbox delivery collected: ${[itemCopy, currantCopy].filter(Boolean).join(' · ')}`);
    updateHud();
    savePlayerState();
    renderMailboxPanel();
  });
  reader.querySelector('[data-mail-reply]')?.addEventListener('click', () => {
    renderMailboxCompose(message.sender, message.id);
  });
  reader.querySelector('[data-mail-archive]')?.addEventListener('click', () => {
    archiveMail(mailboxState, message.id, !message.archived);
    mailboxSelectedId = null;
    savePlayerState();
    updateHomeChrome();
    renderMailboxPanel();
  });
  reader.querySelector('[data-mail-delete]')?.addEventListener('click', () => {
    deleteMail(mailboxState, message.id);
    mailboxSelectedId = null;
    savePlayerState();
    updateHomeChrome();
    renderMailboxPanel();
  });
  updateHomeChrome();
}

function renderMailboxPanel() {
  const list = document.getElementById('mail-list');
  if (!list) return;
  document.querySelectorAll('[data-mail-folder]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mailFolder === mailboxFolder);
  });
  const rows = mailboxRows();
  if (!rows.some((message) => message.id === mailboxSelectedId)) {
    mailboxSelectedId = rows[0]?.id || null;
  }
  list.innerHTML = rows.length ? '' : '<div class="mail-empty"><div>This folder is pleasingly empty.</div></div>';
  for (const message of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mail-row${message.id === mailboxSelectedId ? ' is-selected' : ''}${!message.read && !message.outgoing ? ' is-unread' : ''}`;
    button.dataset.mailId = message.id;
    const party = message.outgoing ? message.recipient : message.sender;
    button.innerHTML = `
      <span class="mail-row-dot"></span>
      <span class="mail-row-copy"><strong>${escapeHtml(party)}</strong><span>${escapeHtml(message.text)}</span></span>
      <time>${mailWhen(message.deliveryAt)}</time>
    `;
    button.addEventListener('click', () => {
      mailboxSelectedId = message.id;
      renderMailboxPanel();
    });
    list.appendChild(button);
  }
  if (!mailboxComposeReplyTo) {
    const selected = rows.find((message) => message.id === mailboxSelectedId) || null;
    renderMailboxReader(selected);
  }
  updateHomeChrome();
}

function openMailboxPanel() {
  if (!homeState.owned) {
    openHomePanel();
    toast('A mailbox comes with your home deed.');
    return;
  }
  seedMailbox(mailboxState, Date.now());
  closeHomePanel();
  closeMap();
  closePackPopover();
  mailboxFolder = 'inbox';
  mailboxComposeReplyTo = null;
  renderMailboxPanel();
  const panel = document.getElementById('mail-panel');
  if (panel) panel.hidden = false;
  if (homeMailboxTarget?.sprite) {
    homeMailboxTarget.sprite.scale.set(1.05, 0.94);
    setTimeout(() => {
      if (homeMailboxTarget?.sprite && !homeMailboxTarget.sprite.destroyed) {
        homeMailboxTarget.sprite.scale.set(1, 1);
      }
    }, 180);
  }
}

function drawHomeBackground(styleId, room) {
  const style = HOME_STYLES[styleId] || HOME_STYLES.meadow;
  const colors = {
    meadow: { sky: 0xa8d8eb, ground: 0x72b65e, dark: 0x3e7e48, wall: 0xf2d7a0 },
    firebog: { sky: 0x725a76, ground: 0x9f5d4d, dark: 0x5e3b4e, wall: 0xd99b72 },
    uralia: { sky: 0x786b9b, ground: 0x6d7267, dark: 0x454453, wall: 0xc2afc9 },
  }[style.id];
  const container = new PIXI.Container();
  container.worldH = cameraWorldHeightForGround(
    VIEW_H,
    620,
    LOCATION_VIEW_H
  );
  const art = new PIXI.Graphics();
  if (room === 'interior') {
    art.beginFill(colors.wall).drawRect(0, 0, 1500, 620).endFill();
    art.beginFill(0xf8eac8, 0.28);
    for (let x = 0; x < 1500; x += 160) art.drawRect(x, 0, 5, 620);
    art.endFill();
    art.beginFill(colors.dark).drawRect(0, 620, 1500, 140).endFill();
    art.beginFill(0xffffff, 0.28).drawEllipse(750, 180, 520, 140).endFill();
  } else {
    art.beginFill(colors.sky).drawRect(0, 0, 1500, 620).endFill();
    art.beginFill(0xffffff, 0.55).drawEllipse(180, 120, 190, 58).endFill();
    art.beginFill(0xffffff, 0.38).drawEllipse(1180, 165, 250, 72).endFill();
    art.beginFill(colors.ground).drawRect(0, 520, 1500, 240).endFill();
    art.beginFill(colors.dark, 0.7).drawEllipse(760, 600, 1200, 100).endFill();
  }
  container.addChild(art);
  if (room !== 'interior') {
    const houseAsset = {
      meadow: { path: 'assets/decos/groddle/house_orange_front_01.png', width: 852 },
      firebog: { path: 'assets/decos/groddle/k03_gingerbreadhouse_01.png', width: 1180 },
      uralia: { path: 'assets/decos/groddle/cl2_housePurple_back_01.png', width: 320 },
    }[style.id];
    const house = PIXI.Sprite.from(houseAsset.path);
    house.anchor.set(0.5, 1);
    house.x = 1020;
    house.y = 620;
    house.scale.set(Math.min((style.id === 'uralia' ? 540 : 650) / houseAsset.width, 1));
    house.alpha = 0.98;
    container.addChild(house);
  }
  container.platformsScreen = [{ id: 'home-ground', x1: 0, y1: 620, x2: 1500, y2: 620, pc_perm: 1 }];
  return container;
}

function makeHomeDoorSprite(room) {
  const asset = {
    meadow: { path: 'assets/decos/groddle/door_asset_house_large_01.png', height: 668 },
    firebog: { path: 'assets/decos/groddle/door_asset_house_large_05.png', height: 668 },
    uralia: { path: 'assets/decos/groddle/door_asset_house_medium_03.png', height: 586 },
  }[homeState.style] || { path: 'assets/decos/groddle/door_asset_house_large_01.png', height: 668 };
  const sprite = PIXI.Sprite.from(asset.path);
  sprite.anchor.set(0.5, 1);
  sprite.x = room === 'interior' ? 1220 : 1000;
  sprite.y = GROUND_Y;
  sprite.scale.set((room === 'interior' ? 240 : 190) / asset.height);
  sprite.zIndex = 25;
  entityLayer.addChild(sprite);
  return sprite;
}

function makeHomeReturnSprite() {
  const marker = new PIXI.Container();
  marker.x = 115;
  marker.y = GROUND_Y;
  marker.zIndex = 20;
  const pole = new PIXI.Graphics();
  pole.beginFill(0x70455b).drawRoundedRect(-7, -142, 14, 142, 6).endFill();
  pole.beginFill(0xf2d76d).drawRoundedRect(-64, -145, 128, 46, 14).endFill();
  marker.addChild(pole);
  const label = new PIXI.Text('Return to Ur', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 15,
    fontWeight: '700',
    fill: 0x563f59,
  });
  label.anchor.set(0.5);
  label.y = -122;
  marker.addChild(label);
  entityLayer.addChild(marker);
  return marker;
}

function spawnHomeSceneTargets(room) {
  homeMailboxTarget = null;
  homeDoorTarget = null;
  homeReturnTarget = null;
  if (room === 'street') {
    const unread = unreadMailCount(mailboxState, Date.now());
    const mailbox = PIXI.Sprite.from(unread > 0
      ? 'assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_has_mail_idle_png_1354832230.png'
      : 'assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_idle_png_1354832227.png');
    mailbox.anchor.set(0.5, 1);
    mailbox.x = 430;
    mailbox.y = GROUND_Y;
    mailbox.zIndex = 30;
    entityLayer.addChild(mailbox);
    homeMailboxTarget = register({
      classId: 'npc_mailbox',
      label: 'Mailbox (1)',
      subtitle: unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Your very own mail',
      sprite: mailbox,
      state: { unread },
    });
    const door = makeHomeDoorSprite(room);
    homeDoorTarget = register({
      classId: 'home_door',
      label: 'Your House',
      subtitle: 'The indoor half of home',
      sprite: door,
      state: { room: 'street' },
    });
    const marker = makeHomeReturnSprite();
    homeReturnTarget = register({
      classId: 'home_return_marker',
      label: 'World Gate',
      subtitle: `Back to ${homeState.returnLocation?.label || 'the world'}`,
      sprite: marker,
      state: { returnLabel: homeState.returnLocation?.label || '' },
    });
  } else {
    const door = makeHomeDoorSprite(room);
    homeDoorTarget = register({
      classId: 'home_door',
      label: 'Front Door',
      subtitle: 'Back to your home street and mailbox',
      sprite: door,
      state: { room: 'interior' },
    });
    const rug = new PIXI.Graphics();
    rug.beginFill(0x9e5d7b, 0.8).drawEllipse(650, GROUND_Y + 2, 310, 42).endFill();
    rug.zIndex = 1;
    entityLayer.addChildAt(rug, 0);
  }
}

async function renderHomeScene(room = homeState.room || 'street', opts = {}) {
  const targetTsid = room === 'interior' ? HOME_INTERIOR_TSID : HOME_STREET_TSID;
  clearWorldEntities();
  if (bgLayer && world) {
    world.removeChild(bgLayer);
    bgLayer.destroy({ children: true });
  }
  WORLD_W = 1500;
  GROUND_Y = 620;
  bgLayer = drawHomeBackground(homeState.style, room);
  world.addChildAt(bgLayer, 0);
  streetPlatforms = bgLayer.platformsScreen;
  streetWalls = [];
  climb = { active: false, wall: null };
  currentStreetTsid = targetTsid;
  currentStreet = {
    tsid: targetTsid,
    label: room === 'interior' ? 'Your House' : 'Your Home Street',
    hubId: 'home',
    hubName: 'Home',
    bounds: { l: 0, r: WORLD_W, t: 0, b: VIEW_H },
    platforms: streetPlatforms,
    signposts: [],
  };
  spawnHomeSceneTargets(room);
  if (player) {
    player.x = Number.isFinite(opts.spawnX) ? opts.spawnX : room === 'interior' ? 1030 : 250;
    player.y = GROUND_Y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
  }
  camTarget = cameraTargetForPlayer(player?.x || 250);
  camY = cameraTargetY(player?.y || GROUND_Y, activeCameraWorldHeight(), LOCATION_VIEW_H);
  world.x = -Math.round(camTarget);
  world.y = -Math.round(camY);
  const name = document.getElementById('street-name');
  if (name) {
    name.textContent = `${currentStreet.label} · ${HOME_STYLES[homeState.style]?.label || 'Meadow'} Home`;
    name.dataset.tsid = targetTsid;
  }
  if (app?.view) app.view.dataset.homeScene = room;
  updateHomeChrome();
  updateHud();
  return currentStreet;
}

async function showLocationTransition({
  fromLabel = '',
  fromHub = '',
  toLabel = '',
  toHub = '',
  load,
} = {}) {
  const el = document.getElementById('screen-transition');
  if (!el) return load?.();
  let result = null;
  await runStreetTransition(el, {
    fromLabel,
    fromHub,
    toLabel,
    toHub,
    onMid: async () => {
      result = await load?.();
    },
  });
  return result;
}

async function teleportHome() {
  if (!homeState.owned) {
    openHomePanel();
    return { ok: false, reason: 'not_owned' };
  }
  if (homeIsInstanced()) return { ok: false, reason: 'already_home' };
  if (
    greedyStreetIsInstanced() || legalizeIsInstanced() || summersDayIsInstanced() ||
    deEmbiggenifyIsInstanced() || rookWoodsIsInstanced() || winterWalkIsInstanced() ||
    fourLetterIsInstanced() || paradiseIsInstanced()
  ) {
    toast('Finish or leave this instance before teleporting home.');
    return { ok: false, reason: 'instance' };
  }
  const source = {
    tsid: currentStreetTsid,
    label: currentStreet?.label || currentStreetTsid,
    hubName: currentStreet?.hubName || '',
    x: player?.x,
    y: player?.y,
  };
  const result = beginHomeVisit(homeState, source);
  if (!result.ok) return result;
  closeHomePanel();
  closeMap();
  closeVerbMenu();
  await showLocationTransition({
    fromLabel: source.label,
    fromHub: source.hubName,
    toLabel: 'Your Home Street',
    toHub: `${HOME_STYLES[homeState.style]?.label || 'Meadow'} Home`,
    load: () => renderHomeScene('street'),
  });
  pushActivity(`Teleported home from ${source.label}.`);
  toast('Welcome home. Your mailbox is waiting.', 3000);
  savePlayerState();
  return result;
}

async function switchHomeRoom(room) {
  if (!homeIsInstanced()) return false;
  const result = room === 'interior'
    ? enterHomeInterior(homeState)
    : leaveHomeInterior(homeState);
  if (!result.ok) return false;
  await showLocationTransition({
    fromLabel: currentStreet?.label || 'Home',
    fromHub: 'Home',
    toLabel: result.label,
    toHub: 'Home',
    load: () => renderHomeScene(room, { spawnX: room === 'interior' ? 1030 : 910 }),
  });
  savePlayerState();
  return true;
}

async function returnFromHome() {
  if (!homeIsInstanced()) return false;
  const result = endHomeVisit(homeState);
  if (!result.ok) return false;
  const destination = result.returnLocation || {
    tsid: STREET_INDEX.default,
    label: STREET_INDEX.streets?.[STREET_INDEX.default]?.label || 'Groddle',
    hubName: '',
  };
  closeHomePanel();
  closeMailboxPanel();
  await enterStreetWithTransition(destination.tsid, {
    spawnX: destination.x,
    spawnY: destination.y,
    quiet: true,
  });
  pushActivity(`Returned from home to ${currentStreet?.label || destination.label}.`);
  toast('Back in Ur.', 2200);
  savePlayerState();
  savePlayerLocation({ tsid: destination.tsid, x: player?.x, y: player?.y });
  return true;
}

function handleHomeTarget(target, verbId) {
  if (target?.classId === 'npc_mailbox' && verbId === 'view_inbox') {
    openMailboxPanel();
    return true;
  }
  if (target?.classId === 'home_door') {
    if (verbId === 'enter_house') switchHomeRoom('interior');
    else if (verbId === 'leave_house') switchHomeRoom('street');
    return true;
  }
  if (target?.classId === 'home_return_marker' && verbId === 'return_to_world') {
    returnFromHome();
    return true;
  }
  return false;
}

function clearWorldEntities() {
  cancelCurrentAction({ quiet: true });
  clearHoverGlow();
  clearSignpostBoardHover();
  recentInteractionTarget = null;
  recentInteractionUntil = 0;
  clearSpeechBubbles();
  for (const spr of [...entityLayer.children]) {
    if (spr === player) continue;
    entityLayer.removeChild(spr);
  }
  features.streetClear(engine);
  if (entityLayer) entityLayer.filters = null;
  interactables = [];
  piggies = [];
  chickens = [];
  apples = [];
  worldMusicblocks = [];
  droppedItemSprites = [];
  quoins = [];
  butterflies = [];
  trees = [];
  localCompanions = [];
  if (app?.view) {
    app.view.dataset.localCompanionCount = '0';
    app.view.dataset.localCompanionNames = '';
    app.view.dataset.localCompanionPositions = '';
    app.view.dataset.localCompanionSpeaker = '';
    app.view.dataset.localCompanionSpeech = '';
  }
  // Unregister plot interactables with gardens
  for (const g of gardens) {
    for (const pt of g.state?.plotTargets || []) {
      // interactables cleared en masse below
    }
  }
  gardens = [];
  mineRocks = [];
  activeGarden = null;
  activeShrineTarget = null;
  spinningWheelTarget = null;
  spinningWheelLastPhase = '';
  spinningWheelPrompted = false;
  stootDollTarget = null;
  phantomTarget = null;
  if (hogHaulCarrySprite?.parent) hogHaulCarrySprite.parent.removeChild(hogHaulCarrySprite);
  if (hogHaulCarrySprite && !hogHaulCarrySprite.destroyed) hogHaulCarrySprite.destroy();
  hogHaulBaits = [];
  hogHaulPigTargets = [];
  hogHaulPenTarget = null;
  hogHaulCarrySprite = null;
  hogHaulRivalSprite = null;
  hogHaulRivalWaypoints = [];
  hogHaulRivalWaypointIndex = 0;
  fourLetterTargets = [];
  fourLetterMrBlock = null;
  ilmenskieTarget = null;
  clearWinterAtmosphere();
  winterWalkMotes = [];
  winterWalkPortal = null;
  summersDayCheckpoints = [];
  summersDayPlatforms = [];
  summersDayBonusQuoins = [];
  summersDayExit = null;
  summersDayWaterLine = null;
  rookCrushers = [];
  rookEggTarget = null;
  rookHitFx = null;
  paradisePickups = [];
  paradiseRings = [];
  paradiseExit = null;
  paradiseBackdropStars = [];
  homeMailboxTarget = null;
  homeDoorTarget = null;
  homeReturnTarget = null;
  const fourLetterHud = document.getElementById('four-letter-hud');
  if (fourLetterHud) fourLetterHud.hidden = true;
  const legalizeHud = document.getElementById('legalize-hud');
  if (legalizeHud) legalizeHud.hidden = true;
  const paradiseHud = document.getElementById('paradise-flight-hud');
  if (paradiseHud) paradiseHud.hidden = true;
  const summersDayHud = document.getElementById('summers-day-hud');
  if (summersDayHud) summersDayHud.hidden = true;
  const greedyStreetHud = document.getElementById('greedy-street-hud');
  if (greedyStreetHud) greedyStreetHud.hidden = true;
  const rookHud = document.getElementById('rook-woods-hud');
  if (rookHud) rookHud.hidden = true;
  const rookMuseumHud = document.getElementById('rook-museum-hud');
  if (rookMuseumHud) rookMuseumHud.hidden = true;
  const deEmbiggenifyHud = document.getElementById('de-embiggenify-hud');
  if (deEmbiggenifyHud) deEmbiggenifyHud.hidden = true;
  closeShrinePanel();
  portalSprites = [];
  closeGardenPanel();
}

/**
 * Load original street geometry + multi-layer decos.
 * @param {string} tsid
 * @param {{ spawnX?: number, spawnY?: number, quiet?: boolean }} [opts]
 */
async function enterStreet(tsid, opts = {}) {
  const firstVisit = !persistentWorldState.streets?.[tsid];
  if (!opts.bypassFeatureGates) {
    const redirect = features.enterGate(tsid, engine);
    if (redirect?.tsid && redirect.tsid !== tsid) {
      return enterStreet(resolveIndexTsid(redirect.tsid) || redirect.tsid, {
        ...opts,
        spawnX: redirect.spawnX,
        spawnY: redirect.spawnY,
        bypassFeatureGates: true,
      });
    }
  }
  if (featState.nextStep !== 1) {
    resetIncantationChain(featState);
    assistedFeatChain = null;
    clearFeatCompanionTimers();
  }
  const data = await loadStreetData(tsid);
  assertStreetGeometry(data);
  if (LAST_FEAT_STREET_LABELS[data.tsid]) {
    // The archived XML carries its internal template label; production map
    // data and the supplied recording preserve these public Roobrik names.
    data.label = LAST_FEAT_STREET_LABELS[data.tsid];
  }
  if (data.tsid === STOOT_MEMORIAL_STREET_ID) {
    // The archived private street omits its hub label; the supplied loading
    // screen preserves the original Alphermia Prime attribution.
    data.hubName = 'Alphermia Prime';
  }
  features.prepareStreet(data, engine);
  currentStreet = data;
  currentStreetTsid = data.tsid;
  WORLD_W = streetWidth(data);
  clearWorldEntities();

  if (bgLayer && world) {
    world.removeChild(bgLayer);
    bgLayer.destroy({ children: true });
  }
  const available = await loadDecoManifest();
  await loadSignpostTextures(PIXI);
  bgLayer = buildStreetView(data, PIXI, {
    renderer: app.renderer,
    available,
    cameraBottomPadding: cameraBottomSlack(LOCATION_VIEW_H),
  });
  streetPlatforms = bgLayer.platformsScreen;
  streetWalls = wallsScreen(data);
  if (entityLayer) {
    if (bgLayer.middlegroundMatrix) {
      const middlegroundColour = new PIXI.ColorMatrixFilter();
      middlegroundColour.matrix = bgLayer.middlegroundMatrix;
      entityLayer.filters = [middlegroundColour];
    } else {
      entityLayer.filters = null;
    }
  }
  climb = { active: false, wall: null };
  Object.assign(jumpState, createJumpState(movementNow()));
  // Ground reference = median of lower platforms
  const ys = streetPlatforms.map((p) => (p.y1 + p.y2) / 2).sort((a, b) => a - b);
  GROUND_Y = ys[Math.floor(ys.length * 0.75)] || streetPlatforms[0]?.y1 || 800;
  world.addChildAt(bgLayer, 0);

  // Tiny Speck's late-game location objects retain each street's real item
  // population. Allocate all of it in one pass so independent systems never
  // reuse the same handful of platform points or bury the arrival spot.
  const ecologyEntry = features.ecologyOverride(data, engine) || ecologyForStreet(data.tsid);
  currentStreetPopulation = populationForStreet(data.tsid, ecologyEntry, {
    starter: data.tsid === STREET_INDEX.default,
  });
  if (currentStreetPopulation.giantId) {
    data.officialGiantId = currentStreetPopulation.giantId;
  }
  activeVendor = selectVendorProfile(
    currentStreetTsid,
    new URLSearchParams(location.search).get('vendor') || '',
    {
      rocks: currentStreetPopulation.rockClasses.length,
      store: STREET_INDEX.streets?.[currentStreetTsid]?.store,
    }
  );
  const reserved = (data.signposts || []).map((signpost, index) => {
    const point = worldToScreen(data, signpost.x, signpost.y);
    return { ...point, key: `signpost:${index}`, clearance: 100 };
  });
  if (Number.isFinite(opts.spawnX) && Number.isFinite(opts.spawnY)) {
    reserved.push({ x: opts.spawnX, y: opts.spawnY, key: 'saved-arrival', clearance: 210 });
  }
  currentStreetPlacement = planStreetPlacements(
    streetPlatforms,
    [
      { key: 'player', count: 1, clearance: 190 },
      { key: 'trees', count: currentStreetPopulation.treeClasses.length, clearance: 135 },
      { key: 'gardens', count: currentStreetPopulation.gardens, clearance: 165 },
      { key: 'vendor', count: currentStreetPopulation.vendor ? 1 : 0, clearance: 120 },
      { key: 'shrine', count: currentStreetPopulation.shrine ? 1 : 0, clearance: 135 },
      { key: 'rocks', count: currentStreetPopulation.rockClasses.length, clearance: 74 },
      { key: 'piggies', count: currentStreetPopulation.piggies, clearance: 92 },
      { key: 'chickens', count: currentStreetPopulation.chickens, clearance: 86 },
      { key: 'butterflies', count: currentStreetPopulation.butterflies, clearance: 62 },
      { key: 'flyingButterflies', count: currentStreetPopulation.flyingButterflies, clearance: 58 },
      { key: 'apples', count: currentStreetPopulation.apples, clearance: 30 },
      { key: 'musicblocks', count: currentStreetPopulation.musicblocks, clearance: 45 },
      { key: 'quoins', count: currentStreetPopulation.quoins, clearance: 28 },
      ...features.collect('placementGroups', currentStreetPopulation, data, engine),
    ],
    { worldW: WORLD_W, seed: data.tsid, reserved }
  );
  const placement = (key) => currentStreetPlacement.groups[key] || [];

  // Place living content on its reserved real-platform anchors.
  const pigPoints = placement('piggies');
  piggies = spawnPiggies(pigPoints.map((p) => p.x));
  piggies.forEach((spr, i) => {
    const p = pigPoints[i];
    if (p) { spr.x = p.x; spr.y = p.y + 2; spr.baseX = p.x; }
  });
  const chickenPoints = placement('chickens');
  chickens = spawnChickens(chickenPoints.map((p) => p.x));
  chickens.forEach((spr, i) => {
    const p = chickenPoints[i];
    if (p) { spr.x = p.x; spr.y = p.y + 2; spr.baseX = p.x; }
  });
  const butterflyPoints = placement('butterflies');
  butterflies = spawnButterflies(
    butterflyPoints.map((p) => p.x),
    placement('flyingButterflies')
  );
  // Only snap resting (path) butterflies to platforms — leave flyers in the air.
  let restIdx = 0;
  butterflies.forEach((spr) => {
    if (spr._ambient) return;
    const p = butterflyPoints[restIdx];
    restIdx += 1;
    if (p) {
      spr.x = p.x;
      spr.y = p.y + 2;
      spr._groundY = p.y;
    }
  });
  const applePoints = placement('apples');
  apples = spawnApples(applePoints.map((p) => p.x));
  apples.forEach((spr) => {
    const p = applePoints[spr._naturalIndex || 0];
    if (p) { spr.x = p.x; spr.y = p.y + 2; }
  });
  worldMusicblocks = spawnMusicblockDrop(placement('musicblocks')[0], true);
  const treeSpots = placement('trees').map((point, index) => ({
    x: point.x,
    y: point.y,
    classId: currentStreetPopulation.treeClasses[index],
  }));
  trees = spawnTrees(treeSpots);
  // Animated official eight-scene quoins placed along reachable platforms.
  quoins = spawnQuoins(placement('quoins'));

  // Signposts are manually hit-tested by individual destination board.
  portalSprites = bgLayer.signViews || [];
  if (currentStreetPopulation.vendor) spawnVendorNpc(placement('vendor')[0]);
  if (currentStreetPopulation.shrine) await spawnShrine(placement('shrine')[0]);
  refreshDroppedWorldItems();
  placement('gardens').forEach((point, index) => {
    spawnGarden({
      x: point.x,
      y: point.y + 2,
      cols: index === 0 ? 4 : 3,
      rows: 2,
      gardenType: index === 0 ? 'default' : 'herb',
    });
  });
  spawnMineRocks(currentStreetPopulation.rockClasses, placement('rocks'));

  if (player) {
    const spawn = placement('player')[0];
    const sourceSpawnX =
      data.tsid === STOOT_MEMORIAL_STREET_ID ? WORLD_W * 0.72 : spawn?.x;
    player.x = opts.spawnX ?? sourceSpawnX ?? WORLD_W * 0.5;
    player.y = opts.spawnY ?? spawn?.y ?? GROUND_Y;
    // Clamp saved/spawn coords into street bounds
    player.x = clamp(player.x, 40, Math.max(80, WORLD_W - 40));
    const streetH = bgLayer?.worldH || VIEW_H;
    player.y = clamp(player.y, 40, Math.max(80, streetH - 20));
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    noteGrounded(jumpState, true, movementNow());
  }
  const summerStory = ensureSummersDayStory(questState);
  if (
    player &&
    summerStory.pendingQurazies > 0 &&
    summerStory.qurazyStreetTsid === currentStreetTsid
  ) {
    const rewardPoints = summersDayQurazyPoints(player);
    for (let index = 0; index < summerStory.pendingQurazies; index += 1) {
      quoins.push(
        spawnWorldQuoin(rewardPoints[index], 'qurazy', {
          useExactY: true,
          phaseIndex: index,
          summersDayRewardIndex: index,
        })
      );
    }
  }
  if (data.tsid === STOOT_MEMORIAL_STREET_ID) spawnStootMemorial();
  if (currentStreetPopulation.companions !== false) {
    spawnLocalCompanions();
    countCompanionFollowStreet(data.tsid);
  } else {
    stopCompanionFollowForInstance();
  }
  spawnPhantomQuestEncounter();
  spawnIlmenskieJones();
  features.streetEnter(data, engine, opts);
  if (firstVisit) emitGameEvent(`street_first_visit:${data.tsid}`);
  emitGameEvent(`street_entered:${String(data.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`);
  if (app?.view) {
    const pop = currentStreetPopulation;
    app.view.dataset.ecologySource = pop.source;
    app.view.dataset.ecologySourceTsid = pop.sourceTsid || '';
    app.view.dataset.ecologyOfficialGiant = pop.giantId || '';
    app.view.dataset.ecologyPopulation = [
      `piggies=${pop.piggies}`,
      `chickens=${pop.chickens}`,
      `butterflies=${pop.butterflies + pop.flyingButterflies}`,
      `trees=${pop.treeClasses.length}`,
      `rocks=${pop.rockClasses.length}`,
      `gardens=${pop.gardens}`,
      `vendor=${Number(pop.vendor)}`,
      `shrine=${Number(pop.shrine)}`,
    ].join(',');
    const gap = nearestPlacementGap(currentStreetPlacement, 'player');
    app.view.dataset.ecologyPlayerClearance = Number.isFinite(gap) ? String(Math.round(gap)) : 'none';
    app.view.dataset.ecologyCandidates = String(currentStreetPlacement.candidateCount);
  }
  camTarget = cameraTargetForPlayer(player.x);
  const streetH = activeCameraWorldHeight();
  camY = cameraTargetY(player.y, streetH, LOCATION_VIEW_H);
  world.x = -Math.round(camTarget);
  world.y = -Math.round(camY);
  updateHud();
  // Street nameplate
  const nameEl = document.getElementById('street-name');
  if (nameEl) {
    const winterLabel = winterLocationLabel(data.tsid);
    const stootLabel = data.tsid === STOOT_MEMORIAL_STREET_ID
      ? { street: 'unnnn', hub: 'Alphermia Prime' }
      : null;
    const streetLabel = winterLabel?.street || stootLabel?.street ||
      (data.tsid === AXIS_DENYDE_STREET_ID ? 'Axis Denyde' : data.label);
    const hubLabel = winterLabel?.hub || stootLabel?.hub ||
      (data.tsid === AXIS_DENYDE_STREET_ID ? 'Pollokoo' : data.hubName);
    nameEl.textContent = hubLabel ? `${streetLabel} · ${hubLabel}` : streetLabel;
    nameEl.dataset.tsid = data.tsid;
  }
  // Hub-tuned ambient BGM (GSJS ambient_hub_map → ambient_library)
  if (state.started && audio.ctx) {
    const prevTheme = ambientThemeId;
    setAmbientForStreet(data);
    if (!opts.quiet && ambientThemeId !== prevTheme) {
      pushActivity(`Music: ${themeLabel(ambientThemeId)}`);
    }
  }
  if (!opts.quiet) toast(`Arrived: ${data.label}`, 2800);
  // Auto-save map location after every successful street enter
  if (player) savePlayerLocation({ tsid: data.tsid, x: player.x, y: player.y });
  return data;
}

/**
 * Shared travel entry used by map click, T key, and signpost click.
 * Full-screen crossfade modeled on LoadingLocationView.
 * @param {string} toTsid
 * @param {{ label?: string }} [meta]
 */
async function travelTo(toTsid, meta = {}) {
  const featureGate = features.travelGate(toTsid, engine);
  if (!featureGate.ok) {
    toast(featureGate.msg || 'You cannot travel there right now.');
    return { ok: false, reason: 'feature_gate' };
  }
  if (homeIsInstanced()) {
    toast('Use the World Gate to return from home.');
    return { ok: false, reason: 'home_instance' };
  }
  if (greedyStreetIsInstanced()) {
    toast('Storyland has no map routes. Finish all five acts or use Leave.');
    return { ok: false, reason: 'greedy_story_instance' };
  }
  if (legalizeIsInstanced()) {
    toast('This application has no map routes. Finish the bureaucracy or use Leave.');
    return { ok: false, reason: 'legalize_instance' };
  }
  if (summersDayIsInstanced()) {
    toast('The Giants’ shared memory has no map routes. Find the way home or use Leave.');
    return { ok: false, reason: 'summers_day_instance' };
  }
  if (deEmbiggenifyIsInstanced()) {
    toast('The catalogue page has no map routes. Finish the search or use Leave.');
    return { ok: false, reason: 'eesti_instance' };
  }
  if (rookWoodsIsInstanced()) {
    toast("The Rooks' Woods have no map routes. Reach the Egg or use Leave.");
    return { ok: false, reason: 'rook_instance' };
  }
  if (winterWalkIsInstanced()) {
    toast('The winter path has no map routes. Follow the motes or use Leave.');
    return { ok: false, reason: 'winter_instance' };
  }
  const plan = planTravel(currentStreetTsid, toTsid, STREET_INDEX.streets);
  if (!plan.ok) {
    if (plan.reason === 'already_here') toast('Already here.');
    else if (plan.reason === 'not_loaded') toast('That street is not loaded yet.');
    else toast('Cannot travel there.');
    return plan;
  }
  closeMap();
  closeVerbMenu();
  closeSkillsPanel();
  closeAchievePanel();
  closeQuestPanel();
  closeBuffsPanel();
  closeMakePanel();
  closeVendor();
  await enterStreetWithTransition(plan.toTsid);
  if (player) floatText(player.x, player.y - 80, '✦ ' + (meta.label || plan.label), 0xc9a0ff);
  pushActivity(`Arrived: ${plan.label || meta.label || plan.toTsid}`);
  return plan;
}

function doTeleport() {
  if (homeIsInstanced()) {
    toast('Use the World Gate to return from home.');
    return;
  }
  if (greedyStreetIsInstanced()) {
    toast('Storyland has no ordinary signposts.');
    return;
  }
  if (legalizeIsInstanced()) {
    toast('The Bureaucratic Hall has no ordinary signposts.');
    return;
  }
  if (summersDayIsInstanced()) {
    toast('There are no ordinary signposts inside this memory.');
    return;
  }
  if (deEmbiggenifyIsInstanced()) {
    toast('Every ordinary signpost is enormous while you are this small.');
    return;
  }
  if (rookWoodsIsInstanced()) {
    toast('Humbaba has sealed every ordinary signpost during the trial.');
    return;
  }
  if (winterWalkIsInstanced()) {
    toast('The cold has frozen every ordinary signpost.');
    return;
  }
  if (!currentStreet) return;
  const plan = planSignpostTravel(
    currentStreet,
    player.x,
    availableStreetTsids(),
    140,
  );
  if (!plan.ok) {
    if (plan.reason === 'no_signpost') {
      toast('No signpost nearby — open Map (G) to teleport, or walk closer to a wooden post.');
    } else if (plan.reason === 'not_loaded') {
      const labels = (plan.labels || []).join(', ');
      toast(labels
        ? `Signpost lists: ${labels}. Open Map (G) for loaded streets.`
        : 'Signpost has no loaded destinations. Open Map (G).');
    }
    return;
  }
  travelTo(plan.toTsid, { label: plan.label });
}

function renderIlmenskieMapCallout(panel) {
  panel?.querySelector('.map-quest-teleport')?.remove();
  if (!panel || !questState.active?.[ILMENSKIE_QUEST_ID]) return;
  const rescue = ilmenskieStory();
  const box = document.createElement('section');
  box.className = 'map-quest-teleport';
  const inCavern = currentStreetTsid === AXIS_DENYDE_STREET_ID;
  const title = document.createElement('strong');
  title.textContent = inCavern ? 'Axis Denyde · Sealed Cavern' : 'Quest teleport · Axis Denyde';
  const copy = document.createElement('span');
  copy.textContent = ilmenskieObjective(rescue, currentStreetTsid);
  box.append(title, copy);
  if (!rescue.releasedJones && (!rescue.pickedUpJones || inCavern)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'content-action-btn';
    if (inCavern && rescue.pickedUpJones) {
      button.textContent = 'Teleport out with Jones';
      button.addEventListener('click', teleportFromAxisDenyde);
    } else if (inCavern) {
      button.textContent = 'Find Jones before leaving';
      button.disabled = true;
    } else {
      button.textContent = 'Teleport to Axis Denyde';
      button.addEventListener('click', teleportToAxisDenyde);
    }
    box.appendChild(button);
  }
  const card = panel.querySelector('.map-card');
  const mapCanvas = panel.querySelector('.map-canvas');
  if (card && mapCanvas) card.insertBefore(box, mapCanvas);
  else card?.appendChild(box);
}

function renderHomeMapCallout(panel) {
  panel?.querySelector('.map-home-card')?.remove();
  if (!panel) return;
  const box = document.createElement('section');
  box.className = 'map-home-card';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  const detail = document.createElement('span');
  const unread = unreadMailCount(mailboxState, Date.now());
  if (homeState.owned) {
    const style = HOME_STYLES[homeState.style] || HOME_STYLES.meadow;
    title.textContent = `Your ${style.label} home`;
    detail.textContent = unread
      ? `${unread} unread mail · remembers where to return`
      : 'Your mailbox is quiet · remembers where to return';
  } else {
    title.textContent = 'A place of your own';
    detail.textContent = `Home deed · ${HOME_PURCHASE_COST.toLocaleString()} currants`;
  }
  copy.append(title, detail);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'content-action-btn';
  button.textContent = homeState.owned ? 'Teleport home' : 'View homes';
  button.addEventListener('click', () => {
    closeMap();
    if (homeState.owned) teleportHome();
    else openHomePanel();
  });
  box.append(copy, button);
  const card = panel.querySelector('.map-card');
  const mapCanvas = panel.querySelector('.map-canvas');
  if (card && mapCanvas) card.insertBefore(box, mapCanvas);
  else card?.appendChild(box);
}

/**
 * @param {string} [hubId]  Open a specific hub map; default = player's hub
 */
async function openMap(hubId) {
  if (homeIsInstanced()) {
    openHomePanel();
    return;
  }
  if (greedyStreetIsInstanced()) {
    toast('Storyland is read, not mapped.');
    return;
  }
  if (summersDayIsInstanced()) {
    toast('A Summer’s Day is remembered, not mapped.');
    return;
  }
  if (deEmbiggenifyIsInstanced()) {
    toast('The map is much too large while you are this small.');
    return;
  }
  if (rookWoodsIsInstanced()) {
    toast("The Rooks' Woods are not drawn on any map.");
    return;
  }
  if (winterWalkIsInstanced()) {
    toast('The winter path is not drawn on any map.');
    return;
  }
  if (fourLetterIsInstanced()) {
    toast('The map is much too large while you are this small.');
    return;
  }
  if (isShrineOpen()) closeShrinePanel();
  const panel = document.getElementById('map-panel');
  const canvas = document.getElementById('map-canvas');
  const title = document.getElementById('map-hub-title');
  const sub = panel?.querySelector('.map-sub');
  const hubSelect = document.getElementById('map-hub-select');
  if (!panel || !canvas) return;
  closeVendor();
  closeQuestPanel();

  const targetHub = String(hubId || mapPanelHubId || playerHubId());
  mapPanelHubId = targetHub;

  let hubData;
  let mapIndex = null;
  try {
    mapIndex = await ensureMapIndex();
    hubData = await loadHubMapData(targetHub);
  } catch (err) {
    console.error(err);
    toast('Could not load hub map data.');
    return;
  }

  // Populate hub dropdown (once per open with fresh index)
  if (hubSelect && mapIndex) {
    const hubs = listHubsFromIndex(mapIndex);
    const prev = hubSelect.value;
    hubSelect.innerHTML = '';
    for (const h of hubs) {
      const opt = document.createElement('option');
      opt.value = h.hubId;
      opt.textContent = `${h.hubName} (${h.streetCount})`;
      if (h.hubId === targetHub) opt.selected = true;
      hubSelect.appendChild(opt);
    }
    if (!hubSelect.dataset.bound) {
      hubSelect.dataset.bound = '1';
      hubSelect.addEventListener('change', () => {
        openMap(hubSelect.value);
      });
    } else if (prev && prev !== targetHub) {
      hubSelect.value = targetHub;
    }
  }

  const view = buildHubMapView(hubData, currentStreetTsid, STREET_INDEX.streets);
  if (title) title.textContent = view.hubName;
  if (sub) {
    const artNote = view.bgLocal ? 'painted bg' : 'geometry only';
    const loadedN = view.streets.filter((s) => s.loaded).length;
    sub.textContent =
      `${view.streets.length} streets · ${loadedN} playable here · ${artNote} · yellow = travel · red star = you`;
  }

  canvas.innerHTML = renderHubMapSvg(view);

  canvas.querySelectorAll('.map-street.travelable').forEach((g) => {
    g.addEventListener('click', () => {
      const tsid = g.getAttribute('data-tsid');
      const label = g.getAttribute('data-label') || tsid;
      const plan = mapClickTravel(currentStreetTsid, tsid, STREET_INDEX.streets);
      if (!plan.ok) {
        if (plan.reason === 'already_here') toast('You are already here.');
        else if (plan.reason === 'not_loaded') toast(`${label} is not loaded in this demo.`);
        else toast('Cannot travel there.');
        return;
      }
      closeMap();
      travelTo(plan.toTsid, { label: plan.label || label });
    });
  });

  canvas.querySelectorAll('.map-street.current').forEach((g) => {
    g.addEventListener('click', () => toast('You are already here.'));
  });

  canvas.querySelectorAll('.map-hub-go').forEach((g) => {
    g.addEventListener('click', () => {
      const nextHub = g.getAttribute('data-hub');
      const label = g.getAttribute('data-label') || 'that hub';
      if (nextHub && mapIndex?.hubs?.[nextHub]?.streetCount > 0) {
        openMap(nextHub);
        toast(`Viewing ${label.replace(/^To:\s*/i, '')} map (explore only).`);
      } else {
        toast(`${label} — no map data for that hub.`);
      }
    });
  });

  canvas.querySelectorAll('line.map-seg.dim').forEach((line) => {
    line.style.cursor = 'default';
    line.addEventListener('click', () => {
      const name = line.getAttribute('data-name') || 'Street';
      toast(`${name} — map only (street not loaded in this demo).`);
    });
  });

  renderIlmenskieMapCallout(panel);
  renderHomeMapCallout(panel);
  panel.hidden = false;
}

function closeMap() {
  const panel = document.getElementById('map-panel');
  if (panel) panel.hidden = true;
}

function isMapOpen() {
  const panel = document.getElementById('map-panel');
  return panel && !panel.hidden;
}

function closeContentPanels() {
  closeQuestPanel();
  closeAchievePanel();
  closeFeatPanel();
  closeSkillsPanel();
  closeBuffsPanel();
  closeVendor();
}

function openQuestPanel() {
  if (greedyStreetIsInstanced()) {
    toast('Finish the bedtime story before taking another quest.');
    return;
  }
  if (isShrineOpen()) closeShrinePanel();
  closeMap();
  closeAchievePanel();
  closeFeatPanel();
  closeSkillsPanel();
  closeBuffsPanel();
  closeVendor();
  const panel = document.getElementById('quest-panel');
  if (panel) {
    updateHud();
    panel.hidden = false;
  }
}

const STORY_QUEST_IDS = [
  LEGALIZE_QUEST_ID,
  ILMENSKIE_QUEST_ID,
  DE_EMBIGGENIFY_QUEST_ID,
  WINTER_WALK_QUEST_ID,
  WINTER_WALK_REPEAT_QUEST_ID,
  SUMMERS_DAY_QUEST_ID,
  SUMMERS_DAY_REPEAT_QUEST_ID,
  FOUR_LETTER_QUEST_ID,
  ROOK_QUEST_ID,
  ROOK_HALL_START_QUEST_ID,
  HOG_HAUL_QUEST_ID,
  PHANTOM_QUEST_ID,
  REMEMBER_QUEST_ID,
];
const STORY_ACCEPT_LABELS = {
  [GREEDY_STREET_SPIRIT_QUEST_ID]: 'Read me the story.',
  [GREEDY_STREET_SPIRIT_REPEAT_ID]: 'Let’s reminisce.',
  [LEGALIZE_QUEST_ID]: 'Sounds complicated.',
  [ILMENSKIE_QUEST_ID]: 'I’ll find him.',
  [DE_EMBIGGENIFY_QUEST_ID]: 'Shrink me down.',
  [WINTER_WALK_QUEST_ID]: 'Take me there.',
  [WINTER_WALK_REPEAT_QUEST_ID]: 'Back into the snow!',
  [SUMMERS_DAY_QUEST_ID]: 'Take me to the memory.',
  [SUMMERS_DAY_REPEAT_QUEST_ID]: 'Let’s reminisce.',
  [FOUR_LETTER_QUEST_ID]: 'Shrink me down!',
  [ROOK_QUEST_ID]: "Send me into the Rooks' Woods.",
  [ROOK_HALL_START_QUEST_ID]: 'Take me to the museum.',
  [HOG_HAUL_QUEST_ID]: 'Let the Hog Haul begin!',
  [PHANTOM_QUEST_ID]: "Never mind. It's ghost hunting time!",
  [REMEMBER_QUEST_ID]: 'Where did I put that thing?',
};

function canOfferStoryQuest(classTsid) {
  if (questState.active?.[classTsid]) return false;
  if (classTsid === GREEDY_STREET_SPIRIT_QUEST_ID) {
    return canOfferGreedyFirst(questState, pc).ok && !greedyStreetIsInstanced();
  }
  if (classTsid === GREEDY_STREET_SPIRIT_REPEAT_ID) {
    const demo = String(new URLSearchParams(location.search).get('questdemo') || '');
    return canOfferGreedyRepeat(questState, Date.now(), {
      bypassCooldown: demo.startsWith('greedy'),
    }).ok && !greedyStreetIsInstanced();
  }
  if (
    classTsid === SUMMERS_DAY_QUEST_ID ||
    classTsid === SUMMERS_DAY_REPEAT_QUEST_ID
  ) {
    const demo = String(new URLSearchParams(location.search).get('questdemo') || '');
    return canOfferSummersDay(questState, {
      repeat: classTsid === SUMMERS_DAY_REPEAT_QUEST_ID,
      bypassCooldown: demo.startsWith('summer'),
    }).ok && !summersDayIsInstanced();
  }
  if (classTsid === DE_EMBIGGENIFY_QUEST_ID) {
    return (
      !questState.completed.includes(DE_EMBIGGENIFY_QUEST_ID) &&
      !questState.completed.includes(DE_EMBIGGENIFY_PART2_QUEST_ID) &&
      !deEmbiggenifyIsInstanced()
    );
  }
  if (classTsid === HOG_HAUL_QUEST_ID) return !hogHaulIsInstanced();
  if (classTsid === ROOK_QUEST_ID) {
    return !questState.completed.includes(ROOK_QUEST_ID) && !rookWoodsIsInstanced();
  }
  if (classTsid === ROOK_HALL_START_QUEST_ID) {
    return (
      !questState.completed.includes(ROOK_HALL_START_QUEST_ID) &&
      !questState.completed.includes(ROOK_HALL_QUEST_ID) &&
      !rookMuseumIsInstanced()
    );
  }
  if (classTsid === WINTER_WALK_REPEAT_QUEST_ID) {
    return questState.completed.includes(WINTER_WALK_QUEST_ID) && !winterWalkIsInstanced();
  }
  if (classTsid === WINTER_WALK_QUEST_ID) {
    return !questState.completed.includes(WINTER_WALK_QUEST_ID) && !winterWalkIsInstanced();
  }
  if (questState.completed.includes(classTsid)) return false;
  if (classTsid === LEGALIZE_QUEST_ID) return !legalizeIsInstanced();
  if (classTsid === REMEMBER_QUEST_ID) {
    return questState.completed.includes(PHANTOM_QUEST_ID) && countItem(inv, FADED_HEART_ID) > 0;
  }
  return (
    classTsid === PHANTOM_QUEST_ID ||
    classTsid === LEGALIZE_QUEST_ID ||
    classTsid === DE_EMBIGGENIFY_QUEST_ID ||
    classTsid === FOUR_LETTER_QUEST_ID ||
    classTsid === ROOK_QUEST_ID ||
    classTsid === ROOK_HALL_START_QUEST_ID ||
    classTsid === ILMENSKIE_QUEST_ID
  );
}

function appendStoryQuestOffers(box) {
  for (const classTsid of STORY_QUEST_IDS) {
    if (!canOfferStoryQuest(classTsid)) continue;
    const def = getQuestCatalog()[classTsid];
    if (!def) continue;
    const card = document.createElement('div');
    card.className = 'q-card story-offer';
    const title = document.createElement('div');
    title.className = 'q-title';
    title.textContent = def.title;
    const desc = document.createElement('div');
    desc.className = 'q-req';
    desc.textContent = cleanQuestMarkup(def.desc);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'content-action-btn';
    button.textContent =
      classTsid === LEGALIZE_QUEST_ID
        ? 'Visit the Back Alley'
      : classTsid === ILMENSKIE_QUEST_ID
        ? 'Hear about the sealed cavern'
      : classTsid === DE_EMBIGGENIFY_QUEST_ID
        ? 'Enter the catalogue page'
      : classTsid === WINTER_WALK_QUEST_ID
        ? 'Feel the cool breeze'
      : classTsid === WINTER_WALK_REPEAT_QUEST_ID
        ? 'Walk again'
      : classTsid === SUMMERS_DAY_QUEST_ID
        ? 'Remember a summer’s day'
      : classTsid === SUMMERS_DAY_REPEAT_QUEST_ID
        ? 'Reminisce again'
      : classTsid === HOG_HAUL_QUEST_ID
        ? questState.completed.includes(HOG_HAUL_QUEST_ID)
          ? 'Race again'
          : 'Join the race'
        : classTsid === FOUR_LETTER_QUEST_ID
          ? 'Meet Mr. Block'
        : classTsid === ROOK_HALL_START_QUEST_ID
          ? 'Visit the Museum of the Rook'
        : classTsid === PHANTOM_QUEST_ID
          ? 'Hear the ghost story'
          : 'Remember again';
    button.addEventListener('click', () => openQuestDialogue(classTsid));
    card.append(title, desc, button);
    box.appendChild(card);
  }
}

function renderQuestDialogueBeat() {
  const modal = document.getElementById('quest-dialogue');
  if (!modal || !questDialogueState) return;
  const { def, beats, index, mode } = questDialogueState;
  const beat = beats[index] || {
    text: cleanQuestMarkup(def?.offer || ''),
    response: '',
  };
  const kicker = document.getElementById('quest-dialogue-kicker');
  const title = document.getElementById('quest-dialogue-title');
  const copy = document.getElementById('quest-dialogue-copy');
  const next = document.getElementById('quest-dialogue-next');
  const cancel = document.getElementById('quest-dialogue-cancel');
  if (kicker) kicker.textContent = questDialogueState.kicker || (mode === 'script' ? 'Conversation' : 'New quest');
  if (title) title.textContent = def?.title || questDialogueState.title || 'Quest';
  if (copy) copy.textContent = beat.text;
  if (next) {
    const finalBeat = index >= beats.length - 1;
    next.textContent =
      mode === 'script'
        ? finalBeat && questDialogueState.primaryLabel
          ? questDialogueState.primaryLabel
          : beat.response || (finalBeat ? 'All right' : 'Continue')
        : finalBeat
          ? STORY_ACCEPT_LABELS[def.classTsid] || 'Accept quest'
          : beat.response || 'Continue';
    next.dataset.accept = mode === 'offer' && finalBeat ? '1' : '0';
  }
  if (cancel) {
    cancel.hidden = mode === 'script' && questDialogueState.cancelable !== true;
    cancel.textContent =
      mode === 'script'
        ? questDialogueState.cancelLabel || 'Close'
        : 'Maybe later';
  }
  modal.hidden = false;
}

function openQuestDialogue(classTsid) {
  const def = getQuestCatalog()[classTsid];
  if (!def || !canOfferStoryQuest(classTsid)) return;
  closeQuestPanel();
  closePackPopover();
  questDialogueState = {
    mode: 'offer',
    def,
    beats: parseQuestConversation(def.offer),
    index: 0,
  };
  renderQuestDialogueBeat();
}

function openScriptedQuestDialogue({
  title,
  kicker = 'Mr. Block',
  beats,
  onComplete,
  onCancel,
  cancelable = false,
  primaryLabel = '',
  cancelLabel = '',
}) {
  closeQuestPanel();
  closePackPopover();
  questDialogueState = {
    mode: 'script',
    title,
    kicker,
    beats: (beats || []).map((beat) =>
      typeof beat === 'string' ? { text: beat, response: 'Continue' } : beat
    ),
    index: 0,
    onComplete,
    onCancel,
    cancelable,
    primaryLabel,
    cancelLabel,
  };
  renderQuestDialogueBeat();
}

function closeQuestDialogue(opts = {}) {
  if (
    questDialogueState?.mode === 'script' &&
    questDialogueState.cancelable !== true &&
    opts.force !== true
  ) {
    return false;
  }
  const onCancel =
    opts.cancel === true && typeof questDialogueState?.onCancel === 'function'
      ? questDialogueState.onCancel
      : null;
  const modal = document.getElementById('quest-dialogue');
  if (modal) modal.hidden = true;
  questDialogueState = null;
  if (onCancel) onCancel();
  return true;
}

function isQuestDialogueOpen() {
  const modal = document.getElementById('quest-dialogue');
  return Boolean(modal && !modal.hidden);
}

function advanceQuestDialogue() {
  if (!questDialogueState) return;
  const { def, beats, mode } = questDialogueState;
  if (questDialogueState.index < beats.length - 1) {
    questDialogueState.index += 1;
    renderQuestDialogueBeat();
    return;
  }
  if (mode === 'script') {
    const onComplete = questDialogueState.onComplete;
    closeQuestDialogue({ force: true });
    if (typeof onComplete === 'function') onComplete();
    return;
  }
  if (def.classTsid === HOG_HAUL_QUEST_ID) {
    questState.completed = questState.completed.filter((id) => id !== HOG_HAUL_QUEST_ID);
  }
  if (def.classTsid === WINTER_WALK_REPEAT_QUEST_ID) {
    questState.completed = questState.completed.filter(
      (id) => id !== WINTER_WALK_REPEAT_QUEST_ID
    );
  }
  if (def.classTsid === SUMMERS_DAY_REPEAT_QUEST_ID) {
    questState.completed = questState.completed.filter(
      (id) => id !== SUMMERS_DAY_REPEAT_QUEST_ID
    );
  }
  if (def.classTsid === GREEDY_STREET_SPIRIT_REPEAT_ID) {
    questState.completed = questState.completed.filter(
      (id) => id !== GREEDY_STREET_SPIRIT_REPEAT_ID
    );
  }
  if (def.classTsid === ROOK_QUEST_ID) {
    const tool = findWorkingRookTool(inv, toolState);
    if (!tool.ok) {
      toast(tool.msg, 4200);
      closeQuestDialogue({ force: true });
      return;
    }
  }
  const result = assignQuest(questState, def.classTsid, {
    ignorePrereq: [
      GREEDY_STREET_SPIRIT_REPEAT_ID,
      WINTER_WALK_QUEST_ID,
      WINTER_WALK_REPEAT_QUEST_ID,
      SUMMERS_DAY_QUEST_ID,
      SUMMERS_DAY_REPEAT_QUEST_ID,
    ].includes(def.classTsid),
  });
  if (!result.ok) {
    toast(result.reason === 'prereq' ? 'Finish the earlier story first.' : 'That quest is unavailable.');
    closeQuestDialogue();
    return;
  }
  if (def.classTsid === PHANTOM_QUEST_ID || def.classTsid === REMEMBER_QUEST_ID) {
    ensureGhostQuestState(questState, availableStreetTsids(), {
      reset: def.classTsid === PHANTOM_QUEST_ID,
    });
  }
  if (def.classTsid === ILMENSKIE_QUEST_ID) {
    const rescue = ensureIlmenskieState(questState);
    rememberIlmenskieSource(rescue, {
      tsid: currentStreetTsid,
      x: player?.x,
      y: player?.y,
    });
  }
  closeQuestDialogue();
  if (
    def.classTsid === SUMMERS_DAY_QUEST_ID ||
    def.classTsid === SUMMERS_DAY_REPEAT_QUEST_ID
  ) {
    markSummersDayOffered(questState);
  }
  playSfx('alert', { volume: 0.65 });
  pushActivity(`New quest: ${def.title}. ${cleanQuestMarkup(def.desc)}`);
  toast(`New quest: ${def.title}`, 3600);
  updateHud();
  if (def.classTsid === ILMENSKIE_QUEST_ID) openMap();
  else if (def.classTsid === LEGALIZE_QUEST_ID) startLegalizeIt();
  else if (def.classTsid === HOG_HAUL_QUEST_ID) startHogHaulRace();
  else if (def.classTsid === GREEDY_STREET_SPIRIT_QUEST_ID) startGreedyStreetSpirit();
  else if (def.classTsid === GREEDY_STREET_SPIRIT_REPEAT_ID) {
    startGreedyStreetSpirit({ repeat: true });
  }
  else if (def.classTsid === WINTER_WALK_QUEST_ID) startWinterWalk();
  else if (def.classTsid === WINTER_WALK_REPEAT_QUEST_ID) startWinterWalk({ repeat: true });
  else if (def.classTsid === SUMMERS_DAY_QUEST_ID) startSummersDay();
  else if (def.classTsid === SUMMERS_DAY_REPEAT_QUEST_ID) startSummersDay({ repeat: true });
  else if (def.classTsid === FOUR_LETTER_QUEST_ID) startFourLetterQuest();
  else if (def.classTsid === DE_EMBIGGENIFY_QUEST_ID) startDeEmbiggenify();
  else if (def.classTsid === ROOK_QUEST_ID) startRookWoodsQuest();
  else if (def.classTsid === ROOK_HALL_START_QUEST_ID) startRookMuseum();
  else spawnPhantomQuestEncounter();
}

function closeQuestPanel() {
  const panel = document.getElementById('quest-panel');
  if (panel) panel.hidden = true;
}

function isQuestOpen() {
  const panel = document.getElementById('quest-panel');
  return panel && !panel.hidden;
}

const FEAT_COMPANIONS = EMOTIONAL_BEAR_COMPANIONS;

function clearFeatCompanionTimers() {
  for (const timer of featCompanionTimers) clearTimeout(timer);
  featCompanionTimers = [];
}

function updateLocalChatDockPosition() {
  const pack = document.getElementById('pack-bar');
  const root = document.getElementById('game-root');
  if (!pack || !root) return;
  root.style.setProperty('--pack-live-height', `${Math.ceil(pack.offsetHeight) + 8}px`);
}

function showLocalChatBubble(participant, message, { feat = false } = {}) {
  const stream = document.getElementById('local-chat-stream');
  if (!stream) return;
  const bubble = document.createElement('div');
  bubble.className = `local-chat-bubble${feat ? ' is-feat' : ''}`;
  const speaker = document.createElement('b');
  speaker.textContent = `${participant}: `;
  bubble.append(speaker, document.createTextNode(message));
  stream.prepend(bubble);
  while (stream.children.length > 4) stream.removeChild(stream.lastChild);
  const timer = setTimeout(() => bubble.remove(), 7200);
  bubble.addEventListener('click', () => {
    clearTimeout(timer);
    bubble.remove();
  });
}

function handleFeatResult(result, participant) {
  if (result.activityLine) pushActivity(result.activityLine);
  if (result.broken) {
    playSfx('alert', { volume: 0.4, rate: 0.72 });
    assistedFeatChain = null;
    clearFeatCompanionTimers();
    toast(result.activityLine, 3200);
  } else if (result.ok) {
    playSfx(result.chainCompleted ? 'quest' : 'alert', { volume: 0.5 });
    if (result.firstContribution) {
      const updates = applyAchievementProgress(
        achieveState,
        'feats:contributed',
        1,
        pc
      );
      announceAchievementUpdates(updates);
      toast(
        `Your incantation counted toward “${INCANTATION_FEAT_TITLE}”.`,
        4200
      );
    } else if (result.chainCompleted) {
      toast(`Chain complete! ${result.chainParticipants.join(', ')} scored six points.`, 3800);
      assistedFeatChain = null;
    }
    app.view.dataset.featStep = String(result.step);
    app.view.dataset.featPoints = String(featState.totalPoints);
    app.view.dataset.featChains = String(featState.chainsCompleted);
    app.view.dataset.featParticipant = participant;
  }
  renderFeatPanel();
  updateFeatChrome();
  savePlayerState();
}

function sayLocalChat(message, participant = 'Ur', { quietActivity = false } = {}) {
  const text = String(message || '').trim().slice(0, 180);
  if (!text) return { ok: false, reason: 'empty' };
  const result = submitIncantation(featState, text, participant, Date.now());
  showLocalChatBubble(participant, text, { feat: result.matched || result.broken });
  // The Local chat dock keeps the whole chain. In-world, keep only the current
  // speaker readable instead of stacking three large bubbles over the actors.
  if (result.matched) clearSpeechBubbles();
  if (participant === 'Ur') {
    showSpeechBubble(playerSpeechTarget, {
      speaker: participant,
      text,
      durationMs: result.matched ? 12_000 : 7_200,
    });
  } else {
    showLocalCompanionSpeech(participant, text, {
      durationMs: result.matched ? 12_000 : 7_200,
    });
  }
  if (result.ok || result.broken) {
    handleFeatResult(result, participant);
  } else if (!quietActivity && participant === 'Ur') {
    pushActivity(`${participant}: ${text}`);
  }
  return result;
}

function finishAssistedFeatChain(playerResult) {
  if (!assistedFeatChain || !playerResult?.ok) return;
  const remaining = INCANTATION_LINES.filter((line) => line.step > playerResult.step);
  remaining.forEach((line, index) => {
    const companion = FEAT_COMPANIONS[(playerResult.step + index) % FEAT_COMPANIONS.length];
    const timer = setTimeout(() => {
      if (!assistedFeatChain) return;
      sayLocalChat(line.phrase, companion, { quietActivity: true });
    }, 620 * (index + 1));
    featCompanionTimers.push(timer);
  });
}

function sayAssignedFeatLine() {
  if (!assistedFeatChain) return;
  const line = INCANTATION_LINES[assistedFeatChain.playerStep - 1];
  const result = sayLocalChat(line.phrase, 'Ur');
  if (result.ok) finishAssistedFeatChain(result);
  closeFeatPanel();
  const input = document.getElementById('local-chat-input');
  if (input) input.value = '';
}

function gatherFeatChain() {
  clearFeatCompanionTimers();
  resetIncantationChain(featState);
  const playerStep = (featState.chainsCompleted % INCANTATION_LINES.length) + 1;
  assistedFeatChain = { playerStep };
  gatherLocalCompanions();
  for (let step = 1; step < playerStep; step += 1) {
    const line = INCANTATION_LINES[step - 1];
    sayLocalChat(line.phrase, FEAT_COMPANIONS[step - 1], { quietActivity: true });
  }
  renderFeatPanel();
  const input = document.getElementById('local-chat-input');
  if (input) {
    input.value = INCANTATION_LINES[playerStep - 1].phrase;
    input.focus({ preventScroll: true });
    input.select();
  }
}

function renderFeatPanel() {
  const chain = document.getElementById('feat-chain');
  const status = featStatus(featState);
  if (!chain) return;
  const title = document.getElementById('feat-title');
  if (title) title.textContent = status.title;
  chain.innerHTML = '';
  for (const line of INCANTATION_LINES) {
    const row = document.createElement('div');
    const done = status.nextStep > line.step;
    const current = status.nextStep === line.step;
    row.className = `feat-line${done ? ' done' : ''}${current ? ' current' : ''}`;
    const number = document.createElement('b');
    number.textContent = String(line.step);
    const phrase = document.createElement('span');
    phrase.textContent = line.phrase;
    const points = document.createElement('small');
    points.textContent = `+${line.points}`;
    row.append(number, phrase, points);
    chain.appendChild(row);
  }
  document.getElementById('feat-total').textContent = String(status.totalPoints);
  document.getElementById('feat-personal').textContent = String(status.personalPoints);
  document.getElementById('feat-complete').textContent = String(status.chainsCompleted);
  const prompt = document.getElementById('feat-prompt');
  const say = document.getElementById('feat-say');
  if (assistedFeatChain) {
    const line = INCANTATION_LINES[assistedFeatChain.playerStep - 1];
    if (prompt) {
      prompt.textContent =
        status.nextStep === assistedFeatChain.playerStep
          ? `Your turn. Say: “${line.phrase}”`
          : 'The street is finishing the chain…';
    }
    if (say) {
      say.hidden = status.nextStep !== assistedFeatChain.playerStep;
      say.textContent = `Say line ${line.step}`;
    }
  } else {
    if (prompt) {
      prompt.textContent = status.nextStep === 1
        ? 'Gather two street companions, then take your turn in the chain.'
        : `Waiting for a new Glitch to say line ${status.nextStep}.`;
    }
    if (say) say.hidden = true;
  }
}

function updateFeatChrome() {
  const button = document.getElementById('feat-btn');
  if (!button) return;
  button.classList.toggle('is-active', featState.nextStep !== 1);
  button.title = featState.nextStep === 1
    ? `Current Feat (H) · ${featState.totalPoints} street points`
    : `Current Feat (H) · chain waiting for line ${featState.nextStep}`;
}

function openFeatPanel() {
  if (isShrineOpen()) closeShrinePanel();
  closeMap();
  closeQuestPanel();
  closeAchievePanel();
  closeSkillsPanel();
  closeBuffsPanel();
  closeVendor();
  const panel = document.getElementById('feat-panel');
  if (panel) {
    renderFeatPanel();
    panel.hidden = false;
  }
}

function closeFeatPanel() {
  const panel = document.getElementById('feat-panel');
  if (panel) panel.hidden = true;
}

function isFeatOpen() {
  const panel = document.getElementById('feat-panel');
  return Boolean(panel && !panel.hidden);
}

function renderAchievePanel() {
  const box = document.getElementById('achieve-body');
  const meta = document.getElementById('achieve-meta');
  if (!box) return;
  box.innerHTML = '';
  box.className = 'quest-log-body achieve-grid';
  const catN = Object.keys(getAchievementCatalog()).length;
  const allRows = browseAchievementLog(achieveState, achievementBrowser);
  const visibleRows = allRows.slice(0, achievementBrowser.limit);
  if (meta) {
    meta.textContent = `${achieveState.unlocked.length} unlocked · ${allRows.length} matching · ${catN} in catalog`;
  }
  document.querySelectorAll('[data-achieve-status]').forEach((button) => {
    const active = button.dataset.achieveStatus === achievementBrowser.status;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const category = document.getElementById('achieve-category');
  if (category) category.value = achievementBrowser.category;
  const search = document.getElementById('achieve-search');
  if (search && search.value !== achievementBrowser.query) search.value = achievementBrowser.query;

  if (!visibleRows.length) {
    const empty = document.createElement('div');
    empty.className = 'badge-browser-empty';
    empty.textContent = 'No badges match those filters.';
    box.appendChild(empty);
  }
  for (const row of visibleRows) {
    const card = document.createElement('div');
    card.className = 'badge-card' + (row.unlocked ? ' done' : '');
    const tsid = row.def.classTsid || row.classTsid || '';
    card.dataset.badgeTsid = row.redacted ? 'secret' : tsid;
    card.dataset.badgeStatus = row.status;
    const iconUrl = row.redacted ? '' : badgeIconFor(tsid);
    if (iconUrl) {
      const icon = document.createElement('img');
      icon.className = 'badge-art';
      icon.dataset.source = 'official-archive';
      icon.src = iconUrl;
      icon.alt = '';
      icon.onerror = () => icon.replaceWith(achievementBadgeFallback(row.def));
      card.appendChild(icon);
    } else {
      card.appendChild(achievementBadgeFallback(row.redacted
        ? { name: 'Secret Achievement' }
        : row.def));
    }
    const body = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'q-title';
    title.textContent = (row.redacted ? 'Secret Achievement' : row.def.name) +
      (row.unlocked ? ' ✓' : row.status === 'progress' ? ' …' : '');
    body.appendChild(title);
    const desc = document.createElement('div');
    desc.className = 'q-req';
    desc.textContent = row.redacted
      ? 'Keep exploring to reveal this badge.'
      : row.def.desc || row.def.statusText || '';
    body.appendChild(desc);
    if (!row.redacted && row.def.category) {
      const label = document.createElement('div');
      label.className = 'badge-category';
      label.textContent = achievementCategoryLabel(row.def.category);
      body.appendChild(label);
    }
    for (const c of row.redacted ? [] : row.conditions || []) {
      const r = document.createElement('div');
      r.className = 'q-req badge-condition';
      const itemLabel = ITEM_CATALOG[c.name]?.label || '';
      r.textContent = `${achievementConditionLabel(c, itemLabel)}: ${c.current} / ${c.num}`;
      body.appendChild(r);
    }
    card.appendChild(body);
    box.appendChild(card);
  }
  if (visibleRows.length < allRows.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'badge-load-more';
    more.textContent = `Show more (${allRows.length - visibleRows.length} remaining)`;
    more.addEventListener('click', () => {
      achievementBrowser.limit += ACHIEVEMENT_PAGE_SIZE;
      renderAchievePanel();
    });
    box.appendChild(more);
  }
  box.dataset.badgeMatching = String(allRows.length);
  box.dataset.badgeRendered = String(visibleRows.length);
  box.dataset.badgeCatalog = String(catN);
  if (app?.view) {
    app.view.dataset.badgeMatching = String(allRows.length);
    app.view.dataset.badgeRendered = String(visibleRows.length);
    app.view.dataset.badgeCatalog = String(catN);
    app.view.dataset.badgeFilter = achievementBrowser.status;
    app.view.dataset.badgeCategory = achievementBrowser.category;
  }
}

function resetAchievementBrowserPage() {
  achievementBrowser.limit = ACHIEVEMENT_PAGE_SIZE;
  const scroller = document.querySelector('#achieve-panel .side-card');
  if (scroller) scroller.scrollTop = 0;
}

function openAchievePanel() {
  if (isShrineOpen()) closeShrinePanel();
  closeMap();
  closeQuestPanel();
  closeFeatPanel();
  closeSkillsPanel();
  closeBuffsPanel();
  closeVendor();
  const panel = document.getElementById('achieve-panel');
  if (panel) {
    renderAchievePanel();
    panel.hidden = false;
  }
}

function closeAchievePanel() {
  const panel = document.getElementById('achieve-panel');
  if (panel) panel.hidden = true;
}

function isAchieveOpen() {
  const panel = document.getElementById('achieve-panel');
  return panel && !panel.hidden;
}

function renderSkillsPanel() {
  const box = document.getElementById('skills-body');
  const meta = document.getElementById('skills-meta');
  if (!box) return;
  box.innerHTML = '';
  const all = listSkills();
  const now = Date.now();
  const queue = listStudyQueue(skillState, now);
  if (meta) {
    const paused = queue.filter((row) => row.isPaused).length;
    meta.textContent = `${skillState.learned.length} learned · ${all.length} in tree` +
      (queue.length ? ` · ${queue.length - paused} studying · ${paused} paused` : ' · ready to study');
  }
  // Official queue: one active study plus any paused progress.
  for (const row of queue) {
    const def = getSkillCatalog()[row.classTsid];
    if (!def) continue;
    const card = document.createElement('div');
    card.className = `q-card skill-study-card ${row.isPaused ? 'paused' : 'studying'}`;
    const title = document.createElement('div');
    title.className = 'q-title';
    title.textContent = `${def.name}${def.level ? ' L' + def.level : ''} · ${row.isPaused ? 'Paused' : row.isAccelerated ? 'Accelerated!' : 'Studying'}`;
    card.appendChild(title);
    const timing = document.createElement('div');
    timing.className = 'q-req skill-study-time';
    timing.textContent = `${formatStudyTime(row.remainingSeconds)} remaining · ${Math.round(row.progress * 100)}%`;
    card.appendChild(timing);
    const bar = document.createElement('div');
    bar.className = 'q-bar skill-study-bar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round(row.progress * 100)}%`;
    bar.appendChild(fill);
    card.appendChild(bar);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'content-action-btn';
    btn.textContent = row.isPaused ? 'Resume study' : 'Pause study';
    btn.addEventListener('click', () => {
      const result = row.isPaused
        ? startSkillStudy(skillState, row.classTsid, skillStudyContext(), Date.now())
        : pauseSkillStudy(skillState, row.classTsid, Date.now());
      if (result.completed?.length) handleSkillCompletions(result.completed);
      if (result.ok) {
        toast(row.isPaused ? `Resumed ${def.name}.` : `Paused ${def.name}.`);
        pushActivity(`${row.isPaused ? 'Resumed' : 'Paused'} learning ${def.name}.`);
      }
      updateHud();
      renderSkillsPanel();
    });
    card.appendChild(btn);
    box.appendChild(card);
  }
  // Learned first
  for (const def of listLearnedSkills(skillState)) {
    const card = document.createElement('div');
    card.className = 'q-card done';
    card.innerHTML = `<div class="q-title">${def.name} ${def.level ? 'L' + def.level : ''} ✓</div>
      <div class="q-req">${def.description || ''}</div>`;
    box.appendChild(card);
  }
  // Learnable sample (first 40 not learned)
  let shown = 0;
  for (const def of all) {
    if (skillState.learned.includes(def.classTsid)) continue;
    if (skillState.queue?.[def.classTsid]) continue;
    if (shown >= 40) break;
    shown++;
    const check = canLearnSkill(skillState, def.classTsid, skillStudyContext());
    const card = document.createElement('div');
    card.className = 'q-card';
    const title = document.createElement('div');
    title.className = 'q-title';
    title.textContent = `${def.name}${def.level ? ' L' + def.level : ''} · ${formatStudyTime(studySecondsForSkill(def))}`;
    card.appendChild(title);
    const desc = document.createElement('div');
    desc.className = 'q-req';
    desc.textContent = def.description || '';
    card.appendChild(desc);
    if (def.reqSkills?.length) {
      const pre = document.createElement('div');
      pre.className = 'q-req';
      pre.textContent = 'Requires skills: ' + def.reqSkills.join(', ');
      card.appendChild(pre);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'content-action-btn';
    btn.textContent = check.ok ? 'Start studying' : `Locked (${check.reason})`;
    btn.disabled = !check.ok;
    btn.addEventListener('click', () => {
      const r = startSkillStudy(skillState, def.classTsid, skillStudyContext(), Date.now());
      if (r.completed?.length) handleSkillCompletions(r.completed);
      if (r.ok) {
        toast(`Started studying ${def.name} · ${formatStudyTime(r.durationSeconds)}`);
        pushActivity(`You started learning ${def.name}. It will continue while you explore — and while you are away.`);
      } else {
        toast(`Cannot study: ${r.reason}`);
      }
      updateHud();
      renderSkillsPanel();
    });
    card.appendChild(btn);
    box.appendChild(card);
  }
}

function skillStudyContext() {
  return {
    level: pc.level,
    completedQuests: questState.completed,
    unlockedAchievements: achieveState.unlocked,
    upgrades: pc.imaginationUpgrades || [],
  };
}

function handleSkillCompletions(completed, { offline = false } = {}) {
  for (const row of completed || []) {
    const name = row.def?.name || row.classTsid;
    emitGameEvent(`skill_learned:${row.classTsid}`);
    toast(`You learned ${name}!`, 4200);
    pushActivity(`${offline ? 'While you were away, you learned' : 'You learned'} ${name}.`);
    enqueueAward({
      kind: 'achievement',
      title: `${name} learned!`,
      body: row.def?.learned || row.def?.description || 'A fresh branch of knowledge has unfurled.',
      subtitle: offline ? 'Your brain kept studying while you were away.' : 'Knowledge: acquired.',
    });
  }
}

function updateSkillChrome(now = Date.now()) {
  const button = document.getElementById('skills-btn');
  if (!button) return;
  const active = getActiveStudy(skillState, now);
  if (!active) {
    button.textContent = 'Skills';
    button.title = 'Skills (K)';
    button.classList.remove('is-studying');
    return;
  }
  const def = getSkillCatalog()[active.classTsid];
  const remaining = formatStudyTime(active.remainingSeconds);
  button.textContent = `Study · ${remaining}`;
  button.title = `${def?.name || active.classTsid}: ${remaining} remaining`;
  button.classList.add('is-studying');
}

function openSkillsPanel() {
  if (isShrineOpen()) closeShrinePanel();
  closeMap();
  closeQuestPanel();
  closeAchievePanel();
  closeFeatPanel();
  closeBuffsPanel();
  closeVendor();
  const panel = document.getElementById('skills-panel');
  if (panel) {
    renderSkillsPanel();
    panel.hidden = false;
  }
}

function closeSkillsPanel() {
  const panel = document.getElementById('skills-panel');
  if (panel) panel.hidden = true;
}

function isSkillsOpen() {
  const panel = document.getElementById('skills-panel');
  return panel && !panel.hidden;
}

function renderBuffsPanel() {
  const box = document.getElementById('buffs-body');
  const meta = document.getElementById('buffs-meta');
  if (!box) return;
  box.innerHTML = '';
  const now = Date.now();
  const active = listActiveBuffs(buffState, now);
  const pending = listPendingBuffs(buffState, now);
  const packItems = listBuffItemsInPack(inv);
  if (meta) {
    meta.textContent = `${active.length} active${pending.length ? ` · ${pending.length} brewing` : ''} · effects come from items`;
  }
  const head = document.createElement('div');
  head.className = 'q-title';
  head.textContent = 'Current effects';
  box.appendChild(head);
  if (!active.length && !pending.length) {
    const empty = document.createElement('div');
    empty.className = 'q-req';
    empty.textContent = 'No active buffs. Activate Spinach or munch a harvested herb from your pack.';
    box.appendChild(empty);
  }
  for (const b of [...active, ...pending]) {
    const waiting = b.activated === false || b.appliedAt > now;
    const card = document.createElement('div');
    card.className = `q-card done buff-card${waiting ? ' pending' : ''}`;
    card.innerHTML = `<div class="buff-card-head">
        <img src="assets/sprites/icons/${escapeHtml(b.sourceItem || b.def.itemClass || 'apple')}.png" alt="" />
        <div><div class="q-title">${escapeHtml(b.def.name)}</div><div class="buff-time">${waiting ? 'Begins' : 'Remaining'} ${escapeHtml(formatBuffRemaining(b, now))}</div></div>
      </div><div class="q-req">${escapeHtml(b.def.desc || '')}</div>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'content-action-btn';
    btn.textContent = waiting ? 'Cancel' : 'End effect';
    btn.addEventListener('click', () => {
      removeBuff(buffState, b.classTsid, pc, Date.now());
      toast(`${waiting ? 'Cancelled' : 'Ended'} ${b.def.name}`);
      renderBuffsPanel();
      updateHud();
    });
    card.appendChild(btn);
    box.appendChild(card);
  }
  const head2 = document.createElement('div');
  head2.className = 'q-title';
  head2.style.marginTop = '0.6rem';
  head2.textContent = 'From your pack';
  box.appendChild(head2);
  if (!packItems.length) {
    const empty = document.createElement('div');
    empty.className = 'q-req';
    empty.textContent = 'Grow Spinach in a Crop Garden or flowers in an Herb Garden.';
    box.appendChild(empty);
  }
  for (const item of packItems) {
    const card = document.createElement('div');
    card.className = 'q-card buff-source-card';
    card.innerHTML = `<div class="buff-card-head">
        <img src="assets/sprites/icons/${escapeHtml(item.classTsid)}.png" alt="" />
        <div><div class="q-title">${escapeHtml(ITEM_CATALOG[item.classTsid]?.label || item.classTsid)} ×${item.count}</div>
        <div class="q-req">${escapeHtml(item.effectHint)}</div></div>
      </div>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'content-action-btn';
    btn.dataset.buffItem = item.classTsid;
    btn.textContent = hasBuff(buffState, item.buffId, now) ? 'Already active' : `${item.verb} one`;
    btn.disabled = hasBuff(buffState, item.buffId, now);
    btn.addEventListener('click', () => {
      usePackItem(item.classTsid);
      renderBuffsPanel();
    });
    card.appendChild(btn);
    box.appendChild(card);
  }
}

function renderBuffStrip() {
  const strip = document.getElementById('buff-strip');
  const button = document.getElementById('buffs-btn');
  if (!strip) return;
  const now = Date.now();
  const rows = [...listActiveBuffs(buffState, now), ...listPendingBuffs(buffState, now)];
  strip.innerHTML = '';
  strip.hidden = rows.length === 0;
  if (button) {
    button.classList.toggle('has-active-buffs', rows.length > 0);
    button.setAttribute('aria-label', rows.length ? `Buffs, ${rows.length} current effect${rows.length === 1 ? '' : 's'}` : 'Buffs');
  }
  for (const row of rows.slice(0, 6)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `buff-chip${row.activated === false || row.appliedAt > now ? ' pending' : ''}`;
    chip.title = `${row.def.name}: ${row.def.desc || ''}`;
    chip.setAttribute('aria-label', `${row.def.name}, ${formatBuffRemaining(row, now)}`);
    chip.innerHTML = `<img src="assets/sprites/icons/${escapeHtml(row.sourceItem || row.def.itemClass || 'apple')}.png" alt="" /><span>${escapeHtml(formatBuffRemaining(row, now))}</span>`;
    chip.addEventListener('click', openBuffsPanel);
    strip.appendChild(chip);
  }
}

function pulsePurpleJunk() {
  document.body.classList.remove('buff-purple-pulse');
  // Force a new animation even when consecutive ticks arrive while the class exists.
  void document.body.offsetWidth;
  document.body.classList.add('buff-purple-pulse');
  clearTimeout(state.purpleBuffTimer);
  state.purpleBuffTimer = setTimeout(() => document.body.classList.remove('buff-purple-pulse'), 1800);
}

function handleBuffEvents(events = []) {
  if (!events.length) return;
  for (const event of events) {
    const name = event.buff?.def?.name || event.classTsid;
    if (event.type === 'activated') {
      toast(`${name} kicks in!`, 3000);
      pushActivity({ base: `${name} kicks in`, effects: event.effects });
      if (player) {
        floatText(player.x, player.y - 82, name, event.classTsid === 'purple_flower' ? 0xc070e8 : 0x8fe3b0);
        burst(player.x, player.y - 42, event.classTsid === 'purple_flower' ? 0xa020f0 : 0x8fe3b0, 14);
      }
      if (event.classTsid === 'purple_flower') pulsePurpleJunk();
    } else if (event.type === 'tick') {
      if (event.classTsid === 'purple_flower') {
        pulsePurpleJunk();
        if (player) floatText(player.x, player.y - 78, '+1 iMG · zibblezibzob', 0xc070e8);
      } else if (event.classTsid === 'hairball_flower' && event.effects?.energy) {
        pushActivity({ base: 'Hairball Rally takes its energetic toll', effects: event.effects });
        if (player) floatText(player.x, player.y - 76, `${event.effects.energy} energy`, 0xff8888);
      }
    } else if (event.type === 'expired') {
      toast(`${name} faded.`, 2200);
      pushActivity(`${name} faded.`);
      if (event.classTsid === 'purple_flower') document.body.classList.remove('buff-purple-pulse');
    }
  }
  updateHud();
}

function openBuffsPanel() {
  closeFeatPanel();
  if (isShrineOpen()) closeShrinePanel();
  closeMap();
  closeQuestPanel();
  closeAchievePanel();
  closeSkillsPanel();
  closeVendor();
  const panel = document.getElementById('buffs-panel');
  if (panel) {
    renderBuffsPanel();
    panel.hidden = false;
  }
}

function closeBuffsPanel() {
  const panel = document.getElementById('buffs-panel');
  if (panel) panel.hidden = true;
}

function isBuffsOpen() {
  const panel = document.getElementById('buffs-panel');
  return panel && !panel.hidden;
}

function craftOpts() {
  return {
    learned: skillState.learned || [],
    achievements: achieveState.unlocked || [],
    requireSkill: true,
    requireTool: true,
    toolState,
  };
}

function itemIconUrl(classTsid) {
  return ITEM_CATALOG[classTsid]?.icon || `assets/sprites/icons/${classTsid}.png`;
}

function recipeInputLabel(recipe, input) {
  const label = ITEM_CATALOG[input.classTsid]?.label || input.classTsid;
  if (recipe?.tool === 'fruit_changing_machine' && input.classTsid === 'cherry') {
    return input.qty === 1 ? 'Cherry' : 'Cherries';
  }
  return label;
}

/** Hide progress/result overlays; show recipe list/detail again. */
function clearMakeFeedback() {
  const prog = document.getElementById('make-progress');
  const res = document.getElementById('make-result');
  if (prog) {
    prog.hidden = true;
    prog.innerHTML = '';
  }
  if (res) {
    res.hidden = true;
    res.innerHTML = '';
  }
}

function setMakeCraftingUi(isCrafting) {
  document.querySelector('#make-panel .make-card')?.classList.toggle('is-crafting', isCrafting);
}

/** Draw the source-inspired ingredients → working tool → output stage once. */
function renderMakeProgressStage(record) {
  const { recipe, timer } = record;
  const prog = document.getElementById('make-progress');
  if (!prog) return;
  const inputs = (recipe.inputs || []).map((input) => `
    <span class="mp-ingredient">
      <img src="${itemIconUrl(input.classTsid)}" alt="" />
      <b>${input.qty}</b>
    </span>`).join('');
  const output = recipe.outputs?.[0];
  const toolIcon = TOOL_CATALOG[recipe.tool]?.icon || itemIconUrl(recipe.tool);
  const toolVisual = recipe.tool === 'fruit_changing_machine'
    ? '<span class="mp-tool mp-tool-fruit-machine" data-tool="fruit_changing_machine" role="img" aria-label="Fruit Changing Machine working"></span>'
    : `<img class="mp-tool" data-tool="${escapeHtml(recipe.tool || '')}" src="${toolIcon}" alt="" />`;
  prog.hidden = false;
  prog.innerHTML = `
    <p class="mp-label" data-mp-label>${escapeHtml(formatCraftProgress(1, timer.qty, recipe.name))}</p>
    <div class="mp-stage" aria-hidden="true">
      <div class="mp-ingredients">${inputs}</div>
      <div class="mp-tool-wrap">
        <span class="mp-spark mp-spark-a">✦</span>
        ${toolVisual}
        <span class="mp-spark mp-spark-b">✦</span>
      </div>
      <div class="mp-output-wrap">
        <span class="mp-arrow">→</span>
        <img class="mp-output" src="${itemIconUrl(output?.classTsid)}" alt="" />
        <b>×${output?.qty || 1}</b>
      </div>
    </div>
    <div class="mp-unit-row"><span>Current item</span><span data-mp-unit>0%</span></div>
    <div class="mp-bar mp-unit-bar" role="progressbar" aria-label="Current item" aria-valuemin="0" aria-valuemax="100"><i data-mp-unit-bar></i></div>
    <div class="mp-unit-row mp-overall-row"><span data-mp-count>0 of ${timer.qty} complete</span><span data-mp-total>0%</span></div>
    <div class="mp-bar mp-total-bar" role="progressbar" aria-label="Whole batch" aria-valuemin="0" aria-valuemax="100"><i data-mp-total-bar></i></div>
    <button type="button" class="btn-glitch-back mp-cancel" data-make-cancel>Cancel</button>`;
  prog.querySelector('[data-make-cancel]')?.addEventListener('click', () => cancelMakeCraft());
  updateMakeProgressUi(record);
}

function updateMakeProgressUi(record) {
  const prog = document.getElementById('make-progress');
  if (!prog) return;
  const { timer, recipe } = record;
  const current = Math.min(timer.qty, timer.completed + 1);
  const unitPct = Math.round(timer.unitProgress * 100);
  const totalPct = Math.round(timer.totalProgress * 100);
  const label = prog.querySelector('[data-mp-label]');
  const unit = prog.querySelector('[data-mp-unit]');
  const unitBar = prog.querySelector('[data-mp-unit-bar]');
  const count = prog.querySelector('[data-mp-count]');
  const total = prog.querySelector('[data-mp-total]');
  const totalBar = prog.querySelector('[data-mp-total-bar]');
  if (label) label.textContent = formatCraftProgress(current, timer.qty, recipe.name);
  if (unit) unit.textContent = `${unitPct}%`;
  if (unitBar) unitBar.style.width = `${unitPct}%`;
  unitBar?.parentElement?.setAttribute('aria-valuenow', String(unitPct));
  if (count) count.textContent = `${record.made} of ${timer.qty} complete`;
  if (total) total.textContent = `${totalPct}%`;
  if (totalBar) totalBar.style.width = `${totalPct}%`;
  totalBar?.parentElement?.setAttribute('aria-valuenow', String(totalPct));
}

function finishMakeCraft(record, { close = false, cancelled = false, quiet = false } = {}) {
  if (activeCraftSession === record) activeCraftSession = null;
  setMakeCraftingUi(false);
  const prog = document.getElementById('make-progress');
  if (prog) {
    prog.hidden = true;
    prog.innerHTML = '';
  }

  if (record.made > 0) {
    const result = buildCraftBatchResult(inv, pc, record.key, record.made, record.qty, record.opts);
    if (result) {
      updateHud();
      pushActivity(result.activityLine);
      if (!quiet) toast(result.activityLine);
      playSfx('pickup', { volume: 0.6 });
      if (player) floatText(player.x, player.y - 80, record.recipe.name, 0xffe066);
      if (!close) showMakeResult(result, record.key);
    }
  } else if (!close) {
    if (cancelled && !quiet) toast('Making cancelled. Nothing was used.');
    renderMakePanel();
  }
}

function cancelMakeCraft({ close = false, quiet = false } = {}) {
  const record = activeCraftSession;
  if (!record) return false;
  record.timer = cancelCraftSession(record.timer);
  finishMakeCraft(record, { close, quiet, cancelled: true });
  return true;
}

/** Commit one recipe only after each visible tool cycle finishes. */
function updateMakeCraft(deltaMs) {
  const record = activeCraftSession;
  if (!record) return;
  const advanced = advanceCraftSession(record.timer, deltaMs);
  record.timer = advanced.session;
  for (let i = 0; i < advanced.unitsReady; i++) {
    const result = craftRecipe(inv, pc, record.key, record.opts);
    if (!result.ok) {
      record.timer = cancelCraftSession(record.timer);
      if (!record.made) toast(result.msgs?.[0] || 'Cannot continue making.');
      finishMakeCraft(record, { cancelled: true });
      return;
    }
    if (result.toolUse?.broke) {
      toast(result.toolUse.msg, 3600);
      pushActivity(result.toolUse.msg);
      playSfx('alert', { volume: 0.35, rate: 0.72 });
    }
    record.made += 1;
    emitGameEvent(`making_recipe:${record.key}`);
    for (const output of record.recipe.outputs || []) {
      emitGameEvent(`making_tool_output:${record.recipe.tool}:${output.classTsid}`, output.qty || 1);
    }
    const achievementCounter = makingToolAchievementCounter(record.recipe.tool);
    const achievementUpdates = achievementCounter
      ? applyAchievementProgress(achieveState, achievementCounter, 1, pc)
      : [];
    announceAchievementUpdates(achievementUpdates);
    if (achievementCounter) app.view.dataset.achievementCounter = achievementCounter;
    updateHud();
    playSfx('step', { volume: 0.18, rate: 1.35 });
  }
  updateMakeProgressUi(record);
  if (record.timer.status === 'complete') finishMakeCraft(record);
}

/** Start a cancellable per-unit session without mutating inventory up front. */
function runMakeCraft(key, qty) {
  if (activeCraftSession) return;
  const recipe = RECIPE_CATALOG[key];
  if (!recipe) {
    toast('Unknown recipe.');
    return;
  }
  const opts = craftOpts();
  const check = canCraft(inv, recipe, opts);
  if (!check.ok || pc.energy < (recipe.energyCost || 0)) {
    toast(check.reason === 'ingredients' ? 'You need more ingredients.' : 'Cannot make that right now.');
    renderMakePanel();
    return;
  }

  const n = Math.max(1, Math.floor(qty || 1));
  const timer = createCraftSession({
    recipeKey: key,
    recipeName: recipe.name,
    tool: recipe.tool,
    qty: n,
    durationMs: craftDurationFor(recipe),
  });
  activeCraftSession = { timer, key, recipe, qty: n, made: 0, opts };
  document.getElementById('make-list')?.setAttribute('hidden', '');
  document.getElementById('make-detail')?.setAttribute('hidden', '');
  const result = document.getElementById('make-result');
  if (result) {
    result.hidden = true;
    result.innerHTML = '';
  }
  const title = document.getElementById('make-title');
  if (title) title.textContent = `Making ${recipe.name}`;
  setMakeCraftingUi(true);
  renderMakeProgressStage(activeCraftSession);
  playSfx('step', { volume: 0.22, rate: 1.15 });
}

/**
 * Result panel: made count, signed energy/xp, used ingredients, make more / done.
 * @param {NonNullable<ReturnType<typeof craftRecipeBatch>['result']>} result
 * @param {string} key
 */
function showMakeResult(result, key) {
  const resEl = document.getElementById('make-result');
  const list = document.getElementById('make-list');
  const detail = document.getElementById('make-detail');
  const titleEl = document.getElementById('make-title');
  if (list) list.hidden = true;
  if (detail) {
    detail.hidden = true;
    detail.innerHTML = '';
  }
  if (!resEl) return;
  if (titleEl) titleEl.textContent = `Make ${result.recipeName}`;

  const outId = result.outputs?.[0]?.classTsid;
  const e = result.energy || 0;
  const xp = result.xp || 0;
  const eCls = e < 0 ? 'loss' : e > 0 ? 'gain' : '';
  const xpCls = xp > 0 ? 'gain' : xp < 0 ? 'loss' : '';
  const eText = e ? `${e < 0 ? e : `+${e}`} energy` : '';
  const xpText = xp ? `${xp > 0 ? `+${xp}` : xp} iMG` : '';

  const usedHtml = (result.used || [])
    .map(
      (u) => `
      <div class="mr-used-item">
        <img src="${itemIconUrl(u.classTsid)}" alt="" />
        <span>${u.qty}</span>
        <span style="opacity:0.65;font-weight:500">${u.remain} left</span>
      </div>`
    )
    .join('');

  resEl.hidden = false;
  resEl.innerHTML = `
    <div class="make-detail-icon"><img src="${itemIconUrl(outId)}" alt=""/></div>
    <p class="mr-kicker">${result.made < result.qtyRequested ? 'Stopped' : 'Nice'}</p>
    <p class="mr-headline">${escapeHtml(result.headline)}</p>
    <div class="mr-deltas">
      ${eText ? `<span class="mr-delta ${eCls}">${escapeHtml(eText)}</span>` : ''}
      ${xpText ? `<span class="mr-delta ${xpCls}">${escapeHtml(xpText)}</span>` : ''}
    </div>
    <p class="mr-used">You used</p>
    <div class="mr-used-list">${usedHtml || '<span class="mr-used">—</span>'}</div>
    <div class="mr-actions">
      <button type="button" class="btn-glitch-back" data-mr-back>Back to recipes</button>
      <button type="button" class="btn-glitch-primary" data-mr-more ${result.canMakeMore ? '' : 'disabled'}>
        Make more ${escapeHtml(result.recipeName)}
      </button>
      <button type="button" class="btn-glitch-primary" data-mr-done>Done</button>
    </div>`;

  resEl.querySelector('[data-mr-back]')?.addEventListener('click', () => {
    makeSelected = null;
    clearMakeFeedback();
    renderMakePanel();
  });
  resEl.querySelector('[data-mr-done]')?.addEventListener('click', () => {
    clearMakeFeedback();
    closeMakePanel();
  });
  resEl.querySelector('[data-mr-more]')?.addEventListener('click', () => {
    if (!canCraftAgain(inv, pc, key, craftOpts())) {
      toast('Cannot make more right now.');
      return;
    }
    // Re-open detail for same recipe with qty 1 (or keep makeQty)
    clearMakeFeedback();
    makeSelected = key;
    makeQty = 1;
    renderMakePanel();
  });
}

function renderMakePanel() {
  const list = document.getElementById('make-list');
  const detail = document.getElementById('make-detail');
  const meta = document.getElementById('make-meta');
  const toolsEl = document.getElementById('make-tools');
  const titleEl = document.getElementById('make-title');
  if (!list) return;
  if (activeCraftSession) {
    renderMakeProgressStage(activeCraftSession);
    return;
  }
  ensureMakingItems();
  // Recipe browser path — hide progress/result overlays
  clearMakeFeedback();

  // Prefer a real tool filter (original: open tool → recipes for that tool)
  if (makeToolFilter === 'all') {
    const firstOwned = listMakingTools().find((t) => hasTool(inv, t.classTsid));
    if (firstOwned) makeToolFilter = firstOwned.classTsid;
  }

  if (toolsEl) {
    toolsEl.innerHTML = '';
    // Owned tools first: the original opened recipes from a tool in the pack,
    // so the 28-tool catalog leads with what the player can actually use.
    const makingTools = listMakingTools();
    const ownedTools = makingTools.filter((t) => hasTool(inv, t.classTsid));
    const otherTools = makingTools.filter((t) => !hasTool(inv, t.classTsid));
    for (const t of [...ownedTools, ...otherTools]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const owned = hasTool(inv, t.classTsid);
      btn.className = 'make-tool-chip'
        + (makeToolFilter === t.classTsid && !makeSearchQuery.trim() ? ' active' : '')
        + (owned ? '' : ' unowned');
      btn.textContent = owned ? t.label : `${t.label}`;
      btn.title = owned ? t.label : `You need a ${t.label}`;
      btn.addEventListener('click', () => {
        makeToolFilter = t.classTsid;
        makeSearchQuery = '';
        makeSelected = null;
        makeQty = 1;
        renderMakePanel();
      });
      toolsEl.appendChild(btn);
    }
    requestAnimationFrame(() => {
      toolsEl.querySelector('.make-tool-chip.active')?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
      });
    });
  }

  const toolLabel = TOOL_CATALOG[makeToolFilter]?.label || makeToolFilter || 'tools';
  // The Tinkertool repairs from the pack, but its recipe list is for making.
  const toolAction = makeToolFilter === 'tinkertool'
    ? 'make'
    : TOOL_CATALOG[makeToolFilter]?.action || 'make';
  if (titleEl) {
    titleEl.textContent = makeSelected
      ? `Make ${RECIPE_CATALOG[makeSelected]?.name || ''}`
      : makeSearchQuery.trim()
        ? `Recipes for “${makeSearchQuery.trim()}”`
        : `You want to ${toolAction} with a ${toolLabel}?`;
  }

  const searchEl = document.getElementById('make-search');
  if (searchEl && searchEl.value !== makeSearchQuery) searchEl.value = makeSearchQuery;
  // A search looks across every tool: "where do I make this?"
  const recipes = searchRecipes(makeSearchQuery, {
    tool: makeSearchQuery.trim() ? 'all' : makeToolFilter,
  });
  const opts = craftOpts();
  recipes.sort((a, b) => {
    const ca = canCraft(inv, a, opts).ok && pc.energy >= (a.energyCost || 0) ? 0 : 1;
    const cb = canCraft(inv, b, opts).ok && pc.energy >= (b.energyCost || 0) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  if (meta) {
    meta.textContent = makeSelected
      ? `Uses ${RECIPE_CATALOG[makeSelected]?.energyCost || 0} energy · energy now ${Math.floor(pc.energy)}`
      : makeToolFilter === 'fruit_changing_machine'
        ? `${recipes.length} fruits · ${countItem(inv, 'cherry')} cherries ready · energy ${Math.floor(pc.energy)}`
        : `${recipes.length} recipes · energy ${Math.floor(pc.energy)}`;
  }

  // Detail view
  if (detail) {
    if (!makeSelected || !RECIPE_CATALOG[makeSelected]) {
      detail.hidden = true;
      detail.innerHTML = '';
      list.hidden = false;
    } else {
      list.hidden = true;
      detail.hidden = false;
      const recipe = RECIPE_CATALOG[makeSelected];
      const key = makeSelected;
      const outId = recipe.outputs?.[0]?.classTsid;
      const check = canCraft(inv, recipe, opts);
      const maxMake = (() => {
        if (!check.ok && check.reason === 'ingredients') return 0;
        let m = 99;
        for (const inp of recipe.inputs || []) {
          m = Math.min(m, Math.floor(countItem(inv, inp.classTsid) / inp.qty));
        }
        const energyEach = recipe.energyCost || 0;
        if (energyEach > 0) m = Math.min(m, Math.floor(pc.energy / energyEach));
        return Math.max(0, m);
      })();
      makeQty = Math.max(1, Math.min(makeQty, Math.max(1, maxMake || 1)));
      const inputsHtml = (recipe.inputs || [])
        .map((i) => {
          const have = countItem(inv, i.classTsid);
          const lab = recipeInputLabel(recipe, i);
          return `<div class="q-req"><img src="${itemIconUrl(i.classTsid)}" alt="" width="22" height="22" style="vertical-align:middle;margin-right:4px"/> <strong>${i.qty} ${lab}</strong> · you have ${have}</div>`;
        })
        .join('');
      detail.innerHTML = `
        <button type="button" class="btn-glitch-back" data-make-back>← Back</button>
        <div class="make-detail-icon"><img src="${itemIconUrl(outId)}" alt=""/></div>
        <div class="make-detail-body">
          <h3>${recipe.name}</h3>
          <p>You can make up to ${maxMake}. Uses ${recipe.energyCost || 0} energy each.</p>
          ${inputsHtml}
          <div class="qty-row">
            <button type="button" data-mq="-">−</button>
            <input type="number" min="1" max="${Math.max(1, maxMake)}" value="${makeQty}" data-mq-val />
            <button type="button" data-mq="+">+</button>
            <button type="button" class="btn-max" data-mq="max">Max</button>
            <button type="button" class="btn-glitch-primary" data-make-go ${maxMake < 1 ? 'disabled' : ''}>${recipe.tool === 'fruit_changing_machine' ? 'Transmogrify' : 'Make'}</button>
          </div>
        </div>`;
      // restructure to match grid CSS (back spans full)
      detail.style.display = 'block';
      detail.querySelector('[data-make-back]')?.addEventListener('click', () => {
        makeSelected = null;
        renderMakePanel();
      });
      const applyQty = (n) => {
        makeQty = Math.max(1, Math.min(maxMake || 1, n));
        const inp = detail.querySelector('[data-mq-val]');
        if (inp) inp.value = String(makeQty);
      };
      detail.querySelector('[data-mq="-"]')?.addEventListener('click', () => applyQty(makeQty - 1));
      detail.querySelector('[data-mq="+"]')?.addEventListener('click', () => applyQty(makeQty + 1));
      detail.querySelector('[data-mq="max"]')?.addEventListener('click', () => applyQty(maxMake || 1));
      detail.querySelector('[data-mq-val]')?.addEventListener('change', (e) => {
        applyQty(Number(e.target.value) || 1);
      });
      detail.querySelector('[data-make-go]')?.addEventListener('click', () => {
        runMakeCraft(key, makeQty);
      });
      return;
    }
  }

  list.hidden = false;
  list.innerHTML = '';
  if (!recipes.length) {
    list.innerHTML = '<div class="make-empty">No recipes for this tool yet.</div>';
    return;
  }

  for (const recipe of recipes) {
    const key =
      recipe.key ||
      Object.keys(RECIPE_CATALOG).find((k) => RECIPE_CATALOG[k].id === recipe.id);
    const check = canCraft(inv, recipe, opts);
    const energyOk = pc.energy >= (recipe.energyCost || 0);
    const canMake = check.ok && energyOk;
    const outId = recipe.outputs?.[0]?.classTsid;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'make-tile'
      + (makeToolFilter === 'fruit_changing_machine' ? ' fruit-change-tile' : '')
      + (canMake ? '' : ' blocked');
    tile.setAttribute('role', 'listitem');
    const inputs = (recipe.inputs || [])
      .map((i) => `${i.qty} ${recipeInputLabel(recipe, i)}`)
      .join(', ');
    tile.innerHTML = `
      <img src="${itemIconUrl(outId)}" alt="" />
      <span class="tile-label">${recipe.name}</span>
      <span class="tile-req">${inputs}</span>`;
    tile.setAttribute(
      'aria-label',
      `${recipe.name}. ${inputs}. ${recipe.energyCost || 0} energy.${canMake ? '' : ' Not enough resources.'}`
    );
    tile.addEventListener('click', () => {
      makeSelected = key;
      makeQty = 1;
      renderMakePanel();
    });
    list.appendChild(tile);
  }
}

function openMakePanel() {
  closeFeatPanel();
  if (isShrineOpen()) closeShrinePanel();
  closePackPopover();
  closeMap();
  closeQuestPanel();
  closeAchievePanel();
  closeSkillsPanel();
  closeBuffsPanel();
  closeVendor();
  makeSelected = null;
  makeQty = 1;
  clearMakeFeedback();
  const panel = document.getElementById('make-panel');
  if (panel) {
    renderMakePanel();
    panel.hidden = false;
  }
}

function closeMakePanel() {
  cancelMakeCraft({ close: true, quiet: true });
  clearMakeFeedback();
  setMakeCraftingUi(false);
  const panel = document.getElementById('make-panel');
  if (panel) panel.hidden = true;
}

function isMakeOpen() {
  const panel = document.getElementById('make-panel');
  return panel && !panel.hidden;
}

function openVendor() {
  closeFeatPanel();
  if (isShrineOpen()) closeShrinePanel();
  closePackPopover();
  closeMap();
  closeQuestPanel();
  closeMakePanel();
  const panel = document.getElementById('vendor-panel');
  if (!panel) return;
  const title = document.getElementById('vendor-title');
  if (title) title.textContent = activeVendor.label;
  const desc = document.getElementById('vendor-desc');
  if (desc) {
    desc.textContent = activeVendor.desc;
    desc.hidden = false;
  }
  panel.dataset.vendor = activeVendor.key;
  panel.style.setProperty(
    '--vendor-accent',
    `#${Number(activeVendor.color || 0xd87439).toString(16).padStart(6, '0')}`
  );
  vendorTab = 'buy';
  vendorSelected = null;
  vendorQty = 1;
  vendorDragTsid = null;
  vendorSellReceipt = null;
  if (vendorReceiptTimer) {
    clearTimeout(vendorReceiptTimer);
    vendorReceiptTimer = 0;
  }
  document.querySelectorAll('.vendor-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === vendorTab);
  });
  renderVendorList();
  panel.hidden = false;
}

function closeVendor() {
  closePackPopover();
  const panel = document.getElementById('vendor-panel');
  if (panel) panel.hidden = true;
  vendorSelected = null;
  vendorDragTsid = null;
  document.getElementById('vendor-sell-drop')?.classList.remove('is-dragover');
}

function isVendorOpen() {
  const panel = document.getElementById('vendor-panel');
  return panel && !panel.hidden;
}

function isShrineOpen() {
  const panel = document.getElementById('shrine-panel');
  return Boolean(panel && !panel.hidden);
}

function closeShrinePanel() {
  const panel = document.getElementById('shrine-panel');
  if (panel) panel.hidden = true;
  shrineSelected = null;
  shrineQty = 1;
}

function openShrinePanel(target) {
  closeFeatPanel();
  const giant = GIANTS[target?.state?.giantId];
  if (!giant) return;
  closePackPopover();
  closeVerbMenu();
  closeMap();
  closeQuestPanel();
  closeAchievePanel();
  closeSkillsPanel();
  closeBuffsPanel();
  closeMakePanel();
  closeVendor();
  closeGardenPanel();
  closeAvatarPanel();
  activeShrineTarget = target;
  shrineSelected = null;
  shrineQty = 1;
  const panel = document.getElementById('shrine-panel');
  if (!panel) return;
  panel.style.setProperty('--shrine-accent', giant.color);
  panel.hidden = false;
  renderShrinePanel();
}

function renderShrinePanel() {
  const panel = document.getElementById('shrine-panel');
  const giantId = activeShrineTarget?.state?.giantId;
  const giant = GIANTS[giantId];
  if (!panel || panel.hidden || !giant) return;
  const favor = shrineState.favor[giantId] || 0;
  const cost = emblemCostFor(shrineState, giantId);
  const emblems = shrineState.emblems[giantId] || 0;
  const dailyFavor = shrineState.dailyFavor[giantId] || 0;
  const title = document.getElementById('shrine-title');
  const desc = document.getElementById('shrine-desc');
  const favorLabel = document.getElementById('shrine-favor-label');
  const emblemLabel = document.getElementById('shrine-emblems');
  const favorFill = document.getElementById('shrine-favor-fill');
  const daily = document.getElementById('shrine-daily');
  const claim = document.getElementById('shrine-claim');
  if (title) title.textContent = `Shrine to ${giant.name}`;
  if (desc) desc.textContent = giant.description;
  if (favorLabel) favorLabel.textContent = `Favor ${favor.toLocaleString()} / ${cost.toLocaleString()}`;
  if (emblemLabel) {
    emblemLabel.textContent = emblems
      ? `${emblems} emblem${emblems === 1 ? '' : 's'} earned`
      : 'No emblems yet';
  }
  if (favorFill) favorFill.style.width = `${Math.min(100, Math.round((favor / cost) * 100))}%`;
  if (daily) {
    daily.textContent = `Today: ${dailyFavor.toLocaleString()} favor · ${shrineState.dailyXp.toLocaleString()} donation iMG`;
  }
  if (claim) {
    const ready = canClaimEmblem(shrineState, giantId);
    claim.hidden = !ready;
    claim.textContent = `Claim Emblem of ${giant.name}`;
    claim.onclick = ready ? claimActiveShrineEmblem : null;
  }

  const allFavor = document.getElementById('shrine-all-favor');
  if (allFavor) {
    allFavor.innerHTML = Object.values(GIANTS).map((row) => {
      const points = shrineState.favor[row.id] || 0;
      const owned = shrineState.emblems[row.id] || 0;
      return `<span class="shrine-favor-chip${row.id === giantId ? ' active' : ''}" title="${escapeHtml(row.name)} favor">${escapeHtml(row.name)} ${points}${owned ? ` · ◉${owned}` : ''}</span>`;
    }).join('');
  }

  const options = listShrineDonationOptions(shrineState, giantId, inv);
  if (!options.some((row) => row.classTsid === shrineSelected)) {
    shrineSelected = options[0]?.classTsid || null;
    shrineQty = 1;
  }
  const list = document.getElementById('shrine-list');
  if (list) {
    list.innerHTML = '';
    if (!options.length) {
      list.innerHTML = '<div class="make-empty">Your pack has no donatable goods. Tools and emblems are kept safe.</div>';
    }
    for (const row of options) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = `shrine-tile${row.classTsid === shrineSelected ? ' active' : ''}`;
      tile.setAttribute('role', 'listitem');
      tile.setAttribute('aria-label', `${row.label}, have ${row.have}, one gives ${row.xp} iMG and ${row.favor} favor`);
      tile.innerHTML = `
        <span class="count">${row.have}</span>
        <img src="${itemIconUrl(row.classTsid)}" alt="" />
        <span class="shrine-tile-label">${escapeHtml(row.label)}</span>
        <span class="shrine-tile-reward">+${row.favor} favor</span>`;
      tile.addEventListener('click', () => {
        shrineSelected = row.classTsid;
        shrineQty = 1;
        renderShrinePanel();
      });
      list.appendChild(tile);
    }
  }

  const detail = document.getElementById('shrine-detail');
  if (!detail) return;
  if (!shrineSelected) {
    detail.hidden = true;
    detail.innerHTML = '';
    return;
  }
  const have = Math.max(1, inv[shrineSelected] || 1);
  shrineQty = clamp(Math.floor(shrineQty || 1), 1, have);
  const quote = quoteShrineDonation(shrineState, giantId, inv, shrineSelected, shrineQty);
  if (!quote.ok) {
    shrineSelected = null;
    renderShrinePanel();
    return;
  }
  const capNotes = [
    quote.atFavorCap ? `${giant.name} is ready to grant an emblem. Further favor waits until you claim it.` : '',
    quote.atDailyFavorCap ? `Today's ${giant.name} favor limit is full.` : '',
    quote.atDailyXpCap ? `Today's shrine donation iMG limit is full.` : '',
  ].filter(Boolean);
  detail.hidden = false;
  detail.innerHTML = `
    <div class="shrine-detail-icon"><img src="${itemIconUrl(quote.classTsid)}" alt="" /></div>
    <div class="shrine-detail-body">
      <h3>${escapeHtml(quote.label)} <small>×${quote.qty}</small></h3>
      <div class="shrine-rewards">
        <span>+${quote.xp} iMG</span>
        <span>+${quote.mood} mood</span>
        <span>+${quote.favor} ${escapeHtml(giant.name)} favor</span>
      </div>
      ${capNotes.map((note) => `<p class="shrine-cap-note">${escapeHtml(note)}</p>`).join('')}
      <div class="qty-row">
        <button type="button" data-shrine-dec aria-label="Donate one fewer">−</button>
        <input type="number" data-shrine-qty min="1" max="${quote.have}" value="${quote.qty}" aria-label="Donation quantity" />
        <button type="button" data-shrine-inc aria-label="Donate one more">+</button>
        <button type="button" class="btn-max" data-shrine-max>Max</button>
        <button type="button" class="btn-glitch-primary" data-shrine-donate>Donate ${quote.qty}</button>
      </div>
    </div>`;
  const setQty = (value) => {
    shrineQty = clamp(Math.floor(Number(value) || 1), 1, quote.have);
    renderShrinePanel();
  };
  detail.querySelector('[data-shrine-dec]')?.addEventListener('click', () => setQty(shrineQty - 1));
  detail.querySelector('[data-shrine-inc]')?.addEventListener('click', () => setQty(shrineQty + 1));
  detail.querySelector('[data-shrine-max]')?.addEventListener('click', () => setQty(quote.have));
  detail.querySelector('[data-shrine-qty]')?.addEventListener('change', (event) => setQty(event.target.value));
  detail.querySelector('[data-shrine-donate]')?.addEventListener('click', performShrineDonation);
  const tip = document.getElementById('shrine-tip');
  if (tip) tip.textContent = `Official shrine value: ${quote.baseCost} · more valuable offerings earn more favor.`;
}

function performShrineDonation() {
  const target = activeShrineTarget;
  const giantId = target?.state?.giantId;
  const giant = GIANTS[giantId];
  if (!target || !giant || !shrineSelected) return;
  const result = donateToShrine(shrineState, giantId, inv, pc, shrineSelected, shrineQty);
  if (!result.ok) {
    toast('That donation could not be completed.');
    renderShrinePanel();
    return;
  }
  const bonus = result.bonus === 'super'
    ? ' A super super huge bonus!'
    : result.bonus === 'huge'
      ? ' A super huge bonus!'
      : '';
  const ticket = result.gameshowTicket ? ' A Gameshow Ticket appears in your pack!' : '';
  const line = `You donated ${result.qty}× ${result.label} to ${giant.name}. +${result.xp} iMG, +${result.mood} mood, +${result.favor} favor.${bonus}${ticket}`;
  closeShrinePanel();
  playShrineDonation(target);
  refreshShrineTarget(target);
  toast(line, 4200);
  pushActivity(line);
  floatText(target.sprite.x, target.sprite.y - 150, `+${result.favor} ${giant.name} favor`, 0xffe066);
  burst(target.sprite.x, target.sprite.y - 85, 0xffe066, 20);
  playSfx('pickup', { volume: 0.62, rate: 0.86 });
  announceAchievementUpdates(
    applyAchievementProgress(achieveState, `shrines_donated:${giantId}`, 1, pc)
  );
  if (result.favor) applyQuestProgress(questState, 'favor_points', result.favor, pc);
  updateHud();
}

function claimActiveShrineEmblem() {
  const target = activeShrineTarget;
  const giantId = target?.state?.giantId;
  const result = claimShrineEmblem(shrineState, giantId, inv);
  if (!result.ok) {
    toast('More favor is needed before an emblem can be claimed.');
    renderShrinePanel();
    return;
  }
  closeShrinePanel();
  playShrineDonation(target);
  refreshShrineTarget(target);
  playSfx('quest', { volume: 0.7, rate: 1.04 });
  pushActivity(`The Shrine grants you an Emblem of ${result.giant.name}.`);
  applyAchievementProgress(achieveState, `emblems_acquired:${giantId}`, 1, pc);
  enqueueAward({
    kind: 'badge',
    title: `Emblem of ${result.giant.name}`,
    body: `Your devotion has earned emblem ${result.count}. The next costs ${emblemCostFor(shrineState, giantId).toLocaleString()} favor.`,
    iconUrl: `assets/sprites/icons/${result.classTsid}.png`,
  });
  updateHud();
}

/** Stage a pack item in the Sell detail without mutating inventory. */
function stageVendorSell(classTsid) {
  const quote = createVendorSellQuote(inv, activeVendor.offers, classTsid, 1);
  if (!quote.ok) {
    toast(quote.msgs?.[0] || 'That item cannot be sold here.');
    return quote;
  }
  vendorTab = 'sell';
  vendorSelected = classTsid;
  vendorQty = quote.qty;
  vendorSellReceipt = null;
  document.querySelectorAll('.vendor-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === vendorTab);
  });
  renderVendorList();
  return quote;
}

function renderVendorDropZone() {
  const drop = document.getElementById('vendor-sell-drop');
  if (!drop) return;
  const visible = vendorTab === 'sell' && !vendorSelected;
  drop.hidden = !visible;
  drop.classList.toggle('is-receipt', Boolean(visible && vendorSellReceipt));
  if (!visible) {
    drop.classList.remove('is-dragover');
    return;
  }
  if (vendorSellReceipt) {
    drop.innerHTML = `
      <span class="vendor-drop-coin" aria-hidden="true">◎</span>
      <strong>Sold ${vendorSellReceipt.qty}× ${escapeHtml(vendorSellReceipt.label)}</strong>
      <span>+${vendorSellReceipt.gain} currants</span>`;
  } else {
    drop.innerHTML = `
      <span class="vendor-drop-arrow" aria-hidden="true">↥</span>
      <strong>Drag an item from your pack</strong>
      <span>or choose one below</span>`;
  }
}

function renderVendorList() {
  const list = document.getElementById('vendor-list');
  const detail = document.getElementById('vendor-detail');
  const curEl = document.getElementById('vendor-currants');
  if (curEl) curEl.textContent = String(pc.currants || 0);
  if (!list) return;
  renderVendorDropZone();

  if (detail && vendorSelected) {
    list.hidden = true;
    detail.hidden = false;
    const isBuy = vendorTab === 'buy';
    const offer = activeVendor.offers.find((o) => o.classTsid === vendorSelected);
    const quote = isBuy ? null : createVendorSellQuote(inv, activeVendor.offers, vendorSelected, vendorQty);
    if (!isBuy && !quote?.ok) {
      vendorSelected = null;
      renderVendorList();
      return;
    }
    const label = isBuy
      ? offer?.label || ITEM_CATALOG[vendorSelected]?.label || vendorSelected
      : quote.label;
    const unit = isBuy ? offer?.buyPrice ?? 0 : quote.unitPrice;
    const have = isBuy ? countItem(inv, vendorSelected) : quote.have;
    const maxQ = isBuy
      ? unit > 0
        ? Math.max(1, Math.floor((pc.currants || 0) / unit))
        : 99
      : Math.max(1, have);
    vendorQty = Math.max(1, Math.min(vendorQty, maxQ));
    const total = unit * vendorQty;
    detail.style.display = 'block';
    detail.innerHTML = `
      <button type="button" class="btn-glitch-back" data-v-back>← Back</button>
      <div class="vendor-detail-icon"><img src="${itemIconUrl(vendorSelected)}" alt=""/></div>
      <div class="vendor-detail-body">
        <h3>${label}</h3>
        <p>${
          isBuy
            ? `Costs ${unit} currants each. You have ◎ ${pc.currants || 0}.`
            : `Will pay ${unit} currants each. You have ${have}.`
        }</p>
        <div class="qty-row">
          <button type="button" data-vq="-">−</button>
          <input type="number" min="1" max="${maxQ}" value="${vendorQty}" data-vq-val />
          <button type="button" data-vq="+">+</button>
          <button type="button" class="btn-max" data-vq="max">Max</button>
          <button type="button" class="btn-glitch-primary" data-v-go>
            ${isBuy ? `Buy: ${vendorQty} for ${total}` : `Sell: ${vendorQty} for ${total}`}
          </button>
        </div>
      </div>`;
    const applyQ = (n) => {
      vendorQty = Math.max(1, Math.min(maxQ, n));
      renderVendorList();
    };
    detail.querySelector('[data-v-back]')?.addEventListener('click', () => {
      vendorSelected = null;
      renderVendorList();
    });
    detail.querySelector('[data-vq="-"]')?.addEventListener('click', () => applyQ(vendorQty - 1));
    detail.querySelector('[data-vq="+"]')?.addEventListener('click', () => applyQ(vendorQty + 1));
    detail.querySelector('[data-vq="max"]')?.addEventListener('click', () => applyQ(maxQ));
    detail.querySelector('[data-vq-val]')?.addEventListener('change', (e) => {
      applyQ(Number(e.target.value) || 1);
    });
    detail.querySelector('[data-v-go]')?.addEventListener('click', () => {
      const r = isBuy
        ? vendorBuy(pc, inv, activeVendor.offers, vendorSelected, vendorQty)
        : vendorSell(pc, inv, activeVendor.offers, vendorSelected, vendorQty);
      toast(r.msgs[0]);
      pushActivity(r.msgs[0]);
      if (r.ok) playSfx(isBuy ? 'pickup' : 'quoin', { volume: 0.4 });
      if (r.ok) {
        emitGameEvent(`vendor_${isBuy ? 'bought' : 'sold'}:${vendorSelected}`, r.qty || vendorQty);
      }
      if (r.ok && !isBuy) {
        vendorSellReceipt = { label, qty: r.qty, gain: r.gain };
        vendorSelected = null;
        vendorQty = 1;
        if (vendorReceiptTimer) clearTimeout(vendorReceiptTimer);
        vendorReceiptTimer = setTimeout(() => {
          vendorReceiptTimer = 0;
          vendorSellReceipt = null;
          if (isVendorOpen() && vendorTab === 'sell' && !vendorSelected) renderVendorList();
        }, 2200);
      }
      updateHud();
      renderVendorList();
    });
    return;
  }

  if (detail) {
    detail.hidden = true;
    detail.innerHTML = '';
    detail.style.display = '';
  }
  list.hidden = false;
  list.innerHTML = '';

  if (vendorTab === 'buy') {
    for (const row of listBuyOffers(activeVendor.offers)) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'vendor-tile';
      tile.setAttribute('role', 'listitem');
      tile.title = row.label;
      tile.innerHTML = `
        <img src="${itemIconUrl(row.classTsid)}" alt="" />
        <span class="tile-price">◎ ${row.price}</span>
        <span class="tile-label">${row.label}</span>`;
      tile.addEventListener('click', () => {
        vendorSelected = row.classTsid;
        vendorQty = 1;
        renderVendorList();
      });
      list.appendChild(tile);
    }
  } else {
    const rows = listSellOffers(inv, activeVendor.offers);
    if (!rows.length) {
      list.innerHTML =
        '<div class="make-empty">Drag an item from your pack.<br/><small>(Or earn goods, then sell them here.)</small></div>';
      return;
    }
    for (const row of rows) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'vendor-tile';
      tile.setAttribute('role', 'listitem');
      tile.title = `${row.label} ×${row.have}`;
      tile.innerHTML = `
        <img src="${itemIconUrl(row.classTsid)}" alt="" />
        <span class="tile-price">◎ ${row.price}</span>
        <span class="tile-label">${row.label} ×${row.have}</span>`;
      tile.addEventListener('click', () => {
        vendorSelected = row.classTsid;
        vendorQty = 1;
        renderVendorList();
      });
      list.appendChild(tile);
    }
  }
}

async function ensureShrineTextures(giantId) {
  const def = { fw: 151, fh: 188, cols: 6, rows: 4 };
  for (const motion of ['open', 'close']) {
    const key = `shrine_${giantId}_${motion}`;
    if (textures[key]) continue;
    const url = `assets/sprites/shrines/${giantId}_${motion}.png`;
    const tex = await loadTexture(url);
    textures[key] = {
      def: { ...def, url },
      // Official sheets have 23 populated frames (the final grid cell is blank).
      frames: sliceSheet(tex.baseTexture, def, 23),
    };
  }
}

function refreshShrineTarget(target) {
  const giantId = target?.state?.giantId;
  const giant = GIANTS[giantId];
  if (!giant) return;
  const favor = shrineState.favor[giantId] || 0;
  const cost = emblemCostFor(shrineState, giantId);
  const emblems = shrineState.emblems[giantId] || 0;
  target.subtitle = canClaimEmblem(shrineState, giantId)
    ? `Favor ${favor}/${cost} · emblem ready!`
    : `Favor ${favor}/${cost}${emblems ? ` · ${emblems} emblem${emblems === 1 ? '' : 's'}` : ''}`;
}

function playShrineDonation(target) {
  const spr = target?.sprite;
  const giantId = target?.state?.giantId;
  const openFrames = textures[`shrine_${giantId}_open`]?.frames;
  const closeFrames = textures[`shrine_${giantId}_close`]?.frames;
  if (!spr || !openFrames?.length || !closeFrames?.length) return;
  spr.textures = openFrames;
  spr.loop = false;
  spr.animationSpeed = 0.42;
  spr.gotoAndPlay(0);
  spr.onComplete = () => {
    spr.onComplete = null;
    setTimeout(() => {
      if (spr.destroyed) return;
      spr.textures = closeFrames;
      spr.loop = false;
      spr.animationSpeed = 0.4;
      spr.gotoAndPlay(0);
      spr.onComplete = () => {
        spr.onComplete = null;
        spr.textures = openFrames;
        spr.gotoAndStop(0);
      };
    }, 420);
  };
}

async function spawnShrine(placement = null) {
  if (!entityLayer || !currentStreet) return null;
  const giant = giantForStreet(currentStreet);
  await ensureShrineTextures(giant.id);
  const frames = textures[`shrine_${giant.id}_open`]?.frames;
  if (!frames?.length) return null;
  const points = placement ? [] : samplePlatformPoints(10);
  const point = placement || points[7] || points[points.length - 1] || { x: WORLD_W * 0.72, y: GROUND_Y };
  const spr = new PIXI.AnimatedSprite(frames);
  spr.anchor.set(0.5, 1);
  spr.scale.set(0.78);
  spr.gotoAndStop(0);
  spr.x = clamp(point.x + (placement ? 0 : -95), 90, Math.max(90, WORLD_W - 90));
  spr.y = point.y + 2;
  spr.zIndex = 19;
  spr.eventMode = 'static';
  spr.cursor = 'pointer';
  entityLayer.addChild(spr);

  const target = register({
    classId: `npc_shrine_${giant.id}`,
    label: `Shrine to ${giant.name}`,
    subtitle: '',
    sprite: spr,
    state: { giantId: giant.id },
  });
  spr.shrineTarget = target;
  refreshShrineTarget(target);
  return target;
}

function spawnVendorNpc(placement = null) {
  if (!entityLayer || !player) return;
  const pts = placement ? [] : samplePlatformPoints(1);
  const p = placement || pts[0] || { x: player.x + 200, y: player.y };
  const g = new PIXI.Container();
  g.x = placement ? p.x : p.x + 120;
  g.y = p.y;
  g.zIndex = 40;
  const body = PIXI.Sprite.from('assets/decos/groddle/vendor.png');
  body.anchor.set(0.5, 1);
  body.scale.set(0.25);
  g.addChild(body);
  const crest = new PIXI.Graphics();
  crest.beginFill(activeVendor.color, 0.96);
  crest.lineStyle(2, 0xfff4cf, 1);
  crest.drawCircle(35, -84, 13);
  crest.endFill();
  g.addChild(crest);
  const badge = new PIXI.Text(activeVendor.badge, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: activeVendor.badge.length > 1 ? 9 : 12,
    fill: 0xffffff,
    fontWeight: '800',
  });
  badge.anchor.set(0.5, 0.5);
  badge.x = 35;
  badge.y = -84;
  g.addChild(badge);
  const label = new PIXI.Text(activeVendor.label, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 12,
    fill: 0x2a1a40,
    fontWeight: '700',
  });
  label.anchor.set(0.5, 1);
  label.y = -124;
  g.addChild(label);
  g.eventMode = 'static';
  g.cursor = 'pointer';
  g.on('pointerdown', () => openVendor());
  entityLayer.addChild(g);
  vendorSprite = g;
  register({
    classId: activeVendor.id,
    label: activeVendor.label,
    sprite: g,
    state: { vendorKey: activeVendor.key, vendorLabel: activeVendor.label },
  });
}

/** Plot spacing — tall enough for raised 3D soil mounds (128×96 art). */
const GARDEN_CELL_W = 52;
const GARDEN_CELL_H = 36;
const GARDEN_PAD_X = 10;
const GARDEN_PAD_Y = 8;
/** Visual size of raised dirt sprite (preserves mound aspect, not flat square). */
const GARDEN_DIRT_W = 50;
const GARDEN_DIRT_H = 38;

/**
 * Place a multi-plot crop/herb garden on the street with individually
 * clickable plots in **world coordinates** (original GardenPlotView feel).
 *
 * Plots are NOT nested local UI children — each has world x/y so hover/E
 * hit-testing works. No dialog: click/E on a plot opens the verb menu.
 *
 * @param {{ x?: number, y?: number, cols?: number, rows?: number, gardenType?: 'default'|'herb', label?: string }} [opts]
 */
function spawnGarden(opts = {}) {
  if (!entityLayer) return null;
  ensureGardenItems();
  const gardenType = opts.gardenType === 'herb' ? 'herb' : 'default';
  const cols = opts.cols || (gardenType === 'herb' ? 3 : 4);
  const rows = opts.rows || 2;
  const streetState = streetWorldState();
  const garden = streetState.gardens[gardenType] || createGarden({ cols, rows, gardenType });
  streetState.gardens[gardenType] = garden;
  // Growth continues while the player is away or the browser is closed.
  tickGarden(garden, Date.now());
  const pts = samplePlatformPoints(3);
  const p =
    pts[gardenType === 'herb' ? 2 : 0] ||
    { x: (player?.x || 400) + (gardenType === 'herb' ? 520 : 300), y: GROUND_Y };
  // Sit on the platform like original — bed bottom at ground y
  const originX = opts.x ?? p.x + (gardenType === 'herb' ? -40 : 180);
  const originY = opts.y ?? p.y + 2;

  const bedW = cols * GARDEN_CELL_W + GARDEN_PAD_X * 2;
  // Extra room for raised dirt front-faces
  const bedH = rows * GARDEN_CELL_H + GARDEN_PAD_Y * 2 + 12;

  // Bed frame in world space (beveled wood — not flat dialog chrome)
  const root = new PIXI.Container();
  root.x = originX;
  root.y = originY;
  root.zIndex = 18;
  root.eventMode = 'none';

  const wood = new PIXI.Sprite(PIXI.Texture.from('assets/sprites/garden/bed_frame_wood.png'));
  wood.anchor.set(0.5, 1);
  wood.width = bedW + 8;
  wood.height = bedH + 10;
  wood.y = 2;
  wood.eventMode = 'none';
  if (gardenType === 'herb') wood.tint = 0xd0e8b8;
  root.addChild(wood);
  root.bedFrame = wood;

  const tag = new PIXI.Text(
    opts.label || (gardenType === 'herb' ? 'Herbs' : 'Garden'),
    {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 11,
      fill: 0x3d4a28,
      fontWeight: '700',
    }
  );
  tag.anchor.set(0.5, 1);
  tag.y = -bedH - 4;
  tag.eventMode = 'none';
  root.addChild(tag);
  root.gardenTag = tag;
  root.plotViews = {};
  entityLayer.addChild(root);

  // Small foot hit for water-all only (thin strip at bed front)
  const bedFoot = new PIXI.Container();
  bedFoot.x = originX;
  bedFoot.y = originY;
  bedFoot.zIndex = 17;
  const footGfx = new PIXI.Graphics();
  footGfx.beginFill(0xffffff, 0.001);
  footGfx.drawRect(-bedW / 2, -10, bedW, 12);
  footGfx.endFill();
  bedFoot.addChild(footGfx);
  entityLayer.addChild(bedFoot);

  const gardenEntity = register({
    classId: 'garden_new',
    label: garden.label,
    subtitle: 'Water all · click plots to plant',
    sprite: bedFoot,
    state: { garden, plotTargets: [] },
  });
  gardenEntity._gardenRoot = root;
  root.gardenTarget = gardenEntity;
  gardens.push(gardenEntity);

  // Individual plots in **world** space so spriteWorldHitBox works
  for (const key of listPlotKeys(garden)) {
    const [c, r] = key.split('-').map(Number);
    const cell = new PIXI.Container();
    // Anchor bottom-center of each dirt square
    cell.x =
      originX - bedW / 2 + GARDEN_PAD_X + (c - 1) * GARDEN_CELL_W + GARDEN_CELL_W / 2;
    cell.y =
      originY - bedH + GARDEN_PAD_Y + r * GARDEN_CELL_H;
    cell.zIndex = 19 + r;
    // Explicit hit size (Containers report 0 size until children drawn)
    cell.hitArea = new PIXI.Rectangle(
      -GARDEN_CELL_W / 2,
      -GARDEN_CELL_H,
      GARDEN_CELL_W,
      GARDEN_CELL_H
    );
    entityLayer.addChild(cell);
    root.plotViews[key] = cell;

    const plotTarget = register({
      classId: 'garden_plot',
      label: `Plot ${key}`,
      subtitle: plotStatusLabel(getPlot(garden, key)),
      sprite: cell,
      state: {
        garden,
        plotKey: key,
        plot: getPlot(garden, key),
        gardenEntity,
      },
    });
    cell.plotTarget = plotTarget;
    gardenEntity.state.plotTargets.push(plotTarget);
  }

  drawGardenPlots(gardenEntity);
  return gardenEntity;
}

function plotDirtTexture(plot) {
  if (!plot || plot.state === 'dirty') return 'assets/sprites/garden/plot_dirty.png';
  if (plot.wet) return 'assets/sprites/garden/plot_wet.png';
  return 'assets/sprites/garden/plot_dry.png';
}

/**
 * Rebuild per-plot visuals on world-space cells.
 */
function drawGardenPlots(target) {
  const garden = target?.state?.garden;
  const entity =
    target?.classId === 'garden_new'
      ? target
      : target?.state?.gardenEntity ||
        gardens.find((g) => g.state?.garden === garden);
  const root = entity?._gardenRoot;
  const views = root?.plotViews;
  if (!garden || !views) return;

  for (const key of listPlotKeys(garden)) {
    const plot = getPlot(garden, key);
    const cell = views[key];
    if (!cell) continue;
    // Keep plotTarget ref
    const plotTarget = cell.plotTarget;
    cell.removeChildren();
    cell.plotTarget = plotTarget;

    // Raised 3D soil mound (front face + shaded top) — not a flat UI square
    const dirt = new PIXI.Sprite(PIXI.Texture.from(plotDirtTexture(plot)));
    dirt.anchor.set(0.5, 1);
    dirt.width = GARDEN_DIRT_W;
    dirt.height = GARDEN_DIRT_H;
    dirt.eventMode = 'none';
    cell.addChild(dirt);

    // Plants sit on top surface of the mound (~60% up the dirt sprite)
    const plantY = -Math.round(GARDEN_DIRT_H * 0.42);

    const seed = plot?.seed ? SEED_CATALOG[plot.seed] : null;
    if (plot?.state === 'seeds') {
      const dots = new PIXI.Graphics();
      dots.beginFill(0xf5e6a8, 0.95);
      dots.drawCircle(-5, plantY - 2, 2.2);
      dots.drawCircle(5, plantY - 1, 2);
      dots.drawCircle(0, plantY - 5, 1.8);
      dots.endFill();
      dots.eventMode = 'none';
      cell.addChild(dots);
    } else if (plot?.state === 'shoots') {
      const sprout = new PIXI.Sprite(
        PIXI.Texture.from('assets/sprites/garden/plot_seedling.png')
      );
      sprout.anchor.set(0.5, 1);
      sprout.scale.set(0.95);
      sprout.y = plantY;
      sprout.eventMode = 'none';
      cell.addChild(sprout);
    } else if (plot?.state === 'crop' && seed) {
      const stalk = new PIXI.Sprite(
        PIXI.Texture.from('assets/sprites/garden/plot_seedling.png')
      );
      stalk.anchor.set(0.5, 1);
      stalk.scale.set(1.25);
      stalk.y = plantY;
      stalk.eventMode = 'none';
      cell.addChild(stalk);
      const produce = new PIXI.Sprite(PIXI.Texture.from(cropIcon(seed.cropId)));
      produce.anchor.set(0.5, 1);
      produce.scale.set(0.52);
      produce.y = plantY - 26;
      produce.eventMode = 'none';
      cell.addChild(produce);
    } else if (plot?.state === 'dirty') {
      // Weeds already partly baked into dirty tile; add a few taller blades
      const weeds = new PIXI.Graphics();
      weeds.beginFill(0x4a5a30, 0.9);
      weeds.moveTo(-7, plantY + 4);
      weeds.lineTo(-3, plantY - 10);
      weeds.lineTo(1, plantY + 4);
      weeds.lineTo(4, plantY - 8);
      weeds.lineTo(8, plantY + 4);
      weeds.endFill();
      weeds.eventMode = 'none';
      cell.addChild(weeds);
    }

    // Ensure hit area stays after redraw
    cell.hitArea = new PIXI.Rectangle(
      -GARDEN_CELL_W / 2,
      -GARDEN_CELL_H,
      GARDEN_CELL_W,
      GARDEN_CELL_H
    );
    // Fake dimensions for spriteWorldHitBox (uses spr.width/height)
    cell._gardenHitW = GARDEN_CELL_W;
    cell._gardenHitH = GARDEN_CELL_H;

    if (plotTarget) {
      plotTarget.state.plot = plot;
      plotTarget.subtitle = plotStatusLabel(plot);
      const cropLab = seed?.cropLabel || '';
      plotTarget.label =
        plot?.state === 'crop'
          ? `${cropLab} (ready)`
          : plot?.state === 'clean'
            ? `Empty plot`
            : plot?.state === 'dirty'
              ? `Dirty plot`
              : cropLab
                ? `${cropLab} growing`
                : `Plot ${key}`;
    }
  }

  if (root?.gardenTag) {
    const ripe = listPlotKeys(garden).filter((k) => getPlot(garden, k)?.state === 'crop')
      .length;
    const base = garden.gardenType === 'herb' ? 'Herbs' : 'Garden';
    root.gardenTag.text = ripe ? `${base} · ${ripe} ready` : base;
  }
  if (entity) {
    entity.subtitle = 'Click a plot · water all on bed edge';
  }
}

function refreshGardenVisual(target) {
  const garden = target?.state?.garden || target?.state?.gardenEntity?.state?.garden;
  const entity =
    target?.classId === 'garden_new'
      ? target
      : target?.state?.gardenEntity ||
        gardens.find((g) => g.state?.garden === garden);
  if (entity) drawGardenPlots(entity);
}

function tickAllGardens(now = Date.now()) {
  for (const t of gardens) {
    const garden = t.state?.garden;
    if (!garden) continue;
    const changed = tickGarden(garden, now);
    if (changed.length) {
      refreshGardenVisual(t);
      if (activeGarden === garden && isGardenOpen()) renderGardenPanel();
    }
  }
  tickAllMineRocks(now);
}

/**
 * Spawn a strip of mineable rocks (GSJS rock types) along platforms.
 */
function spawnMineRocks(typesOverride = null, placements = null) {
  if (!entityLayer) return;
  ensureMiningItems();
  const rockDemo = String(
    new URLSearchParams(location.search).get('rockdemo') || ''
  ).toLowerCase();
  const demoClasses = {
    metal: 'rock_metal_1',
    dullite: 'rock_dullite_1',
    beryl: 'rock_beryl_1',
    sparkly: 'rock_sparkly_1',
  };
  const types = demoClasses[rockDemo] ? [demoClasses[rockDemo]] : typesOverride || [
    'rock_metal_1',
    'rock_dullite_1',
    'rock_beryl_1',
    'rock_sparkly_1',
    'rock_metal_1',
  ];
  const pts = placements || samplePlatformPoints(types.length + 2).slice(1);
  types.forEach((classTsid, i) => {
    const def = ROCK_CATALOG[classTsid];
    if (!def) return;
    const p = pts[i] || {
      x: 200 + i * 160,
      y: GROUND_Y,
    };
    // A shared placement plan already reserves room around gardens and trees.
    const x = placements ? (p.x || 200) : (p.x || 200) + 80 + i * 40;
    const y = p.y || GROUND_Y;
    spawnMineRock(classTsid, x, y, i);
  });
  streetWorldState().rocks.length = types.length;
  if (app?.view) {
    app.view.dataset.rockPopulation = mineRocks
      .map((target) => {
        const root = target.sprite;
        return `${target.classId}:${root?.rockFrameW || 0}x${root?.rockFrameH || 0}:${root?.rockFrames?.length || 0}`;
      })
      .join(',');
  }
}

/**
 * @param {string} classTsid
 * @param {number} x
 * @param {number} y
 * @param {number} index
 */
function spawnMineRock(classTsid, x, y, index = 0) {
  const def = ROCK_CATALOG[classTsid] || ROCK_CATALOG.rock_metal_1;
  const rock = createMineRock(def.classTsid);
  const streetState = streetWorldState();
  const savedRock = streetState.rocks[index]?.classId === def.classTsid
    ? streetState.rocks[index].rock
    : null;
  if (savedRock) Object.assign(rock, savedRock, { classTsid: def.classTsid });
  tickMineRock(rock, Date.now());
  streetState.rocks[index] = { classId: def.classTsid, rock };
  const root = new PIXI.Container();
  root.x = x;
  root.y = y;
  root.zIndex = 22;
  root.eventMode = 'static';
  root.cursor = 'pointer';
  // Hit box ~ rock width
  root.hitArea = new PIXI.Rectangle(-48, -90, 96, 92);
  root._mineHitW = 96;
  root._mineHitH = 90;

  const loadedFrames = textures[def.textureKey]?.frames || [];
  const fallbackTexture = PIXI.Texture.from(`${def.worldSheet}?v=exact-rock-cells-1`);
  const spr = new PIXI.Sprite(loadedFrames[0] || fallbackTexture);
  spr.anchor.set(0.5, 1);
  // Use exact, preloaded frame cells. Creating a subtexture before an image
  // finishes loading can leave a permanently invalid frame (the missing
  // Sparkly Rock failure).
  const fw = def.frameWidth;
  const fh = def.frameHeight;
  spr.scale.set(0.85);
  spr.eventMode = 'none';
  root.addChild(spr);
  root.rockSprite = spr;
  root.rockFrames = loadedFrames;
  root.rockFrameW = fw;
  root.rockFrameH = fh;
  root.rockBaseTex = fallbackTexture;

  const tag = new PIXI.Text(def.label, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 11,
    fill: 0x4a4035,
    fontWeight: '700',
  });
  tag.anchor.set(0.5, 1);
  tag.y = -fh * 0.85 - 4;
  tag.eventMode = 'none';
  root.addChild(tag);
  root.rockTag = tag;

  entityLayer.addChild(root);

  const target = register({
    classId: def.classTsid,
    label: def.label,
    subtitle: rockStatusLabel(rock),
    sprite: root,
    state: { rock },
  });
  root.mineTarget = target;
  mineRocks.push(target);
  refreshMineRockVisual(target);
  return target;
}

function refreshMineRockVisual(target) {
  const rock = target?.state?.rock;
  const root = target?.sprite;
  if (!rock || !root?.rockSprite) return;
  tickMineRock(rock);
  const base = root.rockBaseTex;
  const fw = root.rockFrameW || 130;
  const fh = root.rockFrameH || 114;
  const fi = rockFrameIndex(rock);
  const frames = root.rockFrames || [];
  if (frames[fi]) {
    root.rockSprite.texture = frames[fi];
  } else if (base?.baseTexture?.valid) {
    root.rockSprite.texture = new PIXI.Texture(
      base.baseTexture || base,
      new PIXI.Rectangle(fi * fw, 0, fw, fh)
    );
  }
  root.rockSprite.alpha = rock.depleted ? 0.35 : 1;
  if (root.rockTag) {
    root.rockTag.text = rock.depleted
      ? `${ROCK_CATALOG[rock.classTsid]?.label || 'Rock'} (empty)`
      : ROCK_CATALOG[rock.classTsid]?.label || 'Rock';
  }
  target.subtitle = rockStatusLabel(rock);
  target.label = ROCK_CATALOG[rock.classTsid]?.label || target.label;
}

function tickAllMineRocks(now = Date.now()) {
  for (const t of mineRocks) {
    const rock = t.state?.rock;
    if (!rock) continue;
    if (tickMineRock(rock, now)) {
      refreshMineRockVisual(t);
      pushActivity(`${t.label} reforms — ready to mine.`);
    } else if (rock.depleted) {
      // Keep subtitle countdown fresh occasionally
      t.subtitle = rockStatusLabel(rock);
    }
  }
}

function openGardenPanel(target) {
  closeFeatPanel();
  if (isShrineOpen()) closeShrinePanel();
  closeMap();
  closeQuestPanel();
  closeAchievePanel();
  closeSkillsPanel();
  closeBuffsPanel();
  closeVendor();
  closeMakePanel();
  const garden = target?.state?.garden;
  if (!garden) {
    toast('No garden data.');
    return;
  }
  activeGarden = garden;
  // Prefer seeds that fit this garden type
  const plantable = listPlantableSeeds(inv, garden.gardenType || 'default');
  if (!gardenSeedPick || !plantable.some((s) => s.seedId === gardenSeedPick)) {
    gardenSeedPick = plantable[0]?.seedId || null;
  }
  const panel = document.getElementById('garden-panel');
  if (panel) {
    renderGardenPanel();
    panel.hidden = false;
  }
}

function closeGardenPanel() {
  const panel = document.getElementById('garden-panel');
  if (panel) panel.hidden = true;
}

function isGardenOpen() {
  const panel = document.getElementById('garden-panel');
  return panel && !panel.hidden;
}

function renderGardenPanel() {
  const garden = activeGarden;
  const plotsEl = document.getElementById('garden-plots');
  const seedBar = document.getElementById('garden-seed-bar');
  const meta = document.getElementById('garden-meta');
  const title = document.getElementById('garden-title');
  if (!garden || !plotsEl) return;
  const gType = garden.gardenType || 'default';
  if (title) title.textContent = garden.label || (gType === 'herb' ? 'Herb Garden' : 'Crop Garden');
  if (meta) {
    const ripe = listPlotKeys(garden).filter((k) => getPlot(garden, k)?.state === 'crop').length;
    const tools = [
      hasWateringCan(inv) ? 'can ✓' : 'need can',
      hasHoe(inv) ? 'hoe ✓' : 'need hoe',
    ].join(' · ');
    meta.textContent = `${garden.cols}×${garden.rows} ${
      gType === 'herb' ? 'herb' : 'crop'
    } plots · ${ripe} ready · ${tools} · energy ${Math.floor(pc.energy)}`;
  }

  // Seed picker (filtered to this garden type)
  if (seedBar) {
    seedBar.innerHTML = '';
    const plantable = listPlantableSeeds(inv, gType);
    if (!plantable.length) {
      const empty = document.createElement('span');
      empty.className = 'garden-seed-chip';
      empty.textContent =
        gType === 'herb' ? 'No herb seeds — buy from vendor' : 'No crop seeds — buy from vendor';
      empty.disabled = true;
      seedBar.appendChild(empty);
    } else {
      for (const s of plantable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'garden-seed-chip' + (gardenSeedPick === s.seedId ? ' active' : '');
        btn.innerHTML = `<img src="${seedIcon(s.seedId)}" alt=""/> ${s.label.replace(/ Seed$/, '')} ×${countItem(inv, s.seedId)}`;
        btn.addEventListener('click', () => {
          gardenSeedPick = s.seedId;
          renderGardenPanel();
        });
        seedBar.appendChild(btn);
      }
    }
  }

  plotsEl.innerHTML = '';
  plotsEl.style.gridTemplateColumns = `repeat(${garden.cols}, minmax(72px, 1fr))`;
  const now = Date.now();
  for (const key of listPlotKeys(garden)) {
    const plot = getPlot(garden, key);
    const seed = plot?.seed ? SEED_CATALOG[plot.seed] : null;
    const action = suggestedPlotAction(plot, inv, gType);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `garden-plot ${plot?.state || 'clean'}${plot?.wet ? ' wet' : ''}`;
    cell.setAttribute('role', 'listitem');
    cell.title = plotStatusLabel(plot);
    const iconSrc =
      plot?.state === 'crop' && seed
        ? cropIcon(seed.cropId)
        : seed
          ? seedIcon(seed.seedId)
          : '';
    const prog = plotGrowProgress(plot, now);
    cell.innerHTML = `
      ${iconSrc ? `<img class="gp-icon" src="${iconSrc}" alt=""/>` : '<span class="gp-icon"></span>'}
      <span class="gp-state">${key}</span>
      <span>${plotStatusLabel(plot)}</span>
      ${action ? `<span class="gp-action">${action}</span>` : ''}
      ${
        plot?.state === 'seeds' || plot?.state === 'shoots'
          ? `<div class="gp-bar"><i style="width:${Math.round(prog * 100)}%"></i></div>`
          : ''
      }`;
    cell.addEventListener('click', () => {
      runGardenPlotAction(key, action);
    });
    plotsEl.appendChild(cell);
  }
}

function runGardenPlotAction(key, action) {
  if (!activeGarden) return;
  const opts = { seedId: gardenSeedPick, now: Date.now(), inv, toolState };
  let r;
  if (action === 'plant') r = plantPlot(activeGarden, key, inv, pc, gardenSeedPick, opts);
  else if (action === 'water') r = waterPlot(activeGarden, key, pc, opts);
  else if (action === 'harvest') r = harvestPlot(activeGarden, key, inv, pc, opts);
  else if (action === 'clear') r = clearPlot(activeGarden, key, pc, opts);
  else {
    r = tendPlot(activeGarden, key, inv, pc, opts);
  }
  if (!r.ok) {
    toast(r.msgs?.[0] || 'Cannot do that.');
    return;
  }
  if (action === 'harvest' && r.cropId) {
    const kind = activeGarden.gardenType === 'herb' ? 'herb_harvest' : 'garden_harvest';
    emitGameEvent(`${kind}:${r.cropId}`, r.count || 1);
  }
  if (r.effects) {
    pushActivity({
      base: r.msgs?.[0] || 'You tended a plot',
      effects: r.effects,
    });
  } else {
    pushActivity(r.msgs?.[0]);
  }
  toast(r.msgs?.[0] || 'Done.');
  playSfx('pickup', { volume: 0.45, rate: 1.1 });
  if (player) floatText(player.x, player.y - 70, r.reason || '✓', 0x7dcea0);
  for (const t of gardens) {
    if (t.state?.garden === activeGarden) refreshGardenVisual(t);
  }
  updateHud();
  renderGardenPanel();
}

async function main() {
  const root = document.getElementById('game-root');
  syncCameraSafeArea();
  window.addEventListener('resize', () => {
    syncCameraSafeArea();
    refreshPackPagers();
    if (player && Number.isFinite(WORLD_W)) {
      camTarget = cameraTargetForPlayer(player.x, player.vx || 0);
      if (world) world.x = -Math.round(camTarget * 2) / 2;
    }
  });
  app = new PIXI.Application({
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: 0x8ec8e8,
    antialias: false,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  app.view.setAttribute('role', 'application');
  app.view.setAttribute('aria-label', 'Groddle game world');
  app.view.tabIndex = 0;
  root.insertBefore(app.view, document.getElementById('overlay'));

  await loadSheets();
  await loadTrantTables();
  await loadAudio();
  features.init(engine);

  world = new PIXI.Container();
  entityLayer = new PIXI.Container();
  entityLayer.sortableChildren = true;
  fxLayer = new PIXI.Container();
  // bgLayer filled by enterStreet
  bgLayer = new PIXI.Container();
  world.addChild(bgLayer, entityLayer, fxLayer);
  app.stage.addChild(world);

  player = makePlayer();
  playerSpeechTarget = { name: 'Ur', label: 'Ur', classId: 'pc_player', sprite: player };
  entityLayer.addChild(player);

  prompt = new PIXI.Text('', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 14,
    fill: 0xffffff,
    fontWeight: '700',
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowBlur: 2,
    dropShadowDistance: 1,
  });
  prompt.anchor.set(0.5, 1);
  prompt.visible = false;
  fxLayer.addChild(prompt);

  // Load mined GSJS catalogs (quests / achievements / skills / buffs)
  await loadContentCatalogs();
  const summerCatalog = getQuestCatalog();
  if (summerCatalog[SUMMERS_DAY_QUEST_ID]) {
    Object.assign(summerCatalog[SUMMERS_DAY_QUEST_ID], {
      desc: 'Enter a shared memory of the Giants and follow it to the way home.',
      offer: SUMMERS_DAY_OFFER,
      completion: SUMMERS_DAY_COMPLETION.replace('{pc_label}', 'friend'),
    });
    if (summerCatalog[SUMMERS_DAY_QUEST_ID].requirements?.[0]) {
      summerCatalog[SUMMERS_DAY_QUEST_ID].requirements[0].desc =
        'Find the way out of A Summer’s Day';
    }
  }
  if (summerCatalog[SUMMERS_DAY_REPEAT_QUEST_ID]) {
    Object.assign(summerCatalog[SUMMERS_DAY_REPEAT_QUEST_ID], {
      desc: 'Return to the Giants’ shared memory and reminisce A Summer’s Day.',
      offer: SUMMERS_DAY_REPEAT_OFFER,
      completion: SUMMERS_DAY_REPEAT_COMPLETION.replace('{pc_label}', 'friend'),
    });
    if (summerCatalog[SUMMERS_DAY_REPEAT_QUEST_ID].requirements?.[0]) {
      summerCatalog[SUMMERS_DAY_REPEAT_QUEST_ID].requirements[0].desc =
        'Find the way out of A Summer’s Day';
    }
  }
  for (const classTsid of Object.keys(MUSICBLOCK_CATALOG)) {
    if (countItem(inv, classTsid) > 0) {
      applyAchievementProgress(achieveState, `in_inventory:${classTsid}`, 1, pc);
    }
  }
  await loadRecipeCatalog();
  ensureMakingItems();
  await loadTransitionAssets();
  // Starter quests from mined catalog (ignore prereqs for onboarding)
  assignQuest(questState, 'animalkinship_pet_piggies', { ignorePrereq: true });
  assignQuest(questState, 'animalkinship_milk_butterflies', { ignorePrereq: true });
  // Free starter skill with no skill prereqs if present
  grantSkill(skillState, 'animalkinship_1', true);
  // Cooking / blending so GSJS recipes with skill tags are craftable in the demo
  grantSkill(skillState, 'ezcooking_1', true);
  grantSkill(skillState, 'cheffery_1', true);
  grantSkill(skillState, 'blending_1', true);
  grantSkill(skillState, 'blending_2', true);
  // Mining / smelting / refining / alchemy II / metalworking chain
  for (const sk of STARTER_MINING_SKILLS) {
    grantSkill(skillState, sk, true);
  }

  // Full locations-xml street catalog (index.json), then last saved street (or default)
  await Promise.all([ensureStreetIndex(), loadStreetEcologyCatalog()]);
  const bootParams = new URLSearchParams(location.search);
  if (bootParams.has('resetgame')) {
    try {
      localStorage.removeItem(PLAYER_STATE_STORAGE_KEY);
      localStorage.removeItem(DROPPED_ITEMS_STORAGE_KEY);
      localStorage.removeItem(LOCATION_STORAGE_KEY);
      resetGameDayClock();
    } catch { /* storage unavailable */ }
  }
  if (bootParams.has('resetdrops')) {
    try { localStorage.removeItem(DROPPED_ITEMS_STORAGE_KEY); } catch { /* storage unavailable */ }
  }
  droppedItemState = loadDroppedItems();
  const savedPlayerState = loadPlayerState();
  if (savedPlayerState) {
    const savedFeatureSlices = {};
    restorePlayerSave(savedPlayerState, inv, pc, {
      ...persistentSystems(),
      features: savedFeatureSlices,
      world: persistentWorldState,
    });
    features.restore(savedFeatureSlices, engine);
    restoreAnimalStateCache();
    rehydrateSavedBuffs();
    const mainQuests = ['animalkinship_pet_piggies', 'animalkinship_milk_butterflies'];
    state.questDone = mainQuests.every((id) => questState.completed.includes(id));
    handleSkillCompletions(tickSkillStudy(skillState, Date.now()).completed, { offline: true });
  }
  const homeDemo = String(bootParams.get('homedemo') || '').toLowerCase();
  if (homeDemo) {
    pc.currants = Math.max(pc.currants, HOME_PURCHASE_COST + 250);
    if (['owned', 'mail', 'home', 'interior'].includes(homeDemo) && !homeState.owned) {
      purchaseHome(homeState, pc, bootParams.get('homestyle') || 'meadow', Date.now() - 60_000);
    }
    if (homeState.owned) seedMailbox(mailboxState, Date.now());
  }
  const resumeHomeAtBoot = homeState.owned && homeState.inHome;
  // One-time inventory migration for saves created before the Wood Tree loop.
  // A deliberate zero remains zero, so dropped Hatchets do not respawn.
  if (inv.hatchet === undefined) inv.hatchet = 1;
  // This slice introduces one source ticket for each supplied Paradise video.
  // Preserve deliberate zeroes after a ticket has been activated or dropped.
  for (const ticketId of PARADISE_TICKET_IDS) {
    if (inv[ticketId] === undefined) inv[ticketId] = 1;
  }
  // Deterministic source-item QA: plain keeps both accessories available,
  // while kiss/moon/all exercise each official persistent bear state.
  if (bootParams.has('beardemo')) {
    const demo = String(bootParams.get('beardemo') || 'plain').toLowerCase();
    const upgrades = demo === 'all'
      ? ['kiss', 'moon']
      : demo === 'kiss'
        ? ['kiss']
        : demo === 'moon'
          ? ['moon']
          : [];
    Object.assign(emotionalBearState, createEmotionalBearState({ upgrades }));
    inv[EMOTIONAL_BEAR_ID] = 1;
    inv.lips = upgrades.includes('kiss') ? 0 : 1;
    inv.moon = upgrades.includes('moon') ? 0 : 1;
  }
  // This slice ships with a Tinkertool, so existing saves also receive the entry repair skill.
  grantSkill(skillState, 'tinkering_1', true);
  // Expose the original food-variety loop in the focused demo, including on older saves.
  pc.imaginationUpgrades ||= [];
  if (!pc.imaginationUpgrades.includes(FOOD_VARIETY_UPGRADE)) {
    pc.imaginationUpgrades.push(FOOD_VARIETY_UPGRADE);
  }
  // There is no imagination-upgrade shop in this focused remake yet, so grant
  // the official entry Triple Jump to fresh and existing demo saves.
  if (!TRIPLE_JUMP_UPGRADES.some((profile) => pc.imaginationUpgrades.includes(profile.id))) {
    pc.imaginationUpgrades.push(TRIPLE_JUMP_UPGRADES[0].id);
  }
  const jumpDemoValue = String(bootParams.get('jumpdemo') || '').toLowerCase();
  const jumpDemoProfile = jumpDemoValue
    ? TRIPLE_JUMP_UPGRADES[
        jumpDemoValue === 'big' || jumpDemoValue === '3'
          ? 2
          : jumpDemoValue === 'medium' || jumpDemoValue === '2'
            ? 1
            : 0
      ]
    : null;
  if (jumpDemoProfile) {
    pc.imaginationUpgrades = pc.imaginationUpgrades.filter(
      (id) => !TRIPLE_JUMP_UPGRADES.some((profile) => profile.id === id)
    );
    pc.imaginationUpgrades.push(jumpDemoProfile.id);
  }
  // Deterministic progression QA: the next 5 iMG crosses into level 6.
  if (bootParams.has('leveldemo')) {
    pc.xp = 6080;
    pc.level = 5;
  }
  if (bootParams.has('quoinmult')) {
    quoinState.multiplier = clamp(Number(bootParams.get('quoinmult')) || 1, 1, 100);
  }
  // Deterministic persistent-study QA route. Direct prerequisites are granted
  // so the requested catalog skill can always be inspected in progress.
  if (bootParams.has('skilldemo')) {
    const demoSkill = getSkillCatalog()[bootParams.get('skilldemo')]
      ? bootParams.get('skilldemo')
      : 'animalkinship_2';
    const def = getSkillCatalog()[demoSkill];
    skillState.learned = skillState.learned.filter((id) => id !== demoSkill);
    delete skillState.queue[demoSkill];
    for (const prereq of def.reqSkills || []) grantSkill(skillState, prereq, true);
    for (const questId of def.reqQuests || []) {
      if (!questState.completed.includes(questId)) questState.completed.push(questId);
    }
    for (const achievementId of def.reqAchievements || []) {
      if (!achieveState.unlocked.includes(achievementId)) achieveState.unlocked.push(achievementId);
    }
    startSkillStudy(skillState, demoSkill, skillStudyContext(), Date.now());
    const remaining = Number(bootParams.get('skillremaining'));
    if (Number.isFinite(remaining) && remaining > 0) {
      skillState.queue[demoSkill].endsAt = Date.now() + Math.max(1, remaining) * 1000;
    }
  }
  // Deterministic food-memory QA. `day` is two game days ago because the
  // official server used Math.round(days) and required a result greater than 1.
  if (bootParams.has('fooddemo')) {
    const demoFood = getItemUseInfo(bootParams.get('fooddemo'))?.effects?.energy
      ? bootParams.get('fooddemo')
      : 'sammich';
    inv[demoFood] = Math.max(1, inv[demoFood] || 0);
    pc.energy = Math.min(pc.energy, 50);
    foodState.foodToday = 0;
    const age = String(bootParams.get('foodlast') || 'first').toLowerCase();
    if (age === 'recent') foodState.history[demoFood] = Date.now();
    else if (age === 'day') foodState.history[demoFood] = Date.now() - 2 * GAME_DAY_MS;
    else if (age === 'month') foodState.history[demoFood] = Date.now() - 31 * GAME_DAY_MS;
    else delete foodState.history[demoFood];
  }
  const buffDemoItem = getBuffItemInfo(bootParams.get('buffdemo'))?.classTsid || null;
  if (buffDemoItem) inv[buffDemoItem] = Math.max(1, inv[buffDemoItem] || 0);
  if (bootParams.get('stootdollitem') === '1') {
    inv[STOOT_DOLL_ID] = 1;
  }
  const cubimalDemoSeries = Number(bootParams.get('cubimaldemo'));
  const cubimalDemoPackage = CUBIMAL_PACKAGE_IDS[cubimalDemoSeries] || null;
  if (cubimalDemoPackage) {
    inv[cubimalDemoPackage] = 1;
  }
  const cubimalDemoItem = cubimalInfo(bootParams.get('cubimalitem'));
  if (cubimalDemoItem) {
    inv[cubimalDemoItem.classTsid] = 1;
  }
  const toolDemo = TOOL_CONDITION_CATALOG[bootParams.get('tooldemo')]
    ? bootParams.get('tooldemo')
    : null;
  if (toolDemo) {
    inv[toolDemo] = Math.max(1, inv[toolDemo] || 0);
    const requested = bootParams.has('toolremaining')
      ? Number(bootParams.get('toolremaining'))
      : Math.max(1, Math.floor(TOOL_CONDITION_CATALOG[toolDemo].capacity * 0.12));
    setToolRemaining(toolState, toolDemo, requested);
  }
  const featureStart = features.query('reloadLocation', loadPlayerLocation(), engine);
  const savedLoc = featureStart
    ? resolveSavedLocation(featureStart)
    : bootParams.has('fresh') ? null : resolveSavedLocation(loadPlayerLocation());
  const stootDemoTsid = bootParams.has('stootdemo')
    ? resolveIndexTsid(STOOT_MEMORIAL_STREET_ID)
    : null;
  const streetDemoTsid = bootParams.has('streetdemo')
    ? resolveIndexTsid(bootParams.get('streetdemo'))
    : null;
  const followDemoTsid = bootParams.has('followdemo')
    ? resolveIndexTsid(LAST_FEAT_STREET_IDS[0])
    : null;
  const focusedDemoTsid = streetDemoTsid || stootDemoTsid || followDemoTsid;
  const startTsid = focusedDemoTsid || savedLoc?.tsid || STREET_INDEX.default;
  const demoX = bootParams.has('streetx') ? Number(bootParams.get('streetx')) : NaN;
  const demoY = bootParams.has('streety') ? Number(bootParams.get('streety')) : NaN;
  const startOpts = focusedDemoTsid
    ? {
        ...(Number.isFinite(demoX) ? { spawnX: demoX } : {}),
        ...(Number.isFinite(demoY) ? { spawnY: demoY } : {}),
        quiet: true,
      }
    : savedLoc
      ? { spawnX: savedLoc.x, spawnY: savedLoc.y, quiet: true }
      : {};
  const questDemo = String(bootParams.get('questdemo') || '').toLowerCase();
  const paradiseDemoRaw = String(bootParams.get('paradise') || '').toLowerCase().replace(/[-\s]+/g, '_');
  const paradiseDemo = PARADISE_COURSES[paradiseDemoRaw]
    ? paradiseDemoRaw
    : paradiseDemoRaw === 'cloud'
      ? 'cloud_rings'
      : paradiseDemoRaw === 'radial'
        ? 'radial_heights'
        : paradiseDemoRaw === 'starlit' || paradiseDemoRaw === 'night'
          ? 'starlit_night'
          : paradiseDemoRaw === 'slip' || paradiseDemoRaw === 'slide'
            ? 'slip_n_slide'
          : null;
  const winterDemo = ['winter', 'winter-walk', 'snow', 'winter2'].includes(questDemo);
  const winterDemoRepeat =
    questDemo === 'winter2' || bootParams.get('winterrepeat') === '1';
  const summerDemo = ['summer', 'summers-day', 'summer2'].includes(questDemo);
  const summerDemoRepeat =
    questDemo === 'summer2' || bootParams.get('summerrepeat') === '1';
  const greedyDemo = ['greedy', 'greedy-story', 'street-spirit', 'greedy2'].includes(questDemo);
  const greedyDemoRepeat =
    questDemo === 'greedy2' || bootParams.get('greedyrepeat') === '1';
  const rookDemo = ['rook', 'rooks', 'rook-woods', 'rookegg'].includes(questDemo);
  const rookMuseumDemo = ['rookmuseum', 'rook-museum', 'museum', 'rookhall'].includes(questDemo);
  const eestiDemo = [
    'eesti',
    'de-embiggenify',
    'deembiggenify',
    'catalogue',
    'catalog',
  ].includes(questDemo);
  if (questDemo === 'phantom' || questDemo === 'ghost') {
    questState.completed = questState.completed.filter((id) => id !== PHANTOM_QUEST_ID);
    if (!questState.active[PHANTOM_QUEST_ID]) {
      assignQuest(questState, PHANTOM_QUEST_ID, { ignorePrereq: true });
    }
    const story = ensureGhostQuestState(questState, availableStreetTsids(), {
      reset: bootParams.get('ghostreset') === '1',
    });
    const step = clamp(Math.floor(Number(bootParams.get('ghoststep')) || 0), 0, PHANTOM_HAUNT_COUNT);
    story.foundStreets = story.hauntStreets.slice(0, step);
    story.finalReady = step >= PHANTOM_HAUNT_COUNT;
    story.heartGranted = false;
    questState.active[PHANTOM_QUEST_ID].progress.found_ghost = step;
    questState.active[PHANTOM_QUEST_ID].progress.got_heart = 0;
    if (step < PHANTOM_HAUNT_COUNT && (bootParams.get('ghosthere') === '1' || questDemo)) {
      story.hauntStreets = story.hauntStreets.filter((id) => id !== startTsid);
      story.hauntStreets.splice(step, 0, startTsid);
      story.hauntStreets = story.hauntStreets.slice(0, PHANTOM_HAUNT_COUNT);
    }
    questState.story.phantom = story;
  } else if (questDemo === 'remember' || questDemo === 'heart') {
    if (!questState.completed.includes(PHANTOM_QUEST_ID)) {
      questState.completed.push(PHANTOM_QUEST_ID);
    }
    delete questState.active[PHANTOM_QUEST_ID];
    if (!questState.active[REMEMBER_QUEST_ID]) {
      assignQuest(questState, REMEMBER_QUEST_ID, { ignorePrereq: true });
    }
    inv[FADED_HEART_ID] = Math.max(1, inv[FADED_HEART_ID] || 0);
    const story = ensureGhostQuestState(questState, availableStreetTsids());
    const step = clamp(Math.floor(Number(bootParams.get('ghoststep')) || 0), 0, 12);
    story.heartGranted = true;
    story.rememberedStreets = availableStreetTsids()
      .filter((id) => id !== startTsid)
      .slice(0, step);
    story.memoryCooldownUntil = 0;
    questState.active[REMEMBER_QUEST_ID].progress.faded_heart_remembered = step;
    questState.story.phantom = story;
  } else if (questDemo === 'hoghaul' || questDemo === 'hog' || questDemo === 'race') {
    questState.completed = questState.completed.filter((id) => id !== HOG_HAUL_QUEST_ID);
    if (!questState.active[HOG_HAUL_QUEST_ID]) {
      assignQuest(questState, HOG_HAUL_QUEST_ID, { ignorePrereq: true });
    }
  } else if (
    questDemo === 'legalize' ||
    questDemo === 'papers' ||
    questDemo === 'back-alley'
  ) {
    questState.completed = questState.completed.filter((id) => id !== LEGALIZE_QUEST_ID);
    delete questState.active[LEGALIZE_QUEST_ID];
    questState.story ||= {};
    delete questState.story.legalize;
    delete inv[LEGALIZE_CARD_ID];
    assignQuest(questState, LEGALIZE_QUEST_ID, { ignorePrereq: true });
  } else if (
    questDemo === 'fourletter' ||
    questDemo === 'four-letter' ||
    questDemo === 'letters' ||
    questDemo === 'block'
  ) {
    questState.completed = questState.completed.filter((id) => id !== FOUR_LETTER_QUEST_ID);
    delete questState.active[FOUR_LETTER_QUEST_ID];
    assignQuest(questState, FOUR_LETTER_QUEST_ID, { ignorePrereq: true });
  } else if (
    questDemo === 'ilmenskie' ||
    questDemo === 'jones' ||
    questDemo === 'sealed-cavern'
  ) {
    questState.completed = questState.completed.filter((id) => id !== ILMENSKIE_QUEST_ID);
    delete questState.active[ILMENSKIE_QUEST_ID];
    questState.story ||= {};
    delete questState.story.ilmenskie;
    delete inv[HOGTIED_JONES_ID];
    assignQuest(questState, ILMENSKIE_QUEST_ID, { ignorePrereq: true });
  } else if (rookDemo) {
    questState.completed = questState.completed.filter((id) => id !== ROOK_QUEST_ID);
    delete questState.active[ROOK_QUEST_ID];
    inv.pick = Math.max(1, inv.pick || 0);
    if (!canUseTool(toolState, 'pick', 1).ok) setToolRemaining(toolState, 'pick', 100);
    assignQuest(questState, ROOK_QUEST_ID, { ignorePrereq: true });
  } else if (rookMuseumDemo) {
    questState.completed = questState.completed.filter(
      (id) => ![ROOK_HALL_START_QUEST_ID, ROOK_HALL_QUEST_ID].includes(id)
    );
    delete questState.active[ROOK_HALL_START_QUEST_ID];
    delete questState.active[ROOK_HALL_QUEST_ID];
    assignQuest(questState, ROOK_HALL_START_QUEST_ID, { ignorePrereq: true });
  } else if (winterDemo) {
    if (winterDemoRepeat && !questState.completed.includes(WINTER_WALK_QUEST_ID)) {
      questState.completed.push(WINTER_WALK_QUEST_ID);
    }
    const winterQuestId = winterDemoRepeat
      ? WINTER_WALK_REPEAT_QUEST_ID
      : WINTER_WALK_QUEST_ID;
    questState.completed = questState.completed.filter((id) => id !== winterQuestId);
    delete questState.active[winterQuestId];
    assignQuest(questState, winterQuestId, { ignorePrereq: true });
  } else if (summerDemo) {
    const summerStory = ensureSummersDayStory(questState);
    if (summerDemoRepeat) {
      if (!questState.completed.includes(SUMMERS_DAY_QUEST_ID)) {
        questState.completed.push(SUMMERS_DAY_QUEST_ID);
      }
      summerStory.firstCompletedAt ||= Date.now() - 2 * 60 * 60 * 1000;
    } else {
      questState.completed = questState.completed.filter(
        (id) => id !== SUMMERS_DAY_QUEST_ID
      );
      summerStory.firstCompletedAt = 0;
      summerStory.pendingQurazies = 0;
      summerStory.qurazyStreetTsid = '';
    }
    const summerQuestId = summerDemoRepeat
      ? SUMMERS_DAY_REPEAT_QUEST_ID
      : SUMMERS_DAY_QUEST_ID;
    questState.completed = questState.completed.filter((id) => id !== summerQuestId);
    delete questState.active[summerQuestId];
    assignQuest(questState, summerQuestId, { ignorePrereq: true });
  } else if (greedyDemo) {
    const greedyStory = ensureGreedyStory(questState);
    if (greedyDemoRepeat) {
      if (!questState.completed.includes(GREEDY_STREET_SPIRIT_QUEST_ID)) {
        questState.completed.push(GREEDY_STREET_SPIRIT_QUEST_ID);
      }
      greedyStory.firstCompletedAt ||= Date.now() - 2 * 60 * 60 * 1000;
      inv[EMOTIONAL_BEAR_ID] = Math.max(1, inv[EMOTIONAL_BEAR_ID] || 0);
    } else {
      questState.completed = questState.completed.filter(
        (id) => id !== GREEDY_STREET_SPIRIT_QUEST_ID
      );
      greedyStory.firstCompletedAt = 0;
    }
    const greedyQuestId = greedyDemoRepeat
      ? GREEDY_STREET_SPIRIT_REPEAT_ID
      : GREEDY_STREET_SPIRIT_QUEST_ID;
    questState.completed = questState.completed.filter((id) => id !== greedyQuestId);
    delete questState.active[greedyQuestId];
    assignQuest(questState, greedyQuestId, { ignorePrereq: greedyDemoRepeat });
  }
  try {
    await enterStreet(startTsid, startOpts);
    if (resumeHomeAtBoot || ['home', 'interior'].includes(homeDemo)) {
      if (!homeState.returnLocation) {
        homeState.returnLocation = {
          tsid: currentStreetTsid,
          label: currentStreet?.label || currentStreetTsid,
          hubName: currentStreet?.hubName || '',
          x: player?.x ?? null,
          y: player?.y ?? null,
        };
      }
      homeState.inHome = true;
      homeState.room = homeDemo === 'interior' ? 'interior' : homeState.room || 'street';
      await renderHomeScene(homeState.room, { spawnX: homeState.room === 'interior' ? 1030 : 250 });
    }
    if (streetDemoTsid && app?.view) app.view.dataset.streetDemo = streetDemoTsid;
    if (stootDemoTsid) {
      inv[GAMESHOW_TICKET_ID] = Math.max(1, inv[GAMESHOW_TICKET_ID] || 0);
      if (app?.view) app.view.dataset.stootDemo = '1';
    }
    if (savedLoc) {
      pushActivity(`Welcome back — ${currentStreet?.label || startTsid}`);
    }
  } catch (err) {
    console.warn('saved location failed, using default', err);
    await enterStreet(STREET_INDEX.default);
  }
  if (questDemo === 'hoghaul' || questDemo === 'hog' || questDemo === 'race') {
    await startHogHaulRace({
      autoReady: bootParams.get('racedemo') === '1',
      useTransition: bootParams.get('racefx') !== '0',
    });
  }
  if (
    questDemo === 'legalize' ||
    questDemo === 'papers' ||
    questDemo === 'back-alley'
  ) {
    await startLegalizeIt();
  }
  if (
    questDemo === 'fourletter' ||
    questDemo === 'four-letter' ||
    questDemo === 'letters' ||
    questDemo === 'block'
  ) {
    await startFourLetterQuest();
  }
  if (
    questDemo === 'ilmenskie' ||
    questDemo === 'jones' ||
    questDemo === 'sealed-cavern'
  ) {
    rememberIlmenskieSource(ensureIlmenskieState(questState), {
      tsid: currentStreetTsid,
      x: player?.x,
      y: player?.y,
    });
    setTimeout(() => openMap(), 300);
  }
  if (winterDemo) {
    await startWinterWalk({
      repeat: winterDemoRepeat,
      useTransition: bootParams.get('winterfx') !== '0',
    });
  }
  if (summerDemo) {
    await startSummersDay({
      repeat: summerDemoRepeat,
      useTransition: bootParams.get('summerfx') !== '0',
    });
  }
  if (greedyDemo) {
    await startGreedyStreetSpirit({
      repeat: greedyDemoRepeat,
      useTransition: bootParams.get('greedyfx') !== '0',
    });
  }
  if (rookDemo) {
    await startRookWoodsQuest({
      useTransition: bootParams.get('rookfx') !== '0',
    });
  }
  if (rookMuseumDemo) {
    await startRookMuseum({
      autoGreeting: true,
      useTransition: bootParams.get('rookmuseumfx') !== '0',
    });
  }
  if (eestiDemo) {
    questState.completed = questState.completed.filter(
      (id) =>
        id !== DE_EMBIGGENIFY_QUEST_ID &&
        id !== DE_EMBIGGENIFY_PART2_QUEST_ID
    );
    delete questState.active[DE_EMBIGGENIFY_QUEST_ID];
    delete questState.active[DE_EMBIGGENIFY_PART2_QUEST_ID];
    await startDeEmbiggenify({
      useTransition: bootParams.get('eestifx') !== '0',
    });
  }
  if (paradiseDemo) {
    await startParadiseFlight(paradiseDemo, {
      useTransition: bootParams.get('paradisefx') !== '0',
    });
  }
  const companionDemo = String(bootParams.get('companiondemo') || '').toLowerCase();
  if (companionDemo && localCompanions.length) {
    gatherLocalCompanions(20_000);
    app.view.dataset.localCompanionDemo = companionDemo;
    if (companionDemo === 'feat') {
      openFeatPanel();
      gatherFeatChain();
    } else {
      showLocalCompanionSpeech(
        companionDemo === 'bear' ? 'Lily Linguistic' : 'Amp',
        companionDemo === 'bear'
          ? 'Your Emotional Bear understands me completely.'
          : 'The street feels livelier with company.'
      );
    }
  }
  const followDemo = String(bootParams.get('followdemo') || '').trim();
  if (followDemo && localCompanions.length) {
    const requested = localCompanions.find(
      (actor) => actor.name.toLowerCase() === followDemo.toLowerCase()
    );
    const target = requested || localCompanionTarget('Bumbishfish') || localCompanions[0];
    if (target) {
      handleLocalCompanionTarget(target, 'follow');
      app.view.dataset.followDemo = target.name;
    }
    if (bootParams.get('followautoplay') === '1' && companionFollowState.active) {
      for (const streetTsid of LAST_FEAT_STREET_IDS.slice(1)) {
        await enterStreetWithTransition(streetTsid, {
          quiet: true,
          useTransition: bootParams.get('followfx') !== '0',
        });
      }
    }
  }
  if ((questDemo === 'phantom' || questDemo === 'ghost') && phantomTarget?.sprite && player) {
    player.x = clamp(phantomTarget.sprite.x - 105, 40, Math.max(80, WORLD_W - 40));
    player.y = phantomTarget.sprite.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    camTarget = cameraTargetForPlayer(player.x);
    camY = cameraTargetY(player.y, activeCameraWorldHeight(), LOCATION_VIEW_H);
    world.x = -camTarget;
    world.y = -camY;
    app.view.dataset.ghostDemo = phantomTarget.state.kind;
  }

  // Put one mined badge exactly N matching actions from completion. Combine
  // with caredemo, animaldemo, or the Make panel for end-to-end award QA.
  const achievementDemoId = bootParams.get('achievementdemo') || bootParams.get('badgedemo');
  if (achievementDemoId) {
    const distance = Math.max(1, Math.floor(Number(bootParams.get('achievementremaining')) || 1));
    const seeded = seedAchievementNearCompletion(achieveState, achievementDemoId, distance);
    if (seeded.ok) {
      app.view.dataset.achievementDemo = achievementDemoId;
      app.view.dataset.achievementDemoRemaining = String(distance);
      app.view.dataset.achievementDemoProgress = JSON.stringify(seeded.progress);
    }
  }

  if (jumpDemoProfile) {
    pushActivity(`${jumpDemoProfile.label} ready. Land and jump three times within half a second.`);
    app.view.dataset.jumpUpgrade = jumpDemoProfile.id;
  }

  // Deterministic shrine QA: place the player beside the current street's shrine.
  if (bootParams.has('shrinedemo')) {
    const shrine = interactables.find((target) => target.classId?.startsWith('npc_shrine_'));
    if (shrine?.sprite) {
      player.x = clamp(shrine.sprite.x, 40, Math.max(80, WORLD_W - 40));
      player.y = shrine.sprite.y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      hoverTarget = shrine;
    }
  }

  // Deterministic mining-art QA: the requested exact rock strip was spawned
  // during street construction; move beside it so every deposit can be
  // inspected without depending on the street's normal camera position.
  if (bootParams.has('rockdemo')) {
    const rockTarget = mineRocks[0];
    if (rockTarget?.sprite) {
      player.x = clamp(rockTarget.sprite.x - 72, 40, Math.max(80, WORLD_W - 40));
      player.y = rockTarget.sprite.y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      hoverTarget = rockTarget;
      app.view.dataset.rockDemo = rockTarget.classId;
    }
  }

  // Deterministic Animal Kinship QA: choose an exact official skill rank,
  // position beside the requested animal, and optionally reset its daily uses.
  if (bootParams.has('animaldemo')) {
    const animalClasses = {
      piggy: 'npc_piggy',
      chicken: 'npc_chicken',
      butterfly: 'npc_butterfly',
    };
    const requested = animalClasses[String(bootParams.get('animaldemo')).toLowerCase()]
      || 'npc_piggy';
    const animalTarget = interactables.find((target) => target.classId === requested);
    skillState.learned = skillState.learned.filter((id) => !id.startsWith('animalkinship_'));
    const animalRank = clamp(Math.floor(Number(bootParams.get('animalrank')) || 0), 0, 7);
    for (let rank = 1; rank <= animalRank; rank += 1) {
      grantSkill(skillState, `animalkinship_${rank}`, true);
    }
    if (animalTarget?.sprite) {
      if (bootParams.get('animalreset') === '1') resetAnimalDay(requested, animalTarget.state);
      player.x = clamp(animalTarget.sprite.x - 58, 40, Math.max(80, WORLD_W - 40));
      player.y = animalTarget.sprite.y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      hoverTarget = animalTarget;
      animalTarget.subtitle = animalStatusLabel(requested, animalTarget.state);
      app.view.dataset.animalDemo = requested;
      app.view.dataset.animalDemoRank = String(animalRank);
    }
  }

  // Deterministic world-dialogue QA: place the player beside one speaking
  // target so E → Talk to immediately exercises wrapped bubbles and cycling.
  if (bootParams.has('dialoguedemo')) {
    const dialogueClasses = {
      piggy: 'npc_piggy',
      chicken: 'npc_chicken',
      butterfly: 'npc_butterfly',
      fruit: 'trant_fruit',
      egg: 'trant_egg',
      bean: 'trant_bean',
      bubble: 'trant_bubble',
      gas: 'trant_gas',
      spice: 'trant_spice',
      vendor: activeVendor.classTsid,
    };
    const requested = dialogueClasses[String(bootParams.get('dialoguedemo')).toLowerCase()] || 'npc_piggy';
    const dialogueTarget = interactables.find((target) => target.classId === requested);
    if (dialogueTarget?.sprite) {
      player.x = clamp(dialogueTarget.sprite.x - 62, 40, Math.max(80, WORLD_W - 40));
      player.y = dialogueTarget.sprite.y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      hoverTarget = dialogueTarget;
      const requestedTurn = Number(bootParams.get('dialogueturn'));
      if (bootParams.has('dialogueturn') && Number.isFinite(requestedTurn) && requestedTurn >= 0) {
        dialogueTarget.state ||= {};
        dialogueTarget.state.dialogueTurn = Math.floor(requestedTurn);
      }
      app.view.dataset.dialogueDemo = requested;
    }
  }

  // Deterministic Light Green Thumb QA: position beside one living trant or
  // Wood Tree, choose the exact skill rank, and optionally reset daily care.
  if (bootParams.has('caredemo')) {
    const careClasses = {
      fruit: 'trant_fruit',
      egg: 'trant_egg',
      bean: 'trant_bean',
      bubble: 'trant_bubble',
      spice: 'trant_spice',
      gas: 'trant_gas',
      wood: 'wood_tree',
    };
    const requested = careClasses[String(bootParams.get('caredemo')).toLowerCase()] || 'trant_fruit';
    const careTarget = interactables.find((target) => target.classId === requested)
      || interactables.find((target) => TRANT_META[target.classId]);
    skillState.learned = skillState.learned.filter((id) => !id.startsWith('light_green_thumb_'));
    const careRank = clamp(Math.floor(Number(bootParams.get('careskill')) || 0), 0, 3);
    for (let rank = 1; rank <= careRank; rank += 1) {
      grantSkill(skillState, `light_green_thumb_${rank}`, true);
    }
    inv.watering_can = Math.max(1, inv.watering_can || 0);
    const wateringRemaining = Number(bootParams.get('wateringremaining'));
    if (bootParams.has('wateringremaining') && Number.isFinite(wateringRemaining)) {
      setToolRemaining(toolState, 'watering_can', wateringRemaining);
    }
    if (careTarget?.sprite) {
      if (bootParams.get('carereset') === '1') {
        careTarget.state.petted = false;
        careTarget.state.watered = false;
      }
      player.x = clamp(careTarget.sprite.x - 68, 40, Math.max(80, WORLD_W - 40));
      player.y = careTarget.sprite.y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      hoverTarget = careTarget;
      careTarget.subtitle = careTarget.classId === 'wood_tree'
        ? woodTreeStatusLabel(careTarget.state)
        : trantStatusLabel(careTarget.state, TRANT_META[careTarget.classId]);
      app.view.dataset.careDemo = careTarget.classId;
      app.view.dataset.careSkillRank = String(careRank);
      app.view.dataset.wateringCanRemaining = String(
        getToolCondition(toolState, 'watering_can').remaining
      );
    }
  }

  // Deterministic Arborology QA: expose any of the six living trants, select
  // the exact skill rank, refill/reset it, and optionally guarantee a 2×/4×
  // super harvest with `harvestroll=0`.
  if (bootParams.has('harvestdemo')) {
    const harvestClasses = {
      fruit: 'trant_fruit',
      egg: 'trant_egg',
      bean: 'trant_bean',
      bubble: 'trant_bubble',
      spice: 'trant_spice',
      gas: 'trant_gas',
    };
    const requested = harvestClasses[String(bootParams.get('harvestdemo')).toLowerCase()]
      || 'trant_fruit';
    let harvestTarget = interactables.find((target) => target.classId === requested);
    if (!harvestTarget) {
      harvestTarget = interactables.find((target) => TRANT_META[target.classId]);
      if (harvestTarget?.sprite) {
        harvestTarget.classId = requested;
        harvestTarget.label = TRANT_META[requested].label;
        harvestTarget.state = createTrantState(requested, { maturity: 10, health: 9 });
        const replacement = textureForTrant(requested, harvestTarget.state.maturity);
        if (replacement) harvestTarget.sprite.texture = replacement;
        const treeIndex = trees.indexOf(harvestTarget.sprite);
        if (treeIndex >= 0) {
          streetWorldState().trees[treeIndex] = {
            classId: requested,
            state: harvestTarget.state,
          };
        }
      }
    }
    if (harvestTarget?.sprite && bootParams.has('trantmaturity')) {
      const maturity = clamp(
        Math.floor(Number(bootParams.get('trantmaturity')) || 10),
        1,
        10
      );
      harvestTarget.state = createTrantState(requested, {
        ...harvestTarget.state,
        maturity,
      });
      const replacement = textureForTrant(requested, maturity);
      if (replacement) {
        harvestTarget.sprite.texture = replacement;
        const scale = trantDisplayScale(replacement, { targetH: 210, maxScale: 1 });
        harvestTarget.sprite.scale.set(
          (harvestTarget.sprite._woodDirection || 1) * scale,
          scale
        );
      }
      app.view.dataset.trantFrame = `${requested}:m${nearestTrantMatStage(maturity)}`;
    }
    skillState.learned = skillState.learned.filter((id) => !id.startsWith('gardening_'));
    const harvestRank = clamp(Math.floor(Number(bootParams.get('harvestrank')) || 0), 0, 5);
    for (let rank = 1; rank <= harvestRank; rank += 1) {
      grantSkill(skillState, `gardening_${rank}`, true);
    }
    const genericHarvestUpgrades = [
      'gardening_tree_super_harvest_1',
      'gardening_tree_super_harvest_2',
      'gardening_tree_super_harvest_3',
    ];
    const typeHarvestUpgrades = {
      trant_fruit: 'gardening_harvest_fruit',
      trant_egg: 'gardening_harvest_egg',
      trant_bean: 'gardening_harvest_bean',
      trant_bubble: 'gardening_harvest_bubble',
      trant_spice: 'gardening_harvest_spice',
      trant_gas: 'gardening_harvest_gas',
    };
    const allHarvestUpgrades = new Set([
      ...genericHarvestUpgrades,
      ...Object.values(typeHarvestUpgrades),
    ]);
    pc.imaginationUpgrades = (pc.imaginationUpgrades || [])
      .filter((id) => !allHarvestUpgrades.has(id));
    const superMode = String(bootParams.get('harvestsuper') || '0');
    if (superMode === '1' || superMode === '2') {
      pc.imaginationUpgrades.push('gardening_tree_super_harvest_3');
    } else if (superMode === '4') {
      pc.imaginationUpgrades.push(typeHarvestUpgrades[requested]);
    }
    if (harvestTarget?.sprite) {
      if (bootParams.get('harvestreset') === '1') {
        harvestTarget.state.harvestsToday = 0;
        refillFruit(harvestTarget.state, 1);
      }
      const fruitRemaining = Number(bootParams.get('harvestfruit'));
      if (bootParams.has('harvestfruit') && Number.isFinite(fruitRemaining)) {
        harvestTarget.state.fruitCount = clamp(
          Math.floor(fruitRemaining),
          0,
          harvestTarget.state.fruitCapacity
        );
      }
      player.x = clamp(harvestTarget.sprite.x - 68, 40, Math.max(80, WORLD_W - 40));
      player.y = harvestTarget.sprite.y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      hoverTarget = harvestTarget;
      harvestTarget.subtitle = trantStatusLabel(
        harvestTarget.state,
        TRANT_META[harvestTarget.classId]
      );
      app.view.dataset.harvestDemo = harvestTarget.classId;
      app.view.dataset.harvestRank = String(harvestRank);
      app.view.dataset.harvestFruit = String(harvestTarget.state.fruitCount);
      app.view.dataset.harvestSuperMode = superMode;
    }
  }

  // Deterministic Wood Tree QA: expose a mature unharvested tree beside the
  // player with an exact Hatchet condition for yield/wear and reload checks.
  if (bootParams.has('wooddemo')) {
    const woodTarget = interactables.find((target) => target.classId === 'wood_tree');
    if (woodTarget?.sprite) {
      const woodState = ensureWoodTreeState(woodTarget.state || (woodTarget.state = {}));
      const maturity = Number(bootParams.get('woodmaturity'));
      if (bootParams.has('woodmaturity') && Number.isFinite(maturity)) {
        woodState.maturity = clamp(Math.floor(maturity), 1, 6);
      }
      if (bootParams.get('woodreset') === '1') {
        woodState.harvestedToday = false;
        woodState.harvestCount = 0;
      }
      inv.hatchet = Math.max(1, inv.hatchet || 0);
      const remaining = Number(bootParams.get('hatchetremaining'));
      if (bootParams.has('hatchetremaining') && Number.isFinite(remaining)) {
        setToolRemaining(toolState, 'hatchet', remaining);
      }
      player.x = clamp(woodTarget.sprite.x - 72, 40, Math.max(80, WORLD_W - 40));
      player.y = woodTarget.sprite.y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      hoverTarget = woodTarget;
      refreshWoodTreeVisual(woodTarget);
      app.view.dataset.woodDemo = 'ready';
    }
  }

  // Deterministic quoin QA: show the requested type one step away, or overlap it
  // when quoincollect=1 so browser automation can verify collection without a
  // synthetic held-key event.
  if (bootParams.has('quoindemo')) {
    const quoin = quoins[0];
    if (quoin) {
      const collectNow = bootParams.get('quoincollect') === '1';
      player.x = clamp(quoin.x - (collectNow ? 0 : 70), 40, Math.max(80, WORLD_W - 40));
      player.y = quoin.baseY + (collectNow ? 28 : 58);
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      hoverTarget = null;
    }
  }

  camTarget = cameraTargetForPlayer(player.x);
  updateHud();

  // Persist position while exploring (throttled) + on leave
  let lastLocSaveAt = 0;
  let lastLocSaveX = player?.x ?? 0;
  const saveResumableLocation = () =>
    legalizeRun && legalizeSourceLocation?.tsid
      ? savePlayerLocation(legalizeSourceLocation)
    : rookMuseumState && rookMuseumSourceLocation?.tsid
      ? savePlayerLocation(rookMuseumSourceLocation)
    : summersDayRun && summersDaySourceLocation?.tsid
      ? savePlayerLocation(summersDaySourceLocation)
    : greedyStreetState && greedyStreetSourceLocation?.tsid
      ? savePlayerLocation(greedyStreetSourceLocation)
    : paradiseRun && paradiseSourceLocation?.tsid
      ? savePlayerLocation(paradiseSourceLocation)
      : hogHaulState && hogHaulSourceLocation?.tsid
      ? savePlayerLocation(hogHaulSourceLocation)
      : fourLetterState && fourLetterSourceLocation?.tsid
        ? savePlayerLocation(fourLetterSourceLocation)
      : winterWalkState && winterWalkSourceLocation?.tsid
        ? savePlayerLocation(winterWalkSourceLocation)
      : rookWoodsState && rookWoodsSourceLocation?.tsid
        ? savePlayerLocation(rookWoodsSourceLocation)
      : questState.active?.[ILMENSKIE_QUEST_ID] &&
          currentStreetTsid === AXIS_DENYDE_STREET_ID &&
          ilmenskieStory().sourceLocation?.tsid
        ? savePlayerLocation(ilmenskieStory().sourceLocation)
      : savePlayerLocation();
  const maybeAutosaveLocation = (force = false) => {
    if (!player || !currentStreetTsid || !state.started) return;
    const now = Date.now();
    const moved = Math.abs(player.x - lastLocSaveX) > 24;
    if (!force && !moved && now - lastLocSaveAt < 8000) return;
    if (!force && now - lastLocSaveAt < 2500) return;
    if (saveResumableLocation()) {
      lastLocSaveAt = now;
      lastLocSaveX = player.x;
    }
  };
  window.addEventListener('beforeunload', () => {
    saveResumableLocation();
    savePlayerState();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveResumableLocation();
      savePlayerState();
    }
  });

  document.getElementById('verb-menu-close').addEventListener('click', closeVerbMenu);
  document.getElementById('verb-menu').addEventListener('click', (e) => {
    if (e.target.id === 'verb-menu') closeVerbMenu();
  });
  document.getElementById('feed-picker-close').addEventListener('click', () => closeFeedPicker());
  document.getElementById('feed-picker').addEventListener('click', (e) => {
    if (e.target.id === 'feed-picker') closeFeedPicker();
  });
  document.getElementById('emotional-bear-picker-close')?.addEventListener('click', () =>
    closeEmotionalBearPicker()
  );
  document.getElementById('emotional-bear-picker')?.addEventListener('click', (e) => {
    if (e.target.id === 'emotional-bear-picker') closeEmotionalBearPicker();
  });
  document.getElementById('quest-dialogue-next')?.addEventListener('click', advanceQuestDialogue);
  document.getElementById('quest-dialogue-cancel')?.addEventListener('click', () =>
    closeQuestDialogue({ cancel: true })
  );
  document.getElementById('hog-haul-ready-btn')?.addEventListener('click', beginHogHaulCountdown);
  document.getElementById('hog-haul-leave-btn')?.addEventListener('click', leaveHogHaulRace);
  document.getElementById('four-letter-leave-btn')?.addEventListener('click', confirmLeaveFourLetterQuest);
  document.getElementById('legalize-leave-btn')?.addEventListener('click', confirmLeaveLegalizeIt);
  document.getElementById('winter-walk-leave-btn')?.addEventListener('click', confirmLeaveWinterWalk);
  document.getElementById('summers-day-leave-btn')?.addEventListener('click', confirmLeaveSummersDay);
  document.getElementById('greedy-street-leave-btn')?.addEventListener('click', confirmLeaveGreedyStreetSpirit);
  document.getElementById('rook-woods-leave-btn')?.addEventListener('click', confirmLeaveRookWoods);
  document.getElementById('rook-museum-leave-btn')?.addEventListener('click', confirmLeaveRookMuseum);
  document.getElementById('rook-museum-exhibit-next')?.addEventListener('click', advanceRookMuseumExhibit);
  document.getElementById('rook-museum-exhibit-close')?.addEventListener('click', closeRookMuseumExhibit);
  document.getElementById('de-embiggenify-leave-btn')?.addEventListener('click', confirmLeaveDeEmbiggenify);
  document.getElementById('paradise-flight-leave-btn')?.addEventListener('click', confirmLeaveParadise);
  document.addEventListener('pointerdown', (e) => {
    if (!isPackPopoverOpen()) return;
    const pop = document.getElementById('pack-popover');
    if (pop?.contains(e.target) || e.target?.closest?.('.pack-slot[data-tsid]')) return;
    closePackPopover();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target?.matches?.('input, textarea, select, [contenteditable="true"]')) {
      if (e.key === 'Escape') {
        e.target.blur();
        e.preventDefault();
      }
      return;
    }
    keys.add(e.key);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'Escape') {
      if (isMailboxOpen()) {
        closeMailboxPanel();
        return;
      }
      if (isHomePanelOpen()) {
        closeHomePanel();
        return;
      }
      if (isRookMuseumExhibitOpen()) {
        closeRookMuseumExhibit();
        return;
      }
      if (isQuestDialogueOpen()) {
        closeQuestDialogue();
        return;
      }
      if (isFeedPickerOpen()) {
        closeFeedPicker();
        return;
      }
      if (isEmotionalBearPickerOpen()) {
        closeEmotionalBearPicker();
        return;
      }
      if (isPackPopoverOpen()) {
        closePackPopover();
        return;
      }
      if (currentAction) {
        cancelCurrentAction();
        return;
      }
      closeVerbMenu();
      closeMap();
      closeVendor();
      closeQuestPanel();
      closeAchievePanel();
      closeFeatPanel();
      closeSkillsPanel();
      closeBuffsPanel();
      closeMakePanel();
      closeGardenPanel();
      closeAvatarPanel();
      closeShrinePanel();
    }
    if (!state.started) return;
    if (isQuestDialogueOpen()) return;
    if (isEmotionalBearPickerOpen()) return;
    if (currentAction) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'W', 'a', 'A', 's', 'S', 'd', 'D'].includes(e.key)) {
        cancelCurrentAction();
      }
      return;
    }
    if (isFeedPickerOpen()) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const selected = document.activeElement?.closest?.('.feed-picker-choice')
          || document.querySelector('#feed-picker-grid .feed-picker-choice.is-selected');
        if (selected?.dataset?.food) chooseFeedPickerItem(selected.dataset.food);
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const choices = [...document.querySelectorAll('#feed-picker-grid .feed-picker-choice')];
        if (!choices.length) return;
        const current = Math.max(0, choices.indexOf(document.activeElement));
        const columns = Math.max(
          1,
          getComputedStyle(document.getElementById('feed-picker-grid')).gridTemplateColumns.split(' ').length
        );
        const delta = e.key === 'ArrowLeft'
          ? -1
          : e.key === 'ArrowRight'
            ? 1
            : e.key === 'ArrowUp'
              ? -columns
              : columns;
        const next = (current + delta + choices.length) % choices.length;
        choices[next]?.focus({ preventScroll: true });
      }
      return;
    }
    if (isMapOpen()) {
      if (e.key === 'g' || e.key === 'G') closeMap();
      return;
    }
    if (
      isMailboxOpen() ||
      isHomePanelOpen() ||
      isVendorOpen() ||
      isQuestOpen() ||
      isAchieveOpen() ||
      isFeatOpen() ||
      isSkillsOpen() ||
      isBuffsOpen() ||
      isMakeOpen() ||
      isGardenOpen() ||
      isAvatarOpen() ||
      isShrineOpen()
    ) {
      if (e.key === 'v' || e.key === 'V') closeVendor();
      if (e.key === 'q' || e.key === 'Q') closeQuestPanel();
      if (e.key === 'b' || e.key === 'B') closeAchievePanel();
      if (e.key === 'h' || e.key === 'H') closeFeatPanel();
      if (e.key === 'k' || e.key === 'K') closeSkillsPanel();
      if (e.key === 'u' || e.key === 'U') closeBuffsPanel();
      if (e.key === 'c' || e.key === 'C') closeMakePanel();
      if (e.key === 'l' || e.key === 'L') closeAvatarPanel();
      return;
    }
    // Verb menu open: let Enter activate the focused choice (native button);
    // Esc already handled. Arrow keys can move between choices.
    if (menuTarget) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const choices = [...document.querySelectorAll('#verb-menu-list .verb-choice:not(:disabled)')];
        if (!choices.length) return;
        const i = choices.indexOf(document.activeElement);
        const next =
          e.key === 'ArrowDown'
            ? choices[(i + 1 + choices.length) % choices.length]
            : choices[(i - 1 + choices.length) % choices.length];
        next?.focus({ preventScroll: true });
      }
      return;
    }
    // Original AvatarController triggers on the key edge, not while Space is
    // held. W/Up keep the remake's accessible jump-or-climb controls.
    if (!e.repeat && [' ', 'ArrowUp', 'w', 'W'].includes(e.key)) {
      queueJump(jumpState, movementNow());
    }
    // Enter / Return or E — open verb menu on nearest interactable
    if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      tryOpenNearestMenu();
      return;
    }
    if (e.key === 'f' || e.key === 'F') eatApple();
    if (e.key === 't' || e.key === 'T') doTeleport();
    if (e.key === 'g' || e.key === 'G') openMap();
    if (e.key === 'q' || e.key === 'Q') openQuestPanel();
    if (e.key === 'b' || e.key === 'B') openAchievePanel();
    if (e.key === 'h' || e.key === 'H') openFeatPanel();
    if (e.key === 'k' || e.key === 'K') openSkillsPanel();
    if (e.key === 'u' || e.key === 'U') openBuffsPanel();
    if (e.key === 'c' || e.key === 'C') openMakePanel();
    if (e.key === 'v' || e.key === 'V') openVendor();
    if (e.key === 'l' || e.key === 'L') openAvatarPanel();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key));
  window.addEventListener('resize', updateLocalChatDockPosition);

  document.getElementById('map-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isMapOpen()) closeMap();
    else openMap();
  });
  document.getElementById('map-close')?.addEventListener('click', closeMap);
  document.getElementById('map-panel')?.addEventListener('click', (e) => {
    if (e.target.id === 'map-panel') closeMap();
  });
  document.getElementById('home-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isHomePanelOpen()) closeHomePanel();
    else openHomePanel();
  });
  document.getElementById('home-close')?.addEventListener('click', closeHomePanel);
  document.getElementById('home-panel')?.addEventListener('click', (event) => {
    if (event.target?.id === 'home-panel') closeHomePanel();
  });
  document.getElementById('mail-close')?.addEventListener('click', closeMailboxPanel);
  document.getElementById('mail-panel')?.addEventListener('click', (event) => {
    if (event.target?.id === 'mail-panel') closeMailboxPanel();
  });
  document.getElementById('mail-compose-btn')?.addEventListener('click', () => {
    renderMailboxCompose();
  });
  document.querySelectorAll('[data-mail-folder]').forEach((button) => {
    button.addEventListener('click', () => {
      mailboxFolder = button.dataset.mailFolder || 'inbox';
      mailboxSelectedId = null;
      mailboxComposeReplyTo = null;
      renderMailboxPanel();
    });
  });
  document.getElementById('quest-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isQuestOpen()) closeQuestPanel();
    else openQuestPanel();
  });
  document.getElementById('quest-close')?.addEventListener('click', closeQuestPanel);
  document.getElementById('quest-tracker-open')?.addEventListener('click', () => {
    if (currentAction) cancelCurrentAction({ quiet: true });
    openQuestPanel();
  });
  document.getElementById('achieve-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isAchieveOpen()) closeAchievePanel();
    else openAchievePanel();
  });
  document.getElementById('achieve-close')?.addEventListener('click', closeAchievePanel);
  document.getElementById('achieve-search')?.addEventListener('input', (event) => {
    achievementBrowser.query = event.target.value;
    resetAchievementBrowserPage();
    renderAchievePanel();
  });
  document.querySelectorAll('[data-achieve-status]').forEach((button) => {
    button.addEventListener('click', () => {
      achievementBrowser.status = button.dataset.achieveStatus || 'all';
      resetAchievementBrowserPage();
      renderAchievePanel();
    });
  });
  const achievementCategory = document.getElementById('achieve-category');
  if (achievementCategory) {
    for (const value of achievementCategories()) {
      const option = document.createElement('option');
      option.value = value || '__other';
      option.textContent = achievementCategoryLabel(value);
      achievementCategory.appendChild(option);
    }
    achievementCategory.addEventListener('change', () => {
      achievementBrowser.category = achievementCategory.value || 'all';
      resetAchievementBrowserPage();
      renderAchievePanel();
    });
  }
  document.getElementById('feat-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isFeatOpen()) closeFeatPanel();
    else openFeatPanel();
  });
  document.getElementById('feat-close')?.addEventListener('click', closeFeatPanel);
  document.getElementById('feat-gather')?.addEventListener('click', gatherFeatChain);
  document.getElementById('feat-say')?.addEventListener('click', sayAssignedFeatLine);
  document.getElementById('local-chat-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.started) return;
    const input = document.getElementById('local-chat-input');
    const text = input?.value || '';
    const result = sayLocalChat(text, 'Ur');
    if (input) input.value = '';
    if (result.ok) finishAssistedFeatChain(result);
  });
  document.getElementById('skills-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isSkillsOpen()) closeSkillsPanel();
    else openSkillsPanel();
  });
  document.getElementById('skills-close')?.addEventListener('click', closeSkillsPanel);
  document.getElementById('buffs-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isBuffsOpen()) closeBuffsPanel();
    else openBuffsPanel();
  });
  document.getElementById('buffs-close')?.addEventListener('click', closeBuffsPanel);
  document.getElementById('make-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isMakeOpen()) closeMakePanel();
    else openMakePanel();
  });
  document.getElementById('make-close')?.addEventListener('click', closeMakePanel);
  document.getElementById('make-search')?.addEventListener('input', (event) => {
    makeSearchQuery = event.target.value || '';
    makeSelected = null;
    renderMakePanel();
  });
  document.getElementById('vendor-btn')?.addEventListener('click', () => {
    if (!state.started) return;
    if (isVendorOpen()) closeVendor();
    else openVendor();
  });
  document.getElementById('vendor-close')?.addEventListener('click', closeVendor);
  document.querySelectorAll('.vendor-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      vendorTab = tab.dataset.tab || 'buy';
      vendorSelected = null;
      vendorQty = 1;
      vendorSellReceipt = null;
      if (vendorReceiptTimer) {
        clearTimeout(vendorReceiptTimer);
        vendorReceiptTimer = 0;
      }
      document.querySelectorAll('.vendor-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === vendorTab);
      });
      renderVendorList();
    });
  });
  const vendorDrop = document.getElementById('vendor-sell-drop');
  vendorDrop?.addEventListener('dragenter', (event) => {
    if (!isVendorOpen() || vendorTab !== 'sell') return;
    event.preventDefault();
    vendorDrop.classList.add('is-dragover');
  });
  vendorDrop?.addEventListener('dragover', (event) => {
    if (!isVendorOpen() || vendorTab !== 'sell') return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    vendorDrop.classList.add('is-dragover');
  });
  vendorDrop?.addEventListener('dragleave', (event) => {
    if (!vendorDrop.contains(event.relatedTarget)) vendorDrop.classList.remove('is-dragover');
  });
  vendorDrop?.addEventListener('drop', (event) => {
    if (!isVendorOpen() || vendorTab !== 'sell') return;
    event.preventDefault();
    vendorDrop.classList.remove('is-dragover');
    const classTsid =
      event.dataTransfer?.getData('application/x-groddle-item') ||
      event.dataTransfer?.getData('text/plain') ||
      vendorDragTsid;
    vendorDragTsid = null;
    if (classTsid) stageVendorSell(classTsid);
  });

  document.getElementById('garden-close')?.addEventListener('click', closeGardenPanel);
  document.getElementById('garden-panel')?.addEventListener('click', (e) => {
    if (e.target?.id === 'garden-panel') closeGardenPanel();
  });
  document.getElementById('garden-water-all')?.addEventListener('click', () => {
    if (!activeGarden) return;
    const r = waterAllPlots(activeGarden, pc, { inv, toolState });
    if (!r.ok) {
      toast(r.msgs?.[0] || 'Nothing to water.');
      return;
    }
    pushActivity(r.msgs?.[0] || `Watered ${r.watered} plots`);
    toast(r.msgs?.[0]);
    for (const t of gardens) {
      if (t.state?.garden === activeGarden) refreshGardenVisual(t);
    }
    updateHud();
    renderGardenPanel();
  });
  document.getElementById('shrine-close')?.addEventListener('click', closeShrinePanel);
  document.getElementById('shrine-panel')?.addEventListener('click', (event) => {
    if (event.target?.id === 'shrine-panel') closeShrinePanel();
  });

  // World pointer moves — hover pick by true sprite bounds (not foot-anchor distance)
  app.view.addEventListener('pointermove', (e) => {
    if (!state.started || menuTarget || isMapOpen() || isScreenFxBlocking()) return;
    recentInteractionTarget = null;
    recentInteractionUntil = 0;
    const bounds = app.view.getBoundingClientRect();
    const wx = (e.clientX - bounds.left) * (VIEW_W / bounds.width) + camTarget;
    const wy = (e.clientY - bounds.top) * (VIEW_H / bounds.height) + (camY || 0);
    const signBoard = signpostBoardAt(portalSprites, wx, wy);
    setSignpostBoardHover(signBoard);
    if (signBoard) {
      if (hoverTarget) clearHoverGlow();
      return;
    }
    const hit = pickInteractableAt(wx, wy);
    if (hit) setHoverTarget(hit);
    else if (hoverTarget) clearHoverGlow();
  });
  app.view.addEventListener('pointerleave', clearSignpostBoardHover);

  app.view.addEventListener('pointerdown', (e) => {
    if (!state.started || menuTarget || isMapOpen() || isScreenFxBlocking()) return;
    const bounds = app.view.getBoundingClientRect();
    const sx = (e.clientX - bounds.left) * (VIEW_W / bounds.width) + camTarget;
    const sy = (e.clientY - bounds.top) * (VIEW_H / bounds.height) + (camY || 0);

    // Each road-name board owns its own hover/click target; the post and the
    // other destination arms are deliberately inert for this click.
    const signBoard = signpostBoardAt(portalSprites, sx, sy);
    if (signBoard) {
      const conn = pickConnection(
        { connects: [signBoard.connection] },
        availableStreetTsids()
      );
      if (conn) {
        travelTo(conn.tsid, { label: conn.label });
        return;
      }
      openMap();
      toast('That road is not loaded yet. Use the map for another destination.');
      return;
    }

    // Bounds-based pick (handles tall trees / stacked entities)
    const best = pickInteractableAt(sx, sy);
    if (best) {
      setHoverTarget(best);
      // The original mailbox has one primary verb and opens the mail check
      // immediately. Avoid placing a transient verb modal under the same
      // pointer gesture that summoned it.
      if (best.classId === 'npc_mailbox') {
        openMailboxPanel();
        return;
      }
      openVerbMenu(best);
    }
  });

  async function beginGame() {
    if (state.started) return;
    document.getElementById('overlay').classList.add('hidden');
    state.started = true;
    if (!state.muted && audio.ctx?.state === 'suspended') {
      try { await audio.ctx.resume(); } catch (_) { /* */ }
    }
    startMusic();
    playSfx('start', { volume: 0.5 });
    playSfx('alert', { volume: 0.4 });
    // Apply saved look after textures are ready
    applyPlayerAppearance();
    toast(`${currentStreet?.label || 'Hechey Track'} loaded. Press L for look · G for map.`);
    pushActivity(`A new afternoon begins on ${currentStreet?.label || 'Hechey Track'}.`);
    if (buffDemoItem && bootParams.get('buffactivate') === '1') {
      usePackItem(buffDemoItem);
    }
    const cubimalAutoplay = bootParams.get('cubimalautoplay');
    if (cubimalDemoPackage && (cubimalAutoplay === 'open' || cubimalAutoplay === 'free')) {
      setTimeout(() => {
        const result = openPackedCubimalBox(cubimalDemoPackage);
        if (result && cubimalAutoplay === 'free') {
          setTimeout(() => setPackedCubimalFree(result.prize.classTsid, { confirm: false }), 450);
        }
      }, 350);
    } else if (cubimalDemoItem && cubimalAutoplay === 'free') {
      setTimeout(() => setPackedCubimalFree(cubimalDemoItem.classTsid, { confirm: false }), 350);
    }
    if (openBuilderOnStart) {
      openBuilderOnStart = false;
      openAvatarPanel();
    }
    // New day if 4 real hours elapsed (or ?newday=1 for a demo fire)
    const params = new URLSearchParams(location.search);
    const wheelAutoplay = params.get('wheelautoplay');
    if (params.get('stootdollpackautoplay') === '1') {
      setTimeout(() => pullPackedStootDoll(), 350);
    } else if (params.get('stootdolldropautoplay') === '1') {
      setTimeout(() => {
        if (countItem(inv, STOOT_DOLL_ID) < 1) return;
        dropPackItem(STOOT_DOLL_ID, 1);
        setTimeout(() => {
          const droppedDoll = interactables.find(
            (target) =>
              target.classId === 'dropped_item' &&
              target.state?.classTsid === STOOT_DOLL_ID
          );
          if (droppedDoll) {
            handleStootDollTarget(droppedDoll, 'pull_string', { context: 'ground' });
          }
        }, 120);
      }, 350);
    } else if (params.get('stootdollpickupautoplay') === '1') {
      setTimeout(() => {
        const droppedDoll = interactables.find(
          (target) =>
            target.classId === 'dropped_item' &&
            target.state?.classTsid === STOOT_DOLL_ID
        );
        if (droppedDoll) pickupDroppedWorldItem(droppedDoll);
      }, 1_250);
    }
    if (params.has('stootdemo') && params.get('stootdollautoplay') === '1') {
      setTimeout(() => {
        if (stootDollTarget) handleStootDollTarget(stootDollTarget, 'pull_string');
      }, 350);
    }
    if (params.has('stootdemo') && (wheelAutoplay === '1' || wheelAutoplay === 'ready')) {
      setTimeout(() => {
        if (!useGameshowTicket()) return;
        if (wheelAutoplay === '1') {
          setTimeout(() => {
            if (spinningWheelTarget) handleSpinningWheelTarget(spinningWheelTarget, 'spin');
          }, 1_350);
        }
      }, 250);
    }
    if (params.has('newday')) {
      await maybeNewDay({ force: true });
    } else {
      await maybeNewDay();
    }
  }

  document.getElementById('start-btn').addEventListener('click', beginGame);
  document.getElementById('start-customize-btn')?.addEventListener('click', () => {
    openBuilderOnStart = true;
    beginGame();
  });
  document.getElementById('avatar-btn')?.addEventListener('click', () => {
    if (!state.started) {
      openBuilderOnStart = true;
      beginGame();
      return;
    }
    if (isAvatarOpen()) closeAvatarPanel();
    else openAvatarPanel();
  });
  document.getElementById('avatar-close')?.addEventListener('click', closeAvatarPanel);
  document.getElementById('avatar-panel')?.addEventListener('click', (e) => {
    if (e.target?.id === 'avatar-panel') closeAvatarPanel();
  });
  document.getElementById('avatar-random')?.addEventListener('click', () => {
    playerAppearance = randomAppearance();
    renderAvatarBuilder();
    paintAvatarPreview();
  });
  document.getElementById('avatar-reset')?.addEventListener('click', () => {
    playerAppearance = createDefaultAppearance();
    renderAvatarBuilder();
    paintAvatarPreview();
  });
  document.getElementById('avatar-apply')?.addEventListener('click', commitAvatarAppearance);
  document.querySelectorAll('.avatar-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      avatarBuilderSlot = tab.dataset.slot || 'hair';
      renderAvatarBuilder();
    });
  });
  document.getElementById('mute-btn')?.addEventListener('click', async () => {
    state.muted = !state.muted;
    if (!state.muted && audio.ctx?.state === 'suspended') {
      try { await audio.ctx.resume(); } catch (_) { /* audio remains opt-in */ }
    }
    applyMute();
  });
  document.querySelector('.top-actions')?.addEventListener('click', () => {
    if (currentAction) cancelCurrentAction({ quiet: true });
    closePackPopover();
  }, { capture: true });
  if (new URLSearchParams(location.search).has('autostart')) beginGame();
  document.body.classList.remove('is-booting');
  const bootLoader = document.getElementById('boot-loader');
  if (bootLoader) bootLoader.hidden = true;

  let newDayCheckAccum = 0;
  let locSaveAccum = 0;
  let buffTickAccum = 0;
  let skillTickAccum = 0;
  let dametimeTickAccum = 0;
  app.ticker.add((delta) => {
    if (!state.started) return;
    const dt = Math.min(delta, 2.5);
    updateCurrentAction((1000 / 60) * dt);
    updateMakeCraft((1000 / 60) * dt);
    handleInput();
    physics(dt);
    updateHogHaul((1000 / 60) * dt);
    updateFourLetterQuest();
    updateLegalizeIt();
    updateWinterWalk(dt);
    updateSummersDay(dt);
    updateGreedyStreetSpirit();
    updateRookWoods(dt);
    updateRookMuseum(dt);
    updateDeEmbiggenify(dt);
    updateParadiseFlight(dt);
    updateIlmenskieAutoplay();
    updateSpinningWheel();
    features.tick((1000 / 60) * dt, Date.now(), engine);
    bgLayer?.updateParallax?.(-world.x, -world.y, VIEW_W, LOCATION_VIEW_H, VIEW_H);

    buffTickAccum += dt;
    if (buffTickAccum >= 24) {
      buffTickAccum = 0;
      handleBuffEvents(tickBuffs(buffState, pc, Date.now()));
    }

    skillTickAccum += dt;
    if (skillTickAccum >= 30) {
      skillTickAccum = 0;
      const result = tickSkillStudy(skillState, Date.now());
      if (result.completed.length) {
        handleSkillCompletions(result.completed);
        updateHud();
      } else {
        updateSkillChrome();
        if (isSkillsOpen()) renderSkillsPanel();
      }
    }

    dametimeTickAccum += dt;
    if (dametimeTickAccum >= 60) {
      dametimeTickAccum = 0;
      updateDametimeChrome();
      updateHomeChrome();
      if (isMailboxOpen() && !mailboxComposeReplyTo) renderMailboxPanel();
    }

    // Keep selection outline locked to animated sprite frames (pigs, chickens, …)
    if (hoverTarget?._hoverGlow?.syncOutlineTexture) {
      hoverTarget._hoverGlow.syncOutlineTexture();
    }

    // Throttled map-location autosave while walking
    locSaveAccum += dt;
    if (locSaveAccum > 180) {
      locSaveAccum = 0;
      maybeAutosaveLocation(false);
    }

    // Crop garden growth (wet plots: seeds → shoots → crop)
    tickAllGardens(Date.now());

    // Poll game-day boundary (~every 5s of ticker time)
    newDayCheckAccum += dt;
    if (newDayCheckAccum > 300) {
      newDayCheckAccum = 0;
      if (!isScreenFxBlocking()) maybeNewDay();
    }

    if (!menuTarget && !currentAction && !isScreenFxBlocking()) {
      // Recent keyboard chain wins briefly; otherwise hover, then footprint distance.
      const recent =
        recentInteractionTarget?.sprite &&
        !recentInteractionTarget.sprite.destroyed &&
        Date.now() < recentInteractionUntil &&
        interactDistance(recentInteractionTarget, player.x, player.y) < 160
          ? recentInteractionTarget
          : null;
      const nearHover =
        hoverTarget?.sprite && !hoverTarget.sprite.destroyed
          ? hoverTarget
          : null;
      const near =
        recent || (nearHover && interactDistance(nearHover, player.x, player.y) < 160
          ? nearHover
          : nearestInteractable(100));
      const nearSign = currentStreet ? signpostNear(currentStreet, player.x, 140) : null;
      const nearClimb = !climb.active
        ? findClimbWallNear(streetWalls, player.x, player.y, 42)
        : null;
      if (climb.active) {
        prompt.text = '↑/↓ climb · Space hop off';
        prompt.x = player.x;
        prompt.y = player.y - 80;
        prompt.visible = true;
      } else if (nearClimb && (!near || Math.abs(player.x - nearClimb.x) < 50)) {
        prompt.text = '↑ climb · Enter interact';
        prompt.x = nearClimb.x;
        prompt.y = Math.min(player.y, nearClimb.yBot) - 70;
        prompt.visible = true;
      } else if (near) {
        const label = near.label || near.classId;
        prompt.text =
          hoverTarget === near
            ? `${label} — Enter / click`
            : 'Enter / click — interact';
        prompt.x = near.sprite.x;
        const box = spriteWorldHitBox(near.sprite, 0);
        prompt.y = (box ? box.top : near.sprite.y - 74) - 12;
        prompt.visible = true;
      } else if (nearSign) {
        const conn = pickConnection(nearSign.signpost, availableStreetTsids());
        prompt.text = conn ? `T / click — ${conn.label}` : 'G — map (no loaded link)';
        prompt.x = nearSign.screen.x;
        prompt.y = nearSign.screen.y - 100;
        prompt.visible = true;
      } else {
        prompt.visible = false;
      }
      if (prompt.visible) {
        prompt.x = clampWorldOverlayX(prompt.x, prompt.width, 12);
        app.view.dataset.promptScreenX = (prompt.x - camTarget).toFixed(2);
        app.view.dataset.promptSafeRight = horizontalLocationViewWidth().toFixed(2);
        app.view.dataset.promptWidth = prompt.width.toFixed(2);
      }
    } else {
      prompt.visible = false;
    }
  });
}

main().catch((err) => {
  console.error(err);
  document.body.classList.remove('is-booting');
  const bootLoader = document.getElementById('boot-loader');
  const bootTitle = document.getElementById('boot-loader-title');
  const bootCopy = document.getElementById('boot-loader-copy');
  if (bootLoader) {
    bootLoader.hidden = false;
    bootLoader.classList.add('is-error');
  }
  if (bootTitle) bootTitle.textContent = 'Groddle could not finish loading';
  if (bootCopy) bootCopy.textContent = 'Refresh to try again. Details are available in the browser console.';
  document.getElementById('overlay').innerHTML =
    `<div class="card"><h2>Failed to start</h2><pre style="white-space:pre-wrap">${err?.stack || err}</pre></div>`;
});
