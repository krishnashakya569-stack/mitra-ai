const STATE_ALIASES = {
  'andhra pradesh': 'Andhra Pradesh', 'arunachal pradesh': 'Arunachal Pradesh', assam: 'Assam', bihar: 'Bihar', chhattisgarh: 'Chhattisgarh', delhi: 'Delhi', goa: 'Goa', gujarat: 'Gujarat', haryana: 'Haryana', 'himachal pradesh': 'Himachal Pradesh', jharkhand: 'Jharkhand', karnataka: 'Karnataka', kerala: 'Kerala', 'madhya pradesh': 'Madhya Pradesh', maharashtra: 'Maharashtra', manipur: 'Manipur', meghalaya: 'Meghalaya', mizoram: 'Mizoram', nagaland: 'Nagaland', odisha: 'Odisha', orissa: 'Odisha', puducherry: 'Puducherry', punjab: 'Punjab', rajasthan: 'Rajasthan', sikkim: 'Sikkim', 'tamil nadu': 'Tamil Nadu', 'tamil naidu': 'Tamil Nadu', telangana: 'Telangana', tripura: 'Tripura', 'uttar pradesh': 'Uttar Pradesh', uttarakhand: 'Uttarakhand', 'west bengal': 'West Bengal',
};

function wantsChiefMinister(text = '') {
  return /\b(chief minister|\bcm\b)\b/i.test(text);
}

function mentionedStates(text = '') {
  const lower = text.toLowerCase();
  return Object.entries(STATE_ALIASES)
    .filter(([alias]) => lower.includes(alias))
    .map(([, canonical]) => canonical)
    .filter((state, index, arr) => arr.indexOf(state) === index);
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
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchGoogleNewsItems(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Google News failed: ${response.status}`);
    const xml = await response.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((match) => {
      const item = match[1];
      return {
        title: decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''),
        source: decodeXml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || ''),
        published: decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || ''),
        link: decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || ''),
      };
    }).filter(item => item.title);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCandidate(value = '') {
  return value
    .replace(/^(breaking|watch|video|explained|live)[:\s-]+/i, '')
    .replace(/\b(BJP|TMC|DMK|AIADMK|TVK|Congress|AAP|NDA|INDIA bloc|leader|chief|veteran|actor-politician|politician)\b/gi, '')
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCandidateFromHeadline(title = '', state = '') {
  const clean = title.replace(/\s+-\s+[^-]+$/, '').trim();
  const patterns = [
    /^(.+?)\s+(?:sworn in|takes oath|took oath)\s+as\s+(?:.*?\s+)?(?:chief minister|cm)\b/i,
    /^(.+?)\s+(?:named|elected|chosen|picked|appointed)\s+(?:as\s+)?(?:.*?\s+)?(?:chief minister|cm)\b/i,
    /^(.+?)\s+to\s+be\s+(?:.*?\s+)?(?:chief minister|cm)\b/i,
    new RegExp(`^(.+?)\\s+(?:is|becomes|become)\\s+${state.replace(/ /g, '\\s+')}.*?(?:chief minister|cm)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeCandidate(match[1]);
      if (candidate && candidate.length <= 45 && !/who|what|when|where/i.test(candidate)) return candidate;
    }
  }

  const afterState = clean.match(new RegExp(`${state.replace(/ /g, '\\s+')}.*?(?:chief minister|cm)[:\\s-]+([A-Z][A-Za-z .'-]+)`, 'i'));
  if (afterState?.[1]) return normalizeCandidate(afterState[1]);

  return '';
}

function pickCandidate(items, state) {
  const scored = new Map();
  for (const item of items) {
    const candidate = extractCandidateFromHeadline(item.title, state);
    if (!candidate) continue;
    const score = /sworn in|takes oath|took oath/i.test(item.title) ? 4 : /named|elected|chosen|picked/i.test(item.title) ? 3 : 1;
    scored.set(candidate, (scored.get(candidate) || 0) + score);
  }

  return [...scored.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

async function getChiefMinisterContext(text = '') {
  if (!wantsChiefMinister(text)) return '';

  const states = mentionedStates(text);
  if (!states.length) return 'Chief Minister question detected, but no Indian state was clearly identified.';

  const blocks = [];
  for (const state of states) {
    const query = `${state} current chief minister sworn in named latest`;
    try {
      const items = await fetchGoogleNewsItems(query);
      const candidate = pickCandidate(items, state);
      blocks.push([
        `State: ${state}`,
        candidate ? `PRIORITY CURRENT ANSWER from latest news headlines: ${candidate}` : 'No single current CM name could be confidently extracted from latest headlines.',
        `Fresh headline query: ${query}`,
        `Recent sources checked:`,
        ...items.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}${item.source ? ` — ${item.source}` : ''}${item.published ? ` (${item.published})` : ''}${item.link ? `\n   ${item.link}` : ''}`),
      ].filter(Boolean).join('\n'));
    } catch (error) {
      blocks.push(`State: ${state}\nCurrent CM news lookup failed: ${error.message}`);
    }
  }

  return `Live Chief Minister lookup fetched at ${new Date().toISOString()}\n\n${blocks.join('\n\n')}`;
}

module.exports = { getChiefMinisterContext };
