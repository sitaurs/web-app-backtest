import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  LinearProgress,
  Divider,
  Chip,
  Paper,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { PlayArrow, Settings, TrendingUp } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { backtestService, BacktestConfiguration } from '../services/backtestService';
import toast from 'react-hot-toast';
import dayjs, { Dayjs } from 'dayjs';

const BacktestPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [defaultPrompts, setDefaultPrompts] = useState({
    analysisPrompt: '',
    extractorPrompt: '',
  });

  // Form state
  const [formData, setFormData] = useState({
    symbol: 'EURUSD',
    startDate: dayjs().subtract(30, 'day'),
    endDate: dayjs().subtract(1, 'day'),
    initialBalance: user?.settings?.defaultBalance || 10000,
    skipCandles: user?.settings?.defaultSkipCandles || 6,
    analysisWindowHours: user?.settings?.defaultAnalysisWindow || 20,
    analysisPrompt: '',
    extractorPrompt: '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const forexPairs = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
    'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'CHFJPY', 'GBPCHF',
    'EURCHF', 'AUDCHF', 'GBPAUD', 'EURJPY', 'AUDCAD', 'CADJPY'
  ];

  useEffect(() => {
    loadDefaultPrompts();
  }, []);

  const loadDefaultPrompts = async () => {
    try {
      const response = await backtestService.getDefaultPrompts();
      if (response.success && response.data) {
        setDefaultPrompts(response.data);
        setFormData(prev => ({
          ...prev,
          analysisPrompt: response.data!.analysisPrompt,
          extractorPrompt: response.data!.extractorPrompt,
        }));
      }
    } catch (error) {
      console.error('Failed to load default prompts:', error);
    }
  };

  const handleInputChange = (field: string) => (event: any) => {
    const value = event.target ? event.target.value : event;
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleDateChange = (field: 'startDate' | 'endDate') => (date: Dayjs | null) => {
    if (date) {
      setFormData(prev => ({
        ...prev,
        [field]: date,
      }));
      
      if (errors[field]) {
        setErrors(prev => ({
          ...prev,
          [field]: '',
        }));
      }
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.symbol) {
      newErrors.symbol = 'Symbol is required';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required';
    }

    if (formData.startDate && formData.endDate && formData.startDate.isAfter(formData.endDate)) {
      newErrors.endDate = 'End date must be after start date';
    }

    if (formData.endDate && formData.endDate.isAfter(dayjs())) {
      newErrors.endDate = 'End date cannot be in the future';
    }

    if (formData.initialBalance <= 0) {
      newErrors.initialBalance = 'Initial balance must be positive';
    }

    if (formData.skipCandles < 1 || formData.skipCandles > 100) {
      newErrors.skipCandles = 'Skip candles must be between 1 and 100';
    }

    if (formData.analysisWindowHours < 1 || formData.analysisWindowHours > 168) {
      newErrors.analysisWindowHours = 'Analysis window must be between 1 and 168 hours';
    }

    if (!formData.analysisPrompt || formData.analysisPrompt.length < 10) {
      newErrors.analysisPrompt = 'Analysis prompt must be at least 10 characters';
    }

    if (!formData.extractorPrompt || formData.extractorPrompt.length < 10) {
      newErrors.extractorPrompt = 'Extractor prompt must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setLoading(true);

    try {
      const config: BacktestConfiguration = {
        symbol: formData.symbol,
        startDate: formData.startDate.toISOString(),
        endDate: formData.endDate.toISOString(),
        initialBalance: formData.initialBalance,
        skipCandles: formData.skipCandles,
        analysisWindowHours: formData.analysisWindowHours,
        analysisPrompt: formData.analysisPrompt,
        extractorPrompt: formData.extractorPrompt,
      };

      const response = await backtestService.runBacktest(config);

      if (response.success && response.data) {
        toast.success('Backtest started successfully!');
        navigate(`/reports/${response.data.sessionId}`);
      } else {
        toast.error(response.error || 'Failed to start backtest');
      }
    } catch (error) {
      console.error('Backtest submission failed:', error);
      toast.error('Failed to start backtest');
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    setFormData(prev => ({
      ...prev,
      analysisPrompt: defaultPrompts.analysisPrompt,
      extractorPrompt: defaultPrompts.extractorPrompt,
    }));
    toast.success('Prompts reset to defaults');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            Create New Backtest
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Configure your forex trading strategy backtest with AI analysis
          </Typography>
        </Box>

        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Basic Configuration */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <Settings sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Basic Configuration
                  </Typography>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControl fullWidth error={!!errors.symbol}>
                        <InputLabel>Currency Pair</InputLabel>
                        <Select
                          value={formData.symbol}
                          onChange={handleInputChange('symbol')}
                          label="Currency Pair"
                        >
                          {forexPairs.map((pair) => (
                            <MenuItem key={pair} value={pair}>
                              {pair}
                            </MenuItem>
                          ))}
                        </Select>
                        {errors.symbol && (
                          <Typography variant="caption" color="error">
                            {errors.symbol}
                          </Typography>
                        )}
                      </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <DatePicker
                        label="Start Date"
                        value={formData.startDate}
                        onChange={handleDateChange('startDate')}
                        maxDate={dayjs().subtract(1, 'day')}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            error: !!errors.startDate,
                            helperText: errors.startDate,
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <DatePicker
                        label="End Date"
                        value={formData.endDate}
                        onChange={handleDateChange('endDate')}
                        maxDate={dayjs().subtract(1, 'day')}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            error: !!errors.endDate,
                            helperText: errors.endDate,
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Initial Balance ($)"
                        type="number"
                        value={formData.initialBalance}
                        onChange={handleInputChange('initialBalance')}
                        error={!!errors.initialBalance}
                        helperText={errors.initialBalance}
                        inputProps={{ min: 100, max: 1000000 }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Skip Candles (M15)"
                        type="number"
                        value={formData.skipCandles}
                        onChange={handleInputChange('skipCandles')}
                        error={!!errors.skipCandles}
                        helperText={errors.skipCandles || 'Number of M15 candles to skip on NO_TRADE'}
                        inputProps={{ min: 1, max: 100 }}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Analysis Window (Hours)"
                        type="number"
                        value={formData.analysisWindowHours}
                        onChange={handleInputChange('analysisWindowHours')}
                        error={!!errors.analysisWindowHours}
                        helperText={errors.analysisWindowHours || 'Hours of historical data for each analysis'}
                        inputProps={{ min: 1, max: 168 }}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Summary */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <TrendingUp sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Backtest Summary
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Currency Pair
                      </Typography>
                      <Chip label={formData.symbol} color="primary" />
                    </Box>

                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Date Range
                      </Typography>
                      <Typography variant="body1">
                        {formData.startDate.format('MMM DD, YYYY')} - {formData.endDate.format('MMM DD, YYYY')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Duration: {formData.endDate.diff(formData.startDate, 'day')} days
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Initial Balance
                      </Typography>
                      <Typography variant="h6" color="primary">
                        ${formData.initialBalance.toLocaleString()}
                      </Typography>
                    </Box>

                    <Divider />

                    <Alert severity="info">
                      <Typography variant="body2">
                        This backtest will use AI analysis with a {formData.analysisWindowHours}-hour 
                        sliding window. On NO_TRADE decisions, the system will skip {formData.skipCandles} 
                        M15 candles before the next analysis.
                      </Typography>
                    </Alert>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* AI Prompts */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                      AI Analysis Prompts
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={resetToDefaults}
                    >
                      Reset to Defaults
                    </Button>
                  </Box>

                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        multiline
                        rows={12}
                        label="Analysis Prompt (Gemini Pro)"
                        value={formData.analysisPrompt}
                        onChange={handleInputChange('analysisPrompt')}
                        error={!!errors.analysisPrompt}
                        helperText={errors.analysisPrompt || 'Prompt for detailed market analysis'}
                        placeholder="Enter the prompt for AI market analysis..."
                      />
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        multiline
                        rows={12}
                        label="Extractor Prompt (Gemini Flash)"
                        value={formData.extractorPrompt}
                        onChange={handleInputChange('extractorPrompt')}
                        error={!!errors.extractorPrompt}
                        helperText={errors.extractorPrompt || 'Prompt for decision extraction'}
                        placeholder="Enter the prompt for decision extraction..."
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Submit Button */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  startIcon={<PlayArrow />}
                  disabled={loading}
                  sx={{ minWidth: 200 }}
                >
                  {loading ? 'Starting Backtest...' : 'Start Backtest'}
                </Button>
                
                {loading && (
                  <Box sx={{ mt: 2 }}>
                    <LinearProgress />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Initializing backtest simulation...
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>
        </form>
      </Box>
    </LocalizationProvider>
  );
};

export default BacktestPage;
