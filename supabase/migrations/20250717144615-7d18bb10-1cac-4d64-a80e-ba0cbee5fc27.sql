-- Create table for caching AI frame descriptions with 24-hour TTL
CREATE TABLE public.frame_analysis_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_hash TEXT NOT NULL UNIQUE,
  ai_description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- Enable Row Level Security
ALTER TABLE public.frame_analysis_cache ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (since this is for optimization)
CREATE POLICY "Allow public read access to frame analysis cache" 
ON public.frame_analysis_cache 
FOR SELECT 
USING (expires_at > now());

-- Create policy for public insert access
CREATE POLICY "Allow public insert to frame analysis cache" 
ON public.frame_analysis_cache 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_frame_analysis_cache_hash ON public.frame_analysis_cache(image_hash);
CREATE INDEX idx_frame_analysis_cache_expires ON public.frame_analysis_cache(expires_at);

-- Create function to clean up expired entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_frame_cache()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.frame_analysis_cache 
  WHERE expires_at < now();
END;
$$;