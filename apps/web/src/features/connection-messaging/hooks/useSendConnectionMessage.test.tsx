import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendConnectionMessage = vi.fn();

vi.mock("../data/connection-messages-queries", () => ({
  sendConnectionMessage: (input: unknown) => sendConnectionMessage(input),
}));

import { useSendConnectionMessage } from "./useSendConnectionMessage";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const SENDER_TENANT = "11111111-1111-4111-8111-111111111111";
const SENDER_USER = "44444444-4444-4444-8444-444444444444";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useSendConnectionMessage", () => {
  beforeEach(() => {
    sendConnectionMessage.mockReset();
  });

  it("calls the data layer with the mutation input and resolves the created row", async () => {
    const createdRow = { id: "m1", connection_request_id: REQUEST_ID, body: "hi" };
    sendConnectionMessage.mockResolvedValue(createdRow);

    const { result } = renderHook(() => useSendConnectionMessage(), { wrapper });

    act(() => {
      result.current.mutate({
        connectionRequestId: REQUEST_ID,
        senderTenantId: SENDER_TENANT,
        senderUserId: SENDER_USER,
        body: "hi",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sendConnectionMessage).toHaveBeenCalledWith({
      connectionRequestId: REQUEST_ID,
      senderTenantId: SENDER_TENANT,
      senderUserId: SENDER_USER,
      body: "hi",
    });
    expect(result.current.data).toEqual(createdRow);
  });

  it("surfaces a rejected mutation as an error state rather than swallowing it", async () => {
    sendConnectionMessage.mockRejectedValue(new Error("permission denied"));

    const { result } = renderHook(() => useSendConnectionMessage(), { wrapper });

    act(() => {
      result.current.mutate({
        connectionRequestId: REQUEST_ID,
        senderTenantId: SENDER_TENANT,
        senderUserId: SENDER_USER,
        body: "hi",
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("permission denied");
  });
});
