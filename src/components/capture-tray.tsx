"use client";

import type { FC } from 'react';
import { useState } from 'react';
import { Download, Loader2, Trash2, X, Brain, Sparkles, Edit3, FileDown, Copy, FileText, FileImage, AlertCircle, CheckCircle, XCircle, Pause, Play, RefreshCw, StopCircle, Clock, Hash } from 'lucide-react';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } from 'docx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useSmartAIProcessor } from '@/hooks/use-smart-ai-processor';
import { useTokenBudgetManager } from '@/hooks/use-token-budget-manager';
import { useAdvancedRequestManager } from '@/hooks/use-advanced-request-manager';

import { CopyableTextarea } from './copyable-textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { AspectRatio } from './ui/aspect-ratio';
import type { CapturedFrame } from './frameflow';


interface CaptureTrayProps {
  capturedFrames: CapturedFrame[];
  onClear: () => void;
  onDelete: (frame: CapturedFrame) => void;
  onUpdateFrame: (frameIndex: number, updates: Partial<CapturedFrame>) => void;
  videoAspectRatio?: number; // width/height ratio
}

type ExportFormat = 'zip' | 'pdf' | 'docx';

export const CaptureTray: FC<CaptureTrayProps> = ({ capturedFrames, onClear, onDelete, onUpdateFrame, videoAspectRatio = 16/9 }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('zip');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<{ frameIndex: number; dataUrl: string } | null>(null);
  const { toast } = useToast();
  const smartProcessor = useSmartAIProcessor(onUpdateFrame);
  const tokenManager = useTokenBudgetManager();
  const requestManager = useAdvancedRequestManager();

  const handleAnalyzeFrame = async (frame: CapturedFrame) => {
    try {
      await smartProcessor.processFrames([
        { index: frame.index, dataUrl: frame.dataUrl, operation: 'analyze' }
      ]);
      
      // Check if processing completed successfully
      const frameState = smartProcessor.getFrameState(frame.index);
      if (!frameState.error && !frameState.isAnalyzing) {
        toast({ title: 'Frame analyzed successfully!' });
      } else if (frameState.error) {
        toast({
          title: 'Analysis Failed',
          description: frameState.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: 'Could not analyze the frame. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleGeneratePrompt = async (frame: CapturedFrame) => {
    try {
      await smartProcessor.processFrames([
        { index: frame.index, dataUrl: frame.dataUrl, operation: 'prompt', imageDescription: frame.aiDescription }
      ]);
      
      // Check if processing completed successfully
      const frameState = smartProcessor.getFrameState(frame.index);
      if (!frameState.error && !frameState.isGeneratingPrompt) {
        toast({ title: 'AI prompt generated successfully!' });
      } else if (frameState.error) {
        toast({
          title: 'Prompt Generation Failed',
          description: frameState.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Prompt Generation Failed',
        description: 'Could not generate AI prompt. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleAnalyzeAll = async () => {
    const framesToAnalyze = capturedFrames
      .filter(f => !f.aiDescription && !smartProcessor.getFrameState(f.index).isAnalyzing)
      .map(f => ({ index: f.index, dataUrl: f.dataUrl, operation: 'analyze' as const }));
    
    if (framesToAnalyze.length === 0) {
      toast({ title: 'No frames to analyze', description: 'All frames already have descriptions.' });
      return;
    }

    await smartProcessor.processFrames(framesToAnalyze);
    
    toast({ 
      title: 'Batch Analysis Started', 
      description: `Processing ${framesToAnalyze.length} frames with smart AI system.` 
    });
  };

  const handleGenerateAllPrompts = async () => {
    const framesToProcess = capturedFrames
      .filter(f => !f.aiPrompt && !smartProcessor.getFrameState(f.index).isGeneratingPrompt)
      .map(f => ({ index: f.index, dataUrl: f.dataUrl, operation: 'prompt' as const, imageDescription: f.aiDescription }));
    
    if (framesToProcess.length === 0) {
      toast({ title: 'No frames to process', description: 'All frames already have AI prompts.' });
      return;
    }

    await smartProcessor.processFrames(framesToProcess);
    
    toast({ 
      title: 'Batch Prompt Generation Started', 
      description: `Processing ${framesToProcess.length} frames with smart AI system.` 
    });
  };

  // Helper function to base64 encode images for export
  const getBase64FromDataUrl = (dataUrl: string): string => {
    return dataUrl.split(',')[1];
  };

  const generatePDF = async () => {
    const pdf = new jsPDF();
    let yPosition = 20;
    
    // Title
    pdf.setFontSize(20);
    pdf.text('Frame Sniper - Captured Frames Report', 20, yPosition);
    yPosition += 20;
    
    for (let i = 0; i < capturedFrames.length; i++) {
      const frame = capturedFrames[i];
      
      // Check if we need a new page
      if (yPosition > 200) {
        pdf.addPage();
        yPosition = 20;
      }
      
      // Frame header
      pdf.setFontSize(14);
      pdf.text(`Frame ${frame.index}`, 20, yPosition);
      yPosition += 10;
      
      // Determine image dimensions based on aspect ratio
      let imgWidth, imgHeight;
      if (videoAspectRatio > 1) {
        // Landscape (16:9, etc.)
        imgWidth = 80;
        imgHeight = imgWidth / videoAspectRatio;
      } else {
        // Portrait (9:16, etc.)
        imgHeight = 60;
        imgWidth = imgHeight * videoAspectRatio;
      }
      
      // Add image
      try {
        pdf.addImage(frame.dataUrl, 'JPEG', 20, yPosition, imgWidth, imgHeight);
      } catch (error) {
        console.error('Failed to add image to PDF:', error);
      }
      yPosition += imgHeight + 10;
      
      // AI Description
      if (frame.aiDescription) {
        pdf.setFontSize(10);
        pdf.text('AI Description:', 20, yPosition);
        yPosition += 5;
        const descLines = pdf.splitTextToSize(frame.aiDescription, 170);
        pdf.text(descLines, 20, yPosition);
        yPosition += descLines.length * 5 + 5;
      }
      
      // AI Prompt
      if (frame.aiPrompt) {
        pdf.setFontSize(10);
        pdf.text('AI Prompt:', 20, yPosition);
        yPosition += 5;
        const promptLines = pdf.splitTextToSize(frame.aiPrompt, 170);
        pdf.text(promptLines, 20, yPosition);
        yPosition += promptLines.length * 5 + 10;
      }
      
      yPosition += 10;
    }
    
    // Save PDF
    pdf.save('frame-sniper-report.pdf');
  };

  const generateDOCX = async () => {
    const children = [];
    
    // Title
    children.push(
      new Paragraph({
        text: 'Frame Sniper - Captured Frames Report',
        heading: HeadingLevel.TITLE,
      })
    );
    
    for (const frame of capturedFrames) {
      // Frame header
      children.push(
        new Paragraph({
          text: `Frame ${frame.index}`,
          heading: HeadingLevel.HEADING_1,
        })
      );
      
      // Determine image dimensions based on aspect ratio
      let imgWidth, imgHeight;
      if (videoAspectRatio > 1) {
        // Landscape
        imgWidth = 400;
        imgHeight = imgWidth / videoAspectRatio;
      } else {
        // Portrait
        imgHeight = 300;
        imgWidth = imgHeight * videoAspectRatio;
      }
      
      // Add image
      try {
        const base64Data = getBase64FromDataUrl(frame.dataUrl);
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: Buffer.from(base64Data, 'base64'),
                transformation: {
                  width: imgWidth,
                  height: imgHeight,
                },
                type: 'jpg',
              }),
            ],
          })
        );
      } catch (error) {
        console.error('Failed to add image to DOCX:', error);
      }
      
      // AI Description
      if (frame.aiDescription) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: 'AI Description: ',
                bold: true,
              }),
              new TextRun({
                text: frame.aiDescription,
              }),
            ],
          })
        );
      }
      
      // AI Prompt
      if (frame.aiPrompt) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: 'AI Prompt: ',
                bold: true,
              }),
              new TextRun({
                text: frame.aiPrompt,
              }),
            ],
          })
        );
      }
      
      // Add spacing
      children.push(new Paragraph({ text: '' }));
    }
    
    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });
    
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frame-sniper-report.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateZIP = async () => {
    const zip = new JSZip();
    
    // Add images
    for (const frame of capturedFrames) {
      const response = await fetch(frame.dataUrl);
      const blob = await response.blob();
      zip.file(`frame_${frame.index}.jpg`, blob, { binary: true });
    }
    
    // Create CSV with AI data
    const csvData = [
      ['Frame Index', 'AI Description', 'AI Prompt'],
      ...capturedFrames.map(frame => [
        frame.index.toString(),
        frame.aiDescription || '',
        frame.aiPrompt || ''
      ])
    ];
    
    const csvContent = csvData.map(row => 
      row.map(field => `"${field.replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    zip.file('ai_analysis.csv', csvContent);
    
    // Create JSON metadata
    const metadata = {
      exportDate: new Date().toISOString(),
      totalFrames: capturedFrames.length,
      framesWithAI: capturedFrames.filter(f => f.aiDescription || f.aiPrompt).length,
      videoAspectRatio,
      frames: capturedFrames.map(frame => ({
        index: frame.index,
        hasAIDescription: !!frame.aiDescription,
        hasAIPrompt: !!frame.aiPrompt,
        aiDescription: frame.aiDescription,
        aiPrompt: frame.aiPrompt
      }))
    };
    
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));
    
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frame-sniper-export.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (capturedFrames.length === 0) {
      toast({
        title: 'No frames to export',
        description: 'Please capture some frames before exporting.',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      switch (exportFormat) {
        case 'pdf':
          await generatePDF();
          break;
        case 'docx':
          await generateDOCX();
          break;
        case 'zip':
        default:
          await generateZIP();
          break;
      }
      toast({
        title: 'Export successful!',
        description: `Frames exported as ${exportFormat.toUpperCase()}.`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export failed',
        description: 'Could not export frames. Please try again.',
        variant: 'destructive',
      });
    }
    setIsExporting(false);
  };

  const handleTextEdit = (frameIndex: number, field: 'aiDescription' | 'aiPrompt', value: string) => {
    onUpdateFrame(frameIndex, { [field]: value });
  };

  const handleDownloadFrame = async (frame: CapturedFrame) => {
    try {
      const response = await fetch(frame.dataUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `frame_${frame.index}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: `Frame ${frame.index} downloaded!` });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: 'Download Failed',
        description: 'Could not download the frame. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const progress = smartProcessor.getProgress();

  return (
    <div className="space-y-4 mt-4">
      {/* Simple status indicator when processing */}
      {progress.phase === 'processing' && (
        <div className="bg-card border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing {progress.completedFrames}/{progress.totalFrames} frames</span>
            </div>
            <Button variant="outline" size="sm" onClick={smartProcessor.stopProcessing}>
              <StopCircle className="mr-2 h-4 w-4" />
              Stop
            </Button>
          </div>
        </div>
      )}

      <Card className="w-full bg-card/95">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>AI Frame Analysis ({capturedFrames.length} frames)</CardTitle>
          <div className="flex flex-shrink-0 items-center gap-2">
            {progress.phase === 'processing' && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={smartProcessor.stopProcessing}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Stop
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClear} disabled={capturedFrames.length === 0 || progress.phase === 'processing'}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All
            </Button>
            <Button onClick={handleExport} disabled={isExporting || capturedFrames.length === 0 || progress.phase === 'processing'} size="sm">
                {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                <FileDown className="mr-2 h-4 w-4" />
                )}
                Export {exportFormat.toUpperCase()}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button 
              onClick={handleAnalyzeAll} 
              variant="outline" 
              size="sm"
              disabled={
                capturedFrames.length === 0 || 
                progress.phase === 'processing' ||
                capturedFrames.every(f => f.aiDescription || smartProcessor.getFrameState(f.index).isAnalyzing)
              }
            >
              <Brain className="mr-2 h-4 w-4" />
              Analyze All Frames
            </Button>
            <Button 
              onClick={handleGenerateAllPrompts} 
              variant="outline" 
              size="sm"
              disabled={
                capturedFrames.length === 0 || 
                progress.phase === 'processing' ||
                capturedFrames.every(f => f.aiPrompt || smartProcessor.getFrameState(f.index).isGeneratingPrompt)
              }
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Generate All Prompts
            </Button>
            <Button 
              onClick={smartProcessor.retryFailedFrames} 
              variant="outline" 
              size="sm"
              disabled={progress.phase === 'processing' || progress.failedFrames === 0}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Failed ({progress.failedFrames})
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Select 
                value={exportFormat} 
                onValueChange={(value: ExportFormat) => setExportFormat(value)}
                disabled={progress.phase === 'processing'}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zip">ZIP</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
                {capturedFrames.map((frame) => {
                  const frameState = smartProcessor.getFrameState(frame.index);
                  return (
                    <TableRow key={frame.index}>
                       <TableCell className="p-3">
                         <div className="flex flex-col items-center gap-2">
                           <div className="relative">
                             <div
                                className="cursor-pointer rounded overflow-hidden border border-border shadow-md bg-muted"
                                style={{
                                  width: videoAspectRatio > 1 ? '128px' : '80px',
                                  height: videoAspectRatio > 1 ? '72px' : '144px'
                                }}
                               onClick={() => setSelectedFrame({ frameIndex: frame.index, dataUrl: frame.dataUrl })}
                             >
                               <img
                                 src={frame.dataUrl}
                                 alt={`Frame ${frame.index}`}
                                 className="w-full h-full object-cover object-center hover:opacity-80 transition-opacity"
                               />
                             </div>
                             <Badge variant="secondary" className="absolute -top-1 -right-1 text-xs px-1.5 py-0.5">
                               #{frame.index}
                             </Badge>
                           </div>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDownloadFrame(frame)}
                              className="h-8 w-8"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                         </div>
                       </TableCell>
                      <TableCell className="p-2">
                         <div className="space-y-2">
                           {frameState.isAnalyzing ? (
                             <div className="space-y-2">
                               <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                   <Loader2 className="h-4 w-4 animate-spin" />
                                   Analyzing...
                                    {frameState.isFromCache && (
                                      <Hash className="h-3 w-3 text-blue-500" />
                                    )}
                                 </div>
                                  {frameState.canStop && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => smartProcessor.stopProcessing()}
                                      className="h-6 w-6"
                                      title="Stop analysis"
                                    >
                                      <StopCircle className="h-3 w-3" />
                                    </Button>
                                  )}
                               </div>
                             </div>
                           ) : frame.aiDescription ? (
                             <div className="space-y-2">
                               <CopyableTextarea
                                 value={frame.aiDescription}
                                 onChange={(value) => handleTextEdit(frame.index, 'aiDescription', value)}
                                 placeholder="AI description will appear here..."
                               />
                               {frameState.isFromCache && (
                                 <div className="text-xs text-blue-600 flex items-center gap-1">
                                   <Hash className="h-3 w-3" />
                                   Loaded from cache
                                 </div>
                               )}
                             </div>
                           ) : (
                             <div className="flex items-center justify-center gap-2">
                               <Button
                                 variant="outline"
                                 size="sm"
                                  onClick={() => handleAnalyzeFrame(frame)}
                                  className="w-full"
                                  disabled={progress.phase === 'processing'}
                               >
                                 {frameState.error ? (
                                   <RefreshCw className="mr-2 h-4 w-4 text-orange-500" />
                                 ) : (
                                   <Brain className="mr-2 h-4 w-4" />
                                 )}
                                 {frameState.error ? 'Retry' : 'Analyze'}
                               </Button>
                             </div>
                           )}
                           {frameState.error && (
                             <div className="space-y-1">
                               <div className="text-xs text-red-500 flex items-center gap-1">
                                 <AlertCircle className="h-3 w-3" />
                                 {frameState.error}
                               </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAnalyzeFrame(frame)}
                                  className="h-6 text-xs"
                                >
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                  Retry
                                </Button>
                             </div>
                           )}
                         </div>
                      </TableCell>
                      <TableCell className="p-2">
                         <div className="space-y-2">
                           {frameState.isGeneratingPrompt ? (
                             <div className="space-y-2">
                               <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                   <Loader2 className="h-4 w-4 animate-spin" />
                                   Generating...
                                 </div>
                                  {frameState.canStop && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => smartProcessor.stopProcessing()}
                                      className="h-6 w-6"
                                      title="Stop generation"
                                    >
                                      <StopCircle className="h-3 w-3" />
                                    </Button>
                                  )}
                               </div>
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
                                  disabled={progress.phase === 'processing'}
                               >
                                 {frameState.error ? (
                                   <RefreshCw className="mr-2 h-4 w-4 text-orange-500" />
                                 ) : (
                                   <Sparkles className="mr-2 h-4 w-4" />
                                 )}
                                 {frameState.error ? 'Retry' : 'Generate'}
                               </Button>
                             </div>
                           )}
                           {frameState.error && (
                             <div className="space-y-1">
                               <div className="text-xs text-red-500 flex items-center gap-1">
                                 <AlertCircle className="h-3 w-3" />
                                 {frameState.error}
                               </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleGeneratePrompt(frame)}
                                  className="h-6 text-xs"
                                >
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                  Retry
                                </Button>
                             </div>
                           )}
                         </div>
                      </TableCell>
                       <TableCell className="p-2">
                         <div className="flex flex-col items-center gap-1">
                           <Button
                             variant="ghost"
                             size="icon"
                             onClick={() => onDelete(frame)}
                             className="h-8 w-8 text-muted-foreground hover:text-destructive"
                             title={`Delete frame ${frame.index}`}
                           >
                             <X className="h-4 w-4" />
                           </Button>
                            {frameState.error && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => smartProcessor.clearFrameState(frame.index)}
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                title="Clear error state"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            )}
                         </div>
                       </TableCell>
                    </TableRow>
                  );
                })}
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

      {/* Frame Popup Dialog */}
      <Dialog open={!!selectedFrame} onOpenChange={() => setSelectedFrame(null)}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>Frame {selectedFrame?.frameIndex}</DialogTitle>
          </DialogHeader>
          {selectedFrame && (
            <div className="flex justify-center">
              <AspectRatio ratio={videoAspectRatio} className="max-w-full max-h-[70vh]">
                <img
                  src={selectedFrame.dataUrl}
                  alt={`Frame ${selectedFrame.frameIndex}`}
                  className="w-full h-full object-contain rounded-lg"
                />
              </AspectRatio>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};