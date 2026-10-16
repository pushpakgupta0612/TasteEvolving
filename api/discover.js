const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';

function send(res, status, body) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET for discovery searches.' });
  const type = String(req.query?.type || 'movie').toLowerCase();
  const query = String(req.query?.q || '').trim().slice(0, 120);
  if (!query) return send(res, 400, { error: 'Enter a search term.' });
  if (!['movie', 'book', 'music'].includes(type)) return send(res, 400, { error: 'Unsupported discovery type.' });

  try {
    if (type === 'movie') {
      const token = process.env.TMDB_READ_ACCESS_TOKEN;
      const apiKey = process.env.TMDB_API_KEY;
      if (!token && !apiKey) return send(res, 503, { error: 'Film & TV search needs TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in Vercel Environment Variables. Book and music search work without a private key.' });
      const url = new URL('https://api.themoviedb.org/3/search/multi');
      url.searchParams.set('query', query);
      url.searchParams.set('include_adult', 'false');
      url.searchParams.set('language', 'en-US');
      url.searchParams.set('page', '1');
      if (apiKey && !token) url.searchParams.set('api_key', apiKey);
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' } });
      if (!response.ok) return send(res, 502, { error: `TMDB search returned ${response.status}. Check the API credentials and try again.` });
      const data = await response.json();
      const results = (data.results || []).filter(item => ['movie', 'tv'].includes(item.media_type)).slice(0, 8).map(item => ({
        id: `tmdb-${item.media_type}-${item.id}`,
        title: String(item.title || item.name || 'Untitled'),
        creator: item.media_type === 'tv' ? 'Television' : 'Film',
        year: String((item.release_date || item.first_air_date || '').slice(0, 4) || 'Year unavailable'),
        description: String(item.overview || 'No overview supplied by TMDB.'),
        image: item.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : item.backdrop_path ? `${TMDB_IMAGE}${item.backdrop_path}` : '',
        url: `https://www.themoviedb.org/${item.media_type}/${item.id}`,
        source: 'TMDB', kind: 'movie'
      }));
      return send(res, 200, { results });
    }

    if (type === 'book') {
      const url = new URL('https://openlibrary.org/search.json');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', '8');
      url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,edition_count');
      const response = await fetch(url);
      if (!response.ok) return send(res, 502, { error: 'Open Library is not responding right now.' });
      const data = await response.json();
      const results = (data.docs || []).slice(0, 8).map(doc => ({
        id: String(doc.key || doc.title), title: String(doc.title || 'Untitled'), creator: (doc.author_name || ['Unknown author']).slice(0, 2).join(', '),
        year: String(doc.first_publish_year || 'Year unavailable'), description: `${doc.edition_count || 1} editions listed in Open Library.`,
        image: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '', url: `https://openlibrary.org${doc.key || ''}`, source: 'Open Library', kind: 'book'
      }));
      return send(res, 200, { results });
    }

    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.set('term', query);
    url.searchParams.set('entity', 'song');
    url.searchParams.set('limit', '8');
    const response = await fetch(url);
    if (!response.ok) return send(res, 502, { error: 'Apple iTunes Search is not responding right now.' });
    const data = await response.json();
    const results = (data.results || []).slice(0, 8).map(item => ({
      id: String(item.trackId || item.collectionId || item.trackName), title: String(item.trackName || item.collectionName || 'Untitled'), creator: String(item.artistName || 'Unknown artist'),
      year: String((item.releaseDate || '').slice(0, 4) || 'Year unavailable'), description: [item.collectionName, item.primaryGenreName].filter(Boolean).join(' · ') || 'Music result from Apple iTunes Search.',
      image: String(item.artworkUrl100 || '').replace('100x100bb', '600x600bb'), url: String(item.trackViewUrl || item.collectionViewUrl || 'https://music.apple.com/'), source: 'Apple iTunes', kind: 'music'
    }));
    return send(res, 200, { results });
  } catch {
    return send(res, 502, { error: 'Live discovery could not reach its data source. Please try again.' });
  }
}
