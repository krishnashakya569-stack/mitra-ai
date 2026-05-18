const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function transcribeAudio(req, res) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY is missing on the backend.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file received.' });
    }

    const formData = new FormData();
    formData.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'speech.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data?.error?.message || 'Audio transcription failed.');
      error.status = response.status;
      throw error;
    }

    res.json({ text: data.text?.trim() || '' });
  } catch (error) {
    console.error('Transcription error:', error);

    if (error.status === 401 || error.status === 403) {
      return res.status(502).json({ error: 'Groq rejected the API key for transcription.' });
    }

    if (error.status === 429) {
      return res.status(429).json({ error: 'Voice input is busy right now. Please try again in a moment.' });
    }

    res.status(500).json({ error: 'Voice input could not be transcribed right now.' });
  }
}

module.exports = { upload, transcribeAudio };

