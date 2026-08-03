// Wires the "tengo algo similar" data function into a TanStack
// `useMutation`, per design.md's hexagonal-lite split (same composition
// pattern useCreateSearchRequest/useCreateConnectionRequest establish).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type FanOutMatchRow,
  type RespondWithMatchInput,
  respondWithMatch,
} from "../data/targeted-search-queries";

export function useRespondWithMatch() {
  const queryClient = useQueryClient();

  return useMutation<FanOutMatchRow, Error, RespondWithMatchInput>({
    mutationFn: respondWithMatch,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["targeted-search", "matches", variables.searchRequestId],
      });
    },
  });
}
