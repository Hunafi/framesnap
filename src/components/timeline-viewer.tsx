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
  
  // Scrollbar drag state
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false);
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 });

  const timelineFrames = useMemo(() => {
    if (viewMode === 'frames' && activeScene) {
      return Array.from({ length: activeScene.endFrame - activeScene.startFrame + 1 }, (_, i) => activeScene.startFrame + i);
    }
    return [];
  }, [viewMode, activeScene]);


  // Immediate frame loading with priority for current frame
  useEffect(() => {
    let isCancelled = false;

    const loadFrames = async () => {
        if (viewMode === 'scenes') {
            // Load scene thumbnails
            for (const scene of scenes) {
                if (isCancelled) return;
                if (!frameCache.has(scene.startFrame)) {
                    try {
                        const dataUrl = await getFrameDataUrl(scene.startFrame, 0.6);
                        if (dataUrl && !isCancelled) {
                            setFrameCache(prev => new Map(prev).set(scene.startFrame, dataUrl));
                        }
                    } catch(e) {
                        console.warn(`Scene ${scene.startFrame} load failed:`, e);
                    }
                }
            }
        } else if (viewMode === 'frames' && activeScene) {
            // CRITICAL: Load current frame first to prevent loading state
            if (!frameCache.has(currentFrameIndex)) {
                try {
                    const dataUrl = await getFrameDataUrl(currentFrameIndex, 0.6);
                    if (dataUrl && !isCancelled) {
                        setFrameCache(prev => new Map(prev).set(currentFrameIndex, dataUrl));
                    }
                } catch(e) {
                    console.warn(`Current frame ${currentFrameIndex} load failed:`, e);
                }
            }
            
            // Then load surrounding frames for smooth scrolling
            const startFrame = activeScene.startFrame;
            const endFrame = activeScene.endFrame;
            const currentRelative = currentFrameIndex - startFrame;
            
            // Load frames in order of priority: current, then adjacent, then rest
            const loadOrder = [];
            for (let offset = 0; offset <= Math.max(currentRelative, endFrame - currentFrameIndex); offset++) {
                if (currentFrameIndex - offset >= startFrame && currentFrameIndex - offset !== currentFrameIndex) {
                    loadOrder.push(currentFrameIndex - offset);
                }
                if (currentFrameIndex + offset <= endFrame && currentFrameIndex + offset !== currentFrameIndex) {
                    loadOrder.push(currentFrameIndex + offset);
                }
            }
            
            for (const frameIndex of loadOrder) {
                if (isCancelled) return;
                if (!frameCache.has(frameIndex)) {
                    try {
                        const dataUrl = await getFrameDataUrl(frameIndex, 0.5);
                        if (dataUrl && !isCancelled) {
                            setFrameCache(prev => new Map(prev).set(frameIndex, dataUrl));
                        }
                    } catch(e) {
                        console.warn(`Frame ${frameIndex} load failed:`, e);
                    }
                }
            }
        }
    };
    
    loadFrames();
    return () => { isCancelled = true; };
  }, [scenes, viewMode, activeScene, currentFrameIndex, getFrameDataUrl]);

  // Level 4 Simplified: Remove complex visible range calculations that cause blanking
  const renderVisibleFrames = useMemo(() => {
    if (viewMode !== 'frames' || !activeScene) return [];
    
    // Show all frames in the scene, let browser handle rendering optimization
    return timelineFrames;
  }, [viewMode, activeScene, timelineFrames]);


  // Manual scroll-to-frame function for specific actions only
  const scrollToFrame = useCallback((frameIndex: number, source: 'scene' | 'click') => {
    if (!scrollContainerRef.current || !activeScene || viewMode !== 'frames') return;
    
    const container = scrollContainerRef.current;
    const relativeIndex = frameIndex - activeScene.startFrame;
    const targetScrollLeft = (relativeIndex * FRAME_WIDTH) - (container.offsetWidth / 2) + (FRAME_WIDTH / 2);
    
    container.scrollTo({ left: targetScrollLeft, behavior: source === 'scene' ? 'smooth' : 'auto' });
  }, [activeScene, viewMode]);

  const handleScroll = useCallback(() => {
    // Only handle scroll when user is actually scrolling the timeline (not dragging scrollbar)
    if (isDraggingScrollbar || viewMode !== 'frames' || !activeScene || !scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    
    // PRECISION FIX: Use exact playhead position (fixed at 50% of viewport)
    const playheadPosition = container.scrollLeft + (container.offsetWidth / 2);
    
    // PRECISION FIX: More accurate frame calculation considering frame overlap
    const exactFramePosition = playheadPosition / FRAME_WIDTH;
    const frameRelativeIndex = Math.floor(exactFramePosition);
    
    // PRECISION FIX: Check which frame the playhead overlaps most
    const frameOverlap = exactFramePosition - frameRelativeIndex;
    const selectedFrameRelativeIndex = frameOverlap >= 0.5 ? frameRelativeIndex + 1 : frameRelativeIndex;
    
    const selectedFrameIndex = activeScene.startFrame + selectedFrameRelativeIndex;
    const clampedIndex = Math.max(activeScene.startFrame, Math.min(activeScene.endFrame, selectedFrameIndex));
    
    // Update frame selection for scroll-based navigation
    if (clampedIndex !== currentFrameIndex) {
      onFrameSelect(clampedIndex);
    }
  }, [isDraggingScrollbar, viewMode, activeScene, currentFrameIndex, onFrameSelect]);
  
  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && scrollContainerRef.current) {
      e.preventDefault();
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // Enhanced scrollbar drag with proper frame selection
  const handleScrollbarMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    
    setIsDraggingScrollbar(true);
    dragStartRef.current = {
      x: e.clientX,
      scrollLeft: scrollContainerRef.current.scrollLeft
    };
    
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingScrollbar || !scrollContainerRef.current) return;
      
      e.preventDefault();
      
      const container = scrollContainerRef.current;
      const scrollbarTrack = container.parentElement?.querySelector('.scrollbar-track') as HTMLElement;
      if (!scrollbarTrack) return;
      
      const deltaX = e.clientX - dragStartRef.current.x;
      const trackWidth = scrollbarTrack.offsetWidth;
      const scrollableWidth = container.scrollWidth - container.clientWidth;
      
      const scrollRatio = deltaX / trackWidth;
      const newScrollLeft = dragStartRef.current.scrollLeft + (scrollRatio * scrollableWidth);
      
      container.scrollLeft = Math.max(0, Math.min(scrollableWidth, newScrollLeft));
    };

    const handleMouseUp = () => {
      if (isDraggingScrollbar && viewMode === 'frames' && activeScene && scrollContainerRef.current) {
        // PRECISION FIX: Use same precise calculation as handleScroll
        const container = scrollContainerRef.current;
        const playheadPosition = container.scrollLeft + (container.offsetWidth / 2);
        const exactFramePosition = playheadPosition / FRAME_WIDTH;
        const frameRelativeIndex = Math.floor(exactFramePosition);
        const frameOverlap = exactFramePosition - frameRelativeIndex;
        const selectedFrameRelativeIndex = frameOverlap >= 0.5 ? frameRelativeIndex + 1 : frameRelativeIndex;
        const selectedFrameIndex = activeScene.startFrame + selectedFrameRelativeIndex;
        const clampedIndex = Math.max(activeScene.startFrame, Math.min(activeScene.endFrame, selectedFrameIndex));
        
        if (clampedIndex !== currentFrameIndex) {
          onFrameSelect(clampedIndex);
        }
      }
      setIsDraggingScrollbar(false);
    };

    if (isDraggingScrollbar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingScrollbar, viewMode, activeScene, currentFrameIndex, onFrameSelect]);

  const handleSceneClick = useCallback((scene: Scene) => {
    onSceneSelect(scene);
    setViewMode('frames');
    // Scroll to first frame of scene
    setTimeout(() => scrollToFrame(scene.startFrame, 'scene'), 100);
  }, [onSceneSelect, scrollToFrame]);

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
          {renderVisibleFrames.map((frameIndex, i) => {
              const dataUrl = frameCache.get(frameIndex);
              
              return (
                <div
                  key={frameIndex}
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${(frameIndex - activeScene.startFrame) * FRAME_WIDTH}px` }}
                  onClick={() => {
                    onFrameSelect(frameIndex);
                    scrollToFrame(frameIndex, 'click');
                  }}
                >
                   <div className="flex h-[90px] w-[128px] cursor-pointer flex-col items-center justify-center relative">
                     {dataUrl ? (
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
                     )}
                     {/* DEBUG: Temporary frame index labels for alignment verification */}
                     <div className="absolute bottom-0 left-0 bg-black/70 text-white text-xs px-1 rounded-tr">
                       {frameIndex}
                     </div>
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
            {/* Neon green frame indicator with better spacing */}
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 h-[calc(100%-3rem)] w-1 -translate-x-1/2 transform">
                <div className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-green-400 shadow-lg shadow-green-400/50"></div>
                <div className="h-full w-full bg-green-400 shadow-lg shadow-green-400/30"></div>
            </div>
            <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-full transform"
                style={{
                    transform: `translateX(-50%)`
                }}
            >
                <div className="absolute -top-8 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-md bg-green-400 px-3 py-1.5 text-sm font-bold text-black shadow-lg shadow-green-400/30">
                    {currentFrameIndex}
                </div>
            </div>
          </>
      )}
     
      {/* Custom always-visible scrollbar container */}
      <div className="w-full">
        <div 
          className="timeline-scroll-container pt-12 pb-4 overflow-x-auto overflow-y-hidden"
          ref={scrollContainerRef} 
          onScroll={handleScroll}
          onWheel={handleWheel}
          style={{
            scrollbarWidth: 'none', /* Firefox */
            msOverflowStyle: 'none',  /* Internet Explorer 10+ */
          }}
        >
          <style dangerouslySetInnerHTML={{
            __html: `
              .timeline-scroll-container::-webkit-scrollbar {
                display: none; /* WebKit */
              }
            `
          }} />
           {renderFrames()}
        </div>
        
        {/* Always visible neon green custom scrollbar with drag functionality */}
        <div className="scrollbar-track relative h-4 mx-2 mb-4 bg-gray-800/30 rounded-full">
          <div 
            className={cn(
              "absolute top-1/2 -translate-y-1/2 h-3 bg-primary rounded-full shadow-lg shadow-primary/30 transition-colors cursor-grab",
              isDraggingScrollbar ? "cursor-grabbing bg-primary scale-105" : "hover:bg-primary/80"
            )}
            style={{
              width: viewMode === 'frames' && activeScene && scrollContainerRef.current ? 
                `${Math.min(100, (scrollContainerRef.current.clientWidth / scrollContainerRef.current.scrollWidth) * 100)}%` : 
                '20%',
              left: viewMode === 'frames' && activeScene && scrollContainerRef.current ? 
                `${Math.min(80, (scrollContainerRef.current.scrollLeft / (scrollContainerRef.current.scrollWidth - scrollContainerRef.current.clientWidth)) * 80)}%` : 
                '0%'
            }}
            onMouseDown={handleScrollbarMouseDown}
          />
        </div>
      </div>
       {viewMode === 'frames' && renderTimelineTicks()}
    </div>
  );
};