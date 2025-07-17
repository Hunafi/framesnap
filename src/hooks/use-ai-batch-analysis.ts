import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Helper function to generate hash from image data for caching
const generateImageHash = async (imageData: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(imageData.substring(0, 1000)); // Use first 1000 chars for hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

interface FrameProcessingState {
  isAnalyzing: boolean;
  isGeneratingPrompt: boolean;
  error: string | null;
  retryCount: number;
  canStop: boolean;
  isFromCache: boolean;
}

interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  cached: number;
  isRunning: boolean;
  canCancel: boolean;
  currentOperation: string;
  estimatedTimeRemaining: number;
}

export interface UseAIBatchAnalysisReturn {
  analyzeFrame: (frameIndex: number, imageData: string) => Promise<string | null>;
  generatePrompt: (frameIndex: number, imageData: string, imageDescription?: string) => Promise<string | null>;
  analyzeAllFrames: (frames: Array<{ index: number; dataUrl: string }>) => Promise<void>;
  generateAllPrompts: (frames: Array<{ index: number; dataUrl: string; aiDescription?: string }>) => Promise<void>;
  stopFrameProcessing: (frameIndex: number) => void;
  retryFrame: (frameIndex: number, imageData: string, operation: 'analyze' | 'prompt', description?: string) => Promise<void>;
  cancelBatchOperation: () => void;
  pauseBatchOperation: () => void;
  resumeBatchOperation: () => void;
  getFrameState: (frameIndex: number) => FrameProcessingState;
  batchProgress: BatchProgress;
  clearFrameState: (frameIndex: number) => void;
}

class SequentialRequestQueue {
  private queue: Array<{ id: string; fn: () => Promise<any>; resolve: (value: any) => void; reject: (error: any) => void }> = [];
  private isProcessing = false;
  private cancelled = false;
  private paused = false;
  private requestDelay = 2000; // Start with 2 second delay for better stability
  private consecutiveFailures = 0;
  private activeRequests = new Set<string>();

  async add<T>(fn: () => Promise<T>, id: string): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.cancelled) {
        reject(new Error('Operation cancelled'));
        return;
      }

      this.queue.push({ id, fn, resolve, reject });
      this.activeRequests.add(id);
      
      if (!this.isProcessing) {
        this.process();
      }
    });
  }

  stop(id: string) {
    // Remove from queue if not yet started
    const index = this.queue.findIndex(item => item.id === id);
    if (index !== -1) {
      const item = this.queue.splice(index, 1)[0];
      item.reject(new Error('Operation stopped by user'));
    }
    this.activeRequests.delete(id);
  }

  private async process() {
    if (this.isProcessing || this.queue.length === 0 || this.cancelled || this.paused) {
      return;
    }

    this.isProcessing = true;
    
    while (this.queue.length > 0 && !this.cancelled && !this.paused) {
      const item = this.queue.shift()!;
      
      try {
        const result = await item.fn();
        item.resolve(result);
        
        // Reset delay on success
        this.consecutiveFailures = 0;
        this.requestDelay = Math.max(2000, this.requestDelay * 0.9);
        
      } catch (error: any) {
        console.error('Sequential queue processing error:', error);
        item.reject(error);
        
        // Increase delay on failure
        this.consecutiveFailures++;
        if (error.message?.includes('rate limit') || error.message?.includes('429')) {
          this.requestDelay = Math.min(30000, this.requestDelay * 2);
          console.log(`Rate limit detected, increasing delay to ${this.requestDelay}ms`);
        }
      } finally {
        this.activeRequests.delete(item.id);
      }
      
      // Sequential delay between requests
      if (this.queue.length > 0 && !this.cancelled && !this.paused) {
        const adaptiveDelay = this.requestDelay + (this.consecutiveFailures * 1000);
        console.log(`Waiting ${adaptiveDelay}ms before next request...`);
        await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
      }
    }
    
    this.isProcessing = false;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    if (!this.isProcessing) {
      this.process();
    }
  }

  cancel() {
    this.cancelled = true;
    this.queue.forEach(item => item.reject(new Error('Operation cancelled')));
    this.queue.length = 0;
    this.activeRequests.clear();
  }

  reset() {
    this.cancelled = false;
    this.paused = false;
    this.queue.length = 0;
    this.isProcessing = false;
    this.consecutiveFailures = 0;
    this.requestDelay = 2000;
    this.activeRequests.clear();
  }
}

export function useAIBatchAnalysis(): UseAIBatchAnalysisReturn {
  const [frameStates, setFrameStates] = useState<Map<number, FrameProcessingState>>(new Map());
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    cached: 0,
    isRunning: false,
    canCancel: false,
    currentOperation: '',
    estimatedTimeRemaining: 0
  });

  const queueRef = useRef<SequentialRequestQueue>(new SequentialRequestQueue());
  const abortControllerRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);

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

        // Enhanced rate limit detection
        const isRateLimit = lastError.message.includes('rate limit') || 
                           lastError.message.includes('429') ||
                           lastError.message.includes('Too Many Requests') ||
                           lastError.message.includes('Rate limit exceeded');

        if (isRateLimit) {
          // Extract retry-after value if available
          const retryAfterMatch = lastError.message.match(/Retry after: (\d+)/);
          const retryAfterSeconds = retryAfterMatch ? parseInt(retryAfterMatch[1]) : 0;
          
          // Use retry-after if available, otherwise exponential backoff with jitter
          const baseRateDelay = retryAfterSeconds * 1000 || 10000;
          const jitter = Math.random() * 2000; // Add randomness to avoid thundering herd
          const delay = baseRateDelay + (baseDelay * Math.pow(2, attempt)) + jitter;
          
          console.log(`Rate limit detected, waiting ${Math.round(delay)}ms before retry ${attempt + 2}`);
          await sleep(delay);
        } else {
          // Regular exponential backoff with jitter
          const jitter = Math.random() * 1000;
          const delay = baseDelay * Math.pow(2, attempt) + jitter;
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
        retryCount: 0,
        canStop: false,
        isFromCache: false
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
      retryCount: 0,
      canStop: false,
      isFromCache: false
    };
  }, [frameStates]);

  const analyzeFrame = useCallback(async (frameIndex: number, imageData: string): Promise<string | null> => {
    updateFrameState(frameIndex, { isAnalyzing: true, error: null, canStop: true });
    
    try {
      // Check cache first
      const imageHash = await generateImageHash(imageData);
      
      const { data: cachedData } = await supabase
        .from('frame_analysis_cache')
        .select('ai_description')
        .eq('image_hash', imageHash)
        .maybeSingle();
      
      if (cachedData?.ai_description) {
        console.log(`Using cached description for frame ${frameIndex}`);
        updateFrameState(frameIndex, { 
          isAnalyzing: false, 
          retryCount: 0,
          canStop: false,
          isFromCache: true 
        });
        return cachedData.ai_description;
      }

      const result = await withRetry(async () => {
        const { data, error: functionError } = await supabase.functions.invoke('analyze-frame', {
          body: { imageData }
        });

        if (functionError) {
          throw new Error(functionError.message);
        }

        return data?.description || null;
      });

      // Cache the result if successful
      if (result) {
        try {
          await supabase
            .from('frame_analysis_cache')
            .insert({
              image_hash: imageHash,
              ai_description: result
            });
        } catch (cacheError) {
          console.warn('Failed to cache analysis result:', cacheError);
        }
      }

      updateFrameState(frameIndex, { 
        isAnalyzing: false, 
        retryCount: 0,
        canStop: false,
        isFromCache: false 
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze frame';
      updateFrameState(frameIndex, { 
        isAnalyzing: false, 
        error: errorMessage,
        retryCount: getFrameState(frameIndex).retryCount + 1,
        canStop: false
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
    updateFrameState(frameIndex, { isGeneratingPrompt: true, error: null, canStop: true });
    
    try {
      const result = await withRetry(async () => {
        // Use text-only mode when description is available (more efficient)
        const requestBody = imageDescription 
          ? { imageDescription } // Text-only request
          : { imageData, imageDescription }; // Fallback to image analysis

        const { data, error: functionError } = await supabase.functions.invoke('generate-prompt', {
          body: requestBody
        });

        if (functionError) {
          throw new Error(functionError.message);
        }

        return data?.prompt || null;
      });

      updateFrameState(frameIndex, { 
        isGeneratingPrompt: false, 
        retryCount: 0,
        canStop: false 
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate prompt';
      updateFrameState(frameIndex, { 
        isGeneratingPrompt: false, 
        error: errorMessage,
        retryCount: getFrameState(frameIndex).retryCount + 1,
        canStop: false
      });
      console.error(`Frame ${frameIndex} prompt generation error:`, error);
      return null;
    }
  }, [updateFrameState, getFrameState]);

  const analyzeAllFrames = useCallback(async (frames: Array<{ index: number; dataUrl: string }>) => {
    if (frames.length === 0) return;

    abortControllerRef.current = new AbortController();
    queueRef.current.reset();
    startTimeRef.current = Date.now();
    
    setBatchProgress({
      total: frames.length,
      completed: 0,
      failed: 0,
      cached: 0,
      isRunning: true,
      canCancel: true,
      currentOperation: 'Analyzing frames...',
      estimatedTimeRemaining: 0
    });

    let completed = 0;
    let failed = 0;
    let cached = 0;

    const updateProgress = (frameIndex?: number) => {
      const totalProcessed = completed + failed + cached;
      const elapsedTime = Date.now() - startTimeRef.current;
      const averageTimePerFrame = totalProcessed > 0 ? elapsedTime / totalProcessed : 0;
      const remainingFrames = frames.length - totalProcessed;
      const estimatedTimeRemaining = remainingFrames * averageTimePerFrame;

      setBatchProgress(prev => ({
        ...prev,
        completed,
        failed,
        cached,
        currentOperation: frameIndex ? `Analyzing frame ${frameIndex}...` : 'Analyzing frames...',
        estimatedTimeRemaining
      }));
    };

    const processFrame = async (frame: { index: number; dataUrl: string }) => {
      try {
        updateProgress(frame.index);
        const frameState = getFrameState(frame.index);
        const result = await analyzeFrame(frame.index, frame.dataUrl);
        
        if (result) {
          if (frameState.isFromCache) {
            cached++;
          } else {
            completed++;
          }
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
      // Process frames sequentially
      for (const frame of frames) {
        if (abortControllerRef.current?.signal.aborted) break;
        
        await queueRef.current.add(
          () => processFrame(frame),
          `analyze-${frame.index}`
        );
      }
    } catch (error) {
      console.error('Batch analysis error:', error);
    } finally {
      setBatchProgress(prev => ({
        ...prev,
        isRunning: false,
        canCancel: false,
        currentOperation: 'Complete'
      }));
      abortControllerRef.current = null;
    }
  }, [analyzeFrame, getFrameState]);

  const generateAllPrompts = useCallback(async (
    frames: Array<{ index: number; dataUrl: string; aiDescription?: string }>
  ) => {
    if (frames.length === 0) return;

    abortControllerRef.current = new AbortController();
    queueRef.current.reset();
    startTimeRef.current = Date.now();
    
    setBatchProgress({
      total: frames.length,
      completed: 0,
      failed: 0,
      cached: 0,
      isRunning: true,
      canCancel: true,
      currentOperation: 'Generating prompts...',
      estimatedTimeRemaining: 0
    });

    let completed = 0;
    let failed = 0;

    const updateProgress = (frameIndex?: number) => {
      const totalProcessed = completed + failed;
      const elapsedTime = Date.now() - startTimeRef.current;
      const averageTimePerFrame = totalProcessed > 0 ? elapsedTime / totalProcessed : 0;
      const remainingFrames = frames.length - totalProcessed;
      const estimatedTimeRemaining = remainingFrames * averageTimePerFrame;

      setBatchProgress(prev => ({
        ...prev,
        completed,
        failed,
        currentOperation: frameIndex ? `Generating prompt for frame ${frameIndex}...` : 'Generating prompts...',
        estimatedTimeRemaining
      }));
    };

    const processFrame = async (frame: { index: number; dataUrl: string; aiDescription?: string }) => {
      try {
        updateProgress(frame.index);
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
      // Process frames sequentially
      for (const frame of frames) {
        if (abortControllerRef.current?.signal.aborted) break;
        
        await queueRef.current.add(
          () => processFrame(frame),
          `prompt-${frame.index}`
        );
      }
    } catch (error) {
      console.error('Batch prompt generation error:', error);
    } finally {
      setBatchProgress(prev => ({
        ...prev,
        isRunning: false,
        canCancel: false,
        currentOperation: 'Complete'
      }));
      abortControllerRef.current = null;
    }
  }, [generatePrompt]);

  const stopFrameProcessing = useCallback((frameIndex: number) => {
    queueRef.current.stop(`analyze-${frameIndex}`);
    queueRef.current.stop(`prompt-${frameIndex}`);
    updateFrameState(frameIndex, { 
      isAnalyzing: false, 
      isGeneratingPrompt: false,
      canStop: false,
      error: 'Stopped by user'
    });
  }, [updateFrameState]);

  const retryFrame = useCallback(async (
    frameIndex: number, 
    imageData: string, 
    operation: 'analyze' | 'prompt',
    description?: string
  ) => {
    clearFrameState(frameIndex);
    
    if (operation === 'analyze') {
      await analyzeFrame(frameIndex, imageData);
    } else {
      await generatePrompt(frameIndex, imageData, description);
    }
  }, [analyzeFrame, generatePrompt, clearFrameState]);

  const pauseBatchOperation = useCallback(() => {
    queueRef.current.pause();
    setBatchProgress(prev => ({
      ...prev,
      currentOperation: 'Paused'
    }));
  }, []);

  const resumeBatchOperation = useCallback(() => {
    queueRef.current.resume();
    setBatchProgress(prev => ({
      ...prev,
      currentOperation: 'Resuming...'
    }));
  }, []);

  const cancelBatchOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      queueRef.current.cancel();
      setBatchProgress(prev => ({
        ...prev,
        isRunning: false,
        canCancel: false,
        currentOperation: 'Cancelled'
      }));
    }
  }, []);

  return {
    analyzeFrame,
    generatePrompt,
    analyzeAllFrames,
    generateAllPrompts,
    stopFrameProcessing,
    retryFrame,
    cancelBatchOperation,
    pauseBatchOperation,
    resumeBatchOperation,
    getFrameState,
    batchProgress,
    clearFrameState
  };
}