import fs from 'fs';
const files = [
  'src/components/profile/SendWusdcModal.jsx',
  'src/components/CommitModal.jsx',
  'src/components/SettlementExecuteButton.jsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    /await activeWallet\.switchChain\(`eip155:\$\{ARC_CHAIN_ID\}`\);/g,
    `await activeWallet.switchChain(ARC_CHAIN_ID);`
  );
  fs.writeFileSync(file, content);
}
