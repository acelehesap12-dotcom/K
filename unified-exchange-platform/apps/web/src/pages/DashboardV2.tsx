import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui';
import axios from 'axios';

interface PortfolioAsset {
  symbol: string;
  name: string;
  balance: number;
  value: number;
  change24h: number;
  allocation: number;
}

interface RecentTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  total: number;
  timestamp: string;
}

interface MarketOverview {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export default function DashboardV2() {
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [dailyPnL, setDailyPnL] = useState(0);
  const [portfolioAssets, setPortfolioAssets] = useState<PortfolioAsset[]>([]);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [marketOverview, setMarketOverview] = useState<MarketOverview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000); // Real-time updates
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      // REAL API CALLS - NO MOCKS
      const [walletRes, tradesRes, marketRes] = await Promise.all([
        axios.get('/api/wallet/balance'),
        axios.get('/api/trades/recent?limit=10'),
        axios.get('/api/market-data/overview'),
      ]);

      // Portfolio calculation
      const assets = walletRes.data.assets || [];
      const totalValue = assets.reduce((sum: number, a: any) => sum + a.value, 0);
      setPortfolioValue(totalValue);

      // Calculate 24h PnL
      const pnl = assets.reduce(
        (sum: number, a: any) => sum + (a.value * a.change24h) / 100,
        0
      );
      setDailyPnL(pnl);

      setPortfolioAssets(assets);
      setRecentTrades(tradesRes.data.trades || []);
      setMarketOverview(marketRes.data.markets || []);
      setLoading(false);
    } catch (error) {
      console.error('Dashboard data fetch error:', error);
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);

  const formatPercent = (value: number) =>
    `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Dashboard
            </h1>
            <p className="text-gray-400">
              Hoş geldiniz! Portföyünüzü yönetin ve piyasaları takip edin.
            </p>
          </div>
          <Button
            variant="ghost"
            icon={<RefreshCw className="w-5 h-5" />}
            onClick={fetchDashboardData}
            loading={loading}
          >
            Yenile
          </Button>
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card variant="gradient" hover>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm font-medium">
                  Toplam Değer
                </p>
                <h3 className="text-3xl font-bold text-white mt-2">
                  {formatCurrency(portfolioValue)}
                </h3>
              </div>
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Wallet className="w-8 h-8 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="gradient" hover>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm font-medium">24s Kar/Zarar</p>
                <div className="flex items-center gap-2 mt-2">
                  <h3
                    className={`text-3xl font-bold ${
                      dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {formatCurrency(Math.abs(dailyPnL))}
                  </h3>
                  {dailyPnL >= 0 ? (
                    <TrendingUp className="w-6 h-6 text-green-400" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-red-400" />
                  )}
                </div>
              </div>
              <div
                className={`p-3 rounded-xl ${
                  dailyPnL >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}
              >
                <DollarSign
                  className={`w-8 h-8 ${
                    dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="gradient" hover>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm font-medium">
                  Toplam İşlem
                </p>
                <h3 className="text-3xl font-bold text-white mt-2">
                  {recentTrades.length}
                </h3>
              </div>
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Activity className="w-8 h-8 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="gradient" hover>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm font-medium">Aktif Varlık</p>
                <h3 className="text-3xl font-bold text-white mt-2">
                  {portfolioAssets.length}
                </h3>
              </div>
              <div className="p-3 bg-yellow-500/20 rounded-xl">
                <Eye className="w-8 h-8 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Assets */}
        <div className="lg:col-span-2">
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Portföy Dağılımı</CardTitle>
              <CardDescription>
                Varlıklarınızın anlık değerleri ve değişimleri
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Varlık</TableHead>
                    <TableHead>Bakiye</TableHead>
                    <TableHead>Değer</TableHead>
                    <TableHead>24s Değişim</TableHead>
                    <TableHead>Oran</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {portfolioAssets.map((asset) => (
                    <TableRow key={asset.symbol}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {asset.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-white">
                              {asset.symbol}
                            </p>
                            <p className="text-xs text-gray-400">{asset.name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {asset.balance.toFixed(8)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(asset.value)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span
                            className={
                              asset.change24h >= 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            }
                          >
                            {formatPercent(asset.change24h)}
                          </span>
                          {asset.change24h >= 0 ? (
                            <ArrowUpRight className="w-4 h-4 text-green-400" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full"
                              style={{ width: `${asset.allocation}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-12">
                            {asset.allocation.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Market Overview */}
        <div>
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Piyasa Özeti</CardTitle>
              <CardDescription>Anlık fiyatlar ve hacimler</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {marketOverview.slice(0, 6).map((market) => (
                  <motion.div
                    key={market.symbol}
                    whileHover={{ x: 4 }}
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-blue-500/50 transition-all cursor-pointer"
                  >
                    <div>
                      <p className="font-semibold text-white">{market.symbol}</p>
                      <p className="text-xs text-gray-400">
                        Vol: {(market.volume24h / 1000000).toFixed(2)}M
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white">
                        {formatCurrency(market.price)}
                      </p>
                      <Badge
                        variant={market.change24h >= 0 ? 'success' : 'danger'}
                        size="sm"
                      >
                        {formatPercent(market.change24h)}
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Trades */}
      <div className="mt-6">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Son İşlemler</CardTitle>
            <CardDescription>
              Gerçekleştirdiğiniz son 10 işlem
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zaman</TableHead>
                  <TableHead>Çift</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Fiyat</TableHead>
                  <TableHead>Miktar</TableHead>
                  <TableHead>Toplam</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTrades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell className="text-gray-400 text-xs">
                      {new Date(trade.timestamp).toLocaleString('tr-TR')}
                    </TableCell>
                    <TableCell className="font-semibold text-white">
                      {trade.symbol}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={trade.side === 'buy' ? 'success' : 'danger'}
                      >
                        {trade.side === 'buy' ? 'AL' : 'SAT'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatCurrency(trade.price)}
                    </TableCell>
                    <TableCell className="font-mono">
                      {trade.amount.toFixed(8)}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(trade.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
