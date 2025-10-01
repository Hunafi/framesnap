import { FrameFlow } from '@/components/frameflow';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Target, Settings, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  const { user, profile, loading, signOut, isAdmin } = useAuth();
  
  console.log('Index - Auth state:', { user: !!user, profile, isAdmin });

  // Temporarily bypass loading state to test the main app
  // if (loading) {
  //   return (
  //     <div className="flex min-h-screen items-center justify-center">
  //       <Loader2 className="h-8 w-8 animate-spin" />
  //     </div>
  //   );
  // }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
        <div className="flex items-center gap-3">
          <Target className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tighter sm:text-3xl">
            Frame Sniper
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-sm text-muted-foreground">
                {profile?.email}
              </span>
              {isAdmin && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/admin">
                    <Settings className="mr-2 h-4 w-4" />
                    Admin Panel
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign Out
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          )}
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center p-2 sm:p-4 md:p-8">
        <FrameFlow />
      </main>
    </div>
  );
}