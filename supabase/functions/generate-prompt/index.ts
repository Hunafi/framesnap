import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

console.log('Starting generate-prompt function');
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
    const { imageData, imageDescription, customInstructions } = await req.json();

    if (!imageData && !imageDescription) {
      throw new Error('Either image data or image description is required');
    }

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Generating AI prompt for frame');

    // Fetch default prompt from admin settings
    const { data: settingData } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'generate_prompt_default')
      .single();

    const defaultPrompt = settingData?.setting_value || 'You are an expert AI image generation prompt writer. Based on the provided image description, create a detailed, creative prompt that could be used to generate a similar image with AI. Focus on enhancing the visual style, composition, lighting, colors, mood, and specific details mentioned in the description. Make the prompt descriptive and specific enough to recreate the essence of the image.';

    // Use custom instructions if provided, otherwise use default from admin settings
    const systemPrompt = customInstructions || defaultPrompt;

    // Build messages based on whether we have an image description
    const messages = [
      {
        role: 'system',
        content: `${systemPrompt}\n\nIMPORTANT: Return ONLY the enhanced prompt text without any headers, titles, or markdown formatting. Do not include phrases like "AI Image Generation Prompt:" or similar titles. Just provide the clean, descriptive prompt directly.`
      }
    ];

    if (imageDescription) {
      // If we have an image description, use it to create an enhanced prompt
      messages.push({
        role: 'user',
        content: `Based on this detailed image description, create an enhanced AI image generation prompt that incorporates all the visual elements, camera angles, lighting conditions, moods, and styles mentioned:

IMAGE DESCRIPTION:
${imageDescription}

Please create a detailed prompt that builds upon this description to generate a similar image.`
      });
    } else {
      // Fallback to direct image analysis if no description is provided
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Based on this image, create a detailed image generation prompt:'
          },
          {
            type: 'image_url',
            image_url: {
              url: imageData
            }
          }
        ]
      });
    }

    // Optimize request based on whether we're using image description or not
    const requestBody = {
      model: imageDescription ? 'gpt-4o-mini' : 'gpt-4o-mini', // Keep vision model for consistency
      messages,
      max_tokens: imageDescription ? 180 : 200, // Reduce tokens when using description
      temperature: 0.4 // Lower temperature for more consistent results
    };

    console.log('Request mode:', imageDescription ? 'text-enhanced' : 'vision-direct');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Log rate limit headers for monitoring
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining-requests');
    const rateLimitReset = response.headers.get('x-ratelimit-reset-requests');
    const retryAfter = response.headers.get('retry-after');
    
    console.log('Rate limit info:', { rateLimitRemaining, rateLimitReset, retryAfter });

    if (!response.ok) {
      const error = await response.json();
      const errorMessage = error.error?.message || 'Failed to generate prompt';
      if (response.status === 429) {
        throw new Error(`Rate limit exceeded: ${errorMessage}. Retry after: ${retryAfter || 'unknown'}`);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    let prompt = data.choices[0].message.content;

    // Clean up any remaining formatting or headers
    prompt = prompt
      .replace(/^\*\*.*?\*\*:?\s*/gm, '') // Remove **Headers:** at start of lines
      .replace(/^\*.*?\*:?\s*/gm, '')     // Remove *Headers:* at start of lines  
      .replace(/^#+\s*/gm, '')            // Remove markdown headers
      .replace(/^-\s*/gm, '')             // Remove bullet points
      .trim();

    console.log('Prompt generation completed');

    return new Response(JSON.stringify({ prompt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-prompt function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});