import type { BrandMarkId } from "@/lib/photo-frame-math";

/**
 * Android resource names are derived from the static Logo PNG asset names.
 * Keep this mapping independent from React Native `require` calls so it can be
 * regression-tested without an image loader.
 */
export const BRAND_LOGO_RESOURCE_NAMES: Record<BrandMarkId, string> = {
  Sony: "rawview_logo_sony",
  Canon: "rawview_logo_canon",
  Nikon: "rawview_logo_nikon",
  Fujifilm: "rawview_logo_fujifilm",
  Leica: "rawview_logo_leica",
  Hasselblad: "rawview_logo_hasselblad",
  Panasonic: "rawview_logo_panasonic",
  Apple: "rawview_logo_apple",
  Samsung: "rawview_logo_samsung",
  Google: "rawview_logo_google",
  Huawei: "rawview_logo_huawei",
  Xiaomi: "rawview_logo_xiaomi",
  OPPO: "rawview_logo_oppo",
  vivo: "rawview_logo_vivo",
};

export function getBrandLogoResourceName(brand: BrandMarkId): string {
  return BRAND_LOGO_RESOURCE_NAMES[brand];
}
