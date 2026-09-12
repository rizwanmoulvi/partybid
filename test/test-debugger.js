import { spawn } from 'child_process';
const nextProcess = spawn('npm', ['run', 'start', '--', '-p', '3002'], {
  env: {
    ...process.env,
    MONGODB_URI: 'mongodb://127.0.0.1:27018/partybid_test',
    AQUA_TEST_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    NEXT_PUBLIC_PARTYBID_AQUA_APP: '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071',
    NEXT_PUBLIC_WUSDC: '0x911b4000D3422F482F4062a913885f7b035382Df',
    NEXT_PUBLIC_PLATFORM_RECIPIENT: '0x7D5C5cCf29296cec4325c7510e2C0C0f9614d694'
  }
});
nextProcess.stdout.pipe(process.stdout);
nextProcess.stderr.pipe(process.stderr);

setTimeout(async () => {
  const res = await fetch(`http://localhost:3002/api/settlement/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid_token' },
    body: JSON.stringify({ settlementId: 'SETTLE_123' })
  });
  console.log(await res.text());
  nextProcess.kill();
  process.exit(0);
}, 3000);
