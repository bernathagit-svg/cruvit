const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' };

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function cleanText(value) {
  return String(value ?? '').trim();
}

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CruvitGardenWeather/1.0',
        ...(options.headers || {})
      }
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

function inferClimate(lat, lon, country = '') {
  const absLat = Math.abs(Number(lat) || 0);
  const c = cleanText(country).toLowerCase();
  if (absLat <= 23) return 'Tropical';
  if (absLat <= 35 && (c.includes('israel') || (lon >= 34 && lon <= 36 && lat >= 29 && lat <= 34))) return 'Mediterranean';
  if (absLat <= 35) return 'Subtropical';
  if (absLat <= 50) return 'Temperate';
  return 'Cool temperate';
}

function wmoSummary(code) {
  const n = Number(code);
  if (n === 0) return 'Clear sky';
  if (n <= 3) return 'Partly cloudy';
  if (n <= 48) return 'Foggy';
  if (n <= 67) return 'Rainy';
  if (n <= 77) return 'Snow';
  if (n <= 82) return 'Showers';
  if (n <= 86) return 'Snow showers';
  if (n >= 95) return 'Thunderstorms';
  return 'Mixed conditions';
}

function wmoCondition(code, tempC, maxC, minC) {
  if (Number(maxC) >= 34 || Number(tempC) >= 32) return 'hot';
  if (Number(minC) <= 5 || Number(tempC) <= 8) return 'cold';
  const n = Number(code);
  if (n >= 51 && n <= 82) return 'rain';
  if (n >= 95) return 'storm';
  return 'fair';
}

function buildAlerts(daily) {
  const alerts = [];
  const maxes = daily?.temperature_2m_max || [];
  const mins = daily?.temperature_2m_min || [];
  const precip = daily?.precipitation_sum || [];
  const nextMax = maxes.slice(0, 4);
  const nextMin = mins.slice(0, 4);
  const nextPrecip = precip.slice(0, 3);

  if (nextMax.some(v => Number(v) >= 34)) alerts.push('heat-wave');
  if (nextMin.some(v => Number(v) <= 3)) alerts.push('cold-snap');
  if (nextMin.some(v => Number(v) <= 0)) alerts.push('frost');
  if (nextPrecip.some(v => Number(v) >= 15)) alerts.push('heavy-rain');
  if (nextMax.some(v => Number(v) >= 32) && nextPrecip.every(v => Number(v) < 1)) alerts.push('dry-heat');

  return [...new Set(alerts)];
}

function buildForecastHint(daily, alerts) {
  const maxes = (daily?.temperature_2m_max || []).slice(0, 3);
  const mins = (daily?.temperature_2m_min || []).slice(0, 3);
  if (!maxes.length) return '';
  const peak = Math.max(...maxes.map(Number));
  const low = Math.min(...mins.map(Number));
  if (alerts.includes('heat-wave')) return `Heat up to ${Math.round(peak)}°C expected in the next few days`;
  if (alerts.includes('frost') || alerts.includes('cold-snap')) return `Cold nights down to ${Math.round(low)}°C expected`;
  if (alerts.includes('heavy-rain')) return 'Heavy rain expected — check drainage';
  return `Up to ${Math.round(peak)}°C this week`;
}

function hasHebrew(text) {
  return /[\u0590-\u05FF]/.test(String(text || ''));
}

function locationLabelFromParts(name, admin1, country) {
  return [name, admin1, country].filter(Boolean).join(', ');
}

function pickBestGeocodeResult(results, query) {
  if (!Array.isArray(results) || !results.length) return null;
  const q = cleanText(query).toLowerCase();
  const qHe = cleanText(query);
  const exact = results.find(r => {
    const name = cleanText(r.name || (r.label || '').split(',')[0] || '');
    return name.toLowerCase() === q || name === qHe;
  });
  return exact || results[0];
}

function mapOpenMeteoResult(best, query) {
  if (!best) return null;
  const country = best.country || '';
  const label = locationLabelFromParts(best.name, best.admin1, country);
  return {
    label,
    lat: Number(best.latitude),
    lon: Number(best.longitude),
    country,
    timezone: best.timezone || '',
    climate: inferClimate(best.latitude, best.longitude, country)
  };
}

async function geocodeWithOpenMeteo(query, language = 'en') {
  const q = cleanText(query);
  if (!q) return null;
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?' +
    new URLSearchParams({
      name: q,
      count: '8',
      language,
      format: 'json'
    });
  const data = await fetchJson(url);
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;
  return mapOpenMeteoResult(pickBestGeocodeResult(results, q), q);
}

async function geocodeWithNominatim(query) {
  const q = cleanText(query);
  if (!q) return null;
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q,
      format: 'json',
      limit: '6',
      addressdetails: '1'
    });
  const data = await fetchJson(
    url,
    {
      headers: {
        Referer: 'https://cruvit.netlify.app/',
        'Accept-Language': hasHebrew(q) ? 'he,en' : 'en,he'
      }
    },
    14000
  );
  if (!Array.isArray(data) || !data.length) return null;

  const mapped = data.map(item => {
    const addr = item.address || {};
    const name =
      item.name ||
      addr.village ||
      addr.town ||
      addr.city ||
      addr.suburb ||
      addr.hamlet ||
      q;
    const label =
      [name, addr.state_district || addr.state || addr.region, addr.country]
        .filter(Boolean)
        .join(', ') || cleanText(item.display_name);
    return {
      label,
      lat: Number(item.lat),
      lon: Number(item.lon),
      country: addr.country || '',
      timezone: '',
      climate: inferClimate(item.lat, item.lon, addr.country || '')
    };
  });

  return pickBestGeocodeResult(mapped, q);
}

async function searchLocationSuggestions(query) {
  const q = cleanText(query);
  if (!q || q.length < 2) return [];

  const seen = new Set();
  const out = [];

  const add = loc => {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return;
    const key = `${loc.label.toLowerCase()}|${loc.lat.toFixed(3)}|${loc.lon.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(loc);
  };

  const langs = hasHebrew(q) ? ['he', 'en'] : ['en', 'he'];
  for (const lang of langs) {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?' +
      new URLSearchParams({ name: q, count: '6', language: lang, format: 'json' });
    const data = await fetchJson(url);
    for (const item of Array.isArray(data?.results) ? data.results : []) {
      add(mapOpenMeteoResult(item, q));
    }
  }

  const nominatim = await geocodeWithNominatim(q);
  if (nominatim) add(nominatim);

  const nominatimListUrl =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({ q, format: 'json', limit: '5', addressdetails: '1' });
  const nominatimList = await fetchJson(
    nominatimListUrl,
    {
      headers: {
        Referer: 'https://cruvit.netlify.app/',
        'Accept-Language': hasHebrew(q) ? 'he,en' : 'en,he'
      }
    },
    14000
  );
  if (Array.isArray(nominatimList)) {
    for (const item of nominatimList) {
      const addr = item.address || {};
      const name =
        item.name || addr.village || addr.town || addr.city || addr.suburb || addr.hamlet || q;
      add({
        label:
          [name, addr.state_district || addr.state || addr.region, addr.country]
            .filter(Boolean)
            .join(', ') || cleanText(item.display_name),
        lat: Number(item.lat),
        lon: Number(item.lon),
        country: addr.country || '',
        timezone: '',
        climate: inferClimate(item.lat, item.lon, addr.country || '')
      });
    }
  }

  return out.slice(0, 6);
}

async function geocodeQuery(query) {
  const q = cleanText(query);
  if (!q) return null;

  const langs = hasHebrew(q) ? ['he', 'en'] : ['en', 'he'];
  for (const lang of langs) {
    const found = await geocodeWithOpenMeteo(q, lang);
    if (found) return found;
  }

  return await geocodeWithNominatim(q);
}

async function reverseGeocode(lat, lon) {
  const url =
    'https://nominatim.openstreetmap.org/reverse?' +
    new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'json',
      zoom: '12',
      addressdetails: '1'
    });
  const data = await fetchJson(
    url,
    {
      headers: {
        Referer: 'https://cruvit.netlify.app/',
        'Accept-Language': 'he,en'
      }
    },
    14000
  );
  if (!data) {
    return {
      label: `${Number(lat).toFixed(2)}°, ${Number(lon).toFixed(2)}°`,
      lat: Number(lat),
      lon: Number(lon),
      country: '',
      climate: inferClimate(lat, lon)
    };
  }
  const addr = data.address || {};
  const placeName =
    addr.village ||
    addr.town ||
    addr.city ||
    addr.suburb ||
    addr.hamlet ||
    addr.locality ||
    data.name ||
    '';
  const label =
    [placeName, addr.state_district || addr.state || addr.region, addr.country]
      .filter(Boolean)
      .join(', ') ||
    data.display_name ||
    `${Number(lat).toFixed(2)}°, ${Number(lon).toFixed(2)}°`;
  return {
    label,
    lat: Number(lat),
    lon: Number(lon),
    country: addr.country || '',
    timezone: '',
    climate: inferClimate(lat, lon, addr.country || '')
  };
}

async function fetchForecast(lat, lon, label = '') {
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
    forecast_days: '7',
    timezone: 'auto'
  });
  const data = await fetchJson(url, {}, 14000);
  if (!data?.current) return null;

  const daily = data.daily || {};
  const alerts = buildAlerts(daily);
  const maxC = Number(daily.temperature_2m_max?.[0] ?? data.current.temperature_2m);
  const minC = Number(daily.temperature_2m_min?.[0] ?? data.current.temperature_2m);
  const tempC = Number(data.current.temperature_2m);
  const code = Number(data.current.weather_code);
  const forecastDays = (daily.time || []).slice(0, 7).map((date, i) => ({
    date,
    maxC: Number(daily.temperature_2m_max?.[i]),
    minC: Number(daily.temperature_2m_min?.[i]),
    precipMm: Number(daily.precipitation_sum?.[i] || 0),
    code: Number(daily.weather_code?.[i])
  }));

  return {
    tempC,
    maxC,
    minC,
    forecastPeak: Math.max(...(daily.temperature_2m_max || [maxC]).slice(0, 4).map(Number)),
    forecastLow: Math.min(...(daily.temperature_2m_min || [minC]).slice(0, 4).map(Number)),
    humidity: Number(data.current.relative_humidity_2m),
    windKmh: Number(data.current.wind_speed_10m),
    summary: wmoSummary(code),
    condition: wmoCondition(code, tempC, maxC, minC),
    alerts,
    forecastHint: buildForecastHint(daily, alerts),
    forecastDays,
    locationLabel: label,
    fetchedAt: new Date().toISOString()
  };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Use POST' });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const mode = cleanText(body.mode || 'forecast').toLowerCase();
  const query = cleanText(body.query || body.label || body.location);
  let lat = Number(body.lat);
  let lon = Number(body.lon);
  let location = null;

  try {
    if (mode === 'reverse') {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(400, { error: 'Missing coordinates' });
      location = await reverseGeocode(lat, lon);
      return json(200, { location });
    }

    if (mode === 'geocode') {
      if (!query && !Number.isFinite(lat)) return json(400, { error: 'Missing location query' });
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        location = await reverseGeocode(lat, lon);
      } else {
        location = await geocodeQuery(query);
      }
      if (!location) return json(404, { error: 'Location not found. Try a city, village or region name in Hebrew or English.' });
      return json(200, { location });
    }

    if (mode === 'search') {
      if (!query) return json(400, { error: 'Missing location query' });
      const suggestions = await searchLocationSuggestions(query);
      if (!suggestions.length) {
        return json(404, { error: 'No matching places found. Try a nearby city or region.' });
      }
      return json(200, { suggestions });
    }

    // forecast (default)
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      location = {
        label: cleanText(body.label) || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
        lat,
        lon,
        country: cleanText(body.country),
        climate: cleanText(body.climate) || inferClimate(lat, lon, body.country)
      };
    } else if (query) {
      location = await geocodeQuery(query);
      if (!location) return json(404, { error: 'Location not found. Try a city or region name.' });
      lat = location.lat;
      lon = location.lon;
    } else {
      return json(400, { error: 'Provide a location name or coordinates' });
    }

    const weather = await fetchForecast(lat, lon, location.label);
    if (!weather) return json(502, { error: 'Weather forecast unavailable right now' });

    if (!location.climate) location.climate = inferClimate(lat, lon, location.country);

    return json(200, { location, weather });
  } catch (error) {
    return json(500, { error: error?.message || 'Weather service failed' });
  }
}

export const config = { path: '/.netlify/functions/garden-weather' };
