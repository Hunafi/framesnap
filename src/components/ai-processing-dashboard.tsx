import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Clock, 
  Zap, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Pause, 
  Play, 
  RotateCcw,
  TrendingUp,
  DollarSign,
  Gauge
} from 'lucide-react';
import type { SmartBatchProgress } from '@/hooks/use-smart-ai-processor';
import type { UseTokenBudgetManagerReturn } from '@/hooks/use-token-budget-manager';
import type { UseAdvancedRequestManagerReturn } from '@/hooks/use-advanced-request-manager';

interface AIProcessingDashboardProps {
  progress: SmartBatchProgress;
  tokenManager: UseTokenBudgetManagerReturn;
  requestManager: UseAdvancedRequestManagerReturn;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetryFailed: () => void;
  onProfileChange: (profile: 'conservative' | 'balanced' | 'aggressive') => void;
}

export const AIProcessingDashboard: React.FC<AIProcessingDashboardProps> = ({
  progress,
  tokenManager,
  requestManager,
  onPause,
  onResume,
  onStop,
  onRetryFailed,
  onProfileChange
}) => {
  const budget = tokenManager.getRemainingBudget();
  const usage = tokenManager.getUsageStats();
  const stats = requestManager.getProcessingStats();
  const circuitBreaker = requestManager.getCircuitBreakerState();
  const isHealthy = requestManager.isHealthy();

  const formatTime = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens < 1000) return tokens.toString();
    return `${(tokens / 1000).toFixed(1)}k`;
  };

  const getPhaseColor = () => {
    switch (progress.phase) {
      case 'processing': return 'bg-blue-500';
      case 'paused': return 'bg-yellow-500';
      case 'complete': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getPhaseIcon = () => {
    switch (progress.phase) {
      case 'processing': return <Activity className="h-4 w-4" />;
      case 'paused': return <Pause className="h-4 w-4" />;
      case 'complete': return <CheckCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const overallProgress = progress.totalFrames > 0 
    ? ((progress.completedFrames + progress.failedFrames) / progress.totalFrames) * 100 
    : 0;

  return (
    <Card className="w-full border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${getPhaseColor()} text-white`}>
              {getPhaseIcon()}
            </div>
            AI Processing Dashboard
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isHealthy ? "default" : "destructive"}>
              {isHealthy ? "Healthy" : "Degraded"}
            </Badge>
            {circuitBreaker.isOpen && (
              <Badge variant="destructive">Circuit Open</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span>{progress.completedFrames + progress.failedFrames}/{progress.totalFrames} frames</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Phase: {progress.phase}</span>
            <span>
              {progress.estimatedTimeRemaining > 0 && formatTime(progress.estimatedTimeRemaining)} remaining
            </span>
          </div>
        </div>

        {/* Current Batch Progress */}
        {progress.phase === 'processing' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Current Batch ({progress.currentBatch}/{progress.totalBatches})</span>
              <span>{progress.framesInCurrentBatch}/{progress.currentBatchSize} frames</span>
            </div>
            <Progress 
              value={progress.currentBatchSize > 0 ? (progress.framesInCurrentBatch / progress.currentBatchSize) * 100 : 0} 
              className="h-1" 
            />
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <div>
              <div className="text-lg font-semibold text-green-500">{progress.completedFrames}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <XCircle className="h-4 w-4 text-red-500" />
            <div>
              <div className="text-lg font-semibold text-red-500">{progress.failedFrames}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Zap className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-lg font-semibold text-blue-500">{progress.cachedFrames}</div>
              <div className="text-xs text-muted-foreground">Cached</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <TrendingUp className="h-4 w-4 text-purple-500" />
            <div>
              <div className="text-lg font-semibold text-purple-500">
                {progress.processingSpeed > 0 ? Math.round(progress.processingSpeed) : 0}
              </div>
              <div className="text-xs text-muted-foreground">Frames/min</div>
            </div>
          </div>
        </div>

        {/* Token Budget Status */}
        <div className="space-y-2 p-3 rounded-lg bg-card border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm font-medium">Token Budget</span>
            </div>
            <Badge variant="outline">{formatTokens(budget.tokens)} remaining</Badge>
          </div>
          {usage && (
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Usage Rate:</span>
                <div>{Math.round(usage.tokensPerMinute / 60)} tokens/sec</div>
              </div>
              <div>
                <span className="text-muted-foreground">Reset In:</span>
                <div>{formatTime(budget.timeToReset)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Request Manager Stats */}
        <div className="space-y-2 p-3 rounded-lg bg-card border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              <span className="text-sm font-medium">Request Performance</span>
            </div>
            <Badge variant="outline">{Math.round(stats.successRate * 100)}% success</Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Avg Response:</span>
              <div>{Math.round(stats.averageResponseTime / 1000)}s</div>
            </div>
            <div>
              <span className="text-muted-foreground">Concurrency:</span>
              <div>{stats.currentConcurrency}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Total Requests:</span>
              <div>{stats.totalRequests}</div>
            </div>
          </div>
        </div>

        {/* Quality Profile Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Processing Quality Profile</label>
          <div className="flex gap-2">
            {(['conservative', 'balanced', 'aggressive'] as const).map((profile) => (
              <Button
                key={profile}
                variant={progress.qualityProfile === profile ? "default" : "outline"}
                size="sm"
                onClick={() => onProfileChange(profile)}
                disabled={progress.phase === 'processing'}
              >
                {profile.charAt(0).toUpperCase() + profile.slice(1)}
              </Button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {progress.qualityProfile === 'conservative' && "Slow but most reliable, 1 concurrent request, 4s delays"}
            {progress.qualityProfile === 'balanced' && "Balanced speed and reliability, 2 concurrent requests, 2.5s delays"}
            {progress.qualityProfile === 'aggressive' && "Fast but may hit rate limits, 3 concurrent requests, 1.5s delays"}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2 pt-2">
          {progress.phase === 'processing' && (
            <Button variant="outline" size="sm" onClick={onPause}>
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
          )}
          
          {progress.phase === 'paused' && (
            <Button variant="outline" size="sm" onClick={onResume}>
              <Play className="mr-2 h-4 w-4" />
              Resume
            </Button>
          )}
          
          {(progress.phase === 'processing' || progress.phase === 'paused') && (
            <Button variant="destructive" size="sm" onClick={onStop}>
              <XCircle className="mr-2 h-4 w-4" />
              Stop
            </Button>
          )}
          
          {progress.failedFrames > 0 && progress.phase !== 'processing' && (
            <Button variant="outline" size="sm" onClick={onRetryFailed}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry Failed ({progress.failedFrames})
            </Button>
          )}

          {circuitBreaker.isOpen && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={requestManager.resetCircuitBreaker}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Reset Circuit
            </Button>
          )}
        </div>

        {/* Circuit Breaker Warning */}
        {circuitBreaker.isOpen && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Circuit Breaker Open</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Too many failures detected. Processing paused until {new Date(circuitBreaker.nextRetryTime).toLocaleTimeString()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};