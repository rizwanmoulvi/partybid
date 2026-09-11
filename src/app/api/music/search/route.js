import { NextResponse } from 'next/server';
import { searchMusic } from '@/lib/music';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQuery = searchParams.get('q');
    
    // Validate existence
    if (typeof rawQuery !== 'string') {
      return NextResponse.json({ error: 'Bad Request: Missing search query' }, { status: 400 });
    }

    // Trim whitespace
    const query = rawQuery.trim();

    // Reject empty queries
    if (!query) {
      return NextResponse.json({ error: 'Bad Request: Empty search query' }, { status: 400 });
    }

    // Enforce reasonable max length (e.g., 100 characters)
    if (query.length > 100) {
      return NextResponse.json({ error: 'Bad Request: Search query too long' }, { status: 400 });
    }

    const results = await searchMusic(query);

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    console.error('Music search error:', error);

    if (error.code === 'PROVIDER_AUTH_ERROR' || error.code === 'PROVIDER_SEARCH_ERROR') {
      return NextResponse.json({ 
        error: `Music provider API failure: ${error.message}` 
      }, { status: 502 }); // Bad Gateway since the upstream failed
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
