"use client";

import type { FC } from 'react';
import { useState } from 'react';
import { Download, Loader2, Trash2, X } from 'lucide-react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { CapturedFrame } from './frameflow';


interface CaptureTrayProps {
  capturedFrames: CapturedFrame[];
  onClear: () => void;
  onDelete: (frame: CapturedFrame) => void;
}

export const CaptureTray: FC<CaptureTrayProps> = ({ capturedFrames, onClear, onDelete }) => {
  const [isZipping, setIsZipping] = useState(false);
  const { toast } = useToast();

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
      for (const frame of capturedFrames) {
        const response = await fetch(frame.dataUrl);
        const blob = await response.blob();
        zip.file(`frame_${frame.index}.jpg`, blob, { binary: true });
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'FrameSniper_captures.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error zipping files:', error);
      toast({
        title: 'Error',
        description: 'Could not create the ZIP file. Please try again.',
        variant: 'destructive',
      });
    }
    setIsZipping(false);
  };

  return (
    <Card className="w-full bg-card/95 mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Captured Frames ({capturedFrames.length})</CardTitle>
        <div className="flex flex-shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClear} disabled={capturedFrames.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All
            </Button>
            <Button onClick={handleDownload} disabled={isZipping || capturedFrames.length === 0} size="sm">
                {isZipping ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                <Download className="mr-2 h-4 w-4" />
                )}
                Download ZIP
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 w-full whitespace-nowrap rounded-md border bg-background">
          <div className="flex w-max space-x-4 p-4">
            {capturedFrames.length > 0 ? (
              capturedFrames.map((frame, i) => (
                <figure key={`${frame.index}-${i}`} className="group relative shrink-0">
                  <div className="overflow-hidden rounded-md shadow-lg transition-all duration-300 group-hover:ring-2 group-hover:ring-accent group-hover:ring-offset-2 group-hover:ring-offset-background">
                    <img
                      src={frame.dataUrl}
                      alt={`Captured frame ${frame.index}`}
                      className="aspect-video h-36 w-auto object-cover transition-transform group-hover:scale-105"
                      width={256}
                      height={144}
                      data-ai-hint="video frame"
                    />
                  </div>
                  <figcaption className="absolute bottom-0 w-full rounded-b-md bg-black/60 p-1.5 text-center text-xs text-white backdrop-blur-sm">
                    Frame {frame.index}
                  </figcaption>
                   <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -right-2 -top-2 z-10 h-7 w-7 rounded-full opacity-0 shadow-lg transition-all group-hover:opacity-100 group-hover:scale-110"
                    onClick={() => onDelete(frame)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </figure>
              ))
            ) : (
              <div className="flex h-40 w-full items-center justify-center text-sm text-muted-foreground">
                Your captured frames will appear here.
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
};