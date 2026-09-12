import fs from 'fs';
const files = [
  'src/components/profile/SendWusdcModal.jsx',
  'src/components/CommitModal.jsx',
  'src/components/SettlementExecuteButton.jsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    /const chainId = parseInt\(activeWallet\.chainId\.split\(":"\)\[1\]\);/g,
    `const rawChainId = String(activeWallet.chainId || "");
      const chainId = parseInt(rawChainId.includes(":") ? rawChainId.split(":")[1] : rawChainId);`
  );
  fs.writeFileSync(file, content);
}
