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
        alt="Summit VI logo"
        style={{ height: "24px", width: "auto", filter: "brightness(0) invert(1)" }}
      />
      <Text weight="semibold" style={{ color: "#FFFFFF", fontSize: "14px", lineHeight: "20px" }}>
         - VI for Powerpoint
      </Text>
    </div>
  );
};

export default Header;
