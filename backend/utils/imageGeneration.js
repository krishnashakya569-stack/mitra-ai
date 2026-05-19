function wantsImageGeneration(text = '') {
  const t = text.toLowerCase();

  const imageWords = /(image|picture|photo|wallpaper|poster|logo|artwork|art|illustration|avatar|thumbnail|banner|real image|real photo)/i;
  const actionWords = /(generate|create|make|draw|design|show|give|want|need|real)/i;
  const negativeWords = /(describe|explain|analyze|caption|what is in|ascii|text art)/i;

  if (negativeWords.test(t) && !/(not ascii|real image|actual image|generate)/i.test(t)) return false;
  return imageWords.test(t) && actionWords.test(t);
}

function cleanImagePrompt(text = '') {
  return text
    .replace(/^(please\s+)?(i\s+)?(want|need|would like|show|give|generate|create|make|draw|design)\s+(me\s+)?(a|an|the)?\s*/i, '')
    .replace(/\b(real|actual)\s+/gi, '')
    .replace(/\b(image|picture|photo|wallpaper|poster|artwork|art|illustration|avatar|thumbnail|banner)\s+(of|for)?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildImageMarkdown(text = '') {
  if (!wantsImageGeneration(text)) return null;

  const prompt = cleanImagePrompt(text) || text.trim();
  const enhancedPrompt = `${prompt}, high quality, detailed, visually appealing, professional composition`;
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&model=flux&nologo=true&private=true&seed=${Date.now()}`;

  return [
    `Generating a real image for: **${prompt}**`,
    '',
    `![Generated image](${imageUrl})`,
    '',
    `If the preview takes a few seconds, open it here: [Open full image](${imageUrl})`,
  ].join('\n');
}

module.exports = { wantsImageGeneration, buildImageMarkdown };
