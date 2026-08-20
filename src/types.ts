export type RouteId =
  | "home"
  | "concept"
  | "history"
  | "quality"
  | "investment"
  | "materials"
  | "investorQuestions"
  | "privacy"
  | "capexConfigurator"
  | "launchBudget"
  | "revenueModel"
  | "economics"
  | "notFound";

export type PageMeta = {
  id: RouteId;
  path: string;
  label: string;
  title: string;
  description: string;
  ogImage?: string;
  noindex?: boolean;
};

export type ImageSpec =
  | {
      base: string;
      widths: number[];
      sizes: string;
      alt: string;
      src?: never;
    }
  | {
      src: string;
      alt: string;
      base?: never;
      widths?: never;
      sizes?: never;
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
  mediaShape?: "circle" | "full";
  heroClassName?: string;
};

export type VideoItem = {
  title: string;
  meta: string;
  author?: string | null;
  year?: string | null;
  platform?: string | null;
  place?: string | null;
  reach?: string | null;
  viewsLabel?: string | null;
  viewsNote?: string | null;
  originalPublicationUrl?: string | null;
  videoMp4?: string | null;
  videoWebm?: string | null;
  description?: string;
  status?: string | null;
  poster: ImageSpec;
};

export type MomentItem = {
  id: string;
  type: "image" | "video";
  src: string;
  poster: string | null;
  webm?: string | null;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
  year?: string;
  location?: string;
  sourceUrl?: string;
};

export type TimelineCoverVideo = {
  mp4?: string | null;
  webm?: string | null;
  poster: ImageSpec;
};

export type ProductItem = {
  title: string;
  text: string;
  image?: ImageSpec;
  tag?: string;
  category?: string;
};

export type TimelineItem = {
  period: string;
  title: string;
  text: string;
  image: ImageSpec;
  coverVideo?: TimelineCoverVideo;
};

export type DocumentItem = {
  title: string;
  description: string;
  status?: string | null;
  actionLabel?: string | null;
  href?: string | null;
  documentUrl?: string | null;
  featured?: boolean;
  fullCardLink?: boolean;
};
