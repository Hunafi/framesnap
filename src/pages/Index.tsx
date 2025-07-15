import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Upload, Play, Pause, SkipBack, SkipForward, Download, Loader } from 'lucide-react';

interface Frame {
  id: string;
  timestamp: number;
  base64: string;
  sceneId: number;
  index: number;
}

interface Scene {
  id: number;
  startFrame: number;
  endFrame: number;
  frames: Frame[];
  thumbnail: string;
}

const VideoFrameExtractor: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout>();

  // Video upload handler
  const handleVideoUpload = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file');
      return;
    }

    console.log('Video file uploaded:', file.name, file.size);
    setVideoFile(file);
    setFrames([]);
    setScenes([]);
    setCurrentFrameIndex(0);
    setIsProcessing(true);

    const videoUrl = URL.createObjectURL(file);
    if (videoRef.current) {
      const video = videoRef.current;
      
      // Clear any existing event listeners
      video.onloadedmetadata = null;
      video.onerror = null;
      
      // Set up event handlers before setting src
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded:', video.duration);
        setVideoDuration(video.duration);
        extractAllFrames();
      };
      
      video.onerror = (e) => {
        console.error('Video loading error:', e);
        setIsProcessing(false);
        alert('Error loading video. Please try a different file.');
      };
      
      video.src = videoUrl;
      video.load(); // Force load the video
    }
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleVideoUpload(files[0]);
    }
  }, [handleVideoUpload]);

  // Extract all frames and detect scenes
  const extractAllFrames = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    console.log('Starting frame extraction...');
    setIsProcessing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Cannot get canvas context');
      setIsProcessing(false);
      return;
    }

    const duration = video.duration;
    console.log('Video duration:', duration);
    const frameRate = 1; // Extract 1 frame per second for better performance
    const totalFrames = Math.floor(duration * frameRate);
    const extractedFrames: Frame[] = [];

    // Set canvas size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    console.log('Canvas size:', canvas.width, 'x', canvas.height);

    for (let i = 0; i < totalFrames; i++) {
      const time = (i / frameRate);
      console.log(`Extracting frame ${i + 1}/${totalFrames} at ${time}s`);
      
      // Seek to specific time
      video.currentTime = time;
      
      await new Promise(resolve => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve(void 0);
        };
        video.addEventListener('seeked', onSeeked);
      });

      // Draw frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64 with reduced quality for thumbnails
      const base64 = canvas.toDataURL('image/jpeg', 0.6);
      
      extractedFrames.push({
        id: `frame-${i}`,
        timestamp: time,
        base64,
        sceneId: 0, // Will be set during scene detection
        index: i
      });
    }

    console.log('Frame extraction complete. Total frames:', extractedFrames.length);

    // Detect scenes
    const detectedScenes = detectScenes(extractedFrames);
    console.log('Scene detection complete. Total scenes:', detectedScenes.length);
    
    setFrames(extractedFrames);
    setScenes(detectedScenes);
    setIsProcessing(false);
  }, []);

  // Video metadata loading effect
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoFile) return;

    const handleLoadedMetadata = () => {
      console.log('Video metadata loaded:', video.duration);
      setVideoDuration(video.duration);
      extractAllFrames();
    };

    const handleError = (e: any) => {
      console.error('Video loading error:', e);
      setIsProcessing(false);
      alert('Error loading video. Please try a different file.');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [videoFile, extractAllFrames]);


  // Scene detection algorithm (simplified for performance)
  const detectScenes = (frames: Frame[]): Scene[] => {
    if (frames.length === 0) return [];

    const scenes: Scene[] = [];
    let currentSceneStart = 0;
    let sceneId = 0;
    const sceneSize = 10; // Group every 10 frames as a scene for simplicity

    for (let i = 0; i < frames.length; i += sceneSize) {
      const endIndex = Math.min(i + sceneSize, frames.length);
      const sceneFrames = frames.slice(i, endIndex);
      
      sceneFrames.forEach(frame => frame.sceneId = sceneId);
      
      scenes.push({
        id: sceneId,
        startFrame: i,
        endFrame: endIndex - 1,
        frames: sceneFrames,
        thumbnail: sceneFrames[0].base64
      });
      
      sceneId++;
    }

    return scenes;
  };


  // Current frame
  const currentFrame = useMemo(() => {
    return frames[currentFrameIndex] || null;
  }, [frames, currentFrameIndex]);

  // Navigation functions
  const goToFrame = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, frames.length - 1));
    setCurrentFrameIndex(clampedIndex);
    
    // Scroll timeline to show current frame
    if (timelineRef.current) {
      const frameElement = timelineRef.current.children[clampedIndex] as HTMLElement;
      if (frameElement) {
        frameElement.scrollIntoView({ behavior: 'smooth', inline: 'center' });
      }
    }
  };

  const goToPreviousFrame = () => goToFrame(currentFrameIndex - 1);
  const goToNextFrame = () => goToFrame(currentFrameIndex + 1);

  // Play/Pause functionality
  const togglePlay = () => {
    if (isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playIntervalRef.current = setInterval(() => {
        setCurrentFrameIndex(prev => {
          if (prev >= frames.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 100); // 10fps playback
    }
  };

  // Circular scrub wheel
  const ScrubWheel: React.FC = () => {
    const [isDragging, setIsDragging] = useState(false);
    const wheelRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
      setIsDragging(true);
      e.preventDefault();
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!isDragging || !wheelRef.current) return;

      const rect = wheelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);
      const frameIndex = Math.floor(normalizedAngle * frames.length);
      
      goToFrame(frameIndex);
    }, [isDragging, frames.length]);

    const handleMouseUp = useCallback(() => {
      setIsDragging(false);
    }, []);

    useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    const progress = frames.length > 0 ? currentFrameIndex / frames.length : 0;
    const rotation = progress * 360;

    return (
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={goToPreviousFrame}
          disabled={currentFrameIndex === 0}
          className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 disabled:opacity-50"
        >
          <SkipBack className="h-5 w-5" />
        </button>

        <div
          ref={wheelRef}
          className="relative w-24 h-24 cursor-pointer"
          onMouseDown={handleMouseDown}
        >
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-purple-200">
            {/* Progress indicators */}
            {Array.from({ length: 60 }, (_, i) => (
              <div
                key={i}
                className="absolute w-0.5 h-3 bg-purple-300"
                style={{
                  top: '4px',
                  left: '50%',
                  transformOrigin: '50% 44px',
                  transform: `translateX(-50%) rotate(${i * 6}deg)`
                }}
              />
            ))}
          </div>
          
          {/* Center play button */}
          <div className="absolute inset-4 rounded-full bg-purple-500 flex items-center justify-center">
            <button onClick={togglePlay} className="text-white">
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </button>
          </div>
          
          {/* Progress indicator */}
          <div
            className="absolute w-1 h-8 bg-purple-600 rounded-full"
            style={{
              top: '8px',
              left: '50%',
              transformOrigin: '50% 40px',
              transform: `translateX(-50%) rotate(${rotation}deg)`
            }}
          />
        </div>

        <button
          onClick={goToNextFrame}
          disabled={currentFrameIndex === frames.length - 1}
          className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 disabled:opacity-50"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>
    );
  };

  // Download current frame
  const downloadCurrentFrame = () => {
    if (!currentFrame) return;
    
    const link = document.createElement('a');
    link.href = currentFrame.base64;
    link.download = `frame-${currentFrame.timestamp.toFixed(2)}s.jpg`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Upload Section */}
      {!videoFile && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
            <h1 className="text-2xl font-bold text-center mb-6">Video Frame Extractor</h1>
            
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragOver 
                  ? 'border-purple-500 bg-purple-500/10' 
                  : 'border-gray-600 hover:border-purple-500'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg text-gray-300 mb-2">
                {isDragOver ? 'Drop your video here!' : 'Upload your video'}
              </p>
              <p className="text-sm text-gray-500">
                Supports MP4, MOV, AVI, WebM
              </p>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Main Interface */}
      {videoFile && (
        <div className="flex flex-col h-screen">
          {/* Header */}
          <div className="bg-gray-800 p-4 flex justify-between items-center">
            <h1 className="text-xl font-bold">Frame Extractor</h1>
            <div className="flex gap-2">
              {currentFrame && (
                <button
                  onClick={downloadCurrentFrame}
                  className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download Frame
                </button>
              )}
              <button
                onClick={() => {
                  setVideoFile(null);
                  setFrames([]);
                  setScenes([]);
                }}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
              >
                New Video
              </button>
            </div>
          </div>

          {/* Video Preview Area */}
          <div className="flex-1 bg-black flex items-center justify-center p-4">
            {isProcessing ? (
              <div className="text-center">
                <Loader className="h-12 w-12 animate-spin mx-auto mb-4" />
                <p className="text-lg">Processing video...</p>
                <p className="text-sm text-gray-400">Extracting frames and detecting scenes</p>
              </div>
            ) : currentFrame ? (
              <img
                src={currentFrame.base64}
                alt="Current frame"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            ) : (
              <div className="text-gray-400 text-center">
                <p>Video preview will appear here</p>
              </div>
            )}
          </div>

          {/* Scrub Wheel */}
          {frames.length > 0 && (
            <div className="py-6 bg-gray-800">
              <ScrubWheel />
            </div>
          )}

          {/* Timeline Filmstrip */}
          {frames.length > 0 && (
            <div className="bg-gray-800 border-t border-gray-700">
              <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-gray-400">
                    Frame {currentFrameIndex + 1} of {frames.length} | {scenes.length} scenes detected
                  </span>
                  <span className="text-sm text-gray-400">
                    {currentFrame?.timestamp.toFixed(2)}s / {videoDuration.toFixed(2)}s
                  </span>
                </div>
                
                <div
                  ref={timelineRef}
                  className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-600"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  {frames.map((frame, index) => (
                    <div
                      key={frame.id}
                      className={`flex-shrink-0 cursor-pointer transition-all duration-200 ${
                        index === currentFrameIndex
                          ? 'ring-2 ring-purple-500 scale-110'
                          : 'hover:scale-105'
                      }`}
                      onClick={() => goToFrame(index)}
                    >
                      <img
                        src={frame.base64}
                        alt={`Frame ${index + 1}`}
                        className="w-16 h-12 object-cover rounded"
                        loading="lazy"
                      />
                      
                      {/* Scene marker */}
                      {scenes.find(scene => scene.startFrame === index) && (
                        <div className="text-xs text-purple-400 text-center mt-1">
                          Scene {frame.sceneId + 1}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Hidden elements */}
          <video ref={videoRef} className="hidden" />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
};

export default VideoFrameExtractor;