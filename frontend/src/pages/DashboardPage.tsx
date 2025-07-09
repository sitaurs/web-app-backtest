import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Assessment,
  PlayArrow,
  Refresh,
  Visibility,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { backtestService, BacktestSession } from '../services/backtestService';
import toast from 'react-hot-toast';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [stats, setStats] = useState({
    totalBacktests: 0,
    completedBacktests: 0,
    runningBacktests: 0,
    totalTrades: 0,
    winningTrades: 0,
    totalPnL: 0,
    averageWinRate: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load recent sessions
      const reportsResponse = await backtestService.getReports();
      if (reportsResponse.success && reportsResponse.data) {
        const recentSessions = reportsResponse.data.sessions.slice(0, 5);
        setSessions(recentSessions);
        
        // Calculate stats
        const completed = recentSessions.filter(s => s.status === 'COMPLETED');
        const running = recentSessions.filter(s => s.status === 'RUNNING');
        const totalTrades = completed.reduce((sum, s) => sum + s.totalTrades, 0);
        const totalPnL = completed.reduce((sum, s) => sum + s.netProfitLoss, 0);
        const avgWinRate = completed.length > 0 
          ? completed.reduce((sum, s) => sum + s.winRate, 0) / completed.length 
          : 0;

        setStats({
          totalBacktests: recentSessions.length,
          completedBacktests: completed.length,
          runningBacktests: running.length,
          totalTrades,
          winningTrades: 0, // Would need to calculate from individual trades
          totalPnL,
          averageWinRate: avgWinRate,
        });
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'RUNNING':
        return 'primary';
      case 'FAILED':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Loading Dashboard...
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Welcome back, {user?.username}!
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Here's an overview of your forex backtesting activity
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Assessment color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Backtests</Typography>
              </Box>
              <Typography variant="h4" color="primary">
                {stats.totalBacktests}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stats.completedBacktests} completed, {stats.runningBacktests} running
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUp color="success" sx={{ mr: 1 }} />
                <Typography variant="h6">Total P&L</Typography>
              </Box>
              <Typography 
                variant="h4" 
                color={stats.totalPnL >= 0 ? 'success.main' : 'error.main'}
              >
                {formatCurrency(stats.totalPnL)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Across all completed backtests
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUp color="info" sx={{ mr: 1 }} />
                <Typography variant="h6">Average Win Rate</Typography>
              </Box>
              <Typography variant="h4" color="info.main">
                {formatPercentage(stats.averageWinRate)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Across all strategies
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Assessment color="secondary" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Trades</Typography>
              </Box>
              <Typography variant="h4" color="secondary.main">
                {stats.totalTrades}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Executed in backtests
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  startIcon={<PlayArrow />}
                  onClick={() => navigate('/backtest')}
                  size="large"
                >
                  New Backtest
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Assessment />}
                  onClick={() => navigate('/reports')}
                  size="large"
                >
                  View Reports
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Refresh />}
                  onClick={loadDashboardData}
                  size="large"
                >
                  Refresh
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Account Information
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body2">
                  <strong>Role:</strong> {user?.role}
                </Typography>
                <Typography variant="body2">
                  <strong>Email:</strong> {user?.email}
                </Typography>
                <Typography variant="body2">
                  <strong>Default Balance:</strong> {formatCurrency(user?.settings?.defaultBalance || 10000)}
                </Typography>
                <Typography variant="body2">
                  <strong>Max Concurrent Backtests:</strong> {user?.settings?.maxConcurrentBacktests || 2}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Sessions */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Backtest Sessions
          </Typography>
          
          {sessions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                No backtest sessions found
              </Typography>
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                onClick={() => navigate('/backtest')}
              >
                Start Your First Backtest
              </Button>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Session ID</TableCell>
                    <TableCell>Symbol</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Trades</TableCell>
                    <TableCell>Win Rate</TableCell>
                    <TableCell>P&L</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.sessionId}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {session.sessionId.substring(0, 12)}...
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={session.symbol} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={session.status} 
                          color={getStatusColor(session.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{session.totalTrades}</TableCell>
                      <TableCell>{formatPercentage(session.winRate)}</TableCell>
                      <TableCell>
                        <Typography 
                          color={session.netProfitLoss >= 0 ? 'success.main' : 'error.main'}
                        >
                          {formatCurrency(session.netProfitLoss)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/reports/${session.sessionId}`)}
                          >
                            <Visibility />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default DashboardPage;
