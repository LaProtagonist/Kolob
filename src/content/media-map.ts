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
  aboutCircles: {
    product: ImageSpec | null;
    technology: ImageSpec | null;
    scale: ImageSpec | null;
  };
  concept: {
    meat: ImageSpec | null;
    sea: ImageSpec | null;
    vegetarian: ImageSpec | null;
    sweet: ImageSpec | null;
  };
  quality: {
    product: ImageSpec | null;
    process: ImageSpec | null;
    drinks: ImageSpec | null;
    microgreens: ImageSpec | null;
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
  contact: {
    finalImage: ImageSpec | null;
  };
  moments: MomentItem[];
} = {
  hero: {
    imageCurrent: {
      base: "hero-kolobok",
      widths: [768, 1200, 1440],
      sizes: "(max-width: 860px) 100vw, 56vw",
      alt: "Колобки с начинкой, зеленью и разрезом на тёмном фоне"
    },
    videoLoopMp4: null,
    videoLoopWebm: null,
    poster: {
      base: "hero-kolobok",
      widths: [768, 1200, 1440],
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
  concept: {
    meat: null,
    sea: null,
    vegetarian: null,
    sweet: null
  },
  quality: {
    product: null,
    process: null,
    drinks: null,
    microgreens: null
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
  contact: {
    finalImage: null
  },
  moments: [
    {
      id: "moment-001",
      type: "image",
      src: "/media/hero-kolobok-768.webp",
      poster: null,
      alt: "Колобочная: продуктовый кадр с колобками",
      width: 768,
      height: 768,
      caption: "Продукт"
    },
    {
      id: "moment-002",
      type: "image",
      src: "/media/product-classic-720.webp",
      poster: null,
      alt: "Колобочная: студийный кадр продукта",
      width: 720,
      height: 610,
      caption: "Продукт"
    },
    {
      id: "moment-003",
      type: "image",
      src: "/media/cutaway-01-760.webp",
      poster: null,
      alt: "Колобочная: разрез продукта",
      width: 760,
      height: 563,
      caption: "Разрез"
    },
    {
      id: "moment-004",
      type: "video",
      src: "/media/history-crimea-2021-cover.mp4",
      poster: "/media/history-crimea-2021-cover-poster-840.webp",
      webm: "/media/history-crimea-2021-cover.webm",
      alt: "Колобочная: видео проекта в Крыму",
      width: 640,
      height: 512,
      year: "2021",
      location: "Крым"
    },
    {
      id: "moment-005",
      type: "image",
      src: "/media/point-facade-840.webp",
      poster: null,
      alt: "Колобочная: фасад городской точки",
      width: 840,
      height: 672,
      caption: "Точка"
    },
    {
      id: "moment-006",
      type: "image",
      src: "/media/point-interior-840.webp",
      poster: null,
      alt: "Колобочная: интерьер точки и открытая кухня",
      width: 840,
      height: 672,
      caption: "Открытая кухня"
    },
    {
      id: "moment-007",
      type: "video",
      src: "/media/history-fligel-2023-cover.mp4",
      poster: "/media/history-fligel-2023-cover-poster-840.webp",
      webm: "/media/history-fligel-2023-cover.webm",
      alt: "Колобочная: видео стационарной точки во Флигеле",
      width: 640,
      height: 512,
      year: "2023",
      location: "Санкт-Петербург"
    },
    {
      id: "moment-008",
      type: "image",
      src: "/media/festival-window-840.webp",
      poster: null,
      alt: "Колобочная: фестивальная витрина",
      width: 840,
      height: 672,
      caption: "Фестиваль"
    },
    {
      id: "moment-009",
      type: "image",
      src: "/media/point-guests-840.webp",
      poster: null,
      alt: "Колобочная: гости у точки",
      width: 840,
      height: 672,
      caption: "Гости"
    },
    {
      id: "moment-010",
      type: "video",
      src: "/media/history-solar-2024-cover.mp4",
      poster: "/media/history-solar-2024-cover-poster-840.webp",
      webm: "/media/history-solar-2024-cover.webm",
      alt: "Колобочная: видео на Solar Systo Togathering",
      width: 640,
      height: 512,
      year: "2024",
      location: "Solar Systo Togathering"
    },
    {
      id: "moment-011",
      type: "image",
      src: "/media/festival-truck-840.webp",
      poster: null,
      alt: "Колобочная: фестивальная точка",
      width: 840,
      height: 672,
      caption: "Фестиваль"
    },
    {
      id: "moment-012",
      type: "image",
      src: "/media/festival-sea-840.webp",
      poster: null,
      alt: "Колобочная: фестивальный кадр проекта",
      width: 840,
      height: 672,
      caption: "Фестиваль"
    },
    {
      id: "moment-013",
      type: "image",
      src: "/media/drink-tea-720.webp",
      poster: null,
      alt: "Колобочная: напиточная линия",
      width: 720,
      height: 610,
      caption: "Напитки"
    },
    {
      id: "moment-014",
      type: "video",
      src: "/media/ad-video-01.mp4",
      poster: "/media/ad-video-01-poster-840.webp",
      webm: "/media/ad-video-01.webm",
      alt: "Колобочная: рекламный ролик проекта",
      width: 640,
      height: 512
    },
    {
      id: "moment-015",
      type: "video",
      src: "/media/ad-video-02.mp4",
      poster: "/media/ad-video-02-poster-840.webp",
      webm: "/media/ad-video-02.webm",
      alt: "Колобочная: рекламный ролик проекта с охватом",
      width: 640,
      height: 512
    }
  ]
};

export const heroVideo: HeroVideo = {
  mp4: mediaMap.hero.videoLoopMp4,
  webm: mediaMap.hero.videoLoopWebm,
  poster: mediaMap.hero.poster
};
