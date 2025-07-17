"use client";

import type { FC } from 'react';
import { useState } from 'react';
import { Download, Loader2, Trash2, X, Brain, Sparkles, Edit3, FileDown, Copy, FileText, FileImage } from 'lucide-react';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } from 'docx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAIAnalysis } from '@/hooks/use-ai-analysis';
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

  const generatePDF = async (): Promise<void> => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;

    // Title
    pdf.setFontSize(20);
    pdf.text('Frame Sniper AI Analysis Report', margin, yPosition);
    yPosition += 20;

    // Metadata
    pdf.setFontSize(12);
    pdf.text(`Export Date: ${new Date().toLocaleDateString()}`, margin, yPosition);
    yPosition += 10;
    pdf.text(`Total Frames: ${capturedFrames.length}`, margin, yPosition);
    yPosition += 20;

    // Process each frame
    for (let i = 0; i < capturedFrames.length; i++) {
      const frame = capturedFrames[i];
      
      // Check if we need a new page
      if (yPosition > pageHeight - 100) {
        pdf.addPage();
        yPosition = margin;
      }

      // Frame header
      pdf.setFontSize(16);
      pdf.text(`Frame ${frame.index}`, margin, yPosition);
      yPosition += 15;

      // Add frame image (small thumbnail)
      try {
        const imgData = frame.dataUrl;
        pdf.addImage(imgData, 'JPEG', margin, yPosition, 60, 34);
        yPosition += 45;
      } catch (error) {
        console.warn(`Could not add image for frame ${frame.index}:`, error);
      }

      // AI Description
      if (frame.aiDescription) {
        pdf.setFontSize(14);
        pdf.text('AI Description:', margin, yPosition);
        yPosition += 8;
        pdf.setFontSize(10);
        const descLines = pdf.splitTextToSize(frame.aiDescription, pageWidth - 2 * margin);
        pdf.text(descLines, margin, yPosition);
        yPosition += descLines.length * 5 + 10;
      }

      // AI Prompt
      if (frame.aiPrompt) {
        pdf.setFontSize(14);
        pdf.text('AI Prompt:', margin, yPosition);
        yPosition += 8;
        pdf.setFontSize(10);
        const promptLines = pdf.splitTextToSize(frame.aiPrompt, pageWidth - 2 * margin);
        pdf.text(promptLines, margin, yPosition);
        yPosition += promptLines.length * 5 + 15;
      }

      yPosition += 10; // Extra spacing between frames
    }

    pdf.save('FrameSniper_AI_Analysis.pdf');
  };

  const generateDOCX = async (): Promise<void> => {
    const children: any[] = [];

    // Title
    children.push(
      new Paragraph({
        text: 'Frame Sniper AI Analysis Report',
        heading: HeadingLevel.TITLE,
      })
    );

    // Metadata
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Export Date: ${new Date().toLocaleDateString()}`,
            break: 1,
          }),
          new TextRun({
            text: `Total Frames: ${capturedFrames.length}`,
            break: 1,
          }),
        ],
      })
    );

    // Process each frame
    for (const frame of capturedFrames) {
      // Frame header
      children.push(
        new Paragraph({
          text: `Frame ${frame.index}`,
          heading: HeadingLevel.HEADING_1,
        })
      );

      // Add frame image
      try {
        const response = await fetch(frame.dataUrl);
        const imageBuffer = await response.arrayBuffer();
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: new Uint8Array(imageBuffer),
                transformation: {
                  width: 300,
                  height: 169,
                },
              }),
            ],
          })
        );
      } catch (error) {
        console.warn(`Could not add image for frame ${frame.index}:`, error);
      }

      // AI Description
      if (frame.aiDescription) {
        children.push(
          new Paragraph({
            text: 'AI Description:',
            heading: HeadingLevel.HEADING_2,
          })
        );
        children.push(
          new Paragraph({
            text: frame.aiDescription,
          })
        );
      }

      // AI Prompt
      if (frame.aiPrompt) {
        children.push(
          new Paragraph({
            text: 'AI Prompt:',
            heading: HeadingLevel.HEADING_2,
          })
        );
        children.push(
          new Paragraph({
            text: frame.aiPrompt,
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'FrameSniper_AI_Analysis.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateZIP = async (): Promise<void> => {
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
  };

  const handleExport = async () => {
    if (capturedFrames.length === 0) {
      toast({
        title: 'No frames captured',
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
          toast({ title: 'PDF exported successfully!' });
          break;
        case 'docx':
          await generateDOCX();
          toast({ title: 'Word document exported successfully!' });
          break;
        case 'zip':
        default:
          await generateZIP();
          toast({ title: 'ZIP file exported successfully!' });
          break;
      }
    } catch (error) {
      console.error('Error creating export:', error);
      toast({
        title: 'Export Failed',
        description: 'Could not create the export file. Please try again.',
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
      
      toast({ title: `Frame ${frame.index} downloaded successfully!` });
    } catch (error) {
      console.error('Error downloading frame:', error);
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
          
          {/* Export format selector */}
          <Select value={exportFormat} onValueChange={(value: ExportFormat) => setExportFormat(value)}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zip">
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4" />
                  ZIP
                </div>
              </SelectItem>
              <SelectItem value="pdf">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  PDF
                </div>
              </SelectItem>
              <SelectItem value="docx">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  DOC
                </div>
              </SelectItem>
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
                           size="sm"
                           onClick={() => handleDownloadFrame(frame)}
                           className="w-full text-xs"
                         >
                           <Download className="w-3 h-3 mr-1" />
                           Download
                         </Button>
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
                       <div className="flex items-center justify-center">
                         <Button
                           variant="ghost"
                           size="icon"
                           onClick={() => onDelete(frame)}
                           className="h-8 w-8 text-muted-foreground hover:text-destructive"
                           title={`Delete frame ${frame.index}`}
                         >
                           <X className="h-4 w-4" />
                         </Button>
                       </div>
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