import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAdminSettings } from '@/hooks/use-admin-settings';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Navigate, useNavigate } from 'react-router-dom';
import { Target, Loader2, Save, AlertTriangle, ArrowLeft } from 'lucide-react';
import { CopyableTextarea } from '@/components/copyable-textarea';

export default function Admin() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { settings, loading: settingsLoading, updateSetting, getSetting } = useAdminSettings();
  const [analyzePrompt, setAnalyzePrompt] = useState('');
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Redirect if not authenticated or not admin
  if (!authLoading && (!user || !profile?.is_admin)) {
    return <Navigate to="/auth" replace />;
  }

  useEffect(() => {
    if (settings.length > 0) {
      const analyzeSetting = getSetting('analyze_frame_prompt');
      const generateSetting = getSetting('generate_prompt_default');
      
      if (analyzeSetting) setAnalyzePrompt(analyzeSetting.setting_value);
      if (generateSetting) setGeneratePrompt(generateSetting.setting_value);
    }
  }, [settings]);

  if (authLoading || settingsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    
    try {
      const [analyzeResult, generateResult] = await Promise.all([
        updateSetting('analyze_frame_prompt', analyzePrompt),
        updateSetting('generate_prompt_default', generatePrompt),
      ]);

      if (analyzeResult.success && generateResult.success) {
        toast({ title: 'Settings saved successfully!' });
      } else {
        const errors = [
          analyzeResult.error,
          generateResult.error,
        ].filter(Boolean);
        
        toast({
          title: 'Error saving settings',
          description: errors.join(', '),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Failed to save settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
        <div className="flex items-center gap-3">
          <Target className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tighter">
            Frame Sniper Admin
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {profile?.email}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate('/')} className="text-white">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to App
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </header>
      
      <div className="flex flex-1 flex-col p-6">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You are accessing the admin interface. Changes made here will affect how the AI analyzes images across the entire application.
            </AlertDescription>
          </Alert>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Frame Analysis Prompt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="analyze-prompt">
                    Custom instruction for analyzing video frames
                  </Label>
                  <CopyableTextarea
                    value={analyzePrompt}
                    onChange={setAnalyzePrompt}
                    placeholder="Enter custom instruction for frame analysis..."
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Image Generation Prompt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="generate-prompt">
                    Default instruction for generating AI prompts
                  </Label>
                  <CopyableTextarea
                    value={generatePrompt}
                    onChange={setGeneratePrompt}
                    placeholder="Enter default instruction for prompt generation..."
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}