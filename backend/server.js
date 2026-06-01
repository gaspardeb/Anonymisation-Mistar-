require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { initDatabase } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3001;

initDatabase();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/anonymize', require('./routes/anonymize'));
app.use('/api/history',   require('./routes/history'));
app.use('/api/admin',     require('./routes/admin'));

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
