import { useState, useCallback, useRef } from 'react';

interface RequestState {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  startTime: number;
  endTime?: number;
  retryCount: number;
  error?: string;
  result?: any;
}

interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailureTime: number;
  nextRetryTime: number;
}

interface ProcessingStats {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  successRate: number;
  currentConcurrency: number;
}

export interface UseAdvancedRequestManagerReturn {
  submitRequest: <T>(fn: () => Promise<T>, id: string, timeoutMs?: number) => Promise<T>;
  cancelRequest: (id: string) => void;
  cancelAllRequests: () => void;
  getRequestState: (id: string) => RequestState | null;
  getCircuitBreakerState: () => CircuitBreakerState;
  getProcessingStats: () => ProcessingStats;
  isHealthy: () => boolean;
  resetCircuitBreaker: () => void;
  setMaxConcurrency: (limit: number) => void;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const CIRCUIT_BREAKER_THRESHOLD = 5; // Open circuit after 5 consecutive failures
const CIRCUIT_BREAKER_RESET_TIME = 60000; // Try to close circuit after 1 minute
const MAX_RETRY_ATTEMPTS = 3;

export function useAdvancedRequestManager(): UseAdvancedRequestManagerReturn {
  const [requests, setRequests] = useState<Map<string, RequestState>>(new Map());
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerState>({
    isOpen: false,
    failures: 0,
    lastFailureTime: 0,
    nextRetryTime: 0
  });
  const [stats, setStats] = useState<ProcessingStats>({
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    successRate: 0,
    currentConcurrency: 0
  });

  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const maxConcurrency = useRef<number>(3);
  const currentConcurrency = useRef<number>(0);
  const pendingQueue = useRef<Array<{ id: string; fn: () => Promise<any>; resolve: Function; reject: Function }>>([]);

  const updateRequestState = useCallback((id: string, updates: Partial<RequestState>) => {
    setRequests(prev => {
      const newRequests = new Map(prev);
      const current = newRequests.get(id);
      if (current) {
        newRequests.set(id, { ...current, ...updates });
      }
      return newRequests;
    });
  }, []);

  const updateStats = useCallback((completedRequest: RequestState) => {
    setStats(prev => {
      const newStats = { ...prev };
      
      if (completedRequest.status === 'completed') {
        newStats.completedRequests++;
      } else if (completedRequest.status === 'failed' || completedRequest.status === 'timeout') {
        newStats.failedRequests++;
      }

      const responseTime = completedRequest.endTime! - completedRequest.startTime;
      newStats.averageResponseTime = 
        (prev.averageResponseTime * (prev.completedRequests + prev.failedRequests - 1) + responseTime) / 
        (prev.completedRequests + prev.failedRequests);

      newStats.successRate = newStats.completedRequests / (newStats.completedRequests + newStats.failedRequests);
      newStats.currentConcurrency = currentConcurrency.current;

      return newStats;
    });
  }, []);

  const updateCircuitBreaker = useCallback((success: boolean) => {
    setCircuitBreaker(prev => {
      const now = Date.now();
      
      if (success) {
        // Reset on success
        return {
          isOpen: false,
          failures: 0,
          lastFailureTime: 0,
          nextRetryTime: 0
        };
      } else {
        // Increment failures
        const newFailures = prev.failures + 1;
        const shouldOpen = newFailures >= CIRCUIT_BREAKER_THRESHOLD;
        
        return {
          isOpen: shouldOpen,
          failures: newFailures,
          lastFailureTime: now,
          nextRetryTime: shouldOpen ? now + CIRCUIT_BREAKER_RESET_TIME : prev.nextRetryTime
        };
      }
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (currentConcurrency.current >= maxConcurrency.current || pendingQueue.current.length === 0) {
      return;
    }

    const nextItem = pendingQueue.current.shift();
    if (!nextItem) return;

    currentConcurrency.current++;
    
    try {
      const result = await nextItem.fn();
      nextItem.resolve(result);
    } catch (error) {
      nextItem.reject(error);
    } finally {
      currentConcurrency.current--;
      // Process next item in queue
      setTimeout(processQueue, 0);
    }
  }, []);

  const submitRequest = useCallback(async <T>(
    fn: () => Promise<T>,
    id: string,
    timeoutMs: number = DEFAULT_TIMEOUT
  ): Promise<T> => {
    const now = Date.now();

    // Check circuit breaker
    if (circuitBreaker.isOpen) {
      if (now < circuitBreaker.nextRetryTime) {
        throw new Error(`Circuit breaker is open. Next retry available at ${new Date(circuitBreaker.nextRetryTime).toLocaleTimeString()}`);
      } else {
        // Try to close circuit breaker (half-open state)
        setCircuitBreaker(prev => ({ ...prev, isOpen: false }));
      }
    }

    // Initialize request state
    const requestState: RequestState = {
      id,
      status: 'pending',
      startTime: now,
      retryCount: 0
    };

    setRequests(prev => new Map(prev).set(id, requestState));
    setStats(prev => ({ ...prev, totalRequests: prev.totalRequests + 1 }));

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllers.current.set(id, abortController);

    const executeRequest = async (): Promise<T> => {
      updateRequestState(id, { status: 'processing' });

      return new Promise<T>(async (resolve, reject) => {
        // Handle concurrency limiting
        if (currentConcurrency.current >= maxConcurrency.current) {
          pendingQueue.current.push({ id, fn, resolve, reject });
          return;
        }

        currentConcurrency.current++;

        const timeoutId = setTimeout(() => {
          const controller = abortControllers.current.get(id);
          if (controller) {
            controller.abort();
            reject(new Error('Request timeout'));
          }
        }, timeoutMs);

        try {
          if (abortController.signal.aborted) {
            throw new Error('Request cancelled');
          }

          const result = await fn();
          
          clearTimeout(timeoutId);
          const endTime = Date.now();
          
          updateRequestState(id, { 
            status: 'completed', 
            endTime,
            result 
          });
          
          updateCircuitBreaker(true);
          updateStats({ ...requestState, status: 'completed', endTime });
          
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          const endTime = Date.now();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
          const isCancelled = errorMessage.includes('cancelled') || errorMessage.includes('abort');
          
          let finalStatus: RequestState['status'] = 'failed';
          if (isTimeout) finalStatus = 'timeout';
          if (isCancelled) finalStatus = 'cancelled';
          
          updateRequestState(id, { 
            status: finalStatus, 
            endTime,
            error: errorMessage 
          });
          
          if (!isCancelled) {
            updateCircuitBreaker(false);
            updateStats({ ...requestState, status: finalStatus, endTime });
          }
          
          reject(error);
        } finally {
          currentConcurrency.current--;
          abortControllers.current.delete(id);
          
          // Process any pending requests
          setTimeout(processQueue, 0);
        }
      });
    };

    return executeRequest();
  }, [circuitBreaker, updateRequestState, updateCircuitBreaker, updateStats, processQueue]);

  const cancelRequest = useCallback((id: string) => {
    const controller = abortControllers.current.get(id);
    if (controller) {
      controller.abort();
    }
    
    updateRequestState(id, { 
      status: 'cancelled', 
      endTime: Date.now() 
    });
    
    // Remove from pending queue if present
    pendingQueue.current = pendingQueue.current.filter(item => item.id !== id);
  }, [updateRequestState]);

  const cancelAllRequests = useCallback(() => {
    // Cancel all active requests
    abortControllers.current.forEach(controller => controller.abort());
    abortControllers.current.clear();
    
    // Clear pending queue
    pendingQueue.current.forEach(item => {
      item.reject(new Error('Batch operation cancelled'));
    });
    pendingQueue.current = [];
    
    // Update all pending/processing requests to cancelled
    setRequests(prev => {
      const newRequests = new Map();
      prev.forEach((request, id) => {
        if (request.status === 'pending' || request.status === 'processing') {
          newRequests.set(id, {
            ...request,
            status: 'cancelled' as const,
            endTime: Date.now()
          });
        } else {
          newRequests.set(id, request);
        }
      });
      return newRequests;
    });
    
    currentConcurrency.current = 0;
  }, []);

  const getRequestState = useCallback((id: string): RequestState | null => {
    return requests.get(id) || null;
  }, [requests]);

  const getCircuitBreakerState = useCallback((): CircuitBreakerState => {
    return circuitBreaker;
  }, [circuitBreaker]);

  const getProcessingStats = useCallback((): ProcessingStats => {
    return { ...stats, currentConcurrency: currentConcurrency.current };
  }, [stats]);

  const isHealthy = useCallback((): boolean => {
    return !circuitBreaker.isOpen && stats.successRate > 0.7; // Consider healthy if >70% success rate
  }, [circuitBreaker.isOpen, stats.successRate]);

  const resetCircuitBreaker = useCallback(() => {
    setCircuitBreaker({
      isOpen: false,
      failures: 0,
      lastFailureTime: 0,
      nextRetryTime: 0
    });
  }, []);

  const setMaxConcurrency = useCallback((limit: number) => {
    maxConcurrency.current = Math.max(1, limit);
  }, []);

  return {
    submitRequest,
    cancelRequest,
    cancelAllRequests,
    getRequestState,
    getCircuitBreakerState,
    getProcessingStats,
    isHealthy,
    resetCircuitBreaker,
    setMaxConcurrency
  };
}