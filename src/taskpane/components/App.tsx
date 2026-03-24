import React, { useState } from "react";
import { TabList, Tab, SelectTabEvent, SelectTabData } from "@fluentui/react-components";
import ChatPanel from "./ChatPanel";
import SlideTestPanel from "./SlideTestPanel";

type TabValue = "slides" | "chat";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabValue>("chat");

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    setActiveTab(data.value as TabValue);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TabList
        selectedValue={activeTab}
        onTabSelect={handleTabSelect}
        style={{
          flexShrink: 0,
          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          padding: "0 8px",
        }}
      >
        <Tab value="chat">Ask Summit</Tab>
        <Tab value="slides">Slide Options</Tab>
      </TabList>
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        margin: "8px",
        borderRadius: "12px",
        backgroundColor: "rgba(255, 255, 255, 0.85)",
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.06)",
      }}>
        {activeTab === "chat" ? <ChatPanel /> : <SlideTestPanel />}
      </div>
    </div>
  );
};

export default App;
