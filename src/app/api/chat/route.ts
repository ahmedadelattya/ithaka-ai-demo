import { google } from "@ai-sdk/google";
import {
    createDataStream,
    pipeDataStreamToResponse,
    streamText,
    tool,
    type Tool,
} from "ai";
import { z } from "zod";
import Fuse from "fuse.js";

export const runtime = "nodejs";
export const maxDuration = 30;

export function errorHandler(error: unknown) {
    if (error == null) {
        return "unknown error";
    }

    if (typeof error === "string") {
        return error;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return JSON.stringify(error);
}

const API_BASE_URL = "http://localhost/ithaka_backend/public/api";

export async function fetchDestinations() {
    const response = await fetch(`${API_BASE_URL}/destinations`);
    if (!response.ok) {
        throw new Error("Failed to fetch destinations");
    }
    return response.json().then((res) => res.data);
}

export async function fetchCategories() {
    const response = await fetch(`${API_BASE_URL}/categories`);
    if (!response.ok) {
        throw new Error("Failed to fetch categories");
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
        searchParams.append("destination", params.destination);
    if (params?.category) searchParams.append("category", params.category);
    if (params?.priceRange)
        searchParams.append("price_range", params.priceRange.join(","));
    if (params?.date) searchParams.append("date", params.date);

    const response = await fetch(`${API_BASE_URL}/activities?${searchParams}`);
    if (!response.ok) {
        throw new Error("Failed to fetch listings");
    }
    return response.json().then((res) => res.data.listings);
}

export async function searchListings(params: URLSearchParams) {
    const response = await fetch(
        `${API_BASE_URL}/activities?${params}&per_page=50`
    )
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
            console.error("Failed to fetch listings:", err.message);
        });

    return response;
}

// 🔥 Supported sorting options (for fuzzy matching)
const SORT_OPTIONS = [
    "price-low-to-high",
    "price-high-to-low",
    "best-selling",
    "top-reviewed",
];

// Setup Fuse.js for fuzzy sorting
const fuseSort = new Fuse(SORT_OPTIONS, {
    threshold: 0.4, // Adjust sensitivity (0 = strict, 1 = very loose)
});

// Function to get the best sort match
function getClosestSortOption(
    userInput: string | undefined
): string | undefined {
    if (!userInput) return undefined;
    const result = fuseSort.search(userInput.toLowerCase());
    return result.length > 0 ? result[0].item : undefined;
}

const searchListingsTool = tool({
    description:
        "Search for available tours, activities, and experiences based on location, date, and type",
    parameters: z.object({
        search: z.string().optional().describe("Free text search query"),
        categories: z.array(z.number()).optional().describe("Category IDs"),
        destinations: z
            .array(z.number())
            .optional()
            .describe("Destination IDs"),
        min_price: z.number().optional().describe("Minimum price"),
        max_price: z.number().optional().describe("Maximum price"),
        sort_by: z
            .enum([
                "price-low-to-high",
                "price-high-to-low",
                "best-selling",
                "top-reviewed",
            ])
            .optional()
            .describe("Sort Options"),
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

            // Debug initial values
            console.log("Debug: search =", search);
            console.log("Debug: categories =", categories);
            console.log("Debug: destinations =", destinations);
            console.log("Debug: min_price =", min_price);
            console.log("Debug: max_price =", max_price);
            console.log("Debug: sort_by =", sort_by);

            // Add array parameters
            destinations?.forEach((id) => {
                params.append("destinations[]", id.toString());
            });
            categories?.forEach((id) => {
                params.append("categories[]", id.toString());
            });

            // Add other parameters
            if (search) {
                params.set("search", search);
                console.log("Debug: Set search =", search);
            }
            if (min_price) {
                params.set("min_price", min_price.toString());
                console.log("Debug: Set min_price =", min_price);
            }
            if (max_price) {
                params.set("max_price", max_price.toString());
                console.log("Debug: Set max_price =", max_price);
            }
            // Apply fuzzy sorting logic
            const normalizedSort = getClosestSortOption(sort_by);
            if (normalizedSort) {
                params.set("sort_by", normalizedSort);
                console.log("✅ Mapped sort_by =", normalizedSort);
            } else {
                console.log("⚠️ No valid sort match found. Ignoring...");
            }

            // Final debug output of constructed query parameters
            console.log("🔍 Final API Query Params:", params.toString());

            // Final debug output of constructed query parameters
            console.log("🔍 Final API Query Params:", params.toString());

            const response = await searchListings(params);

            return response;
        } catch (error) {
            console.error("❌ Search error:", error);
            return { success: false, error: errorHandler(error) };
        }
    },
});

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();

        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            return new Response("Google API key not configured", {
                status: 500,
            });
        }

        const destinations = await fetchDestinations();
        const destinationNames = destinations.map((d) => d.name);

        const categories = await fetchCategories();
        const categoryNames = categories.map((cat) => cat.name.toLowerCase());

        const userMessage = messages[messages.length - 1].content.toLowerCase();

        // **Fuzzy Matching for Categories Using Fuse.js**
        const fuse = new Fuse(categoryNames, { threshold: 0.6 });
        const fuzzyResults = fuse
            .search(userMessage)
            .map((result) => result.item);

        let matchedCategories = fuzzyResults.length > 0 ? fuzzyResults : null;

        console.log("✅ Matched Categories:", matchedCategories || "None");

        // **If the category does NOT exist in our records, inform the user**
        if (!matchedCategories || matchedCategories.length === 0) {
            matchedCategories = undefined;
        }

        const result = streamText({
            model: google("gemini-2.0-flash-001"),
            messages,
            system: `You are Ithaka's specialized AI assistant for tourism . You have access to the following ithaka data:
              Destinations: ${JSON.stringify(destinations)}
              Categories: ${JSON.stringify(categories)}
            
              Your goal is to help visitors set up their trips by suggesting programs and providing relevant information based on Ithaka's data.
              You must follow these STRICT rules:
        
              1. If the user specifies a destination, you MUST use searchListings  (but never mention its name): ${destinationNames.join(
                  ", "
              )} to retrieve relevant activities.
              2. If the user specifies a category (even without a destination), you MUST use searchListings (but never mention its name): ${categoryNames.join(
                  ", "
              )}
              3. If the user does not specify a destination or category or activity(make sure the user is ok with that),suggest general listings covering diverse activities using searchListing is a must also.
              4. Always maintain a friendly and professional tone in your responses.
              5. Even if you have general knowledge, ALWAYS check real listings for:
                  - Exact prices and availability
                  - Current promotions
                  - Time-sensitive offers
              6. Always format your response as follows:
                 - Start with a brief overview from the description
                 - List all verified options from search results
                 - Include prices, durations, and booking status
                 - End with a call-to-action
        
              Note: Never actually mention the tool in your responses.
              Note: Never suggest any thing outside ithaka data.
              Note: Never speak with the user outside the scope of ithaka data and tourism.
              Note: Never hallucinate or make up information. Always use the data provided, and if there is none available, fallback to general recommendations.
              
              If the user asks for all available listings, provide them.`,

            tools: {
                searchListings: searchListingsTool,
            },
            maxSteps: 10,
        });

        return result.toDataStreamResponse({
            getErrorMessage: errorHandler,
        });
    } catch (error) {
        console.error("Chat API Error:", error);
        return new Response(
            JSON.stringify({
                error: "Internal server error",
                details: errorHandler(error),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
