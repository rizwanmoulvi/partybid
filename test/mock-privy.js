export function getPrivyClient() {
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
