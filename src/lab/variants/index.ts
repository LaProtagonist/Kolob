import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { VariantProps } from "../useNetworkStory";
import list from "../variants.json";

export type VariantInfo = { id: string; title: string; summary: string };
export const variants = list as VariantInfo[];

/** Каждый вариант грузится отдельным файлом и только на своей странице. */
export const variantComponents: Record<string, LazyExoticComponent<ComponentType<VariantProps>>> = {
  map: lazy(() => import("./map/Variant")),
  iso: lazy(() => import("./iso/Variant")),
  toy: lazy(() => import("./toy/Variant")),
  city3d: lazy(() => import("./city3d/Variant")),
};
