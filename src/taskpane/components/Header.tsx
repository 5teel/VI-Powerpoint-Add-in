import React from "react";
import { Text } from "@fluentui/react-components";

const SUMMIT_NAVY = "#0F1330";

const Header: React.FC = () => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        height: "48px",
        padding: "0 16px",
        backgroundColor: SUMMIT_NAVY,
        flexShrink: 0,
      }}
    >
      <img
        src="/assets/summit-logo.png"
        alt="Summit logo"
        style={{ height: "24px", width: "auto", filter: "brightness(0) invert(1)" }}
      />
      <Text weight="semibold" style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "13px", lineHeight: "20px" }}>
        for PowerPoint
      </Text>
    </div>
  );
};

export default Header;
