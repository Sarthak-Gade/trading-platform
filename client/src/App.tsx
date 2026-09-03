import PriceChart from './PriceChart';

function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Live Price Chart — BTC/USDT</h1>
      <PriceChart />
    </div>
  );
}

export default App;