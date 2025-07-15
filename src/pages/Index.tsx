import { FrameFlow } from '@/components/frameflow';
import { Target } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
        <div className="flex items-center gap-3">
          <Target className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tighter sm:text-3xl">
            Frame Sniper
          </h1>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center p-2 sm:p-4 md:p-8">
        <FrameFlow />
      </main>
    </div>
  );
}