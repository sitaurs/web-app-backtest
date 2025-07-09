import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  Grid,
} from '@mui/material';
import { Visibility } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import {
  backtestService,
  BacktestSession,
  DetailedBacktestReport,
} from '../services/backtestService';

const ReportPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [report, setReport] = useState<DetailedBacktestReport | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadReport(sessionId);
    } else {
      loadReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await backtestService.getReports();
      if (response.success && response.data) {
        setSessions(response.data.sessions);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (id: string) => {
    try {
      setLoading(true);
      const response = await backtestService.getReportById(id);
      if (response.success && response.data) {
        setReport(response.data);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
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
      case 'CANCELLED':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (sessionId) {
    if (loading) {
      return (
        <Box sx={{ p: 3 }}>
          <Typography variant="h4" gutterBottom>
            Loading Report...
          </Typography>
          <LinearProgress />
        </Box>
      );
    }

    if (!report) {
      return (
        <Box sx={{ p: 3 }}>
          <Typography variant="h4" gutterBottom>
            Report Details
          </Typography>
          <Typography>No data available.</Typography>
        </Box>
      );
    }

    const { metadata, performance_summary } = report;

    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Report Details
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" gutterBottom>
            <strong>Symbol:</strong> {metadata.pair}
          </Typography>
          <Typography variant="body1" gutterBottom>
            <strong>Period:</strong> {metadata.start_date} - {metadata.end_date}
          </Typography>
          <Typography variant="body1" gutterBottom>
            <strong>Initial Balance:</strong>{' '}
            {backtestService.formatCurrency(metadata.initial_balance)}
          </Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6} md={3}>
            <Typography variant="subtitle2">Net P&amp;L</Typography>
            <Typography color={performance_summary.net_profit_loss >= 0 ? 'success.main' : 'error.main'}>
              {backtestService.formatCurrency(performance_summary.net_profit_loss)}
            </Typography>
          </Grid>
          <Grid item xs={6} md={3}>
            <Typography variant="subtitle2">Win Rate</Typography>
            <Typography>
              {backtestService.formatPercentage(performance_summary.win_rate_percent)}
            </Typography>
          </Grid>
          <Grid item xs={6} md={3}>
            <Typography variant="subtitle2">Trades</Typography>
            <Typography>{performance_summary.total_trades}</Typography>
          </Grid>
          <Grid item xs={6} md={3}>
            <Typography variant="subtitle2">Profit Factor</Typography>
            <Typography>{performance_summary.profit_factor.toFixed(2)}</Typography>
          </Grid>
        </Grid>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body1" color="text.secondary">
          More detailed views coming soon.
        </Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Loading Reports...
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Backtest Reports
      </Typography>

      {sessions.length === 0 ? (
        <Typography>No reports found.</Typography>
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
                <TableCell>P&amp;L</TableCell>
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
                  <TableCell>
                    {backtestService.formatPercentage(session.winRate)}
                  </TableCell>
                  <TableCell>
                    <Typography
                      color={session.netProfitLoss >= 0 ? 'success.main' : 'error.main'}
                    >
                      {backtestService.formatCurrency(session.netProfitLoss)}
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
    </Box>
  );
};

export default ReportPage;
