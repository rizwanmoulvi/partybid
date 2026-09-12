import fs from 'fs';

let content = fs.readFileSync('src/app/p/[partyId]/page.js', 'utf8');

content = content.replace(
  `{settlement.status === 'COMPLETED' ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-green-500"></span>
                    <>`,
  `{settlement.status === 'COMPLETED' ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-green-500"></span>`
);
fs.writeFileSync('src/app/p/[partyId]/page.js', content);
