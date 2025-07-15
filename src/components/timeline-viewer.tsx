"use client";

import type { FC, WheelEvent } from 'react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Film, GanttChartSquare } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export interface Scene {
  startFrame: number;
  endFrame: number;
}
interface TimelineViewerProps {
  totalFrames: number;
  scenes: Scene[];
  activeScene: Scene | null;
  currentFrameIndex: number;
  onFrameSelect: (index: number) => void;
  onSceneSelect: (scene: Scene) => void;
  getFrameDataUrl: (frameIndex: number, quality?: number) => Promise<string | null>;
}

const FRAME_WIDTH = 128;
const FRAME_HEIGHT = 72;
const SCENE_WIDTH = 160;
const SCENE_HEIGHT = 90;
const VISIBLE_FRAME_BUFFER = 5; 
const TICK_INTERVAL_FRAMES = 30; // 1 second at 30 FPS

export const TimelineViewer: FC<TimelineViewerProps> = ({
  scenes,
  activeScene,
  currentFrameIndex,
  onFrameSelect,
  onSceneSelect,
  getFrameDataUrl,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [frameCache, setFrameCache] = useState<Map<number, string>>(new Map());
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [viewMode, setViewMode] = useState<'scenes' | 'frames'>('scenes');
  
  const isAutoScrolling = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const timelineFrames = useMemo(() => {
    if (viewMode === 'frames' && activeScene) {
      return Array.from({ length: activeScene.endFrame - activeScene.startFrame + 1 }, (_, i) => activeScene.startFrame + i);
    }
    return [];
  }, [viewMode, activeScene]);


  // Pre-fetch scene thumbnails sequentially to avoid race conditions
  useEffect(() => {
    let isCancelled = false;

    const loadSceneThumbs = async () => {
        const newCache = new Map(frameCache);
        let updated = false;
        // Use a sequential for-loop to prevent race conditions
        for (const scene of scenes) {
            if (isCancelled) return;
            if (!newCache.has(scene.startFrame)) {
                try {
                    const dataUrl = await getFrameDataUrl(scene.startFrame, 0.5);
                    if (dataUrl && !isCancelled) {
                        newCache.set(scene.startFrame, dataUrl);
                        updated = true;
                        // a small re-render to show progress
                        setFrameCache(new Map(newCache));
                    }
                } catch(e) {
                    if (!isCancelled) console.error(`Could not fetch thumbnail for scene at frame ${scene.startFrame}`, e)
                }
            }
        }
    }
    if(scenes.length > 0 && viewMode === 'scenes') {
        loadSceneThumbs();
    }

    return () => { isCancelled = true; }
  }, [scenes, getFrameDataUrl, viewMode]);

  const updateVisibleRange = useCallback(() => {
    if (!scrollContainerRef.current || viewMode !== 'frames' || !activeScene) return;

    const { scrollLeft, clientWidth } = scrollContainerRef.current;
    const startIndex = Math.max(0, Math.floor(scrollLeft / FRAME_WIDTH) - VISIBLE_FRAME_BUFFER);
    const endIndex = Math.min(
      timelineFrames.length - 1,
      Math.ceil((scrollLeft + clientWidth) / FRAME_WIDTH) + VISIBLE_FRAME_BUFFER
    );
    
    if (startIndex !== visibleRange.start || endIndex !== visibleRange.end) {
        setVisibleRange({ start: startIndex, end: endIndex });
    }
  }, [viewMode, activeScene, timelineFrames, visibleRange.start, visibleRange.end]);
  
  // Initial visible range calculation
  useEffect(() => {
    setFrameCache(new Map());
    if (viewMode === 'frames' && activeScene) {
      // Initially show all frames or a reasonable range
      const totalFrames = activeScene.endFrame - activeScene.startFrame + 1;
      setVisibleRange({ start: 0, end: Math.min(totalFrames - 1, 20) }); // Show first 20 frames initially
    }
  }, [activeScene, viewMode]);

  const visibleFrames = useMemo(() => {
     if (viewMode === 'frames') {
        return timelineFrames.slice(visibleRange.start, visibleRange.end + 1);
     }
     return [];
  }, [viewMode, timelineFrames, visibleRange]);
  
  // Pre-fetch individual frame thumbnails when in frame view
  useEffect(() => {
    let isCancelled = false;
    const loadVisibleFrames = async () => {
      const framesToLoad = visibleFrames.filter(frameIndex => !frameCache.has(frameIndex));
      if (framesToLoad.length === 0) return;

      const newCache = new Map(frameCache);
       for (const frameIndex of framesToLoad) {
          if (isCancelled) return;
          try {
              const dataUrl = await getFrameDataUrl(frameIndex, 0.5);
              if (dataUrl && !isCancelled) {
                  newCache.set(frameIndex, dataUrl);
                  // Re-render to show progress
                  setFrameCache(new Map(newCache));
              }
          } catch(e) {
              if(!isCancelled) console.error(`Could not fetch thumbnail for frame ${frameIndex}`, e)
          }
      }
    };

    if(visibleFrames.length > 0) {
      loadVisibleFrames();
    }

    return () => { isCancelled = true; }
  }, [visibleFrames, getFrameDataUrl, frameCache]);


  useEffect(() => {
    if (scrollContainerRef.current && viewMode === 'frames' && activeScene) {
      const container = scrollContainerRef.current;
      const relativeIndex = currentFrameIndex - activeScene.startFrame;
      const targetScrollLeft = (relativeIndex * FRAME_WIDTH) - (container.offsetWidth / 2) + (FRAME_WIDTH / 2);
      
      isAutoScrolling.current = true;
      
      container.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      
      const timer = setTimeout(() => { 
        isAutoScrolling.current = false;
        updateVisibleRange();
      }, 500); // Wait for smooth scroll to finish
      
      return () => clearTimeout(timer);
    }
  }, [currentFrameIndex, viewMode, activeScene, updateVisibleRange]);

  const handleScroll = () => {
    if(scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    
    if (!isAutoScrolling.current && viewMode === 'frames' && activeScene) {
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const centerOfViewport = container.scrollLeft + (container.offsetWidth / 2);
        const centerFrameRelativeIndex = Math.round(centerOfViewport / FRAME_WIDTH);
        
        const centerFrameIndex = activeScene.startFrame + centerFrameRelativeIndex;
        const clampedIndex = Math.max(activeScene.startFrame, Math.min(activeScene.endFrame, centerFrameIndex));
        if (clampedIndex !== currentFrameIndex) {
            onFrameSelect(clampedIndex);
        }
      });
    }

    scrollTimeoutRef.current = setTimeout(() => {
      updateVisibleRange();
    }, 150);
  };
  
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && scrollContainerRef.current) {
        e.preventDefault();
        isAutoScrolling.current = false; // Allow user scroll to interrupt auto-scroll
        scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleSceneClick = (scene: Scene) => {
    onSceneSelect(scene);
    setVisibleRange({start: 0, end: 0}); // Reset visible range
    setViewMode('frames');
  };

  const handleShowScenes = () => {
    setViewMode('scenes');
    if (scenes.length > 0) {
        // Don't change active scene, just view mode
    }
  };

  const renderTimelineTicks = () => {
      if (!activeScene) return null;
      const FPS = 30;
      const ticks: JSX.Element[] = [];
      const numTicks = Math.floor((activeScene.endFrame - activeScene.startFrame) / TICK_INTERVAL_FRAMES);

      for(let i=0; i <= numTicks; i++) {
          const frame = activeScene.startFrame + i * TICK_INTERVAL_FRAMES;
          if (frame > activeScene.endFrame) continue;

          const time = frame / FPS;
          ticks.push(
              <div key={`tick-${i}`} className="absolute top-0 text-xs text-muted-foreground" style={{ left: `${(frame - activeScene.startFrame) * FRAME_WIDTH + FRAME_WIDTH/2}px`}}>
                  |
                  <span className="absolute left-1/2 top-full -translate-x-1/2 pt-1">{time.toFixed(1)}s</span>
              </div>
          )
      }
      return <div className="relative h-6 w-full mt-2">{ticks}</div>;
  };
  
  const renderFrames = () => {
    if (viewMode === 'scenes') {
      return (
        <div className="flex h-full min-h-[140px] w-full flex-wrap items-start justify-start gap-4 p-4">
          {scenes.length > 0 ? scenes.map((scene, i) => {
            const dataUrl = frameCache.get(scene.startFrame);
            return (
              <div
                key={`scene-${i}`}
                className="group relative cursor-pointer"
                onClick={() => handleSceneClick(scene)}
              >
                <div className={cn(
                    "overflow-hidden rounded-lg shadow-lg transition-all duration-300 group-hover:ring-2 group-hover:ring-primary group-hover:ring-offset-2 group-hover:ring-offset-background",
                     activeScene === scene ? 'ring-2 ring-primary' : ''
                )}>
                   {dataUrl ? (
                    <img
                        src={dataUrl}
                        alt={`Scene ${i + 1}`}
                        width={SCENE_WIDTH}
                        height={SCENE_HEIGHT}
                        className="aspect-video object-cover transition-transform group-hover:scale-105"
                        data-ai-hint="video frame"
                    />
                    ) : (
                    <Skeleton className="h-[90px] w-[160px] rounded-md" />
                    )}
                </div>
                <div className="mt-2 text-center text-sm font-medium text-muted-foreground">Scene {i+1}</div>
              </div>
            )
          }) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              <Film className="mr-2 h-5 w-5" />
              Upload a video to see the detected scenes.
            </div>
          )}
        </div>
      )
    }

    if(viewMode === 'frames' && activeScene) {
      return (
        <div className="relative h-[110px]" style={{ width: `${timelineFrames.length * FRAME_WIDTH}px` }}>
          {timelineFrames.map((frameIndex, i) => {
              const isVisible = i >= visibleRange.start && i <= visibleRange.end;
              const dataUrl = frameCache.get(frameIndex);
              
              return (
                <div
                  key={frameIndex}
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${(frameIndex - activeScene.startFrame) * FRAME_WIDTH}px` }}
                  onClick={() => onFrameSelect(frameIndex)}
                >
                   <div className="flex h-[90px] w-[128px] cursor-pointer flex-col items-center justify-center">
                     {isVisible ? (
                       dataUrl ? (
                       <img
                           src={dataUrl}
                           alt={`Frame ${frameIndex}`}
                           width={FRAME_WIDTH}
                           height={FRAME_HEIGHT}
                           className={cn(
                               "rounded-md border-2 object-cover shadow-md transition-all duration-150",
                               frameIndex === currentFrameIndex ? 'border-primary scale-105' : 'border-transparent hover:border-primary/50'
                           )}
                           data-ai-hint="video frame"
                       />
                       ) : (
                       <Skeleton className="h-[72px] w-[128px] rounded-md" />
                       )
                     ) : (
                        <div className="h-[72px] w-[128px] rounded-md bg-transparent" />
                     )}
                  </div>
                </div>
              );
          })}
        </div>
      );
    }

     return (
       <div className="flex h-[110px] w-full items-center justify-center text-sm text-muted-foreground">
          <Film className="mr-2 h-5 w-5" />
          No content to display.
        </div>
    );
  };

  return (
    <div className="relative w-full rounded-lg border bg-card p-2 shadow-sm">
      <div className="absolute left-2 top-2 z-20">
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleShowScenes} disabled={viewMode === 'scenes'}>
                        <GanttChartSquare className="h-5 w-5"/>
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                    <p>Back to Scene Selection</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
      </div>
      {viewMode === 'frames' && activeScene && (
          <>
            <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-full w-0.5 -translate-x-1/2 transform">
                <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-primary"></div>
                <div className="h-full w-full bg-primary"></div>
            </div>
            <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-full transform"
                style={{
                    transform: `translateX(-50%)`
                }}
            >
                <div className="absolute -top-6 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
                    {currentFrameIndex}
                </div>
            </div>
          </>
      )}
     
      <ScrollArea 
        className="w-full"
        onWheel={handleWheel}
      >
        <div 
          className="pt-8" 
          ref={scrollContainerRef} 
          onScroll={handleScroll}
        >
           {renderFrames()}
        </div>
        <ScrollBar orientation="horizontal" className="mt-4" />
       </ScrollArea>
        {viewMode === 'frames' && renderTimelineTicks()}
    </div>
  );
};