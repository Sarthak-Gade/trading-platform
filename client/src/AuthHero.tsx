import Icon from './Icon';

// Left-hand marketing panel shared by the login and signup pages
function AuthHero() {
  return (
    <section className="auth-hero">
      <div className="brand auth-brand">
        <span className="brand-badge">TS</span>
        <span className="brand-word">
          Trade<span>Sim</span>
        </span>
      </div>
      <h1>
        Practise trading Indian stocks with <span>zero risk.</span>
      </h1>
      <p>Virtual money, live NSE prices and realistic Indian charges, so every lesson costs nothing.</p>
      <ul className="auth-points">
        <li>
          <span className="stat-icon blue"><Icon name="zap" size={18} /></span>
          Live prices with instant order execution
        </li>
        <li>
          <span className="stat-icon green"><Icon name="percent" size={18} /></span>
          Brokerage, STT, GST and stamp duty calculated like a real broker
        </li>
        <li>
          <span className="stat-icon purple"><Icon name="briefcase" size={18} /></span>
          Holdings, positions and a full ledger of every rupee
        </li>
      </ul>
    </section>
  );
}

export default AuthHero;
