import { google } from '@ai-sdk/google';
import {
  createDataStream,
  pipeDataStreamToResponse,
  streamText,
  tool,
  type Tool,
} from 'ai';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 30;

export function errorHandler(error: unknown) {
  if (error == null) {
    return 'unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return JSON.stringify(error);
}

const API_BASE_URL = 'https://be.ithaka.world/api';

export async function fetchDestinations() {
  const response = await fetch(`${API_BASE_URL}/destinations`);
  if (!response.ok) {
    throw new Error('Failed to fetch destinations');
  }
  return response.json().then((res) => res.data);
}

export async function fetchListings(params?: {
  destination?: string;
  category?: string;
  priceRange?: [number, number];
  date?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.destination)
    searchParams.append('destination', params.destination);
  if (params?.category) searchParams.append('category', params.category);
  if (params?.priceRange)
    searchParams.append('price_range', params.priceRange.join(','));
  if (params?.date) searchParams.append('date', params.date);

  const response = await fetch(`${API_BASE_URL}/activities?${searchParams}`);
  if (!response.ok) {
    throw new Error('Failed to fetch listings');
  }
  return response.json().then((res) => res.data.listings);
}

export async function searchListings(params: URLSearchParams) {
  const response = await fetch(`${API_BASE_URL}/activities?${params}`)
    .then((res) => res.json())
    .then((res) =>
      res.data.listings.map((item: any) => {
        return {
          name: item.title,
          slug: item.slug,
          price: item.min_price,
          description: item.description,
          categories: item.categories as { name: string }[],
        };
      })
    )
    .catch((err) => {
      console.error('Failed to fetch listings:', err.message);
    });

  return response;
}

const searchListingsTool = tool({
  description:
    'Search for available tours, activities, and experiences based on location, date, and type',
  parameters: z.object({
    search: z.string().optional().describe('Free text search query'),
    categories: z.array(z.number()).optional().describe('Category IDs'),
    destinations: z.array(z.number()).min(1).describe('Destination IDs'),
    min_price: z.number().optional().describe('Minimum price'),
    max_price: z.number().optional().describe('Maximum price'),
    sort_by: z
      .enum([
        'price-low-to-high',
        'price-high-to-low',
        'best-selling',
        'top-reviewed',
      ])
      .optional(),
  }),
  execute: async ({
    search,
    categories,
    destinations,
    min_price,
    max_price,
    sort_by,
  }) => {
    try {
      const params = new URLSearchParams();

      // Add array parameters
      destinations.forEach((id, index) =>
        params.append(`destinations[${index}]`, id.toString())
      );
      categories?.forEach((id, index) =>
        params.append(`categories[${index}]`, id.toString())
      );

      // Add other parameters
      if (search) params.set('search', search);
      if (min_price) params.set('min_price', min_price.toString());
      if (max_price) params.set('max_price', max_price.toString());
      if (sort_by) params.set('sort_by', sort_by);

      console.log('🔍 API Query Params:', params.toString());

      const response = await searchListings(params);

      return response;
    } catch (error) {
      console.error('❌ Search error:', error);
      return { success: false, error: errorHandler(error) };
    }
  },
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return new Response('Google API key not configured', { status: 500 });
    }

    const destinations = await fetchDestinations();
    const destinationNames = destinations.map((d) => d.name);

    const result = streamText({
      model: google('gemini-1.5-flash'),
      messages,
      system: `You are Ithaka's specialized AI assistant for tourism. You have access to the following data:
      Destinations: ${JSON.stringify(destinations)}

      Your goal is to help visitors set up their trips by suggesting programs and providing relevant information based on Ithaka's data.
      You must follow these STRICT rules:

      1. MUST USE searchListings tool when ANY of these destinations are mentioned (but never mention it's name): ${destinationNames.join(
        ', '
      )}
      2. Always maintain a friendly and professional tone in your responses
      3. Even if you have general knowledge, ALWAYS check real listings for:
        - Exact prices and availability
        - Current promotions
        - Time-sensitive offers
      4. For destination-specific questions, FIRST use searchListings (but never mention it's name) before answering
      5. Response format:
        - Start with a brief overview
        - List 3-5 verified options from search results
        - Include prices, durations, and booking status
        - End with a call-to-action
        
        Note: Never actually mention the tool in your responses .
        Note: Never hallucinate or make up information. Always use the data provided and if there is none 
        available, you can fallback to the information available
        .

        Always be friendly, professional, and focus on helping users find the perfect travel experiences.
        `,
      tools: {
        searchListings: searchListingsTool,
      },
      maxSteps: 10,
    });

    return result.toDataStreamResponse({
      getErrorMessage: errorHandler,
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: errorHandler(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
