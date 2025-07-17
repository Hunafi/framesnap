import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

console.log('Starting analyze-frame function');
console.log('OpenAI API key configured:', !!openAIApiKey);
console.log('Supabase URL configured:', !!supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData } = await req.json();

    if (!imageData) {
      throw new Error('Image data is required');
    }

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Analyzing frame with GPT-4o-mini');

    // Fetch custom prompt from admin settings
    const { data: settingData } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'analyze_frame_prompt')
      .single();

    const customPrompt = settingData?.setting_value || 'You are an expert video frame analyzer. Analyze the provided frame and describe what you see in 2-3 concise sentences. Focus on key visual elements, actions, objects, people, and scene context.';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: customPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this video frame and provide a detailed description:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 120,
        temperature: 0.2
      }),
    });

    // Log rate limit headers for monitoring
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining-requests');
    const rateLimitReset = response.headers.get('x-ratelimit-reset-requests');
    const retryAfter = response.headers.get('retry-after');
    
    console.log('Rate limit info:', { rateLimitRemaining, rateLimitReset, retryAfter });

    if (!response.ok) {
      const error = await response.json();
      // Include rate limit info in error for better handling
      const errorMessage = error.error?.message || 'Failed to analyze frame';
      if (response.status === 429) {
        throw new Error(`Rate limit exceeded: ${errorMessage}. Retry after: ${retryAfter || 'unknown'}`);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const description = data.choices[0].message.content;

    console.log('Frame analysis completed');

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in analyze-frame function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});