import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UseAIAnalysisReturn {
  analyzeFrame: (imageData: string) => Promise<string | null>;
  generatePrompt: (imageData: string, imageDescription?: string, customInstructions?: string) => Promise<string | null>;
  isLoading: boolean;
  error: string | null;
}

export function useAIAnalysis(): UseAIAnalysisReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeFrame = useCallback(async (imageData: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: functionError } = await supabase.functions.invoke('analyze-frame', {
        body: { imageData }
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      return data?.description || null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze frame';
      setError(errorMessage);
      console.error('Frame analysis error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generatePrompt = useCallback(async (imageData: string, imageDescription?: string, customInstructions?: string): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: functionError } = await supabase.functions.invoke('generate-prompt', {
        body: { imageData, imageDescription, customInstructions }
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      return data?.prompt || null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate prompt';
      setError(errorMessage);
      console.error('Prompt generation error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    analyzeFrame,
    generatePrompt,
    isLoading,
    error
  };
}