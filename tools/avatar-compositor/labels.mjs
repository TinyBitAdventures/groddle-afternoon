/**
 * Character builder labels for wardrobe articles whose generated label
 * (build.mjs labelOf: words from the class name) reads like a file name:
 * gendered file prefixes, typos, abbreviations, zero-padded numbers, stray
 * capitals from CamelCase, or no name at all ("Eyes 6", "Hair 31" for the
 * coded face parts and hair styles). Builder labels only: the article names
 * (ids), files and saved looks never change. build.mjs writes these into
 * public/assets/avatar/catalog.json.
 *
 * GSJS gives wardrobe articles no display names (inc_data_clothing.js and
 * inc_data_faces.js carry only article_class_name, slot, asset and colours;
 * no items/* file names an article), so every row says where its words
 * come from:
 *   S  source: Tiny Speck's own words from the class name, tidied (spacing,
 *      case, a typo or abbreviation spelled out, a gendered prefix dropped,
 *      a zero-padded number unpadded). Nothing added.
 *   O  ours: a short plain description written for the remake from the
 *      article's art (review sheets of every row, 2026-10-23), for articles
 *      the class name does not name, or where dropping a gendered word
 *      would leave two articles with one name.
 */

const S = 'source';
const O = 'ours';

/** [type/name, label, S | O] */
const ROWS = [
  // Eyes (coded class names: no name in the source)
  ['eyes/eyes_01', 'Saucer eyes', O],
  ['eyes/eyes_02', 'Round eyes', O],
  ['eyes/eyes_03', 'Wide-awake eyes', O],
  ['eyes/eyes_05', 'Sly squint', O],
  ['eyes/eyes_12', 'Tall oval eyes', O],
  ['eyes/eyes_20101109A', 'Sideways glance', O],
  ['eyes/eyes_20101109B', 'Bushy brows', O],
  ['eyes/eyes_20101109C', 'Eyeshadow', O],
  ['eyes/eyes_20101109D', 'Button eyes', O],
  ['eyes/eyes_20101109E', 'Cat eyes', O],
  ['eyes/eyes_20101109F', 'Sleepy eyes', O],
  ['eyes/eyes_100815', 'Dot eyes', O],
  ['eyes/eyes_girly_1', 'Shiny eyes', O],
  ['eyes/eyes_girly_2', 'Long lashes', O],
  ['eyes/eyes_weirdo_01', 'Mismatched eyes', O],
  ['eyes/eyes_asia', 'Almond eyes', O],
  ['eyes/eyes_rainbow_blackwhite', 'Rainbow, black and white', S],

  // Mouths
  ['mouth/mouth_01', 'Gentle smile', O],
  ['mouth/mouth_02', 'Thin smile', O],
  ['mouth/mouth_08', 'Buck tooth', O],
  ['mouth/mouth_09', 'Little fangs', O],
  ['mouth/mouth_10', 'Smirk', O],
  ['mouth/mouth_12', 'Crooked smirk', O],
  ['mouth/mouth_20101109A', 'Red lips', O],
  ['mouth/mouth_20101109B', 'Toothy grin', O],
  ['mouth/mouth_20101109C', 'Full lips', O],
  ['mouth/mouth_20101109D', 'Stitched smile', O],
  ['mouth/mouth_20101109E', 'Gap-toothed grin', O],
  ['mouth/mouth_20101109F', 'Tusks', O],
  ['mouth/mouth_B0013', 'Pout', O],
  ['mouth/mouth_little_lady', 'Little lips', O],
  ['mouth/mouth_redstitches', 'Red stitches', S],

  // Noses
  ['nose/nose_0001', 'Pointy nose', O],
  ['nose/nose_0006', 'Pink snout', O],
  ['nose/nose_0009', 'Long nose', O],
  ['nose/nose_0010', 'Little nose', O],
  ['nose/nose_0017', 'Round nose', O],
  ['nose/nose_100815', 'Broad nose', O],
  ['nose/nose_20101109A', 'Hooked nose', O],
  ['nose/nose_20101109B', 'Flat nose', O],
  ['nose/nose_20101109C', 'Rosy nose', O],
  ['nose/nose_20101109D', 'Snub nose', O],
  ['nose/nose_20101109E', 'Dark button nose', O],
  ['nose/nose_B0012', 'Sharp nose', O],
  ['nose/nose_manly_1', 'Strong nose', O],
  ['nose/nose_oblong_1', 'Oblong nose', S],
  ['nose/nose_skinny_1', 'Skinny nose', S],

  // Ears
  ['ears/ears_0001', 'Pointed ears', O],
  ['ears/ears_0002', 'Small round ears', O],
  ['ears/ears_0003', 'Leaf ears', O],
  ['ears/ears_0005', 'Round ears', O],
  ['ears/ears_0009', 'Big round ears', O],

  // Hair
  ['hair/eightiesBandana', 'Eighties bandana', S],
  ['hair/the_ronette_hair', 'The Ronette', S],
  ['hair/hair_07', 'Short curls', O],
  ['hair/hair_09', 'Bubble curls', O],
  ['hair/hair_12', 'Short flick', O],
  ['hair/electro_longbangs', 'Electro long bangs', S],
  ['hair/Corn_rows', 'Cornrows', S],
  ['hair/MopHair', 'Mop hair', S],
  ['hair/clownMop', 'Clown mop', S],
  ['hair/BrowPatch', 'Brow patch', S],
  ['hair/baldTop', 'Bald top', S],
  ['hair/greaserExtreme', 'Greaser extreme', S],
  ['hair/hair_01', 'Ponytail', O],
  ['hair/hair_03', 'A few wisps', O],
  ['hair/hair_06', 'Long and straight', O],
  ['hair/hair_08', 'Shaggy crop', O],
  ['hair/hair_10', 'Bowl cut', O],
  ['hair/hair_11', 'Bob with bangs', O],
  ['hair/hair_20101116A', 'Messy updo', O],
  ['hair/hair_20101116B', 'Pompadour', O],
  ['hair/hair_20101116C', 'Bob with a clip', O],
  ['hair/hair_20101116D', 'High bunches', O],
  ['hair/hair_20101116E', 'Spiky mess', O],
  ['hair/hair_20101116F', 'Tousled curls', O],
  ['hair/hair_20101116G', 'Afro', O],
  ['hair/hair_20101116H', 'Ringlets', O],
  ['hair/hair_B0018', 'Feathered shag', O],
  ['hair/mohawkFlop', 'Mohawk flop', S],
  ['hair/nevermore_hair_female', 'Nevermore bun', O],
  ['hair/nevermore_hair_male', 'Nevermore swept hair', O],
  ['hair/tiedHive', 'Tied hive', S],
  ['hair/tracy_turnblad_hair', 'Tracy Turnblad hair', S],
  ['hair/BrowStache', 'Brow stache', S],

  // Hats
  ['hat/beanies_guy_hat', 'Beanie', S],
  ['hat/capcake_hat', 'Cupcake hat', S],
  ['hat/caterpillar_mask_01', 'Caterpillar mask 1', S],
  ['hat/caterpillar_mask_02', 'Caterpillar mask 2', S],
  ['hat/caterpillar_mask_03', 'Caterpillar mask 3', S],
  ['hat/cat_ear', 'Cat ears', S],
  ['hat/cowboy_female_hat', 'Cowboy hat with pearls', O],
  ['hat/cowboy_male_hat', 'Cowboy hat with studs', O],
  ['hat/dead_mask_asia', 'Painted festival mask', O],
  ['hat/dotd_mask', 'Day of the Dead mask', S],
  ['hat/elven_boy_hat', 'Elven hat', S],
  ['hat/evil', 'Devil horns', O],
  ['hat/girl_straw_hat', 'Straw hat with a flower', O],
  ['hat/GlitchamaphoneButterflyMask', 'Glitchamaphone butterfly mask', S],
  ['hat/GlitchamaphoneChickenMask', 'Glitchamaphone chicken mask', S],
  ['hat/GlitchamaphoneFoxMask', 'Glitchamaphone fox mask', S],
  ['hat/GlitchamaphonePigMask', 'Glitchamaphone pig mask', S],
  ['hat/GlitchamaphoneSlothMask', 'Glitchamaphone sloth mask', S],
  ['hat/Godzilla_Hat', 'Godzilla hat', S],
  ['hat/hockey', 'Hockey mask', S],
  ['hat/log', 'Log hat', S],
  ['hat/man_straw_hat', 'Straw boater', O],
  ['hat/mens_pirate_hat', 'Skull pirate hat', O],
  ['hat/mexican_dead_hat', 'Day of the Dead sombrero', O],
  ['hat/nineteen_century', 'Nineteenth-century hat', S],
  ['hat/purpleflower_mask', 'Purple flower mask', S],
  ['hat/question_hat', 'Question mark helmet', O],
  ['hat/rain', 'Rain hat', S],
  ['hat/tower', 'Tower hat', S],
  ['hat/womens_pirate_hat', 'Pirate hat with a bow', O],
  // The home page's G52 section already calls it this; it borrows the Plain lace dress's colours.
  ['hat/Women_Plain_Hat', 'Plain lace hat', O],

  // Shirts
  ['shirt/Candy_Cane_Sweater', 'Candy cane sweater', S],
  ['shirt/Shirt_and_Tie', 'Shirt and tie', S],
  ['shirt/Bandana_Tank', 'Bandana tank', S],
  ['shirt/Boardwalk_Empire_ladies_shirt', 'Boardwalk Empire blouse', O],
  ['shirt/boy_belly_top', 'Crop belly top', O],
  ['shirt/chaulkywhite_coatshirtvest', 'Chaulkywhite coat, shirt and vest', S],
  ['shirt/chaulkywhite_shirtvest', 'Chaulkywhite shirt and vest', S],
  ['shirt/female_steampunk_blouse', 'Steampunk blouse', S],
  ['shirt/glitchfashionShirt', 'Glitchfashion shirt', S],
  ['shirt/japnese_school_girl_sexy_top', 'Japanese school top', S],
  ['shirt/kendo_tor', 'Kendo top', S],
  ['shirt/Lederhosen_Shirt', 'Lederhosen shirt', S],
  ['shirt/man_pirate_shirt', 'Pirate shirt', S],
  ['shirt/multi_colored_shirt', 'Multicolored shirt', S],
  ['shirt/nintendo_shirt_lighter', 'Nintendo shirt, lighter', S],
  ['shirt/popart_shirt', 'Pop art shirt', S],
  ['shirt/post_it_note_shirt', 'Post-it note shirt', S],
  ['shirt/thin_strap_ladies_tank', 'Thin strap tank', S],
  ['shirt/thin_strap_polka_dot_bllouse', 'Thin strap polka dot blouse', S],
  ['shirt/Xmas_RainPiggy_Sweater', 'Xmas rain piggy sweater', S],
  ['shirt/Xmas_Tree_Sweater', 'Xmas tree sweater', S],
  ['shirt/Xmas_Yeti_Sweater', 'Xmas yeti sweater', S],

  // Coats
  ['coat/Reflective_Jacket', 'Reflective jacket', S],
  ['coat/Male_steampunk_top', 'Steampunk top', S],
  ['coat/Godzilla_Top', 'Godzilla top', S],
  ['coat/GlitchamaphoneFoxTop', 'Glitchamaphone fox top', S],
  ['coat/GlitchamaphoneButterflyTop', 'Glitchamaphone butterfly top', S],
  ['coat/GlitchamaphoneChickenTop', 'Glitchamaphone chicken top', S],
  ['coat/GlitchamaphonePigTop', 'Glitchamaphone pig top', S],
  ['coat/GlitchamaphoneSlothTop', 'Glitchamaphone sloth top', S],
  ['coat/glitchfashionCoat', 'Glitchfashion coat', S],
  ['coat/Boardwalk_Empire_Overcoat', 'Boardwalk Empire overcoat', S],
  ['coat/chaulkywhite_coatshirtvest_coat', 'Chaulkywhite coat, shirt and vest', S],
  ['coat/elven_boy_top', 'Elven top', S],
  ['coat/Fur_lined_Coat', 'Fur-lined coat', S],
  ['coat/man_hoodie', 'Hoodie', S],
  ['coat/MJ_Jacket', 'MJ jacket', S],
  ['coat/mongolian_fighting', 'Mongolian fighting top', S],
  ['coat/RideBurgerCar', 'Ride: burger car', S],
  ['coat/RideChicken', 'Ride: chicken', S],
  ['coat/RideDragon', 'Ride: dragon', S],
  ['coat/RidePig', 'Ride: pig', S],
  ['coat/RideStreetSpirit', 'Ride: street spirit', S],
  ['coat/RideRainbow', 'Ride: rainbow', S],
  ['coat/Skywalker_Coat', 'Skywalker coat', S],
  ['coat/train_01_coat', 'Train coat 1', S],
  ['coat/train_02_coat', 'Train coat 2', S],
  ['coat/train_03_coat', 'Train coat 3', S],
  ['coat/train_04_coat', 'Train coat 4', S],
  ['coat/train_05_coat', 'Train coat 5', S],

  // Trousers
  ['pants/Godzilla_Pants', 'Godzilla pants', S],
  ['pants/GlitchamaphoneFoxPants', 'Glitchamaphone fox pants', S],
  ['pants/GlitchamaphoneChickenPants', 'Glitchamaphone chicken pants', S],
  ['pants/GlitchamaphoneButterflyPants', 'Glitchamaphone butterfly pants', S],
  ['pants/GlitchamaphonePigPants', 'Glitchamaphone pig pants', S],
  ['pants/GlitchamaphoneSlothPants', 'Glitchamaphone sloth pants', S],
  ['pants/Boardwalk_Empire_ladies_pants', 'Boardwalk Empire trousers', O],
  ['pants/GothPants', 'Goth pants', S],
  ['pants/leggings_pants', 'Leggings', S],
  ['pants/Male_steampunk_pants', 'Steampunk trousers', S],
  ['pants/Nevermore_Tights', 'Nevermore tights', S],
  ['pants/rainbow_pan', 'Rainbow pants', S],
  ['pants/Reflective_Pants', 'Reflective pants', S],
  ['pants/Skywalker_Pants', 'Skywalker pants', S],
  ['pants/mongolia_fighting_pants', 'Mongolian fighting pants', S],

  // Skirts
  ['skirt/female_steampunk_skirt', 'Steampunk skirt', S],
  ['skirt/Flower_Skirt', 'Flower skirt', S],
  ['skirt/gyscy_skirt', 'Gypsy skirt', S],
  ['skirt/Hawaii_long', 'Long Hawaiian skirt', S],
  ['skirt/japnese_school_girl_sexy_skirt', 'Japanese school skirt', S],
  ['skirt/Leather_Skirt', 'Leather skirt', S],

  // Dresses
  ['dress/Nevermore_Dress', 'Nevermore dress', S],
  ['dress/female_steampunk', 'Steampunk dress', S],
  ['dress/Flapper_Dress', 'Flapper dress', S],
  ['dress/japa_schoolgirl_dress', 'Japanese school dress', S],
  ['dress/lady_cake_dress', 'Layer cake dress', O],
  ['dress/lady_face_dress', 'Portrait print dress', O],
  ['dress/Layered_Lolita', 'Layered lolita dress', S],
  ['dress/sexy_french_maid', 'French maid minidress', O],
  ['dress/Women_Plain_Dress', 'Plain lace dress', O],
  ['dress/womens_pirate_dress', 'Pirate dress', S],
  // The file is teaport.swf (G52; was the manifest's own `label`).
  ['dress/teaport', 'Teapot', S],

  // Shoes
  ['shoes/Men_DressShoes', 'Dress shoes', S],
  ['shoes/bucked_shoes', 'Buckled shoes', S],
  ['shoes/ball', 'Ball shoes', S],
  ['shoes/daisy_girl_shoes', 'Daisy shoes', S],
  ['shoes/elizabethan_guy_shoes', 'Elizabethan shoes', S],
  ['shoes/glitchfashionShoes', 'Glitchfashion shoes', S],
  ['shoes/lady_highheel', 'High heels', S],
  ['shoes/lady_highheel_bowtie', 'High heels with bows', S],
  ['shoes/man_pirate_boots', 'Buckled pirate boots', O],
  ['shoes/mens_laceup_shoes', 'Lace-up shoes', S],
  ['shoes/Nevermore_Shoes', 'Nevermore shoes', S],
  ['shoes/Skywalker_Boots', 'Skywalker boots', S],
  ['shoes/steampunk_guys_boots', 'Steampunk work boots', O],
  ['shoes/steampunk_lady_boots', 'Steampunk strap boots', O],
  ['shoes/steeltoe_boots', 'Steel-toe boots', S],
  ['shoes/strappered_shoes', 'Strappy shoes', S],
  ['shoes/top_fur_boots', 'Fur-topped boots', S],
  ['shoes/women_pirate_boot', 'Cuffed pirate boots', O],
];

/** 'type/name' -> { label, origin: 'source' | 'ours' }. */
export const ARTICLE_LABELS = new Map(ROWS.map(([key, label, origin]) => [key, Object.freeze({ label, origin })]));
