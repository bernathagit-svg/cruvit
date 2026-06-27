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

async function geocodeQuery(query) {
  const q = cleanText(query);
  if (!q) return null;
  const url = 'https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({
    name: q,
    count: '6',
    language: 'en',
    format: 'json'
  });
  const data = await fetchJson(url);
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;
  const best = results[0];
  const label = [best.name, best.admin1, best.country].filter(Boolean).join(', ');
  return {
    label,
    lat: best.latitude,
    lon: best.longitude,
    country: best.country || '',
    timezone: best.timezone || '',
    climate: inferClimate(best.latitude, best.longitude, best.country || '')
  };
}

async function reverseGeocode(lat, lon) {
  const url = 'https://nominatim.openstreetmap.org/reverse?' + new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    zoom: '10',
    addressdetails: '1'
  });
  const data = await fetchJson(url, {}, 14000);
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
  const label = [
    addr.city || addr.town || addr.village || addr.suburb || addr.county,
    addr.state || addr.region,
    addr.country
  ].filter(Boolean).join(', ') || data.display_name || `${Number(lat).toFixed(2)}°, ${Number(lon).toFixed(2)}°`;
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
      if (!location) return json(404, { error: 'Location not found. Try a city or region name.' });
      return json(200, { location });
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
