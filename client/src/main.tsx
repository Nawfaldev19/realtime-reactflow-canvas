import { StrictMode, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ApolloProvider } from "@apollo/client";
import { App } from "./App";
import { createApolloClient } from "./lib/apollo";
import { SessionProvider, useSession } from "./lib/session";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/editor.css";

function ApolloWithSession({ children }: { children: ReactNode }) {
  const session = useSession();
  // The client is created once; it reads the latest session through this ref.
  const latest = useRef(session);
  latest.current = session;
  const [client] = useState(() =>
    createApolloClient({
      getToken: () => latest.current.token,
      onUnauthenticated: () => {
        latest.current.signOut();
      },
    }),
  );
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <ApolloWithSession>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApolloWithSession>
    </SessionProvider>
  </StrictMode>,
);
