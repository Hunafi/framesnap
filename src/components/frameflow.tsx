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

        // This is a reliable way to wait for the seek to complete
        await new Promise<void>((resolve, reject) => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
                resolve();
            };
            const onError = (e: Event) => {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
                reject(new Error("Video seek error during downsampling"));
            };

            video.addEventListener('seeked', onSeeked, { once: true });
            video.addEventListener('error', onError, { once: true });
            
            // Add a timeout to prevent getting stuck
            setTimeout(() => reject(new Error("Video seek timeout")), 2000);
        });

        ctx.drawImage(video, 0, 0, DOWNSAMPLE_WIDTH, DOWNSAMPLE_HEIGHT);
        return ctx.getImageData(0, 0, DOWNSAMPLE_WIDTH, DOWNSAMPLE_HEIGHT).data;
    }, []);

    const detectScenes = useCallback(async (duration: number) => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const totalFramesInVideo = Math.floor(duration * FPS);
        
        // Simple scene detection - create scenes every 5 seconds
        const newScenes: Scene[] = [];
        const sceneLength = FPS * 5; // 5 seconds per scene
        
        for (let i = 0; i < totalFramesInVideo; i += sceneLength) {
            const start = i;
            const end = Math.min(i + sceneLength - 1, totalFramesInVideo - 1);
            
            if (end > start) {
                newScenes.push({ startFrame: start, endFrame: end });
            }
        }
        
        setScenes(newScenes);
        setActiveScene(newScenes[0] ?? null);
        setCurrentFrameIndex(newScenes[0]?.startFrame ?? 0);
        setAppState('ready');

    }, []);


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
  
  const handleFrameSelect = (index: number) => {
    setIsPreviewLoading(true);
    setCurrentFrameIndex(index);
  };
  
  const handleSceneSelect = (scene: Scene) => {
    setActiveScene(scene);
    handleFrameSelect(scene.startFrame);
  }

  const handleCaptureFrame = async () => {
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
        const newFrames = [...prev, { index: currentFrameIndex, dataUrl }];
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
  
  useEffect(() => {
    if (appState !== 'ready' || !getFrameDataUrl) return;

    let isCancelled = false;
    
    getFrameDataUrl(currentFrameIndex, 0.8)
      .then(url => {
        if (!isCancelled && url) {
          setPreviewFrameUrl(url);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Preview error", err);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsPreviewLoading(false);
        }
      });
    
    return () => { isCancelled = true; };
  }, [currentFrameIndex, appState, getFrameDataUrl]);


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
              onFrameSelect={handleFrameSelect}
              onSceneSelect={handleSceneSelect}
              getFrameDataUrl={getFrameDataUrl}
              videoAspectRatio={videoAspectRatio}
            />

            <CaptureTray 
              capturedFrames={capturedFrames} 
              onClear={handleClearAll}
              onDelete={handleDeleteFrame}
              onUpdateFrame={handleUpdateFrame}
              videoAspectRatio={videoAspectRatio}
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