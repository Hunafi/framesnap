import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DirectAIProcessorState {
  isAnalyzing: boolean;
  isGeneratingPrompt: boolean;
  error: string | null;
  retryCount: number;
}

export function useDirectAIProcessor() {
  const [frameStates, setFrameStates] = useState<Map<number, DirectAIProcessorState>>(new Map());

  const updateFrameState = useCallback((frameIndex: number, updates: Partial<DirectAIProcessorState>) => {
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

  const getFrameState = useCallback((frameIndex: number): DirectAIProcessorState => {
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
      const { data, error } = await supabase.functions.invoke('analyze-frame', {
        body: { imageData }
      });

      if (error) {
        console.error('AI Analysis Error:', error);
        updateFrameState(frameIndex, { 
          isAnalyzing: false, 
          error: 'Server busy. Please wait 45 seconds and retry.',
          retryCount: getFrameState(frameIndex).retryCount + 1
        });
        return null;
      }

      updateFrameState(frameIndex, { isAnalyzing: false, error: null });
      return data?.description || null;
    } catch (error) {
      console.error('AI Analysis Error:', error);
      updateFrameState(frameIndex, { 
        isAnalyzing: false, 
        error: 'Server busy. Please wait 45 seconds and retry.',
        retryCount: getFrameState(frameIndex).retryCount + 1
      });
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
        updateFrameState(frameIndex, { 
          isGeneratingPrompt: false, 
          error: 'Server busy. Please wait 45 seconds and retry.',
          retryCount: getFrameState(frameIndex).retryCount + 1
        });
        return null;
      }

      updateFrameState(frameIndex, { isGeneratingPrompt: false, error: null });
      return data?.prompt || null;
    } catch (error) {
      console.error('Prompt Generation Error:', error);
      updateFrameState(frameIndex, { 
        isGeneratingPrompt: false, 
        error: 'Server busy. Please wait 45 seconds and retry.',
        retryCount: getFrameState(frameIndex).retryCount + 1
      });
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

  const clearFrameState = useCallback((frameIndex: number) => {
    setFrameStates(prev => {
      const newStates = new Map(prev);
      newStates.delete(frameIndex);
      return newStates;
    });
  }, []);

  return {
    analyzeFrame,
    generatePrompt,
    retryFrame,
    getFrameState,
    clearFrameState
  };
}