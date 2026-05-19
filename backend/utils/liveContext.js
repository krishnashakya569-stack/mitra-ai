const WEATHER_CODE = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

function wantsLiveContext(text = '') {
  return /\b(news|current affairs|latest|today|weather|temperature|rain|forecast|location|where am i|time|date)\b/i.test(text);
}

function wantsWeather(text = '') {
  return /\b(weather|temperature|rain|forecast|climate)\b/i.test(text);
}

function wantsNews(text = '') {
  return /\b(news|current affairs|latest headlines|today's headlines|headlines|breaking)\b/i.test(text);
}

function wantsTime(text = '') {
  return /\b(time|date|today|now)\b/i.test(text);
}

function wantsLocation(text = '') {
  return /\b(location|where am i|near me|nearby)\b/i.test(text);
}

function extractPlace(text = '') {
  const patterns = [
    /(?:weather|temperature|rain|forecast)\s+(?:in|at|for)\s+([a-zA-Z\s,.-]{2,50})/i,
    /(?:news|current affairs|headlines)\s+(?:in|for|about)\s+([a-zA-Z\s,.-]{2,50})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/[?.!]+$/, '').trim();
  }
  return '';
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 7000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocodePlace(place) {
  if (!place) return null;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`;
  const data = await fetchJson(url);
  const result = data?.results?.[0];
  if (!result) return null;

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    label: [result.name, result.admin1, result.country].filter(Boolean).join(', '),
    timezone: result.timezone,
  };
}

async function reverseGeocode(location) {
  if (!location?.latitude || !location?.longitude) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(location.latitude)}&lon=${encodeURIComponent(location.longitude)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MitraAI/1.0 location helper' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.display_name || null;
  } catch {
    return null;
  }
}

async function getWeather({ text, location }) {
  let target = null;
  const place = extractPlace(text);

  if (place) target = await geocodePlace(place);
  if (!target && location?.latitude && location?.longitude) {
    target = {
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.label || 'user provided location',
      timezone: 'auto',
    };
  }
  if (!target) return 'Weather requested, but no location was available. Ask the user to allow location or specify a city.';

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', target.latitude);
  url.searchParams.set('longitude', target.longitude);
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('timezone', target.timezone || 'auto');

  const data = await fetchJson(url.toString());
  const current = data.current || {};
  const daily = data.daily || {};

  return [
    `Weather for ${target.label} (${Number(target.latitude).toFixed(3)}, ${Number(target.longitude).toFixed(3)})`,
    `Current: ${current.temperature_2m}°C, feels like ${current.apparent_temperature}°C, ${WEATHER_CODE[current.weather_code] || 'weather code ' + current.weather_code}.`,
    `Humidity: ${current.relative_humidity_2m}%, wind: ${current.wind_speed_10m} km/h, cloud cover: ${current.cloud_cover}%, precipitation: ${current.precipitation} mm.`,
    daily.time?.[0] ? `Today forecast: high ${daily.temperature_2m_max?.[0]}°C, low ${daily.temperature_2m_min?.[0]}°C, rain probability ${daily.precipitation_probability_max?.[0]}%.` : '',
  ].filter(Boolean).join('\n');
}

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, '')
    .trim();
}

async function getNews(text = '') {
  const place = extractPlace(text);
  const query = place || (/\b(current affairs)\b/i.test(text) ? 'current affairs India' : 'top news India');
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`News request failed: ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6).map((match) => {
      const item = match[1];
      return {
        title: decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''),
        source: decodeXml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || ''),
        published: decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || ''),
        link: decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || ''),
      };
    }).filter(item => item.title);

    if (!items.length) return 'News requested, but no headlines were returned.';

    return `Latest news/current affairs for query "${query}":\n` + items
      .map((item, index) => `${index + 1}. ${item.title}${item.source ? ` — ${item.source}` : ''}${item.published ? ` (${item.published})` : ''}${item.link ? `\n   ${item.link}` : ''}`)
      .join('\n');
  } finally {
    clearTimeout(timer);
  }
}

async function buildLiveContext({ text, location }) {
  if (!wantsLiveContext(text)) return '';

  const parts = [];
  if (wantsTime(text)) {
    parts.push(`Current server date/time: ${new Date().toISOString()}. User timezone if known: ${location?.timezone || 'unknown'}.`);
  }

  if (wantsLocation(text) && location?.latitude && location?.longitude) {
    const label = await reverseGeocode(location);
    parts.push(`User location from browser permission: latitude ${location.latitude}, longitude ${location.longitude}${label ? `; approximate address: ${label}` : ''}.`);
  }

  if (wantsWeather(text)) {
    try { parts.push(await getWeather({ text, location })); }
    catch (error) { parts.push(`Weather lookup failed: ${error.message}`); }
  }

  if (wantsNews(text)) {
    try { parts.push(await getNews(text)); }
    catch (error) { parts.push(`News lookup failed: ${error.message}`); }
  }

  return parts.length
    ? `Live context fetched at ${new Date().toISOString()}\n\n${parts.join('\n\n')}`
    : '';
}

module.exports = { buildLiveContext };

