export async function searchMusic(query) {
  // iTunes Search API strictly uses 'term' for the query string
  const encodedQuery = encodeURIComponent(query);
  const params = `term=${encodedQuery}&entity=song&limit=10`;

  let res = await fetch(`https://itunes.apple.com/search?${params}`);

  // Handle iTunes API rate limit (usually 403 or 429 if abused, though very generous)
  if (res.status === 429 || res.status === 403) {
    const retryAfter = res.headers.get("Retry-After") || 1;
    console.warn(`iTunes API rate limit hit. Retrying after ${retryAfter} seconds...`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    res = await fetch(`https://itunes.apple.com/search?${params}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'No response body');
    console.error("iTunes API search failed:", res.status, errText);
    const error = new Error(`Failed to search music provider: ${res.status} - ${errText}`);
    error.code = 'PROVIDER_SEARCH_ERROR';
    error.status = res.status; 
    throw error;
  }

  const data = await res.json();
  
  if (!data.results || data.results.length === 0) {
    return [];
  }

  return data.results.map(track => ({
    id: track.trackId.toString(),
    title: track.trackName,
    artist: track.artistName,
    album: track.collectionName,
    // iTunes provides 100x100 artwork by default. Replacing it with 300x300 gives us high-res UI images!
    artworkUrl: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '300x300bb') : null,
    durationMs: track.trackTimeMillis
  }));
}
