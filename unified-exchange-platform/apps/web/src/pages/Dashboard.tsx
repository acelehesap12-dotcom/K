import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BarChart3, TrendingUp, Wallet, Activity } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [user, setUser] = useState(null);
  const [kk99Balance, setKk99Balance] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    fetchUserData(token);
  }, [navigate]);

  const fetchUserData = async (token: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [userRes, balanceRes, statsRes] = await Promise.all([
        axios.get('/api/v1/users/profile', { headers }),
        axios.get('/api/v1/users/kk99-balance', { headers }),
        axios.get('/api/v1/users/stats', { headers }),
      ]);

      setUser(userRes.data);
      setKk99Balance(balanceRes.data.balance);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      localStorage.removeItem('token');
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">KK99 Exchange</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user?.email}</span>
            <button
              onClick={() => {
                localStorage.removeItem('token');
                navigate('/login');
              }}
              className="bg-red-500 text-white px-4 py-2 rounded"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* KK99 Balance Card */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">KK99 Balance</p>
                <p className="text-3xl font-bold">{kk99Balance.toFixed(2)}</p>
              </div>
              <Wallet className="text-blue-500" size={32} />
            </div>
          </div>

          {/* Total Trades Card */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Trades</p>
                <p className="text-3xl font-bold">{stats?.totalTrades || 0}</p>
              </div>
              <Activity className="text-green-500" size={32} />
            </div>
          </div>

          {/* Total Volume Card */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Volume</p>
                <p className="text-3xl font-bold">${(stats?.totalVolume || 0).toFixed(0)}</p>
              </div>
              <TrendingUp className="text-purple-500" size={32} />
            </div>
          </div>

          {/* Win Rate Card */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Win Rate</p>
                <p className="text-3xl font-bold">{stats?.winRate || 0}%</p>
              </div>
              <BarChart3 className="text-orange-500" size={32} />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/deposit')}
            className="bg-blue-500 text-white p-4 rounded-lg hover:bg-blue-600"
          >
            💳 Deposit Crypto
          </button>
          <button
            onClick={() => navigate('/trade')}
            className="bg-green-500 text-white p-4 rounded-lg hover:bg-green-600"
          >
            📈 Start Trading
          </button>
          <button
            onClick={() => navigate('/portfolio')}
            className="bg-purple-500 text-white p-4 rounded-lg hover:bg-purple-600"
          >
            💼 View Portfolio
          </button>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
