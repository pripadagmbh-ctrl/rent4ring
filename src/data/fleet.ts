export type Drivetrain = 'FWD' | 'RWD' | 'AWD';

export interface Car {
  id: string;
  brand: string;
  model: string;
  /** Metric horsepower (PS), as advertised by Rent4Ring. */
  ps: number;
  /** Kerb weight in kg. */
  massKg: number;
  drivetrain: Drivetrain;
  /** Peak engine torque, Nm. */
  torqueNm: number;
  /** 0–100 km/h in seconds. */
  zeroToHundred: number;
  /** Electronically limited or aerodynamic top speed, km/h. */
  topSpeedKmh: number;
  gearRatios: number[];
  finalDrive: number;
  /** Engine speed at peak power, min^-1. Electric cars use a single-speed pseudo-curve. */
  redlineRpm: number;
  electric: boolean;
  /** Base lateral grip coefficient — road tyres ~1.05, cup tyres ~1.35. */
  grip: number;
  /** Downforce coefficient: extra grip per (m/s)^2. */
  downforce: number;
  /** Front weight distribution, 0–1. */
  frontWeight: number;
  /** Wheelbase, m. */
  wheelbase: number;
  /** Aerodynamic drag area (Cd * A), m^2. */
  cdA: number;
  /** Target lap time in seconds — beat it for the discount code. */
  targetLapSec: number;
  /** Body paint. */
  color: number;
  accent: number;
  /** Rough body dimensions in metres (length, width, height). */
  size: [number, number, number];
  blurb: string;
}

export const FLEET: Car[] = [
  {
    id: 'mini-cooper-s',
    brand: 'MINI',
    model: 'Cooper S',
    ps: 192,
    massKg: 1150,
    drivetrain: 'FWD',
    torqueNm: 280,
    zeroToHundred: 6.8,
    topSpeedKmh: 235,
    gearRatios: [3.31, 2.13, 1.48, 1.14, 0.95, 0.82],
    finalDrive: 3.68,
    redlineRpm: 6500,
    electric: false,
    grip: 1.05,
    downforce: 0.0000200,
    frontWeight: 0.62,
    wheelbase: 2.5,
    cdA: 0.72,
    targetLapSec: 720,
    color: 0xe0489b,
    accent: 0xf2f2f2,
    size: [3.86, 1.73, 1.41],
    blurb:
      "The cheapest way to the biggest grin. Light, darty and brutally honest at the limit.",
  },
  {
    id: 'gr-yaris',
    brand: 'Toyota',
    model: 'GR Yaris',
    ps: 280,
    massKg: 1280,
    drivetrain: 'AWD',
    torqueNm: 390,
    zeroToHundred: 5.2,
    topSpeedKmh: 230,
    gearRatios: [3.54, 1.91, 1.31, 1.0, 0.79, 0.64],
    finalDrive: 3.94,
    redlineRpm: 7000,
    electric: false,
    grip: 1.18,
    downforce: 0.0000152,
    frontWeight: 0.6,
    wheelbase: 2.56,
    cdA: 0.78,
    targetLapSec: 690,
    color: 0xf2f4f6,
    accent: 0xd0021b,
    size: [3.99, 1.81, 1.46],
    blurb:
      "A homologation rally car with number plates. Four-wheel drive, three cylinders, absurd traction.",
  },
  {
    id: 'gr-supra',
    brand: 'Toyota',
    model: 'GR Supra',
    // 3.0-litre straight-six variant — matches the blurb and the final drive
    // already in this record (the 258 PS figures were the 2.0).
    ps: 340,
    massKg: 1495,
    drivetrain: 'RWD',
    torqueNm: 500,
    zeroToHundred: 4.3,
    topSpeedKmh: 250,
    gearRatios: [3.4, 2.05, 1.55, 1.22, 1.0, 0.84],
    finalDrive: 3.9,
    redlineRpm: 6500,
    electric: false,
    grip: 1.14,
    downforce: 0.0000175,
    frontWeight: 0.52,
    wheelbase: 2.47,
    cdA: 0.66,
    targetLapSec: 690,
    color: 0xf5c518,
    accent: 0x1b1b1f,
    size: [4.38, 1.85, 1.29],
    blurb:
      "Short wheelbase, straight-six character and proper old-fashioned rear-drive manners.",
  },
  {
    id: 'taycan-turbo-gt',
    brand: 'Porsche',
    model: 'Taycan Turbo GT',
    ps: 1034,
    massKg: 2295,
    drivetrain: 'AWD',
    torqueNm: 1340,
    zeroToHundred: 2.3,
    topSpeedKmh: 305,
    gearRatios: [1.0, 0.55],
    finalDrive: 8.05,
    redlineRpm: 16000,
    electric: true,
    grip: 1.26,
    downforce: 0.0000181,
    frontWeight: 0.49,
    wheelbase: 2.9,
    cdA: 0.62,
    targetLapSec: 660,
    color: 0x5b4fd6,
    accent: 0xb07ae8,
    size: [4.96, 1.97, 1.38],
    blurb:
      "Over a thousand horsepower in near silence. Two tonnes that feel like one — until you brake.",
  },
  {
    id: '718-spyder-rs',
    brand: 'Porsche',
    model: '718 Spyder RS',
    ps: 500,
    massKg: 1410,
    drivetrain: 'RWD',
    torqueNm: 450,
    zeroToHundred: 3.4,
    topSpeedKmh: 308,
    gearRatios: [3.91, 2.29, 1.62, 1.24, 0.97, 0.78, 0.62],
    finalDrive: 3.44,
    redlineRpm: 9000,
    electric: false,
    grip: 1.3,
    downforce: 0.0000345,
    frontWeight: 0.45,
    wheelbase: 2.48,
    cdA: 0.7,
    targetLapSec: 645,
    color: 0xc8ccd2,
    accent: 0xe4572e,
    size: [4.42, 1.99, 1.24],
    blurb:
      "Mid-engined, naturally aspirated, 9,000 rpm and no roof. The noise alone is worth the hire.",
  },
  {
    id: '911-gt3-rs',
    brand: 'Porsche',
    model: '911 GT3 RS (992)',
    ps: 525,
    massKg: 1450,
    drivetrain: 'RWD',
    torqueNm: 465,
    zeroToHundred: 3.2,
    topSpeedKmh: 296,
    gearRatios: [3.75, 2.38, 1.72, 1.34, 1.08, 0.88, 0.72],
    finalDrive: 3.97,
    redlineRpm: 9000,
    electric: false,
    grip: 1.38,
    downforce: 0.0000946,
    frontWeight: 0.38,
    wheelbase: 2.46,
    cdA: 1.05,
    targetLapSec: 630,
    color: 0xf4f6f8,
    accent: 0x2f6fb2,
    size: [4.57, 1.9, 1.32],
    blurb:
      "The benchmark. 860 kg of downforce at 285 km/h — the wing pins you through the Hohe Acht.",
  },
  {
    id: 'ferrari-296-gtb',
    brand: 'Ferrari',
    model: '296 GTB',
    ps: 830,
    massKg: 1600,
    drivetrain: 'RWD',
    torqueNm: 740,
    zeroToHundred: 2.9,
    topSpeedKmh: 330,
    gearRatios: [3.44, 2.16, 1.62, 1.29, 1.05, 0.87, 0.72, 0.6],
    finalDrive: 4.06,
    redlineRpm: 8500,
    electric: false,
    grip: 1.34,
    downforce: 0.0000508,
    frontWeight: 0.405,
    wheelbase: 2.6,
    cdA: 0.82,
    targetLapSec: 645,
    color: 0xd40000,
    accent: 0x1a1a1a,
    size: [4.57, 1.96, 1.19],
    blurb:
      "830 hp of V6 hybrid. Devastating down the Doettinger Hoehe, spiky on corner exit.",
  },
];

export const carById = (id: string): Car => FLEET.find((c) => c.id === id) ?? FLEET[0];
