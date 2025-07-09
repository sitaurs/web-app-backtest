import axios, { AxiosResponse } from 'axios';
import config from '../utils/configUtils';
import logger from '../utils/logger';
import { OHLCVCandle } from '../models/Trade';
import { MultiChartResponse } from './chartService';

export interface AIAnalysisRequest {
  symbol: string;
  ohlcvData: {
    h1: OHLCVCandle[];
    m15: OHLCVCandle[];
    m5: OHLCVCandle[];
  };
  chartImages: MultiChartResponse;
  analysisPrompt: string;
  extractorPrompt: string;
  timestamp: Date;
}

export interface AIAnalysisResponse {
  success: boolean;
  analysisId: string;
  stage1Response?: {
    narrative: string;
    confidence: number;
    reasoning: string;
  };
  stage2Response?: {
    decision: 'TRADE' | 'NO_TRADE';
    tradeDetails?: {
      type: 'BUY' | 'SELL';
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      lotSize: number;
    };
    confidence: number;
    reasoning: string;
  };
  error?: string;
  processingTime: number;
}

export interface GeminiPayload {
  contents: Array<{
    parts: Array<{
      text?: string;
      inline_data?: {
        mime_type: string;
        data: string;
      };
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

export class AIService {
  private static readonly GEMINI_PRO_URL = config.externalApis.geminiProUrl;
  private static readonly GEMINI_FLASH_URL = config.externalApis.geminiFlashUrl;
  private static readonly REQUEST_TIMEOUT = 60000; // 60 seconds
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_DELAY = 3000; // 3 seconds

  /**
   * Perform two-stage AI analysis as specified in requirements
   */
  static async performAnalysis(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const startTime = Date.now();
    const analysisId = this.generateAnalysisId();

    logger.info('Starting AI analysis', {
      analysisId,
      symbol: request.symbol,
      timestamp: request.timestamp.toISOString()
    });

    try {
      // Stage 1: Contextual Analysis with Gemini Pro
      const stage1Response = await this.performStage1Analysis(request, analysisId);
      
      if (!stage1Response.success) {
        throw new Error(`Stage 1 failed: ${stage1Response.error}`);
      }

      // Stage 2: Decision Extraction with Gemini Flash
      const stage2Response = await this.performStage2Analysis(
        stage1Response.narrative!,
        request.extractorPrompt,
        analysisId
      );

      if (!stage2Response.success) {
        throw new Error(`Stage 2 failed: ${stage2Response.error}`);
      }

      const processingTime = Date.now() - startTime;

      logger.info('AI analysis completed successfully', {
        analysisId,
        symbol: request.symbol,
        decision: stage2Response.decision,
        processingTime
      });

      return {
        success: true,
        analysisId,
        stage1Response: {
          narrative: stage1Response.narrative!,
          confidence: stage1Response.confidence!,
          reasoning: stage1Response.reasoning!
        },
        stage2Response: {
          decision: stage2Response.decision!,
          tradeDetails: stage2Response.tradeDetails,
          confidence: stage2Response.confidence!,
          reasoning: stage2Response.reasoning!
        },
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('AI analysis failed', {
        analysisId,
        symbol: request.symbol,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      return {
        success: false,
        analysisId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      };
    }
  }

  /**
   * Stage 1: Multi-modal contextual analysis with Gemini Pro
   */
  private static async performStage1Analysis(
    request: AIAnalysisRequest,
    analysisId: string
  ): Promise<{
    success: boolean;
    narrative?: string;
    confidence?: number;
    reasoning?: string;
    error?: string;
  }> {
    try {
      logger.debug('Starting Stage 1 analysis', { analysisId });

      // Build multi-modal payload
      const payload = this.buildStage1Payload(request);
      
      // Make request to Gemini Pro
      const response = await this.makeGeminiRequest(
        this.GEMINI_PRO_URL,
        payload,
        config.apiKeys.geminiPro
      );

      // Parse response
      const narrative = this.extractTextFromGeminiResponse(response.data);
      
      if (!narrative) {
        throw new Error('No narrative received from Gemini Pro');
      }

      // Extract confidence and reasoning (basic parsing)
      const { confidence, reasoning } = this.parseStage1Response(narrative);

      logger.debug('Stage 1 analysis completed', {
        analysisId,
        narrativeLength: narrative.length,
        confidence
      });

      return {
        success: true,
        narrative,
        confidence,
        reasoning
      };

    } catch (error) {
      logger.error('Stage 1 analysis failed', {
        analysisId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Stage 2: Decision extraction with Gemini Flash
   */
  private static async performStage2Analysis(
    narrative: string,
    extractorPrompt: string,
    analysisId: string
  ): Promise<{
    success: boolean;
    decision?: 'TRADE' | 'NO_TRADE';
    tradeDetails?: any;
    confidence?: number;
    reasoning?: string;
    error?: string;
  }> {
    try {
      logger.debug('Starting Stage 2 analysis', { analysisId });

      // Build extraction payload
      const payload = this.buildStage2Payload(narrative, extractorPrompt);
      
      // Make request to Gemini Flash
      const response = await this.makeGeminiRequest(
        this.GEMINI_FLASH_URL,
        payload,
        config.apiKeys.geminiFlash
      );

      // Parse response
      const extractedText = this.extractTextFromGeminiResponse(response.data);
      
      if (!extractedText) {
        throw new Error('No response received from Gemini Flash');
      }

      // Parse decision and trade details
      const parsedResult = this.parseStage2Response(extractedText);

      logger.debug('Stage 2 analysis completed', {
        analysisId,
        decision: parsedResult.decision,
        confidence: parsedResult.confidence
      });

      return {
        success: true,
        ...parsedResult
      };

    } catch (error) {
      logger.error('Stage 2 analysis failed', {
        analysisId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Build Stage 1 payload with multi-modal data
   */
  private static buildStage1Payload(request: AIAnalysisRequest): GeminiPayload {
    const parts: any[] = [];

    // Add analysis prompt
    parts.push({
      text: this.buildContextualPrompt(request)
    });

    // Add chart images if available
    if (request.chartImages.image1h.success && request.chartImages.image1h.imageBase64) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: request.chartImages.image1h.imageBase64
        }
      });
    }

    if (request.chartImages.image5m.success && request.chartImages.image5m.imageBase64) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: request.chartImages.image5m.imageBase64
        }
      });
    }

    if (request.chartImages.image15m_ema.success && request.chartImages.image15m_ema.imageBase64) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: request.chartImages.image15m_ema.imageBase64
        }
      });
    }

    if (request.chartImages.image15m_bb.success && request.chartImages.image15m_bb.imageBase64) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: request.chartImages.image15m_bb.imageBase64
        }
      });
    }

    return {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048
      }
    };
  }

  /**
   * Build Stage 2 payload for decision extraction
   */
  private static buildStage2Payload(narrative: string, extractorPrompt: string): GeminiPayload {
    const combinedPrompt = `${extractorPrompt}\n\nAnalysis to extract from:\n${narrative}`;

    return {
      contents: [{
        parts: [{
          text: combinedPrompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 512
      }
    };
  }

  /**
   * Build contextual prompt with OHLCV data
   */
  private static buildContextualPrompt(request: AIAnalysisRequest): string {
    const ohlcvSummary = this.summarizeOHLCVData(request.ohlcvData);
    
    return `${request.analysisPrompt}

Symbol: ${request.symbol}
Analysis Time: ${request.timestamp.toISOString()}

OHLCV Data Summary:
${ohlcvSummary}

Please analyze the provided chart images and OHLCV data to provide a comprehensive market analysis. Consider:
1. Multi-timeframe trend analysis
2. Key support and resistance levels
3. Technical indicator signals
4. Market momentum and volatility
5. Potential trading opportunities

Provide a detailed narrative analysis with your reasoning and confidence level.`;
  }

  /**
   * Summarize OHLCV data for prompt
   */
  private static summarizeOHLCVData(ohlcvData: {
    h1: OHLCVCandle[];
    m15: OHLCVCandle[];
    m5: OHLCVCandle[];
  }): string {
    const summaries: string[] = [];

    Object.entries(ohlcvData).forEach(([timeframe, candles]) => {
      if (candles.length > 0) {
        const latest = candles[candles.length - 1];
        const first = candles[0];
        const high = Math.max(...candles.map(c => c.high));
        const low = Math.min(...candles.map(c => c.low));
        
        summaries.push(
          `${timeframe.toUpperCase()}: ${candles.length} candles, ` +
          `Range: ${first.open} to ${latest.close}, ` +
          `High: ${high}, Low: ${low}`
        );
      }
    });

    return summaries.join('\n');
  }

  /**
   * Make request to Gemini API
   */
  private static async makeGeminiRequest(
    url: string,
    payload: GeminiPayload,
    apiKey: string,
    retryCount: number = 0
  ): Promise<AxiosResponse> {
    try {
      const response = await axios.post(`${url}?key=${apiKey}`, payload, {
        timeout: this.REQUEST_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Forex-Backtest-Platform/1.0'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;

    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        logger.warn(`Gemini request failed, retrying (${retryCount + 1}/${this.MAX_RETRIES})`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        await this.delay(this.RETRY_DELAY * (retryCount + 1));
        return this.makeGeminiRequest(url, payload, apiKey, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Extract text from Gemini API response
   */
  private static extractTextFromGeminiResponse(responseData: any): string | null {
    try {
      if (responseData?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return responseData.candidates[0].content.parts[0].text;
      }
      return null;
    } catch (error) {
      logger.error('Failed to extract text from Gemini response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        responseData
      });
      return null;
    }
  }

  /**
   * Parse Stage 1 response for confidence and reasoning
   */
  private static parseStage1Response(narrative: string): {
    confidence: number;
    reasoning: string;
  } {
    // Basic parsing - can be enhanced with more sophisticated NLP
    let confidence = 50; // Default confidence
    let reasoning = 'General market analysis';

    // Look for confidence indicators
    const confidenceMatch = narrative.match(/confidence[:\s]+(\d+)%?/i);
    if (confidenceMatch) {
      confidence = parseInt(confidenceMatch[1]);
    }

    // Extract key reasoning points
    const reasoningPatterns = [
      /because\s+(.+?)[\.\n]/gi,
      /due to\s+(.+?)[\.\n]/gi,
      /indicates?\s+(.+?)[\.\n]/gi
    ];

    const reasoningPoints: string[] = [];
    reasoningPatterns.forEach(pattern => {
      const matches = narrative.match(pattern);
      if (matches) {
        reasoningPoints.push(...matches.slice(0, 3)); // Limit to 3 points
      }
    });

    if (reasoningPoints.length > 0) {
      reasoning = reasoningPoints.join('; ');
    }

    return { confidence, reasoning };
  }

  /**
   * Parse Stage 2 response for trading decision
   */
  private static parseStage2Response(extractedText: string): {
    decision: 'TRADE' | 'NO_TRADE';
    tradeDetails?: any;
    confidence: number;
    reasoning: string;
  } {
    const text = extractedText.toUpperCase();
    
    // Determine decision
    const decision: 'TRADE' | 'NO_TRADE' = text.includes('TRADE') && !text.includes('NO_TRADE') 
      ? 'TRADE' 
      : 'NO_TRADE';

    let tradeDetails = undefined;
    let confidence = 50;
    let reasoning = 'AI decision based on analysis';

    if (decision === 'TRADE') {
      // Parse trade details
      tradeDetails = this.parseTradeDetails(extractedText);
    }

    // Parse confidence
    const confidenceMatch = extractedText.match(/confidence[:\s]+(\d+)%?/i);
    if (confidenceMatch) {
      confidence = parseInt(confidenceMatch[1]);
    }

    // Extract reasoning
    const reasoningMatch = extractedText.match(/reason[:\s]+(.+?)[\.\n]/i);
    if (reasoningMatch) {
      reasoning = reasoningMatch[1].trim();
    }

    return {
      decision,
      tradeDetails,
      confidence,
      reasoning
    };
  }

  /**
   * Parse trade details from extracted text
   */
  private static parseTradeDetails(text: string): any {
    const details: any = {};

    // Parse trade type
    if (text.toUpperCase().includes('BUY')) {
      details.type = 'BUY';
    } else if (text.toUpperCase().includes('SELL')) {
      details.type = 'SELL';
    }

    // Parse prices (basic regex patterns)
    const entryMatch = text.match(/entry[:\s]+([0-9.]+)/i);
    if (entryMatch) {
      details.entryPrice = parseFloat(entryMatch[1]);
    }

    const slMatch = text.match(/(?:stop.?loss|sl)[:\s]+([0-9.]+)/i);
    if (slMatch) {
      details.stopLoss = parseFloat(slMatch[1]);
    }

    const tpMatch = text.match(/(?:take.?profit|tp)[:\s]+([0-9.]+)/i);
    if (tpMatch) {
      details.takeProfit = parseFloat(tpMatch[1]);
    }

    const lotMatch = text.match(/(?:lot.?size|lots?)[:\s]+([0-9.]+)/i);
    if (lotMatch) {
      details.lotSize = parseFloat(lotMatch[1]);
    } else {
      details.lotSize = 0.1; // Default lot size
    }

    return Object.keys(details).length > 0 ? details : undefined;
  }

  /**
   * Generate unique analysis ID
   */
  private static generateAnalysisId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility function for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate AI service configuration
   */
  static validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKeys.geminiPro) {
      errors.push('Gemini Pro API key is missing');
    }

    if (!config.apiKeys.geminiFlash) {
      errors.push('Gemini Flash API key is missing');
    }

    if (!this.GEMINI_PRO_URL) {
      errors.push('Gemini Pro URL is missing');
    }

    if (!this.GEMINI_FLASH_URL) {
      errors.push('Gemini Flash URL is missing');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get AI service statistics
   */
  static getServiceStats(): {
    totalAnalyses: number;
    successfulAnalyses: number;
    failedAnalyses: number;
    averageProcessingTime: number;
    stage1SuccessRate: number;
    stage2SuccessRate: number;
  } {
    // This would typically be stored in a database or cache
    // For now, return mock data
    return {
      totalAnalyses: 0,
      successfulAnalyses: 0,
      failedAnalyses: 0,
      averageProcessingTime: 0,
      stage1SuccessRate: 0,
      stage2SuccessRate: 0
    };
  }
}

export default AIService;
