"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export function Providers({ children }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // Making the missing configuration explicit without fabricating an ID.
    // We cannot render {children} here because they depend on usePrivy(), 
    // which throws an error if not inside a valid PrivyProvider.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-xl border border-destructive/50 bg-destructive/10 p-8">
          <h1 className="mb-4 text-xl font-bold text-destructive">Configuration Missing</h1>
          <p className="text-muted-foreground">
            The application requires the <strong>NEXT_PUBLIC_PRIVY_APP_ID</strong> environment variable to start.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["wallet", "google", "spotify"],
        appearance: {
          theme: "dark",
          accentColor: "#00d395",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
