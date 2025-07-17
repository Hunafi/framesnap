import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTokenBudgetManager } from './use-token-budget-manager';
import { useAdvancedRequestManager } from './use-advanced-request-manager';

interface FrameTask {
  frameIndex: number;
  imageData: string;
  operation: 'analyze' | 'prompt';
  imageDescription?: string;
  priority: number;
  retryCount: number;
}

interface ProcessingState {
  isAnalyzing: boolean;
  isGeneratingPrompt: boolean;
  error: string | null;
  retryCount: number;
  canStop: boolean;
  isFromCache: boolean;
  progress: number;
}

export interface SmartBatchProgress {
  phase: 'idle' | 'planning' | 'processing' | 'paused' | 'complete';
  currentBatch: number;
  totalBatches: number;
  currentBatchSize: number;
  framesInCurrentBatch: number;
  totalFrames: number;
  completedFrames: number;
  failedFrames: number;
  cachedFrames: number;
  estimatedTimeRemaining: number;
  tokenBudgetUsed: number;
  tokenBudgetRemaining: number;
  processingSpeed: number; // frames per minute
  adaptiveDelayMs: number;
  qualityProfile: 'conservative' | 'balanced' | 'aggressive';
}

export interface UseSmartAIProcessorReturn {
  processFrames: (frames: Array<{ index: number; dataUrl: string; operation: 'analyze' | 'prompt'; imageDescription?: string }>, profile?: 'conservative' | 'balanced' | 'aggressive') => Promise<void>;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  stopProcessing: () => void;
  retryFailedFrames: () => Promise<void>;
  getFrameState: (frameIndex: number) => ProcessingState;
  getProgress: () => SmartBatchProgress;
  setQualityProfile: (profile: 'conservative' | 'balanced' | 'aggressive') => void;
  clearFrameState: (frameIndex: number) => void;
}

const generateImageHash = async (imageData: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(imageData.substring(0, 1000));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export function useSmartAIProcessor(): UseSmartAIProcessorReturn {
  const [frameStates, setFrameStates] = useState<Map<number, ProcessingState>>(new Map());
  const [progress, setProgress] = useState<SmartBatchProgress>({
    phase: 'idle',
    currentBatch: 0,
    totalBatches: 0,
    currentBatchSize: 0,
    framesInCurrentBatch: 0,
    totalFrames: 0,
    completedFrames: 0,
    failedFrames: 0,
    cachedFrames: 0,
    estimatedTimeRemaining: 0,
    tokenBudgetUsed: 0,
    tokenBudgetRemaining: 0,
    processingSpeed: 0,
    adaptiveDelayMs: 2000,
    qualityProfile: 'balanced'
  });

  const tokenManager = useTokenBudgetManager();
  const requestManager = useAdvancedRequestManager();
  
  const taskQueue = useRef<FrameTask[]>([]);
  const isPaused = useRef(false);
  const isProcessing = useRef(false);
  const processingStartTime = useRef<number>(0);
  const failedTasks = useRef<FrameTask[]>([]);

  // Configure request manager based on quality profile
  useEffect(() => {
    const concurrencyLimits = {
      conservative: 1,
      balanced: 2,
      aggressive: 3
    };
    requestManager.setMaxConcurrency(concurrencyLimits[progress.qualityProfile]);
  }, [progress.qualityProfile, requestManager]);

  const updateFrameState = useCallback((frameIndex: number, updates: Partial<ProcessingState>) => {
    setFrameStates(prev => {
      const newStates = new Map(prev);
      const current = newStates.get(frameIndex) || {
        isAnalyzing: false,
        isGeneratingPrompt: false,
        error: null,
        retryCount: 0,
        canStop: false,
        isFromCache: false,
        progress: 0
      };
      newStates.set(frameIndex, { ...current, ...updates });
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

  const getFrameState = useCallback((frameIndex: number): ProcessingState => {
    return frameStates.get(frameIndex) || {
      isAnalyzing: false,
      isGeneratingPrompt: false,
      error: null,
      retryCount: 0,
      canStop: false,
      isFromCache: false,
      progress: 0
    };
  }, [frameStates]);

  const analyzeFrame = useCallback(async (frameIndex: number, imageData: string): Promise<string | null> => {
    updateFrameState(frameIndex, { isAnalyzing: true, error: null, canStop: true, progress: 10 });
    
    try {
      // Check cache first
      const imageHash = await generateImageHash(imageData);
      updateFrameState(frameIndex, { progress: 20 });
      
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
          isFromCache: true,
          progress: 100
        });
        return cachedData.ai_description;
      }

      updateFrameState(frameIndex, { progress: 30 });

      const result = await requestManager.submitRequest(async () => {
        updateFrameState(frameIndex, { progress: 60 });
        
        const { data, error: functionError } = await supabase.functions.invoke('analyze-frame', {
          body: { imageData }
        });

        if (functionError) {
          throw new Error(functionError.message);
        }

        updateFrameState(frameIndex, { progress: 90 });
        return data?.description || null;
      }, `analyze-${frameIndex}`);

      // Update token usage from response headers
      // Note: This would need to be implemented in the edge function to return headers
      
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
        isFromCache: false,
        progress: 100
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze frame';
      updateFrameState(frameIndex, { 
        isAnalyzing: false, 
        error: errorMessage,
        retryCount: getFrameState(frameIndex).retryCount + 1,
        canStop: false,
        progress: 0
      });
      console.error(`Frame ${frameIndex} analysis error:`, error);
      throw error;
    }
  }, [updateFrameState, getFrameState, requestManager]);

  const generatePrompt = useCallback(async (
    frameIndex: number, 
    imageData: string, 
    imageDescription?: string
  ): Promise<string | null> => {
    updateFrameState(frameIndex, { isGeneratingPrompt: true, error: null, canStop: true, progress: 10 });
    
    try {
      const result = await requestManager.submitRequest(async () => {
        updateFrameState(frameIndex, { progress: 50 });
        
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

        updateFrameState(frameIndex, { progress: 90 });
        return data?.prompt || null;
      }, `prompt-${frameIndex}`);

      updateFrameState(frameIndex, { 
        isGeneratingPrompt: false, 
        retryCount: 0,
        canStop: false,
        progress: 100
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate prompt';
      updateFrameState(frameIndex, { 
        isGeneratingPrompt: false, 
        error: errorMessage,
        retryCount: getFrameState(frameIndex).retryCount + 1,
        canStop: false,
        progress: 0
      });
      console.error(`Frame ${frameIndex} prompt generation error:`, error);
      throw error;
    }
  }, [updateFrameState, getFrameState, requestManager]);

  const createBatches = useCallback((tasks: FrameTask[], qualityProfile: 'conservative' | 'balanced' | 'aggressive') => {
    const batchSizes = {
      conservative: 3,
      balanced: 5,
      aggressive: 8
    };
    
    const budgetStatus = tokenManager.checkBudgetStatus(tasks.length * 1500); // Rough estimate
    const recommendedBatchSize = Math.min(batchSizes[qualityProfile], budgetStatus.recommendedBatchSize);
    
    const batches: FrameTask[][] = [];
    for (let i = 0; i < tasks.length; i += recommendedBatchSize) {
      batches.push(tasks.slice(i, i + recommendedBatchSize));
    }
    
    return batches;
  }, [tokenManager]);

  const processTask = useCallback(async (task: FrameTask): Promise<void> => {
    try {
      if (task.operation === 'analyze') {
        const result = await analyzeFrame(task.frameIndex, task.imageData);
        if (result) {
          setProgress(prev => ({ ...prev, completedFrames: prev.completedFrames + 1 }));
        } else {
          throw new Error('Analysis returned null');
        }
      } else if (task.operation === 'prompt') {
        const result = await generatePrompt(task.frameIndex, task.imageData, task.imageDescription);
        if (result) {
          setProgress(prev => ({ ...prev, completedFrames: prev.completedFrames + 1 }));
        } else {
          throw new Error('Prompt generation returned null');
        }
      }
    } catch (error) {
      task.retryCount++;
      failedTasks.current.push(task);
      setProgress(prev => ({ ...prev, failedFrames: prev.failedFrames + 1 }));
      throw error;
    }
  }, [analyzeFrame, generatePrompt]);

  const processBatch = useCallback(async (batch: FrameTask[], batchIndex: number) => {
    setProgress(prev => ({
      ...prev,
      currentBatch: batchIndex + 1,
      currentBatchSize: batch.length,
      framesInCurrentBatch: 0
    }));

    // Check if we should throttle
    if (tokenManager.shouldThrottle()) {
      const delay = progress.adaptiveDelayMs;
      console.log(`Throttling: waiting ${delay}ms before processing batch ${batchIndex + 1}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Process tasks in batch (with concurrency control from request manager)
    const promises = batch.map(async (task) => {
      try {
        await processTask(task);
        setProgress(prev => ({ ...prev, framesInCurrentBatch: prev.framesInCurrentBatch + 1 }));
      } catch (error) {
        console.error(`Task failed for frame ${task.frameIndex}:`, error);
      }
    });

    await Promise.allSettled(promises);

    // Update processing speed and time estimates
    const elapsedTime = Date.now() - processingStartTime.current;
    const processedFrames = progress.completedFrames + progress.failedFrames;
    const speed = processedFrames > 0 ? (processedFrames / elapsedTime) * 60000 : 0; // frames per minute
    const remainingFrames = progress.totalFrames - processedFrames;
    const estimatedTimeRemaining = speed > 0 ? (remainingFrames / speed) * 60000 : 0;

    setProgress(prev => ({
      ...prev,
      processingSpeed: speed,
      estimatedTimeRemaining
    }));
  }, [tokenManager, progress.adaptiveDelayMs, processTask, progress.completedFrames, progress.failedFrames, progress.totalFrames]);

  const processFrames = useCallback(async (
    frames: Array<{ index: number; dataUrl: string; operation: 'analyze' | 'prompt'; imageDescription?: string }>,
    qualityProfile: 'conservative' | 'balanced' | 'aggressive' = 'balanced'
  ) => {
    if (isProcessing.current) {
      throw new Error('Processing already in progress');
    }

    isProcessing.current = true;
    isPaused.current = false;
    processingStartTime.current = Date.now();
    failedTasks.current = [];

    // Convert frames to tasks
    const tasks: FrameTask[] = frames.map(frame => ({
      frameIndex: frame.index,
      imageData: frame.dataUrl,
      operation: frame.operation,
      imageDescription: frame.imageDescription,
      priority: 1,
      retryCount: 0
    }));

    // Estimate token usage
    const tokenEstimate = tokenManager.estimateTokensForBatch(tasks.length, 
      tasks.some(t => t.imageDescription));

    // Create smart batches
    const batches = createBatches(tasks, qualityProfile);

    setProgress({
      phase: 'planning',
      currentBatch: 0,
      totalBatches: batches.length,
      currentBatchSize: 0,
      framesInCurrentBatch: 0,
      totalFrames: frames.length,
      completedFrames: 0,
      failedFrames: 0,
      cachedFrames: 0,
      estimatedTimeRemaining: 0,
      tokenBudgetUsed: 0,
      tokenBudgetRemaining: tokenManager.getRemainingBudget().tokens,
      processingSpeed: 0,
      adaptiveDelayMs: qualityProfile === 'conservative' ? 4000 : qualityProfile === 'balanced' ? 2500 : 1500,
      qualityProfile
    });

    try {
      setProgress(prev => ({ ...prev, phase: 'processing' }));

      for (let i = 0; i < batches.length; i++) {
        if (isPaused.current) {
          setProgress(prev => ({ ...prev, phase: 'paused' }));
          // Wait for resume
          while (isPaused.current && isProcessing.current) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          if (!isProcessing.current) break;
          setProgress(prev => ({ ...prev, phase: 'processing' }));
        }

        await processBatch(batches[i], i);

        // Adaptive delay between batches
        if (i < batches.length - 1) {
          const budgetStatus = tokenManager.checkBudgetStatus(1500); // Check for next batch
          if (!budgetStatus.canProceed) {
            console.log(`Waiting ${budgetStatus.suggestedDelay}ms due to token budget`);
            await new Promise(resolve => setTimeout(resolve, budgetStatus.suggestedDelay));
          } else {
            await new Promise(resolve => setTimeout(resolve, progress.adaptiveDelayMs));
          }
        }
      }

      setProgress(prev => ({ ...prev, phase: 'complete' }));
    } catch (error) {
      console.error('Batch processing error:', error);
      setProgress(prev => ({ ...prev, phase: 'idle' }));
    } finally {
      isProcessing.current = false;
    }
  }, [tokenManager, createBatches, processBatch, progress.adaptiveDelayMs]);

  const pauseProcessing = useCallback(() => {
    isPaused.current = true;
    requestManager.cancelAllRequests();
  }, [requestManager]);

  const resumeProcessing = useCallback(() => {
    isPaused.current = false;
  }, []);

  const stopProcessing = useCallback(() => {
    isProcessing.current = false;
    isPaused.current = false;
    requestManager.cancelAllRequests();
    setProgress(prev => ({ ...prev, phase: 'idle' }));
  }, [requestManager]);

  const retryFailedFrames = useCallback(async () => {
    if (failedTasks.current.length === 0) return;

    const tasks = failedTasks.current.map(task => ({
      index: task.frameIndex,
      dataUrl: task.imageData,
      operation: task.operation,
      imageDescription: task.imageDescription
    }));

    failedTasks.current = [];
    await processFrames(tasks, progress.qualityProfile);
  }, [processFrames, progress.qualityProfile]);

  const setQualityProfile = useCallback((profile: 'conservative' | 'balanced' | 'aggressive') => {
    setProgress(prev => ({ ...prev, qualityProfile: profile }));
  }, []);

  const getProgress = useCallback((): SmartBatchProgress => {
    return progress;
  }, [progress]);

  return {
    processFrames,
    pauseProcessing,
    resumeProcessing,
    stopProcessing,
    retryFailedFrames,
    getFrameState,
    getProgress,
    setQualityProfile,
    clearFrameState
  };
}