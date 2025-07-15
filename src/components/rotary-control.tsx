"use client";

import { useRef, type FC, useEffect } from 'react';
import { Camera, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface RotaryControlProps {
  currentFrame: number;
  totalFrames: number;
  onCapture: () => void;
  onFrameChange: (newFrame: number) => void;
}

export const RotaryControl: FC<RotaryControlProps> = ({
  currentFrame,
  totalFrames,
  onCapture,
  onFrameChange,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);

  const rotation = totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 360 * 2 : 0;
  
  const handlePrev = () => {
    onFrameChange(Math.max(0, currentFrame - 1));
  }
  
  const handleNext = () => {
    onFrameChange(Math.min(totalFrames - 1, currentFrame + 1));
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') {
            handlePrev();
        } else if (e.key === 'ArrowRight') {
            handleNext();
        } else if (e.key === ' ') {
            e.preventDefault();
            onCapture();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame, totalFrames, onCapture]);

  return (
    <div className="flex w-full items-center justify-center gap-4 py-4">
       <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handlePrev} disabled={currentFrame === 0}>
                <ArrowLeft />
              </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Previous Frame (Left Arrow)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
             <div
              ref={wheelRef}
              className="relative flex h-40 w-40 items-center justify-center rounded-full"
            >
              {/* Outer Ring */}
              <div className="absolute h-full w-full rounded-full border-2 border-primary/20 bg-transparent"></div>
              
              {/* Middle Ring */}
              <div className="absolute h-[75%] w-[75%] rounded-full border-2 border-primary/30 bg-transparent"></div>

              {/* Crosshair lines */}
              <div className="absolute h-full w-px bg-gradient-to-b from-primary/0 via-primary/50 to-primary/0"></div>
              <div className="absolute w-full h-px bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0"></div>

              {/* Rotating inner ring */}
              <div
                className="absolute h-[50%] w-[50%] rounded-full transition-transform duration-75 ease-linear"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                 <div className="absolute left-1/2 top-[-4px] h-2 w-px -translate-x-1/2 rounded-full bg-primary"></div>
              </div>
              
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  'z-10 h-24 w-24 rounded-full border-2 border-primary/50 bg-transparent text-primary transition hover:scale-105 hover:bg-primary/10'
                )}
                onClick={onCapture}
                disabled={totalFrames === 0}
              >
                <Camera className="h-10 w-10" />
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Capture Frame (Spacebar)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={handleNext} disabled={currentFrame === totalFrames - 1}>
              <ArrowRight />
            </Button>
          </TooltipTrigger>
           <TooltipContent side="bottom">
            <p>Next Frame (Right Arrow)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};