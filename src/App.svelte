<script lang="ts">
  import { onMount } from 'svelte';
  import worksData from './lib/data/works.json';
  import factualConnectionsData from './lib/data/factual-connections.json';

  type Work = { id: string; title: string; creator: string; type: string; year: number; tags: string[]; mood: string; desc: string; region?: string; director?: string; cast?: string[]; genres?: string[]; emotionalArc?: string[]; storyBeat?: string; creditNote?: string; creditSourceUrl?: string; creditSourceLabel?: string };
  type PathMode = 'balanced' | 'surprising' | 'coherent';
  type SavedBridge = { id: number; start: string; end: string; path: string[]; mode: PathMode; savedAt: string };
  type Edge = { from: string; to: string; common: string[]; score: number };
  type SavedTrail = { id: number; name: string; path: string[]; savedAt: string };
  type FactualConnection = { id: string; from: string; to: string; kind: string; person: string; label: string; explanation: string; sourceLabel: string; sourceUrl?: string; sourceUrlSecondary?: string };
  type GameEdge = { kind: 'theme' | 'fact' | 'both' | 'mood' | 'genre' | 'actor' | 'director'; themes: string[]; fact?: FactualConnection };
  type GameMode = 'build' | 'quiz';
  type GameFilter = 'both' | 'themes' | 'facts' | 'mood' | 'director' | 'actors' | 'genre';

  const works: Work[] = worksData as Work[];
  const factualConnections: FactualConnection[] = factualConnectionsData as FactualConnection[];

  const categories = ['All','Book','Film','Series','Music','Art'];
  const palettes = ['#c4a7ff','#8edbd2','#ffb78b','#f1d98b','#e89ac8','#a9c5ff'];
  const tagColors: Record<string,string> = {identity:'#c4a7ff',technology:'#8edbd2',memory:'#ffb78b',power:'#f1d98b',alienation:'#e89ac8',humanity:'#a9c5ff',consciousness:'#8edbd2',morality:'#ffb78b',freedom:'#c4a7ff'};
  let activeTab = 'bridge';
  let gameMode: GameMode = 'quiz';
  let gameFilter: GameFilter = 'both';
  let gameStartId = 'w6';
  let gameTargetId = 'w48';
  let gamePathIds: string[] = ['w6'];
  let gameSearch = '';
  let selectedGameActor = '';
  let actorHintCount = 0;
  let actorHintText = '';
  let gameFeedback = '';
  let gameFeedbackKind: 'success' | 'error' | 'info' = 'info';
  let gameOptions: string[] = [];
  let gameScore = 0;
  let gameRounds = 0;
  let gameStreak = 0;
  let gameComplete = false;
  let gameLastEdge: GameEdge | null = null;
  let gameAdjacencyCache: Record<string, Record<string, string[]>> = {};
  let query = '';
  let category = 'All';
  let moodFilter = 'All moods';
  let selectedTag = 'All themes';
  let sortBy = 'curated';
  let exploreView: 'grid' | 'list' = 'grid';
  let selectedExploreId: string | null = null;
  let bridgeType: 'Book' | 'Film' = 'Film';
  let startId = 'w2';
  let endId = 'w48';
  let selectedNode: string | null = 'w1';
  let bridge: Work[] = [];
  let bridgeReason = '';
  let bridgeMode: PathMode = 'coherent';
  let savedIds: string[] = [];
  let savedBridges: SavedBridge[] = [];
  let trailIds: string[] = [];
  let savedTrails: SavedTrail[] = [];
  let page = 0;
  const pageSize = 24;
  let trailName = 'A trail of curiosity';
  let artworkUrls: Record<string, string> = {};
  let failedArtwork: string[] = [];
  let artworkStatus = 'Loading cover art';
  let loadingArtwork: string[] = [];
  let toast = '';
  let showAbout = false;
  let toastTimer: ReturnType<typeof setTimeout>;

  onMount(() => {
    try {
      savedIds = JSON.parse(localStorage.getItem('taste-saved') || '[]') as string[];
      savedBridges = JSON.parse(localStorage.getItem('taste-bridges') || '[]') as SavedBridge[];
      trailIds = JSON.parse(localStorage.getItem('taste-trail') || '[]') as string[];
      savedTrails = JSON.parse(localStorage.getItem('taste-trails') || '[]') as SavedTrail[];
      const gameStats = JSON.parse(localStorage.getItem('taste-game-stats') || '{}') as { score?: number; rounds?: number; streak?: number };
      gameScore = Number(gameStats.score || 0); gameRounds = Number(gameStats.rounds || 0); gameStreak = Number(gameStats.streak || 0);
    } catch { savedIds = []; savedBridges = []; trailIds = []; savedTrails = []; }
    const firstFilm = works.find(work => work.type === 'Film');
    if (firstFilm) startId = firstFilm.id;
    bridgeType = 'Film';
    generateRandomBridge();
    startNewGame();
    void loadArtwork(works.slice(0, 24).map(work => work.id));
  });

  async function resolveArtwork(work: Work): Promise<string | null> {
    // Books use Open Library covers; other media use Wikimedia page thumbnails.
    // Both are public sources and need no private API key. Results are cached locally.
    try {
      if (work.type === 'Book') {
        const params = new URLSearchParams({ title: work.title, limit: '5', fields: 'cover_i,title,author_name' });
        const response = await fetch(`https://openlibrary.org/search.json?${params}`);
        if (response.ok) {
          const data = await response.json();
          const docs = Array.isArray(data.docs) ? data.docs : [];
          const normalized = work.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          const match = docs.find((doc: any) => String(doc.title || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normalized && doc.cover_i);
          const coverId = match?.cover_i || docs.find((doc: any) => doc.cover_i)?.cover_i;
          if (coverId) return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
        }
      }
      const typeTerm = work.type === 'Film' ? 'film movie' : work.type === 'Series' ? 'television series' : work.type === 'Music' ? 'album music' : work.type === 'Art' ? 'painting artwork' : work.type;
      const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${work.title} ${typeTerm}`, gsrnamespace: '0', gsrlimit: '5', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '700', format: 'json', origin: '*' });
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
      if (!response.ok) return null;
      const data = await response.json();
      const pages = Object.values(data?.query?.pages || []) as any[];
      const normalized = work.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = pages.find((page: any) => String(page.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(normalized) && page.thumbnail?.source)
        || pages.find((page: any) => page.thumbnail?.source);
      return match?.thumbnail?.source || null;
    } catch { return null; }
  }

  async function loadArtwork(ids: string[]) {
    let cache: Record<string, string | null> = {};
    try { cache = JSON.parse(localStorage.getItem('taste-artwork-cache-v1') || '{}') as Record<string, string | null>; } catch { cache = {}; }
    const requested = [...new Set(ids)].filter(id => !artworkUrls[id] && !failedArtwork.includes(id) && !loadingArtwork.includes(id));
    if (!requested.length) return;
    loadingArtwork = [...loadingArtwork, ...requested];
    // Keep network activity modest while still filling posters across the whole catalogue.
    const queue = requested.map(id => works.find(work => work.id === id)).filter((work): work is Work => Boolean(work));
    const found: Record<string, string> = {};
    const unsuccessful: string[] = [];
    for (let i = 0; i < queue.length; i += 5) {
      await Promise.all(queue.slice(i, i + 5).map(async (work) => {
        let url = Object.prototype.hasOwnProperty.call(cache, work.id) ? cache[work.id] : undefined;
        if (url === undefined) { url = await resolveArtwork(work); cache[work.id] = url; }
        if (url) found[work.id] = url; else unsuccessful.push(work.id);
      }));
    }
    artworkUrls = { ...artworkUrls, ...found };
    failedArtwork = [...new Set([...failedArtwork, ...unsuccessful])];
    loadingArtwork = loadingArtwork.filter(id => !requested.includes(id));
    artworkStatus = `${Object.keys(artworkUrls).length} covers found`;
    try { localStorage.setItem('taste-artwork-cache-v1', JSON.stringify(cache)); } catch { /* storage may be full or disabled */ }
  }

  function markArtworkFailed(id: string) {
    if (!failedArtwork.includes(id)) failedArtwork = [...failedArtwork, id];
  }

  $: allExploreTags = ['All themes', ...Array.from(new Set(works.flatMap(w => w.tags))).sort()];
  $: allMoods = ['All moods', ...Array.from(new Set(works.map(w => w.mood))).sort()];
  $: filteredWorks = works
    .filter(w => category === 'All' || w.type === category)
    .filter(w => moodFilter === 'All moods' || w.mood === moodFilter)
    .filter(w => selectedTag === 'All themes' || w.tags.includes(selectedTag))
    .filter(w => `${w.title} ${w.creator} ${w.type} ${w.year} ${w.mood} ${w.desc} ${w.tags.join(' ')} ${w.region ?? ''} ${(w.cast ?? []).join(' ')} ${(w.genres ?? []).join(' ')} ${w.director ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sortBy === 'title' ? a.title.localeCompare(b.title) : sortBy === 'newest' ? b.year - a.year : sortBy === 'oldest' ? a.year - b.year : works.indexOf(a) - works.indexOf(b));
  $: startWork = works.find(w => w.id === startId);
  $: endWork = works.find(w => w.id === endId);
  $: selectedWork = works.find(w => w.id === selectedNode);
  $: savedWorks = works.filter(w => savedIds.includes(w.id));
  $: pageCount = Math.max(1, Math.ceil(filteredWorks.length / pageSize));
  $: page = Math.min(page, pageCount - 1);
  $: pagedWorks = filteredWorks.slice(page * pageSize, (page + 1) * pageSize);
  $: trailWorks = trailIds.map(id => works.find(w => w.id === id)).filter((w): w is Work => Boolean(w));
  $: if (activeTab === 'explore') void loadArtwork(pagedWorks.map(w => w.id));
  $: if (activeTab === 'bridge') void loadArtwork(bridge.map(w => w.id));
  $: if (activeTab === 'trails') void loadArtwork(trailWorks.map(w => w.id));
  $: if (activeTab === 'game') void loadArtwork(gamePathIds.map(id => id).concat(gameOptions));

  function intersection(a: string[], b: string[]): string[] { return a.filter(x => b.includes(x)); }
  function moodFamily(mood: string): string {
    const label = mood.trim().toLowerCase();
    const families: Record<string, string[]> = {
      tense: ['intense','uneasy','unsettling','dystopian','gothic','somber','tense','dark','bleak','harsh','claustrophobic','suspenseful','mysterious','stormy','restless','noir','high-stakes','twisty','urgent','frantic','frenetic','haunting','tragic','heartbreaking','ominous','unsettled','melancholic','melancholy','decadent','charged','fearful','uncomfortable','sombre','darkly magical'],
      reflective: ['reflective','contemplative','philosophical','introspective','analytical','observant','scholarly','critical','explanatory','thoughtful','thought-provoking','searching','quiet','restrained','detached','serious','practical','big-picture','investigative','exploratory','strategic','meditative','serene','human','expansive','thoughtful','mysterious','investigative','reflective'],
      warm: ['tender','hopeful','moving','emotional','affirming','warm','gentle','heartwarming','uplifting','inspirational','inspiring','joyful','playful','whimsical','nostalgic','comforting','heartfelt','intimate','bittersweet','lyrical','witty','playful'],
      wonder: ['epic','mythic','surreal','dreamlike','magical','wonder-filled','adventurous','awe-filled','grand','chaotic','fantastical','atmospheric','philosophical']
    };
    for (const [family, labels] of Object.entries(families)) if (labels.includes(label)) return family;
    return label;
  }

  function getRelatedWorks(id: string): { work: Work; shared: string[]; score: number }[] {
    const source = works.find(w => w.id === id);
    if (!source) return [];
    return works
      .filter(w => w.id !== source.id)
      .map(work => {
        const shared = intersection(source.tags, work.tags);
        const moodMatch = source.mood === work.mood;
        const typeMatch = source.type === work.type;
        return { work, shared, score: shared.length * 3 + (moodMatch ? 1 : 0) + (typeMatch ? 0.5 : 0) };
      })
      .filter(item => item.shared.length >= 2)
      .sort((a, b) => b.score - a.score || a.work.title.localeCompare(b.work.title))
      .slice(0, 4);
  }
  function getEdge(a: Work, b: Work): Edge | null {
    const common = intersection(a.tags, b.tags);
    const sharedGenres = intersection(a.genres ?? [], b.genres ?? []);
    const sameDirector = Boolean(a.director && b.director && a.director === b.director);
    const sharedCast = intersection(a.cast ?? [], b.cast ?? []);
    const sameMoodFamily = moodFamily(a.mood) === moodFamily(b.mood);
    // Never connect works on a lone generic tag: require two shared themes, or one theme plus a compatible emotional family, or a creator/cast credit.
    const thematicTie = common.length >= 2 || (common.length >= 1 && sameMoodFamily) || sharedGenres.length > 0;
    const factualTie = Boolean(factualEdge(a.id, b.id)) || sameDirector || sharedCast.length > 0;
    if (!thematicTie && !factualTie) return null;
    const score = common.length * 2 + (common.length === 1 && sameMoodFamily ? 2 : 0) + sharedGenres.length * 1.5 + (sameDirector ? 2 : 0) + sharedCast.length * 2 + (sameMoodFamily ? 1 : 0);
    return {from:a.id,to:b.id,common,score};
  }
  function scorePath(path: Work[]): number {
    let shared = 0; let categoryChanges = 0; let moodContinuity = 0; let repeated = 0;
    for (let i=0;i<path.length-1;i++) {
      const edge = getEdge(path[i],path[i+1]);
      shared += edge?.score ?? 0;
      if (path[i].type !== path[i+1].type) categoryChanges++;
      if (path[i].mood === path[i+1].mood) moodContinuity++;
      shared += intersection(path[i].genres ?? [], path[i+1].genres ?? []).length * 1.25;
      shared += intersection(path[i].emotionalArc ?? [], path[i+1].emotionalArc ?? []).length * 1.1;
      shared += intersection(path[i].cast ?? [], path[i+1].cast ?? []).length * 2.5;
      if (path[i].director && path[i].director === path[i+1].director) shared += 2.5;
    }
    // Reward a consistent emotional journey, not just a chain with lots of overlapping tags.
    const startMoodEcho = path.length > 2 && path[0].mood === path[path.length-1].mood ? 2 : 0;
    const tags = path.flatMap(w => w.tags); repeated = tags.length - new Set(tags).size;
    if (bridgeMode === 'surprising') return categoryChanges * 2 + shared * .45 + repeated * .3 + moodContinuity * .35;
    if (bridgeMode === 'coherent') return shared * 1.5 + repeated * .5 + moodContinuity * 3 + startMoodEcho;
    return shared + categoryChanges * 1.2 + repeated * .35 + moodContinuity * 1.4 + startMoodEcho;
  }
  function findPaths(start: Work, end: Work, maxDepth = 5, limit = 500): Work[][] {
    const results: Work[][] = [];
    function walk(path: Work[]) {
      if (results.length >= limit) return;
      const current = path[path.length-1];
      if (current.id === end.id) { results.push(path); return; }
      if (path.length >= maxDepth) return;
      const next = works.filter(w => w.type === start.type).filter(w => !path.some(p => p.id === w.id)).map(w => ({w,edge:getEdge(current,w)})).filter((item): item is {w:Work;edge:Edge} => item.edge !== null).sort((a,b) => b.edge.score-a.edge.score);
      for (const item of next.slice(0,16)) walk([...path,item.w]);
    }
    walk([start]); return results;
  }
  type BridgeStory = { title: string; connection: string; why: string; discovery: string; beginning: string; turningPoint: string; resolution: string; themes: string[] };
  $: bridgeStory = buildBridgeStory(bridge);

  function buildBridgeStory(path: Work[]): BridgeStory | null {
    if (path.length < 2) return null;
    const counts = new Map<string, number>();
    for (const work of path) {
      for (const tag of new Set([...(work.tags || []), ...(work.emotionalArc || [])])) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    const recurring = [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
    const pairThemes = path.slice(0, -1).map((work, i) => intersection(work.tags || [], path[i + 1].tags || []));
    const pairGenres = path.slice(0, -1).map((work, i) => intersection(work.genres || [], path[i + 1].genres || []));
    const pairCast = path.slice(0, -1).map((work, i) => intersection(work.cast || [], path[i + 1].cast || []));
    const themes = (recurring.length ? recurring : [...new Set(pairThemes.flat())]).slice(0, 3);
    const sharedGenres = [...new Set(pairGenres.flat())].slice(0, 2);
    const sharedActors = [...new Set(pairCast.flat())].slice(0, 2);
    const start = path[0]; const end = path[path.length - 1];
    const middle = path.slice(1, -1);
    const primary = themes[0] || sharedGenres[0] || 'human experience';
    const titleMap: Record<string, string> = {
      memory: 'When the past refuses to stay in the past', time: 'When time stops behaving', identity: 'The selves we become', love: 'What love leaves behind', grief: 'Living with what is lost', reality: 'When reality begins to shift', power: 'The price of power', freedom: 'The long road to freedom', humanity: 'What makes us human', alienation: 'The feeling of being outside', morality: 'Where conscience leads', dreams: 'At the edge of dreams', survival: 'What we do to survive', belonging: 'The search for somewhere to belong', ambition: 'The cost of wanting more', family: 'The ties that shape us', justice: 'The long shadow of justice', technology: 'Humanity in a changing world', hope: 'Finding a way forward'
    };
    const title = titleMap[primary.toLowerCase()] || `A journey through ${primary}`;
    const beat = (work: Work) => work.storyBeat?.trim() || work.desc?.trim() || `${work.title} explores ${work.tags.slice(0, 2).join(' and ')}.`;
    const tidy = (text: string) => text.replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
    const firstBeat = tidy(beat(start)); const lastBeat = tidy(beat(end));
    const themeList = themes.length > 1 ? `${themes.slice(0, -1).map(t => `“${t}”`).join(', ')} and “${themes[themes.length - 1]}”` : themes.length ? `“${themes[0]}”` : 'a shared emotional question';
    const factualLine = sharedActors.length ? ` A verified cast overlap through ${sharedActors.join(' and ')} adds a concrete link.` : sharedGenres.length ? ` Shared genres (${sharedGenres.join(' and ')}) reinforce the connection.` : '';
    const middleNames = middle.map(w => w.title).join(' → ');
    const middleBeat = middle.length ? `At the turning point, ${middleNames} shifts the perspective and carries the idea forward.` : `${end.title} reframes the idea from a different angle.`;
    const connection = `The through-line is ${themeList}, but this bridge is about how that idea changes—not just one tag appearing twice. ${start.title} begins with ${firstBeat.charAt(0).toLowerCase() + firstBeat.slice(1)}. ${middleBeat} The journey ends at ${end.title}: ${lastBeat.charAt(0).toLowerCase() + lastBeat.slice(1)}. Read together, the works move from the starting feeling toward a new perspective. This is an interpretive connection, not a claim of direct influence.${factualLine}`;
    const linkEvidence = path.slice(0, -1).map((work, i) => {
      const next = path[i + 1]; const evidence: string[] = [];
      if (pairThemes[i].length) evidence.push(pairThemes[i].slice(0, 2).join(' and '));
      if (pairGenres[i].length) evidence.push(`genre: ${pairGenres[i].slice(0, 1).join('')}`);
      if (pairCast[i].length) evidence.push(`cast: ${pairCast[i].slice(0, 1).join('')}`);
      if (work.director && work.director === next.director) evidence.push(`director: ${work.director}`);
      return evidence.length ? `${work.title} → ${next.title}: ${evidence.join(', ')}` : `${work.title} → ${next.title}: compatible emotional framing`;
    });
    const moods = path.map(w => w.mood).filter((m, i, list) => i === 0 || m !== list[i - 1]);
    const moodArc = moods.length > 1 ? `The emotional register shifts from ${moods[0].toLowerCase()} to ${moods[moods.length - 1].toLowerCase()}` : `The route keeps a ${start.mood.toLowerCase()} emotional register`;
    const why = `${linkEvidence.join('; ')}. ${moodArc}, giving the journey movement while the recurring idea holds it together.`;
    const discovery = `${primary.charAt(0).toUpperCase() + primary.slice(1)} changes meaning across this route. You have completed a thread of ideas—not just matched a tag.`;
    const shortBeat = (work: Work) => tidy(work.storyBeat || work.desc).split(/(?<=[.!?])\s+/)[0];
    return {
      title, connection, why, discovery, themes,
      beginning: `${start.title} sets the question. ${shortBeat(start)}`,
      turningPoint: middle.length ? `${middleNames} changes the angle. ${shortBeat(middle[0])}` : `${end.title} immediately reframes the question.`,
      resolution: `${end.title} brings the journey to its final perspective. ${shortBeat(end)} The idea has developed, not simply repeated.`
    };
  }

  function describeBridge(path: Work[]): string {
    if (path.length < 2) return 'Choose a starting work to begin a journey.';
    const links = path.slice(0, -1).map((work, i) => ({ a: work, b: path[i + 1], shared: intersection(work.tags, path[i + 1].tags), genres: intersection(work.genres ?? [], path[i + 1].genres ?? []), cast: intersection(work.cast ?? [], path[i + 1].cast ?? []) }));
    const themeCounts = new Map<string, number>();
    for (const link of links) for (const theme of link.shared) themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    for (const link of links) for (const genre of link.genres) themeCounts.set(`genre: ${genre}`, (themeCounts.get(`genre: ${genre}`) ?? 0) + 1);
    for (const link of links) for (const actor of link.cast) themeCounts.set(`shared cast: ${actor}`, (themeCounts.get(`shared cast: ${actor}`) ?? 0) + 1);
    const throughline = [...themeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([theme]) => theme);
    const start = path[0]; const end = path[path.length - 1];
    const middle = path.length > 2 ? path.slice(1, -1) : [];
    const middleText = middle.length ? `ACT II — The turning point: ${middle.map(work => work.title).join(' → ')} shifts the perspective and carries the recurring ideas forward. The route is selected for multiple overlapping attributes, not one incidental tag.` : 'The relationship is direct and strongly supported by the catalogue.';
    const emotional = start.mood === end.mood ? `It closes on a feeling close to where it began: ${end.mood.toLowerCase()}.` : `The emotional tone moves from ${start.mood.toLowerCase()} toward ${end.mood.toLowerCase()}.`;
    const opening = `ACT I — ${start.title} sets up ${start.tags.slice(0, 2).join(' and ')}.`;
    const resolution = `ACT III — ${end.title} brings the journey to ${end.tags.slice(0, 2).join(' and ')}, so the bridge ends with a destination rather than a loose list.`;
    return `${opening} The through-line is ${throughline.length ? throughline.join(', ') : 'a curated creator or genre connection'}. ${middleText} ${resolution} ${emotional} Each thematic hop needs at least two shared themes; credit and genre links are identified separately. This is a curated interpretive journey, not a claim of direct influence.`;
  }

  function generateBridge() {
    const a = works.find(w => w.id === startId); const b = works.find(w => w.id === endId);
    if (!a || !b || a.id === b.id) { bridge = []; bridgeReason = 'Choose a starting work to generate a new bridge.'; selectedNode = null; return; }
    const paths = findPaths(a,b,5,120);
    if (!paths.length) { bridge = []; bridgeReason = 'No thematic path was found for this saved pair. Try another starting work.'; selectedNode = null; return; }
    paths.sort((x,y) => (Number(y.length >= 3)-Number(x.length >= 3)) || scorePath(y)-scorePath(x)); bridge = paths[0];
    bridgeReason = describeBridge(bridge);
    if (!selectedNode || !bridge.some(w => w.id === selectedNode)) selectedNode = bridge[0].id;
  }
  function setBridgeType(type: 'Book' | 'Film') {
    bridgeType = type;
    const first = works.find(work => work.type === type);
    if (first) startId = first.id;
    generateRandomBridge();
  }
  function generateRandomBridge() {
    let start = works.find(work => work.id === startId);
    if (!start) { bridge = []; bridgeReason = 'Choose a starting work first.'; return; }
    if (start.type !== 'Book' && start.type !== 'Film') {
      const replacement = getRelatedWorks(start.id).map(item => item.work).find(work => work.type === 'Book' || work.type === 'Film') ?? works.find(work => work.type === 'Film');
      if (!replacement) { bridge = []; bridgeReason = 'Choose a book or movie to start a bridge.'; return; }
      start = replacement; startId = replacement.id;
      notify(`Taste Bridge starts with books or movies, so we chose ${replacement.title} as your starting work.`);
    }
    bridgeType = start.type as 'Book' | 'Film';
    const destinations = works.filter(work => work.type === bridgeType && work.id !== start!.id);
    const candidates: Work[][] = [];

    // Evaluate many possible destinations and connector works. Prefer a satisfying
    // multi-step journey with emotional continuity, not merely the first shared tag.
    for (const target of destinations) {
      const connectors = works
        .filter(work => work.id !== start!.id && work.id !== target.id && work.type === bridgeType && getEdge(start!, work) && getEdge(work, target))
        .map(middle => [start!, middle, target] as Work[])
        .sort((a, b) => scorePath(b) - scorePath(a));
      candidates.push(...connectors.slice(0, 2));
      // Taste Bridge should feel like a completed journey, not a one-click match: skip direct two-work routes.
    }

    if (!candidates.length) {
      for (const target of destinations) {
        const paths = findPaths(start, target, 5, 8);
        candidates.push(...paths.filter(path => path.length >= 3));
        if (candidates.length >= 60) break;
      }
    }
    if (!candidates.length) {
      // Last-resort, still evidence-based fallback: show a direct bridge when two works
      // share a recorded theme, genre, compatible mood, director, cast member, or sourced credit.
      for (const target of destinations) {
        if (getEdge(start, target)) candidates.push([start, target]);
      }
    }
    if (!candidates.length) {
      bridge = []; bridgeReason = `No supported route was found among the available ${bridgeType.toLowerCase()}s in the current catalogue. Try another starting title.`; selectedNode = null; return;
    }

    // A short-list plus slight randomization keeps the result varied without losing quality.
    candidates.sort((a, b) => {
      const aLengthBonus = a.length >= 3 && a.length <= 4 ? 1.5 : 0;
      const bLengthBonus = b.length >= 3 && b.length <= 4 ? 1.5 : 0;
      return (scorePath(b) + bLengthBonus) - (scorePath(a) + aLengthBonus);
    });
    const shortlist = candidates.slice(0, Math.min(8, candidates.length));
    const chosenPath = shortlist[Math.floor(Math.random() * shortlist.length)];
    const chosenTarget = chosenPath[chosenPath.length - 1];
    endId = chosenTarget.id;
    bridge = chosenPath;
    bridgeReason = describeBridge(chosenPath);
    selectedNode = bridge[0].id;
  }
  function changePath() { generateRandomBridge(); notify('A new destination and route are ready.'); }
  function getLink(a: Work,b: Work): string {
    const common = intersection(a.tags, b.tags);
    const genres = intersection(a.genres ?? [], b.genres ?? []);
    const cast = intersection(a.cast ?? [], b.cast ?? []);
    if (cast.length) return `Shared cast: ${cast.join(', ')}. This is a curated catalogue credit match, not an exhaustive cast record.`;
    if (a.director && a.director === b.director) return `Both works are directed by ${a.director}, according to the curated catalogue.`;
    if (common.length >= 2) return `This step is supported by ${common.length} shared themes: ${common.map(tag => `“${tag}”`).join(', ')}. The match comes from recorded tags; it does not establish direct influence.`;
    if (common.length === 1 && moodFamily(a.mood) === moodFamily(b.mood)) return `Shared theme: “${common[0]}”, reinforced by a similar emotional family (${moodFamily(a.mood)}). This is a curated reading of the works, not proof of direct influence.`;
    if (genres.length) return `Shared genre labels: ${genres.join(', ')}. Genre similarity is a broad relationship, not proof of similar stories.`;
    return 'The catalogue does not contain enough shared attributes to explain this connection clearly.';
  }
  function getAdjacentConnections(work: Work): { other: Work; common: string[]; direction: 'previous' | 'next' }[] {
    const index = bridge.findIndex(item => item.id === work.id);
    if (index < 0) return [];
    const connections: { other: Work; common: string[]; direction: 'previous' | 'next' }[] = [];
    if (index > 0) {
      const previous = bridge[index - 1];
      connections.push({ other: previous, common: intersection(previous.tags, work.tags), direction: 'previous' });
    }
    if (index < bridge.length - 1) {
      const next = bridge[index + 1];
      connections.push({ other: next, common: intersection(work.tags, next.tags), direction: 'next' });
    }
    return connections;
  }
  
  function factualEdge(aId: string, bId: string): FactualConnection | undefined {
    const sourced = factualConnections.find(item => (item.from === aId && item.to === bId) || (item.from === bId && item.to === aId));
    if (sourced) return sourced;
    const a = works.find(work => work.id === aId); const b = works.find(work => work.id === bId);
    if (!a || !b) return undefined;
    const sharedCast = intersection(a.cast ?? [], b.cast ?? []);
    if (sharedCast.length) return { id: `cast-${aId}-${bId}`, from: aId, to: bId, kind: 'actor', person: sharedCast[0], label: 'Shared cast member', explanation: `${sharedCast.join(', ')} is listed in the curated cast metadata for both ${a.title} (${a.year}) and ${b.title} (${b.year}). This catalogue match is not a claim that the list is exhaustive.`, sourceLabel: a.creditSourceLabel && b.creditSourceLabel ? `${a.creditSourceLabel}; ${b.creditSourceLabel}` : (a.creditSourceLabel || b.creditSourceLabel || 'Curated catalogue credits'), ...((a.creditSourceUrl || b.creditSourceUrl) ? {sourceUrl: a.creditSourceUrl ?? b.creditSourceUrl} : {}), ...(a.creditSourceUrl && b.creditSourceUrl ? {sourceUrlSecondary:b.creditSourceUrl} : {}) };
    if (a.director && b.director && a.director === b.director) return { id: `director-${aId}-${bId}`, from: aId, to: bId, kind: 'director', person: a.director, label: 'Same director', explanation: `${a.director} is listed as director for both ${a.title} (${a.year}) and ${b.title} (${b.year}) in this curated catalogue.`, sourceLabel: a.creditSourceLabel && b.creditSourceLabel ? `${a.creditSourceLabel}; ${b.creditSourceLabel}` : (a.creditSourceLabel || b.creditSourceLabel || 'Curated catalogue credits'), ...((a.creditSourceUrl || b.creditSourceUrl) ? {sourceUrl: a.creditSourceUrl ?? b.creditSourceUrl} : {}), ...(a.creditSourceUrl && b.creditSourceUrl ? {sourceUrlSecondary:b.creditSourceUrl} : {}) };
    return undefined;
  }
  function gameEdge(aId: string, bId: string, filter: GameFilter = gameFilter): GameEdge | null {
    if (aId === bId) return null;
    const a = works.find(work => work.id === aId); const b = works.find(work => work.id === bId);
    if (!a || !b) return null;
    const shared = intersection(a.tags, b.tags);
    const sharedGenres = intersection(a.genres ?? [], b.genres ?? []);
    const sharedCast = intersection(a.cast ?? [], b.cast ?? []);
    const sameDirector = Boolean(a.director && b.director && a.director === b.director);
    const fact = factualEdge(aId, bId);
    if (filter === 'mood') return a.mood === b.mood ? { kind: 'mood', themes: [`Same mood: ${a.mood}`] } : null;
    if (filter === 'actors') return sharedCast.length ? { kind: 'actor', themes: [], fact: fact?.kind === 'actor' ? fact : { id: `cast-${aId}-${bId}`, from:aId,to:bId,kind:'actor',person:sharedCast[0],label:'Shared cast member',explanation:`${sharedCast.join(', ')} appears in the curated cast lists for both works.`,sourceLabel:'Curated catalogue credits' } } : null;
    if (filter === 'director') return sameDirector ? { kind: 'director', themes: [], fact: fact?.kind === 'director' ? fact : { id:`director-${aId}-${bId}`,from:aId,to:bId,kind:'director',person:a.director!,label:'Same director',explanation:`${a.director} is listed as director for both works in the curated catalogue.`,sourceLabel:'Curated catalogue credits' } } : null;
    if (filter === 'genre') return sharedGenres.length ? { kind: 'genre', themes: sharedGenres } : null;
    if (filter === 'facts') return fact ? { kind: fact.kind === 'actor' ? 'actor' : 'fact', themes: [], fact } : null;
    const allowTheme = filter !== 'facts' && shared.length >= 2;
    const allowFact = filter !== 'themes' && Boolean(fact);
    const allowGenre = filter !== 'themes' && sharedGenres.length > 0;
    if (!allowTheme && !allowFact && !allowGenre) return null;
    return { kind: allowFact ? (allowTheme ? 'both' : fact?.kind === 'actor' ? 'actor' : fact?.kind === 'director' ? 'director' : 'fact') : allowGenre && !allowTheme ? 'genre' : 'theme', themes: [...(allowTheme ? shared : []), ...(allowGenre ? sharedGenres.map(g => `Genre: ${g}`) : [])], ...(allowFact && fact ? { fact } : {}) };
  }
  function gameNeighbors(id: string, filter: GameFilter = gameFilter): string[] {
    const cacheKey = `${filter}:all`;
    if (!gameAdjacencyCache[cacheKey]) {
      const adjacency: Record<string, string[]> = Object.fromEntries(works.map(work => [work.id, []]));
      const pool = ['actors','director','genre'].includes(filter) ? works.filter(work => work.type === 'Film') : works;
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          if (gameEdge(pool[i].id, pool[j].id, filter)) {
            adjacency[pool[i].id].push(pool[j].id);
            adjacency[pool[j].id].push(pool[i].id);
          }
        }
      }
      gameAdjacencyCache[cacheKey] = adjacency;
    }
    return gameAdjacencyCache[cacheKey]?.[id] ?? [];
  }
  function shortestGamePath(start: string, target: string, filter: GameFilter = gameFilter, blocked: string[] = []): string[] {
    if (start === target) return [start];
    const blockedIds = new Set(blocked.filter(id => id !== start && id !== target));
    const queue: string[][] = [[start]]; const visited = new Set([start]);
    while (queue.length) {
      const path = queue.shift()!; const current = path[path.length - 1];
      for (const next of gameNeighbors(current, filter)) {
        if (visited.has(next) || blockedIds.has(next)) continue;
        const candidate = [...path, next];
        if (next === target) return candidate;
        visited.add(next); queue.push(candidate);
      }
    }
    return [];
  }
  function randomDifferentWork(except: string): Work | undefined {
    const options = works.filter(work => work.id !== except);
    return options[Math.floor(Math.random() * options.length)];
  }
  function chooseChallengePair(): { start: string; target: string; path: string[] } {
    // Actor rounds must begin with films that actually have cast credits and a usable shared-cast route.
    if (gameFilter === 'actors') {
      const films = works.filter(work => work.type === 'Film' && (work.cast ?? []).length > 0);
      const pairs: { start: Work; target: Work }[] = [];
      for (let i = 0; i < films.length; i++) for (let j = i + 1; j < films.length; j++) {
        if (intersection(films[i].cast ?? [], films[j].cast ?? []).length) pairs.push({ start: films[i], target: films[j] });
      }
      if (pairs.length) {
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        return { start: pair.start.id, target: pair.target.id, path: [pair.start.id, pair.target.id] };
      }
    }
    // Prefer a non-trivial path so each round asks the player to discover at least one bridge.
    for (let attempt = 0; attempt < 180; attempt++) {
      const pool = ['actors','director','genre'].includes(gameFilter) ? works.filter(work => work.type === 'Film') : works;
      if (pool.length < 2) continue;
      const start = pool[Math.floor(Math.random() * pool.length)];
      const target = pool.filter(work => work.id !== start.id)[Math.floor(Math.random() * (pool.length - 1))];
      if (!target) continue;
      const path = shortestGamePath(start.id, target.id, gameFilter);
      if (path.length >= 3 && path.length <= 5) return { start: start.id, target: target.id, path };
    }
    // Fallbacks must obey the selected connection rule, including mood-only rounds.
    const validEdges: { start: string; target: string }[] = [];
    const challengePool = ['actors','director','genre'].includes(gameFilter) ? works.filter(work => work.type === 'Film') : works;
    for (const work of challengePool) {
      for (const neighborId of gameNeighbors(work.id, gameFilter)) {
        if (work.id < neighborId && challengePool.some(candidate => candidate.id === neighborId)) validEdges.push({ start: work.id, target: neighborId });
      }
    }
    const fallback = validEdges[Math.floor(Math.random() * validEdges.length)];
    if (fallback) return { start: fallback.start, target: fallback.target, path: [fallback.start, fallback.target] };
    // Keep the selected connection rule. Never silently replace a shared-actor round
    // with a different mode; use a real edge from the selected region as the fallback.
    if (validEdges.length) {
      const fallback = validEdges[Math.floor(Math.random() * validEdges.length)];
      return { start: fallback.start, target: fallback.target, path: [fallback.start, fallback.target] };
    }
    // No supported connection exists for this region/filter combination. Keep the
    // user's selected mode and choose two titles from the selected pool; the UI can
    // explain that a new challenge is needed instead of silently changing modes.
    const pool = ['actors','director','genre'].includes(gameFilter) ? works.filter(work => work.type === 'Film') : works;
    if (pool.length >= 2) {
      const start = pool[Math.floor(Math.random() * pool.length)];
      const target = pool.find(work => work.id !== start.id)!;
      return { start: start.id, target: target.id, path: [start.id, target.id] };
    }
    return { start: works[0].id, target: works[1].id, path: [works[0].id, works[1].id] };
  }
  function buildQuizOptions() {
    const current = gamePathIds[gamePathIds.length - 1];
    const blocked = gamePathIds.slice(0, -1);
    const shortest = shortestGamePath(current, gameTargetId, gameFilter, blocked);
    if (shortest.length < 2) { gameOptions = []; return; }
    const correct = shortest[1];
    const neighbors = gameNeighbors(current, gameFilter).filter(id => id !== correct && id !== gameTargetId && !gamePathIds.includes(id));
    const plausible = neighbors.filter(id => {
      const route = shortestGamePath(id, gameTargetId, gameFilter, [...blocked, current]);
      return !route.length || route.length >= shortest.length;
    });
    const randomDistractors = works.map(work => work.id).filter(id => id !== correct && id !== current && id !== gameTargetId && !gamePathIds.includes(id) && !plausible.includes(id)).sort(() => Math.random() - .5);
    const pool = [...plausible.sort(() => Math.random() - .5), ...randomDistractors];
    gameOptions = [correct, ...pool.slice(0, 3)].sort(() => Math.random() - .5);
    if (!gameOptions.includes(correct)) gameOptions[0] = correct;
  }
  function startNewGame() {
    // In multiple-choice mode, avoid a trivial first question where the destination
    // itself is the only correct next step. Prefer a route with at least one
    // intermediate work so the player has to discover the connection chain.
    let challenge = chooseChallengePair();
    if (gameMode === 'quiz') {
      for (let attempt = 0; attempt < 60 && challenge.path.length < 3; attempt++) {
        challenge = chooseChallengePair();
      }
    }
    gameStartId = challenge.start; gameTargetId = challenge.target; gamePathIds = [challenge.start];
    gameComplete = false; gameFeedback = ''; gameFeedbackKind = 'info'; gameLastEdge = null; gameSearch = ''; selectedGameActor = ''; actorHintCount = 0; actorHintText = '';
    if (gameMode === 'quiz') buildQuizOptions(); else gameOptions = [];
  }
  function setGameMode(mode: GameMode) {
    gameMode = mode;
    startNewGame();
  }
  function setGameFilter(filter: GameFilter) {
    gameFilter = filter;
    gameAdjacencyCache = {};
    startNewGame();
  }
  function gameWork(id: string): Work | undefined { return works.find(work => work.id === id); }
  function addGameWork(id: string) {
    if (gameComplete) return;
    const current = gamePathIds[gamePathIds.length - 1];
    if (gamePathIds.includes(id)) { gameFeedback = 'You have already used that work in this chain. Try a new link.'; gameFeedbackKind = 'error'; return; }
    const edge = gameEdge(current, id, gameFilter);
    if (!edge) { gameFeedback = 'No supported connection between these two works in this mode. Try a shared theme or a verified credit.'; gameFeedbackKind = 'error'; return; }
    gamePathIds = [...gamePathIds, id]; gameLastEdge = edge; gameSearch = ''; selectedGameActor = ''; actorHintCount = 0; actorHintText = '';
    if (id === gameTargetId) finishGameRound();
    else {
      gameFeedback = edgeExplanation(edge, current, id); gameFeedbackKind = 'success';
      if (gameMode === 'quiz') buildQuizOptions();
    }
  }
  function edgeExplanation(edge: GameEdge, aId: string, bId: string): string {
    const a = gameWork(aId); const b = gameWork(bId);
    if (edge.kind === 'mood') return `Both works are tagged with the mood “${a?.mood ?? 'unknown'}”. This is an editorial mood match, not a claim that they share a genre or influenced one another.`;
    if (edge.kind === 'genre') return `Shared genre${edge.themes.length === 1 ? '' : 's'}: ${edge.themes.join(', ')}. Genre labels are curated catalogue metadata.`;
    if ((edge.kind === 'actor' || edge.kind === 'director') && edge.fact) return edge.fact.explanation;
    if (edge.kind === 'both' && edge.fact) return `${edge.fact.explanation}${edge.themes.length ? ` Additional shared attributes: ${edge.themes.join(', ')}.` : ''}`;
    if (edge.kind === 'fact' && edge.fact) return edge.fact.explanation;
    return `Shared theme${edge.themes.length === 1 ? '' : 's'}: ${edge.themes.join(', ')}. This is a thematic match, not evidence of direct influence${a && b ? ` between ${a.title} and ${b.title}` : ''}.`;
  }
  function chooseQuizAnswer(id: string) {
    const current = gamePathIds[gamePathIds.length - 1];
    const blocked = gamePathIds.slice(0, -1);
    const shortest = shortestGamePath(current, gameTargetId, gameFilter, blocked);
    const candidateRoute = shortestGamePath(id, gameTargetId, gameFilter, [...blocked, current]);
    const isValidForwardStep = Boolean(gameEdge(current, id, gameFilter)) && candidateRoute.length > 0 && shortest.length > 1 && candidateRoute.length === shortest.length - 1;
    if (!isValidForwardStep) {
      gameFeedback = 'That link is not on a shortest supported route to the destination. Inspect the connection type and try another option.';
      gameFeedbackKind = 'error'; gameStreak = 0; persistGameStats(); return;
    }
    addGameWork(id);
  }
  function undoGameStep() {
    if (gamePathIds.length <= 1 || gameComplete) return;
    gamePathIds = gamePathIds.slice(0, -1);
    const previous = gamePathIds[gamePathIds.length - 1];
    const beforePrevious = gamePathIds.length > 1 ? gamePathIds[gamePathIds.length - 2] : '';
    gameLastEdge = beforePrevious ? gameEdge(beforePrevious, previous, gameFilter) : null;
    gameFeedback = 'Last step removed. Choose another connection.'; gameFeedbackKind = 'info';
    if (gameMode === 'quiz') buildQuizOptions();
  }
  function finishGameRound() {
    gameComplete = true; gameRounds += 1; gameStreak += 1;
    const points = Math.max(50, 150 - (gamePathIds.length - 2) * 25);
    gameScore += points; persistGameStats();
    gameFeedback = `Target reached! +${points} points. You connected ${gamePathIds.length} works.`; gameFeedbackKind = 'success';
    notify(`Connection complete · +${points} points`);
  }
  function persistGameStats() {
    try { localStorage.setItem('taste-game-stats', JSON.stringify({ score: gameScore, rounds: gameRounds, streak: gameStreak })); } catch { /* local storage may be unavailable */ }
  }
  function saveGameTrail() {
    const ids = [...gamePathIds];
    const name = `Connection Chain: ${gameWork(gameStartId)?.title ?? 'Start'} → ${gameWork(gameTargetId)?.title ?? 'Target'}`;
    const record: SavedTrail = { id: Date.now(), name, path: ids, savedAt: new Date().toLocaleDateString() };
    savedTrails = [record, ...savedTrails];
    try { localStorage.setItem('taste-trails', JSON.stringify(savedTrails)); } catch { /* local storage may be unavailable */ }
    activeTab = 'trails'; notify('Connection chain saved as a Discovery Trail.');
  }
  function currentGameWork(): Work | undefined { return gameWork(gamePathIds[gamePathIds.length - 1]); }
  function currentGameActors(): string[] { return [...new Set(currentGameWork()?.cast ?? [])].filter(actor => actor.toLowerCase() !== 'various').sort((a,b) => a.localeCompare(b)); }
  function gameActorWorks(actor: string): Work[] {
    return works.filter(work => work.type === 'Film' && (work.cast ?? []).some(name => name.trim().toLowerCase() === actor.trim().toLowerCase()) && !gamePathIds.includes(work.id))
      .sort((a,b) => a.year - b.year || a.title.localeCompare(b.title));
  }
  function selectGameActor(actor: string) {
    selectedGameActor = actor;
    gameSearch = '';
    actorHintText = '';
    gameFeedback = `${actor} selected. Choose one of their films below to continue the chain.`;
    gameFeedbackKind = 'info';
  }
  function useActorHint() {
    const actors = currentGameActors();
    if (actorHintCount >= 2) { startNewGame(); return; }
    actorHintCount += 1;
    if (!actors.length) {
      actorHintText = 'This title has no cast names in the curated data. Start a new challenge to get a film with available cast credits.';
    } else if (actorHintCount === 1) {
      const actor = actors[0];
      const count = gameActorWorks(actor).length;
      actorHintText = `Hint 1/2: Try an actor whose name begins with “${actor.charAt(0)}”. The catalogue lists ${count} other ${count === 1 ? 'film' : 'films'} for this actor.`;
    } else {
      actorHintText = `Hint 2/2: Cast names in ${currentGameWork()?.title ?? 'this film'}: ${actors.join(', ')}. Use one of these names to explore their other films. The next click on “Use hint / restart” starts a fresh challenge.`;
    }
  }
  function gameSearchResults(): Work[] {
    const current = gamePathIds[gamePathIds.length - 1];
    const term = gameSearch.trim().toLowerCase();
    const pool = gameFilter === 'actors' && selectedGameActor
      ? gameActorWorks(selectedGameActor)
      : works.filter(work => work.id !== current && !gamePathIds.includes(work.id));
    return pool.filter(work => (term.length === 0 || `${work.title} ${work.creator} ${work.type} ${work.tags.join(' ')} ${(work.cast ?? []).join(' ')} ${(work.genres ?? []).join(' ')} ${work.director ?? ''}`.toLowerCase().includes(term)))
      .sort((a, b) => Number(gameEdge(current, b.id, gameFilter) !== null) - Number(gameEdge(current, a.id, gameFilter) !== null) || a.title.localeCompare(b.title)).slice(0, 12);
  }

  function getNodePosition(index: number, count: number) {
  const left = 70;
  const right = 630;
  const centerY = 175;

  if (count <= 1) return { x: 350, y: centerY };

  // A clear, spacious left-to-right zigzag keeps titles away from edge labels.
  const x = left + (index / (count - 1)) * (right - left);
  const offsets = [0, -58, 0, -58, 0];
  const y = centerY + (offsets[index % offsets.length] ?? 0);

  return { x, y };
}

  
  function colorFor(tag: string): string { return tagColors[tag] || palettes[Math.abs(tag.split('').reduce((s,c)=>s+c.charCodeAt(0),0))%palettes.length]; }
  function notify(message: string) { toast=message; clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast='',2400); }
  function toggleSave(id: string) { savedIds=savedIds.includes(id)?savedIds.filter(x=>x!==id):[...savedIds,id]; localStorage.setItem('taste-saved',JSON.stringify(savedIds)); notify(savedIds.includes(id)?'Added to your collection':'Removed from your collection'); }
  function saveBridge() {
    if (bridge.length < 2) return;
    const record: SavedBridge={id:Date.now(),start:startId,end:endId,path:bridge.map(w=>w.id),mode:bridgeMode,savedAt:new Date().toISOString()};
    savedBridges=[record,...savedBridges.filter(b=>b.start!==startId||b.end!==endId)].slice(0,30);
    localStorage.setItem('taste-bridges',JSON.stringify(savedBridges)); notify('Taste Bridge saved');
  }
  function loadSaved(b: SavedBridge) { startId=b.start; endId=b.end; bridgeMode=b.mode; const start = works.find(w => w.id === b.start); if (start?.type === 'Book' || start?.type === 'Film') bridgeType = start.type; activeTab='bridge'; generateBridge(); }
  function pickFromExplore(id: string) {
    const work = works.find(item => item.id === id);
    if (!work) return;
    startId = id;
    bridgeType = work.type === 'Book' ? 'Book' : 'Film';
    activeTab = 'bridge';
    generateRandomBridge();
  }
  function persistTrail() {
    localStorage.setItem('taste-trail', JSON.stringify(trailIds));
  }
  function addToTrail(id: string) {
    if (trailIds.includes(id)) { notify('That work is already in your trail.'); return; }
    trailIds = [...trailIds, id];
    persistTrail();
    notify('Added to your discovery trail.');
  }
  function removeFromTrail(id: string) {
    trailIds = trailIds.filter(item => item !== id);
    persistTrail();
    notify('Removed from your trail.');
  }
  function moveTrailItem(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= trailIds.length) return;
    const updated = [...trailIds];
    [updated[index], updated[next]] = [updated[next], updated[index]];
    trailIds = updated;
    persistTrail();
  }
  function saveTrail() {
    if (trailIds.length < 2) { notify('Add at least two works before saving a trail.'); return; }
    const record: SavedTrail = { id: Date.now(), name: trailName.trim() || 'A trail of curiosity', path: [...trailIds], savedAt: new Date().toLocaleDateString() };
    savedTrails = [record, ...savedTrails];
    localStorage.setItem('taste-trails', JSON.stringify(savedTrails));
    notify('Discovery trail saved.');
  }
  function loadTrail(saved: SavedTrail) {
    trailIds = [...saved.path];
    trailName = saved.name;
    persistTrail();
    activeTab = 'trails';
    notify('Trail restored.');
  }
  function removeSavedTrail(id: number) {
    savedTrails = savedTrails.filter(item => item.id !== id);
    localStorage.setItem('taste-trails', JSON.stringify(savedTrails));
    notify('Saved trail removed.');
  }
  function bridgeTrailPair(index: number) {
    const a = trailWorks[index];
    const b = trailWorks[index + 1];
    if (!a || !b) return;
    startId = a.id;
    bridgeType = a.type === 'Book' ? 'Book' : 'Film';
    activeTab = 'bridge';
    generateRandomBridge();
  }
  function clearExploreFilters() {
    query = '';
    category = 'All';
    moodFilter = 'All moods';
    selectedTag = 'All themes';
    sortBy = 'curated';
    page = 0;
  }
  function surpriseMe() {
    const candidates = filteredWorks.length ? filteredWorks : works;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (!pick) return;
    pickFromExplore(pick.id);
    notify(`A new journey starts with ${pick.title}`);
  }
</script>

<svelte:head><title>My Taste, Evolving — Find the unexpected</title><meta name="description" content="Explore unexpected connections between books, films, music and art."/><meta name="theme-color" content="#10100f"/></svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <button class="brand" onclick={() => activeTab='bridge'}><span class="brand-mark">✳</span><span>taste<span class="brand-light">/evolving</span></span></button>
    <div class="side-label">YOUR SPACE</div>
    <button class:nav-active={activeTab==='bridge'} class="nav-item" onclick={() => activeTab='bridge'}><span class="nav-icon">◈</span> Taste Bridge <span class="nav-arrow">↗</span></button>
    <button class:nav-active={activeTab==='game'} class="nav-item" onclick={() => {activeTab='game'; if (!gamePathIds.length) startNewGame();}}><span class="nav-icon">⌘</span> Connection Chain <span class="nav-arrow">↗</span></button>
    <button class:nav-active={activeTab==='explore'} class="nav-item" onclick={() => activeTab='explore'}><span class="nav-icon">⌕</span> Explore works</button>
    <button class:nav-active={activeTab==='saved'} class="nav-item" onclick={() => activeTab='saved'}><span class="nav-icon">♡</span> My collection <span class="count">{savedIds.length+savedBridges.length+savedTrails.length}</span></button>
    <button class:nav-active={activeTab==='trails'} class="nav-item" onclick={() => activeTab='trails'}><span class="nav-icon">⌁</span> Discovery trails <span class="count">{trailIds.length}</span></button>
    <div class="sidebar-bottom"><div class="mini-note"><span class="note-icon">✳</span><div><b>Follow your curiosity.</b><p>Every connection is an invitation to explore.</p></div></div><button class="about-link" onclick={() => showAbout=true}>How it works <span>↗</span></button></div>
  </aside>

  <main class="main">
    <header class="topbar"><div class="breadcrumb">DISCOVERY <span>/</span> {activeTab==='bridge'?'TASTE BRIDGE':activeTab==='game'?'CONNECTION CHAIN':activeTab==='explore'?'EXPLORE':activeTab==='trails'?'DISCOVERY TRAILS':'COLLECTION'}</div><div class="top-actions"><span class="local-badge"><i></i> PERSONAL SPACE</span><span class="avatar">T</span></div></header>
    {#if activeTab==='bridge'}
      <section class="page-intro"><div class="eyebrow"><span class="eyebrow-line"></span> A DIFFERENT KIND OF DISCOVERY</div><h1>Find the <em>unexpected.</em></h1><p class="intro-copy">Choose one starting work. We will pick a destination and reveal the connections in between.</p></section>
      <section class="concept-guide bridge-guide" aria-label="What a Taste Bridge does">
        <div class="concept-guide-heading"><span class="guide-icon">↗</span><div><b>One starting work. A whole route discovered for you.</b><p>Choose Books or Movies and select one title. Taste Bridge chooses a destination from the same section and finds a chain between them.</p></div></div>
        <p class="guide-example"><strong>How it connects:</strong> each hop needs two shared ideas, or one shared idea reinforced by a compatible emotional family. Director/cast relationships are shown separately, and the route is scored for mood continuity so it feels like a journey rather than a list of one-tag matches.</p>
      </section>
      <section class="bridge-builder bridge-builder-simple">
        <div class="builder-top"><div><span class="step-label">01 / CHOOSE YOUR START</span><h2>Where should the journey begin?</h2></div><span class="builder-count">{works.filter(work => work.type === bridgeType).length} {bridgeType === 'Book' ? 'books' : 'movies'} available</span></div>
        <div class="bridge-type-tabs" aria-label="Choose a starting collection">
          <button class:bridge-type-active={bridgeType==='Book'} onclick={() => setBridgeType('Book')}>📚 Books</button>
          <button class:bridge-type-active={bridgeType==='Film'} onclick={() => setBridgeType('Film')}>🎬 Movies</button>
        </div>
        <div class="bridge-start-row">
          <label class="bridge-start-select"><span>YOUR STARTING {bridgeType === 'Book' ? 'BOOK' : 'MOVIE'}</span><select bind:value={startId} onchange={generateRandomBridge}>{#each works.filter(work => work.type === bridgeType).sort((a,b) => a.title.localeCompare(b.title)) as work}<option value={work.id}>{work.title} · {work.year}</option>{/each}</select></label>
          <button class="quiet-btn" onclick={() => { const choices = works.filter(work => work.type === bridgeType); const pick = choices[Math.floor(Math.random()*choices.length)]; if (pick) { startId = pick.id; generateRandomBridge(); } }}>Surprise me</button>
          <button class="generate-btn" onclick={generateRandomBridge}>Find my bridge ↗</button>
        </div>
        {#if endWork}<div class="bridge-auto-target"><span class="target-icon">✳</span><div><small>WE PICKED YOUR DESTINATION</small><b>{endWork.title}</b><span>{endWork.creator} · {endWork.year}</span></div><span class="target-type">{endWork.type}</span></div>{/if}
      </section>
      {#if bridge.length>1}
        <section class="bridge-result"><div class="result-heading"><div><span class="step-label">02 / FOLLOW THE CONNECTION</span><h2>Your taste, <em>connected.</em></h2><p>Choose a node or path item to inspect the work and its connection.</p></div><div class="result-actions"><button class="quiet-btn" onclick={changePath}>↻ New destination</button><button class="save-btn" onclick={saveBridge}>♡ Save bridge</button></div></div>
          {#if bridgeStory}
            <article class="bridge-story-card" aria-labelledby="bridge-story-title">
              <div class="bridge-story-kicker"><span>✦ THE STORY OF THIS BRIDGE</span><span>{bridge.length} WORKS · {bridge.length - 1} CONNECTIONS</span></div>
              <h3 id="bridge-story-title">{bridgeStory.title}</h3>
              <p class="bridge-story-lead">{bridgeStory.connection}</p>
              <div class="bridge-story-arc">
                <section><span>01 / BEGINNING</span><p>{bridgeStory.beginning}</p></section>
                <section><span>02 / TURNING POINT</span><p>{bridgeStory.turningPoint}</p></section>
                <section><span>03 / RESOLUTION</span><p>{bridgeStory.resolution}</p></section>
              </div>
              <div class="bridge-story-why"><b>Why this bridge works</b><p>{bridgeStory.why}</p></div>
              <div class="bridge-story-discovery"><span>✧ WHAT YOU DISCOVER</span><p>{bridgeStory.discovery}</p></div>
            </article>
          {/if}
          <div class="graph-card"><div class="graph-topline"><span><i class="live-dot"></i> TASTE BRIDGE / {bridge.length} NODES</span><span>THEMATIC SIMILARITY · NOT PROVEN INFLUENCE</span></div>
            <div class="graph-wrap"><svg class="bridge-svg" viewBox="0 0 700 360" role="img" aria-label="Interactive graph connecting the selected works"><defs><radialGradient id="graphGlow"><stop stop-color="#c4a7ff" stop-opacity=".13"/><stop offset="1" stop-color="#c4a7ff" stop-opacity="0"/></radialGradient><linearGradient id="pathGradient"><stop stop-color="#c4a7ff"/><stop offset="1" stop-color="#8edbd2"/></linearGradient></defs><circle cx="350" cy="180" r="220" fill="url(#graphGlow)"/>
              {#each bridge as work,i}{#if i<bridge.length-1}{@const p1=getNodePosition(i,bridge.length)}{@const p2=getNodePosition(i+1,bridge.length)}{@const edge=getEdge(work,bridge[i+1])}<line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} class="graph-edge"/><line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} class="graph-edge-glow"/><g transform={`translate(${(p1.x+p2.x)/2},${(p1.y+p2.y)/2 + (i % 2 === 0 ? -18 : 18)})`}><rect x="-42" y="-10" width="84" height="20" rx="10" class="edge-pill"/><text x="0" y="4" text-anchor="middle" class="edge-pill-text">{edge?.common[0]??'connection'}</text></g>{/if}{/each}
              {#each bridge as work,i}{@const p=getNodePosition(i,bridge.length)}<g class="graph-node" class:node-selected={selectedNode===work.id} role="button" tabindex="0" aria-label={`Inspect ${work.title}`} onclick={() => selectedNode=work.id} onkeydown={(e) => {if(e.key==='Enter'||e.key===' '){e.preventDefault();selectedNode=work.id;}}}><circle cx={p.x} cy={p.y} r={selectedNode===work.id?35:30} class="node-halo"/><circle cx={p.x} cy={p.y} r="25" fill={colorFor(work.tags[0])} class="node-circle"/><text x={p.x} y={p.y+5} text-anchor="middle" class="node-number">{i===0?'A':i===bridge.length-1?'B':String(i)}</text><text x={p.x} y={p.y+43} text-anchor="middle" class="node-title">{work.title.length>21?work.title.slice(0,19)+'…':work.title}</text><text x={p.x} y={p.y+57} text-anchor="middle" class="node-type">{work.type.toUpperCase()}</text></g>{/each}
            </svg></div><div class="graph-legend"><span><i class="legend-dot start"></i> Starting point</span><span><i class="legend-dot middle"></i> Connecting work</span><span><i class="legend-dot end"></i> Destination</span><span class="legend-hint">SELECT A NODE TO INSPECT ↗</span></div></div>
          <div class="result-lower"><div class="path-panel"><div class="panel-title"><span class="step-label">THE JOURNEY</span><span class="muted-small">{bridge.length-2} INTERMEDIATE WORKS</span></div>{#each bridge as work,i}<button class="path-item" class:path-selected={selectedNode===work.id} onclick={() => selectedNode=work.id}><span class="path-index">{i===0?'A':i===bridge.length-1?'B':`0${i}`}</span><span class="path-work"><b>{work.title}</b><small>{work.creator} · {work.year}</small></span><span class="path-category">{work.type}</span><span class="path-chevron">↗</span></button>{#if i<bridge.length-1}<div class="connection-note"><span class="connection-line"></span><span>{getEdge(work,bridge[i+1])?.common.slice(0,2).join(' · ')}</span><span class="connection-line"></span></div>{/if}{/each}</div>
            <div class="inspector"><div class="inspector-top"><span class="step-label">WORK INSPECTOR</span><span class="inspector-dot">●</span></div>{#if selectedWork}<div class="inspector-type">{selectedWork.type.toUpperCase()} <span>·</span> {selectedWork.year}</div><h3>{selectedWork.title}</h3><div class="inspector-creator">{selectedWork.creator}</div><p class="inspector-desc">{selectedWork.desc}</p><div class="inspector-divider"></div><span class="step-label inspector-label">KNOWN ATTRIBUTES</span><div class="tag-list">{#each selectedWork.tags as tag}<span class="tag" style={`--tag-color:${colorFor(tag)}`}>{tag}</span>{/each}</div>
                {#each getAdjacentConnections(selectedWork) as connection}
                  <div class="why-box"><span>↗</span><div><b>{connection.direction === 'previous' ? 'Connection from previous work' : 'Connection to next work'}</b><p><strong>{connection.other.title}</strong> — {getLink(selectedWork, connection.other)}</p><div class="evidence-tags" aria-label="Shared themes">{#each connection.common as tag}<span>{tag}</span>{/each}</div></div></div>
                {/each}
                <button class="inspector-save" onclick={() => toggleSave(selectedWork.id)}>{savedIds.includes(selectedWork.id)?'♥ Saved to collection':'♡ Save this work'}</button>{:else}<p class="empty-hint">Select a node to explore its details.</p>{/if}</div></div>
          <p class="method-note"><span>ⓘ</span><b>How to read this:</b> Connections are calculated from shared attributes in the curated dataset. They indicate thematic similarity, not proof that one creator influenced another. {bridgeReason}</p>
        </section>
      {:else}<div class="empty-state"><span>◈</span><h3>No bridge found yet</h3><p>Choose one book or movie, and we will find a destination for you.</p></div>{/if}
    {:else if activeTab==='game'}
      <section class="page-intro game-intro"><div class="eyebrow"><span class="eyebrow-line"></span> PLAY THE CONNECTIONS</div><h1>Can you build the <em>bridge?</em></h1><p class="intro-copy">We give you a start and a destination. Guess the next work from four choices, or switch to free-build mode.</p></section>
      <section class="concept-guide game-guide" aria-label="How Connection Chain works"><div class="concept-guide-heading"><span class="guide-icon">⌘</span><div><b>Your goal is simple</b><p>Start at one work and reach the target. Each step must have evidence: a shared theme from our catalogue, or a verified creator credit with a source link.</p></div></div><div class="guide-steps"><div><span>1</span><b>See your target</b><small>We choose two works with a supported route.</small></div><div><span>2</span><b>Find a valid link</b><small>Use a theme or a verified shared creator.</small></div><div><span>3</span><b>Reach the target</b><small>Shorter valid chains earn more points.</small></div></div><p class="guide-example"><strong>Honest connections:</strong> theme matches are interpretive; factual links cite a source. We never label a shared theme as proof of influence.</p></section>
      <section class="game-board">
        <div class="game-toolbar"><div class="game-mode-tabs" aria-label="Game mode"><button class:game-mode-active={gameMode==='build'} onclick={() => setGameMode('build')}>⌁ Build your chain</button><button class:game-mode-active={gameMode==='quiz'} onclick={() => setGameMode('quiz')}>◇ Choose next link</button></div><div class="game-stats"><span><b>{gameScore}</b><small>POINTS</small></span><span><b>{gameRounds}</b><small>ROUNDS</small></span><span><b>{gameStreak}</b><small>STREAK</small></span></div></div>
        <div class="game-filter-row"><span>HOW DO YOU WANT TO CONNECT?</span><div class="game-filter-tabs game-connection-types"><button class:filter-active={gameFilter==='both'} onclick={() => setGameFilter('both')}>Any valid link</button><button class:filter-active={gameFilter==='themes'} onclick={() => setGameFilter('themes')}>Shared themes</button><button class:filter-active={gameFilter==='mood'} onclick={() => setGameFilter('mood')}>Same mood / feeling</button><button class:filter-active={gameFilter==='actors'} onclick={() => setGameFilter('actors')}>Shared actor</button><button class:filter-active={gameFilter==='director'} onclick={() => setGameFilter('director')}>Same director</button><button class:filter-active={gameFilter==='genre'} onclick={() => setGameFilter('genre')}>Same genre</button><button class:filter-active={gameFilter==='facts'} onclick={() => setGameFilter('facts')}>Cast / creator credits</button></div><button class="quiet-btn game-new" onclick={startNewGame}>↻ New challenge</button><p class="game-filter-note">Choose the kind of link you want to discover. Actor, director, and genre matches use the curated metadata; sourced credits are separately identified. Theme links require at least two shared tags.</p></div>
        <div class="game-endpoints"><div class="game-endpoint game-start"><span class="game-endpoint-label">START HERE</span><span class="game-endpoint-type">{gameWork(gameStartId)?.type}</span><h2>{gameWork(gameStartId)?.title}</h2><p>{gameWork(gameStartId)?.creator} · {gameWork(gameStartId)?.year}</p></div><div class="game-route-mark"><span>YOUR ROUTE</span><div>··········→</div><small>{Math.max(0,gamePathIds.length-1)} links made</small></div><div class="game-endpoint game-target"><span class="game-endpoint-label">YOUR TARGET</span><span class="game-endpoint-type">{gameWork(gameTargetId)?.type}</span><h2>{gameWork(gameTargetId)?.title}</h2><p>{gameWork(gameTargetId)?.creator} · {gameWork(gameTargetId)?.year}</p></div></div>
        <div class="game-path-section"><div class="game-section-head"><div><span class="step-label">YOUR CHAIN</span><h3>{gameComplete ? 'Bridge completed.' : gameMode==='build' ? 'Choose the next work.' : 'Which work gets you closer?'}</h3></div><span class="game-link-count">{gamePathIds.length} / {gamePathIds.length + (gameComplete ? 0 : Math.max(1, shortestGamePath(gamePathIds[gamePathIds.length-1],gameTargetId,gameFilter).length-1))} WORKS</span></div>
          <div class="game-chain">{#each gamePathIds as id,i}<div class="game-chain-node"><span class="game-chain-index">{i===0?'START':id===gameTargetId?'TARGET':String(i).padStart(2,'0')}</span><b>{gameWork(id)?.title}</b><small>{gameWork(id)?.type} · {gameWork(id)?.year}</small></div>{#if i<gamePathIds.length-1}{@const edge=gameEdge(id,gamePathIds[i+1],gameFilter)}<div class="game-chain-link"><span>↓</span><small>{edge?.kind==='mood' ? 'SAME MOOD' : edge?.kind==='fact' ? edge.fact?.label : edge?.kind==='both' ? 'FACT + THEME' : `THEME${edge?.themes.length===1?'':'S'}`}</small></div>{/if}{/each}{#if !gameComplete}<div class="game-chain-placeholder"><span>?</span><b>Next connection</b><small>{gameMode==='quiz' ? 'Choose one of the options below' : 'Find a supported link to continue'}</small></div>{/if}</div>
          {#if gameFilter==='actors' && !gameComplete}
            <div class="actor-explorer">
              <div class="actor-explorer-heading"><span class="step-label">CAST EXPLORER</span><h4>Pick an actor. Discover their other films.</h4><p>The current movie’s cast is shown by name below. Select an actor to reveal their other movies in this catalogue, then choose one to move forward.</p></div>
              <div class="actor-hint-controls"><button class="quiet-btn" onclick={useActorHint}>{actorHintCount < 2 ? `Use hint ${actorHintCount + 1}/2` : 'Restart challenge'}</button><span>Two hints per round</span></div>
              {#if actorHintText}<p class="actor-hint-text">{actorHintText}</p>{/if}
              {#if currentGameActors().length}
                <p class="actor-current-film">Actors listed for <strong>{currentGameWork()?.title}</strong>:</p><div class="actor-chip-row">{#each currentGameActors() as actor}<button class:actor-chip-active={selectedGameActor===actor} class="actor-chip" onclick={() => selectGameActor(actor)}>{actor}<span>↗</span></button>{/each}</div>
              {:else}
                <p class="game-helper">No cast names are available for this title. Choose New challenge to get a movie with cast credits.</p>
              {/if}
              {#if selectedGameActor}
                <div class="actor-film-heading"><div><span class="step-label">FILMS FEATURING</span><h4>{selectedGameActor}</h4></div><span>{gameActorWorks(selectedGameActor).length} other films found</span></div>
                {#if gameActorWorks(selectedGameActor).length}
                  <div class="game-search-results actor-film-results">{#each gameActorWorks(selectedGameActor) as option}<button class:game-option-valid={gameEdge(gamePathIds[gamePathIds.length-1],option.id,'actors')!==null} onclick={() => addGameWork(option.id)}><span><b>{option.title}</b><small>{option.year} · {option.region ?? 'Film'} · {option.director ?? option.creator}</small></span><span><i>CONNECT</i> ↗</span></button>{/each}</div>
                {:else}<p class="game-helper">No other films for this actor are listed in the current catalogue. Choose another actor or start a new challenge.</p>{/if}
              {/if}
              <div class="game-builder-footer"><p class="game-helper">Actor credits come from the curated catalogue and may not be exhaustive. Only listed shared credits count as a valid link.</p><button class="quiet-btn" disabled={gamePathIds.length<=1} onclick={undoGameStep}>↶ Undo last step</button></div>
            </div>
          {:else if gameMode==='build' && !gameComplete}<div class="game-builder-controls"><label for="game-search">Search the collection for your next link</label><input id="game-search" bind:value={gameSearch} placeholder="Try a title, creator, or theme…" autocomplete="off"/><div class="game-search-results">{#each gameSearchResults() as option}<button class:game-option-valid={gameEdge(gamePathIds[gamePathIds.length-1],option.id,gameFilter)!==null} onclick={() => addGameWork(option.id)}><span><b>{option.title}</b><small>{option.creator} · {option.type}</small></span><span>{#if gameEdge(gamePathIds[gamePathIds.length-1],option.id,gameFilter)}<i>VALID LINK</i> ↗{:else}<i class="not-yet">NO DIRECT LINK</i>{/if}</span></button>{/each}</div><div class="game-builder-footer"><p class="game-helper">Works with a visible “VALID LINK” have a supported connection to your current work. You can still try another work to learn why it doesn't connect.</p><button class="quiet-btn" disabled={gamePathIds.length<=1} onclick={undoGameStep}>↶ Undo last step</button></div></div>{:else if gameMode==='quiz' && !gameComplete}<div class="game-quiz-options"><p>Choose the next work that follows your selected connection rule. Each correct choice reveals why the link works.</p>{#each gameOptions as optionId,i}<button class="game-quiz-option" onclick={() => chooseQuizAnswer(optionId)}><span>{String.fromCharCode(65+i)}</span><b>{gameWork(optionId)?.title}</b><small>{gameWork(optionId)?.type} · {gameWork(optionId)?.year}</small></button>{/each}</div>{/if}
          {#if gameFeedback}<div class="game-feedback" class:feedback-success={gameFeedbackKind==='success'} class:feedback-error={gameFeedbackKind==='error'}><span>{gameFeedbackKind==='success'?'✓':gameFeedbackKind==='error'?'!':'ⓘ'}</span><p>{gameFeedback}</p></div>{/if}
          {#if gameLastEdge && gamePathIds.length>1}<div class="game-evidence"><div><span class="step-label">WHY THIS LINK COUNTS</span><h4>{gameLastEdge.kind==='mood' ? 'Same mood' : gameLastEdge.kind==='genre' ? 'Shared genre' : gameLastEdge.kind==='actor' ? 'Shared cast member' : gameLastEdge.kind==='director' ? 'Same director' : gameLastEdge.kind==='fact' ? gameLastEdge.fact?.label : gameLastEdge.kind==='both' ? 'A factual and thematic connection' : 'Shared themes'}</h4></div><p>{edgeExplanation(gameLastEdge,gamePathIds[gamePathIds.length-2],gamePathIds[gamePathIds.length-1])}</p>{#if gameLastEdge.fact}{#if gameLastEdge.fact.sourceUrl}<a href={gameLastEdge.fact.sourceUrl} target="_blank" rel="noreferrer">Source: {gameLastEdge.fact.sourceLabel} ↗</a>{#if gameLastEdge.fact.sourceUrlSecondary}<a href={gameLastEdge.fact.sourceUrlSecondary} target="_blank" rel="noreferrer">Second work reference ↗</a>{/if}{:else}<small>Relationship basis: {gameLastEdge.fact.sourceLabel}. Catalogue credits are curated, not exhaustive.</small>{/if}{:else if gameLastEdge.themes.length}<div class="evidence-tags">{#each gameLastEdge.themes as tag}<span>{tag}</span>{/each}</div>{/if}</div>{/if}
          {#if gameComplete}<div class="game-win-actions"><button class="generate-btn" onclick={saveGameTrail}>＋ Add chain to Discovery Trails</button><button class="quiet-btn" onclick={startNewGame}>Play another round ↗</button></div>{/if}
        </div>
      </section>
      <p class="game-method-note">Thematic links are calculated from recorded tags in the curated collection. Factual links are limited to the small, sourced relationship set included with this version; the app does not claim full cast-credit coverage.</p>
    {:else if activeTab==='explore'}
      <section class="page-intro compact-intro explore-intro">
        <div class="eyebrow"><span class="eyebrow-line"></span> THE COLLECTION / {categories.length-1} FORMATS</div>
        <h1>Follow your <em>curiosity.</em></h1>
        <p class="intro-copy">Books, films, music, series and art — collected by the ideas that connect them.</p>
      </section>
      <section class="explore-feature">
        <div class="feature-copy"><span class="step-label">YOUR NEXT OBSESSION IS IN HERE SOMEWHERE</span><h2>Don't know where to start?</h2><p>Let curiosity choose a work, then follow its connections into another world.</p><button class="generate-btn" onclick={surpriseMe}>✳ Surprise me ↗</button></div>
        <div class="feature-orbit feature-orbit-one"></div><div class="feature-orbit feature-orbit-two"></div><div class="feature-symbol">✳</div>
        <div class="feature-stats"><span><b>{works.length}</b><small>CURATED WORKS</small></span><i></i><span><b>5</b><small>MEDIA TYPES</small></span><i></i><span><b>{allExploreTags.length-1}</b><small>SHARED THEMES</small></span></div>
      </section>
      <section class="explore-tools explore-tools-expanded">
        <div class="explore-search-row"><div class="search-box"><span>⌕</span><input bind:value={query} oninput={() => page=0} placeholder="Search titles, creators, themes, descriptions..." aria-label="Search collection"/>{#if query}<button class="clear-search" onclick={() => query=''} aria-label="Clear search">×</button>{/if}</div><label class="sort-select"><span>SORT BY</span><select bind:value={sortBy} onchange={() => page=0}><option value="curated">Curated order</option><option value="title">Title A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><div class="view-toggle" aria-label="Collection layout"><button class:view-active={exploreView==='grid'} aria-label="Grid view" onclick={() => exploreView='grid'}>▦</button><button class:view-active={exploreView==='list'} aria-label="List view" onclick={() => exploreView='list'}>☷</button></div></div>
        <div class="filter-line"><span class="filter-label">FORMAT</span><div class="category-row">{#each categories as c}<button class:category-active={category===c} onclick={() => {category=c; page=0;}}>{c}</button>{/each}</div></div>
        <div class="filter-line"><span class="filter-label">MOOD</span><div class="mood-row">{#each allMoods as mood}<button class:mood-active={moodFilter===mood} onclick={() => {moodFilter=mood; page=0;}}>{mood}</button>{/each}</div></div>
        <div class="filter-line theme-filter"><span class="filter-label">THEME</span><select bind:value={selectedTag} onchange={() => page=0} aria-label="Filter by theme">{#each allExploreTags as tag}<option value={tag}>{tag === 'All themes' ? 'All themes' : tag}</option>{/each}</select><button class="reset-filters" onclick={clearExploreFilters}>Reset filters ↺</button></div>
        <div class="explore-count">SHOWING <b>{filteredWorks.length}</b> OF {works.length} WORKS <span>·</span> {filteredWorks.length ? 'CHOOSE A WORK TO BUILD A BRIDGE' : 'TRY A DIFFERENT SEARCH OR FILTER'} <span>·</span> {artworkStatus.toUpperCase()}</div>
      </section>
      {#if selectedExploreId && works.find(w => w.id === selectedExploreId)}
        {@const source = works.find(w => w.id === selectedExploreId)}
        {@const recommendations = getRelatedWorks(selectedExploreId)}
        <section class="related-section">
          <div class="related-heading"><div><span class="step-label">FOLLOW THE THREAD</span><h2>Because you explored <em>{source?.title}</em></h2><p>These works share recorded themes with your selection. The matches are clues for discovery, not claims of direct influence.</p></div><button class="reset-filters" onclick={() => selectedExploreId=null}>Close ×</button></div>
          {#if recommendations.length}
            <div class="related-grid">
              {#each recommendations as recommendation}
                <article class="related-card">
                  <div class="related-art" style={`--art-color:${colorFor(recommendation.work.tags[0])}`}>{#if artworkUrls[recommendation.work.id] && !failedArtwork.includes(recommendation.work.id)}<img class="related-poster" src={artworkUrls[recommendation.work.id]} alt={`${recommendation.work.title} cover artwork`} loading="lazy" onerror={() => markArtworkFailed(recommendation.work.id)}/>{/if}<span>{recommendation.work.type.toUpperCase()} · {recommendation.work.year}</span><b>{recommendation.work.title.slice(0,1)}</b></div>
                  <div class="related-body"><h3>{recommendation.work.title}</h3><p>{recommendation.work.creator}</p><div class="related-tags">{#each recommendation.shared as tag}<span style={`--tag-color:${colorFor(tag)}`}>{tag}</span>{/each}</div><button onclick={() => pickFromExplore(recommendation.work.id)}>Start a bridge ↗</button></div>
                </article>
              {/each}
            </div>
          {:else}
            <p class="muted-empty">No related works have shared tags with this selection yet.</p>
          {/if}
        </section>
      {/if}
      {#if filteredWorks.length}
        <div class:work-list={exploreView==='list'} class="work-grid">
          {#each pagedWorks as work, i}
            <article class="work-card">
              <div class={`work-art art-${work.type.toLowerCase()} art-variant-${i%5}`} style={`--art-color:${colorFor(work.tags[0])}`}>
                {#if artworkUrls[work.id] && !failedArtwork.includes(work.id)}<img class="work-poster" src={artworkUrls[work.id]} alt={`${work.title} cover artwork`} loading="lazy" onerror={() => markArtworkFailed(work.id)}/>{/if}
                <span class="art-type">{work.type}</span><span class="art-year">{work.year}</span><span class="art-mood">{work.mood}</span>
                <div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-orbit orbit-three"></div><div class="art-core">{work.title.slice(0,1)}</div>
                <button class="heart-btn" class:hearted={savedIds.includes(work.id)} onclick={() => toggleSave(work.id)} aria-label={`Save ${work.title}`}>{savedIds.includes(work.id)?'♥':'♡'}</button>
              </div>
              <div class="work-card-body"><div class="work-card-kicker">{work.type.toUpperCase()} <span>·</span> {work.year}</div><h3>{work.title}</h3><p class="work-creator">{work.creator}</p><p class="work-description">{work.desc}</p><div class="tag-list">{#each work.tags.slice(0,3) as tag}<button class="tag tag-button" style={`--tag-color:${colorFor(tag)}`} onclick={() => selectedTag=tag} title={`Filter by ${tag}`}>{tag}</button>{/each}</div><div class="work-card-actions"><button onclick={() => pickFromExplore(work.id)}>Start a bridge ↗</button><button onclick={() => addToTrail(work.id)}>{trailIds.includes(work.id) ? 'In trail ✓' : 'Add to trail +'}</button></div><button class="related-trigger" onclick={() => { selectedExploreId = work.id; }}>Find related works ↗</button></div>
            </article>
          {/each}
        </div>
        {#if pageCount > 1}
          <nav class="pagination" aria-label="Collection pages"><span>PAGE {page + 1} OF {pageCount}</span><div><button disabled={page===0} onclick={() => {page -= 1; void loadArtwork(pagedWorks.map(w=>w.id));}}>← Previous</button><button disabled={page>=pageCount-1} onclick={() => {page += 1; void loadArtwork(filteredWorks.slice(page*pageSize,(page+1)*pageSize).map(w=>w.id));}}>Next →</button></div></nav>
        {/if}
      {:else}
        <div class="empty-state explore-empty"><span>⌕</span><h3>No works found</h3><p>Nothing in the collection matches all these filters. Clear a filter or try a broader theme.</p><button class="generate-btn" onclick={clearExploreFilters}>Clear all filters ↺</button></div>
      {/if}
    {:else if activeTab==='trails'}
      <section class="page-intro compact-intro trail-intro">
        <div class="eyebrow"><span class="eyebrow-line"></span> YOUR PERSONAL DISCOVERY PATH</div>
        <h1>Follow the <em>thread.</em></h1>
        <p class="intro-copy">A Discovery Trail is your own ordered list of things to explore. Build a mini-journey around a mood, idea, or curiosity — then use Taste Bridge to see how each pair connects.</p>
      </section>
      <section class="concept-guide trail-guide" aria-label="How Discovery Trails work">
        <div class="concept-guide-heading"><span class="guide-icon mint-guide-icon">⌁</span><div><b>What is a Discovery Trail?</b><p>Think of it as a playlist for ideas — you choose the works and the order.</p></div></div>
        <div class="trail-guide-flow"><span><b>ADD</b> works from Explore</span><i>→</i><span><b>ARRANGE</b> them in your order</span><i>→</i><span><b>CONNECT</b> neighbouring works with Taste Bridge</span></div>
        <p class="guide-example">A trail is yours to shape; it does not automatically prove that every work is related. Select <strong>“Bridge this pair”</strong> between two works to discover the shared themes.</p>
        <button class="guide-action" onclick={() => activeTab='explore'}>Find works to add <span>↗</span></button>
      </section>
      <section class="trail-builder">
        <div class="trail-toolbar">
          <div><span class="step-label">01 / BUILD YOUR PATH</span><h2>Your discovery trail <span>{trailIds.length} works</span></h2></div>
          <button class="quiet-btn" onclick={() => activeTab='explore'}>＋ Explore works</button>
        </div>
        <label class="trail-name-label">TRAIL NAME
          <input bind:value={trailName} maxlength="70" placeholder="Name this trail..." aria-label="Discovery trail name"/>
        </label>
        {#if trailIds.length}
          <div class="trail-list">
            {#each trailWorks as work,i}
              <article class="trail-item">
                <span class="trail-index">{String(i+1).padStart(2,'0')}</span>
                <div class="trail-item-art" style={`--art-color:${colorFor(work.tags[0])}`}>{#if artworkUrls[work.id] && !failedArtwork.includes(work.id)}<img class="trail-poster" src={artworkUrls[work.id]} alt={`${work.title} cover artwork`} loading="lazy" onerror={() => markArtworkFailed(work.id)}/>{:else}<span>{work.title.slice(0,1)}</span>{/if}</div>
                <div class="trail-item-info"><b>{work.title}</b><small>{work.creator} · {work.type} · {work.year}</small><div class="related-tags">{#each work.tags.slice(0,3) as tag}<span style={`--tag-color:${colorFor(tag)}`}>{tag}</span>{/each}</div></div>
                <div class="trail-item-actions">
                  <button aria-label={`Move ${work.title} up`} disabled={i===0} onclick={() => moveTrailItem(i,-1)}>↑</button>
                  <button aria-label={`Move ${work.title} down`} disabled={i===trailWorks.length-1} onclick={() => moveTrailItem(i,1)}>↓</button>
                  <button aria-label={`Remove ${work.title}`} onclick={() => removeFromTrail(work.id)}>×</button>
                </div>
              </article>
              {#if i<trailWorks.length-1}
                <div class="trail-connection"><span>↓</span><span>Next connection</span><button onclick={() => bridgeTrailPair(i)}>Explore from here ↗</button></div>
              {/if}
            {/each}
          </div>
          <div class="trail-actions"><span class="muted-small">Your current path is saved locally as you edit it.</span><button class="generate-btn" onclick={saveTrail}>Save this trail ↗</button><button class="quiet-btn" onclick={() => {trailIds=[];persistTrail();notify('Current trail cleared.');}}>Clear current trail</button></div>
        {:else}
          <div class="trail-empty">
            <span class="trail-empty-symbol">⌁</span><h3>Your next discovery starts with one work.</h3>
            <p>Add works from Explore, or start with a suggested path below. Add at least two works to connect them.</p>
            <button class="generate-btn" onclick={() => activeTab='explore'}>Explore works ↗</button>
          </div>
        {/if}
      </section>
      <section class="trail-saved-section">
        <div class="collection-heading"><h2>Saved discovery trails <span>{savedTrails.length}</span></h2><p>Return to a path of curiosity whenever you like.</p></div>
        {#if savedTrails.length}
          <div class="saved-bridges">
            {#each savedTrails as saved}
              <div class="saved-bridge-card trail-saved-card"><span class="saved-bridge-icon">⌁</span><span class="saved-bridge-text"><b>{saved.name}</b><small>{saved.path.length} works · Saved {saved.savedAt}</small><small>{saved.path.map(id => works.find(w=>w.id===id)?.title ?? 'Unknown work').join(' → ')}</small></span><button onclick={() => loadTrail(saved)}>Restore ↗</button><button class="remove-save" aria-label={`Delete ${saved.name}`} onclick={() => removeSavedTrail(saved.id)}>×</button></div>
            {/each}
          </div>
        {:else}
          <p class="muted-empty">Your saved trails will appear here after you save one with at least two works.</p>
        {/if}
      </section>
    {:else}
      <section class="page-intro compact-intro"><div class="eyebrow"><span class="eyebrow-line"></span> YOUR PERSONAL ARCHIVE</div><h1>Keep what <em>moves you.</em></h1><p class="intro-copy">Your saved works and bridges, kept on this device.</p></section><section class="collection-section"><div class="collection-heading"><h2>Saved bridges <span>{savedBridges.length}</span></h2><p>Return to an unexpected connection whenever you like.</p></div>{#if savedBridges.length}<div class="saved-bridges">{#each savedBridges as b}<button class="saved-bridge-card" onclick={() => loadSaved(b)}><span class="saved-bridge-icon">⌘</span><span class="saved-bridge-text"><b>{works.find(w=>w.id===b.start)?.title} <span>→</span> {works.find(w=>w.id===b.end)?.title}</b><small>{b.path.length} works · {b.mode} path</small></span><span>↗</span></button>{/each}</div>{:else}<div class="empty-state small-empty"><span>♡</span><h3>Your first bridge belongs here.</h3><p>Find a connection worth keeping, then save it.</p><button class="generate-btn" onclick={() => activeTab='bridge'}>Create a Taste Bridge ↗</button></div>{/if}<div class="collection-heading saved-work-heading"><h2>Saved works <span>{savedWorks.length}</span></h2><p>Works you want to revisit.</p></div>{#if savedWorks.length}<div class="saved-work-list">{#each savedWorks as work}<div class="saved-work-row"><div class="saved-work-dot" style={`background:${colorFor(work.tags[0])}`}></div><div class="saved-work-info"><b>{work.title}</b><small>{work.creator} · {work.type}</small></div><button onclick={() => pickFromExplore(work.id)}>Explore ↗</button><button class="remove-save" onclick={() => toggleSave(work.id)}>×</button></div>{/each}</div>{:else}<p class="muted-empty">Saved works will appear here.</p>{/if}</section>
    {/if}
    <footer><span>taste/evolving <b>✳</b> DISCOVERY WITHOUT BOUNDARIES</span><span>MADE FOR THE CURIOUS · YOUR DATA STAYS HERE</span></footer>
  </main>
</div>

{#if showAbout}<div class="modal-backdrop" role="presentation" onclick={(e) => {if(e.target===e.currentTarget)showAbout=false;}}><section class="about-modal" role="dialog" aria-modal="true" aria-label="How Taste Bridge works"><button class="modal-close" onclick={() => showAbout=false}>×</button><div class="eyebrow"><span class="eyebrow-line"></span> BEHIND THE BRIDGE</div><h2>Curiosity, with a trail to follow.</h2><p>Choose one starting book or movie. Taste Bridge selects a destination from the same collection and computes a route using shared tags. The game also supports verified creator-credit links where source data is available.</p><p><b>Honest by design:</b> shared tags are evidence of similarity within this dataset, not proof of historical influence or a claim that a recommendation is objectively correct.</p><button class="generate-btn" onclick={() => showAbout=false}>Got it ↗</button></section></div>{/if}
{#if toast}<button class="toast" onclick={() => toast=''}>✳ {toast} · dismiss</button>{/if}

<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600&display=swap');
  :global(*){box-sizing:border-box}:global(html){background:#10100f}:global(body){margin:0;background:#10100f;color:#f0eee8;font-family:'DM Sans',sans-serif;font-size:13px}:global(button),:global(input),:global(select){font:inherit}:global(button){cursor:pointer}:global(button:focus-visible),:global(input:focus-visible),:global(select:focus-visible){outline:2px solid #c4a7ff;outline-offset:3px}
  .app-shell{min-height:100vh;display:grid;grid-template-columns:245px minmax(0,1fr);background:#10100f}.sidebar{border-right:1px solid #292824;position:sticky;top:0;height:100vh;padding:27px 17px 17px;display:flex;flex-direction:column;background:#121210}.brand{display:flex;align-items:center;gap:11px;padding:0 7px 37px;background:none;border:0;color:#f4f0e8;text-align:left;font-size:18px;font-weight:700;letter-spacing:-.7px}.brand-light{font-weight:400;color:#9c9a92}.brand-mark{width:27px;height:27px;display:grid;place-items:center;border:1px solid #c4a7ff;border-radius:50%;color:#c4a7ff}.side-label,.step-label,.breadcrumb,.eyebrow,.builder-count,.graph-topline,.graph-legend,.explore-count,.inspector-type,.muted-small{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1.2px;color:#85847b}.side-label{padding:0 9px 12px}.nav-item{width:100%;display:flex;align-items:center;gap:12px;text-align:left;border:1px solid transparent;background:none;color:#a8a69e;border-radius:7px;padding:12px 10px;margin-bottom:4px}.nav-item:hover,.nav-active{background:#22201f;border-color:#302d2b;color:#f5f0e8}.nav-icon{width:19px;font-size:17px;color:#c4a7ff;text-align:center}.nav-arrow{margin-left:auto;color:#c4a7ff}.count{margin-left:auto;background:#302d2b;color:#d7d2c8;border-radius:12px;padding:3px 7px;font-size:10px}.side-divider{height:1px;background:#292824;margin:24px 0}.preset{display:flex;align-items:center;gap:10px;width:100%;padding:10px 8px;border:0;border-radius:7px;background:none;color:#e6e1d8;text-align:left}.preset:hover{background:#201f1c}.preset-dot{width:8px;height:8px;border-radius:50%;flex:none}.violet{background:#c4a7ff}.orange{background:#ffb78b}.mint{background:#8edbd2}.preset b,.preset small{display:block;font-size:11px;font-weight:500}.preset small{color:#85847b;font-size:10px;margin-top:4px}.preset-arrow{margin-left:auto;color:#7b7971}.sidebar-bottom{margin-top:auto}.mini-note{display:flex;gap:10px;border:1px solid #302d29;border-radius:9px;padding:13px 11px;margin-bottom:18px;background:#191815}.note-icon{color:#c4a7ff;font-size:19px}.mini-note b{font-size:11px;font-weight:500}.mini-note p{color:#85847b;font-size:10px;line-height:1.6;margin:5px 0 0}.about-link{display:flex;justify-content:space-between;width:100%;border:0;border-top:1px solid #292824;padding:15px 6px 2px;background:none;color:#aaa69c;text-align:left;font-size:11px}.main{min-width:0;padding:0 42px;max-width:1600px;width:100%;margin:0 auto}.topbar{height:65px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #292824}.breadcrumb span{color:#504e47;margin:0 7px}.top-actions{display:flex;align-items:center;gap:14px}.local-badge{display:flex;align-items:center;gap:7px;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.7px;color:#a6a398}.local-badge i,.live-dot{width:6px;height:6px;border-radius:50%;background:#8edbd2;display:inline-block;box-shadow:0 0 9px #8edbd255}.avatar{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#c4a7ff;color:#17131e;font-size:11px;font-weight:700}.page-intro{padding:42px 0 29px}.eyebrow{display:flex;align-items:center;gap:9px;color:#aaa39a}.eyebrow-line{height:1px;width:23px;background:#c4a7ff}h1{font-size:clamp(35px,4.4vw,54px);font-weight:500;letter-spacing:-2px;line-height:1.13;margin:17px 0 11px}h1 em,.result-heading h2 em{font-family:'Playfair Display',serif;color:#c4a7ff;font-weight:500}.intro-copy{color:#9a988f;font-size:13px;line-height:1.8;margin:0}.bridge-builder{border:1px solid #34312d;border-radius:12px;background:#171613;padding:23px}.builder-top,.result-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.builder-top h2,.result-heading h2{font-size:21px;font-weight:500;letter-spacing:-.6px;margin:8px 0 0}.builder-count{padding-top:5px;letter-spacing:.2px;font-size:10px}.builder-count span{color:#c4a7ff;padding:0 4px}.endpoints{display:grid;grid-template-columns:1fr 105px 1fr;align-items:center;margin-top:23px;gap:13px}.endpoint{min-width:0;display:flex;align-items:center;gap:12px;padding:15px 13px;border-radius:9px;background:#1d1b1a;border:1px solid #3b3635;text-align:left;color:#f2eee7;transition:border-color .2s}.endpoint:hover{border-color:#c4a7ff}.endpoint-b{background:#1a1e1c;border-color:#303e39}.endpoint-b:hover{border-color:#8edbd2}.endpoint-letter{width:33px;height:33px;display:grid;place-items:center;border-radius:50%;background:#c4a7ff;color:#1b1623;font-size:11px;font-weight:700;flex:none}.endpoint-b .endpoint-letter{background:#8edbd2}.endpoint-info{min-width:0;display:flex;flex-direction:column;gap:5px}.endpoint-info small{font-family:'DM Mono',monospace;color:#aaa39a;font-size:8px;letter-spacing:.9px}.endpoint-info b{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.endpoint-info>span{color:#8b8980;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.endpoint-change{font-family:'DM Mono',monospace;font-size:8px;color:#b9a1ed;margin-left:auto;white-space:nowrap}.endpoint-b .endpoint-change{color:#8edbd2}.endpoint-middle{display:flex;flex-direction:column;align-items:center;gap:8px;color:#85847b;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.7px;text-align:center}.middle-line{width:100%;height:1px;background:linear-gradient(90deg,#c4a7ff,#514a4c,#8edbd2)}.builder-controls{display:flex;align-items:flex-end;justify-content:space-between;margin-top:21px;gap:15px}.mode-select{display:flex;flex-direction:column;gap:8px;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.8px;color:#89877e}.mode-select select{background:#201e1c;color:#e7e2d9;border:1px solid #37332f;border-radius:6px;padding:9px 30px 9px 11px;min-width:210px;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:0}.generate-btn{display:flex;align-items:center;justify-content:center;gap:10px;border:0;border-radius:6px;padding:12px 16px;background:#c4a7ff;color:#1a1423;font-weight:700;font-size:11px}.generate-btn:hover{background:#d5c2ff}.bridge-result{padding-top:33px}.result-heading{align-items:flex-end;margin-bottom:18px}.result-heading h2{font-size:24px}.result-heading p{font-size:11px;color:#99968d;line-height:1.6;margin:8px 0 0}.result-actions{display:flex;gap:8px;flex:none}.quiet-btn,.save-btn{border:1px solid #3b3833;background:#191815;border-radius:6px;padding:10px 12px;color:#ccc6bb;font-size:10px}.quiet-btn:hover,.save-btn:hover{border-color:#9d83d5}.save-btn{background:#c4a7ff;color:#1a1423;border-color:#c4a7ff;font-weight:700}.graph-card{border:1px solid #33302d;border-radius:10px;background:#151412;overflow:hidden}.graph-topline{display:flex;align-items:center;justify-content:space-between;padding:14px 17px;border-bottom:1px solid #2d2a27;font-size:8px;letter-spacing:.8px}.graph-topline>span:first-child{display:flex;align-items:center;gap:8px;color:#c4c0b7}.graph-topline>span:last-child{font-size:8px;color:#7f7c73}.graph-wrap{width:100%;overflow:hidden}.bridge-svg{width:100%;height:auto;min-height:260px;max-height:400px;display:block}.graph-edge{stroke:#4b4642;stroke-width:1.5;stroke-dasharray:3 5}.graph-edge-glow{stroke:url(#pathGradient);stroke-width:1;opacity:.7}.edge-pill{fill:#23201e;stroke:#48403e;stroke-width:1}.edge-pill-text{fill:#d1c4e8;font-family:'DM Mono',monospace;font-size:8px}.graph-node{cursor:pointer;outline:none}.node-halo{fill:none;stroke:#c4a7ff;stroke-width:1;opacity:.15;transition:r .2s,opacity .2s}.graph-node:hover .node-halo,.node-selected .node-halo{opacity:.9;stroke-width:1.5}.node-circle{stroke:#171412;stroke-width:4}.node-number{fill:#171412;font-family:'DM Mono',monospace;font-size:13px;font-weight:500}.node-title{fill:#f2eee8;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600}.node-type{fill:#88857c;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.9px}.graph-legend{display:flex;align-items:center;gap:17px;flex-wrap:wrap;border-top:1px solid #2d2a27;padding:12px 17px;font-size:8px;letter-spacing:.3px}.graph-legend>span:not(.legend-hint){display:flex;align-items:center;gap:6px}.legend-dot{width:7px;height:7px;border-radius:50%}.legend-dot.start{background:#c4a7ff}.legend-dot.middle{background:#ffb78b}.legend-dot.end{background:#8edbd2}.legend-hint{margin-left:auto;color:#77746c}.result-lower{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:16px;margin-top:16px}.path-panel,.inspector{border:1px solid #33302d;border-radius:9px;background:#151412;overflow:hidden}.panel-title,.inspector-top{padding:16px 15px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2d2a27}.muted-small{font-size:8px;letter-spacing:.7px}.path-item{width:100%;display:flex;align-items:center;gap:11px;padding:13px 15px;text-align:left;color:#ece8e0;border:0;border-bottom:1px solid #272521;background:transparent}.path-item:hover,.path-selected{background:#24211f}.path-index{display:grid;place-items:center;width:25px;height:25px;flex:none;border-radius:50%;border:1px solid #4a4440;color:#c4a7ff;font-family:'DM Mono',monospace;font-size:9px}.path-work{min-width:0;display:flex;flex-direction:column;gap:4px;flex:1}.path-work b{font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.path-work small{font-size:9px;color:#8f8c82}.path-category{color:#9b978c;font-size:9px}.path-chevron{color:#77736a}.connection-note{display:flex;align-items:center;gap:8px;padding:5px 14px;color:#bda9e5;font-family:'DM Mono',monospace;font-size:8px;text-transform:uppercase;letter-spacing:.4px}.connection-line{height:1px;flex:1;background:#37302f}.inspector{padding-bottom:14px}.inspector-top{border-bottom:0;padding-bottom:9px}.inspector-dot{font-size:9px;color:#8edbd2}.inspector-type{padding:0 15px;font-size:8px;letter-spacing:.6px}.inspector-type span{color:#c4a7ff;margin:0 4px}.inspector h3{font-size:20px;letter-spacing:-.5px;font-weight:500;line-height:1.3;margin:9px 15px 4px}.inspector-creator{font-size:10px;color:#9d9990;margin:0 15px}.inspector-desc{font-size:11px;line-height:1.8;color:#c0bcb2;margin:15px}.inspector-divider{height:1px;background:#2d2a27;margin:14px 15px}.inspector-label{display:block;margin:0 15px}.tag-list{display:flex;flex-wrap:wrap;gap:6px;padding:11px 15px}.tag{border:1px solid color-mix(in srgb,var(--tag-color) 35%,transparent);border-radius:4px;padding:5px 7px;color:var(--tag-color);background:color-mix(in srgb,var(--tag-color) 8%,transparent);font-size:9px}.why-box{display:flex;gap:9px;margin:5px 15px 12px;border:1px solid #3a3434;background:#1c1919;padding:11px;border-radius:6px}.why-box>span{color:#c4a7ff;font-size:15px}.why-box b{font-size:10px;font-weight:600}.why-box p{font-size:10px;color:#aaa69d;line-height:1.7;margin:5px 0 0}.inspector-save{margin:0 15px;width:calc(100% - 30px);border:1px solid #464039;background:#24211e;color:#ded8ce;border-radius:5px;padding:9px;font-size:10px}.inspector-save:hover{border-color:#c4a7ff}.empty-hint{color:#88847b;font-size:11px;padding:20px}.method-note{display:flex;gap:8px;align-items:flex-start;color:#8b887e;font-size:10px;line-height:1.7;margin:13px 0 34px}.method-note>span{color:#c4a7ff}.method-note b{color:#bbb6ab;font-weight:600}.compact-intro{padding-bottom:24px}.explore-tools{display:flex;align-items:center;gap:15px;flex-wrap:wrap;margin:0 0 20px}.search-box{display:flex;align-items:center;gap:9px;border:1px solid #3a3632;border-radius:7px;background:#191815;padding:0 12px;min-width:240px;flex:1}.search-box>span{font-size:20px;color:#aaa19a}.search-box input{background:transparent;border:0;outline:none;color:#f0eee8;width:100%;padding:12px 0;font-size:11px}.search-box input::placeholder{color:#77736a}.category-row{display:flex;gap:4px;flex-wrap:wrap}.category-row button{background:transparent;border:1px solid #34312c;border-radius:5px;padding:8px 10px;color:#aaa69d;font-size:10px}.category-row button:hover,.category-row .category-active{background:#c4a7ff;border-color:#c4a7ff;color:#1b1522}.explore-count{width:100%;font-size:8px}.explore-count span{color:#c4a7ff;margin:0 6px}.work-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding-bottom:40px}.work-card{border:1px solid #33302d;border-radius:8px;overflow:hidden;background:#171613;min-width:0;transition:transform .2s,border-color .2s}.work-card:hover{transform:translateY(-3px);border-color:#63556e}.work-art{height:125px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 50% 50%,color-mix(in srgb,var(--art-color) 28%,#171513),#171513 70%)}.art-type,.art-year{position:absolute;top:10px;font-family:'DM Mono',monospace;font-size:8px;color:#d7d0c4;z-index:2}.art-type{left:10px;text-transform:uppercase;letter-spacing:1px}.art-year{right:10px}.art-orbit{position:absolute;left:50%;top:50%;border:1px solid color-mix(in srgb,var(--art-color) 55%,transparent);border-radius:50%;transform:translate(-50%,-50%) rotate(-25deg)}.orbit-one{width:88px;height:50px}.orbit-two{width:112px;height:70px;transform:translate(-50%,-50%) rotate(35deg)}.art-core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:34px;height:34px;background:var(--art-color);border-radius:50%;color:#1b1716;font-family:'Playfair Display',serif;font-size:19px}.heart-btn{position:absolute;bottom:8px;right:8px;width:25px;height:25px;border:1px solid #5a514a;border-radius:50%;background:#191815;color:#d9d1c7;font-size:14px;z-index:2}.heart-btn.hearted{color:#ff9dc6;border-color:#ff9dc6}.work-card-body{padding:12px}.work-card h3{font-size:12px;font-weight:600;margin:0 0 5px;line-height:1.5;min-height:36px}.work-card-body>p{font-size:10px;color:#8f8b82;margin:0 0 10px;min-height:15px}.work-card .tag-list{padding:0;min-height:28px}.work-card .tag{font-size:8px;padding:4px 5px}.work-card-actions{display:flex;gap:5px;border-top:1px solid #2d2a26;margin-top:10px;padding-top:9px}.work-card-actions button{flex:1;border:1px solid #3c3832;background:#201e1b;border-radius:4px;padding:7px 4px;color:#c6c0b6;font-size:9px}.work-card-actions button:hover{border-color:#c4a7ff;color:#c4a7ff}.collection-section{padding-bottom:50px}.collection-heading{padding:18px 0 12px}.collection-heading h2{font-size:19px;font-weight:500;margin:0}.collection-heading h2 span{font-family:'DM Mono',monospace;font-size:10px;color:#aaa398;margin-left:7px}.collection-heading p{color:#8f8a80;font-size:11px;margin:7px 0 0}.saved-bridges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.saved-bridge-card{display:flex;align-items:center;gap:11px;text-align:left;padding:15px;border:1px solid #34312d;border-radius:7px;background:#171613;color:#eee9df}.saved-bridge-card:hover{border-color:#c4a7ff}.saved-bridge-icon{width:35px;height:35px;display:grid;place-items:center;border-radius:6px;background:#302638;color:#c4a7ff;font-size:18px}.saved-bridge-text{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}.saved-bridge-text b{font-size:10px;line-height:1.6}.saved-bridge-text b span{color:#c4a7ff}.saved-bridge-text small{font-size:9px;color:#8e897f}.saved-bridge-card>span:last-child{color:#a49b91}.saved-work-heading{margin-top:18px;border-top:1px solid #2d2a26}.saved-work-list{border-top:1px solid #302d29}.saved-work-row{display:flex;align-items:center;gap:12px;padding:13px 8px;border-bottom:1px solid #302d29}.saved-work-dot{width:9px;height:9px;border-radius:50%}.saved-work-info{display:flex;flex-direction:column;gap:5px;flex:1}.saved-work-info b{font-size:11px;font-weight:600}.saved-work-info small{font-size:10px;color:#89857c}.saved-work-row button{background:transparent;border:1px solid #3b3731;border-radius:4px;padding:7px 9px;color:#c5bfb4;font-size:9px}.saved-work-row .remove-save{font-size:15px;padding:4px 8px}.muted-empty{font-size:11px;color:#7f7b72}.empty-state{text-align:center;border:1px dashed #38342e;border-radius:10px;padding:38px 20px;margin:15px 0;color:#aaa398}.empty-state>span{font-size:28px;color:#c4a7ff}.empty-state h3{font-size:17px;font-weight:500;color:#eee9e1;margin:12px 0 7px}.empty-state p{font-size:11px;line-height:1.7}.small-empty{padding:28px 20px}.small-empty .generate-btn{margin:16px auto 0}footer{border-top:1px solid #292824;padding:17px 0;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#79766e;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.5px}footer b{color:#c4a7ff;margin:0 4px}.modal-backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:#050505c9;backdrop-filter:blur(5px)}.picker-modal,.about-modal{width:min(650px,100%);max-height:85vh;overflow:hidden;border:1px solid #46403b;border-radius:12px;background:#171613;box-shadow:0 20px 80px #0009}.picker-head{display:flex;align-items:flex-start;justify-content:space-between;padding:22px 22px 15px}.picker-head h2,.about-modal h2{font-size:23px;font-weight:500;margin:8px 0}.modal-close{width:30px;height:30px;border:1px solid #403b35;border-radius:50%;background:#211f1c;color:#eee;font-size:19px}.picker-search{margin:0 20px 12px}.picker-list{max-height:52vh;overflow:auto;padding:0 20px 18px}.picker-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 8px;border:0;border-bottom:1px solid #302d29;background:transparent;color:#eee;text-align:left}.picker-row:hover{background:#24211f}.picker-dot{width:9px;height:9px;border-radius:50%;flex:none}.picker-work{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}.picker-work b{font-size:11px}.picker-work small,.picker-tags{color:#8f8b82;font-size:9px}.picker-tags{white-space:nowrap}.about-modal{position:relative;padding:27px;overflow:auto}.about-modal>.modal-close{position:absolute;right:18px;top:18px}.about-modal h2{margin-top:18px}.about-modal p{color:#b8b2a7;font-size:12px;line-height:1.8}.toast{position:fixed;right:22px;bottom:22px;z-index:30;padding:13px 17px;border:1px solid #6b5980;border-radius:7px;background:#29212f;color:#e6d8ff;box-shadow:0 8px 30px #0006}

  /* Explore works: richer editorial discovery controls and varied generative artwork */
  .explore-intro{padding-bottom:22px}
  .explore-feature{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:190px;overflow:hidden;padding:24px 27px;border:1px solid #39333f;border-radius:11px;background:radial-gradient(ellipse at 78% 45%,#30243a 0%,#1b191b 42%,#171613 76%);margin-bottom:25px}
  .feature-copy{position:relative;z-index:2;max-width:460px}.feature-copy h2{font-size:24px;font-weight:500;letter-spacing:-.7px;margin:10px 0 7px}.feature-copy p{max-width:410px;color:#aaa49b;font-size:11px;line-height:1.8;margin:0 0 15px}.feature-copy .generate-btn{width:max-content}.feature-orbit{position:absolute;left:76%;top:50%;border:1px solid #c4a7ff55;border-radius:50%;transform:translate(-50%,-50%) rotate(-28deg)}.feature-orbit-one{width:180px;height:95px}.feature-orbit-two{width:225px;height:130px;transform:translate(-50%,-50%) rotate(38deg);border-color:#8edbd255}.feature-symbol{position:absolute;left:76%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:#c4a7ff;color:#1b1522;font-size:32px;box-shadow:0 0 55px #c4a7ff40}.feature-stats{position:absolute;right:22px;bottom:14px;display:flex;align-items:center;gap:12px;color:#a7a096}.feature-stats span{display:flex;flex-direction:column;gap:3px}.feature-stats b{font-size:12px;color:#e6ded3;font-weight:500}.feature-stats small{font-family:'DM Mono',monospace;font-size:7px;letter-spacing:.7px}.feature-stats i{width:1px;height:20px;background:#49414b}
  .explore-tools-expanded{display:block;margin-bottom:18px}.explore-search-row{display:flex;align-items:center;gap:10px;margin-bottom:16px}.explore-search-row .search-box{min-width:180px}.clear-search{border:0;background:transparent;color:#c4a7ff;font-size:18px}.sort-select{display:flex;align-items:center;gap:8px;white-space:nowrap;color:#88847b;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.7px}.sort-select select,.theme-filter select{border:1px solid #39352f;border-radius:5px;background:#1c1a18;color:#e9e3d9;padding:9px 10px;font:10px 'DM Sans',sans-serif;max-width:190px}.view-toggle{display:flex;border:1px solid #39352f;border-radius:5px;overflow:hidden;flex:none}.view-toggle button{width:31px;height:32px;border:0;background:#1b1917;color:#9c968b}.view-toggle button+button{border-left:1px solid #39352f}.view-toggle button.view-active{background:#c4a7ff;color:#1b1522}.filter-line{display:flex;align-items:flex-start;gap:15px;padding:11px 0;border-top:1px solid #292723}.filter-label{flex:none;width:48px;padding-top:8px;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.9px;color:#7f7b72}.category-row,.mood-row{display:flex;gap:5px;flex-wrap:wrap}.mood-row button{border:1px solid #34312c;border-radius:14px;padding:6px 9px;background:transparent;color:#aaa69d;font-size:9px}.mood-row button:hover,.mood-row button.mood-active{border-color:#8edbd2;background:#1b2b28;color:#a6eee4}.theme-filter{align-items:center}.theme-filter select{min-width:170px}.reset-filters{margin-left:auto;border:0;background:transparent;color:#c4a7ff;font-size:10px;white-space:nowrap}.explore-count{padding:13px 0 0;color:#8e897f}.explore-count b{color:#eee8df;font-weight:500}.work-grid{align-items:stretch}.work-art{height:148px;background:radial-gradient(ellipse at 50% 50%,color-mix(in srgb,var(--art-color) 34%,#171513),#171513 72%)}.art-mood{position:absolute;left:10px;bottom:10px;z-index:2;font-size:8px;color:#c9c1b5;background:#171513b8;border:1px solid #ffffff14;border-radius:3px;padding:4px 6px}.art-orbit-three{position:absolute;left:50%;top:50%;width:67px;height:67px;border:1px dashed color-mix(in srgb,var(--art-color) 40%,transparent);border-radius:50%;transform:translate(-50%,-50%)}.art-variant-1 .orbit-one{transform:translate(-50%,-50%) rotate(55deg);width:70px;height:105px}.art-variant-1 .orbit-two{transform:translate(-50%,-50%) rotate(-48deg);width:130px;height:47px}.art-variant-2 .art-core{border-radius:5px;transform:translate(-50%,-50%) rotate(45deg)}.art-variant-2 .art-core{font-size:0}.art-variant-2 .art-core:after{content:'✳';font-size:22px;transform:rotate(-45deg)}.art-variant-3 .orbit-one{width:105px;height:105px;border-radius:8px;transform:translate(-50%,-50%) rotate(35deg)}.art-variant-3 .orbit-two{width:75px;height:75px;border-radius:8px;transform:translate(-50%,-50%) rotate(-20deg)}.art-variant-4 .orbit-one{width:145px;height:30px;transform:translate(-50%,-50%) rotate(-20deg)}.art-variant-4 .orbit-two{width:145px;height:30px;transform:translate(-50%,-50%) rotate(20deg)}.art-film .art-core{border-radius:8px 8px 15px 15px}.art-book .art-core{border-radius:4px 10px 10px 4px}.art-music .art-core{border-radius:50%;box-shadow:0 0 0 5px color-mix(in srgb,var(--art-color) 18%,transparent)}.art-art .orbit-one,.art-art .orbit-two{border-style:dashed}.art-series .art-core{border-radius:50%;box-shadow:0 0 0 4px #171513,0 0 0 5px var(--art-color)}
  .work-card-body{padding:13px}.work-card-kicker{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.7px;color:#8e897f;margin-bottom:7px}.work-card-kicker span{color:#c4a7ff;padding:0 4px}.work-card h3{min-height:0;font-size:13px;line-height:1.45;margin-bottom:5px}.work-card-body .work-creator{min-height:0;margin-bottom:9px}.work-card-body .work-description{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:48px;color:#aaa49a;font-size:10px;line-height:1.65;margin:0 0 10px}.work-card .tag-list{min-height:34px;align-content:flex-start}.tag-button{cursor:pointer}.tag-button:hover{background:color-mix(in srgb,var(--tag-color) 18%,transparent)}.work-card-actions button:first-child{border-color:#54456b;color:#d5c2ff}.work-card-actions button:first-child:hover{background:#c4a7ff;color:#1b1522}.work-list{grid-template-columns:1fr}.work-list .work-card{display:grid;grid-template-columns:175px minmax(0,1fr)}.work-list .work-art{height:100%;min-height:190px}.work-list .work-card-body{padding:16px}.work-list .work-card-body .work-description{max-width:700px;-webkit-line-clamp:2;min-height:34px}.work-list .work-card-actions{max-width:390px}.explore-empty{margin-bottom:40px}.explore-empty .generate-btn{margin:12px auto 0}
.related-section{margin:0 0 24px;padding:20px;border:1px solid #3c3543;border-radius:10px;background:linear-gradient(135deg,#1d191f,#171613 68%)}
.related-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:15px}
.related-heading h2{margin:8px 0;font-size:19px;font-weight:500;letter-spacing:-.4px}
.related-heading h2 em{font-family:'Playfair Display',serif;color:#c4a7ff;font-weight:500}
.related-heading p{max-width:650px;margin:0;color:#969187;font-size:10px;line-height:1.7}
.related-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.related-card{overflow:hidden;border:1px solid #39333b;border-radius:7px;background:#171513;min-width:0}
.related-art{height:75px;display:flex;align-items:center;justify-content:center;position:relative;background:radial-gradient(ellipse,color-mix(in srgb,var(--art-color) 26%,#171513),#171513 72%)}
.related-art>span{position:absolute;top:7px;left:8px;font-family:'DM Mono',monospace;font-size:7px;color:#aaa398;letter-spacing:.6px}
.related-art>b{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:var(--art-color);color:#191513;font-family:'Playfair Display',serif;font-size:17px;font-weight:500}
.related-body{padding:10px}
.related-body h3{margin:0 0 4px;font-size:10px;line-height:1.5;min-height:30px}
.related-body p{margin:0 0 8px;color:#8f8b82;font-size:9px}
.related-tags{display:flex;gap:4px;flex-wrap:wrap;min-height:23px;margin-bottom:9px}
.related-tags span{padding:3px 5px;border:1px solid color-mix(in srgb,var(--tag-color) 35%,transparent);border-radius:3px;color:var(--tag-color);font-size:8px}
.related-body button,.related-trigger{width:100%;padding:7px;border:1px solid #4b4055;border-radius:4px;background:#24202a;color:#d6c4f8;font-size:9px}
.related-body button:hover,.related-trigger:hover{border-color:#c4a7ff;background:#2c2535}
.related-trigger{margin-top:7px;background:transparent;border-color:#34312d;color:#a9a196}
@media(max-width:900px){.related-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){.related-section{padding:14px}.related-heading{flex-direction:column}.related-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}

  @media(max-width:900px){.feature-stats{display:none}.feature-symbol{left:83%;opacity:.7}.explore-search-row{flex-wrap:wrap}.explore-search-row .search-box{flex-basis:100%}.sort-select{margin-right:auto}}
  @media(max-width:650px){.explore-feature{padding:20px;min-height:210px}.feature-copy{max-width:75%}.feature-copy h2{font-size:20px}.feature-symbol{left:88%;width:38px;height:38px;font-size:22px}.feature-orbit-one{left:88%;width:100px;height:60px}.feature-orbit-two{left:88%;width:125px;height:75px}.filter-line{gap:8px;flex-direction:column}.filter-label{padding-top:0}.theme-filter{align-items:flex-start}.theme-filter select{max-width:100%;width:100%}.reset-filters{margin-left:0}.work-grid{grid-template-columns:1fr 1fr;gap:9px}.work-art{height:115px}.work-card-body{padding:10px}.work-card h3{font-size:11px}.work-card-actions{flex-direction:column}.work-list .work-card{grid-template-columns:105px minmax(0,1fr)}.work-list .work-art{min-height:100%}.work-list .work-card-actions{flex-direction:column}.sort-select select{max-width:145px}}

  @media(max-width:1200px){.main{padding:0 25px}.work-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:900px){.app-shell{grid-template-columns:205px minmax(0,1fr)}.result-lower{grid-template-columns:1fr}.endpoints{grid-template-columns:1fr 70px 1fr}.work-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:650px){.app-shell{display:block}.sidebar{position:static;height:auto;padding:16px;border-right:0;border-bottom:1px solid #292824}.brand{padding-bottom:18px}.side-label,.side-divider,.preset,.sidebar-bottom{display:none}.nav-item{display:inline-flex;width:auto;margin:0 3px 0 0;padding:9px}.main{padding:0 15px}.top-actions{display:none}.page-intro{padding-top:30px}.endpoints{grid-template-columns:1fr}.endpoint-middle{flex-direction:row;justify-content:center}.builder-controls,.result-heading{align-items:stretch;flex-direction:column}.result-actions{flex-wrap:wrap}.mode-select select{min-width:0}.work-grid{grid-template-columns:1fr 1fr}.graph-topline{gap:8px;align-items:flex-start}.graph-topline>span:last-child{text-align:right}.graph-legend{gap:10px}.legend-hint{margin-left:0}.saved-bridges{grid-template-columns:1fr}footer{flex-direction:column;align-items:flex-start}.picker-tags{display:none}}


  /* Discovery Trails page layout */
  .trail-intro{padding-bottom:22px}
  .trail-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;border-bottom:1px solid #302d29}
  .trail-toolbar h2{font-size:18px;font-weight:500;margin:8px 0 0}
  .trail-toolbar h2 span{margin-left:8px;color:#8d887f;font-size:11px}
  .trail-name-label{display:flex;align-items:center;gap:16px;padding:16px 0;color:#8d887f;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.8px}
  .trail-name-label input{width:min(340px,100%);border:1px solid #39352f;border-radius:5px;background:#1b1917;color:#eee8df;padding:10px 12px;font:11px 'DM Sans',sans-serif}
  .trail-list{border:1px solid #34302d;border-radius:9px;overflow:hidden;background:#151412}
  .trail-item{display:flex;align-items:center;gap:13px;padding:14px;border-bottom:1px solid #302d29}
  .trail-index{font-family:'DM Mono',monospace;font-size:10px;color:#8e897f;width:23px}
  .trail-item-art{width:44px;height:44px;flex:0 0 44px;display:grid;place-items:center;border-radius:6px;background:radial-gradient(circle,var(--art-color),#171513 75%);color:#191513;font:22px 'Playfair Display',serif}
  .trail-item-info{min-width:0;flex:1}.trail-item-info>b{display:block;font-size:12px;margin-bottom:4px}.trail-item-info>small{display:block;color:#8f8b82;font-size:9px}
  .trail-item-info .related-tags{margin:8px 0 0;min-height:0}
  .trail-item-actions{display:flex;gap:5px}.trail-item-actions button,.trail-saved-card>button{border:1px solid #39352f;border-radius:4px;background:#211f1c;color:#c4a7ff;padding:7px 10px}.trail-item-actions button:disabled{opacity:.25;cursor:default}
  .trail-connection{display:flex;align-items:center;gap:10px;padding:8px 16px 8px 52px;background:#121210;color:#8d887f;font-size:9px;border-bottom:1px solid #302d29}.trail-connection>span:first-child{color:#c4a7ff}.trail-connection button{margin-left:auto;background:transparent;border:1px solid #4b4055;border-radius:4px;color:#d6c4f8;padding:7px 10px;font-size:9px}
  .trail-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:15px 0}.trail-actions .muted-small{margin-right:auto}
  .trail-empty{padding:42px 20px;text-align:center;border:1px dashed #39352f;border-radius:9px;background:#151412}.trail-empty-symbol{font-size:32px;color:#c4a7ff}.trail-empty h3{font-size:17px;font-weight:500;margin:12px 0 7px}.trail-empty p{max-width:500px;margin:0 auto 18px;color:#9a958b;font-size:11px;line-height:1.8}
  .trail-saved-section{margin-bottom:28px}.trail-saved-card{display:flex;align-items:center;gap:12px;text-align:left;cursor:default}.trail-saved-card .saved-bridge-text{min-width:0;flex:1}.trail-saved-card .saved-bridge-text small{white-space:normal;overflow-wrap:anywhere}
  @media(max-width:650px){.trail-toolbar{align-items:flex-start;flex-direction:column}.trail-name-label{align-items:flex-start;flex-direction:column;gap:8px}.trail-name-label input{width:100%}.trail-item{gap:8px;padding:10px}.trail-item-art{width:34px;height:34px;flex-basis:34px}.trail-item-actions{flex-direction:column}.trail-connection{padding-left:18px}.trail-actions{align-items:flex-start;flex-direction:column}.trail-saved-card{flex-wrap:wrap}}

  /* Discovery Trails */
  .trail-builder,.trail-saved-section{margin-bottom:28px}
  .trail-toolbar{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:18px 0;border-bottom:1px solid #302d29}
  .trail-toolbar h2{font-size:18px;font-weight:500;margin:8px 0 0}.trail-toolbar h2 span{color:#8d887f}
  .trail-name-label{display:flex;align-items:center;gap:16px;padding:15px 0;color:#8d887f;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.8px}
  .trail-name-label input{width:min(340px,100%);border:1px solid #39352f;border-radius:5px;background:#1b1917;color:#eee8df;padding:10px 12px;font:11px 'DM Sans',sans-serif}
  .trail-list{border:1px solid #34302d;border-radius:9px;overflow:hidden;background:#151412}
  .trail-item{display:flex;align-items:center;gap:13px;padding:14px;border-bottom:1px solid #302d29}
  .trail-index{font-family:'DM Mono',monospace;font-size:10px;color:#8e897f;width:23px}
  .trail-art{width:48px;height:48px;flex:none;display:grid;place-items:center;position:relative;border:1px solid color-mix(in srgb,var(--art-color) 45%,transparent);border-radius:6px;background:radial-gradient(ellipse,color-mix(in srgb,var(--art-color) 25%,#171513),#171513 75%)}
  .trail-art span{position:absolute;left:4px;top:4px;font-size:5px;color:#b8b0a5;letter-spacing:.5px}.trail-art b{font:21px 'Playfair Display',serif;color:var(--art-color)}
  .trail-work-info{min-width:0;flex:1}.trail-work-info h3{font-size:12px;font-weight:600;margin:0 0 4px}.trail-work-info p{font-size:9px;color:#8f8b82;margin:0 0 7px}
  .trail-tags{display:flex;flex-wrap:wrap;gap:5px}.trail-tags span{font-size:8px;color:#c4a7ff;border:1px solid #4b3e5b;border-radius:3px;padding:3px 5px}
  .trail-controls{display:flex;gap:4px}.trail-controls button,.trail-delete,.trail-load{border:1px solid #3b3731;border-radius:4px;background:#201e1b;color:#c8c0b5;padding:6px 9px;font-size:11px}.trail-controls button:disabled{opacity:.25}.trail-controls button:hover,.trail-load:hover{border-color:#c4a7ff;color:#c4a7ff}
  .trail-connection{display:flex;align-items:center;gap:9px;padding:11px 16px 11px 50px;background:#191715}.trail-connection>span{height:1px;flex:1;background:#38312f}.trail-connection div{display:flex;flex-wrap:wrap;gap:4px}.trail-connection div b{font-size:8px;font-weight:500;color:#bda9e5;background:#2b2330;border-radius:3px;padding:4px 6px}.trail-connection button{flex:none;border:0;background:transparent;color:#8edbd2;font-size:9px;cursor:pointer}.trail-actions{display:flex;gap:8px;margin-top:14px}.trail-saved-section .saved-bridges{grid-template-columns:1fr}.trail-saved-section .saved-bridge-card{min-width:0}.trail-load,.trail-delete{flex:none}.trail-delete{font-size:15px}
  .work-card-actions button:last-child{border-color:#3e4943;color:#a8d9c9}.work-card-actions button:last-child:hover{background:#21302b;color:#b9f3e3}
  @media(max-width:800px){.trail-item{gap:8px;padding:10px}.trail-art{width:40px;height:40px}.trail-controls{flex-direction:column}.trail-connection{padding-left:12px}.trail-connection>span{display:none}.trail-name-label{align-items:flex-start;flex-direction:column;gap:8px}}


  /* Real cover art, with the original generated artwork as a graceful fallback. */
  .evidence-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.evidence-tags span{display:inline-block;border:1px solid #514361;border-radius:4px;background:#2b2330;color:#d8c6f5;padding:4px 6px;font-size:8px;letter-spacing:.2px}
  .work-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 28%;z-index:1;transition:transform .25s,filter .25s;filter:saturate(.9)}
  .work-card:hover .work-poster{transform:scale(1.035);filter:saturate(1.08)}
  .work-art:has(.work-poster)::after{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,#09090960,transparent 35%,#09090950)}
  .work-art:has(.work-poster) .art-orbit,.work-art:has(.work-poster) .art-core{display:none}
  .work-art:has(.work-poster) .art-type,.work-art:has(.work-poster) .art-year,.work-art:has(.work-poster) .art-mood,.work-art:has(.work-poster) .heart-btn{z-index:3}
  .related-art{height:150px;overflow:hidden}.related-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 25%;z-index:1}.related-art:has(.related-poster)>span{z-index:2;background:#10100fa8;padding:3px 5px;border-radius:3px}.related-art:has(.related-poster)>b{display:none}
  .trail-item-art{overflow:hidden}.trail-poster{width:100%;height:100%;object-fit:cover;object-position:center 25%;display:block}
  .picker-dot{position:relative;width:36px;height:48px;border-radius:4px;overflow:hidden;display:grid;place-items:center}.picker-dot:has(.picker-thumb){background:transparent!important}.picker-thumb{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  @media(max-width:650px){.related-art{height:110px}}


  /* Final usability, motion and Letterboxd-inspired personal logging layer. */
  :root { color-scheme: dark; }
  button, select, input, textarea { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible, [role="button"]:focus-visible { outline: 2px solid #c4a7ff; outline-offset: 3px; }
  .work-card { animation: card-rise .45s both; animation-delay: calc(var(--card-index, 0) * 12ms); }
  .work-card:nth-child(2n) { animation-delay: 35ms; }
  .work-card:nth-child(3n) { animation-delay: 70ms; }
  .work-art { position: relative; overflow: hidden; }
  .work-art::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, color-mix(in srgb, var(--art-color) 22%, transparent), transparent 55%); pointer-events: none; z-index: 0; }
  .work-card:hover { transform: translateY(-3px); border-color: #625272; box-shadow: 0 16px 35px #0003; }
  .work-card { transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease; }
  .personal-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
  .personal-actions > button { min-width: 0; padding: 8px 7px; border: 1px solid #38342f; border-radius: 5px; background: #1c1a18; color: #bcb5a9; font-size: 9px; text-align: left; }
  .personal-actions > button:hover, .personal-actions > button.personal-active { border-color: #8edbd2; color: #a8e9dd; background: #1a2825; }
  .rating-control { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; border: 1px solid #38342f; border-radius: 5px; padding: 5px 7px; background: #1c1a18; }
  .rating-control span, .private-note > span { color: #88847b; font: 7px 'DM Mono', monospace; letter-spacing: .6px; white-space: nowrap; }
  .rating-control select { width: 100%; min-width: 0; background: transparent; border: 0; color: #d8c6ff; font-size: 9px; padding: 2px; }
  .private-note { display: block; margin-top: 8px; }
  .private-note > span { display: block; margin-bottom: 5px; }
  .private-note textarea { display: block; width: 100%; resize: vertical; border: 1px solid #34312c; border-radius: 5px; background: #151412; color: #d7d0c5; padding: 8px; font-size: 10px; line-height: 1.5; }
  .private-note textarea::placeholder { color: #716d65; }
  .pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 0 26px; color: #8c877e; font: 9px 'DM Mono', monospace; letter-spacing: .8px; }
  .pagination > div { display: flex; gap: 8px; }
  .pagination button { border: 1px solid #3a3630; border-radius: 5px; background: #1d1b19; color: #e4ddd2; padding: 9px 12px; font: 10px 'DM Sans', sans-serif; }
  .pagination button:disabled { opacity: .35; cursor: not-allowed; }
  .diary-row { align-items: flex-start; }
  .diary-row .saved-work-info { overflow-wrap: anywhere; }
  @keyframes card-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes bridge-flow { to { stroke-dashoffset: -140; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; } }
  @media(max-width:650px) { .sidebar { overflow-x: auto; } .nav-item { white-space: nowrap; } .personal-actions { grid-template-columns: 1fr 1fr; } .personal-actions .rating-control { grid-column: 1 / -1; } .pagination { align-items: flex-start; flex-direction: column; } .diary-row { flex-wrap: wrap; } .diary-row .saved-work-info { flex-basis: calc(100% - 35px); } .diary-row .rating-control { flex: 1; } }
  /* Clarity and responsive refinements: make the two discovery tools self-explanatory. */
  .concept-guide{margin:0 0 22px;padding:18px 20px;border:1px solid #39333f;border-radius:11px;background:linear-gradient(115deg,#1b181f,#171613 68%);min-width:0}
  .concept-guide-heading{display:flex;align-items:flex-start;gap:12px}
  .guide-icon{display:grid;place-items:center;flex:none;width:35px;height:35px;border-radius:9px;background:#302638;color:#d5c2ff;font-size:20px}
  .mint-guide-icon{background:#1d302c;color:#8edbd2}
  .concept-guide-heading b{display:block;font-size:13px;font-weight:600;color:#f0ece5;margin:1px 0 5px}
  .concept-guide-heading p{margin:0;color:#aaa49b;font-size:11px;line-height:1.65}
  .guide-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0 12px}
  .guide-steps>div{display:grid;grid-template-columns:26px minmax(0,1fr);column-gap:8px;align-content:start;padding:12px;border:1px solid #302b32;border-radius:7px;background:#171513}
  .guide-steps>div>span{grid-row:span 2;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#c4a7ff;color:#1b1522;font:600 10px 'DM Mono',monospace}
  .guide-steps b{font-size:10px;font-weight:600;line-height:1.5}
  .guide-steps small{display:block;margin-top:4px;color:#8f8a82;font-size:10px;line-height:1.55}
  .guide-example{margin:0;color:#9d978e;font-size:10px;line-height:1.7}
  .guide-example strong{color:#e0d9ce;font-weight:600}.guide-example em{color:#d5c2ff;font-style:normal}
  .mode-help{max-width:340px;color:#8e897f;font:10px/1.5 'DM Sans',sans-serif;letter-spacing:0}
  .trail-guide{position:relative;margin-top:-5px;margin-bottom:22px}
  .trail-guide-flow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:15px 0 12px}
  .trail-guide-flow span{padding:9px 11px;border:1px solid #34302e;border-radius:6px;background:#171513;color:#aaa49b;font-size:10px}
  .trail-guide-flow b{color:#8edbd2;font:500 9px 'DM Mono',monospace;letter-spacing:.5px}
  .trail-guide-flow i{color:#8d887f;font-style:normal}
  .guide-action{display:inline-flex;align-items:center;gap:10px;margin-top:13px;padding:9px 12px;border:1px solid #42534e;border-radius:6px;background:#1a2623;color:#aee8dc;font-size:10px}
  .guide-action:hover{background:#22332e;border-color:#8edbd2}
  /* Laptop: reclaim horizontal space before the content starts feeling cramped. */
  @media (min-width:901px) and (max-width:1280px){
    .app-shell{grid-template-columns:215px minmax(0,1fr)}
    .sidebar{padding:22px 12px 14px}
    .main{padding-left:clamp(18px,2.2vw,30px);padding-right:clamp(18px,2.2vw,30px)}
    .endpoints{grid-template-columns:minmax(0,1fr) 74px minmax(0,1fr);gap:8px}
    .endpoint{gap:8px;padding:13px 9px}.endpoint-change{font-size:7px}
    .work-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
    .result-lower{grid-template-columns:minmax(0,1fr) minmax(280px,.85fr);gap:12px}
    .graph-topline{flex-wrap:wrap}
  }
  @media (max-width:900px){
    .main{padding-left:22px;padding-right:22px}
    .concept-guide{padding:16px}
    .guide-steps{gap:7px}.guide-steps>div{padding:10px;grid-template-columns:23px minmax(0,1fr);column-gap:6px}
    .guide-steps>div>span{width:22px;height:22px}
    .result-lower{grid-template-columns:minmax(0,1fr)}
    .inspector{min-width:0}
  }
  @media (max-width:650px){
    .main{padding:0 14px 22px}
    .topbar{height:48px}.breadcrumb{font-size:8px;letter-spacing:.8px}
    .page-intro{padding:26px 0 20px}.page-intro h1{font-size:clamp(32px,10vw,43px);letter-spacing:-1.4px;margin-top:13px}
    .intro-copy{font-size:12px;line-height:1.7}
    .concept-guide{padding:14px;margin-bottom:16px}
    .guide-steps{grid-template-columns:1fr;gap:7px;margin:13px 0 11px}
    .guide-steps>div{grid-template-columns:25px minmax(0,1fr);padding:10px}
    .guide-steps small{font-size:10px}
    .trail-guide-flow{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}
    .trail-guide-flow i{display:none}.trail-guide-flow span{padding:8px 10px}
    .bridge-builder{padding:15px}.builder-top{flex-direction:column;gap:8px}.builder-top h2{font-size:19px}.builder-count{padding-top:0}
    .endpoints{gap:8px;margin-top:16px}.endpoint{padding:12px 10px}.endpoint-info b{white-space:normal;overflow-wrap:anywhere}.endpoint-info>span{white-space:normal}
    .endpoint-middle{gap:9px;font-size:7px}.middle-line{max-width:70px}
    .builder-controls{gap:12px;margin-top:16px}.mode-select{width:100%}.mode-select select{width:100%;min-width:0}.mode-help{max-width:none}.builder-controls .generate-btn{width:100%;min-height:44px}
    .bridge-result{padding-top:23px}.result-heading{gap:12px;align-items:stretch}.result-heading h2{font-size:22px}.result-heading p{font-size:11px}.result-actions{display:grid;grid-template-columns:1fr 1fr}.result-actions button{min-width:0;padding:10px 7px}
    .graph-topline{padding:11px 12px;font-size:7px;flex-direction:column;gap:6px}.graph-topline>span:last-child{text-align:left}
    .graph-wrap{overflow-x:auto;overscroll-behavior-x:contain}.bridge-svg{width:600px;max-width:none;min-height:0}
    .graph-legend{padding:10px 12px;gap:8px 12px}.graph-legend>span:not(.legend-hint){font-size:8px}.legend-hint{width:100%}
    .path-item{gap:8px;padding:11px 10px}.path-work b{white-space:normal;overflow-wrap:anywhere}.path-category{display:none}.connection-note{padding-left:10px;padding-right:10px}
    .inspector h3{font-size:19px}.why-box{margin-left:10px;margin-right:10px;padding:10px}.method-note{font-size:10px;margin-bottom:24px}
    .trail-toolbar{gap:10px}.trail-toolbar h2{font-size:17px}.trail-toolbar>.quiet-btn{width:100%}.trail-name-label input{min-height:42px}
    .trail-item{align-items:flex-start;gap:8px;padding:10px 8px}.trail-index{width:17px;padding-top:7px}.trail-item-art{width:42px;height:52px;flex-basis:42px}.trail-item-info{flex-basis:calc(100% - 95px)}.trail-item-info>b{font-size:11px;line-height:1.45;overflow-wrap:anywhere}.trail-item-info>small{line-height:1.5}.trail-item-actions{flex-direction:row;flex-wrap:wrap;justify-content:flex-end;width:100%;margin-left:auto}.trail-item-actions button{min-width:38px;min-height:36px}.trail-item{flex-wrap:wrap}.trail-connection{align-items:flex-start;flex-wrap:wrap;padding:10px}.trail-connection div{max-width:100%}.trail-connection button{margin-left:0}
    .trail-actions{display:grid;grid-template-columns:1fr;width:100%}.trail-actions button{width:100%;min-height:42px}.trail-actions .muted-small{line-height:1.6}
    .saved-bridge-card,.trail-saved-card{min-width:0}.saved-work-row{flex-wrap:wrap}.saved-work-info{min-width:0;overflow-wrap:anywhere}.toast{left:12px;right:12px;bottom:12px;text-align:center}
  }

  /* Connection Chain game */
  .game-board{border:1px solid #37322e;border-radius:12px;background:linear-gradient(150deg,#1a1816,#141311);overflow:hidden;margin:0 0 18px;min-width:0}
  .game-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid #302c28}
  .game-mode-tabs,.game-filter-tabs{display:flex;gap:5px;flex-wrap:wrap}
  .game-mode-tabs button,.game-filter-tabs button{border:1px solid #3b3632;background:#191714;color:#a9a298;border-radius:7px;padding:10px 12px;font-size:11px}
  .game-mode-tabs button.game-mode-active,.game-filter-tabs button.filter-active{background:#302638;border-color:#78658e;color:#e2d4ff}
  .game-stats{display:flex;gap:18px;flex-shrink:0}.game-stats span{display:grid;gap:3px;text-align:right}.game-stats b{font:500 17px 'DM Mono',monospace;color:#e5d6ff}.game-stats small{font:8px 'DM Mono',monospace;color:#817a70;letter-spacing:1px}
  .game-filter-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid #302c28}.game-filter-row>span{font:8px 'DM Mono',monospace;letter-spacing:1px;color:#8f887e}.game-filter-tabs button{padding:7px 10px;font-size:10px}.game-new{margin-left:auto}.game-connection-types{flex:1}.game-filter-unavailable{border:1px dashed #51423d!important;background:#211b19!important;color:#8f7770!important;cursor:not-allowed}.game-filter-note{width:100%;flex-basis:100%;margin:0;color:#8e877d;font-size:9px;line-height:1.6}.game-connection-types button{min-height:34px}
  .game-endpoints{display:grid;grid-template-columns:minmax(0,1fr) 112px minmax(0,1fr);gap:12px;padding:18px}.game-endpoint{min-width:0;padding:17px;border:1px solid #37313e;border-radius:9px;background:linear-gradient(140deg,#211d27,#181613)}.game-target{border-color:#2c4942;background:linear-gradient(140deg,#1b2926,#181613)}.game-endpoint-label{display:block;font:8px 'DM Mono',monospace;letter-spacing:1.1px;color:#b9a3df}.game-target .game-endpoint-label{color:#8edbd2}.game-endpoint-type{display:inline-block;margin-top:14px;padding:4px 7px;border-radius:4px;background:#302638;color:#d7c4ff;font:8px 'DM Mono',monospace;text-transform:uppercase}.game-target .game-endpoint-type{background:#20332f;color:#9ce3d6}.game-endpoint h2{margin:9px 0 4px;font:500 clamp(17px,2vw,24px) 'Playfair Display',serif;overflow-wrap:anywhere}.game-endpoint p{margin:0;color:#928b81;font-size:10px;line-height:1.5}.game-route-mark{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#b8a2d9}.game-route-mark span,.game-route-mark small{font:8px 'DM Mono',monospace;letter-spacing:.7px;color:#817a70}.game-route-mark div{margin:7px 0;font-size:19px;letter-spacing:2px;color:#a18abf}.game-path-section{padding:0 18px 18px}.game-section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:2px 0 13px}.game-section-head h3{font:500 21px 'Playfair Display',serif;margin:6px 0 0}.game-link-count{font:8px 'DM Mono',monospace;letter-spacing:.8px;color:#888176;white-space:nowrap}.game-chain{display:flex;align-items:stretch;gap:8px;overflow-x:auto;padding:2px 1px 12px;overscroll-behavior-x:contain}.game-chain-node,.game-chain-placeholder{display:flex;flex-direction:column;justify-content:center;gap:5px;flex:0 0 150px;min-height:105px;padding:12px;border:1px solid #51445f;border-radius:8px;background:#211c27}.game-chain-node b,.game-chain-placeholder b{font-size:11px;line-height:1.4;overflow-wrap:anywhere}.game-chain-node small,.game-chain-placeholder small{font-size:9px;line-height:1.4;color:#958d83}.game-chain-index{font:8px 'DM Mono',monospace;letter-spacing:.8px;color:#c4a7ff}.game-chain-link{flex:0 0 55px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#9b8bad}.game-chain-link>span{font-size:20px}.game-chain-link small{font:7px 'DM Mono',monospace;text-align:center;color:#92897f;max-width:65px}.game-chain-placeholder{border-style:dashed;border-color:#49433d;background:#171512;align-items:center;text-align:center;color:#8b8378}.game-chain-placeholder>span{font-size:22px;color:#b8a2d9}
  .actor-current-film{font-size:11px;color:#b8adbf;margin:12px 0 0}.actor-current-film strong{color:#f0e8f6}.actor-hint-controls{display:flex;align-items:center;gap:12px;margin:12px 0}.actor-hint-controls span{font-size:10px;color:#8f8b82}.actor-hint-text{padding:12px;border:1px solid #5a4c6d;border-radius:6px;background:#211c27;color:#d9c8f4;font-size:11px;line-height:1.7;margin:8px 0 14px}.actor-explorer{margin-top:10px;padding:15px;border:1px solid #3d3546;border-radius:8px;background:linear-gradient(135deg,#1c191f,#171512)}.actor-explorer-heading h4,.actor-film-heading h4{margin:6px 0;font-size:14px;color:#eee5f6}.actor-explorer-heading p{max-width:680px;margin:0;color:#a49aab;font-size:10px;line-height:1.7}.actor-chip-row{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}.actor-chip{display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid #48404f;border-radius:999px;background:#211d26;color:#d8cde4;font-size:10px}.actor-chip span{color:#b9a0e5}.actor-chip.actor-chip-active{border-color:#b69add;background:#342943;color:#fff}.actor-film-heading{display:flex;align-items:end;justify-content:space-between;gap:10px;margin:15px 0 8px;padding-top:12px;border-top:1px solid #39313f}.actor-film-heading>span{font-size:9px;color:#a69aaa}.actor-film-results{margin-top:0}.actor-film-results>button{border-color:#403647}.actor-film-results>button.game-option-valid{border-color:#6a5486;background:#282130}.actor-film-results>button>span:last-child{color:#d4baff}.actor-explorer .game-builder-footer{margin-top:8px}
  .game-builder-controls{margin-top:10px;padding:15px;border:1px solid #322e29;border-radius:8px;background:#171512}.game-builder-controls>label{display:block;margin-bottom:8px;font-size:11px;color:#c5beb2}.game-builder-controls>input{width:100%;padding:12px;border:1px solid #403a34;border-radius:6px;background:#100f0d;color:#f0e9df;font-size:12px}.game-search-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px}.game-search-results>button{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:10px;border:1px solid #39332e;border-radius:6px;background:#1b1916;color:#c8c1b6;text-align:left}.game-search-results>button.game-option-valid{border-color:#3b6558;background:#1a2521}.game-search-results>button>span:first-child{display:grid;gap:4px;min-width:0}.game-search-results b{font-size:10px;overflow-wrap:anywhere}.game-search-results small{font-size:9px;color:#8e877d}.game-search-results>button>span:last-child{font:7px 'DM Mono',monospace;color:#8edbd2;white-space:nowrap}.game-search-results>button>span:last-child i{font-style:normal}.game-search-results>button>span:last-child i.not-yet{color:#82796f}.game-helper{font-size:9px;line-height:1.6;color:#837c72;margin:10px 0 0}.game-quiz-options{margin-top:12px}.game-quiz-options>p{font-size:11px;color:#aaa298}.game-quiz-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.game-quiz-options>p{grid-column:1/-1;margin:0 0 3px}.game-quiz-option{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;column-gap:10px;row-gap:3px;text-align:left;padding:12px;border:1px solid #39332e;border-radius:7px;background:#1b1916;color:#e8e0d5;min-width:0}.game-quiz-option:hover{border-color:#9b84bd}.game-quiz-option>span{grid-row:span 2;display:grid;place-items:center;width:26px;height:26px;border-radius:6px;background:#302638;color:#d8c5ff;font:10px 'DM Mono',monospace}.game-quiz-option b{font-size:11px;overflow-wrap:anywhere}.game-quiz-option small{font-size:9px;color:#928a80}.game-feedback{display:flex;align-items:flex-start;gap:10px;margin-top:12px;padding:11px 12px;border:1px solid #4a3e5b;border-radius:7px;background:#211c28;color:#cfc1e4}.game-feedback>span{font-size:14px}.game-feedback p{font-size:10px;line-height:1.6;margin:0}.game-feedback.feedback-success{border-color:#35584d;background:#19241f;color:#a6dfce}.game-feedback.feedback-error{border-color:#62443b;background:#281c18;color:#f0b6a0}.game-evidence{display:grid;grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr);gap:12px;margin-top:13px;padding:14px;border:1px solid #39332f;border-radius:8px;background:#171512}.game-evidence h4{margin:6px 0 0;font-size:12px}.game-evidence>p{margin:0;color:#aaa196;font-size:10px;line-height:1.7}.game-evidence>a{grid-column:2;color:#a9e5d9;font-size:10px;text-decoration:none}.game-evidence .evidence-tags{grid-column:2}.game-win-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}.game-win-actions button{min-height:40px}.game-method-note{margin:0 0 24px;color:#817a70;font-size:10px;line-height:1.7}
  @media(max-width:900px){.game-endpoints{grid-template-columns:minmax(0,1fr) 80px minmax(0,1fr);gap:8px;padding:14px}.game-endpoint{padding:13px}.game-toolbar{align-items:flex-start;flex-direction:column}.game-stats{width:100%;justify-content:space-between}.game-stats span{text-align:left}.game-stats b{font-size:15px}}
  @media(max-width:650px){.game-toolbar{padding:13px}.game-mode-tabs{width:100%;display:grid;grid-template-columns:1fr 1fr}.game-mode-tabs button{padding:10px 7px;font-size:10px}.game-filter-row{padding:12px;gap:8px}.game-filter-row>span{width:100%}.game-filter-tabs{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.game-connection-types{flex:1}.game-filter-tabs button{padding:8px 5px;font-size:9px}.game-new{margin-left:0;width:100%}.game-endpoints{grid-template-columns:minmax(0,1fr);gap:7px;padding:12px}.game-route-mark{flex-direction:row;gap:10px;padding:1px}.game-route-mark div{margin:0}.game-route-mark small{display:none}.game-endpoint{padding:13px}.game-endpoint h2{font-size:20px}.game-path-section{padding:0 12px 13px}.game-section-head{align-items:flex-start;flex-direction:column;gap:6px}.game-section-head h3{font-size:19px}.game-chain-node,.game-chain-placeholder{flex-basis:138px;min-height:100px}.game-search-results,.game-quiz-options{grid-template-columns:minmax(0,1fr)}.game-builder-footer{align-items:flex-start;flex-direction:column;gap:8px}.game-quiz-options>p{grid-column:auto}.game-evidence{grid-template-columns:minmax(0,1fr);gap:8px;padding:12px}.game-evidence>a,.game-evidence .evidence-tags{grid-column:1}.game-win-actions{display:grid;grid-template-columns:1fr}.game-win-actions button{width:100%}}


  /* Simplified one-start Taste Bridge */
  .bridge-builder-simple{padding:clamp(16px,2.5vw,25px)}
  .bridge-type-tabs{display:flex;gap:8px;margin:20px 0 14px}
  .bridge-type-tabs button{border:1px solid #39352f;border-radius:8px;background:#1b1917;color:#aaa69d;padding:11px 18px;min-width:125px;text-align:center}
  .bridge-type-tabs button.bridge-type-active{border-color:#c4a7ff;background:#282130;color:#e5d7ff}
  .bridge-start-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:end}
  .bridge-start-select{display:flex;flex-direction:column;gap:8px;min-width:0;color:#999388;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.7px}
  .bridge-start-select select{width:100%;min-width:0;border:1px solid #39352f;border-radius:7px;background:#1c1a18;color:#eee8df;padding:12px;font:12px 'DM Sans',sans-serif}
  .bridge-auto-target{display:flex;align-items:center;gap:13px;margin-top:17px;padding:14px;border:1px solid #343d36;border-radius:9px;background:linear-gradient(100deg,#1b201d,#191815)}
  .target-icon{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:50%;background:#8edbd2;color:#15201d;font-size:18px}
  .bridge-auto-target>div{display:flex;flex-direction:column;gap:4px;min-width:0}
  .bridge-auto-target small{font:8px 'DM Mono',monospace;letter-spacing:.9px;color:#8edbd2}
  .bridge-auto-target b{font-size:13px;overflow-wrap:anywhere}
  .bridge-auto-target>div span{font-size:10px;color:#969187}
  .target-type{margin-left:auto;align-self:center;color:#8edbd2;font-size:10px;white-space:nowrap}
  @media(max-width:700px){.bridge-start-row{grid-template-columns:1fr 1fr}.bridge-start-select{grid-column:1/-1}.bridge-start-row .generate-btn{width:100%}.bridge-type-tabs button{flex:1}.bridge-auto-target{align-items:flex-start}.target-type{padding-top:4px}}
  @media(max-width:420px){.bridge-start-row{grid-template-columns:1fr}.bridge-start-select{grid-column:auto}.bridge-start-row button{width:100%}.bridge-auto-target{gap:9px;padding:11px}}

  .bridge-story-card{position:relative;overflow:hidden;margin:0 0 18px;padding:clamp(20px,3vw,32px);border:1px solid #494052;border-radius:12px;background:radial-gradient(ellipse at 90% 0%,#3a2c4c 0,transparent 42%),linear-gradient(135deg,#211d25,#191815 72%);}
  .bridge-story-kicker{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#c4a7ff;font:9px/1.5 'DM Mono',monospace;letter-spacing:1px}
  .bridge-story-card h3{margin:13px 0 12px;color:#f2ede5;font:500 clamp(23px,3vw,34px)/1.2 'Playfair Display',Georgia,serif;letter-spacing:-.5px}
  .bridge-story-lead{max-width:900px;color:#d0c9c0;font-size:13px;line-height:1.9;margin:0 0 22px}
  .bridge-story-arc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 17px}
  .bridge-story-arc section{padding:13px;border:1px solid #39333d;border-radius:7px;background:#171518a8;min-width:0}
  .bridge-story-arc section span,.bridge-story-discovery>span{color:#8edbd2;font:9px/1.5 'DM Mono',monospace;letter-spacing:.8px}
  .bridge-story-arc section p,.bridge-story-why p,.bridge-story-discovery p{margin:7px 0 0;color:#bcb5ab;font-size:11px;line-height:1.8}
  .bridge-story-why{padding:14px 0;border-top:1px solid #37313a}
  .bridge-story-why>b{font-size:12px;color:#e5ded3;font-weight:600}
  .bridge-story-discovery{padding:14px 16px;border:1px solid #3c3545;border-radius:7px;background:#28212f}
  .bridge-story-discovery p{color:#e1d7ec;font-size:12px}
  @media(max-width:760px){.bridge-story-arc{grid-template-columns:1fr}.bridge-story-kicker{font-size:8px}.bridge-story-lead{font-size:12px;line-height:1.8}.bridge-story-card{padding:18px}.bridge-story-card h3{font-size:25px}}

  .bridge-story-card{position:relative;overflow:hidden;margin:0 0 18px;padding:clamp(20px,3vw,32px);border:1px solid #494052;border-radius:12px;background:radial-gradient(ellipse at 90% 0%,#3a2c4c 0,transparent 42%),linear-gradient(135deg,#211d25,#191815 72%);}
  .bridge-story-kicker{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#c4a7ff;font:9px/1.5 'DM Mono',monospace;letter-spacing:1px}
  .bridge-story-card h3{margin:13px 0 12px;color:#f2ede5;font:500 clamp(23px,3vw,34px)/1.2 'Playfair Display',Georgia,serif;letter-spacing:-.5px}
  .bridge-story-lead{max-width:900px;color:#d0c9c0;font-size:13px;line-height:1.9;margin:0 0 22px}
  .bridge-story-arc{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 17px}
  .bridge-story-arc section{padding:13px;border:1px solid #39333d;border-radius:7px;background:#171518a8;min-width:0}
  .bridge-story-arc section span,.bridge-story-discovery>span{color:#8edbd2;font:9px/1.5 'DM Mono',monospace;letter-spacing:.8px}
  .bridge-story-arc section p,.bridge-story-why p,.bridge-story-discovery p{margin:7px 0 0;color:#bcb5ab;font-size:11px;line-height:1.8}
  .bridge-story-why{padding:14px 0;border-top:1px solid #37313a}
  .bridge-story-why>b{font-size:12px;color:#e5ded3;font-weight:600}
  .bridge-story-discovery{padding:14px 16px;border:1px solid #3c3545;border-radius:7px;background:#28212f}
  .bridge-story-discovery p{color:#e1d7ec;font-size:12px}
  @media(max-width:760px){.bridge-story-arc{grid-template-columns:1fr}.bridge-story-kicker{font-size:8px}.bridge-story-lead{font-size:12px;line-height:1.8}.bridge-story-card{padding:18px}.bridge-story-card h3{font-size:25px}}
</style>
