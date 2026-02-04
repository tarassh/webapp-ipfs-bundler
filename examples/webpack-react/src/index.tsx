import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import logoUrl from './logo.svg';

const assets = [
  { symbol: 'FIL', name: 'Filecoin', balance: '3.245', value: '$18.42', change: '+4.2%' },
  { symbol: 'IPFS', name: 'IPFS Credit', balance: '128.0', value: '$12.80', change: '-1.1%' },
  { symbol: 'wETH', name: 'Wrapped Ether', balance: '0.094', value: '$207.33', change: '+2.9%' },
];

const transactions = [
  { hash: 'bafy...2tqk', type: 'Storage', amount: '-0.42 FIL', status: 'Confirmed', time: '2m ago' },
  { hash: 'bafy...8n9a', type: 'Pinned CID', amount: '+12 IPFS', status: 'Pending', time: '18m ago' },
  { hash: 'bafy...1j4m', type: 'Swap', amount: '+0.01 wETH', status: 'Confirmed', time: '2h ago' },
];

function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">IPFS Pack Demo</div>
          <div className="title-row">
            <img src={logoUrl} alt="logo" width={36} height={36} />
            <h1>Orbit Wallet</h1>
          </div>
          <p className="muted">Cryptographic wallet interface powered by IPFS content addressing.</p>
        </div>
        <div className="status-card">
          <div className="status-row">
            <span>Network</span>
            <strong>IPFS Testnet</strong>
          </div>
          <div className="status-row">
            <span>Public Key</span>
            <strong className="mono">0x2f6b...9a2d</strong>
          </div>
          <div className="status-row">
            <span>IPNS</span>
            <strong className="mono">k51qzi5uqu5d...m2x</strong>
          </div>
          <div className="pill success">Connected</div>
        </div>
      </header>

      <section className="grid">
        <div className="card balance-card">
          <div className="card-header">
            <h2>Portfolio</h2>
            <span className="pill accent">Total $238.55</span>
          </div>
          <div className="balance">
            <div>
              <div className="label">Available</div>
              <div className="value">$182.33</div>
            </div>
            <div>
              <div className="label">Locked</div>
              <div className="value">$56.22</div>
            </div>
          </div>
          <div className="actions">
            <button className="btn primary">Send</button>
            <button className="btn">Receive</button>
            <button className="btn ghost">Generate Keypair</button>
          </div>
          <div className="asset-list">
            {assets.map((asset) => (
              <div key={asset.symbol} className="asset-row">
                <div>
                  <div className="asset-title">{asset.symbol}</div>
                  <div className="muted small">{asset.name}</div>
                </div>
                <div className="right">
                  <div className="asset-title">{asset.balance}</div>
                  <div className={`small ${asset.change.startsWith('+') ? 'positive' : 'negative'}`}>
                    {asset.value} {asset.change}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Send Assets</h2>
            <span className="muted small">Gas estimate: 0.004 FIL</span>
          </div>
          <form className="form-grid">
            <label>
              Recipient CID
              <input placeholder="bafybeigdyr...5b3" />
            </label>
            <label>
              Asset
              <select defaultValue="FIL">
                <option value="FIL">FIL</option>
                <option value="IPFS">IPFS Credit</option>
                <option value="wETH">wETH</option>
              </select>
            </label>
            <label>
              Amount
              <input placeholder="0.00" />
            </label>
            <label>
              Memo
              <input placeholder="Optional memo" />
            </label>
            <button type="button" className="btn primary">Submit Transfer</button>
          </form>
          <div className="divider" />
          <div className="key-info">
            <div>
              <div className="label">Latest Signed CID</div>
              <div className="mono">bafybeie7hfr...f2k</div>
            </div>
            <button className="btn ghost">View Proof</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Recent Activity</h2>
            <button className="btn ghost">View All</button>
          </div>
          <div className="tx-list">
            {transactions.map((tx) => (
              <div key={tx.hash} className="tx-row">
                <div>
                  <div className="asset-title">{tx.type}</div>
                  <div className="muted small mono">{tx.hash}</div>
                </div>
                <div className="right">
                  <div className="asset-title">{tx.amount}</div>
                  <div className="muted small">{tx.status} · {tx.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

createRoot(document.body.appendChild(document.createElement('div'))).render(<App />);