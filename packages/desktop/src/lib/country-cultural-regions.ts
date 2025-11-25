/**
 * Country Cultural Regions - National-level cultural regions (50 total)
 * Per DECISION-017: Local & Region sections overhaul
 *
 * Data source: country cultural regions/us_cultural_regions_v2.csv
 * Polygons: country cultural regions/us_cultural_regions_v2.geojson
 *
 * All data is embedded for offline-first compliance.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CountryCulturalRegion {
  id: number;
  name: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
}

export interface CountryCulturalRegionWithDistance extends CountryCulturalRegion {
  distance: number;
}

// =============================================================================
// COUNTRY CULTURAL REGIONS DATA (from CSV)
// =============================================================================

export const COUNTRY_CULTURAL_REGIONS: CountryCulturalRegion[] = [
  { id: 1, name: 'Maritime New England', category: 'Northeast', description: 'Coastal Maine and New Hampshire', latitude: 44.9575, longitude: -69.0763 },
  { id: 2, name: 'Woodland New England', category: 'Northeast', description: 'Vermont; interior New Hampshire; western Massachusetts; Connecticut interior', latitude: 43.1929, longitude: -71.6405 },
  { id: 3, name: 'Upstate NY', category: 'Northeast', description: 'Northern and western New York State', latitude: 42.9814, longitude: -75.1860 },
  { id: 4, name: 'NYC Metro', category: 'Northeast', description: 'New York City; Long Island; northern New Jersey; southwestern Connecticut', latitude: 40.8974, longitude: -73.0615 },
  { id: 5, name: 'Mid-Atlantic', category: 'Northeast', description: 'Eastern Pennsylvania; Delaware; Maryland; DC suburbs', latitude: 39.9095, longitude: -76.1714 },
  { id: 6, name: 'Northern Appalachia', category: 'Northeast', description: 'Western Pennsylvania; West Virginia; eastern Ohio', latitude: 40.2730, longitude: -79.5730 },
  { id: 7, name: 'Northern Tidewaters', category: 'Northeast', description: 'Virginia coast; Chesapeake Bay; Eastern Shore of Maryland', latitude: 37.6750, longitude: -76.3594 },
  { id: 8, name: 'Upper Midwest', category: 'Midwest', description: 'Minnesota; eastern North and South Dakota', latitude: 46.4975, longitude: -93.5600 },
  { id: 9, name: 'Lower Midwest', category: 'Midwest', description: 'Iowa; Missouri; eastern Kansas and Nebraska', latitude: 40.6638, longitude: -93.3957 },
  { id: 10, name: 'Great Lakes', category: 'Midwest', description: 'Michigan; northern Indiana; northern Ohio', latitude: 43.7829, longitude: -85.0268 },
  { id: 11, name: 'Ohio River Valley', category: 'Midwest', description: 'Southern Ohio; Indiana; Kentucky', latitude: 38.5023, longitude: -84.0372 },
  { id: 12, name: 'Northwoods', category: 'Midwest', description: 'Northern Wisconsin; Upper Peninsula of Michigan; northern Minnesota', latitude: 46.3794, longitude: -87.8529 },
  { id: 13, name: 'Chicagoland', category: 'Midwest', description: 'Chicago metropolitan area', latitude: 41.9000, longitude: -87.5818 },
  { id: 14, name: 'Southern Tidewaters', category: 'The South', description: 'North Carolina; South Carolina; and Georgia coasts', latitude: 33.9512, longitude: -78.0791 },
  { id: 15, name: 'Piedmont', category: 'The South', description: 'Piedmont region of NC; SC; and Georgia', latitude: 34.6079, longitude: -79.9658 },
  { id: 16, name: 'Southern Appalachia', category: 'The South', description: 'Appalachian mountain region - eastern TN; western NC; eastern KY; SW Virginia', latitude: 36.8610, longitude: -82.4415 },
  { id: 17, name: 'Midsouth', category: 'The South', description: 'Middle Tennessee; northern Alabama', latitude: 35.5100, longitude: -86.5933 },
  { id: 18, name: 'The Ozarks', category: 'The South', description: 'Southern Missouri; northern Arkansas; eastern Oklahoma', latitude: 36.9556, longitude: -92.6111 },
  { id: 19, name: 'Deep South', category: 'The South', description: 'Central Alabama; Mississippi; Georgia', latitude: 32.9925, longitude: -86.4900 },
  { id: 20, name: 'Gulf Coast', category: 'The South', description: 'Florida panhandle; Alabama and Mississippi coasts', latitude: 30.6333, longitude: -86.2641 },
  { id: 21, name: 'Central Florida', category: 'The South', description: 'Central Florida peninsula', latitude: 28.5742, longitude: -81.5032 },
  { id: 22, name: 'Acadiana-Cajun', category: 'The South', description: 'Southern Louisiana; Cajun country', latitude: 30.4794, longitude: -91.5118 },
  { id: 23, name: 'Texas Heartland', category: 'The South', description: 'Central and East Texas', latitude: 30.9410, longitude: -95.9692 },
  { id: 24, name: 'Lower Rio Grande', category: 'The South', description: 'South Texas; Rio Grande Valley', latitude: 26.8719, longitude: -97.7094 },
  { id: 25, name: 'South Florida', category: 'Caribbean U.S.', description: 'South Florida; Miami metropolitan area', latitude: 25.8966, longitude: -81.1483 },
  { id: 26, name: 'Puerto Rico', category: 'Caribbean U.S.', description: 'Commonwealth of Puerto Rico', latitude: 18.2977, longitude: -66.5477 },
  { id: 27, name: 'US Virgin Islands', category: 'Caribbean U.S.', description: 'US Virgin Islands - St. Thomas; St. John; St. Croix', latitude: 18.3687, longitude: -64.9250 },
  { id: 28, name: 'Northern Great Plains', category: 'Frontier', description: 'Eastern Montana; North Dakota; northern South Dakota', latitude: 46.6417, longitude: -100.2139 },
  { id: 29, name: 'Black Hills', category: 'Frontier', description: 'Black Hills region of South Dakota and northeastern Wyoming', latitude: 44.0304, longitude: -103.4435 },
  { id: 30, name: 'Lower Great Plains', category: 'Frontier', description: 'Kansas; Nebraska; Oklahoma panhandle', latitude: 39.7468, longitude: -98.8809 },
  { id: 31, name: 'Columbia Plateau', category: 'Frontier', description: 'Eastern Washington; eastern Oregon; Idaho panhandle', latitude: 46.3516, longitude: -117.5355 },
  { id: 32, name: 'Northern Rockies', category: 'Frontier', description: 'Western Montana; northern Idaho; Wyoming', latitude: 46.3915, longitude: -109.5170 },
  { id: 33, name: 'Front Range', category: 'Frontier', description: 'Colorado Front Range; Denver metropolitan area', latitude: 39.0629, longitude: -104.6114 },
  { id: 34, name: 'Great Basin', category: 'Frontier', description: 'Nevada; western Utah', latitude: 38.7235, longitude: -115.5059 },
  { id: 35, name: 'Navajo Nation', category: 'Frontier', description: 'Four Corners region; Navajo and Hopi lands', latitude: 36.1000, longitude: -110.0400 },
  { id: 36, name: 'Mormon Corridor', category: 'Frontier', description: 'Utah; parts of Idaho; northern Arizona', latitude: 39.1341, longitude: -112.2488 },
  { id: 37, name: 'Classic Southwest', category: 'Frontier', description: 'Arizona; New Mexico', latitude: 34.3474, longitude: -111.3053 },
  { id: 38, name: 'Mezquital', category: 'Frontier', description: 'West Texas; southern New Mexico; Trans-Pecos region', latitude: 34.2636, longitude: -103.5515 },
  { id: 39, name: 'Cascadia', category: 'Pacific', description: 'Western Washington; western Oregon; Pacific Northwest coast', latitude: 46.7556, longitude: -122.3639 },
  { id: 40, name: 'Jefferson', category: 'Pacific', description: 'Southern Oregon; far northern California', latitude: 42.3886, longitude: -122.5200 },
  { id: 41, name: 'North Coast', category: 'Pacific', description: 'Northern California coast - Mendocino; Humboldt', latitude: 39.3381, longitude: -123.3476 },
  { id: 42, name: 'Central Valley', category: 'Pacific', description: 'California Central Valley - Sacramento to Bakersfield', latitude: 37.5780, longitude: -120.5951 },
  { id: 43, name: 'Sierra Nevadas', category: 'Pacific', description: 'Sierra Nevada mountain range', latitude: 37.8889, longitude: -118.7750 },
  { id: 44, name: 'SF Bay Area', category: 'Pacific', description: 'San Francisco Bay Area metropolitan region', latitude: 37.6500, longitude: -122.0864 },
  { id: 45, name: 'Central Coast', category: 'Pacific', description: 'California Central Coast - Monterey to Santa Barbara', latitude: 35.6000, longitude: -120.7400 },
  { id: 46, name: 'SoCal', category: 'Pacific', description: 'Southern California - Los Angeles; San Diego regions', latitude: 33.9541, longitude: -117.0459 },
  { id: 47, name: 'Hawaii', category: 'Alaska & Pacific Islands', description: 'Hawaiian Islands', latitude: 19.5636, longitude: -155.2182 },
  { id: 48, name: 'Alaskan First Nation', category: 'Alaska & Pacific Islands', description: 'Interior Alaska; native lands', latitude: 65.9909, longitude: -152.4659 },
  { id: 49, name: 'Alaskan Maritime', category: 'Alaska & Pacific Islands', description: 'Coastal Alaska; Aleutian Islands', latitude: 57.0571, longitude: -158.1143 },
  { id: 50, name: 'American Oceania', category: 'Alaska & Pacific Islands', description: 'Northern Mariana Islands; Guam; and American Samoa', latitude: 13.4500, longitude: 144.7750 },
];

// =============================================================================
// REGION CATEGORIES (for grouping in dropdowns)
// =============================================================================

export const COUNTRY_CULTURAL_REGION_CATEGORIES = [
  'Northeast',
  'Midwest',
  'The South',
  'Caribbean U.S.',
  'Frontier',
  'Pacific',
  'Alaska & Pacific Islands',
] as const;

export type CountryCulturalRegionCategory = typeof COUNTRY_CULTURAL_REGION_CATEGORIES[number];

// =============================================================================
// POLYGON DATA (simplified from GeoJSON - coordinates are [lng, lat])
// =============================================================================

// Note: Full polygon data embedded for point-in-polygon checks
// Each polygon is an array of [longitude, latitude] coordinate pairs
export const COUNTRY_CULTURAL_REGION_POLYGONS: Record<number, [number, number][]> = {
  // Maritime New England (id: 1)
  1: [[-66.95,44.8],[-67.0,44.9],[-67.2,45.0],[-67.5,45.2],[-67.8,45.5],[-68.0,45.8],[-68.2,46.0],[-68.4,46.4],[-68.5,46.8],[-68.6,47.0],[-68.8,47.2],[-69.0,47.4],[-69.2,47.3],[-69.5,47.2],[-70.0,46.8],[-70.3,46.4],[-70.5,46.0],[-70.7,45.6],[-70.8,45.3],[-70.9,45.0],[-71.0,44.5],[-71.0,44.0],[-70.8,43.5],[-70.6,43.2],[-70.4,43.0],[-70.2,42.9],[-70.0,42.8],[-69.8,43.0],[-69.5,43.2],[-69.2,43.5],[-68.8,43.8],[-68.5,44.0],[-68.2,44.2],[-67.8,44.4],[-67.5,44.5],[-67.2,44.6],[-66.95,44.8]],
  // Woodland New England (id: 2)
  2: [[-71.0,44.5],[-71.2,44.8],[-71.5,45.0],[-72.0,45.0],[-72.5,45.0],[-73.0,45.0],[-73.3,44.8],[-73.4,44.5],[-73.5,44.0],[-73.4,43.5],[-73.3,43.0],[-73.2,42.5],[-73.1,42.0],[-72.8,41.8],[-72.5,41.5],[-72.2,41.3],[-71.8,41.5],[-71.5,41.8],[-71.2,42.0],[-71.0,42.3],[-70.8,42.5],[-70.5,42.8],[-70.3,43.0],[-70.5,43.3],[-70.7,43.6],[-70.8,43.9],[-70.9,44.2],[-71.0,44.5]],
  // Upstate NY (id: 3)
  3: [[-73.5,44.0],[-73.8,44.5],[-74.0,44.8],[-74.5,45.0],[-75.0,45.0],[-75.5,44.8],[-76.0,44.5],[-76.5,44.0],[-77.0,43.5],[-77.5,43.0],[-78.0,42.8],[-78.5,42.5],[-79.0,42.2],[-79.5,42.0],[-79.8,42.0],[-79.8,42.5],[-79.5,43.0],[-79.0,43.5],[-78.5,44.0],[-78.0,44.3],[-77.5,44.5],[-77.0,44.5],[-76.5,44.5],[-76.0,44.5],[-75.5,44.5],[-75.0,44.5],[-74.5,44.5],[-74.0,44.3],[-73.5,44.0]],
  // NYC Metro (id: 4)
  4: [[-73.0,41.5],[-73.2,41.8],[-73.5,42.0],[-73.8,41.8],[-74.0,41.5],[-74.3,41.2],[-74.5,41.0],[-74.8,40.8],[-75.0,40.5],[-74.8,40.2],[-74.5,40.0],[-74.2,40.2],[-74.0,40.5],[-73.8,40.8],[-73.5,41.0],[-73.2,41.2],[-73.0,41.5]],
  // Mid-Atlantic (id: 5)
  5: [[-75.0,40.5],[-75.5,40.8],[-76.0,41.0],[-76.5,40.8],[-77.0,40.5],[-77.5,40.0],[-77.8,39.5],[-78.0,39.0],[-77.5,38.5],[-77.0,38.5],[-76.5,38.8],[-76.0,39.0],[-75.5,39.5],[-75.2,40.0],[-75.0,40.5]],
  // Northern Appalachia (id: 6)
  6: [[-78.0,42.0],[-78.5,42.0],[-79.0,41.8],[-79.5,41.5],[-80.0,41.0],[-80.5,40.5],[-81.0,40.0],[-81.5,39.5],[-81.0,39.0],[-80.5,38.5],[-80.0,38.0],[-79.5,38.5],[-79.0,39.0],[-78.5,39.5],[-78.0,40.0],[-77.5,40.5],[-77.5,41.0],[-77.8,41.5],[-78.0,42.0]],
  // Northern Tidewaters (id: 7)
  7: [[-76.0,39.0],[-76.5,38.8],[-77.0,38.5],[-77.5,38.0],[-77.0,37.5],[-76.5,37.0],[-76.0,36.5],[-75.5,36.8],[-75.0,37.2],[-75.0,37.8],[-75.2,38.2],[-75.5,38.5],[-76.0,39.0]],
  // Upper Midwest (id: 8)
  8: [[-93.0,49.0],[-94.0,49.0],[-95.0,49.0],[-96.0,49.0],[-97.0,49.0],[-97.0,48.0],[-97.0,47.0],[-97.0,46.0],[-96.5,45.5],[-96.0,45.0],[-95.5,44.5],[-95.0,44.0],[-94.0,44.0],[-93.0,44.0],[-92.0,44.5],[-91.5,45.0],[-91.0,45.5],[-91.0,46.0],[-91.5,46.5],[-92.0,47.0],[-92.5,48.0],[-93.0,49.0]],
  // Lower Midwest (id: 9)
  9: [[-95.0,44.0],[-96.0,44.0],[-97.0,44.0],[-98.0,43.0],[-99.0,42.0],[-100.0,41.0],[-100.0,40.0],[-99.0,39.0],[-98.0,38.0],[-97.0,37.0],[-96.0,37.0],[-95.0,37.5],[-94.0,38.0],[-93.0,38.5],[-92.0,39.0],[-91.5,39.5],[-91.0,40.0],[-91.5,41.0],[-92.0,42.0],[-93.0,43.0],[-94.0,43.5],[-95.0,44.0]],
  // Great Lakes (id: 10)
  10: [[-83.0,46.0],[-84.0,46.5],[-85.0,46.5],[-86.0,46.0],[-87.0,45.5],[-87.5,45.0],[-87.5,44.0],[-87.0,43.0],[-86.0,42.0],[-85.0,41.5],[-84.0,41.5],[-83.0,41.8],[-82.5,42.0],[-82.0,42.5],[-82.0,43.0],[-82.5,44.0],[-83.0,45.0],[-83.0,46.0]],
  // Ohio River Valley (id: 11)
  11: [[-84.0,41.5],[-85.0,41.5],[-86.0,41.0],[-87.0,40.0],[-88.0,39.0],[-88.5,38.0],[-88.0,37.0],[-87.0,36.5],[-86.0,36.5],[-85.0,37.0],[-84.0,37.5],[-83.5,38.0],[-83.0,38.5],[-82.5,39.0],[-82.5,40.0],[-83.0,40.5],[-83.5,41.0],[-84.0,41.5]],
  // Northwoods (id: 12)
  12: [[-87.0,47.0],[-88.0,47.5],[-89.0,48.0],[-90.0,48.0],[-91.0,48.0],[-92.0,48.5],[-92.5,48.0],[-92.0,47.0],[-91.5,46.5],[-91.0,46.0],[-90.0,45.5],[-89.0,45.5],[-88.0,45.8],[-87.0,46.0],[-86.5,46.5],[-87.0,47.0]],
  // Chicagoland (id: 13)
  13: [[-87.5,42.5],[-88.0,42.5],[-88.5,42.3],[-88.8,42.0],[-88.5,41.5],[-88.0,41.2],[-87.5,41.0],[-87.0,41.2],[-86.8,41.5],[-86.8,42.0],[-87.0,42.3],[-87.5,42.5]],
  // Southern Tidewaters (id: 14)
  14: [[-78.0,35.5],[-78.5,35.0],[-79.0,34.5],[-79.5,34.0],[-80.0,33.5],[-80.5,33.0],[-81.0,32.5],[-81.5,32.0],[-81.0,31.5],[-80.5,31.5],[-80.0,32.0],[-79.5,32.5],[-79.0,33.0],[-78.5,33.5],[-78.0,34.0],[-77.5,34.5],[-77.0,35.0],[-77.5,35.5],[-78.0,35.5]],
  // Piedmont (id: 15)
  15: [[-79.0,36.5],[-79.5,36.0],[-80.0,35.5],[-80.5,35.0],[-81.0,34.5],[-81.5,34.0],[-82.0,33.5],[-82.5,33.0],[-83.0,33.0],[-83.5,33.5],[-83.0,34.0],[-82.5,34.5],[-82.0,35.0],[-81.5,35.5],[-81.0,36.0],[-80.5,36.5],[-80.0,36.5],[-79.5,36.5],[-79.0,36.5]],
  // Southern Appalachia (id: 16)
  16: [[-81.0,37.5],[-81.5,37.0],[-82.0,36.5],[-82.5,36.0],[-83.0,35.5],[-83.5,35.0],[-84.0,35.0],[-84.5,35.5],[-84.5,36.0],[-84.0,36.5],[-83.5,37.0],[-83.0,37.5],[-82.5,37.8],[-82.0,38.0],[-81.5,38.0],[-81.0,37.5]],
  // Midsouth (id: 17)
  17: [[-85.0,37.0],[-85.5,36.5],[-86.0,36.0],[-86.5,35.5],[-87.0,35.0],[-87.5,34.5],[-87.0,34.0],[-86.5,34.0],[-86.0,34.5],[-85.5,35.0],[-85.0,35.5],[-84.5,36.0],[-84.5,36.5],[-85.0,37.0]],
  // The Ozarks (id: 18)
  18: [[-92.0,38.0],[-92.5,37.5],[-93.0,37.0],[-93.5,36.5],[-94.0,36.0],[-94.5,35.5],[-94.5,35.0],[-94.0,35.0],[-93.5,35.5],[-93.0,36.0],[-92.5,36.5],[-92.0,37.0],[-91.5,37.5],[-91.5,38.0],[-92.0,38.0]],
  // Deep South (id: 19)
  19: [[-85.0,34.0],[-85.5,33.5],[-86.0,33.0],[-86.5,32.5],[-87.0,32.0],[-87.5,31.5],[-88.0,31.0],[-88.0,31.5],[-87.5,32.0],[-87.0,32.5],[-86.5,33.0],[-86.0,33.5],[-85.5,34.0],[-85.0,34.0]],
  // Gulf Coast (id: 20)
  20: [[-85.0,31.0],[-85.5,30.5],[-86.0,30.2],[-86.5,30.0],[-87.0,30.0],[-87.5,30.2],[-88.0,30.5],[-88.5,30.5],[-88.5,31.0],[-88.0,31.0],[-87.5,30.8],[-87.0,30.5],[-86.5,30.5],[-86.0,30.8],[-85.5,31.0],[-85.0,31.0]],
  // Central Florida (id: 21)
  21: [[-80.5,30.0],[-81.0,29.5],[-81.5,29.0],[-82.0,28.5],[-82.5,28.0],[-82.5,27.5],[-82.0,27.0],[-81.5,27.0],[-81.0,27.5],[-80.5,28.0],[-80.2,28.5],[-80.0,29.0],[-80.0,29.5],[-80.2,30.0],[-80.5,30.0]],
  // Acadiana-Cajun (id: 22)
  22: [[-91.0,31.0],[-91.5,30.5],[-92.0,30.0],[-92.5,29.5],[-92.5,29.0],[-92.0,29.0],[-91.5,29.5],[-91.0,30.0],[-90.5,30.5],[-90.5,31.0],[-91.0,31.0]],
  // Texas Heartland (id: 23)
  23: [[-94.0,34.0],[-95.0,33.0],[-96.0,32.0],[-97.0,31.0],[-98.0,30.0],[-97.5,29.5],[-97.0,29.5],[-96.0,30.0],[-95.0,31.0],[-94.0,32.0],[-93.5,33.0],[-94.0,34.0]],
  // Lower Rio Grande (id: 24)
  24: [[-97.0,28.0],[-97.5,27.5],[-98.0,27.0],[-98.5,26.5],[-99.0,26.0],[-99.0,25.5],[-98.5,25.5],[-98.0,26.0],[-97.5,26.5],[-97.0,27.0],[-96.5,27.5],[-96.5,28.0],[-97.0,28.0]],
  // South Florida (id: 25)
  25: [[-80.0,27.0],[-80.5,26.5],[-81.0,26.0],[-81.5,25.5],[-82.0,25.0],[-81.5,24.5],[-81.0,24.5],[-80.5,25.0],[-80.0,25.5],[-79.5,26.0],[-79.5,26.5],[-80.0,27.0]],
  // Puerto Rico (id: 26)
  26: [[-65.5,18.5],[-66.0,18.5],[-66.5,18.5],[-67.0,18.3],[-67.2,18.0],[-67.0,17.8],[-66.5,17.8],[-66.0,18.0],[-65.5,18.2],[-65.5,18.5]],
  // US Virgin Islands (id: 27)
  27: [[-64.5,18.5],[-65.0,18.5],[-65.2,18.3],[-65.0,18.0],[-64.5,18.0],[-64.3,18.3],[-64.5,18.5]],
  // Northern Great Plains (id: 28)
  28: [[-97.0,49.0],[-98.0,49.0],[-100.0,49.0],[-102.0,49.0],[-104.0,49.0],[-104.0,47.0],[-104.0,45.0],[-102.0,45.0],[-100.0,45.0],[-98.0,46.0],[-97.0,47.0],[-97.0,49.0]],
  // Black Hills (id: 29)
  29: [[-103.0,45.0],[-104.0,45.0],[-104.5,44.5],[-104.5,44.0],[-104.0,43.5],[-103.5,43.0],[-103.0,43.0],[-102.5,43.5],[-102.5,44.0],[-102.8,44.5],[-103.0,45.0]],
  // Lower Great Plains (id: 30)
  30: [[-97.0,42.0],[-98.0,42.0],[-100.0,42.0],[-102.0,41.0],[-102.0,39.0],[-102.0,37.0],[-100.0,37.0],[-98.0,37.0],[-97.0,38.0],[-96.0,39.0],[-96.0,40.0],[-96.5,41.0],[-97.0,42.0]],
  // Columbia Plateau (id: 31)
  31: [[-117.0,49.0],[-118.0,49.0],[-119.0,48.0],[-120.0,47.0],[-120.0,46.0],[-119.0,45.0],[-118.0,45.0],[-117.0,45.5],[-116.0,46.0],[-115.0,47.0],[-115.0,48.0],[-116.0,49.0],[-117.0,49.0]],
  // Northern Rockies (id: 32)
  32: [[-104.0,49.0],[-106.0,49.0],[-110.0,49.0],[-114.0,49.0],[-114.0,47.0],[-114.0,45.0],[-112.0,44.0],[-110.0,44.0],[-108.0,44.0],[-106.0,45.0],[-104.0,47.0],[-104.0,49.0]],
  // Front Range (id: 33)
  33: [[-104.0,41.0],[-105.0,41.0],[-106.0,40.5],[-106.0,39.5],[-105.5,38.5],[-105.0,37.5],[-104.5,37.0],[-104.0,37.0],[-103.5,37.5],[-103.5,38.5],[-103.8,39.5],[-104.0,40.5],[-104.0,41.0]],
  // Great Basin (id: 34)
  34: [[-114.0,42.0],[-116.0,42.0],[-118.0,42.0],[-119.0,41.0],[-120.0,39.0],[-119.0,37.0],[-117.0,36.0],[-115.0,36.0],[-114.0,37.0],[-113.0,38.0],[-113.0,40.0],[-114.0,42.0]],
  // Navajo Nation (id: 35)
  35: [[-109.0,37.0],[-110.0,37.0],[-111.0,37.0],[-112.0,36.5],[-111.0,35.5],[-110.0,35.0],[-109.0,35.0],[-108.0,35.5],[-108.0,36.5],[-109.0,37.0]],
  // Mormon Corridor (id: 36)
  36: [[-111.0,42.0],[-112.0,42.0],[-114.0,42.0],[-114.0,40.0],[-114.0,38.0],[-113.0,37.0],[-112.0,37.0],[-111.0,37.5],[-110.0,38.5],[-110.0,40.0],[-110.5,41.0],[-111.0,42.0]],
  // Classic Southwest (id: 37)
  37: [[-109.0,37.0],[-110.0,37.0],[-112.0,37.0],[-114.0,36.0],[-114.0,34.0],[-114.0,32.0],[-112.0,31.5],[-110.0,31.5],[-108.0,31.5],[-108.0,33.0],[-108.0,35.0],[-109.0,37.0]],
  // Mezquital (id: 38)
  38: [[-103.0,35.0],[-104.0,35.0],[-106.0,35.0],[-107.0,34.0],[-108.0,32.0],[-107.0,31.0],[-105.0,30.0],[-103.0,30.0],[-102.0,31.0],[-101.5,32.0],[-102.0,33.5],[-103.0,35.0]],
  // Cascadia (id: 39)
  39: [[-122.0,49.0],[-123.0,49.0],[-124.0,48.0],[-124.5,47.0],[-124.0,46.0],[-123.5,45.0],[-123.0,44.0],[-122.5,44.0],[-122.0,44.5],[-121.5,45.5],[-121.5,47.0],[-122.0,48.0],[-122.0,49.0]],
  // Jefferson (id: 40)
  40: [[-122.0,44.0],[-123.0,44.0],[-124.0,43.0],[-124.0,42.0],[-123.5,41.0],[-122.5,41.0],[-121.5,41.5],[-121.0,42.5],[-121.5,43.5],[-122.0,44.0]],
  // North Coast (id: 41)
  41: [[-122.5,41.0],[-123.5,41.0],[-124.5,40.0],[-124.0,39.0],[-123.5,38.5],[-122.5,38.5],[-122.0,39.0],[-121.8,40.0],[-122.5,41.0]],
  // Central Valley (id: 42)
  42: [[-121.0,40.0],[-122.0,40.0],[-122.5,39.0],[-122.0,38.0],[-121.5,37.0],[-121.0,36.0],[-120.0,35.0],[-119.0,35.0],[-118.5,36.0],[-119.0,37.0],[-119.5,38.0],[-120.0,39.0],[-121.0,40.0]],
  // Sierra Nevadas (id: 43)
  43: [[-118.5,40.0],[-119.5,40.0],[-120.0,39.0],[-120.0,38.0],[-119.5,37.0],[-119.0,36.0],[-118.0,35.5],[-117.5,36.0],[-117.5,37.0],[-118.0,38.0],[-118.5,40.0]],
  // SF Bay Area (id: 44)
  44: [[-122.0,38.5],[-122.5,38.5],[-123.0,38.0],[-122.8,37.5],[-122.5,37.0],[-122.0,37.0],[-121.5,37.5],[-121.5,38.0],[-122.0,38.5]],
  // Central Coast (id: 45)
  45: [[-120.0,36.5],[-121.0,36.5],[-121.5,36.0],[-121.5,35.0],[-121.0,34.5],[-120.0,34.5],[-119.5,35.0],[-119.5,36.0],[-120.0,36.5]],
  // SoCal (id: 46)
  46: [[-117.0,35.0],[-118.0,35.0],[-119.0,35.0],[-120.0,34.5],[-120.0,33.5],[-119.0,33.0],[-117.5,32.5],[-116.0,32.5],[-115.5,33.0],[-115.5,34.0],[-116.0,34.5],[-117.0,35.0]],
  // Hawaii (id: 47)
  47: [[-154.0,20.5],[-155.0,20.5],[-156.0,20.5],[-157.0,21.5],[-158.0,21.5],[-159.0,22.0],[-160.0,22.0],[-160.0,21.0],[-159.0,20.0],[-158.0,19.5],[-157.0,19.0],[-156.0,19.0],[-155.0,19.5],[-154.0,20.0],[-154.0,20.5]],
  // Alaskan First Nation (id: 48)
  48: [[-141.0,70.0],[-145.0,70.0],[-150.0,70.0],[-155.0,70.0],[-160.0,68.0],[-165.0,66.0],[-168.0,65.0],[-165.0,63.0],[-160.0,62.0],[-155.0,61.0],[-150.0,62.0],[-145.0,63.0],[-141.0,65.0],[-141.0,70.0]],
  // Alaskan Maritime (id: 49)
  49: [[-130.0,60.0],[-135.0,59.0],[-140.0,60.0],[-145.0,61.0],[-150.0,61.0],[-155.0,60.0],[-160.0,58.0],[-165.0,55.0],[-170.0,52.0],[-175.0,52.0],[-175.0,54.0],[-170.0,56.0],[-165.0,58.0],[-160.0,60.0],[-155.0,61.0],[-150.0,62.0],[-145.0,62.0],[-140.0,61.0],[-135.0,60.0],[-130.0,60.0]],
  // American Oceania (id: 50) - simplified polygon for Pacific islands
  50: [[140.0,10.0],[145.0,10.0],[150.0,15.0],[150.0,20.0],[145.0,20.0],[140.0,15.0],[140.0,10.0]],
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert degrees to radians
 */
function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate Haversine distance between two GPS coordinates
 * @returns Distance in miles
 */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if a point is inside a polygon using ray-casting algorithm
 * @param lat Latitude of point
 * @param lng Longitude of point
 * @param polygon Array of [longitude, latitude] coordinate pairs
 */
export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    // Note: polygon coordinates are [lng, lat], so we swap for comparison
    const xi = polygon[i][1], yi = polygon[i][0]; // lat, lng
    const xj = polygon[j][1], yj = polygon[j][0]; // lat, lng
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Get Country Cultural Region from GPS coordinates using point-in-polygon
 * @returns Region name or null if not found
 */
export function getCountryCulturalRegion(lat: number, lng: number): string | null {
  for (const region of COUNTRY_CULTURAL_REGIONS) {
    const polygon = COUNTRY_CULTURAL_REGION_POLYGONS[region.id];
    if (polygon && pointInPolygon(lat, lng, polygon)) {
      return region.name;
    }
  }
  return null;
}

/**
 * Get Country Cultural Regions nearby (within specified miles) and sorted by distance
 * @param lat Latitude
 * @param lng Longitude
 * @param maxMiles Maximum distance in miles (default 50)
 * @returns Array of regions with distance, sorted by distance
 */
export function getNearbyCountryCulturalRegions(
  lat: number,
  lng: number,
  maxMiles: number = 50
): CountryCulturalRegionWithDistance[] {
  return COUNTRY_CULTURAL_REGIONS
    .map(region => ({
      ...region,
      distance: haversineDistance(lat, lng, region.latitude, region.longitude),
    }))
    .filter(r => {
      // Include if within max distance OR point is inside the polygon
      if (r.distance <= maxMiles) return true;
      const polygon = COUNTRY_CULTURAL_REGION_POLYGONS[r.id];
      return polygon && pointInPolygon(lat, lng, polygon);
    })
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Get all Country Cultural Regions grouped by category
 * Used when GPS is not available
 */
export function getCountryCulturalRegionsByCategory(): Record<string, CountryCulturalRegion[]> {
  const grouped: Record<string, CountryCulturalRegion[]> = {};
  for (const category of COUNTRY_CULTURAL_REGION_CATEGORIES) {
    grouped[category] = COUNTRY_CULTURAL_REGIONS.filter(r => r.category === category);
  }
  return grouped;
}

/**
 * Validate that a country cultural region name is valid
 */
export function isValidCountryCulturalRegion(name: string | null | undefined): boolean {
  if (!name) return true; // null is valid (not set)
  return COUNTRY_CULTURAL_REGIONS.some(r => r.name === name);
}
