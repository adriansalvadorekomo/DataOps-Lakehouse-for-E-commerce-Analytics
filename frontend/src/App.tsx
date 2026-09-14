import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router } from "react-router-dom";
import { AppShell } from "@/components/AppShell";

const qc = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={qc}>
      <Router>
        <AppShell />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
