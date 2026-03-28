export type FrameGeometry = {
  stack: number;
  reach: number;
  head_angle_deg: number;
  seat_angle_deg: number;
  bb_drop: number;
  chainstay_length: number;
  fork_length: number;
  fork_offset: number;
  wheel_radius: number;
  wheelbase?: number;
  seat_tube_ct?: number;
  head_tube?: number;
  top_tube_effective?: number;
};

export type SizeData = {
  size: string;
  geometry: FrameGeometry;
  wheelbase?: number;
  front_center?: number;
  trail?: number;
  top_tube_effective?: number;
  standover?: number;
  bb_height?: number;
  // Legacy fields kept for catalog rows that have not yet been inlined into
  // `geometry`. `getSizeData()` normalizes them so downstream code always reads
  // a consistent shape.
  seat_tube_ct?: number;
  head_tube?: number;
  stockCockpit?: {
    stem_length?: number;
    bar_width?: number;
    crank_length?: number;
    spacer_stack?: number;
  };
};

export type FrameModel = {
  id: string;
  brand: string;
  model: string;
  launch_year: number;
  category: string;
  popularity: string;
  sources: string[];
  sizes: SizeData[];
};

const defaultWheelRadius = 340;

const REQUIRED_GEOMETRY_FIELDS: Array<keyof FrameGeometry> = [
  "stack",
  "reach",
  "head_angle_deg",
  "seat_angle_deg",
  "bb_drop",
  "chainstay_length",
  "fork_length",
  "fork_offset",
  "wheel_radius",
];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeSizeData = (entry: SizeData): SizeData => ({
  ...entry,
  geometry: {
    ...entry.geometry,
    seat_tube_ct: entry.geometry.seat_tube_ct ?? entry.seat_tube_ct,
    head_tube: entry.geometry.head_tube ?? entry.head_tube,
  },
});

const validateSizeData = (model: FrameModel, entry: SizeData) => {
  const normalized = normalizeSizeData(entry);
  const prefix = `Invalid frame catalog entry for ${model.id} size ${entry.size}:`;

  if (!entry.size) {
    throw new Error(`${prefix} missing size label.`);
  }

  for (const field of REQUIRED_GEOMETRY_FIELDS) {
    if (!isFiniteNumber(normalized.geometry[field])) {
      throw new Error(`${prefix} geometry.${field} must be a finite number.`);
    }
  }

  const optionalNumberFields: Array<[string, unknown]> = [
    ["geometry.seat_tube_ct", normalized.geometry.seat_tube_ct],
    ["geometry.head_tube", normalized.geometry.head_tube],
    ["wheelbase", normalized.wheelbase],
    ["front_center", normalized.front_center],
    ["trail", normalized.trail],
    ["top_tube_effective", normalized.top_tube_effective],
    ["standover", normalized.standover],
    ["bb_height", normalized.bb_height],
  ];

  for (const [label, value] of optionalNumberFields) {
    if (value != null && !isFiniteNumber(value)) {
      throw new Error(`${prefix} ${label} must be a finite number when provided.`);
    }
  }

  if (entry.seat_tube_ct != null && entry.geometry.seat_tube_ct != null && entry.seat_tube_ct !== entry.geometry.seat_tube_ct) {
    throw new Error(`${prefix} conflicting seat_tube_ct values at size and geometry levels.`);
  }

  if (entry.head_tube != null && entry.geometry.head_tube != null && entry.head_tube !== entry.geometry.head_tube) {
    throw new Error(`${prefix} conflicting head_tube values at size and geometry levels.`);
  }
};

const validateFrameCatalog = (catalog: FrameModel[]) => {
  const modelIds = new Set<string>();

  for (const model of catalog) {
    if (!model.id) {
      throw new Error("Invalid frame catalog entry: missing model id.");
    }
    if (modelIds.has(model.id)) {
      throw new Error(`Invalid frame catalog entry: duplicate model id '${model.id}'.`);
    }
    modelIds.add(model.id);

    const seenSizes = new Set<string>();
    for (const entry of model.sizes) {
      if (seenSizes.has(entry.size)) {
        throw new Error(`Invalid frame catalog entry for ${model.id}: duplicate size '${entry.size}'.`);
      }
      seenSizes.add(entry.size);
      validateSizeData(model, entry);
    }
  }
};

export const FRAME_CATALOG: FrameModel[] = [
  {
    id: "specialized-tarmac-sl8",
    brand: "Specialized",
    model: "S-Works Tarmac SL8",
    launch_year: 2023,
    category: "All-round race",
    popularity: "Used across multiple 2025 WorldTour programs and featured in Cyclingnews' team tech guides.",
    sources: [
      "https://www.specialized.com/us/en/p/4292989",
      "https://www.specialized.com/us/en/s-works-tarmac-sl8---sram-red-etap-axs/p/216959?color=349998-216959&searchText=94924-0244",
      "https://www.cyclingnews.com/features/womens-worldtour-bikes-and-tech-what-are-teams-using-in-2025/"
    ],
    sizes: [
      {
        size: "44",
        geometry: {
          stack: 501,
          reach: 366,
          head_angle_deg: 70.5,
          seat_angle_deg: 75.5,
          bb_drop: 74,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 47,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 970,
        front_center: 572,
        trail: 71,
        top_tube_effective: 496,
        standover: 723,
        bb_height: 266,
        seat_tube_ct: 433,
        head_tube: 99,
        stockCockpit: { stem_length: 75, bar_width: 380, crank_length: 165 }
      },
      {
        size: "49",
        geometry: {
          stack: 514,
          reach: 375,
          head_angle_deg: 71.75,
          seat_angle_deg: 75.5,
          bb_drop: 74,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 47,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 973,
        front_center: 574,
        trail: 63,
        top_tube_effective: 509,
        standover: 735,
        bb_height: 266,
        seat_tube_ct: 445,
        head_tube: 109,
        stockCockpit: { stem_length: 75, bar_width: 380, crank_length: 165 }
      },
      {
        size: "52",
        geometry: {
          stack: 527,
          reach: 380,
          head_angle_deg: 72.5,
          seat_angle_deg: 74,
          bb_drop: 74,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 47,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 975,
        front_center: 577,
        trail: 58,
        top_tube_effective: 531,
        standover: 746,
        bb_height: 266,
        seat_tube_ct: 456,
        head_tube: 120,
        stockCockpit: { stem_length: 90, bar_width: 400, crank_length: 170 }
      },
      {
        size: "54",
        geometry: {
          stack: 544,
          reach: 384,
          head_angle_deg: 73,
          seat_angle_deg: 74,
          bb_drop: 72,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 44,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 978,
        front_center: 579,
        trail: 58,
        top_tube_effective: 541,
        standover: 768,
        bb_height: 268,
        seat_tube_ct: 473,
        head_tube: 137,
        stockCockpit: { stem_length: 100, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "56",
        geometry: {
          stack: 565,
          reach: 395,
          head_angle_deg: 73.5,
          seat_angle_deg: 73.5,
          bb_drop: 72,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 44,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 991,
        front_center: 592,
        trail: 55,
        top_tube_effective: 563,
        standover: 786,
        bb_height: 268,
        seat_tube_ct: 494,
        head_tube: 157,
        stockCockpit: { stem_length: 100, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "58",
        geometry: {
          stack: 591,
          reach: 402,
          head_angle_deg: 73.5,
          seat_angle_deg: 73.5,
          bb_drop: 72,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 44,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1006,
        front_center: 606,
        trail: 55,
        top_tube_effective: 577,
        standover: 808,
        bb_height: 268,
        seat_tube_ct: 515,
        head_tube: 184,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      },
      {
        size: "61",
        geometry: {
          stack: 612,
          reach: 408,
          head_angle_deg: 74,
          seat_angle_deg: 73,
          bb_drop: 72,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 44,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1013,
        front_center: 613,
        trail: 52,
        top_tube_effective: 595,
        standover: 834,
        bb_height: 268,
        seat_tube_ct: 545,
        head_tube: 204,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      }
    ]
  },
  {
    id: "specialized-tarmac-sl6",
    brand: "Specialized",
    model: "S-Works Tarmac SL6",
    launch_year: 2019,
    category: "All-round race",
    popularity: "The SL6 generation underpinned multiple WorldTour championship wins and remained in the pro peloton through 2022.",
    sources: [
      "https://www.specialized.com/us/en/s-works-tarmac-sl6/p/156264",
      "https://www.bikeradar.com/reviews/bikes/road-bikes/specialized-tarmac-sl6-review/"
    ],
    sizes: [
      {
        size: "44",
        geometry: {
          stack: 499,
          reach: 368,
          head_angle_deg: 70.5,
          seat_angle_deg: 75.5,
          bb_drop: 73,
          chainstay_length: 409,
          fork_length: 375,
          fork_offset: 49,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 965,
        front_center: 567,
        trail: 72,
        top_tube_effective: 490,
        standover: 730,
        bb_height: 266,
        seat_tube_ct: 400,
        head_tube: 105,
        stockCockpit: { stem_length: 75, bar_width: 380, crank_length: 165 }
      },
      {
        size: "49",
        geometry: {
          stack: 512,
          reach: 373,
          head_angle_deg: 71.5,
          seat_angle_deg: 75.5,
          bb_drop: 73,
          chainstay_length: 409,
          fork_length: 374,
          fork_offset: 49,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 968,
        front_center: 570,
        trail: 66,
        top_tube_effective: 508,
        standover: 740,
        bb_height: 266,
        seat_tube_ct: 431,
        head_tube: 115,
        stockCockpit: { stem_length: 75, bar_width: 380, crank_length: 165 }
      },
      {
        size: "52",
        geometry: {
          stack: 525,
          reach: 380,
          head_angle_deg: 72.5,
          seat_angle_deg: 74,
          bb_drop: 73,
          chainstay_length: 409,
          fork_length: 373,
          fork_offset: 49,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 973,
        front_center: 574,
        trail: 61,
        top_tube_effective: 531,
        standover: 755,
        bb_height: 266,
        seat_tube_ct: 462,
        head_tube: 126,
        stockCockpit: { stem_length: 90, bar_width: 400, crank_length: 170 }
      },
      {
        size: "54",
        geometry: {
          stack: 540,
          reach: 384,
          head_angle_deg: 73,
          seat_angle_deg: 74,
          bb_drop: 72,
          chainstay_length: 409,
          fork_length: 371,
          fork_offset: 44,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 975,
        front_center: 576,
        trail: 61,
        top_tube_effective: 540,
        standover: 775,
        bb_height: 268,
        seat_tube_ct: 481,
        head_tube: 143,
        stockCockpit: { stem_length: 100, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "56",
        geometry: {
          stack: 561,
          reach: 394,
          head_angle_deg: 73.5,
          seat_angle_deg: 73.5,
          bb_drop: 72,
          chainstay_length: 409,
          fork_length: 371,
          fork_offset: 44,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 987,
        front_center: 588,
        trail: 57,
        top_tube_effective: 562,
        standover: 795,
        bb_height: 268,
        seat_tube_ct: 501,
        head_tube: 163,
        stockCockpit: { stem_length: 100, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "58",
        geometry: {
          stack: 586,
          reach: 401,
          head_angle_deg: 73.5,
          seat_angle_deg: 73.5,
          bb_drop: 72,
          chainstay_length: 409,
          fork_length: 371,
          fork_offset: 44,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1002,
        front_center: 603,
        trail: 57,
        top_tube_effective: 577,
        standover: 826,
        bb_height: 268,
        seat_tube_ct: 522,
        head_tube: 190,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      },
      {
        size: "61",
        geometry: {
          stack: 607,
          reach: 407,
          head_angle_deg: 74,
          seat_angle_deg: 73,
          bb_drop: 72,
          chainstay_length: 409,
          fork_length: 371,
          fork_offset: 44,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1011,
        front_center: 612,
        trail: 54,
        top_tube_effective: 595,
        standover: 850,
        bb_height: 268,
        seat_tube_ct: 553,
        head_tube: 210,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      }
    ]
  },
  {
    id: "canyon-aeroad-cfr",
    brand: "Canyon",
    model: "Aeroad CFR",
    launch_year: 2021,
    category: "Aero race",
    popularity: "Featured by Canyon as ridden by CANYON//SRAM, Movistar and Alpecin-Deceuninck in 2025 coverage.",
    sources: [
      "https://www.canyon.com/en-us/road-bikes/aero-bikes/aeroad/cfr/aeroad-cfr-axs/4040.html",
      "https://www.cyclingnews.com/features/tour-de-france-bikes/",
      "https://mrmamil.com/canyon-aeroad-frame-geometry/"
    ],
    sizes: [
      {
        size: "2XS",
        geometry: {
          stack: 498,
          reach: 372,
          head_angle_deg: 70,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 47,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 975,
        top_tube_effective: 516,
        standover: 720,
        bb_height: 270,
        seat_tube_ct: 441,
        head_tube: 88,
        stockCockpit: { stem_length: 80, bar_width: 370, crank_length: 165, spacer_stack: 20 }
      },
      {
        size: "XS",
        geometry: {
          stack: 520,
          reach: 378,
          head_angle_deg: 71.2,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 47,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 979,
        top_tube_effective: 529,
        standover: 748,
        bb_height: 270,
        seat_tube_ct: 471,
        head_tube: 107,
        stockCockpit: { stem_length: 90, bar_width: 370, crank_length: 170, spacer_stack: 20 }
      },
      {
        size: "S",
        geometry: {
          stack: 539,
          reach: 390,
          head_angle_deg: 72.8,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 982,
        top_tube_effective: 546,
        standover: 775,
        bb_height: 270,
        seat_tube_ct: 501,
        head_tube: 121,
        stockCockpit: { stem_length: 90, bar_width: 370, crank_length: 170, spacer_stack: 20 }
      },
      {
        size: "M",
        geometry: {
          stack: 560,
          reach: 393,
          head_angle_deg: 73.25,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 988,
        top_tube_effective: 555,
        standover: 801,
        bb_height: 270,
        seat_tube_ct: 531,
        head_tube: 142,
        stockCockpit: { stem_length: 100, bar_width: 410, crank_length: 172.5, spacer_stack: 20 }
      },
      {
        size: "L",
        geometry: {
          stack: 580,
          reach: 401,
          head_angle_deg: 73.3,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 413,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1003,
        top_tube_effective: 569,
        standover: 828,
        bb_height: 270,
        seat_tube_ct: 561,
        head_tube: 162,
        stockCockpit: { stem_length: 110, bar_width: 410, crank_length: 172.5, spacer_stack: 20 }
      },
      {
        size: "XL",
        geometry: {
          stack: 606,
          reach: 419,
          head_angle_deg: 73.5,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 415,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1029,
        top_tube_effective: 594,
        standover: 851,
        bb_height: 270,
        seat_tube_ct: 591,
        head_tube: 188,
        stockCockpit: { stem_length: 110, bar_width: 410, crank_length: 175, spacer_stack: 20 }
      },
      {
        size: "2XL",
        geometry: {
          stack: 624,
          reach: 429,
          head_angle_deg: 73.8,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 415,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1042,
        top_tube_effective: 609,
        standover: 874,
        bb_height: 270,
        seat_tube_ct: 621,
        head_tube: 206,
        stockCockpit: { stem_length: 120, bar_width: 410, crank_length: 175, spacer_stack: 20 }
      }
    ]
  },
  {
    id: "trek-madone-gen8",
    brand: "Trek",
    model: "Madone Gen 8",
    launch_year: 2024,
    category: "Aero all-round race",
    popularity: "The flagship race bike for Lidl-Trek's 2025 WorldTour program.",
    sources: [
      "https://www.cyclingnews.com/features/mens-worldtour-bikes-and-tech-what-are-teams-using-in-2025/",
      "https://www.bikemart.com/products/2025-madone-sl-6-gen-8-road-bike",
      "https://www.bikeradar.com/news/2025-trek-madone"
    ],
    sizes: [
      {
        size: "XS",
        geometry: {
          stack: 507,
          reach: 370,
          head_angle_deg: 71.6,
          seat_angle_deg: 73.8,
          bb_drop: 72,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 971,
        trail: 61,
        top_tube_effective: 517,
        standover: 704,
        bb_height: 268,
        seat_tube_ct: 404,
        head_tube: 100,
      },
      {
        size: "S",
        geometry: {
          stack: 530,
          reach: 378,
          head_angle_deg: 72.2,
          seat_angle_deg: 73.8,
          bb_drop: 72,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 976,
        trail: 62,
        top_tube_effective: 532,
        standover: 734,
        bb_height: 268,
        seat_tube_ct: 440,
        head_tube: 121,
      },
      {
        size: "M",
        geometry: {
          stack: 546,
          reach: 384,
          head_angle_deg: 72.9,
          seat_angle_deg: 73.6,
          bb_drop: 70,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 981,
        trail: 58,
        top_tube_effective: 545,
        standover: 762,
        bb_height: 270,
        seat_tube_ct: 476,
        head_tube: 136,
      },
      {
        size: "ML",
        geometry: {
          stack: 562,
          reach: 389,
          head_angle_deg: 73.5,
          seat_angle_deg: 73.4,
          bb_drop: 70,
          chainstay_length: 410,
          fork_length: 370,
          fork_offset: 40,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 980,
        trail: 59,
        top_tube_effective: 557,
        standover: 790,
        bb_height: 270,
        seat_tube_ct: 512,
        head_tube: 150,
      },
      {
        size: "L",
        geometry: {
          stack: 582,
          reach: 394,
          head_angle_deg: 73.8,
          seat_angle_deg: 73.4,
          bb_drop: 68,
          chainstay_length: 411,
          fork_length: 370,
          fork_offset: 40,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 990,
        trail: 57,
        top_tube_effective: 568,
        standover: 820,
        bb_height: 272,
        seat_tube_ct: 548,
        head_tube: 172,
      },
      {
        size: "XL",
        geometry: {
          stack: 610,
          reach: 402,
          head_angle_deg: 73.9,
          seat_angle_deg: 73.4,
          bb_drop: 68,
          chainstay_length: 412,
          fork_length: 370,
          fork_offset: 40,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1007,
        trail: 57,
        top_tube_effective: 584,
        standover: 863,
        bb_height: 272,
        seat_tube_ct: 609,
        head_tube: 201,
      }
    ]
  },
  {
    id: "cervelo-s5",
    brand: "Cervelo",
    model: "S5",
    launch_year: 2023,
    category: "Aero race",
    popularity: "The 2025 S5 is Cervelo's current aero flagship for Visma-Lease a Bike and related pro programs.",
    sources: [
      "https://www.cervelo.com/en-US/bikes/s5",
      "https://www.cyclingnews.com/news/cervelo-claims-its-new-s5-is-the-fastest-aero-bike-in-the-pro-peloton-and-jonas-vingegaard-will-look-to-prove-it-at-this-years-tour-de-france/",
      "https://www.cyclingnews.com/bikes/pro-bikes/womens-worldtour-bikes-and-tech-2026/"
    ],
    sizes: [
      {
        size: "48",
        geometry: {
          stack: 496,
          reach: 367,
          head_angle_deg: 71,
          seat_angle_deg: 73,
          bb_drop: 74.5,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 58.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 973,
        front_center: 579,
        trail: 55.6,
        top_tube_effective: 520,
        standover: 712,
        bb_height: 265.5,
        head_tube: 64,
      },
      {
        size: "51",
        geometry: {
          stack: 519,
          reach: 376,
          head_angle_deg: 72,
          seat_angle_deg: 73,
          bb_drop: 74.5,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 52.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 974,
        front_center: 580,
        trail: 55.6,
        top_tube_effective: 535,
        standover: 734,
        bb_height: 265.5,
        head_tube: 82,
      },
      {
        size: "54",
        geometry: {
          stack: 542,
          reach: 384,
          head_angle_deg: 73,
          seat_angle_deg: 73,
          bb_drop: 72,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 46.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 975,
        front_center: 581,
        trail: 55.6,
        top_tube_effective: 550,
        standover: 758,
        bb_height: 268,
        head_tube: 104,
      },
      {
        size: "56",
        geometry: {
          stack: 565,
          reach: 392,
          head_angle_deg: 73.5,
          seat_angle_deg: 73,
          bb_drop: 72,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 43.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 982,
        front_center: 588,
        trail: 55.6,
        top_tube_effective: 565,
        standover: 781,
        bb_height: 268,
        head_tube: 125,
      },
      {
        size: "58",
        geometry: {
          stack: 588,
          reach: 401,
          head_angle_deg: 73.5,
          seat_angle_deg: 73,
          bb_drop: 69.5,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 43.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 999,
        front_center: 604,
        trail: 55.6,
        top_tube_effective: 581,
        standover: 804,
        bb_height: 270.5,
        head_tube: 152,
      },
      {
        size: "61",
        geometry: {
          stack: 608,
          reach: 409,
          head_angle_deg: 73.5,
          seat_angle_deg: 73,
          bb_drop: 69.5,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 43.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1013,
        front_center: 617,
        trail: 55.6,
        top_tube_effective: 595,
        standover: 822,
        bb_height: 270.5,
        head_tube: 173,
      }
    ]
  },
  {
    id: "colnago-y1rs",
    brand: "Colnago",
    model: "Y1Rs",
    launch_year: 2024,
    category: "Aero race",
    popularity: "The headline 2025 UAE Team Emirates-XRG race bike used in the Tour de France.",
    sources: [
      "https://www.manualslib.com/manual/4042881/Colnago-Y1rs.html",
      "https://www.bikeradar.com/reviews/bikes/road-bikes/colnago-y1rs-review",
      "https://www.cyclingnews.com/features/tour-de-france-bikes/",
      "https://geometrygeeks.bike/bike/colnago-y1rs-2025/"
    ],
    sizes: [
      {
        size: "XS",
        geometry: {
          stack: 495,
          reach: 368,
          head_angle_deg: 70.8,
          seat_angle_deg: 75,
          bb_drop: 74,
          chainstay_length: 408,
          fork_length: 376.5,
          fork_offset: 55,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 974,
        front_center: 577.5,
        trail: 61,
        bb_height: 266,
        head_tube: 88.5
      },
      {
        size: "S",
        geometry: {
          stack: 520,
          reach: 377,
          head_angle_deg: 71.9,
          seat_angle_deg: 74.5,
          bb_drop: 74,
          chainstay_length: 408,
          fork_length: 376.5,
          fork_offset: 49.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 976,
        front_center: 579.5,
        trail: 59.5,
        bb_height: 266,
        head_tube: 108.5
      },
      {
        size: "M",
        geometry: {
          stack: 540,
          reach: 386,
          head_angle_deg: 73,
          seat_angle_deg: 74,
          bb_drop: 72,
          chainstay_length: 408,
          fork_length: 376.5,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 978,
        front_center: 581,
        trail: 57.5,
        bb_height: 268,
        head_tube: 126.5
      },
      {
        size: "L",
        geometry: {
          stack: 565,
          reach: 395,
          head_angle_deg: 73.5,
          seat_angle_deg: 73.7,
          bb_drop: 72,
          chainstay_length: 408,
          fork_length: 376.5,
          fork_offset: 42.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 987,
        front_center: 590,
        trail: 57,
        bb_height: 268,
        head_tube: 150.5
      },
      {
        size: "XL",
        geometry: {
          stack: 590,
          reach: 404,
          head_angle_deg: 73.5,
          seat_angle_deg: 73,
          bb_drop: 72,
          chainstay_length: 408,
          fork_length: 376.5,
          fork_offset: 42.5,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1003,
        front_center: 606,
        trail: 57,
        bb_height: 268,
        head_tube: 176.5
      }
    ]
  },
  {
    id: "giant-propel-advanced-sl",
    brand: "Giant",
    model: "Propel Advanced SL",
    launch_year: 2023,
    category: "Aero race",
    popularity: "The aero platform used by Team Jayco AlUla in 2025.",
    sources: [
      "https://www.giant-bicycles.com/us/propel-advanced-sl-frameset-2025",
      "https://www.cyclingweekly.com/products/worldtour-bikes-2025-our-guide-to-the-most-awesome-tech-in-the-pro-peloton"
    ],
    sizes: [
      {
        size: "XS",
        geometry: {
          stack: 517,
          reach: 376,
          head_angle_deg: 71,
          seat_angle_deg: 74.5,
          bb_drop: 72,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 976,
        trail: 70.5,
        top_tube_effective: 520,
        standover: 734,
        bb_height: 264,
        seat_tube_ct: 680,
        head_tube: 120,
        stockCockpit: { stem_length: 80, bar_width: 400, crank_length: 170 }
      },
      {
        size: "S",
        geometry: {
          stack: 528,
          reach: 383,
          head_angle_deg: 72.3,
          seat_angle_deg: 74,
          bb_drop: 70,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 977,
        trail: 62.5,
        top_tube_effective: 535,
        standover: 755,
        bb_height: 266,
        seat_tube_ct: 710,
        head_tube: 130,
        stockCockpit: { stem_length: 90, bar_width: 400, crank_length: 170 }
      },
      {
        size: "M",
        geometry: {
          stack: 545,
          reach: 388,
          head_angle_deg: 73,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 980,
        trail: 57.8,
        top_tube_effective: 550,
        standover: 775,
        bb_height: 266,
        seat_tube_ct: 740,
        head_tube: 145,
        stockCockpit: { stem_length: 100, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "ML",
        geometry: {
          stack: 562,
          reach: 393,
          head_angle_deg: 73,
          seat_angle_deg: 73,
          bb_drop: 67,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 991,
        trail: 57.8,
        top_tube_effective: 565,
        standover: 794,
        bb_height: 269,
        seat_tube_ct: 770,
        head_tube: 165,
        stockCockpit: { stem_length: 110, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "L",
        geometry: {
          stack: 581,
          reach: 402,
          head_angle_deg: 73,
          seat_angle_deg: 73,
          bb_drop: 67,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1006,
        trail: 57.8,
        top_tube_effective: 580,
        standover: 821,
        bb_height: 269,
        seat_tube_ct: 800,
        head_tube: 185,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      },
      {
        size: "XL",
        geometry: {
          stack: 596,
          reach: 412,
          head_angle_deg: 73,
          seat_angle_deg: 72.5,
          bb_drop: 67,
          chainstay_length: 405,
          fork_length: 370,
          fork_offset: 45,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1020,
        trail: 57.8,
        top_tube_effective: 600,
        standover: 834,
        bb_height: 269,
        seat_tube_ct: 830,
        head_tube: 200,
        stockCockpit: { stem_length: 120, bar_width: 440, crank_length: 175 }
      }
    ]
  },
  {
    id: "specialized-crux",
    brand: "Specialized",
    model: "S-Works Crux",
    launch_year: 2025,
    category: "Gravel race",
    popularity: "Specialized's lightweight gravel race platform with official geometry table on the product page.",
    sources: [
      "https://www.specialized.com/us/en/s-works-crux/p/199959",
      "https://geometrygeeks.bike/bike/specialized-crux-2025/"
    ],
    sizes: [
      {
        size: "49",
        geometry: {
          stack: 530,
          reach: 375,
          head_angle_deg: 70.5,
          seat_angle_deg: 75.5,
          bb_drop: 74,
          chainstay_length: 425,
          fork_length: 401,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius,
          seat_tube_ct: 466,
          head_tube: 100
        },
        wheelbase: 1008,
        front_center: 594,
        trail: 74,
        top_tube_effective: 512,
        standover: 749,
        bb_height: 284,
        stockCockpit: { stem_length: 70, bar_width: 380, crank_length: 165 }
      },
      {
        size: "52",
        geometry: {
          stack: 547,
          reach: 382,
          head_angle_deg: 71.25,
          seat_angle_deg: 74,
          bb_drop: 74,
          chainstay_length: 425,
          fork_length: 401,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius,
          seat_tube_ct: 496,
          head_tube: 115
        },
        wheelbase: 1014,
        front_center: 600,
        trail: 69,
        top_tube_effective: 539,
        standover: 772,
        bb_height: 284,
        stockCockpit: { stem_length: 80, bar_width: 400, crank_length: 170 }
      },
      {
        size: "54",
        geometry: {
          stack: 560,
          reach: 388,
          head_angle_deg: 71.5,
          seat_angle_deg: 74,
          bb_drop: 72,
          chainstay_length: 425,
          fork_length: 401,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius,
          seat_tube_ct: 521,
          head_tube: 130
        },
        wheelbase: 1023,
        front_center: 608,
        trail: 67,
        top_tube_effective: 549,
        standover: 794,
        bb_height: 286,
        stockCockpit: { stem_length: 90, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "56",
        geometry: {
          stack: 578,
          reach: 397,
          head_angle_deg: 72,
          seat_angle_deg: 73.5,
          bb_drop: 72,
          chainstay_length: 425,
          fork_length: 401,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius,
          seat_tube_ct: 546,
          head_tube: 147
        },
        wheelbase: 1033,
        front_center: 618,
        trail: 64,
        top_tube_effective: 568,
        standover: 816,
        bb_height: 286,
        stockCockpit: { stem_length: 100, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "58",
        geometry: {
          stack: 598,
          reach: 405,
          head_angle_deg: 72.25,
          seat_angle_deg: 73.5,
          bb_drop: 72,
          chainstay_length: 425,
          fork_length: 401,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius,
          seat_tube_ct: 576,
          head_tube: 167
        },
        wheelbase: 1045,
        front_center: 630,
        trail: 62,
        top_tube_effective: 582,
        standover: 841,
        bb_height: 286,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      },
      {
        size: "61",
        geometry: {
          stack: 621,
          reach: 415,
          head_angle_deg: 72.5,
          seat_angle_deg: 73.5,
          bb_drop: 72,
          chainstay_length: 425,
          fork_length: 401,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius,
          seat_tube_ct: 606,
          head_tube: 190
        },
        wheelbase: 1059,
        front_center: 644,
        trail: 60,
        top_tube_effective: 599,
        standover: 866,
        bb_height: 286,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      }
    ]
  },
  {
    id: "specialized-diverge",
    brand: "Specialized",
    model: "Diverge",
    launch_year: 2021,
    category: "Gravel",
    popularity: "Specialized's modern Diverge generation with official geometry published on the product page.",
    sources: [
      "https://www.specialized.com/gb/en/s-works-diverge/p/175282"
    ],
    sizes: [
      {
        size: "49",
        geometry: {
          stack: 571,
          reach: 365,
          head_angle_deg: 70,
          seat_angle_deg: 74,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 389,
          fork_offset: 55,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1019,
        front_center: 607,
        trail: 69,
        top_tube_effective: 529,
        standover: 700,
        bb_height: 270,
        seat_tube_ct: 390,
        head_tube: 99,
        stockCockpit: { stem_length: 80, bar_width: 400, crank_length: 165 }
      },
      {
        size: "52",
        geometry: {
          stack: 577,
          reach: 374,
          head_angle_deg: 70.5,
          seat_angle_deg: 73.75,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 389,
          fork_offset: 55,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1026,
        front_center: 614,
        trail: 66,
        top_tube_effective: 542,
        standover: 725,
        bb_height: 270,
        seat_tube_ct: 430,
        head_tube: 104,
        stockCockpit: { stem_length: 90, bar_width: 400, crank_length: 165 }
      },
      {
        size: "54",
        geometry: {
          stack: 592,
          reach: 383,
          head_angle_deg: 71.25,
          seat_angle_deg: 73.5,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 389,
          fork_offset: 55,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1032,
        front_center: 620,
        trail: 61,
        top_tube_effective: 558,
        standover: 754,
        bb_height: 270,
        seat_tube_ct: 470,
        head_tube: 116,
        stockCockpit: { stem_length: 100, bar_width: 420, crank_length: 170 }
      },
      {
        size: "56",
        geometry: {
          stack: 610,
          reach: 392,
          head_angle_deg: 71.75,
          seat_angle_deg: 73.5,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 389,
          fork_offset: 55,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1042,
        front_center: 630,
        trail: 57,
        top_tube_effective: 573,
        standover: 779,
        bb_height: 270,
        seat_tube_ct: 500,
        head_tube: 133,
        stockCockpit: { stem_length: 100, bar_width: 420, crank_length: 172.5 }
      },
      {
        size: "58",
        geometry: {
          stack: 634,
          reach: 401,
          head_angle_deg: 71.75,
          seat_angle_deg: 73.5,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 389,
          fork_offset: 55,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1059,
        front_center: 647,
        trail: 57,
        top_tube_effective: 589,
        standover: 805,
        bb_height: 270,
        seat_tube_ct: 530,
        head_tube: 159,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 172.5 }
      },
      {
        size: "61",
        geometry: {
          stack: 659,
          reach: 410,
          head_angle_deg: 71.75,
          seat_angle_deg: 73.5,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 389,
          fork_offset: 55,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1076,
        front_center: 664,
        trail: 57,
        top_tube_effective: 605,
        standover: 832,
        bb_height: 270,
        seat_tube_ct: 560,
        head_tube: 185,
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      }
    ]
  },
  {
    id: "cervelo-caledonia",
    brand: "Cervelo",
    model: "Caledonia",
    launch_year: 2020,
    category: "Endurance road",
    popularity: "Cervelo's endurance road platform with official geometry published on the model page.",
    sources: [
      "https://www.cervelo.com/en-US/bikes/caledonia"
    ],
    sizes: [
      {
        size: "48",
        geometry: {
          stack: 505,
          reach: 360,
          head_angle_deg: 70.5,
          seat_angle_deg: 74.5,
          bb_drop: 76.5,
          chainstay_length: 415,
          fork_length: 370,
          fork_offset: 59,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 982.2,
        front_center: 579.4,
        trail: 60,
        top_tube_effective: 502,
        standover: 701,
        bb_height: 263.5,
        head_tube: 89.5,
      },
      {
        size: "51",
        geometry: {
          stack: 530,
          reach: 369,
          head_angle_deg: 71.5,
          seat_angle_deg: 74,
          bb_drop: 76.5,
          chainstay_length: 415,
          fork_length: 370,
          fork_offset: 53,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 984.5,
        front_center: 581.7,
        trail: 60,
        top_tube_effective: 522,
        standover: 741,
        bb_height: 263.5,
        head_tube: 109.9,
      },
      {
        size: "54",
        geometry: {
          stack: 555,
          reach: 378,
          head_angle_deg: 72,
          seat_angle_deg: 73.5,
          bb_drop: 74,
          chainstay_length: 415,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 995.2,
        front_center: 591.5,
        trail: 60,
        top_tube_effective: 543,
        standover: 773,
        bb_height: 266,
        head_tube: 136,
      },
      {
        size: "56",
        geometry: {
          stack: 580,
          reach: 387,
          head_angle_deg: 72,
          seat_angle_deg: 73,
          bb_drop: 74,
          chainstay_length: 415,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1012.3,
        front_center: 608.5,
        trail: 60,
        top_tube_effective: 565,
        standover: 796,
        bb_height: 266,
        head_tube: 162.3,
      },
      {
        size: "58",
        geometry: {
          stack: 605,
          reach: 396,
          head_angle_deg: 72,
          seat_angle_deg: 73,
          bb_drop: 71.5,
          chainstay_length: 415,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1030.7,
        front_center: 626,
        trail: 60,
        top_tube_effective: 581,
        standover: 823,
        bb_height: 268.5,
        head_tube: 191.2,
      },
      {
        size: "61",
        geometry: {
          stack: 630,
          reach: 405,
          head_angle_deg: 72,
          seat_angle_deg: 73,
          bb_drop: 71.5,
          chainstay_length: 415,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1047.8,
        front_center: 643,
        trail: 60,
        top_tube_effective: 598,
        standover: 847,
        bb_height: 268.5,
        head_tube: 217.5,
      }
    ]
  },
  {
    id: "giant-revolt-advanced-pro",
    brand: "Giant",
    model: "Revolt Advanced Pro",
    launch_year: 2022,
    category: "Gravel",
    popularity: "Giant's flagship gravel platform with official sizing and geometry table on the product page.",
    sources: [
      "https://www.giant-bicycles.com/gb/revolt-advanced-pro-1"
    ],
    sizes: [
      {
        size: "S",
        geometry: {
          stack: 570,
          reach: 381,
          head_angle_deg: 71,
          seat_angle_deg: 73.5,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1020,
        trail: 72,
        top_tube_effective: 550,
        standover: 740,
        bb_height: 269,
        seat_tube_ct: 450,
        head_tube: 135,
        stockCockpit: { stem_length: 60, bar_width: 420, crank_length: 170 }
      },
      {
        size: "M",
        geometry: {
          stack: 586,
          reach: 387,
          head_angle_deg: 71.5,
          seat_angle_deg: 73,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1026,
        trail: 68,
        top_tube_effective: 560,
        standover: 757,
        bb_height: 269,
        seat_tube_ct: 470,
        head_tube: 150,
        stockCockpit: { stem_length: 70, bar_width: 440, crank_length: 172.5 }
      },
      {
        size: "ML",
        geometry: {
          stack: 602,
          reach: 391,
          head_angle_deg: 72,
          seat_angle_deg: 73,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1031,
        trail: 65,
        top_tube_effective: 575,
        standover: 774,
        bb_height: 269,
        seat_tube_ct: 490,
        head_tube: 165,
        stockCockpit: { stem_length: 80, bar_width: 440, crank_length: 172.5 }
      },
      {
        size: "L",
        geometry: {
          stack: 616,
          reach: 397,
          head_angle_deg: 72,
          seat_angle_deg: 73,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1041,
        trail: 65,
        top_tube_effective: 585,
        standover: 791,
        bb_height: 269,
        seat_tube_ct: 510,
        head_tube: 180,
        stockCockpit: { stem_length: 80, bar_width: 460, crank_length: 175 }
      },
      {
        size: "XL",
        geometry: {
          stack: 630,
          reach: 407,
          head_angle_deg: 72,
          seat_angle_deg: 73,
          bb_drop: 80,
          chainstay_length: 425,
          fork_length: 370,
          fork_offset: 50,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1056,
        trail: 65,
        top_tube_effective: 600,
        standover: 807,
        bb_height: 269,
        seat_tube_ct: 530,
        head_tube: 195,
        stockCockpit: { stem_length: 90, bar_width: 460, crank_length: 175 }
      }
    ]
  },
  {
    id: "orbea-orca",
    brand: "Orbea",
    model: "Orca",
    launch_year: 2024,
    category: "Race",
    popularity: "Orbea's current Orca generation with official geometry and ergonomics page.",
    sources: [
      "https://www.orbea.com/gb-en/bicycles/orca-m30/geometry/"
    ],
    sizes: [
      {
        size: "47",
        geometry: {
          stack: 506,
          reach: 370,
          head_angle_deg: 71,
          seat_angle_deg: 74.5,
          bb_drop: 72,
          chainstay_length: 408,
          fork_length: 365,
          fork_offset: 48,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 971.8,
        trail: 66,
        top_tube_effective: 510.3,
        standover: 736.5,
        bb_height: 268.5,
        seat_tube_ct: 440,
        head_tube: 110.5,
      },
      {
        size: "49",
        geometry: {
          stack: 515,
          reach: 375,
          head_angle_deg: 71.5,
          seat_angle_deg: 74,
          bb_drop: 72,
          chainstay_length: 408,
          fork_length: 365,
          fork_offset: 48,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 975.4,
        trail: 62.8,
        top_tube_effective: 522.7,
        standover: 748.5,
        bb_height: 268.5,
        seat_tube_ct: 460,
        head_tube: 118.2,
      },
      {
        size: "51",
        geometry: {
          stack: 533,
          reach: 380,
          head_angle_deg: 72.2,
          seat_angle_deg: 73.7,
          bb_drop: 72,
          chainstay_length: 408,
          fork_length: 365,
          fork_offset: 48,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 980,
        trail: 58.4,
        top_tube_effective: 535.9,
        standover: 767.5,
        bb_height: 268.5,
        seat_tube_ct: 480,
        head_tube: 134.6,
      },
      {
        size: "53",
        geometry: {
          stack: 552,
          reach: 385,
          head_angle_deg: 72.8,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 408,
          fork_length: 365,
          fork_offset: 43,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 981.2,
        trail: 59.9,
        top_tube_effective: 548.5,
        standover: 788.5,
        bb_height: 270.5,
        seat_tube_ct: 500,
        head_tube: 152.9,
      },
      {
        size: "55",
        geometry: {
          stack: 572,
          reach: 391,
          head_angle_deg: 73,
          seat_angle_deg: 73.5,
          bb_drop: 70,
          chainstay_length: 408,
          fork_length: 365,
          fork_offset: 43,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 991.4,
        trail: 58.7,
        top_tube_effective: 560.4,
        standover: 808.5,
        bb_height: 270.5,
        seat_tube_ct: 520,
        head_tube: 173.1,
      },
      {
        size: "57",
        geometry: {
          stack: 590,
          reach: 398,
          head_angle_deg: 73.2,
          seat_angle_deg: 73.2,
          bb_drop: 70,
          chainstay_length: 408,
          fork_length: 365,
          fork_offset: 43,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1001.9,
        trail: 57.4,
        top_tube_effective: 576.1,
        standover: 826.5,
        bb_height: 270.5,
        seat_tube_ct: 540,
        head_tube: 191.2,
      },
      {
        size: "60",
        geometry: {
          stack: 616,
          reach: 404,
          head_angle_deg: 73.2,
          seat_angle_deg: 73.2,
          bb_drop: 70,
          chainstay_length: 408,
          fork_length: 365,
          fork_offset: 43,
          wheel_radius: defaultWheelRadius
        },
        wheelbase: 1015.6,
        trail: 57.4,
        top_tube_effective: 590,
        standover: 852.5,
        bb_height: 270.5,
        seat_tube_ct: 570,
        head_tube: 218.3,
      }
    ]
  }

];

validateFrameCatalog(FRAME_CATALOG);

export const getModelById = (modelId: string) =>
  FRAME_CATALOG.find((model) => model.id === modelId) ?? FRAME_CATALOG[0];

export const getSizeData = (modelId: string, size: string) => {
  const model = getModelById(modelId);
  const entry = model.sizes.find((candidate) => candidate.size === size) ?? model.sizes[0];
  const normalized = normalizeSizeData(entry);
  validateSizeData(model, normalized);
  return normalized;
};
