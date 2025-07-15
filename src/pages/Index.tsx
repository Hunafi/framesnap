import React, { useState, useRef } from 'react';
import Draggable from 'react-draggable';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Button } from '@/components/ui/button';

const App: React.FC = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [scenes, setScenes] = useState<{ start: number; end: number; thumbnail: string }[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [screenshots, setScreenshots] = useState<{ dataUrl: string; timestamp: number }[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Handle local video upload (browser-only)
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      const video = document.createElement('video');
      video.src = url;
      video.onloadedmetadata = () => {
        setDuration(video.duration);
        if (video.duration > 7200) {
          alert('Error: Video exceeds 2-hour limit to prevent browser overload.');
          return;
        } else if (video.duration > 3600) {
          alert('Warning: Videos over 1 hour may impact browser performance—close other tabs for best results.');
        }
        generateScenes(video.duration);
      };
    }
  };

  // Generate scenes and thumbnails locally (Canvas, base64)
  const generateScenes = async (dur: number) => {
    const sceneList = [];
    const chunkSize = 5;
    for (let i = 0; i < dur; i += chunkSize) {
      const start = i;
      const end = Math.min(i + chunkSize, dur);
      const thumbnail = await generateThumbnail(start);
      sceneList.push({ start, end, thumbnail });
    }
    setScenes(sceneList);
  };

  // Generate thumbnail locally via Canvas (base64)
  const generateThumbnail = async (time: number): Promise<string> => {
    if (!videoRef.current) return '';
    videoRef.current.currentTime = time;
    await new Promise(resolve => setTimeout(resolve, 100));
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth / 4;
    canvas.height = videoRef.current.videoHeight / 4;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  };

  // Timeline scroll sync
  const handleTimelineScroll = () => {
    if (timelineRef.current) {
      const scrollPos = timelineRef.current.scrollLeft / timelineRef.current.scrollWidth;
      setCurrentTime(scrollPos * duration);
      if (videoRef.current) videoRef.current.currentTime = currentTime;
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${scrollPos * 360}deg)`;
    }
  };

  // Wheel drag sync
  const handleWheelDrag = (e: any, data: any) => {
    const rotation = data.x / 10;
    if (timelineRef.current) timelineRef.current.scrollLeft += rotation;
    handleTimelineScroll();
  };

  // Capture screenshot locally (base64 in state)
  const captureScreenshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    setScreenshots([...screenshots, { dataUrl, timestamp: currentTime }]);
  };

  // Download ZIP locally
  const downloadZip = async () => {
    const zip = new JSZip();
    screenshots.forEach((shot, idx) => {
      const base64 = shot.dataUrl.split(',')[1];
      zip.file(`frame-${shot.timestamp}-${idx}.png`, base64, { base64: true });
    });
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'screenshots.zip');
  };

  // Undo last screenshot
  const undoScreenshot = () => {
    setScreenshots(screenshots.slice(0, -1));
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 text-black dark:text-white ${darkMode ? 'dark' : ''}`}>
      <button onClick={() => setDarkMode(!darkMode)}>Toggle Dark Mode</button>
      <input type="file" accept="video/mp4,video/webm" onChange={handleUpload} />
      {videoUrl && (
        <>
          <video ref={videoRef} src={videoUrl} className="w-full h-64" controls />
          <div ref={timelineRef} className="overflow-x-auto flex" onScroll={handleTimelineScroll}
            style={{ background: 'linear-gradient(to right, #A78BFA, #E9D5FF)' }}>
            {scenes.map((scene, idx) => (
              <div key={idx} className="w-32 h-24 flex-shrink-0">
                <img src={scene.thumbnail} alt={`Scene ${idx}`} className="object-cover w-full h-full" />
              </div>
            ))}
          </div>
          <div className="fixed left-1/2 transform -translate-x-1/2 h-24 bg-red-500 w-1" /> {/* Playhead */}
          <Draggable onDrag={handleWheelDrag}>
            <div ref={wheelRef} className="w-16 h-16 rounded-full bg-purple-500 cursor-grab" /> {/* Wheel */}
          </Draggable>
          <button onClick={captureScreenshot}>Capture Frame</button>
          <button onClick={undoScreenshot}>Undo</button>
          <button onClick={downloadZip}>Download ZIP</button>
          <div className="grid grid-cols-4 gap-4">
            {screenshots.map((shot, idx) => <img key={idx} src={shot.dataUrl} alt="Screenshot" className="w-32" />)}
          </div>
        </>
      )}
    </div>
  );
};

export default App;
