import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FrameProcessingState {
  isAnalyzing: boolean;
  isGeneratingPrompt: boolean;
  error: string | null;
  retryCount: number;
}

interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  isRunning: boolean;
  canCancel: boolean;
}

export interface UseAIBatchAnalysisReturn {
  analyzeFrame: (frameIndex: number, imageData: string) => Promise<string | null>;
  generatePrompt: (frameIndex: number, imageData: string, imageDescription?: string) => Promise<string | null>;
  analyzeAllFrames: (frames: Array<{ index: number; dataUrl: string }>) => Promise<void>;
  generateAllPrompts: (frames: Array<{ index: number; dataUrl: string; aiDescription?: string }>) => Promise<void>;
  cancelBatchOperation: () => void;
  getFrameState: (frameIndex: number) => FrameProcessingState;
  batchProgress: BatchProgress;
  clearFrameState: (frameIndex: number) => void;
}

class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent = 2;
  private cancelled = false;

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.cancelled) {
        reject(new Error('Operation cancelled'));
        return;
      }

      const wrappedFn = async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      this.queue.push(wrappedFn);
      this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0 || this.cancelled) {
      return;
    }

    this.running++;
    const fn = this.queue.shift()!;
    
    try {
      await fn();
    } catch (error) {
      console.error('Queue processing error:', error);
    } finally {
      this.running--;
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      this.process();
    }
  }

  cancel() {
    this.cancelled = true;
    this.queue.length = 0;
  }

  reset() {
    this.cancelled = false;
    this.queue.length = 0;
    this.running = 0;
  }
}

export function useAIBatchAnalysis(): UseAIBatchAnalysisReturn {
  const [frameStates, setFrameStates] = useState<Map<number, FrameProcessingState>>(new Map());
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    isRunning: false,
    canCancel: false
  });

  const queueRef = useRef<RequestQueue>(new RequestQueue(2));
  const abortControllerRef = useRef<AbortController | null>(null);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const withRetry = async <T>(
    fn: () => Promise<T>, 
    maxRetries = 3, 
    baseDelay = 1000
  ): Promise<T> => {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Operation cancelled');
        }

        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 30000);
        });

        // Race between the actual request and timeout
        const result = await Promise.race([fn(), timeoutPromise]);
        return result;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${attempt + 1} failed:`, error);

        if (attempt === maxRetries) break;

        // Check if it's a rate limit error
        const isRateLimit = lastError.message.includes('rate limit') || 
                           lastError.message.includes('429') ||
                           lastError.message.includes('Too Many Requests');

        if (isRateLimit) {
          // Exponential backoff with longer delays for rate limits
          const delay = baseDelay * Math.pow(2, attempt) + (isRateLimit ? 5000 : 0);
          console.log(`Rate limit detected, waiting ${delay}ms before retry ${attempt + 2}`);
          await sleep(delay);
        } else {
          // Regular exponential backoff
          const delay = baseDelay * Math.pow(2, attempt);
          await sleep(delay);
        }
      }
    }
    
    throw lastError!;
  };

  const updateFrameState = useCallback((frameIndex: number, updates: Partial<FrameProcessingState>) => {
    setFrameStates(prev => {
      const newStates = new Map(prev);
      const currentState = newStates.get(frameIndex) || {
        isAnalyzing: false,
        isGeneratingPrompt: false,
        error: null,
        retryCount: 0
      };
      newStates.set(frameIndex, { ...currentState, ...updates });
      return newStates;
    });
  }, []);

  const clearFrameState = useCallback((frameIndex: number) => {
    setFrameStates(prev => {
      const newStates = new Map(prev);
      newStates.delete(frameIndex);
      return newStates;
    });
  }, []);

  const getFrameState = useCallback((frameIndex: number): FrameProcessingState => {
    return frameStates.get(frameIndex) || {
      isAnalyzing: false,
      isGeneratingPrompt: false,
      error: null,
      retryCount: 0
    };
  }, [frameStates]);

  const analyzeFrame = useCallback(async (frameIndex: number, imageData: string): Promise<string | null> => {
    updateFrameState(frameIndex, { isAnalyzing: true, error: null });
    
    try {
      const result = await withRetry(async () => {
        const { data, error: functionError } = await supabase.functions.invoke('analyze-frame', {
          body: { imageData }
        });

        if (functionError) {
          throw new Error(functionError.message);
        }

        return data?.description || null;
      });

      updateFrameState(frameIndex, { isAnalyzing: false, retryCount: 0 });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze frame';
      updateFrameState(frameIndex, { 
        isAnalyzing: false, 
        error: errorMessage,
        retryCount: getFrameState(frameIndex).retryCount + 1
      });
      console.error(`Frame ${frameIndex} analysis error:`, error);
      return null;
    }
  }, [updateFrameState, getFrameState]);

  const generatePrompt = useCallback(async (
    frameIndex: number, 
    imageData: string, 
    imageDescription?: string
  ): Promise<string | null> => {
    updateFrameState(frameIndex, { isGeneratingPrompt: true, error: null });
    
    try {
      const result = await withRetry(async () => {
        const { data, error: functionError } = await supabase.functions.invoke('generate-prompt', {
          body: { imageData, imageDescription }
        });

        if (functionError) {
          throw new Error(functionError.message);
        }

        return data?.prompt || null;
      });

      updateFrameState(frameIndex, { isGeneratingPrompt: false, retryCount: 0 });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate prompt';
      updateFrameState(frameIndex, { 
        isGeneratingPrompt: false, 
        error: errorMessage,
        retryCount: getFrameState(frameIndex).retryCount + 1
      });
      console.error(`Frame ${frameIndex} prompt generation error:`, error);
      return null;
    }
  }, [updateFrameState, getFrameState]);

  const analyzeAllFrames = useCallback(async (frames: Array<{ index: number; dataUrl: string }>) => {
    if (frames.length === 0) return;

    abortControllerRef.current = new AbortController();
    queueRef.current.reset();
    
    setBatchProgress({
      total: frames.length,
      completed: 0,
      failed: 0,
      isRunning: true,
      canCancel: true
    });

    let completed = 0;
    let failed = 0;

    const updateProgress = () => {
      setBatchProgress(prev => ({
        ...prev,
        completed,
        failed
      }));
    };

    const processFrame = async (frame: { index: number; dataUrl: string }) => {
      try {
        const result = await analyzeFrame(frame.index, frame.dataUrl);
        if (result) {
          completed++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.error(`Failed to analyze frame ${frame.index}:`, error);
      }
      updateProgress();
    };

    try {
      const promises = frames.map(frame => 
        queueRef.current.add(() => processFrame(frame))
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Batch analysis error:', error);
    } finally {
      setBatchProgress(prev => ({
        ...prev,
        isRunning: false,
        canCancel: false
      }));
      abortControllerRef.current = null;
    }
  }, [analyzeFrame]);

  const generateAllPrompts = useCallback(async (
    frames: Array<{ index: number; dataUrl: string; aiDescription?: string }>
  ) => {
    if (frames.length === 0) return;

    abortControllerRef.current = new AbortController();
    queueRef.current.reset();
    
    setBatchProgress({
      total: frames.length,
      completed: 0,
      failed: 0,
      isRunning: true,
      canCancel: true
    });

    let completed = 0;
    let failed = 0;

    const updateProgress = () => {
      setBatchProgress(prev => ({
        ...prev,
        completed,
        failed
      }));
    };

    const processFrame = async (frame: { index: number; dataUrl: string; aiDescription?: string }) => {
      try {
        const result = await generatePrompt(frame.index, frame.dataUrl, frame.aiDescription);
        if (result) {
          completed++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.error(`Failed to generate prompt for frame ${frame.index}:`, error);
      }
      updateProgress();
    };

    try {
      const promises = frames.map(frame => 
        queueRef.current.add(() => processFrame(frame))
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Batch prompt generation error:', error);
    } finally {
      setBatchProgress(prev => ({
        ...prev,
        isRunning: false,
        canCancel: false
      }));
      abortControllerRef.current = null;
    }
  }, [generatePrompt]);

  const cancelBatchOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      queueRef.current.cancel();
      setBatchProgress(prev => ({
        ...prev,
        isRunning: false,
        canCancel: false
      }));
    }
  }, []);

  return {
    analyzeFrame,
    generatePrompt,
    analyzeAllFrames,
    generateAllPrompts,
    cancelBatchOperation,
    getFrameState,
    batchProgress,
    clearFrameState
  };
}