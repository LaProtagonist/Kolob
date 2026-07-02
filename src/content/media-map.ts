import type { HeroVideo, ImageSpec, MomentItem } from "../types";

type VideoSlot = {
  title: string;
  viewsLabel: string | null;
  viewsNote: string | null;
  year: string | null;
  platform: string | null;
  originalUrl: string | null;
  poster: ImageSpec | null;
  videoMp4: string | null;
  videoWebm: string | null;
  description: string | null;
};

export const mediaMap: {
  hero: {
    imageCurrent: ImageSpec;
    videoLoopMp4: string | null;
    videoLoopWebm: string | null;
    poster: ImageSpec;
  };
  homeVideos: {
    video1: VideoSlot;
    video2: VideoSlot;
  };
  homeQualityLoop: HeroVideo;
  aboutCircles: {
    product: ImageSpec | null;
    technology: ImageSpec | null;
    scale: ImageSpec | null;
  };
  aboutProject: {
    authorProduct: {
      image: ImageSpec | null;
      fallback: "product-shape";
    };
    culturalCode: {
      image: ImageSpec | null;
      fallback: "fox-mark";
    };
    provenInterest: {
      image: ImageSpec | null;
      fallback: "play-mark";
    };
  };
  concept: {
    meat: ImageSpec | null;
    sea: ImageSpec | null;
    vegetarian: ImageSpec | null;
    sweet: ImageSpec | null;
  };
  conceptTasteCollage: ImageSpec[];
  conceptFormats: {
    classic: ImageSpec | null;
    ufo: ImageSpec | null;
    dessert: ImageSpec | null;
    drinks: ImageSpec | null;
  };
  quality: {
    product: ImageSpec | null;
    process: ImageSpec | null;
    drinks: ImageSpec | null;
    microgreens: ImageSpec | null;
  };
  qualityPage: {
    hero: ImageSpec | null;
    portion: ImageSpec | null;
    productTaste: ImageSpec | null;
    technology: ImageSpec | null;
    drinksHot: ImageSpec | null;
    drinksCold: ImageSpec | null;
    freshDetails: ImageSpec | null;
    repeatableQuality: ImageSpec | null;
  };
  history: {
    artkovcheg2021: ImageSpec | null;
    sevastopol2022: ImageSpec | null;
    tavrida2022: ImageSpec | null;
    fligel2023: ImageSpec | null;
    solarSysto2024: ImageSpec | null;
  };
  investment: {
    production: ImageSpec | null;
    openKitchen: ImageSpec | null;
    logistics: ImageSpec | null;
  };
  investmentPage: {
    hero: ImageSpec | null;
    whatScales: ImageSpec | null;
    qualityStandard: ImageSpec | null;
    formats: ImageSpec | null;
    whyNow: ImageSpec | null;
    participation: ImageSpec | null;
    dialogue: ImageSpec | null;
  };
  contact: {
    finalImage: ImageSpec | null;
  };
  moments: MomentItem[];
} = {
  hero: {
    imageCurrent: {
      base: "hero-main-loop-poster",
      widths: [720, 1080],
      sizes: "(max-width: 860px) 100vw, 56vw",
      alt: "Колобки с начинкой, зеленью и разрезом на тёмном фоне"
    },
    videoLoopMp4: "/media/hero-main-loop.mp4",
    videoLoopWebm: null,
    poster: {
      base: "hero-main-loop-poster",
      widths: [720, 1080],
      sizes: "(max-width: 860px) 100vw, 56vw",
      alt: "Колобки с начинкой, зеленью и разрезом на тёмном фоне"
    }
  },
  homeVideos: {
    video1: {
      title: "Рекламный ролик проекта №1",
      viewsLabel: "1+ миллионов просмотров",
      viewsNote: "за первые 21 день",
      year: null,
      platform: null,
      originalUrl: null,
      poster: {
        base: "ad-video-01-poster",
        widths: [480, 840],
        sizes: "(max-width: 720px) 84vw, 43vw",
        alt: "Постер рекламного ролика проекта №1"
      },
      videoMp4: "/media/ad-video-01.mp4",
      videoWebm: "/media/ad-video-01.webm",
      description: "Первый сильный рекламный материал, который привёл внимание аудитории к продукту."
    },
    video2: {
      title: "Рекламный ролик проекта №2",
      viewsLabel: "2+ миллионов просмотров",
      viewsNote: "в первые 48 часов",
      year: null,
      platform: null,
      originalUrl: null,
      poster: {
        base: "ad-video-02-poster",
        widths: [480, 840],
        sizes: "(max-width: 720px) 84vw, 38vw",
        alt: "Постер рекламного ролика проекта №2"
      },
      videoMp4: "/media/ad-video-02.mp4",
      videoWebm: "/media/ad-video-02.webm",
      description: "Второй рекламный материал с большим охватом и быстрым первым контактом с аудиторией."
    }
  },
  homeQualityLoop: {
    mp4: "/media/quality-product-loop.mp4",
    webm: "/media/quality-product-loop.webm",
    poster: {
      base: "quality-product-loop-poster",
      widths: [420, 720],
      sizes: "(max-width: 720px) 100vw, 42vw",
      alt: "Процесс приготовления продукта Колобочной"
    }
  },
  aboutCircles: {
    product: {
      base: "product-classic",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Студийное фото колобков на тёмном фоне"
    },
    technology: {
      base: "point-interior",
      widths: [480, 840],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Открытая кухня городской точки"
    },
    scale: {
      base: "cutaway-02",
      widths: [420, 760],
      sizes: "(max-width: 720px) 100vw, 31vw",
      alt: "Разрез колобка с начинкой"
    }
  },
  aboutProject: {
    authorProduct: {
      image: {
        base: "about-author-product-card",
        widths: [720, 1080, 1440],
        sizes: "(max-width: 720px) 100vw, 48vw",
        alt: "Тарелка с продуктом Колобочной для карточки авторского продукта"
      },
      fallback: "product-shape"
    },
    culturalCode: {
      image: null,
      fallback: "fox-mark"
    },
    provenInterest: {
      image: null,
      fallback: "play-mark"
    }
  },
  concept: {
    meat: null,
    sea: null,
    vegetarian: null,
    sweet: null
  },
  conceptTasteCollage: [
    {
      base: "concept-collage-01",
      widths: [420, 720],
      sizes: "(max-width: 720px) 48vw, 18vw",
      alt: "Колобочная: порция для коллажа вкусов"
    },
    {
      base: "concept-collage-02",
      widths: [420, 720],
      sizes: "(max-width: 720px) 48vw, 18vw",
      alt: "Колобочная: порция для коллажа вкусов"
    },
    {
      base: "concept-collage-03",
      widths: [420, 720],
      sizes: "(max-width: 720px) 48vw, 18vw",
      alt: "Колобочная: порция для коллажа вкусов"
    },
    {
      base: "concept-collage-04",
      widths: [420, 720],
      sizes: "(max-width: 720px) 48vw, 18vw",
      alt: "Колобочная: порция для коллажа вкусов"
    },
    {
      base: "concept-collage-05",
      widths: [420, 720],
      sizes: "(max-width: 720px) 48vw, 18vw",
      alt: "Колобочная: порция для коллажа вкусов"
    },
    {
      base: "concept-collage-06",
      widths: [420, 720],
      sizes: "(max-width: 720px) 48vw, 18vw",
      alt: "Колобочная: порция для коллажа вкусов"
    },
    {
      base: "concept-collage-07",
      widths: [420, 720],
      sizes: "(max-width: 720px) 48vw, 18vw",
      alt: "Колобочная: порция для коллажа вкусов"
    },
    {
      base: "concept-collage-08",
      widths: [420, 720],
      sizes: "(max-width: 720px) 48vw, 18vw",
      alt: "Колобочная: порция для коллажа вкусов"
    }
  ],
  conceptFormats: {
    classic: {
      base: "product-classic",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 100vw, 40vw",
      alt: "Классические колобки Колобочной"
    },
    ufo: {
      base: "concept-manches",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 100vw, 40vw",
      alt: "Манчесы Колобочной"
    },
    dessert: {
      base: "product-dessert",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 100vw, 40vw",
      alt: "Десертный формат Колобочной"
    },
    drinks: {
      base: "drink-tea",
      widths: [420, 720, 960],
      sizes: "(max-width: 720px) 100vw, 40vw",
      alt: "Напитки Колобочной"
    }
  },
  quality: {
    product: null,
    process: null,
    drinks: null,
    microgreens: null
  },
  qualityPage: {
    hero: {
      base: "quality-hero-main",
      widths: [768, 1200, 1440],
      sizes: "(max-width: 860px) 100vw, 48vw",
      alt: "Гость с порцией Колобочной в городском ритме"
    },
    portion: {
      base: "quality-portion",
      widths: [420, 720, 960],
      sizes: "(max-width: 860px) 100vw, 42vw",
      alt: "Готовая порция Колобочной с колобками, соусом и свежими дополнениями"
    },
    productTaste: {
      base: "quality-product-taste",
      widths: [420, 590],
      sizes: "(max-width: 860px) 100vw, 42vw",
      alt: "Ингредиенты с ярким собственным вкусом"
    },
    technology: null,
    drinksHot: null,
    drinksCold: null,
    freshDetails: {
      base: "quality-fresh-details",
      widths: [420, 591],
      sizes: "(max-width: 860px) 100vw, 42vw",
      alt: "Микрозелень и свежие травы для порции Колобочной"
    },
    repeatableQuality: null
  },
  history: {
    artkovcheg2021: null,
    sevastopol2022: null,
    tavrida2022: null,
    fligel2023: null,
    solarSysto2024: null
  },
  investment: {
    production: null,
    openKitchen: null,
    logistics: null
  },
  investmentPage: {
    hero: null,
    whatScales: null,
    qualityStandard: null,
    formats: null,
    whyNow: null,
    participation: null,
    dialogue: null
  },
  contact: {
    finalImage: null
  },
  moments: [
    {
      id: "gallery-001",
      type: "image",
      src: "/media/moments-gallery/gallery-001.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 001",
      width: 1080,
      height: 1440,
      caption: "Gallery 001"
    },
    {
      id: "gallery-002",
      type: "image",
      src: "/media/moments-gallery/gallery-002.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 002",
      width: 1080,
      height: 1440,
      caption: "Gallery 002"
    },
    {
      id: "gallery-003",
      type: "image",
      src: "/media/moments-gallery/gallery-003.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 003",
      width: 1080,
      height: 1440,
      caption: "Gallery 003"
    },
    {
      id: "gallery-004",
      type: "image",
      src: "/media/moments-gallery/gallery-004.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 004",
      width: 810,
      height: 1440,
      caption: "Gallery 004"
    },
    {
      id: "gallery-005",
      type: "video",
      src: "/media/moments-gallery/gallery-005.mp4",
      poster: "/media/moments-gallery/gallery-005-poster.webp",
      webm: null,
      alt: "Kolobochnaya gallery video 005",
      width: 714,
      height: 1280,
      caption: "Gallery 005"
    },
    {
      id: "gallery-006",
      type: "image",
      src: "/media/moments-gallery/gallery-006.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 006",
      width: 1024,
      height: 768,
      caption: "Gallery 006"
    },
    {
      id: "gallery-007",
      type: "video",
      src: "/media/moments-gallery/gallery-007.mp4",
      poster: "/media/moments-gallery/gallery-007-poster.webp",
      webm: null,
      alt: "Kolobochnaya gallery video 007",
      width: 960,
      height: 1280,
      caption: "Gallery 007"
    },
    {
      id: "gallery-008",
      type: "video",
      src: "/media/moments-gallery/gallery-008.mp4",
      poster: "/media/moments-gallery/gallery-008-poster.webp",
      webm: null,
      alt: "Kolobochnaya gallery video 008",
      width: 1280,
      height: 714,
      caption: "Gallery 008"
    },
    {
      id: "gallery-009",
      type: "video",
      src: "/media/moments-gallery/gallery-009.mp4",
      poster: "/media/moments-gallery/gallery-009-poster.webp",
      webm: null,
      alt: "Kolobochnaya gallery video 009",
      width: 1280,
      height: 714,
      caption: "Gallery 009"
    },
    {
      id: "gallery-010",
      type: "image",
      src: "/media/moments-gallery/gallery-010.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 010",
      width: 1280,
      height: 960,
      caption: "Gallery 010"
    },
    {
      id: "gallery-011",
      type: "image",
      src: "/media/moments-gallery/gallery-011.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 011",
      width: 1218,
      height: 1440,
      caption: "Gallery 011"
    },
    {
      id: "gallery-012",
      type: "image",
      src: "/media/moments-gallery/gallery-012.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 012",
      width: 1080,
      height: 1440,
      caption: "Gallery 012"
    },
    {
      id: "gallery-013",
      type: "image",
      src: "/media/moments-gallery/gallery-013.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 013",
      width: 1215,
      height: 1440,
      caption: "Gallery 013"
    },
    {
      id: "gallery-014",
      type: "image",
      src: "/media/moments-gallery/gallery-014.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 014",
      width: 1225,
      height: 1280,
      caption: "Gallery 014"
    },
    {
      id: "gallery-015",
      type: "image",
      src: "/media/moments-gallery/gallery-015.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 015",
      width: 1440,
      height: 810,
      caption: "Gallery 015"
    },
    {
      id: "gallery-016",
      type: "image",
      src: "/media/moments-gallery/gallery-016.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 016",
      width: 1080,
      height: 1440,
      caption: "Gallery 016"
    },
    {
      id: "gallery-017",
      type: "video",
      src: "/media/moments-gallery/gallery-017.mp4",
      poster: "/media/moments-gallery/gallery-017-poster.webp",
      webm: null,
      alt: "Kolobochnaya gallery video 017",
      width: 720,
      height: 1280,
      caption: "Gallery 017"
    },
    {
      id: "gallery-018",
      type: "image",
      src: "/media/moments-gallery/gallery-018.webp",
      poster: null,
      alt: "Kolobochnaya gallery photo 018",
      width: 810,
      height: 1440,
      caption: "Gallery 018"
    }
  ]
};

export const heroVideo: HeroVideo = {
  mp4: mediaMap.hero.videoLoopMp4,
  webm: mediaMap.hero.videoLoopWebm,
  poster: mediaMap.hero.poster
};
