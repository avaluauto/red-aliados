// Wires the proceed data function into a TanStack `useMutation` (spec: No
// Auto-Share; Explicit Proceed Fires Opportunity Event). This is the ONLY
// hook in the whole feature that ever calls proceedOnMatch -- there is no
// query, effect, or other hook here that fires it implicitly; it only ever
// runs when a caller explicitly invokes `.mutate(...)`.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ProceedOnMatchInput,
  proceedOnMatch,
  type SearchOpportunityRow,
} from "../data/targeted-search-queries";

export function useProceedOnMatch() {
  const queryClient = useQueryClient();

  return useMutation<SearchOpportunityRow, Error, ProceedOnMatchInput>({
    mutationFn: proceedOnMatch,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["targeted-search", "matches", variables.searchRequestId],
      });
    },
  });
}
