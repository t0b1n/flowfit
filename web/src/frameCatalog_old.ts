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
};

export type SizeData = {
  size: string;
  geometry: FrameGeometry;
  wheelbase?: number;
  front_center?: number;
  trail?: number;
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
  category: string;
  popularity: string;
  sources: string[];
  sizes: SizeData[];
};

const defaultWheelRadius = 340;

export const FRAME_CATALOG: FrameModel[] = [
  {
    id: "specialized-tarmac-sl8",
    brand: "Specialized",
    model: "S-Works Tarmac SL8",
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
        stockCockpit: { stem_length: 110, bar_width: 440, crank_length: 175 }
      }
    ]
  },
  {
    id: "canyon-aeroad-cfr",
    brand: "Canyon",
    model: "Aeroad CFR",
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
        stockCockpit: { stem_length: 120, bar_width: 410, crank_length: 175, spacer_stack: 20 }
      }
    ]
  },
  {
    id: "trek-madone-gen8",
    brand: "Trek",
    model: "Madone Gen 8",
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
        trail: 61
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
        trail: 62
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
        trail: 58
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
        trail: 59
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
        trail: 57
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
        trail: 57
      }
    ]
  },
  {
    id: "cervelo-s5",
    brand: "Cervelo",
    model: "S5",
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
        trail: 55.6
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
        trail: 55.6
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
        trail: 55.6
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
        trail: 55.6
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
        trail: 55.6
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
        trail: 55.6
      }
    ]
  },
  {
    id: "colnago-y1rs",
    brand: "Colnago",
    model: "Y1Rs",
    category: "Aero race",
    popularity: "The headline 2025 UAE Team Emirates-XRG race bike used in the Tour de France.",
    sources: [
      "https://www.manualslib.com/manual/4042881/Colnago-Y1rs.html",
      "https://www.bikeradar.com/reviews/bikes/road-bikes/colnago-y1rs-review",
      "https://www.cyclingnews.com/features/tour-de-france-bikes/"
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
        trail: 61
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
        trail: 59.5
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
        trail: 57.5
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
        trail: 57
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
        trail: 57
      }
    ]
  },
  {
    id: "giant-propel-advanced-sl",
    brand: "Giant",
    model: "Propel Advanced SL",
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
        stockCockpit: { stem_length: 120, bar_width: 440, crank_length: 175 }
      }
    ]
  }
];

export const getModelById = (modelId: string) =>
  FRAME_CATALOG.find((model) => model.id === modelId) ?? FRAME_CATALOG[0];

export const getSizeData = (modelId: string, size: string) => {
  const model = getModelById(modelId);
  return model.sizes.find((entry) => entry.size === size) ?? model.sizes[0];
};
