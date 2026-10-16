import Profile from './Profile';
import BankAccounts from './BankAccounts';

function ProfilePage() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Profile &amp; KYC</h1>
          <p>Your account details and linked bank accounts.</p>
        </div>
      </div>
      <div className="two-col" style={{ alignItems: 'start' }}>
        <Profile />
        <BankAccounts />
      </div>
    </div>
  );
}

export default ProfilePage;
