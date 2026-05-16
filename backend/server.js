const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '8mb' }));

app.get('/health', (req, res) => res.json({
  status: 'Mitra AI is running!',
  provider: 'groq',
  apiKeyConfigured: Boolean(process.env.GROQ_API_KEY),
}));
app.use('/api/chat', chatRoutes);

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
