export const mockParty = {
  id: "FRIDAY-NIGHT",
  name: "Friday Night",
  status: "LIVE",
  peopleCount: 42,
  currentSong: {
    id: "s1",
    title: "Blinding Lights",
    artist: "The Weeknd",
    coverUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=200&h=200",
    bidAmount: 10,
    timeRemaining: "2:15",
  },
  queue: [
    {
      id: "s2",
      title: "Mr. Brightside",
      artist: "The Killers",
      coverUrl: "https://images.unsplash.com/photo-1493225457124-a1a2a5e56050?auto=format&fit=crop&q=80&w=200&h=200",
      bidAmount: 8,
    },
    {
      id: "s3",
      title: "One More Time",
      artist: "Daft Punk",
      coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=200&h=200",
      bidAmount: 5,
    },
  ],
  myActiveBids: [
    {
      id: "s3",
      title: "One More Time",
      artist: "Daft Punk",
      bidAmount: 5,
      status: "PENDING",
    }
  ]
};
