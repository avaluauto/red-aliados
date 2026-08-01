// Public surface of connection-messaging. Other features/routes import from
// here, never reaching into ./domain, ./data, ./hooks, ./components directly
// (same convention as identity-bridge/network-authorization/tenant-directory/
// network-connections/partner-reputation).
export { MessageThread, type MessageThreadProps } from "./components/MessageThread";
export type {
  ConnectionMessageInsertHandler,
  ConnectionMessageRow,
  ConnectionRequestParty,
  SendConnectionMessageInput,
} from "./data/connection-messages-queries";
export {
  fetchConnectionMessages,
  fetchConnectionRequestParty,
  sendConnectionMessage,
  subscribeToConnectionMessages,
} from "./data/connection-messages-queries";
export { isMessagingContactRevealed } from "./domain/contact-reveal";
export {
  type ConnectionMessagesThreadResult,
  useConnectionMessagesThread,
} from "./hooks/useConnectionMessagesThread";
export { useSendConnectionMessage } from "./hooks/useSendConnectionMessage";
