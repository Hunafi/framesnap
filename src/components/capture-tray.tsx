"use client";

import type { FC } from 'react';
import { useState } from 'react';
import { Download, Loader2, Trash2, X, Brain, Sparkles, Edit3, FileDown, Copy, FileText, FileImage, AlertCircle, CheckCircle, XCircle, Pause, Play, RefreshCw } from 'lucide-react';
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
import { useAIBatchAnalysis } from '@/hooks/use-ai-batch-analysis';
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
  const { 
    analyzeFrame, 
    generatePrompt, 
    analyzeAllFrames, 
    generateAllPrompts, 
    cancelBatchOperation, 
    getFrameState, 
    batchProgress,
    clearFrameState 
  } = useAIBatchAnalysis();

  const handleAnalyzeFrame = async (frame: CapturedFrame) => {
    try {
      const description = await analyzeFrame(frame.index, frame.dataUrl);
      if (description) {
        onUpdateFrame(frame.index, { aiDescription: description });
        toast({ title: 'Frame analyzed successfully!' });
      } else {
        const frameState = getFrameState(frame.index);
        if (frameState.error) {
          toast({
            title: 'Analysis Failed',
            description: frameState.error,
            variant: 'destructive',
          });
        }
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
      const prompt = await generatePrompt(frame.index, frame.dataUrl, frame.aiDescription);
      if (prompt) {
        onUpdateFrame(frame.index, { aiPrompt: prompt });
        toast({ title: 'AI prompt generated successfully!' });
      } else {
        const frameState = getFrameState(frame.index);
        if (frameState.error) {
          toast({
            title: 'Prompt Generation Failed',
            description: frameState.error,
            variant: 'destructive',
          });
        }
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
      .filter(f => !f.aiDescription && !getFrameState(f.index).isAnalyzing)
      .map(f => ({ index: f.index, dataUrl: f.dataUrl }));
    
    if (framesToAnalyze.length === 0) {
      toast({ title: 'No frames to analyze', description: 'All frames already have descriptions.' });
      return;
    }

    await analyzeAllFrames(framesToAnalyze);
    
    // Update frames with results
    framesToAnalyze.forEach(frame => {
      const frameState = getFrameState(frame.index);
      if (!frameState.isAnalyzing && !frameState.error) {
        // Frame was processed successfully, we need to check the actual result in the callback
        setTimeout(() => {
          const capturedFrame = capturedFrames.find(f => f.index === frame.index);
          if (capturedFrame?.aiDescription) {
            // Success case is handled in the individual frame callback
          }
        }, 100);
      }
    });

    toast({ 
      title: 'Batch Analysis Complete', 
      description: `Processed ${framesToAnalyze.length} frames. Check progress below.` 
    });
  };

  const handleGenerateAllPrompts = async () => {
    const framesToProcess = capturedFrames
      .filter(f => !f.aiPrompt && !getFrameState(f.index).isGeneratingPrompt)
      .map(f => ({ index: f.index, dataUrl: f.dataUrl, aiDescription: f.aiDescription }));
    
    if (framesToProcess.length === 0) {
      toast({ title: 'No frames to process', description: 'All frames already have AI prompts.' });
      return;
    }

    await generateAllPrompts(framesToProcess);
    
    toast({ 
      title: 'Batch Prompt Generation Complete', 
      description: `Processed ${framesToProcess.length} frames. Check progress below.` 
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

  return (
    <Card className="w-full bg-card/95 mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>AI Frame Analysis ({capturedFrames.length} frames)</CardTitle>
        <div className="flex flex-shrink-0 items-center gap-2">
          {batchProgress.isRunning && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={cancelBatchOperation}
              disabled={!batchProgress.canCancel}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClear} disabled={capturedFrames.length === 0 || batchProgress.isRunning}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All
          </Button>
          <Button onClick={handleExport} disabled={isExporting || capturedFrames.length === 0 || batchProgress.isRunning} size="sm">
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
        {/* Batch Progress Indicator */}
        {batchProgress.isRunning && (
          <div className="mb-4 rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">Processing frames...</span>
              </div>
              <Badge variant="outline">
                {batchProgress.completed + batchProgress.failed}/{batchProgress.total}
              </Badge>
            </div>
            <Progress 
              value={(batchProgress.completed + batchProgress.failed) / batchProgress.total * 100} 
              className="mb-2" 
            />
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                {batchProgress.completed} completed
              </span>
              {batchProgress.failed > 0 && (
                <span className="flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-500" />
                  {batchProgress.failed} failed
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button 
            onClick={handleAnalyzeAll} 
            variant="outline" 
            size="sm"
            disabled={
              capturedFrames.length === 0 || 
              batchProgress.isRunning ||
              capturedFrames.every(f => f.aiDescription || getFrameState(f.index).isAnalyzing)
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
              batchProgress.isRunning ||
              capturedFrames.every(f => f.aiPrompt || getFrameState(f.index).isGeneratingPrompt)
            }
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate All Prompts
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Select 
              value={exportFormat} 
              onValueChange={(value: ExportFormat) => setExportFormat(value)}
              disabled={batchProgress.isRunning}
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
                  const frameState = getFrameState(frame.index);
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
                                disabled={batchProgress.isRunning}
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
                            <div className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {frameState.error}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="p-2">
                        <div className="space-y-2">
                          {frameState.isGeneratingPrompt ? (
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
                                disabled={batchProgress.isRunning}
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
                            <div className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {frameState.error}
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
                               onClick={() => clearFrameState(frame.index)}
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
    </Card>
  );
};