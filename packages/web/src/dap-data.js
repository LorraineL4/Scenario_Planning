/* DAP sample data — 24 SKUs across several product groups.
   Each row: { id, Product_Group, SKU_name, unit_velocity, current_ACV, months{Jan..Dec}, dist_prob } */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function flat(v) { const o = {}; MONTHS.forEach((m) => (o[m] = v)); return o; }
function ramp(startVal, endVal, startIdx) {
  const o = {};
  const span = 11 - startIdx;
  MONTHS.forEach((m, i) => {
    if (i < startIdx) o[m] = startVal;
    else {
      const t = span <= 0 ? 1 : (i - startIdx) / span;
      o[m] = Math.round((startVal + (endVal - startVal) * t) * 10) / 10;
    }
  });
  return o;
}

const defs = [
  // Product Group, SKU, velocity, current ACV, months, dist prob
  ["Global Blend 1.4L",     "Global Blend Medium 1.4L",     0.68, 48.6, flat(48.6),         30],

  ["Global Blend 1L",       "Global Blend Medium 1L",       2.29, 99.7, flat(99.7),          5],

  ["Global Blend 750mL",    "Global Blend Medium 750mL",    3.20, 98.9, flat(98.9),          5],

  ["Global Blend 500mL",    "Global Blend Medium 500mL",    2.88, 99.3, flat(99.3),          5],
  ["Global Blend 500mL",    "Global Blend Mild 500mL",      0.00,  0.0, ramp(0, 35, 3),     65],
  ["Global Blend 500mL",    "Global Blend Robust 500mL",    0.00,  0.0, flat(0),            45],

  ["Global Blend Squeeze",  "Global Blend Medium Squeeze",  0.87, 95.3, ramp(40, 95.3, 0),  20],
  ["Global Blend Squeeze",  "Global Blend Mild Squeeze",    0.41, 62.0, flat(62.0),         35],

  ["Citrus Press 1L",       "Citrus Press Original 1L",     1.94, 88.2, flat(88.2),         10],
  ["Citrus Press 1L",       "Citrus Press Zero 1L",         0.55, 41.0, ramp(41, 70, 4),    55],

  ["Citrus Press 500mL",    "Citrus Press Original 500mL",  2.61, 96.4, flat(96.4),          5],
  ["Citrus Press 500mL",    "Citrus Press Zero 500mL",      0.78, 58.5, flat(58.5),         40],
  ["Citrus Press 500mL",    "Citrus Press Grapefruit 500mL",0.00,  0.0, ramp(0, 25, 5),     60],

  ["Mountain Spring 1.5L",  "Mountain Spring Still 1.5L",   4.12, 99.9, flat(99.9),          2],
  ["Mountain Spring 1.5L",  "Mountain Spring Sparkling 1.5L",1.33,72.8, flat(72.8),         25],

  ["Mountain Spring 600mL", "Mountain Spring Still 600mL",  5.06, 99.5, flat(99.5),          3],
  ["Mountain Spring 600mL", "Mountain Spring Sparkling 600mL",2.20,84.1,flat(84.1),         15],
  ["Mountain Spring 600mL", "Mountain Spring Lime 600mL",   0.62, 33.4, ramp(33.4, 60, 2),  50],

  ["Cold Brew 750mL",       "Cold Brew Black 750mL",        1.47, 79.6, flat(79.6),         20],
  ["Cold Brew 750mL",       "Cold Brew Oat 750mL",          0.91, 54.2, ramp(54.2, 80, 3),  45],
  ["Cold Brew 750mL",       "Cold Brew Vanilla 750mL",      0.00,  0.0, flat(0),            40],

  ["Cold Brew Can",         "Cold Brew Black Can",          3.38, 92.7, flat(92.7),          8],
  ["Cold Brew Can",         "Cold Brew Oat Can",            1.85, 68.0, flat(68.0),         30],
  ["Cold Brew Can",         "Cold Brew Mocha Can",          0.00,  0.0, ramp(0, 40, 4),     70],
];

export const DAP_SAMPLE = defs.map((d, i) => ({
  id: "sample-" + i,
  Product_Group: d[0],
  SKU_name: d[1],
  unit_velocity: d[2],
  current_ACV: d[3],
  months: d[4],
  dist_prob: d[5],
}));
