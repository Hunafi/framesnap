import React, { useState, useRef, useCallback } from 'react';
import Draggable from 'react-draggable';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Upload, Download, Camera, Undo2, Play, Pause, RotateCcw, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [scenes, setScenes] = useState<{ start: number; end: number; thumbnail: string }[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [wheelPosition, setWheelPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Handle video upload with validation
  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid file type",
        description: "Please select a video file (MP4, WebM, etc.)",
        variant: "destructive"
      });
      return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setIsProcessing(true);
    setScenes([]); // Clear previous scenes
    setScreenshots([]); // Clear previous screenshots
  }, [toast]);

  // Handle when video metadata is loaded
  const handleVideoLoaded = useCallback(() => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    setDuration(video.duration);
    
    // Show warnings for long videos
    if (video.duration > 7200) { // 2 hours
      toast({
        title: "Video too long",
        description: "Videos over 2 hours may cause browser performance issues. Please use a shorter video.",
        variant: "destructive"
      });
      setIsProcessing(false);
      return;
    } else if (video.duration > 3600) { // 1 hour
      toast({
        title: "Performance warning",
        description: "Videos over 1 hour may impact browser performance. Consider closing other tabs.",
        variant: "destructive"
      });
    }
    
    generateScenes(video.duration);
  }, [toast]);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        setVideoFile(file);
        const url = URL.createObjectURL(file);
        setVideoUrl(url);
        setIsProcessing(true);
        setScenes([]);
        setScreenshots([]);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please drop a video file (MP4, WebM, etc.)",
          variant: "destructive"
        });
      }
    }
  }, [toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // Generate scene thumbnails
  const generateScenes = useCallback(async (dur: number) => {
    if (!videoRef.current) return;
    
    setIsProcessing(true);
    const sceneList = [];
    const chunkSize = 5; // 5-second segments for optimal performance
    
    try {
      for (let i = 0; i < dur; i += chunkSize) {
        const start = i;
        const end = Math.min(i + chunkSize, dur);
        const thumbnail = await generateThumbnail(start);
        sceneList.push({ start, end, thumbnail });
      }
      setScenes(sceneList);
      toast({
        title: "Video processed",
        description: `Generated ${sceneList.length} scene segments`,
      });
    } catch (error) {
      toast({
        title: "Processing error",
        description: "Failed to process video scenes",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  // Generate thumbnail using canvas
  const generateThumbnail = useCallback(async (time: number): Promise<string> => {
    if (!videoRef.current) return '';
    
    return new Promise((resolve) => {
      const video = videoRef.current!;
      video.currentTime = time;
      
      const onSeeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160; // Thumbnail size
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        }
        video.removeEventListener('seeked', onSeeked);
      };
      
      video.addEventListener('seeked', onSeeked);
    });
  }, []);

  // Handle timeline scroll synchronization
  const handleTimelineScroll = useCallback(() => {
    if (!timelineRef.current || !videoRef.current) return;
    
    const scrollPos = timelineRef.current.scrollLeft / (timelineRef.current.scrollWidth - timelineRef.current.clientWidth);
    const newTime = scrollPos * duration;
    setCurrentTime(newTime);
    videoRef.current.currentTime = newTime;
  }, [duration]);

  // Handle wheel drag for timeline control
  const handleWheelDrag = useCallback((e: any, data: any) => {
    if (!timelineRef.current) return;
    
    const sensitivity = 2;
    const scrollDelta = data.deltaX * sensitivity;
    timelineRef.current.scrollLeft += scrollDelta;
    handleTimelineScroll();
    setWheelPosition({ x: data.x, y: data.y });
  }, [handleTimelineScroll]);

  // Capture high-quality screenshot
  const captureScreenshot = useCallback(() => {
    if (!videoRef.current) {
      toast({
        title: "No video loaded",
        description: "Please upload a video first",
        variant: "destructive"
      });
      return;
    }

    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = canvas.toDataURL('image/png');
      setScreenshots(prev => [...prev, img]);
      
      toast({
        title: "Frame captured",
        description: `Screenshot ${screenshots.length + 1} saved`,
      });
    }
  }, [screenshots.length, toast]);

  // Download screenshots as ZIP
  const downloadZip = useCallback(async () => {
    if (screenshots.length === 0) {
      toast({
        title: "No screenshots",
        description: "Capture some frames first",
        variant: "destructive"
      });
      return;
    }

    try {
      const zip = new JSZip();
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      screenshots.forEach((img, idx) => {
        const base64 = img.split(',')[1];
        const timeStr = Math.floor(currentTime).toString().padStart(3, '0');
        zip.file(`frame-${timeStr}s-${idx + 1}.png`, base64, { base64: true });
      });
      
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `video-frames-${timestamp}.zip`);
      
      toast({
        title: "Download complete",
        description: `${screenshots.length} frames downloaded`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to create ZIP file",
        variant: "destructive"
      });
    }
  }, [screenshots, currentTime, toast]);

  // Undo last screenshot
  const undoScreenshot = useCallback(() => {
    if (screenshots.length === 0) return;
    setScreenshots(prev => prev.slice(0, -1));
    toast({
      title: "Screenshot removed",
      description: "Last frame capture undone",
    });
  }, [screenshots.length, toast]);

  // Toggle video playback
  const togglePlayback = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Jump to specific scene
  const jumpToScene = useCallback((scene: { start: number; end: number; thumbnail: string }) => {
    if (!videoRef.current || !timelineRef.current) return;
    
    setCurrentTime(scene.start);
    videoRef.current.currentTime = scene.start;
    
    // Scroll timeline to position
    const scrollPos = (scene.start / duration) * (timelineRef.current.scrollWidth - timelineRef.current.clientWidth);
    timelineRef.current.scrollLeft = scrollPos;
  }, [duration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark bg-background' : 'bg-gradient-to-br from-purple-50 via-white to-lavender-50'}`}>
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-lg bg-background/80 border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                FrameSnap
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDarkMode(!darkMode)}
                className="hover-scale"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Upload Section */}
        {!videoUrl && (
          <Card className="border-dashed border-2 hover-scale animate-fade-in">
            <CardContent className="p-12 text-center">
              <div className="space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Upload Your Video</h3>
                  <p className="text-muted-foreground mb-4">
                    Drag and drop a video file or click to browse (MP4, WebM supported)
                  </p>
                </div>
                <label htmlFor="video-upload">
                  <Button asChild className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                    <span>Choose Video File</span>
                  </Button>
                  <input
                    id="video-upload"
                    type="file"
                    accept="video/mp4,video/webm,video/avi,video/mov"
                    onChange={handleUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <Card className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <RotateCcw className="w-5 h-5 animate-spin-clockwise text-purple-500" />
                <span className="font-medium">Processing video...</span>
              </div>
              <Progress value={45} className="w-full" />
            </CardContent>
          </Card>
        )}

        {/* Video Player & Timeline */}
        {videoUrl && !isProcessing && (
          <div className="space-y-6 animate-fade-in">
            {/* Video Player */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative bg-black">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-[60vh] object-contain"
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onLoadedMetadata={handleVideoLoaded}
                  />
                  
                  {/* Video Controls Overlay */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center gap-4 bg-black/50 backdrop-blur-sm rounded-lg p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={togglePlayback}
                      className="text-white hover:bg-white/20"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    
                    <div className="flex-1 text-white text-sm">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                    
                    <Button
                      onClick={captureScreenshot}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                      size="sm"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Capture Frame
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline with Playhead */}
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  <div
                    ref={timelineRef}
                    className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-300 hover:scrollbar-thumb-purple-400"
                    onScroll={handleTimelineScroll}
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    <div className="flex gap-1 min-w-max p-2">
                      {scenes.map((scene, idx) => (
                        <div
                          key={idx}
                          className="flex-shrink-0 cursor-pointer group"
                          onClick={() => jumpToScene(scene)}
                        >
                          <div className="w-40 h-24 rounded-lg overflow-hidden border-2 border-transparent group-hover:border-purple-400 transition-all">
                            <img
                              src={scene.thumbnail}
                              alt={`Scene ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>
                          <div className="text-xs text-center mt-1 text-muted-foreground">
                            {formatTime(scene.start)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Fixed Playhead */}
                  <div className="absolute top-0 left-1/2 transform -translate-x-0.5 w-0.5 h-full bg-red-500 pointer-events-none z-10 shadow-lg">
                    <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg"></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Draggable Scrubber Wheel */}
            <Draggable
              onDrag={handleWheelDrag}
              position={wheelPosition}
              bounds="parent"
            >
              <div className="fixed bottom-8 right-8 z-40 cursor-grab active:cursor-grabbing">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center group hover-scale">
                  <RotateCcw className="w-8 h-8 text-white group-hover:animate-spin" />
                </div>
              </div>
            </Draggable>

            {/* Actions & Screenshots */}
            <div className="flex gap-4">
              {/* Action Buttons */}
              <Card className="flex-1">
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-4">Actions</h3>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={captureScreenshot}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Capture Frame
                    </Button>
                    
                    <Button
                      onClick={undoScreenshot}
                      variant="outline"
                      disabled={screenshots.length === 0}
                    >
                      <Undo2 className="w-4 h-4 mr-2" />
                      Undo Last
                    </Button>
                    
                    <Button
                      onClick={downloadZip}
                      variant="outline"
                      disabled={screenshots.length === 0}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download ZIP ({screenshots.length})
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Screenshots Grid */}
            {screenshots.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-4">Captured Frames ({screenshots.length})</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {screenshots.map((img, idx) => (
                      <div key={idx} className="group relative">
                        <img
                          src={img}
                          alt={`Screenshot ${idx + 1}`}
                          className="w-full aspect-video object-cover rounded-lg border hover-scale"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <span className="text-white text-sm font-medium">Frame {idx + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
