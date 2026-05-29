let participantId = null;
let selectedDirection = null;
let timerInterval = null;
let lastRound = 0;

async function register() {
  const name = document.getElementById('name-input').value.trim();
  if (!name) return alert('Enter your name');

  const res = await fetch('/api/participant/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });

  const data = await res.json();
  if (data.success) {
    participantId = data.participantId;
    localStorage.setItem('participantId', participantId);
    localStorage.setItem('participantName', data.name);
    document.getElementById('register-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    startPolling();
  }
}

function selectDirection(dir) {
  selectedDirection = dir;
  document.getElementById('btn-buy').classList.toggle('selected', dir === 'BUY');
  document.getElementById('btn-sell').classList.toggle('selected', dir === 'SELL');
}

async function submitOrder() {
  if (!selectedDirection) return alert('Select BUY or SELL');
  const units = parseInt(document.getElementById('units-input').value);
  if (!units || units < 1 || units > 20) return alert('Enter units between 1 and 20');

  const res = await fetch('/api/participant/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantId, direction: selectedDirection, units })
  });

  const data = await res.json();
  const status = document.getElementById('order-status');

  if (data.success) {
    document.getElementById('submit-btn').disabled = true;
    document.getElementById('submit-btn').textContent = '✅ Order Placed';
    status.textContent = `${selectedDirection} ${units} units submitted`;
    status.style.color = '#00ff88';
  } else {
    status.textContent = data.message;
    status.style.color = '#ff4444';
  }
}

function startPolling() {
  // Poll game state every 2 seconds
  setInterval(async () => {
    const res = await fetch('/api/game-state');
    const state = await res.json();
    updateGameUI(state);
  }, 2000);

  // Poll leaderboard every 5 seconds
  setInterval(async () => {
    const res = await fetch('/api/leaderboard');
    const board = await res.json();
    updateLeaderboard(board);
  }, 5000);
}

function updateGameUI(state) {
  // Update price
  document.getElementById('current-price').textContent =
    '₹' + state.currentPrice.toLocaleString();

  // New round started
  if (state.currentRound !== lastRound && state.timerActive) {
    lastRound = state.currentRound;
    resetTradePanel();

    // Show image
    if (state.currentImage) {
      document.getElementById('news-image-container').innerHTML =
        `<img src="${state.currentImage}" alt="Round ${state.currentRound}">`;
    }
  }

  // Timer
  if (state.timerActive) {
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-btn').textContent = 'Submit Order';
  } else {
    document.getElementById('submit-btn').disabled = true;
    if (document.getElementById('submit-btn').textContent === 'Submit Order') {
      document.getElementById('submit-btn').textContent = 'Round Closed';
    }
  }
}

function updateLeaderboard(board) {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = board.slice(0, 10).map((p, i) => `
    <div class="leaderboard-row">
      <span class="rank">#${i + 1}</span>
      <span class="lb-name">${p.name}</span>
      <span class="lb-pnl ${p.totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">
        ${p.totalPnl >= 0 ? '+' : ''}₹${Math.round(p.totalPnl).toLocaleString()}
      </span>
    </div>
  `).join('');
}

function resetTradePanel() {
  selectedDirection = null;
  document.getElementById('btn-buy').classList.remove('selected');
  document.getElementById('btn-sell').classList.remove('selected');
  document.getElementById('units-input').value = 1;
  document.getElementById('order-status').textContent = '';
  document.getElementById('submit-btn').textContent = 'Submit Order';
  document.getElementById('submit-btn').disabled = false;
}