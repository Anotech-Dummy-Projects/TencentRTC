import React from "react";
import type { User } from "../types/api";

export interface ChatWrapperProps {
  currentUser: User;
  onLogout: () => void;
}

export const ChatWrapper: React.FC<ChatWrapperProps> = () => {
  return null;
};

export default ChatWrapper;
