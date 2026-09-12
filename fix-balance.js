import fs from 'fs';

let content = fs.readFileSync('src/lib/balance.js', 'utf8');

content = content.replace(
  "const walletAddress = user?.walletAddress;",
  `let walletAddress = user?.walletAddress;
  
  if (!walletAddress) {
    const membership = await db.collection('party_members').findOne({ userId, partyId });
    if (membership?.walletAddress) {
      walletAddress = membership.walletAddress;
    }
  }`
);

fs.writeFileSync('src/lib/balance.js', content);
