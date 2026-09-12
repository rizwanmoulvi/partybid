import fs from 'fs';

let content = fs.readFileSync('src/app/p/[partyId]/page.js', 'utf8');

const targetStr = `<span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></span>
                  {settlement.status === 'COMPLETED' ? (`;

const replacementStr = `{settlement.status === 'COMPLETED' ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-green-500"></span>`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  content = content.replace(
    `) : (
                    <>
                      {settlement.outcome === 'PLAYER_PAYOUT'`,
    `) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></span>
                      {settlement.outcome === 'PLAYER_PAYOUT'`
  );
  fs.writeFileSync('src/app/p/[partyId]/page.js', content);
  console.log("Replaced");
} else {
  console.log("Could not find target string");
}
