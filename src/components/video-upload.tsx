"use client";

import type { FC, DragEvent } from 'react';
import { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoUploadProps {
  onVideoUpload: (file: File) => void;
}

export const VideoUpload: FC<VideoUploadProps> = ({ onVideoUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onVideoUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onVideoUpload(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={cn(
        'flex w-full max-w-2xl cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card/50 p-12 text-center transition-colors duration-300',
        isDragging ? 'border-primary bg-primary/10' : 'hover:border-primary/50 hover:bg-card'
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
        accept="video/*"
      />
      <UploadCloud
        className={cn(
          'mb-4 h-16 w-16 text-muted-foreground transition-colors',
          isDragging && 'text-primary'
        )}
      />
      <h3 className="text-xl font-semibold">Drag & Drop or Click to Upload</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Select a video file from your computer to start.
      </p>
    </div>
  );
};