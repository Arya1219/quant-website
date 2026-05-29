let adminAuthenticated = false;

async function adminLogin() {
  const password = document.getElementById('password-input').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });

  const data = await res.json();
  if (data.success) {
    adminAuthenticated = true;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
    startAdminPolling();
  } else {
    alert('Wrong password');
  }
}

async function startRound() {
  const round = document.getElementById('round-number').value;
  const imageUrl = document.getElementById('image-url').value;
  const newPrice = parseFloat(document.getElementById('new-price').value);
  const correctDirection = document.getElementById('correct-direction').value;

  if (!round || !imageUrl || !newPrice || !correctDirection) {
    return alert('Fill all fields');
  }

  const res = await fetch('/api/admin/start-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ round, imageUrl, newPrice, correctDirection })
  });

  const data = await res.json();
  if (data.success) {
    alert(`Round ${round} started! Timer running for 30 seconds.`);
    document.getElementById('correct-answer-display').textContent = '';
  }
}

async function endRound() {
  const newPrice = parseFloat(document.getElementById('end-price').value);
  if (!newPrice) return alert('Enter new price');

  const res = await fetch('/api/admin/end-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPrice })
  });

  const data = await res.json();
  if (data.success) {
    const state = await (await fetch('/api/game-state')).json();
    document.getElementById('correct-answer-display').textContent =
      `✅ Correct Answer: ${state.correctDirection} | New Price: ₹${newPrice}`;
    alert('Round ended. PnL calculated for all participants.');
  }
}

function startAdminPolling() {
  setInterval(async () => {
    const res = await fetch('/api/game-state');
    const state = await res.json();
    document.getElementById('status-display').textContent =
      `Round: ${state.currentRound} | Price: ₹${state.currentPrice} | Timer: ${state.timerActive ? 'ACTIVE' : 'Inactive'}`;
  }, 2000);

  setInterval(async () => {
    const res = await fetch('/api/leaderboard');
    const board = await res.json();
    const display = document.getElementById('submissions-display');
    if (board.length === 0) {
      display.textContent = 'No participants yet';
      return;
    }
    display.innerHTML = `
      <table class="submissions-table">
        <tr><th>Name</th><th>Balance</th><th>Total PnL</th></tr>
        ${board.map(p => `
          <tr>
            <td>${p.name}</td>
            <td>₹${Math.round(p.cashBalance).toLocaleString()}</td>
            <td style="color:${p.totalPnl >= 0 ? '#00ff88' : '#ff4444'}">
              ${p.totalPnl >= 0 ? '+' : ''}₹${Math.round(p.totalPnl).toLocaleString()}
            </td>
          </tr>
        `).join('')}
      </table>
    `;
  }, 4000);
}