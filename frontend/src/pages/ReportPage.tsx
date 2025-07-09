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
} from '@mui/material';
import { Visibility } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { backtestService, BacktestSession } from '../services/backtestService';

const ReportPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string}>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<BacktestSession[]>([]);

  useEffect(() => {
    if (!sessionId) {
      loadReports();
    }
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
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Report Details
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Under construction
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
