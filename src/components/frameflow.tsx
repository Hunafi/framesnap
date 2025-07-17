"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, X, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { VideoUpload } from '@/components/video-upload';
import { TimelineViewer, type Scene } from '@/components/timeline-viewer';
import { RotaryControl } from '@/components/rotary-control';
import { CaptureTray } from '@/components/capture-tray';
import { AIProcessingDashboard } from '@/components/ai-processing-dashboard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const FPS = 30;
const SCENE_MIN_DURATION_FRAMES = 15;
const DOWNSAMPLE_WIDTH = 16;
const DOWNSAMPLE_HEIGHT = 9;


type AppState = 'idle' | 'loading' | 'analyzing' | 'ready' | 'error';
export interface CapturedFrame {
  index: number;
  dataUrl: string;
  aiDescription?: string;
  aiPrompt?: string;
  isAnalyzing?: boolean;
  isGeneratingPrompt?: boolean;
}
type DialogState = 'none' | 'deleteFrame' | 'clearAll';

export function FrameFlow() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16/9); // Default to 16:9
  
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([]);
  
  const [dialogState, setDialogState] = useState<DialogState>('none');
  const [itemToDelete, setItemToDelete] = useState<CapturedFrame | null>(null);

  const [previewFrameUrl, setPreviewFrameUrl] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const getFrameDataUrl = useCallback((frameIndex: number, quality = 0.8): Promise<string | null> => {
    return new Promise((resolve, reject) => {
        if (!videoRef.current || !canvasRef.current || !isFinite(videoDuration) || videoDuration <= 0) {
            return reject(new Error('Video not ready for frame capture'));
        }
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const timestamp = frameIndex / FPS;

        if (timestamp > videoDuration || timestamp < 0) {
            console.warn(`Attempted to seek out of bounds. Timestamp: ${timestamp}, Duration: ${videoDuration}`);
            return resolve(null);
        }

        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            } else {
                reject(new Error('Could not get canvas context'));
            }
        };

        const onError = (e: Event) => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            console.error("Video seeking error", e)
            reject(new Error('Error seeking video'));
        };

        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });

        video.currentTime = timestamp;
    });
  }, [videoDuration]);

  const handleVideoUpload = (file: File) => {
    if (file.type.startsWith('video/')) {
      resetState();
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setAppState('loading');
    } else {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a valid video file.',
        variant: 'destructive',
      });
    }
  };
  
    const getDownsampledFrameData = useCallback(async (video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<Uint8ClampedArray> => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error("No canvas context");

        // More reliable seeking with longer timeout and better error handling
        await new Promise<void>((resolve, reject) => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
                video.removeEventListener('loadeddata', onSeeked); // Also listen for loadeddata
                resolve();
            };
            const onError = (e: Event) => {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
                video.removeEventListener('loadeddata', onSeeked);
                reject(new Error("Video seek error during downsampling"));
            };

            video.addEventListener('seeked', onSeeked, { once: true });
            video.addEventListener('error', onError, { once: true });
            video.addEventListener('loadeddata', onSeeked, { once: true }); // Fallback for some browsers
            
            // Increased timeout for larger videos
            const timeoutId = setTimeout(() => {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
                video.removeEventListener('loadeddata', onSeeked);
                reject(new Error("Video seek timeout"));
            }, 5000); // Increased to 5 seconds

            // Clear timeout if resolved early
            const originalResolve = resolve;
            resolve = () => {
                clearTimeout(timeoutId);
                originalResolve();
            };
        });

        ctx.drawImage(video, 0, 0, DOWNSAMPLE_WIDTH, DOWNSAMPLE_HEIGHT);
        return ctx.getImageData(0, 0, DOWNSAMPLE_WIDTH, DOWNSAMPLE_HEIGHT).data;
    }, []);

    const detectScenes = useCallback(async (duration: number) => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const totalFramesInVideo = Math.floor(duration * FPS);
        
        // Level 4 Implementation: Simple but effective scene detection
        // Guarantee minimum 8 scenes for good user experience
        const minScenes = 8;
        const maxScenes = 15;
        const idealSceneDuration = 3; // 3 seconds per scene
        
        let sceneCount = Math.max(minScenes, Math.min(maxScenes, Math.floor(duration / idealSceneDuration)));
        const framesPerScene = Math.floor(totalFramesInVideo / sceneCount);
        
        const newScenes: Scene[] = [];
        
        for (let i = 0; i < sceneCount; i++) {
            const start = i * framesPerScene;
            const end = (i === sceneCount - 1) 
                ? totalFramesInVideo - 1  // Last scene gets remaining frames
                : (i + 1) * framesPerScene - 1;
            
            if (end > start) {
                newScenes.push({ startFrame: start, endFrame: end });
            }
        }
        
        // Ensure we have at least one scene
        if (newScenes.length === 0) {
            newScenes.push({ startFrame: 0, endFrame: totalFramesInVideo - 1 });
        }
        
        setScenes(newScenes);
        setActiveScene(newScenes[0] ?? null);
        setCurrentFrameIndex(newScenes[0]?.startFrame ?? 0);
        setAppState('ready');
    }, [getDownsampledFrameData]);

    // Advanced scene detection with improved sensitivity
    const performAdvancedSceneDetection = async (
        video: HTMLVideoElement, 
        canvas: HTMLCanvasElement, 
        totalFramesInVideo: number,
        duration: number
    ): Promise<Scene[]> => {
        const frameDiffs: number[] = [];
        const histogramDiffs: number[] = [];

        // Sample every 0.5 seconds for better scene detection accuracy
        const frameStep = Math.max(Math.floor(FPS * 0.5), 8); // Every 0.5 seconds, minimum 8 frames
        const maxSamples = Math.min(120, Math.floor(totalFramesInVideo / frameStep)); // Up to 120 samples (1 minute of analysis)
        
        // Set initial position
        video.currentTime = 0;
        await new Promise(res => setTimeout(res, 200));
        
        let prevFrameData = await getDownsampledFrameData(video, canvas);
        let prevHistogram = calculateHistogram(prevFrameData);

        // Process samples with improved error handling
        for (let sampleIndex = 1; sampleIndex < maxSamples; sampleIndex++) {
            const frameIndex = sampleIndex * frameStep;
            if (frameIndex >= totalFramesInVideo) break;
            
            video.currentTime = frameIndex / FPS;
            
            try {
                const currentFrameData = await getDownsampledFrameData(video, canvas);
                const currentHistogram = calculateHistogram(currentFrameData);
                
                // Calculate pixel difference (edge detection)
                let edgeDiff = 0;
                for (let j = 0; j < currentFrameData.length; j += 4) {
                    const rDiff = Math.abs(currentFrameData[j] - prevFrameData[j]);
                    const gDiff = Math.abs(currentFrameData[j + 1] - prevFrameData[j + 1]);
                    const bDiff = Math.abs(currentFrameData[j + 2] - prevFrameData[j + 2]);
                    edgeDiff += (rDiff + gDiff + bDiff) / 3;
                }
                
                // Calculate histogram difference (color distribution changes)
                let histDiff = 0;
                for (let k = 0; k < 256; k++) {
                    histDiff += Math.abs(currentHistogram[k] - prevHistogram[k]);
                }
                
                frameDiffs.push(edgeDiff);
                histogramDiffs.push(histDiff);
                
                prevFrameData = currentFrameData;
                prevHistogram = currentHistogram;
            } catch (e) {
                console.warn(`Could not analyze frame ${frameIndex}:`, e);
                frameDiffs.push(0);
                histogramDiffs.push(0);
            }
        }

        // More sensitive scene detection with multiple criteria
        const sceneCuts: number[] = [0];
        const windowSize = Math.max(2, Math.floor(histogramDiffs.length / 15)); // Smaller window for more sensitivity
        
        for (let i = windowSize; i < histogramDiffs.length - windowSize; i++) {
            const window = histogramDiffs.slice(i - windowSize, i + windowSize);
            const mean = window.reduce((a, b) => a + b, 0) / window.length;
            const stdDev = Math.sqrt(window.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / window.length);
            
            // More sensitive thresholds
            const histThreshold = mean + stdDev * 1.8; // Reduced from 2.0
            const edgeThreshold = mean + stdDev * 1.5; // Additional edge-based detection
            const minHistThreshold = 20000; // Reduced minimum threshold
            const minEdgeThreshold = 15000;
            
            const histogramTriggered = histogramDiffs[i] > Math.max(histThreshold, minHistThreshold);
            const edgeTriggered = frameDiffs[i] > Math.max(edgeThreshold, minEdgeThreshold);
            
            if (histogramTriggered || edgeTriggered) {
                const frameIndex = (i + 1) * frameStep;
                const lastCut = sceneCuts[sceneCuts.length - 1] ?? 0;
                const minSceneDuration = FPS * 1.5; // Reduced to 1.5 seconds for more scenes
                
                if (frameIndex - lastCut > minSceneDuration) {
                    sceneCuts.push(frameIndex);
                }
            }
        }
        
        // Create scenes with better boundaries
        const newScenes: Scene[] = [];
        for (let i = 0; i < sceneCuts.length; i++) {
            const start = sceneCuts[i];
            const end = (i === sceneCuts.length - 1) ? totalFramesInVideo - 1 : sceneCuts[i + 1] - 1;
            
            if (end > start) {
                newScenes.push({ startFrame: start, endFrame: end });
            }
        }
        
        // If still too few scenes, add time-based fallback scenes
        if (newScenes.length < 3 && duration > 10) {
            const additionalScenes: Scene[] = [];
            const segmentDuration = Math.max(FPS * 4, Math.floor(totalFramesInVideo / 8)); // 4-second segments or 8 total segments
            
            for (let i = 0; i < totalFramesInVideo; i += segmentDuration) {
                const start = i;
                const end = Math.min(i + segmentDuration - 1, totalFramesInVideo - 1);
                
                // Only add if not overlapping with existing scenes
                const overlaps = newScenes.some(scene => 
                    (start >= scene.startFrame && start <= scene.endFrame) ||
                    (end >= scene.startFrame && end <= scene.endFrame)
                );
                
                if (!overlaps && end > start) {
                    additionalScenes.push({ startFrame: start, endFrame: end });
                }
            }
            
            // Merge and sort all scenes
            const allScenes = [...newScenes, ...additionalScenes].sort((a, b) => a.startFrame - b.startFrame);
            return allScenes;
        }
        
        // Reset video position
        video.currentTime = 0;
        
        return newScenes.length > 0 ? newScenes : [{ startFrame: 0, endFrame: totalFramesInVideo - 1 }];
    };

    // Helper function to calculate color histogram
    const calculateHistogram = (imageData: Uint8ClampedArray): number[] => {
        const histogram = new Array(256).fill(0);
        
        for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            
            const luminance = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
            histogram[luminance]++;
        }
        
        return histogram;
    };


  const handleLoadedMetadata = useCallback(async () => {
    if (videoRef.current) {
        const duration = videoRef.current.duration;
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;
        
        if (duration && isFinite(duration) && duration > 0) {
            setVideoDuration(duration);
            setTotalFrames(Math.floor(duration * FPS));
            
            // Calculate and store the video aspect ratio
            if (videoWidth && videoHeight) {
                setVideoAspectRatio(videoWidth / videoHeight);
            }
            
            setAppState('analyzing');
            await detectScenes(duration);
        } else {
            console.error("Video has invalid duration:", duration);
            setAppState('error');
        }
    }
  }, [detectScenes]);

  const handleError = (e: any) => {
     if (e.target && e.target.error && e.target.error.code === e.target.error.MEDIA_ERR_ABORTED) {
      return;
    }
    console.error('Video Error:', e);
    setAppState('error');
  }

  const resetState = useCallback(() => {
    if(videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setAppState('idle');
    setVideoFile(null);
    setVideoUrl('');
    setVideoDuration(0);
    setTotalFrames(0);
    setCurrentFrameIndex(0);
    setCapturedFrames([]);
    setScenes([]);
    setActiveScene(null);
    setPreviewFrameUrl('');
    if (videoRef.current) {
      videoRef.current.src = "";
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  }, [videoUrl]);
  
  const handleFrameSelect = (index: number, source: 'click' | 'scroll' | 'initial' = 'click') => {
    // CRITICAL: Only show loading for user clicks, not for scroll/playhead updates
    if (source === 'click') {
      setIsPreviewLoading(true);
    }
    setCurrentFrameIndex(index);
  };
  
  const handleSceneSelect = (scene: Scene) => {
    setActiveScene(scene);
    handleFrameSelect(scene.startFrame, 'initial');
  }

  const handleCaptureFrame = async (autoAnalyze: boolean = true) => {
    try {
      if (!getFrameDataUrl) return;
      const dataUrl = await getFrameDataUrl(currentFrameIndex, 0.9);
      if (!dataUrl) return;
      
      setCapturedFrames((prev) => {
        const isAlreadyCaptured = prev.some(f => f.index === currentFrameIndex);
        if(isAlreadyCaptured) {
            toast({ title: 'Frame already captured!', variant: 'destructive' });
            return prev;
        }
        const newFrame = { index: currentFrameIndex, dataUrl };
        const newFrames = [...prev, newFrame];
        
        // Start background analysis if enabled
        if (autoAnalyze) {
          // Import and use the hook here would cause issues, so we'll trigger this via the component
          setTimeout(() => {
            const analyzeEvent = new CustomEvent('analyzeFrame', { 
              detail: { frameIndex: currentFrameIndex, dataUrl } 
            });
            window.dispatchEvent(analyzeEvent);
          }, 100);
        }
        
        toast({ title: `Frame ${currentFrameIndex} captured!` });
        return newFrames.sort((a,b) => a.index - b.index);
      });
    } catch (error) {
      console.error("Capture Error:", error);
      toast({
        title: 'Capture Failed',
        description: 'Could not capture the frame. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateFrame = (frameIndex: number, updates: Partial<CapturedFrame>) => {
    setCapturedFrames(prev => 
      prev.map(frame => 
        frame.index === frameIndex 
          ? { ...frame, ...updates }
          : frame
      )
    );
  };

  const handleDeleteFrame = (frame: CapturedFrame) => {
    setItemToDelete(frame);
    setDialogState('deleteFrame');
  };

  const handleClearAll = () => {
    setDialogState('clearAll');
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      setCapturedFrames(prev => prev.filter(f => f !== itemToDelete));
      toast({ title: `Frame ${itemToDelete.index} deleted.` });
      setDialogState('none');
      setItemToDelete(null);
    }
  };

  const confirmClearAll = () => {
    setCapturedFrames([]);
    toast({ title: "All captured frames cleared." });
    setDialogState('none');
  }
  
  // Level 4 Simplified Preview Loading - Remove loading delays
  useEffect(() => {
    if (appState !== 'ready') return;

    let isCancelled = false;
    setIsPreviewLoading(true);
    
    getFrameDataUrl(currentFrameIndex, 0.8)
      .then(url => {
        if (!isCancelled && url) {
          setPreviewFrameUrl(url);
          setIsPreviewLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Preview error", err);
          setIsPreviewLoading(false);
        }
      });
    
    return () => { isCancelled = true; };
  }, [currentFrameIndex, appState]);


  const renderContent = () => {
    switch (appState) {
      case 'idle':
        return <VideoUpload onVideoUpload={handleVideoUpload} />;
      case 'loading':
        return (
          <div className="flex w-full flex-col items-center justify-center text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-lg">Loading video...</p>
          </div>
        );
      case 'analyzing':
        return (
            <div className="flex w-full flex-col items-center justify-center text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-lg">Analyzing scenes...</p>
            </div>
        );
      case 'error':
        return (
          <div className="w-full max-w-lg text-center">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Video Load Error</AlertTitle>
              <AlertDescription>
                The selected video could not be loaded. It might be corrupted or in an unsupported format. Please try a different video file.
              </AlertDescription>
            </Alert>
            <Button onClick={resetState} className="mt-4">Try Again</Button>
          </div>
        );
      case 'ready':
        return (
          <div className="flex h-full w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="max-w-xs truncate rounded-md bg-card px-3 py-1.5 text-sm text-card-foreground shadow-sm">{videoFile?.name}</div>
              <Button variant="ghost" size="icon" onClick={resetState} className="text-muted-foreground hover:bg-card hover:text-foreground">
                  <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 aspect-video w-full rounded-lg border bg-card flex items-center justify-center relative overflow-hidden shadow-md">
                {isPreviewLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
                {previewFrameUrl ? (
                   <img src={previewFrameUrl} alt={`Preview of frame ${currentFrameIndex}`} className="object-contain w-full h-full rounded-lg" data-ai-hint="video preview" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="h-16 w-16" />
                    <p>Frame Preview</p>
                  </div>
                )}
              </div>
              <div className="lg:col-span-2 flex items-center justify-center">
                  <RotaryControl
                    currentFrame={activeScene ? currentFrameIndex - activeScene.startFrame : 0}
                    totalFrames={activeScene ? activeScene.endFrame - activeScene.startFrame + 1 : 0}
                    onCapture={handleCaptureFrame}
                    onFrameChange={(relativeFrame) => {
                       if(activeScene) {
                        handleFrameSelect(activeScene.startFrame + relativeFrame);
                       }
                    }}
                  />
              </div>
            </div>

            <TimelineViewer
              totalFrames={totalFrames}
              scenes={scenes}
              activeScene={activeScene}
              currentFrameIndex={currentFrameIndex}
              onFrameSelect={(index) => handleFrameSelect(index, 'scroll')}
              onSceneSelect={handleSceneSelect}
              getFrameDataUrl={getFrameDataUrl}
            />

            <CaptureTray 
              capturedFrames={capturedFrames} 
              onClear={handleClearAll}
              onDelete={handleDeleteFrame}
              onUpdateFrame={handleUpdateFrame}
            />

            <AIProcessingDashboard
              capturedFrames={capturedFrames}
              onUpdateFrame={handleUpdateFrame}
            />
          </div>
        );
    }
  }

  return (
    <>
      {renderContent()}
      
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError}
          className="pointer-events-none absolute left-0 top-0 h-1 w-1 opacity-0"
          playsInline
          muted
          preload="metadata"
          crossOrigin="anonymous"
        />
      )}
      <canvas ref={canvasRef} className="hidden" />

      <AlertDialog open={dialogState !== 'none'} onOpenChange={(open) => !open && setDialogState('none')}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogState === 'deleteFrame' && `This will permanently delete the captured frame ${itemToDelete?.index}.`}
              {dialogState === 'clearAll' && `This will permanently delete all ${capturedFrames.length} captured frames.`}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDialogState('none')}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={dialogState === 'deleteFrame' ? confirmDelete : confirmClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}