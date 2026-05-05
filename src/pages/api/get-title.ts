import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const urlParam = new URL(request.url).searchParams.get('url');
  if (!urlParam) return new Response('Missing URL', { status: 400 });

  try {
    const response = await fetch(urlParam);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
    
    const html = await response.text();
    
    // Extract the <title> tag using regex
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : urlParam; // Fallback to URL if no title
    
    // Decode HTML entities if any (simple version)
    const decodedTitle = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");

    return new Response(JSON.stringify({ title: decodedTitle }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching title:', error);
    return new Response(JSON.stringify({ title: urlParam, error: 'Failed to fetch title' }), { 
      status: 200, // Returning 200 with fallback title is often safer for frontend logic
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
