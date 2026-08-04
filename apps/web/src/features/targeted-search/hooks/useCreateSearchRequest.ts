// Wires the create-search-request data function into a TanStack
// `useMutation`, per design.md's hexagonal-lite split (hooks/ composes
// data/, components never call data/ directly -- same convention every
// other feature's hooks/ establishes).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateSearchRequestInput,
  createSearchRequest,
  type SearchRequestRow,
} from "../data/targeted-search-queries";

export function useCreateSearchRequest() {
  const queryClient = useQueryClient();

  return useMutation<SearchRequestRow, Error, CreateSearchRequestInput>({
    mutationFn: createSearchRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["targeted-search"] });
    },
  });
}
