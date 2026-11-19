import * as Location from "expo-location";

import { local } from "./storage";

export type Place = {
  latitude: number;
  longitude: number;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
};

const KEY = "cyc.place";

/** Ask for location and look up the country, region and city. Returns null if refused. */
export async function locateMe(): Promise<Place | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  let address: Location.LocationGeocodedAddress | undefined;
  try {
    [address] = await Location.reverseGeocodeAsync(pos.coords);
  } catch {
    // Reverse geocoding isn't available everywhere (e.g. web).
  }
  const place: Place = {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    country: address?.country ?? null,
    countryCode: address?.isoCountryCode ?? null,
    region: address?.region ?? null,
    city: address?.city ?? address?.subregion ?? null,
  };
  await local.setJSON(KEY, place);
  return place;
}

export const savedPlace = () => local.getJSON<Place | null>(KEY, null);
export const forgetPlace = () => local.remove(KEY);

export async function locationPermission(): Promise<boolean> {
  try {
    return (await Location.getForegroundPermissionsAsync()).status === "granted";
  } catch {
    return false;
  }
}

/** Straight-line distance in km. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number | null; longitude: number | null }) {
  if (b.latitude == null || b.longitude == null) return null;
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const kmLabel = (km: number | null) => (km == null ? null : km < 1 ? "Under 1 km away" : `${Math.round(km)} km away`);

/** Countries CYC is likely to be in, for the manual picker. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "BR", name: "Brazil" },
  { code: "PT", name: "Portugal" },
  { code: "FR", name: "France" },
];

export const countryName = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === code)?.name ?? code ?? null;
