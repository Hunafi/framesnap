import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DirectAIProcessorState {
  isAnalyzing: boolean;
  isGeneratingPrompt: boolean;
  error: string | null;
  retryCount: number;
  isWaitingToRetry: boolean;
  retryScheduledAt: number | null;
  retryCountdown: number;
}

export function useDirectAIProcessor() {
  const [frameStates, setFrameStates] = useState<Map<number, DirectAIProcessorState>>(new Map());
  const [retryTimeouts, setRetryTimeouts] = useState<Map<number, NodeJS.Timeout>>(new Map());
  const [countdownIntervals, setCountdownIntervals] = useState<Map<number, NodeJS.Timeout>>(new Map());

  const updateFrameState = useCallback((frameIndex: number, updates: Partial<DirectAIProcessorState>) => {
    setFrameStates(prev => {
      const newStates = new Map(prev);
      const currentState = newStates.get(frameIndex) || {
        isAnalyzing: false,
        isGeneratingPrompt: false,
        error: null,
        retryCount: 0,
        isWaitingToRetry: false,
        retryScheduledAt: null,
        retryCountdown: 0
      };
      newStates.set(frameIndex, { ...currentState, ...updates });
      return newStates;
    });
  }, []);

  const getFrameState = useCallback((frameIndex: number): DirectAIProcessorState => {
    return frameStates.get(frameIndex) || {
      isAnalyzing: false,
      isGeneratingPrompt: false,
      error: null,
      retryCount: 0,
      isWaitingToRetry: false,
      retryScheduledAt: null,
      retryCountdown: 0
    };
  }, [frameStates]);

  const analyzeFrame = useCallback(async (frameIndex: number, imageData: string): Promise<string | null> => {
    updateFrameState(frameIndex, { isAnalyzing: true, error: null });
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-frame', {
        body: { imageData }
      });

      if (error) {
        console.error('AI Analysis Error:', error);
        const currentRetryCount = getFrameState(frameIndex).retryCount;
        updateFrameState(frameIndex, { 
          isAnalyzing: false, 
          retryCount: currentRetryCount + 1
        });
        
        // Schedule automatic retry if under max attempts
        if (currentRetryCount < 3) {
          // scheduleRetry will be called after it's defined
          setTimeout(() => scheduleRetry(frameIndex, 'analyze', imageData), 0);
        } else {
          updateFrameState(frameIndex, { 
            error: 'Max retries reached. Please try again later.' 
          });
        }
        return null;
      }

      updateFrameState(frameIndex, { isAnalyzing: false, error: null });
      return data?.description || null;
    } catch (error) {
      console.error('AI Analysis Error:', error);
      const currentRetryCount = getFrameState(frameIndex).retryCount;
      updateFrameState(frameIndex, { 
        isAnalyzing: false, 
        retryCount: currentRetryCount + 1
      });
      
      // Schedule automatic retry if under max attempts
      if (currentRetryCount < 3) {
        setTimeout(() => scheduleRetry(frameIndex, 'analyze', imageData), 0);
      } else {
        updateFrameState(frameIndex, { 
          error: 'Max retries reached. Please try again later.' 
        });
      }
      return null;
    }
  }, [updateFrameState, getFrameState]);

  const generatePrompt = useCallback(async (frameIndex: number, imageData: string, description?: string): Promise<string | null> => {
    updateFrameState(frameIndex, { isGeneratingPrompt: true, error: null });
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-prompt', {
        body: { imageData, imageDescription: description }
      });

      if (error) {
        console.error('Prompt Generation Error:', error);
        const currentRetryCount = getFrameState(frameIndex).retryCount;
        updateFrameState(frameIndex, { 
          isGeneratingPrompt: false, 
          retryCount: currentRetryCount + 1
        });
        
        // Schedule automatic retry if under max attempts
        if (currentRetryCount < 3) {
          setTimeout(() => scheduleRetry(frameIndex, 'prompt', imageData, description), 0);
        } else {
          updateFrameState(frameIndex, { 
            error: 'Max retries reached. Please try again later.' 
          });
        }
        return null;
      }

      updateFrameState(frameIndex, { isGeneratingPrompt: false, error: null });
      return data?.prompt || null;
    } catch (error) {
      console.error('Prompt Generation Error:', error);
      const currentRetryCount = getFrameState(frameIndex).retryCount;
      updateFrameState(frameIndex, { 
        isGeneratingPrompt: false, 
        retryCount: currentRetryCount + 1
      });
      
      // Schedule automatic retry if under max attempts
      if (currentRetryCount < 3) {
        setTimeout(() => scheduleRetry(frameIndex, 'prompt', imageData, description), 0);
      } else {
        updateFrameState(frameIndex, { 
          error: 'Max retries reached. Please try again later.' 
        });
      }
      return null;
    }
  }, [updateFrameState, getFrameState]);

  const retryFrame = useCallback(async (frameIndex: number, imageData: string, operation: 'analyze' | 'prompt', description?: string): Promise<string | null> => {
    if (operation === 'analyze') {
      return analyzeFrame(frameIndex, imageData);
    } else {
      return generatePrompt(frameIndex, imageData, description);
    }
  }, [analyzeFrame, generatePrompt]);

  const scheduleRetry = useCallback((frameIndex: number, operation: 'analyze' | 'prompt', imageData: string, description?: string) => {
    const retryDelay = Math.min(45000 * Math.pow(2, getFrameState(frameIndex).retryCount), 180000); // Max 3 minutes
    const retryTime = Date.now() + retryDelay;
    
    updateFrameState(frameIndex, {
      isWaitingToRetry: true,
      retryScheduledAt: retryTime,
      retryCountdown: Math.ceil(retryDelay / 1000),
      error: null
    });

    // Clear existing timeouts
    const existingTimeout = retryTimeouts.get(frameIndex);
    const existingInterval = countdownIntervals.get(frameIndex);
    if (existingTimeout) clearTimeout(existingTimeout);
    if (existingInterval) clearInterval(existingInterval);

    // Start countdown timer
    const countdownInterval = setInterval(() => {
      const now = Date.now();
      const timeLeft = Math.max(0, Math.ceil((retryTime - now) / 1000));
      
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        setCountdownIntervals(prev => {
          const newIntervals = new Map(prev);
          newIntervals.delete(frameIndex);
          return newIntervals;
        });
      } else {
        updateFrameState(frameIndex, { retryCountdown: timeLeft });
      }
    }, 1000);

    setCountdownIntervals(prev => new Map(prev.set(frameIndex, countdownInterval)));

    // Schedule the retry
    const timeout = setTimeout(async () => {
      updateFrameState(frameIndex, {
        isWaitingToRetry: false,
        retryScheduledAt: null,
        retryCountdown: 0
      });

      // Perform the retry
      if (operation === 'analyze') {
        await analyzeFrame(frameIndex, imageData);
      } else {
        await generatePrompt(frameIndex, imageData, description);
      }

      setRetryTimeouts(prev => {
        const newTimeouts = new Map(prev);
        newTimeouts.delete(frameIndex);
        return newTimeouts;
      });
    }, retryDelay);

    setRetryTimeouts(prev => new Map(prev.set(frameIndex, timeout)));
  }, [updateFrameState, getFrameState, retryTimeouts, countdownIntervals, analyzeFrame, generatePrompt]);

  const batchProcessWithAutoRetry = useCallback(async (
    capturedFrames: any[],
    operation: 'analyze' | 'prompt',
    onUpdateFrame: (frameIndex: number, updates: any) => void
  ) => {
    const framesToProcess = operation === 'analyze' 
      ? capturedFrames.filter(f => !f.aiDescription)
      : capturedFrames.filter(f => f.aiDescription && !f.aiPrompt);

    // Process all frames in parallel
    await Promise.allSettled(
      framesToProcess.map(async (frame) => {
        if (operation === 'analyze') {
          const result = await analyzeFrame(frame.index, frame.dataUrl);
          if (result) {
            onUpdateFrame(frame.index, { aiDescription: result });
          }
        } else {
          const result = await generatePrompt(frame.index, frame.dataUrl, frame.aiDescription);
          if (result) {
            onUpdateFrame(frame.index, { aiPrompt: result });
          }
        }
      })
    );
  }, [analyzeFrame, generatePrompt]);

  const clearFrameState = useCallback((frameIndex: number) => {
    // Clear timeouts and intervals
    const timeout = retryTimeouts.get(frameIndex);
    const interval = countdownIntervals.get(frameIndex);
    if (timeout) clearTimeout(timeout);
    if (interval) clearInterval(interval);

    setFrameStates(prev => {
      const newStates = new Map(prev);
      newStates.delete(frameIndex);
      return newStates;
    });
    setRetryTimeouts(prev => {
      const newTimeouts = new Map(prev);
      newTimeouts.delete(frameIndex);
      return newTimeouts;
    });
    setCountdownIntervals(prev => {
      const newIntervals = new Map(prev);
      newIntervals.delete(frameIndex);
      return newIntervals;
    });
  }, [retryTimeouts, countdownIntervals]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      retryTimeouts.forEach(timeout => clearTimeout(timeout));
      countdownIntervals.forEach(interval => clearInterval(interval));
    };
  }, [retryTimeouts, countdownIntervals]);

  return {
    analyzeFrame,
    generatePrompt,
    retryFrame,
    getFrameState,
    clearFrameState,
    batchProcessWithAutoRetry,
    scheduleRetry
  };
}