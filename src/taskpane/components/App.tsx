import React, { useState } from "react";
import { TabList, Tab, SelectTabEvent, SelectTabData } from "@fluentui/react-components";
import Header from "./Header";
import ChatPanel from "./ChatPanel";
import SlideTestPanel from "./SlideTestPanel";

type TabValue = "tests" | "chat";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabValue>("tests");

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    setActiveTab(data.value as TabValue);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Header />
      <TabList
        selectedValue={activeTab}
        onTabSelect={handleTabSelect}
        style={{ flexShrink: 0, borderBottom: "1px solid #E0E0E0" }}
      >
        <Tab value="tests">Slide Tests</Tab>
        <Tab value="chat">Chat</Tab>
      </TabList>
      {activeTab === "tests" ? <SlideTestPanel /> : <ChatPanel />}
    </div>
  );
};

export default App;
