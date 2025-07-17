import { useState, useCallback, useRef } from 'react';

interface TokenUsageData {
  requestsPerMinute: number;
  tokensPerMinute: number;
  remainingTokens: number;
  resetTime: number;
  lastUpdated: number;
}

interface TokenEstimate {
  analysisTokens: number;
  promptTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

interface BudgetStatus {
  canProceed: boolean;
  suggestedDelay: number;
  recommendedBatchSize: number;
  reasoning: string;
}

export interface UseTokenBudgetManagerReturn {
  updateTokenUsage: (headers: Record<string, string>) => void;
  estimateTokensForBatch: (frameCount: number, hasDescriptions?: boolean) => TokenEstimate;
  checkBudgetStatus: (requestedTokens: number) => BudgetStatus;
  getRemainingBudget: () => { tokens: number; timeToReset: number };
  getOptimalBatchSize: (totalFrames: number) => number;
  shouldThrottle: () => boolean;
  getUsageStats: () => TokenUsageData | null;
}

const TOKENS_PER_MINUTE_LIMIT = 200000;
const ANALYSIS_TOKENS_PER_FRAME = 1500; // Conservative estimate for image analysis
const PROMPT_TOKENS_PER_FRAME = 400; // Conservative estimate for prompt generation
const TOKEN_SAFETY_BUFFER = 10000; // Keep some buffer before hitting limit

export function useTokenBudgetManager(): UseTokenBudgetManagerReturn {
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const lastRequestTime = useRef<number>(0);

  const updateTokenUsage = useCallback((headers: Record<string, string>) => {
    const now = Date.now();
    const remaining = parseInt(headers['x-ratelimit-remaining-tokens']) || 0;
    const reset = headers['x-ratelimit-reset-tokens'];
    
    // Parse reset time (could be in various formats)
    let resetTime = 0;
    if (reset) {
      if (reset.includes('s')) {
        // Format like "1m30s" or "45s"
        const match = reset.match(/(?:(\d+)m)?(?:(\d+)s)?/);
        if (match) {
          const minutes = parseInt(match[1] || '0');
          const seconds = parseInt(match[2] || '0');
          resetTime = now + (minutes * 60 + seconds) * 1000;
        }
      } else {
        // Assume it's seconds from now
        resetTime = now + parseInt(reset) * 1000;
      }
    }

    setTokenUsage(prev => {
      const timeSinceLastUpdate = prev ? now - prev.lastUpdated : 0;
      const tokensUsed = prev ? Math.max(0, prev.remainingTokens - remaining) : 0;
      
      return {
        requestsPerMinute: prev ? prev.requestsPerMinute + 1 : 1,
        tokensPerMinute: prev ? prev.tokensPerMinute + tokensUsed : tokensUsed,
        remainingTokens: remaining,
        resetTime,
        lastUpdated: now
      };
    });
  }, []);

  const estimateTokensForBatch = useCallback((frameCount: number, hasDescriptions = false): TokenEstimate => {
    // If we already have descriptions, prompt generation is much cheaper
    const analysisTokens = hasDescriptions ? 0 : frameCount * ANALYSIS_TOKENS_PER_FRAME;
    const promptTokens = frameCount * (hasDescriptions ? 200 : PROMPT_TOKENS_PER_FRAME); // Cheaper when we have descriptions
    const totalTokens = analysisTokens + promptTokens;
    
    // Rough cost estimate (GPT-4o-mini pricing)
    const estimatedCost = (totalTokens / 1000) * 0.00015; // $0.15 per 1k tokens
    
    return {
      analysisTokens,
      promptTokens,
      totalTokens,
      estimatedCost
    };
  }, []);

  const checkBudgetStatus = useCallback((requestedTokens: number): BudgetStatus => {
    if (!tokenUsage) {
      return {
        canProceed: true,
        suggestedDelay: 0,
        recommendedBatchSize: 10,
        reasoning: 'No usage data available, proceeding with caution'
      };
    }

    const now = Date.now();
    const timeToReset = Math.max(0, tokenUsage.resetTime - now);
    const availableTokens = tokenUsage.remainingTokens - TOKEN_SAFETY_BUFFER;

    // Check if we have enough tokens
    if (requestedTokens > availableTokens) {
      const batchSize = Math.floor(availableTokens / ANALYSIS_TOKENS_PER_FRAME);
      return {
        canProceed: batchSize > 0,
        suggestedDelay: timeToReset + 1000, // Wait until reset + 1 second
        recommendedBatchSize: Math.max(1, batchSize),
        reasoning: `Insufficient tokens. Have ${availableTokens}, need ${requestedTokens}. ${batchSize > 0 ? `Can process ${batchSize} frames.` : 'Wait for reset.'}`
      };
    }

    // Check if we're approaching the rate limit too quickly
    const tokensPerSecond = tokenUsage.tokensPerMinute / 60;
    const projectedUsage = tokensPerSecond * 60; // Project next minute
    
    if (projectedUsage + requestedTokens > TOKENS_PER_MINUTE_LIMIT) {
      const safeDelay = Math.ceil((requestedTokens / (TOKENS_PER_MINUTE_LIMIT * 0.8)) * 60000); // Spread over time
      return {
        canProceed: true,
        suggestedDelay: safeDelay,
        recommendedBatchSize: Math.floor(availableTokens / ANALYSIS_TOKENS_PER_FRAME * 0.5), // Conservative batch size
        reasoning: `High usage detected. Suggested delay: ${Math.round(safeDelay/1000)}s to avoid rate limits`
      };
    }

    return {
      canProceed: true,
      suggestedDelay: 0,
      recommendedBatchSize: Math.floor(availableTokens / ANALYSIS_TOKENS_PER_FRAME),
      reasoning: 'Good to proceed'
    };
  }, [tokenUsage]);

  const getRemainingBudget = useCallback(() => {
    if (!tokenUsage) {
      return { tokens: TOKENS_PER_MINUTE_LIMIT, timeToReset: 0 };
    }

    const now = Date.now();
    const timeToReset = Math.max(0, tokenUsage.resetTime - now);
    
    return {
      tokens: Math.max(0, tokenUsage.remainingTokens - TOKEN_SAFETY_BUFFER),
      timeToReset
    };
  }, [tokenUsage]);

  const getOptimalBatchSize = useCallback((totalFrames: number): number => {
    const budget = getRemainingBudget();
    const tokensPerFrame = ANALYSIS_TOKENS_PER_FRAME;
    const maxFrames = Math.floor(budget.tokens / tokensPerFrame);
    
    // Conservative approach: process in chunks of 25% of available budget
    const conservativeBatchSize = Math.floor(maxFrames * 0.25);
    
    return Math.max(1, Math.min(totalFrames, conservativeBatchSize, 10)); // Cap at 10 for manageable batches
  }, [getRemainingBudget]);

  const shouldThrottle = useCallback((): boolean => {
    if (!tokenUsage) return false;
    
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime.current;
    
    // If we're using tokens very quickly, throttle
    const tokensPerSecond = tokenUsage.tokensPerMinute / 60;
    const isHighUsage = tokensPerSecond > (TOKENS_PER_MINUTE_LIMIT * 0.8) / 60;
    
    // Require minimum delay between requests if usage is high
    const requiredDelay = isHighUsage ? 3000 : 1000;
    
    return timeSinceLastRequest < requiredDelay;
  }, [tokenUsage]);

  const getUsageStats = useCallback((): TokenUsageData | null => {
    return tokenUsage;
  }, [tokenUsage]);

  return {
    updateTokenUsage,
    estimateTokensForBatch,
    checkBudgetStatus,
    getRemainingBudget,
    getOptimalBatchSize,
    shouldThrottle,
    getUsageStats
  };
}