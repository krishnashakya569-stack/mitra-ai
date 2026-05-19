const pdfParse = require('pdf-parse');
const path = require('path');
const { buildLiveContext } = require('../utils/liveContext');

const TEXT_MODEL = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const SUPPORTED_TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/vnd.ms-excel',
]);
const SUPPORTED_TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json']);
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function cleanMessages(messages = []) {
  return messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content.length > 0);
}

function decodeAttachment(attachment) {
  if (!attachment) return null;
  if (!attachment.name || !attachment.data) throw new Error('Attachment is missing a file name or data.');

  const buffer = Buffer.from(attachment.data, 'base64');
  if (!buffer.length) throw new Error('Attachment is empty.');
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Attachment is too large. Maximum size is 5 MB.');

  return {
    ...attachment,
    mimeType: attachment.mimeType || 'application/octet-stream',
    extension: path.extname(attachment.name).toLowerCase(),
    buffer,
  };
}

async function attachmentToPrompt(attachment) {
  if (!attachment) return { model: TEXT_MODEL, userContent: null };

  const isImage = SUPPORTED_IMAGE_TYPES.has(attachment.mimeType) || SUPPORTED_IMAGE_EXTENSIONS.has(attachment.extension);
  if (isImage) {
    const mimeType = attachment.mimeType === 'application/octet-stream'
      ? `image/${attachment.extension.replace('.', '').replace('jpg', 'jpeg')}`
      : attachment.mimeType;

    return {
      model: VISION_MODEL,
      userContent: [
        { type: 'text', text: 'Please analyze the attached image and answer the user request.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${attachment.data}` } },
      ],
    };
  }

  const isText = SUPPORTED_TEXT_TYPES.has(attachment.mimeType) || SUPPORTED_TEXT_EXTENSIONS.has(attachment.extension);
  if (isText) {
    return { model: TEXT_MODEL, userContent: `Attached file: ${attachment.name}\n\n${attachment.buffer.toString('utf8')}` };
  }

  if (attachment.mimeType === 'application/pdf' || attachment.extension === '.pdf') {
    const parsed = await pdfParse(attachment.buffer);
    const text = parsed.text?.trim();
    if (!text) throw new Error('The PDF has no extractable text.');
    return { model: TEXT_MODEL, userContent: `Attached PDF: ${attachment.name}\n\n${text}` };
  }

  throw new Error('Unsupported file type. Use PNG, JPG, WEBP, PDF, TXT, MD, CSV, or JSON.');
}

async function callGroq({ model, messages }) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.3, messages }),
  });

  const data = await response.json();
  if (!response.ok) {
    const providerMessage = data?.error?.message || 'Unknown provider error.';
    const error = new Error(providerMessage);
    error.status = response.status;
    throw error;
  }

  return data.choices?.[0]?.message?.content?.trim();
}

const sendMessage = async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is missing on the backend.' });

    const messages = cleanMessages(req.body?.messages);
    if (!messages.length) return res.status(400).json({ error: 'Please send at least one message.' });

    const attachment = decodeAttachment(req.body?.attachment);
    const { model, userContent } = await attachmentToPrompt(attachment);
    const latest = messages[messages.length - 1];
    const liveContext = await buildLiveContext({ text: latest.content, location: req.body?.location });

    const userContentWithContext = [
      latest.content,
      liveContext ? `\n\nUse this live context when relevant. If the context is insufficient, say what is missing.\n\n${liveContext}` : '',
      userContent
        ? Array.isArray(userContent)
          ? ''
          : `\n\n${userContent}`
        : '',
    ].filter(Boolean).join('');

    const finalUserContent = userContent && Array.isArray(userContent)
      ? [{ type: 'text', text: userContentWithContext }, ...userContent]
      : userContentWithContext;

    const groqMessages = [
      {
        role: 'system',
        content: 'You are Mitra AI, a helpful, friendly, and intelligent assistant. Use markdown when helpful. Be accurate, clear, and concise. For current/latest/news/weather/current-affairs/public-office questions, rely on provided live context instead of memory. If live context conflicts with older memory, trust live context and mention the date/source timing when useful.',
      },
      ...messages.slice(0, -1),
      { role: 'user', content: finalUserContent },
    ];

    const reply = await callGroq({ model, messages: groqMessages });
    if (!reply) throw new Error('The AI provider returned an empty response.');

    res.json({ message: reply });
  } catch (error) {
    console.error('Chat error:', error);

    if (error.message?.startsWith('Unsupported file type') || error.message?.includes('too large') || error.message?.includes('missing a file name') || error.message?.includes('empty') || error.message?.includes('no extractable text')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.status === 401 || error.status === 403) return res.status(502).json({ error: 'Groq rejected the API key. Please check GROQ_API_KEY on the backend.' });
    if (error.status === 429) return res.status(429).json({ error: 'Mitra AI is busy right now. Please try again in a moment.' });

    res.status(500).json({ error: 'Mitra AI could not answer right now. Please try again.' });
  }
};

module.exports = { sendMessage };

