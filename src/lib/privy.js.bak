import { PrivyClient } from '@privy-io/node';

let privyClient = null;

export function getPrivyClient() {
  if (privyClient) return privyClient;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (appId && appSecret) {
    privyClient = new PrivyClient({
      appId,
      appSecret
    });
  }

  return privyClient;
}
