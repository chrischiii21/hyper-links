import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const urlParam = new URL(request.url).searchParams.get('url');
  if (!urlParam) return new Response('Missing URL', { status: 400 });

  try {
    const response = await fetch(urlParam);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
    
    const html = await response.text();
    
    // Extract the <title> tag
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract the first <h1> tag
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
    const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="(.*?)"/i) || 
                      html.match(/<meta[^>]*content="(.*?)"[^>]*name="description"/i);
    const description = descMatch ? descMatch[1].trim() : '';

    return new Response(JSON.stringify({ 
      title: decodedTitle(title), 
      h1: decodedTitle(h1),
      description: decodedTitle(description)
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching title:', error);
    return new Response(JSON.stringify({ title: urlParam, h1: '', description: '', error: 'Failed to fetch title' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

function decodedTitle(text: string) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ');
}
