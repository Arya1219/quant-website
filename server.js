require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Google Sheets auth
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const SHEET_ID = process.env.SHEET_ID;

// Game state stored in memory
let gameState = {
  currentRound: 0,
  timerActive: false,
  timerSeconds: 30,
  currentImage: '',
  currentPrice: 1000,
  correctDirection: '',
  gameActive: false
};

// ─── ADMIN: verify password ───
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// ─── ADMIN: drop image and start round ───
app.post('/api/admin/start-round', (req, res) => {
  const { imageUrl, correctDirection, newPrice, round } = req.body;
  gameState.currentRound = round;
  gameState.currentImage = imageUrl;
  gameState.correctDirection = correctDirection;
  gameState.currentPrice = newPrice;
  gameState.timerActive = true;
  gameState.timerSeconds = 30;
  gameState.gameActive = true;

  // Auto stop timer after 30 seconds
  setTimeout(() => {
    gameState.timerActive = false;
  }, 30000);

  res.json({ success: true, gameState });
});

// ─── ADMIN: end round and push price update ───
app.post('/api/admin/end-round', async (req, res) => {
  const { newPrice } = req.body;
  gameState.currentPrice = newPrice;
  gameState.timerActive = false;

  // Calculate PnL for all participants
  await calculateAllPnL(newPrice);
  res.json({ success: true, newPrice });
});

// ─── PARTICIPANT: register ───
app.post('/api/participant/register', async (req, res) => {
  const { name } = req.body;
  const id = 'P' + Date.now();

  try {
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:I',
      valueInputOption: 'RAW',
      resource: {
        values: [[id, name, 10000, 'FLAT', 0, 0, 0, 0, 'none']]
      }
    });
    res.json({ success: true, participantId: id, name, cashBalance: 10000 });
  } catch (e) {
    console.error('Register error:', e.message);
    res.json({ success: false, message: 'Registration failed' });
  }
});

// ─── PARTICIPANT: get game state ───
app.get('/api/game-state', (req, res) => {
  res.json(gameState);
});

// ─── PARTICIPANT: submit order ───
app.post('/api/participant/order', async (req, res) => {
  const { participantId, direction, units } = req.body;

  if (Math.abs(units) > 20) {
    return res.json({ success: false, message: 'Max 20 units allowed' });
  }

  if (!gameState.timerActive) {
    return res.json({ success: false, message: 'Round closed' });
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:I'
    });

    const rows = response.data.values;
    const rowIndex = rows.findIndex(row => row[0] === participantId);

    if (rowIndex === -1) {
      return res.json({ success: false, message: 'Participant not found' });
    }

    const participant = rows[rowIndex];
    const cashBalance = parseFloat(participant[2]);
    const currentPrice = gameState.currentPrice;
    const orderValue = units * currentPrice;

    if (orderValue > cashBalance) {
      return res.json({ success: false, message: 'Insufficient balance' });
    }

    const newCash = cashBalance - orderValue;
    const updatedRow = [
      participant[0],
      participant[1],
      newCash,
      direction,
      units,
      currentPrice,
      participant[6],
      gameState.currentRound,
      direction
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Sheet1!A${rowIndex + 1}:I${rowIndex + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [updatedRow] }
    });

    res.json({ success: true, newBalance: newCash });
  } catch (e) {
    console.error('Order error:', e.message);
    res.json({ success: false, message: 'Order failed' });
  }
});

// ─── Calculate PnL after round ends ───
async function calculateAllPnL(newPrice) {
  try {
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:I'
    });

    const rows = response.data.values;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const units = parseFloat(row[4]) || 0;
      const entryPrice = parseFloat(row[5]) || 0;
      const direction = row[3];
      const totalPnl = parseFloat(row[6]) || 0;

      if (units === 0 || direction === 'FLAT') continue;

      let roundPnl = 0;
      if (direction === 'BUY') {
        roundPnl = (newPrice - entryPrice) * units;
      } else if (direction === 'SELL') {
        roundPnl = (entryPrice - newPrice) * units;
      }

      const newTotalPnl = totalPnl + roundPnl;
      const newCash = parseFloat(row[2]) + (units * newPrice);

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Sheet1!A${i + 1}:I${i + 1}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[
            row[0], row[1],
            newCash, 'FLAT', 0, 0,
            newTotalPnl,
            row[7], row[8]
          ]]
        }
      });
    }
  } catch (e) {
    console.error('PnL calc error:', e.message);
  }
}

// ─── Leaderboard ───
app.get('/api/leaderboard', async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:I'
    });

    const rows = response.data.values.slice(1);
    const leaderboard = rows.map(row => ({
      name: row[1],
      cashBalance: parseFloat(row[2]) || 0,
      totalPnl: parseFloat(row[6]) || 0
    })).sort((a, b) => b.totalPnl - a.totalPnl);

    res.json(leaderboard);
  } catch (e) {
    console.error('Leaderboard error:', e.message);
    res.json([]);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
