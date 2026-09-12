import fs from 'fs';

let content = fs.readFileSync('src/app/p/[partyId]/page.js', 'utf8');

const targetStr = `{settlement.outcome === 'PLAYER_PAYOUT' && <span className="text-green-500">Player payout pending</span>}
                  {settlement.outcome === 'PLATFORM_PAYOUT' && <span className="text-accent">Platform payout pending</span>}
                  {settlement.outcome === 'BIDDER_RELEASE' && <span className="text-muted-foreground">Bid release pending</span>}`;

const replacementStr = `{settlement.status === 'COMPLETED' ? (
                    <>
                      {settlement.outcome === 'PLAYER_PAYOUT' && <span className="text-green-500">Player payout completed</span>}
                      {settlement.outcome === 'PLATFORM_PAYOUT' && <span className="text-accent">Platform payout completed</span>}
                      {settlement.outcome === 'BIDDER_RELEASE' && <span className="text-muted-foreground">Bid release completed</span>}
                      <a href={\`https://explorer.testnet.arc.network/tx/\${settlement.transactionHash}\`} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground ml-2">View Tx</a>
                    </>
                  ) : (
                    <>
                      {settlement.outcome === 'PLAYER_PAYOUT' && <span className="text-yellow-500">Player payout pending</span>}
                      {settlement.outcome === 'PLATFORM_PAYOUT' && <span className="text-yellow-500">Platform payout pending</span>}
                      {settlement.outcome === 'BIDDER_RELEASE' && <span className="text-muted-foreground">Bid release pending</span>}
                    </>
                  )}`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync('src/app/p/[partyId]/page.js', content);
  console.log("Replaced");
} else {
  console.log("Could not find target string");
}
