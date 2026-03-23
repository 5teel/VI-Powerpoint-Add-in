import React from "react";
import Header from "./Header";
import ChatPanel from "./ChatPanel";

const App: React.FC = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Header />
      <ChatPanel />
    </div>
  );
};

export default App;
