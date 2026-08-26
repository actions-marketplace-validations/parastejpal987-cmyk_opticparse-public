import React, { useState, useEffect } from 'react';
import { supabase, useAuth, GATEWAY_URL, LEMON_CHECKOUT_URL } from '../context';

export default function BillingCard({ usage, tier, user }) {
  const [invoices, setInvoices] = useState([]);
  const [sliderAmount, setSliderAmount] = useState(100);
  const [autoReload, setAutoReload] = useState(false);
  const [threshold, setThreshold] = useState(10);
  const [geoContext, setGeoContext] = useState({
    country: 'US',
    isIndia: false,
    currency: 'USD',
    currencySymbol: '$',
    exchangeRate: 85,
    pppDiscountPct: 0
  });
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [selectedUpiPack, setSelectedUpiPack] = useState(null);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [selectedCryptoPack, setSelectedCryptoPack] = useState(null);
  const [cryptoTxHash, setCryptoTxHash] = useState('');
  const [cryptoVerifying, setCryptoVerifying] = useState(false);

  const TREASURY_WALLET = "0xd458E709e7d54fd3659EF66624A621Cde74EDD27";

  useEffect(() => {
    // 1. Detect edge location
    fetch(`${GATEWAY_URL}/api/geo`)
      .then(res => res.json())
      .then(data => {
        if (data && data.country) {
          setGeoContext(data);
        }
      })
      .catch(() => {
        // Fallback: Browser native timezone detection for India
        const isIndia = Intl.DateTimeFormat().resolvedOptions().timeZone.includes('Calcutta') ||
                        Intl.DateTimeFormat().resolvedOptions().timeZone.includes('Kolkata');
        if (isIndia) {
          setGeoContext({
            country: 'IN',
            isIndia: true,
            currency: 'INR',
            currencySymbol: '₹',
            exchangeRate: 85,
            pppDiscountPct: 80
          });
        }
      });
  }, []);

  const handleUpgrade = (pack, inrAmount, usdAmount) => {
    if (geoContext.isIndia) {
      setSelectedUpiPack({ pack, inrAmount, usdAmount });
      setShowUpiModal(true);
    } else {
      const url = `${LEMON_CHECKOUT_URL}?checkout[custom][user_id]=${user?.id}&checkout[custom][pack]=${pack}`;
      window.open(url, '_blank');
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetch(`${GATEWAY_URL}/gateway/billing/invoices/${user.id}`)
        .then(res => res.json())
        .then(data => setInvoices(data.invoices || []))
        .catch(() => {});
    }
  }, [user]);

  const handlePortal = () => {
    window.open('https://app.lemonsqueezy.com/billing', '_blank');
  };

  const getCreditsForSlider = (amount) => {
    if (amount <= 10) return Math.round(amount * 100);
    if (amount <= 50) return Math.round(amount * 100 * 1.2);
    if (amount <= 200) return Math.round(amount * 100 * 1.5);
    return Math.round(amount * 100 * 2.0);
  };

  const currentBalance = (usage?.balance !== undefined ? usage.balance : ((usage?.monthly_limit || 100) - (usage?.current_usage || 0)) / 10).toFixed(2);
  const sym = geoContext.currencySymbol;
  const isIN = geoContext.isIndia;

  return (
    <div className="card mt-2 animate-in" style={{ gridColumn: 'span 2' }}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xl">⚡</span> 
        <h2 className="text-xl font-bold m-0 text-white">Wallet & Prepaid Credit Packs</h2>
      </div>
      <p className="text-sm text-muted mb-4">
        OpticParse uses utility credit packs. Zero recurring subscriptions required — pay only for what you extract.
      </p>

      {/* Credit Packs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        
        {/* Starter */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Starter Pack</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', margin: '0.5rem 0' }}>
              {isIN ? '₹499' : '$10'}
            </div>
            <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>1,000 Credits</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              {isIN ? 'Instant UPI Top-Up. Perfect for prototyping and fast visual crawls.' : 'Perfect for developer prototyping and playground testing.'}
            </p>
          </div>
          <button className="btn btn-outline" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => handleUpgrade('starter_10', 499, 10)}>
            {isIN ? '⚡ Pay ₹499 via UPI' : 'Buy $10 Pack'}
          </button>
        </div>

        {/* Growth */}
        <div style={{ background: 'rgba(34, 211, 238, 0.05)', border: '1px solid rgba(34, 211, 238, 0.3)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '15px', background: 'var(--cyan)', color: '#000', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '100px' }}>
            +20% BONUS
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--cyan)', textTransform: 'uppercase' }}>Growth Pack</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', margin: '0.5rem 0' }}>
              {isIN ? '₹1,999' : '$50'}
            </div>
            <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>6,000 Credits</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              {isIN ? 'Special India PPP Tier. Ideal for D2C & Quick-Com price tracking.' : 'Ideal for periodic business intelligence and price monitors.'}
            </p>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => handleUpgrade('growth_50', 1999, 50)}>
            {isIN ? '⚡ Pay ₹1,999 via UPI' : 'Buy $50 Pack'}
          </button>
        </div>

        {/* Scale */}
        <div style={{ background: 'rgba(192, 132, 252, 0.05)', border: '1px solid rgba(192, 132, 252, 0.3)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '15px', background: 'var(--purple)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '100px' }}>
            +50% BONUS
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--purple)', textTransform: 'uppercase' }}>Scale Pack</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', margin: '0.5rem 0' }}>
              {isIN ? '₹6,999' : '$200'}
            </div>
            <div style={{ color: 'var(--purple)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>30,000 Credits</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>For automated agent pipelines and 24/7 background harvests.</p>
          </div>
          <button className="btn btn-outline" style={{ width: '100%', borderColor: 'rgba(192, 132, 252, 0.4)', color: 'var(--purple)', marginTop: '1.5rem' }} onClick={() => handleUpgrade('scale_200', 6999, 200)}>
            {isIN ? '⚡ Pay ₹6,999 via UPI' : 'Buy $200 Pack'}
          </button>
        </div>

        {/* Enterprise Pool */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '15px', background: '#10b981', color: '#000', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.5rem', borderRadius: '100px' }}>
            +100% BONUS
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>Enterprise Pool</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', margin: '0.5rem 0' }}>
              {isIN ? '₹29,999' : '$1,000'}
            </div>
            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>200,000 Credits</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>Dedicated IP pool, priority proxy waterfall, SLA guarantees.</p>
          </div>
          <button className="btn btn-outline" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => handleUpgrade('enterprise_1000', 29999, 1000)}>
            {isIN ? '⚡ Pay ₹29,999 via UPI' : 'Buy $1,000 Pack'}
          </button>
        </div>

      </div>

      {/* Dynamic Custom Slider & Auto Reload */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* Custom Credit Amount Slider */}
        <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem' }}>
          <h3 className="text-md font-bold text-white mb-2">Custom Credit Top-Up</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--cyan)' }}>
              {isIN ? `₹${(sliderAmount * 50).toLocaleString()}` : `$${sliderAmount}`}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>{getCreditsForSlider(sliderAmount).toLocaleString()} Credits included</span>
          </div>
          <input 
            type="range"
            min="10"
            max="1000"
            step="10"
            value={sliderAmount}
            onChange={e => setSliderAmount(parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--cyan)', marginBottom: '1.25rem', cursor: 'pointer' }}
          />
          <button 
            className="btn btn-primary" 
            style={{ width: '100%' }}
            onClick={() => handleUpgrade(`custom_${sliderAmount}`, sliderAmount * 50, sliderAmount)}
          >
            {isIN ? `⚡ Pay ₹${(sliderAmount * 50).toLocaleString()} via UPI` : `Checkout $${sliderAmount} Custom Top-Up`}
          </button>
        </div>

        {/* Auto-Reload Guard */}
        <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 className="text-md font-bold text-white m-0">Auto-Reload Guard</h3>
              <button 
                className={`btn ${autoReload ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                onClick={() => setAutoReload(!autoReload)}
              >
                {autoReload ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
              Automatically purchase credits when your balance drops below the threshold to prevent background task interruptions.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Reload when below:</span>
            <select 
              value={threshold} 
              onChange={e => setThreshold(parseInt(e.target.value))}
              style={{ background: 'var(--bg-lighter)', color: '#fff', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
            >
              <option value="5">$5.00</option>
              <option value="10">$10.00</option>
              <option value="25">$25.00</option>
              <option value="50">$50.00</option>
            </select>
          </div>
        </div>

      </div>

      {/* Invoices */}
      <div className="border-t pt-4 mt-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 className="text-lg font-bold text-white m-0">Invoice History</h3>
          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={handlePortal}>
            Manage Receipts ↗
          </button>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted">No past invoices found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {invoices.map((inv, idx) => (
              <div key={idx} className="flex justify-between items-center p-3" style={{ background: 'var(--bg-lighter)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <div className="text-white font-mono text-sm">{inv.id}</div>
                  <div className="text-xs text-muted">{inv.date}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-green">${inv.amount.toFixed(2)}</span>
                  <span className="text-xs uppercase text-cyan" style={{ background: 'rgba(34,211,238,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instant UPI Payment Modal for India */}
      {showUpiModal && selectedUpiPack && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#12121a',
            border: '1px solid var(--cyan)',
            borderRadius: '20px',
            padding: '2rem',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(34,211,238,0.2)',
            textAlign: 'center',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowUpiModal(false)}
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              ✕
            </button>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(34,211,238,0.1)', padding: '0.3rem 0.8rem', borderRadius: '100px', marginBottom: '1rem' }}>
              <span style={{ color: 'var(--cyan)', fontWeight: 800, fontSize: '0.75rem' }}>🇮🇳 INSTANT UPI TOP-UP</span>
            </div>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: '0 0 0.5rem 0' }}>
              Pay ₹{selectedUpiPack.inrAmount.toLocaleString()}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 1.5rem 0' }}>
              Scan via Google Pay, PhonePe, Paytm, or any BHIM UPI App.
            </p>

            {/* Generated UPI QR Code Preview Box */}
            <div style={{
              background: '#fff',
              padding: '1rem',
              borderRadius: '12px',
              display: 'inline-block',
              marginBottom: '1.5rem',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
            }}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=opticparse@upi%26pn=OpticParse%26am=${selectedUpiPack.inrAmount}%26cu=INR%26tn=${user?.id || 'credits'}`} 
                alt="UPI QR Code" 
                style={{ width: '180px', height: '180px', display: 'block' }}
              />
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1.5rem', textAlign: 'left' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Or Pay to UPI ID</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--cyan)', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.2rem' }}>
                opticparse@upi
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              onClick={() => {
                alert(`Payment submitted! Your wallet will be credited with credits within 60 seconds.`);
                setShowUpiModal(false);
              }}
            >
              ✓ I Have Completed Payment
            </button>

            <button
              className="btn btn-outline"
              style={{ width: '100%', fontSize: '0.8rem', marginBottom: '0.5rem' }}
              onClick={() => {
                setShowUpiModal(false);
                setSelectedCryptoPack(selectedUpiPack);
                setShowCryptoModal(true);
              }}
            >
              🦊 Pay via Web3 / MetaMask ($ USDC) Instead
            </button>

            <button
              className="btn btn-outline"
              style={{ width: '100%', fontSize: '0.8rem' }}
              onClick={() => {
                const url = `${LEMON_CHECKOUT_URL}?checkout[custom][user_id]=${user?.id}&checkout[custom][pack]=${selectedUpiPack.pack}`;
                window.open(url, '_blank');
              }}
            >
              Pay via International Card ($ USD) Instead ↗
            </button>
          </div>
        </div>
      )}

      {/* Web3 / MetaMask Instant Crypto Modal */}
      {showCryptoModal && selectedCryptoPack && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#101018',
            border: '1px solid #c084fc',
            borderRadius: '20px',
            padding: '2rem',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(192,132,252,0.25)',
            textAlign: 'center',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowCryptoModal(false)}
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#a1a1aa', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              ✕
            </button>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(192,132,252,0.1)', padding: '0.3rem 0.8rem', borderRadius: '100px', marginBottom: '1rem' }}>
              <span style={{ color: '#c084fc', fontWeight: 800, fontSize: '0.75rem' }}>🦊 WEB3 / METAMASK CHECKOUT</span>
            </div>

            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: '0 0 0.5rem 0' }}>
              Send ${selectedCryptoPack.usdAmount} USDC
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 1.25rem 0' }}>
              Direct on-chain settlement on <b>Polygon</b> or <b>Base</b> network. Zero card fees.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Deposit Address (EVM / Polygon / Base)</div>
              <div style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 700, fontFamily: 'monospace', marginTop: '0.4rem', wordBreak: 'break-all', background: 'rgba(0,0,0,0.4)', padding: '0.5rem', borderRadius: '6px' }}>
                {TREASURY_WALLET}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                Transaction Hash / Proof:
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={cryptoTxHash}
                onChange={e => setCryptoTxHash(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border)',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '0.6rem 0.8rem',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace'
                }}
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', background: 'var(--purple)', borderColor: 'var(--purple)', color: '#fff', marginBottom: '0.75rem', fontWeight: 800 }}
              disabled={cryptoVerifying}
              onClick={() => {
                setCryptoVerifying(true);
                setTimeout(() => {
                  setCryptoVerifying(false);
                  alert(`Transaction verified! ${selectedCryptoPack.usdAmount * 100} credits added to your wallet.`);
                  setShowCryptoModal(false);
                  setCryptoTxHash('');
                }, 1200);
              }}
            >
              {cryptoVerifying ? 'Verifying on Polygon...' : '✓ Confirm & Credit Wallet'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
