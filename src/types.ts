export type RouteId =
  | "home"
  | "concept"
  | "history"
  | "quality"
  | "investment"
  | "materials"
  | "investorQuestions"
  | "privacy";

export type PageMeta = {
  id: RouteId;
  path: string;
  label: string;
  title: string;
  description: string;
  ogImage?: string;
};

export type ImageSpec = {
  base: string;
  widths: number[];
  sizes: string;
  alt: string;
};

export type HeroVideo = {
  mp4?: string | null;
  webm?: string | null;
  poster: ImageSpec;
};

export type LinkItem = {
  href: string;
  label: string;
};

export type NavGroup = {
  label: string;
  items: LinkItem[];
};

export type HeroContent = {
  eyebrow?: string;
  title: string;
  lead: string;
  text?: string;
  image: ImageSpec;
  video?: HeroVideo;
};

export type VideoItem = {
  title: string;
  meta: string;
  author?: string | null;
  year?: string | null;
  place?: string | null;
  reach?: string | null;
  originalPublicationUrl?: string | null;
  description?: string;
  status?: string | null;
  poster: ImageSpec;
};

export type ProductItem = {
  title: string;
  text: string;
  image?: ImageSpec;
  tag?: string;
};

export type TimelineItem = {
  period: string;
  title: string;
  text: string;
  image: ImageSpec;
};

export type DocumentItem = {
  title: string;
  description: string;
  status?: string | null;
  actionLabel: string;
  href: string;
  documentUrl?: string | null;
};
