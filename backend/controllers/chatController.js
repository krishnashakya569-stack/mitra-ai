const { GoogleGenerativeAI } = require('@google/generative-ai');

const sendMessage = async (req, res) => {
  try {
    const { messages, image } = req.body;
    const key = process.env.GEMINI_API_KEY;

    if (!key || key === 'paste_your_key_here') {
      return res.status(500).json({ error: 'GEMINI_API_KEY missing in backend/.env — get it free at aistudio.google.com' });
    }
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: 'You are Mitra AI, a helpful, friendly, and highly intelligent assistant. Format responses with markdown when helpful. Be thorough but concise.'
    });

    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const lastMsg = messages[messages.length - 1].content;
    let parts = [{ text: lastMsg }];

    if (image && image.data) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(parts);
    res.json({ message: result.response.text() });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'API Error: ' + err.message });
  }
};

module.exports = { sendMessage };
