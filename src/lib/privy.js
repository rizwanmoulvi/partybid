import { PrivyClient } from '@privy-io/node';

let privyClient = null;

export function getPrivyClient() {
  if (privyClient) return privyClient;

  // Use mock for tests
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_PRIVY === 'true') {
    return {
      utils: () => ({
        auth: () => ({
          verifyAccessToken: async (token) => {
            if (token === "valid_token") return { user_id: "did:privy:test_user" };
            throw new Error("Invalid token");
          }
        })
      })
    };
  }

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
