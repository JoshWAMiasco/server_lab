import fileSystem from "node:fs";
import { open, type CityResponse, type Reader } from "maxmind";

export interface GeolocationResult {
  countryName: string | null;
  countryCode: string | null;
  cityName: string | null;
  latitude: number | null;
  longitude: number | null;
}

const globalForGeolocation = globalThis as unknown as { geolocationReader?: Promise<Reader<CityResponse> | null> };

/**
 * Opens the DB-IP Lite / GeoLite2 City database from `GEOIP_DB_PATH` once. Returns null when the
 * file is missing, so lookups degrade to "no location" instead of failing.
 */
function loadReader(): Promise<Reader<CityResponse> | null> {
  globalForGeolocation.geolocationReader ??= (async () => {
    const databasePath = process.env.GEOIP_DB_PATH;
    if (!databasePath || !fileSystem.existsSync(databasePath)) return null;
    try {
      return await open<CityResponse>(databasePath);
    } catch {
      return null;
    }
  })();
  return globalForGeolocation.geolocationReader;
}

/**
 * Looks up a public IP offline. Never sends the address anywhere.
 */
export async function lookUpGeolocation(ipAddress: string): Promise<GeolocationResult | null> {
  const reader = await loadReader();
  if (!reader) return null;
  try {
    const response = reader.get(ipAddress);
    if (!response) return null;
    return {
      countryName: response.country?.names?.en ?? null,
      countryCode: response.country?.iso_code ?? null,
      cityName: response.city?.names?.en ?? null,
      latitude: response.location?.latitude ?? null,
      longitude: response.location?.longitude ?? null,
    };
  } catch {
    return null;
  }
}
