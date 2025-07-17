import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Lightbulb, RefreshCw, Loader2 } from 'lucide-react';
import { useDirectAIProcessor } from '@/hooks/use-direct-ai-processor';
import type { CapturedFrame } from './frameflow';

interface AIProcessingDashboardProps {
  capturedFrames: CapturedFrame[];
  onUpdateFrame: (frameIndex: number, updates: Partial<CapturedFrame>) => void;
}

export function AIProcessingDashboard({ capturedFrames, onUpdateFrame }: AIProcessingDashboardProps) {
  const { analyzeFrame, generatePrompt, retryFrame, getFrameState } = useDirectAIProcessor();
  const [activeTab, setActiveTab] = useState<'analyze' | 'prompt'>('analyze');

  const handleAnalyzeFrame = async (frame: CapturedFrame) => {
    const result = await analyzeFrame(frame.index, frame.dataUrl);
    if (result) {
      onUpdateFrame(frame.index, { aiDescription: result });
    }
  };

  const handleGeneratePrompt = async (frame: CapturedFrame) => {
    const result = await generatePrompt(frame.index, frame.dataUrl, frame.aiDescription);
    if (result) {
      onUpdateFrame(frame.index, { aiPrompt: result });
    }
  };

  const handleBatchAnalyze = async () => {
    const framesToAnalyze = capturedFrames.filter(f => !f.aiDescription);
    for (const frame of framesToAnalyze) {
      await handleAnalyzeFrame(frame);
    }
  };

  const handleBatchPrompt = async () => {
    const framesToPrompt = capturedFrames.filter(f => f.aiDescription && !f.aiPrompt);
    for (const frame of framesToPrompt) {
      await handleGeneratePrompt(frame);
    }
  };

  const handleRetryAllFailed = async (type: 'analyze' | 'prompt') => {
    if (type === 'analyze') {
      const failedFrames = capturedFrames.filter(f => {
        const state = getFrameState(f.index);
        return state.error && !f.aiDescription;
      });
      for (const frame of failedFrames) {
        await handleAnalyzeFrame(frame);
      }
    } else {
      const failedFrames = capturedFrames.filter(f => {
        const state = getFrameState(f.index);
        return state.error && f.aiDescription && !f.aiPrompt;
      });
      for (const frame of failedFrames) {
        await handleGeneratePrompt(frame);
      }
    }
  };

  const getAnalyzedCount = () => capturedFrames.filter(f => f.aiDescription).length;
  const getPromptCount = () => capturedFrames.filter(f => f.aiPrompt).length;

  return (
    <Card className="w-full mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          AI Processing Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'analyze' | 'prompt')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="analyze" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Analyze ({getAnalyzedCount()}/{capturedFrames.length})
            </TabsTrigger>
            <TabsTrigger value="prompt" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Prompts ({getPromptCount()}/{capturedFrames.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analyze" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Generate AI descriptions for your captured frames
              </p>
              <Button onClick={handleBatchAnalyze} disabled={capturedFrames.length === 0}>
                <Brain className="h-4 w-4 mr-2" />
                Analyze All
              </Button>
            </div>
            
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {capturedFrames.map((frame) => {
                  const state = getFrameState(frame.index);
                  return (
                    <div key={frame.index} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Frame {frame.index}</span>
                        {frame.aiDescription && <Badge variant="secondary">Analyzed</Badge>}
                        {state.isAnalyzing && <Loader2 className="h-4 w-4 animate-spin" />}
                        {state.error && <Badge variant="destructive">Error</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        {state.error && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleRetryAllFailed('analyze')}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          onClick={() => handleAnalyzeFrame(frame)}
                          disabled={state.isAnalyzing}
                        >
                          {state.isAnalyzing ? 'Analyzing...' : 'Analyze'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="prompt" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Generate AI prompts from analyzed frames
              </p>
              <Button onClick={handleBatchPrompt} disabled={getAnalyzedCount() === 0}>
                <Lightbulb className="h-4 w-4 mr-2" />
                Generate All
              </Button>
            </div>
            
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {capturedFrames.map((frame) => {
                  const state = getFrameState(frame.index);
                  return (
                    <div key={frame.index} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Frame {frame.index}</span>
                        {frame.aiPrompt && <Badge variant="secondary">Generated</Badge>}
                        {!frame.aiDescription && <Badge variant="outline">Need Analysis</Badge>}
                        {state.isGeneratingPrompt && <Loader2 className="h-4 w-4 animate-spin" />}
                        {state.error && <Badge variant="destructive">Error</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        {state.error && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleRetryAllFailed('prompt')}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          onClick={() => handleGeneratePrompt(frame)}
                          disabled={!frame.aiDescription || state.isGeneratingPrompt}
                        >
                          {state.isGeneratingPrompt ? 'Generating...' : 'Generate'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}