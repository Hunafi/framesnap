import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const { imageData, customInstructions } = await req.json();

    if (!imageData) {
      throw new Error('Image data is required');
    }

    console.log('Generating AI prompt for frame');

    // Fetch default prompt from admin settings
    const { data: settingData } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'generate_prompt_default')
      .single();

    const defaultPrompt = settingData?.setting_value || 'You are an expert AI image generation prompt writer. Based on the provided image, create a detailed, creative prompt that could be used to generate a similar image with AI. Focus on visual style, composition, lighting, colors, mood, and specific details. Make the prompt descriptive and specific enough to recreate the essence of the image.';

    // Use custom instructions if provided, otherwise use default from admin settings
    const systemPrompt = customInstructions || defaultPrompt;

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
            content: `${systemPrompt}\n\nIMPORTANT: Return ONLY the prompt text without any headers, titles, or markdown formatting. Do not include phrases like "AI Image Generation Prompt:" or similar titles. Just provide the clean, descriptive prompt directly.`
          },
          {
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
          }
        ],
        max_tokens: 300,
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate prompt');
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