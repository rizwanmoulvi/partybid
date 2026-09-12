sed -i '' -e 's/await activeWallet.getEthersProvider()/new ethers.BrowserProvider(await activeWallet.getEthereumProvider())/g' src/components/CommitModal.jsx
sed -i '' -e 's/await activeWallet.getEthersProvider()/new ethers.BrowserProvider(await activeWallet.getEthereumProvider())/g' src/components/SettlementExecuteButton.jsx
sed -i '' -e 's/await activeWallet.getEthersProvider()/new ethers.BrowserProvider(await activeWallet.getEthereumProvider())/g' src/components/profile/SendWusdcModal.jsx
