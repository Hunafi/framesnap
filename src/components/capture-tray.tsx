
"use client";

import type { FC } from 'react';
import { useState } from 'react';
import { Download, Loader2, Trash2, X, RefreshCw, FileDown, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } from 'docx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useSmartAIProcessor } from '@/hooks/use-smart-ai-processor';
import { supabase } from '@/integrations/supabase/client';

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
  const [selectedFrame, setSelectedFrame] = useState<{ frameIndex: number; dataUrl: string } | null>(null);
  const { toast } = useToast();
  const smartProcessor = useSmartAIProcessor(onUpdateFrame);

  // Helper function to base64 encode images for export
  const getBase64FromDataUrl = (dataUrl: string): string => {
    return dataUrl.split(',')[1];
  };

  const generatePDF = async () => {
    const pdf = new jsPDF();
    const pageHeight = pdf.internal.pageSize.height;
    const margin = 20;
    let yPosition = margin;
    
    // Helper function to check if content fits on current page
    const checkPageSpace = (requiredHeight: number) => {
      if (yPosition + requiredHeight > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
    };
    
    // Title
    pdf.setFontSize(20);
    pdf.text('Frame Sniper - Captured Frames Report', margin, yPosition);
    yPosition += 25;
    
    for (let i = 0; i < capturedFrames.length; i++) {
      const frame = capturedFrames[i];
      
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
      
      // Calculate content heights
      const frameHeaderHeight = 15;
      const imageHeight = imgHeight + 10;
      
      let descriptionHeight = 0;
      if (frame.aiDescription) {
        const descLines = pdf.splitTextToSize(frame.aiDescription, 170);
        descriptionHeight = 10 + (descLines.length * 4) + 8;
      }
      
      let promptHeight = 0;
      if (frame.aiPrompt) {
        const promptLines = pdf.splitTextToSize(frame.aiPrompt, 170);
        promptHeight = 10 + (promptLines.length * 4) + 8;
      }
      
      let generatedImageHeight = 0;
      if (frame.generatedImageUrl) {
        generatedImageHeight = imageHeight + 10; // Same height as original + header
      }
      
      const totalContentHeight = frameHeaderHeight + imageHeight + descriptionHeight + promptHeight + generatedImageHeight + 15;
      
      // Check if we need a new page for this frame
      checkPageSpace(totalContentHeight);
      
      // Frame header
      pdf.setFontSize(14);
      pdf.text(`Frame ${frame.index}`, margin, yPosition);
      yPosition += frameHeaderHeight;
      
      // Add original image
      try {
        pdf.addImage(frame.dataUrl, 'JPEG', margin, yPosition, imgWidth, imgHeight);
      } catch (error) {
        console.error('Failed to add image to PDF:', error);
      }
      yPosition += imageHeight;
      
      // AI Description
      if (frame.aiDescription) {
        checkPageSpace(descriptionHeight);
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text('AI Description:', margin, yPosition);
        yPosition += 6;
        
        pdf.setFont(undefined, 'normal');
        const descLines = pdf.splitTextToSize(frame.aiDescription, 170);
        pdf.text(descLines, margin, yPosition);
        yPosition += descLines.length * 4 + 8;
      }
      
      // AI Prompt
      if (frame.aiPrompt) {
        checkPageSpace(promptHeight);
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text('AI Prompt:', margin, yPosition);
        yPosition += 6;
        
        pdf.setFont(undefined, 'normal');
        const promptLines = pdf.splitTextToSize(frame.aiPrompt, 170);
        pdf.text(promptLines, margin, yPosition);
        yPosition += promptLines.length * 4 + 8;
      }
      
      // Generated Image
      if (frame.generatedImageUrl) {
        checkPageSpace(generatedImageHeight);
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text('AI Generated Image:', margin, yPosition);
        yPosition += 6;
        
        try {
          pdf.addImage(frame.generatedImageUrl, 'JPEG', margin, yPosition, imgWidth, imgHeight);
        } catch (error) {
          console.error('Failed to add generated image to PDF:', error);
        }
        yPosition += imgHeight + 8;
      }
      
      yPosition += 15; // Extra spacing between frames
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
      
      // Generated Image
      if (frame.generatedImageUrl) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: 'AI Generated Image:',
                bold: true,
              }),
            ],
          })
        );
        
        try {
          const base64Data = getBase64FromDataUrl(frame.generatedImageUrl);
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
          console.error('Failed to add generated image to DOCX:', error);
        }
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
    
    // Add original images
    for (const frame of capturedFrames) {
      const response = await fetch(frame.dataUrl);
      const blob = await response.blob();
      zip.file(`frame_${frame.index}.jpg`, blob, { binary: true });
    }
    
    // Add generated images
    for (const frame of capturedFrames) {
      if (frame.generatedImageUrl) {
        try {
          const response = await fetch(frame.generatedImageUrl);
          const blob = await response.blob();
          zip.file(`frame_${frame.index}_generated.jpg`, blob, { binary: true });
        } catch (error) {
          console.error(`Failed to add generated image for frame ${frame.index}:`, error);
        }
      }
    }
    
    // Create CSV with AI data
    const csvData = [
      ['Frame Index', 'AI Description', 'AI Prompt', 'Has Generated Image'],
      ...capturedFrames.map(frame => [
        frame.index.toString(),
        frame.aiDescription || '',
        frame.aiPrompt || '',
        frame.generatedImageUrl ? 'Yes' : 'No'
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
      framesWithGeneratedImages: capturedFrames.filter(f => f.generatedImageUrl).length,
      videoAspectRatio,
      frames: capturedFrames.map(frame => ({
        index: frame.index,
        hasAIDescription: !!frame.aiDescription,
        hasAIPrompt: !!frame.aiPrompt,
        hasGeneratedImage: !!frame.generatedImageUrl,
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

  const handleGenerateImage = async (frameIndex: number, prompt: string) => {
    if (!prompt) {
      toast({
        title: 'No prompt available',
        description: 'Generate an AI prompt first.',
        variant: 'destructive',
      });
      return;
    }

    onUpdateFrame(frameIndex, { isGeneratingImage: true });

    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt }
      });

      if (error) throw error;

      if (data?.imageUrl) {
        onUpdateFrame(frameIndex, { 
          generatedImageUrl: data.imageUrl,
          isGeneratingImage: false 
        });
        toast({ title: 'Image generated successfully!' });
      } else {
        throw new Error('No image URL returned');
      }
    } catch (error) {
      console.error('Image generation error:', error);
      onUpdateFrame(frameIndex, { isGeneratingImage: false });
      toast({
        title: 'Image Generation Failed',
        description: error instanceof Error ? error.message : 'Could not generate image. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadGeneratedImage = async (frame: CapturedFrame) => {
    if (!frame.generatedImageUrl) return;

    try {
      const response = await fetch(frame.generatedImageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `frame_${frame.index}_generated.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: `Generated image for frame ${frame.index} downloaded!` });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: 'Download Failed',
        description: 'Could not download the generated image.',
        variant: 'destructive',
      });
    }
  };

  const progress = smartProcessor.getProgress();

  return (
    <div className="space-y-4 mt-4">
      <Card className="w-full bg-card/95">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Captured Frames ({capturedFrames.length})</CardTitle>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClear} disabled={capturedFrames.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All
            </Button>
            <Select 
              value={exportFormat} 
              onValueChange={(value: ExportFormat) => setExportFormat(value)}
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
            <Button onClick={handleExport} disabled={isExporting || capturedFrames.length === 0} size="sm">
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
          {progress.failedFrames > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <Button 
                onClick={smartProcessor.retryFailedFrames} 
                variant="outline" 
                size="sm"
                disabled={progress.phase === 'processing'}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry Failed ({progress.failedFrames})
              </Button>
            </div>
          )}

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
                                 </div>
                               </div>
                             </div>
                           ) : frame.aiDescription ? (
                             <div className="space-y-2">
                               <CopyableTextarea
                                 value={frame.aiDescription}
                                 onChange={(value) => handleTextEdit(frame.index, 'aiDescription', value)}
                                 placeholder="AI description will appear here..."
                               />
                             </div>
                           ) : (
                             <div className="text-sm text-muted-foreground text-center py-4">
                               AI analysis will happen automatically when you capture frames
                             </div>
                           )}
                           {frameState.error && (
                             <div className="space-y-1">
                               <div className="text-xs text-red-500 flex items-center gap-1">
                                 <AlertCircle className="h-3 w-3" />
                                 {frameState.error}
                               </div>
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
                                </div>
                              </div>
                            ) : frame.aiPrompt ? (
                              <>
                                <CopyableTextarea
                                  value={frame.aiPrompt}
                                  onChange={(value) => handleTextEdit(frame.index, 'aiPrompt', value)}
                                  placeholder="AI prompt will appear here..."
                                  showGenerateButton={true}
                                  onGenerateImage={() => handleGenerateImage(frame.index, frame.aiPrompt!)}
                                  isGeneratingImage={frame.isGeneratingImage}
                                />
                                {frame.generatedImageUrl && (
                                  <div className="space-y-2 mt-3">
                                    <div className="text-xs font-semibold text-muted-foreground">Generated Image:</div>
                                    <div className="relative group">
                                      <div className="rounded overflow-hidden border border-border shadow-md bg-muted">
                                        <img
                                          src={frame.generatedImageUrl}
                                          alt={`Generated from frame ${frame.index}`}
                                          className="w-full h-auto object-cover"
                                        />
                                      </div>
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleDownloadGeneratedImage(frame)}
                                        className="mt-2 w-full"
                                      >
                                        <Download className="mr-2 h-4 w-4" />
                                        Download Generated
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-muted-foreground text-center py-4">
                                AI prompts will be generated automatically after analysis
                              </div>
                            )}
                            {frameState.error && (
                              <div className="space-y-1">
                                <div className="text-xs text-red-500 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {frameState.error}
                                </div>
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
            Capture frames from your video to start automatic AI analysis
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
