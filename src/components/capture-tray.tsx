"use client";

import type { FC } from 'react';
import { useState } from 'react';
import { Download, Loader2, Trash2, X, Brain, Sparkles, Edit3, FileDown, Copy } from 'lucide-react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAIAnalysis } from '@/hooks/use-ai-analysis';
import { CopyableTextarea } from './copyable-textarea';
import type { CapturedFrame } from './frameflow';


interface CaptureTrayProps {
  capturedFrames: CapturedFrame[];
  onClear: () => void;
  onDelete: (frame: CapturedFrame) => void;
  onUpdateFrame: (frameIndex: number, updates: Partial<CapturedFrame>) => void;
}

export const CaptureTray: FC<CaptureTrayProps> = ({ capturedFrames, onClear, onDelete, onUpdateFrame }) => {
  const [isZipping, setIsZipping] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const { toast } = useToast();
  const { analyzeFrame, generatePrompt } = useAIAnalysis();

  const handleAnalyzeFrame = async (frame: CapturedFrame) => {
    onUpdateFrame(frame.index, { isAnalyzing: true });
    
    try {
      const description = await analyzeFrame(frame.dataUrl);
      if (description) {
        onUpdateFrame(frame.index, { 
          aiDescription: description, 
          isAnalyzing: false 
        });
        toast({ title: 'Frame analyzed successfully!' });
      }
    } catch (error) {
      onUpdateFrame(frame.index, { isAnalyzing: false });
      toast({
        title: 'Analysis Failed',
        description: 'Could not analyze the frame. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleGeneratePrompt = async (frame: CapturedFrame) => {
    onUpdateFrame(frame.index, { isGeneratingPrompt: true });
    
    try {
      const prompt = await generatePrompt(frame.dataUrl);
      if (prompt) {
        onUpdateFrame(frame.index, { 
          aiPrompt: prompt, 
          isGeneratingPrompt: false 
        });
        toast({ title: 'AI prompt generated successfully!' });
      }
    } catch (error) {
      onUpdateFrame(frame.index, { isGeneratingPrompt: false });
      toast({
        title: 'Prompt Generation Failed',
        description: 'Could not generate AI prompt. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleAnalyzeAll = async () => {
    const framesToAnalyze = capturedFrames.filter(f => !f.aiDescription && !f.isAnalyzing);
    
    for (const frame of framesToAnalyze) {
      await handleAnalyzeFrame(frame);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const handleGenerateAllPrompts = async () => {
    const framesToProcess = capturedFrames.filter(f => !f.aiPrompt && !f.isGeneratingPrompt);
    
    for (const frame of framesToProcess) {
      await handleGeneratePrompt(frame);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const handleDownload = async () => {
    if (capturedFrames.length === 0) {
      toast({
        title: 'No frames captured',
        description: 'Please capture some frames before downloading.',
        variant: 'destructive',
      });
      return;
    }
    setIsZipping(true);
    try {
      const zip = new JSZip();
      
      // Add images
      for (const frame of capturedFrames) {
        const response = await fetch(frame.dataUrl);
        const blob = await response.blob();
        zip.file(`frame_${frame.index}.jpg`, blob, { binary: true });
      }
      
      // Add CSV with AI data
      const csvData = [
        ['Frame', 'AI Description', 'AI Prompt'],
        ...capturedFrames.map(frame => [
          frame.index.toString(),
          frame.aiDescription || '',
          frame.aiPrompt || ''
        ])
      ];
      const csvContent = csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
      zip.file('frame_analysis.csv', csvContent);
      
      // Add JSON metadata
      const metadata = {
        exportDate: new Date().toISOString(),
        totalFrames: capturedFrames.length,
        framesWithAI: capturedFrames.filter(f => f.aiDescription || f.aiPrompt).length,
        frames: capturedFrames.map(frame => ({
          index: frame.index,
          aiDescription: frame.aiDescription,
          aiPrompt: frame.aiPrompt
        }))
      };
      zip.file('metadata.json', JSON.stringify(metadata, null, 2));
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'FrameSniper_AI_Export.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error creating export:', error);
      toast({
        title: 'Export Failed',
        description: 'Could not create the export file. Please try again.',
        variant: 'destructive',
      });
    }
    setIsZipping(false);
  };

  const handleTextEdit = (frameIndex: number, field: 'aiDescription' | 'aiPrompt', value: string) => {
    onUpdateFrame(frameIndex, { [field]: value });
  };

  return (
    <Card className="w-full bg-card/95 mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>AI Frame Analysis ({capturedFrames.length} frames)</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAnalyzeAll} disabled={capturedFrames.length === 0}>
            <Brain className="mr-2 h-4 w-4" />
            Analyze All
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerateAllPrompts} disabled={capturedFrames.length === 0}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate All Prompts
          </Button>
          <Button variant="outline" size="sm" onClick={onClear} disabled={capturedFrames.length === 0}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All
          </Button>
          <Button onClick={handleDownload} disabled={isZipping || capturedFrames.length === 0} size="sm">
            {isZipping ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            Export All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {capturedFrames.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Frame</TableHead>
                  <TableHead className="w-1/2">AI Description</TableHead>
                  <TableHead className="w-1/2">AI Prompt</TableHead>
                  <TableHead className="w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capturedFrames.map((frame) => (
                  <TableRow key={frame.index}>
                    <TableCell className="p-2">
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={frame.dataUrl}
                          alt={`Frame ${frame.index}`}
                          className="aspect-video w-20 rounded object-cover shadow-sm"
                        />
                        <Badge variant="secondary" className="text-xs">
                          #{frame.index}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="p-2">
                      <div className="space-y-2">
                        {frame.isAnalyzing ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analyzing...
                          </div>
                        ) : frame.aiDescription ? (
                          <CopyableTextarea
                            value={frame.aiDescription}
                            onChange={(value) => handleTextEdit(frame.index, 'aiDescription', value)}
                            placeholder="AI description will appear here..."
                          />
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAnalyzeFrame(frame)}
                              className="w-full"
                            >
                              <Brain className="mr-2 h-4 w-4" />
                              Analyze
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="p-2">
                      <div className="space-y-2">
                        {frame.isGeneratingPrompt ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Generating...
                          </div>
                        ) : frame.aiPrompt ? (
                          <CopyableTextarea
                            value={frame.aiPrompt}
                            onChange={(value) => handleTextEdit(frame.index, 'aiPrompt', value)}
                            placeholder="AI prompt will appear here..."
                          />
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGeneratePrompt(frame)}
                              className="w-full"
                            >
                              <Sparkles className="mr-2 h-4 w-4" />
                              Generate
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="p-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(frame)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex h-32 w-full items-center justify-center text-sm text-muted-foreground border border-dashed rounded-lg">
            Capture frames from your video to start AI analysis
          </div>
        )}
      </CardContent>
    </Card>
  );
};