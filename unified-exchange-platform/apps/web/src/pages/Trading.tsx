import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Trading: React.FC = () => {
  const [symbol, setSymbol] = useState('BTC-USD');
  const [side, setSide] = useState('BUY');
  const [quantity, setQuantity] = useState(0.1);
  const [price, setPrice] = useState(0);
  const [orderType, setOrderType] = useState('LIMIT');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/v1/orders',
        {
          symbol,
          side: side.toUpperCase(),
          orderType,
          quantity,
          price: orderType === 'LIMIT' ? price : null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessage('Order placed successfully!');
      // Reset form
      setQuantity(0.1);
      setPrice(0);
    } catch (error: any) {
      setMessage(`Error: ${error.response?.data?.error || 'Failed to place order'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <button
        onClick={() => navigate('/dashboard')}
        className="mb-8 bg-gray-600 text-white px-4 py-2 rounded"
      >
        ← Back to Dashboard
      </button>

      <div className="max-w-md bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Place Order</h1>

        <form onSubmit={handlePlaceOrder} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Asset</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-4 py-2 border rounded"
            >
              <option>BTC-USD</option>
              <option>ETH-USD</option>
              <option>SOL-USD</option>
              <option>EUR-USD</option>
              <option>AAPL</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Side</label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value)}
                className="w-full px-4 py-2 border rounded"
              >
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Type</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                className="w-full px-4 py-2 border rounded"
              >
                <option value="LIMIT">Limit</option>
                <option value="MARKET">Market</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value))}
              step="0.01"
              className="w-full px-4 py-2 border rounded"
            />
          </div>

          {orderType === 'LIMIT' && (
            <div>
              <label className="block text-sm font-medium mb-2">Price</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value))}
                step="0.01"
                className="w-full px-4 py-2 border rounded"
              />
            </div>
          )}

          {message && (
            <div className={`p-4 rounded ${message.includes('Error') ? 'bg-red-100' : 'bg-green-100'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Placing...' : 'Place Order'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Trading;
